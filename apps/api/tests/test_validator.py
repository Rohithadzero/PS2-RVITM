import json
from pathlib import Path

from app.config import ROOT
from app.schemas import OfferFacts
from app.validator import validate_content


def facts(**overrides) -> OfferFacts:
    payload = {
        "item": "filter coffee",
        "discount_percent": 20,
        "price_amount": 80,
        "currency": "INR",
        "dates": ["2026-10-12"],
        "timings": "Sunday only",
        "terms": "dine-in",
        "audiences": ["regulars"],
        "languages": ["en"],
        "channels": ["whatsapp"],
    }
    payload.update(overrides)
    return OfferFacts.model_validate(payload)


def test_accepts_copy_that_matches_the_lock():
    result = validate_content(
        "Filter coffee is 20% off this Sunday. ₹80 on 12 October 2026.",
        facts(),
    )
    assert result.ok is True
    assert result.issues == []


def test_blocks_a_wrong_discount_price_and_weekday():
    result = validate_content("Filter coffee at 30% off this Saturday for ₹90.", facts())
    assert result.ok is False
    assert "percent_mismatch" in result.codes
    assert "price_mismatch" in result.codes
    assert "weekday_mismatch" in result.codes


def test_blocks_a_date_that_was_not_locked():
    result = validate_content("Offer runs on 2026-10-13.", facts())
    assert "date_mismatch" in result.codes


def test_blocks_an_invented_discount_when_none_is_locked():
    result = validate_content("Filter coffee at 20% off.", facts(discount_percent=None))
    assert "percent_unexpected" in result.codes


def test_blocks_free_when_a_price_is_locked():
    result = validate_content("Filter coffee is free on Sunday.", facts())
    assert "free_mismatch" in result.codes


def test_blocks_widening_sunday_to_every_day():
    result = validate_content("Filter coffee every day.", facts())
    assert "weekday_widen" in result.codes


def test_contract_fields_match_the_shared_schema():
    path = ROOT / "packages" / "contract" / "offer-facts.schema.json"
    schema = json.loads(path.read_text(encoding="utf-8"))
    assert set(schema["properties"]) == set(OfferFacts.model_fields)
    assert Path(path).is_file()


def test_blocks_kannada_and_hindi_weekdays_outside_the_lock():
    assert "weekday_mismatch" in validate_content("ಸೋಮವಾರ ಫಿಲ್ಟರ್ ಕಾಫಿ 20% ರಿಯಾಯಿತಿ", facts()).codes
    assert "weekday_mismatch" in validate_content("सोमवार को फ़िल्टर कॉफ़ी 20% छूट", facts()).codes
    assert validate_content("ಭಾನುವಾರದಂದು ಮಾತ್ರ ಫಿಲ್ಟರ್ ಕಾಫಿ ₹80", facts()).ok
    assert validate_content("रविवार को फ़िल्टर कॉफ़ी ₹80", facts()).ok


def test_reads_indic_digits_percent_and_rupee_words():
    assert "percent_mismatch" in validate_content("ಶೇ 30 ರಿಯಾಯಿತಿ ಭಾನುವಾರ", facts()).codes
    assert "percent_mismatch" in validate_content("३० प्रतिशत छूट रविवार", facts()).codes
    assert "price_mismatch" in validate_content("रविवार सिर्फ़ 90 रुपये", facts()).codes
    assert validate_content("ಭಾನುವಾರ ಕೇವಲ ೮೦ ರೂಪಾಯಿ, ೨೦% ರಿಯಾಯಿತಿ", facts()).ok


def test_widening_in_indic_languages_and_weekend_timings():
    assert "weekday_widen" in validate_content("हर दिन फ़िल्टर कॉफ़ी", facts()).codes
    assert "weekday_widen" in validate_content("ಪ್ರತಿದಿನ ಫಿಲ್ಟರ್ ಕಾಫಿ", facts()).codes
    weekend = facts(timings="Weekend")
    assert validate_content("Sat & Sun only, filter coffee ₹80.", weekend).ok
    assert "weekday_mismatch" in validate_content("Friday to Sunday, filter coffee ₹80.", weekend).codes


def test_capitalised_abbreviations_count_but_ordinary_words_do_not():
    assert "weekday_mismatch" in validate_content("Sat only: filter coffee.", facts()).codes
    assert validate_content("Sunday filter coffee in the morning sun.", facts()).ok


def test_facts_in_content_reflects_what_the_copy_states():
    from app.validator import facts_in_content

    assert facts_in_content("Filter coffee this Sunday.", facts()) == ["item", "timings"]
    assert facts_in_content("20% off, ₹80.", facts(), ["terms", "bogus"]) == [
        "item",
        "discount_percent",
        "price_amount",
        "terms",
    ]


def _ledger_facts(ledger: dict) -> OfferFacts:
    names = {"Mon": "Monday", "Tue": "Tuesday", "Wed": "Wednesday", "Thu": "Thursday",
             "Fri": "Friday", "Sat": "Saturday", "Sun": "Sunday"}
    days = " ".join(names[day] for day in ledger.get("valid_days", []))
    return OfferFacts(
        item=ledger.get("applies_to") or " + ".join(ledger.get("items", [])) or ledger["offer"],
        price_amount=ledger.get("price_inr"),
        discount_percent=ledger.get("discount_pct"),
        timings=f"{days} {ledger.get('valid_time', '')}".strip() or None,
        terms="; ".join(ledger.get("conditions", [])) or None,
        audiences=["all"],
    )


def test_counter_voice_audit_cases():
    """Synthetic eval set from counter_voice_final_dataset.zip: every BAD blocked, every GOOD passes."""
    fixtures = Path(__file__).parent / "fixtures"
    ledgers = {row["id"]: row for row in json.loads((fixtures / "ledgers.json").read_text(encoding="utf-8"))}
    cases = json.loads((fixtures / "audit_cases.json").read_text(encoding="utf-8"))
    wrong = []
    for case in cases:
        result = validate_content(case["text"], _ledger_facts(ledgers[case["ledger"]]))
        if result.ok != case["label"].startswith("GOOD"):
            wrong.append((case["label"], result.codes, case["text"]))
    assert wrong == []


def test_blocks_copy_that_omits_the_locked_days():
    sunday = facts(timings="Sunday only")
    assert "weekday_missing" in validate_content("Filter coffee 20% off, ₹80.", sunday).codes
    assert validate_content("Filter coffee 20% off this Sunday, ₹80.", sunday).ok
    weekend = facts(timings="Saturday and Sunday")
    assert validate_content("Filter coffee 20% off this weekend, ₹80.", weekend).ok
    assert "weekday_widen" in validate_content("Filter coffee 20% off on weekdays and Saturday, Sunday.", weekend).codes


def test_live_agnes_kannada_outputs_are_blocked():
    """Real agnes-3.0-flash outputs from 2026-10-09: invented weekday words and a rewrite with no day at all."""
    weekend = facts(timings="Saturday and Sunday", discount_percent=20, price_amount=80)
    invented = "ನಮ್ಮ ದಿನಬಳಕೆಯ ಕುಶಲುಗಳಿಗೆ! ಪ್ರತಿ ಶನಿವಾರ ಮತ್ತು ಏಳವಾರದಿಂದ ನಿಮ್ಮ ಪಾಲಿಗೆ ವಿಶೇಷ ಆಫರ್."
    assert "weekday_missing" in validate_content(invented, weekend).codes
    sunday = facts(timings="Sunday only", discount_percent=20, price_amount=80)
    no_day = "ಈ ಏಳೈದು ಪ್ರಯೋಜನದ ಫೈಲ್ಟರ್ ಕಾಫಿ, ದಿನಕ್ಕೆ ಒಂದೇ ಬಾರಿ ಒಂದು ಕಪ್ ಮಿತಿಗೆ ಒಂದು ಕಪ್ 80 ರೂಪಾಯಿಗೆ ಲಭ್ಯವಾಗಿದೆ."
    assert "weekday_missing" in validate_content(no_day, sunday).codes
