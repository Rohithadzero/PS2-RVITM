"""Domain tests: slots, validator (fault injection), number words, facts arithmetic, blast radius, planner."""
import pytest

from app.lab.domain import facts as F
from app.lab.domain.numberwords import extract_offer_numbers, find_numbers, reconcile
from app.lab.domain.planner import Calibration, reel_clip_options, solve
from app.lab.domain.slots import render
from app.lab.domain.validator import sms_segments, validate

LOCK = F.OfferFacts(item="Filter coffee", item_i18n={"kn": "ಫಿಲ್ಟರ್ ಕಾಫಿ", "hi": "फ़िल्टर कॉफ़ी"}, discount_pct=20,
                    price_inr=48, original_price_inr=60, days=["sat", "sun"], start_date="2026-10-10",
                    end_date="2026-10-11", time_from="08:00", time_to="11:00", terms=["dine_in_only"])


def check(template, lang="en", channel="instagram", facts=LOCK, **kw):
    r = render(template, facts, lang)
    return r, validate(r, facts, lang, channel, banned=["cheap", "best"], brand_names=["Priya's Cafe"], **kw)


GOOD_EN = "Mornings taste better with {item}. {discount} off, just {price} (was {original_price}), {days}, {time}. {terms}"
GOOD_HI = "{days}, {time} - {item} पर {discount} की छूट! सिर्फ़ {price}। {terms}"
GOOD_KN = "ಈ {days} {time}, {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ - ಬೆಲೆ {price}. {terms}"


# ---- rendering ------------------------------------------------------------------------------------------------------
def test_render_fills_slots_with_western_digits_in_every_script():
    for lang, tmpl in (("en", GOOD_EN), ("hi", GOOD_HI), ("kn", GOOD_KN)):
        r = render(tmpl, LOCK, lang)
        assert not r.errors and "{" not in r.text
        assert "20%" in r.text and "₹48" in r.text
        assert not any(c in r.text for c in "०१२३४५६७८९೦೧೨೩೪೫೬೭೮೯")


def test_render_flags_unknown_and_missing_slots():
    assert render("{bogus}", LOCK, "en").errors
    no_price = F.OfferFacts(item="Tea", days=["sun"])
    assert render("Only {price}", no_price, "en").errors


def test_day_names_are_native():
    assert "शनिवार" in render("{days}", LOCK, "hi").text
    assert "ಶನಿವಾರ" in render("{days}", LOCK, "kn").text


# ---- validator: clean assets pass ---------------------------------------------------------------------------------
@pytest.mark.parametrize("lang,tmpl", [("en", GOOD_EN), ("hi", GOOD_HI), ("kn", GOOD_KN)])
def test_clean_assets_pass(lang, tmpl):
    _, rep = check(tmpl, lang)
    assert rep.passed, rep.issues


# ---- validator: fault injection (docs/test-plan.md: 20+ corrupted assets must all be caught) -----------------------
FAULTS = [
    ("wrong price digit", "en", "Coffee {discount} off, just 50 {days}, {time}. {terms}", "V1"),
    ("wrong price decimal", "en", "{item} {discount} off at 4.8 {days}, {time}. {terms}", "V1"),
    ("price in Kannada digits", "kn", "{item} ಬೆಲೆ ೪೮ {days} {time}. {terms}", "V1"),
    ("price in Devanagari digits", "hi", "{item} कीमत ४८ {days} {time}। {terms}", "V1"),
    ("wrong discount digit", "en", "{item} 25% {days}, {time}. {terms}", "V1"),
    ("spelled discount", "en", "{item} twenty five off {days}, {time}. {terms}", "V2"),
    ("spelled in Hindi", "hi", "{item} पच्चीस की छूट {days} {time}। {terms}", "V2"),
    ("spelled in Kannada", "kn", "{item} ಇಪ್ಪತ್ತು ರಿಯಾಯಿತಿ {days} {time}. {terms}", "V2"),
    ("percent word outside slot", "en", "{item} 20 percent off {days}, {time}. {terms}", "V1"),
    ("percent word only", "en", "{item} a percent off {days}, {time}. {terms}", "V3"),
    ("hard-coded day", "en", "{item} {discount} off this Sunday, {time}. {terms}", "V4"),
    ("hard-coded day Hindi", "hi", "{item} {discount} छूट रविवार {time}। {terms}", "V4"),
    ("hard-coded day Kannada", "kn", "{item} {discount} ರಿಯಾಯಿತಿ ಭಾನುವಾರ {time}. {terms}", "V4"),
    ("weekend claim", "en", "{item} {discount} off all weekend, {time}. {terms}", "V4"),
    ("today claim", "en", "{item} {discount} off today, {time}. {terms}", "V4"),
    ("month name outside slot", "en", "{item} {discount} off in October, {time}. {terms}", "V4"),
    ("all day claim", "en", "{item} {discount} off {days}, open all day. {terms}", "V5"),
    ("noon claim", "en", "{item} {discount} off {days} till noon. {terms}", "V5"),
    ("dropped condition", "en", "{item} {discount} off, {price}, {days}, {time}.", "V6"),
    ("dropped condition Kannada", "kn", "{item} {discount} ರಿಯಾಯಿತಿ {price} {days} {time}.", "V6"),
    ("implied promise all drinks", "en", "All drinks {discount} off {days}, {time}. {terms}", "V7"),
    ("implied promise free", "en", "{item} {discount} off {days}, {time}, free refill. {terms}", "V7"),
    ("implied promise bogo", "en", "{item} buy one get one {days}, {time}. {terms}", "V7"),
    ("banned phrase", "en", "The cheap {item} deal {discount} {days}, {time}. {terms}", "V8"),
    ("unfilled placeholder", "en", "{item} {discount} off {days}, {time}. {terms} {unknown}", "V0"),
    ("latin inside kannada", "kn", "{item} ಮೇಲೆ {discount} ಈ ಆffer {days} {time}. {terms}", "V12"),
    ("latin hashtag in hindi", "hi", "{item} {discount} छूट {days} {time}। {terms} #Bengaluru", "V12"),
    ("too long poster", "en", "{item} {discount} off {days}, {time}. {terms} " + "word " * 60, "V9"),
]


@pytest.mark.parametrize("name,lang,tmpl,rule", FAULTS)
def test_fault_is_caught(name, lang, tmpl, rule):
    channel = "poster" if name == "too long poster" else "instagram"
    _, rep = check(tmpl, lang, channel)
    assert not rep.passed, f"{name} was NOT caught"
    assert any(i["rule"] == rule for i in rep.issues), f"{name}: expected {rule}, got {[i['rule'] for i in rep.issues]}"


def test_stale_facts_version_is_blocked():
    _, rep = check(GOOD_EN, asset_facts_version=1, approved_facts_version=2)
    assert any(i["rule"] == "V10" for i in rep.issues)


def test_block_reason_names_the_token():
    _, rep = check("{item} {discount} off, just 50, {days}, {time}. {terms}")
    br = rep.block_reason()
    assert br["token"] == "50" and br["rule"] == "V1"


def test_sms_segments_gsm_vs_unicode():
    assert sms_segments("a" * 160)["segments"] == 1
    assert sms_segments("a" * 161)["segments"] == 2
    assert sms_segments("ಕ" * 70)["segments"] == 1 and sms_segments("ಕ" * 71)["segments"] == 2


def test_false_positive_rate_on_clean_variants():
    clean = [(l, t) for l, t in (("en", GOOD_EN), ("hi", GOOD_HI), ("kn", GOOD_KN))]
    clean += [("en", "Hi! {item} is {discount} off on {days}, {time}. Only {price}. {terms}. See you at the counter."),
              ("en", "{item} {discount} off / {days} / {time} / Now {price} / {terms}")]
    for lang, t in clean:
        ch = "poster" if "/" in t and lang == "en" else "instagram"
        assert check(t, lang, ch)[1].passed, t


# ---- number words -----------------------------------------------------------------------------------------------------
def test_english_number_words_compose():
    assert [n.value for n in find_numbers("one hundred and twenty rupees")] == [120]
    assert find_numbers("twenty five percent")[0].value == 25


def test_hinglish_and_kanglish_discounts():
    assert extract_offer_numbers("is weekend filter coffee pe bees percent off, sirf achhtalis rupaye")["discount_pct"] == 20
    assert extract_offer_numbers("is weekend filter coffee pe bees percent off, sirf achhtalis rupaye")["price_inr"] == 48
    assert extract_offer_numbers("Saturday mattu Sunday ippattu percent off, bele nalvattentu rupayi")["discount_pct"] == 20
    assert extract_offer_numbers("pachchees percent chhoot")["discount_pct"] == 25


def test_self_correction_last_number_wins():
    r = extract_offer_numbers("ippattu percent... alla alla hanneradu percent off")
    assert r["discount_pct"] == 12 and "discount_pct" in r["corrected"]
    assert extract_offer_numbers("bees percent... nahi nahi pandrah percent off")["discount_pct"] == 15


def test_unknown_word_gives_no_number_not_a_guess():
    assert extract_offer_numbers("yeppathu percent off")["discount_pct"] is None


def test_reconcile_requires_agreement():
    parsed = {"discount_pct": 20, "price_inr": None}
    assert reconcile({"discount_pct": 20}, parsed)["confirmed"] == {"discount_pct": 20}
    bad = reconcile({"discount_pct": 3}, parsed)
    assert bad["confirmed"] == {} and bad["unconfirmed"][0]["parser"] == 20


# ---- facts --------------------------------------------------------------------------------------------------------------
def test_arithmetic_check():
    assert F.check_arithmetic(LOCK) == []
    wrong = LOCK.model_copy(update={"price_inr": 50})
    assert F.check_arithmetic(wrong)
    assert F.expected_price(60, 20) == 48


def test_expected_price_rounding_is_half_up():
    assert F.expected_price(45, 10) == 41  # 40.5 -> 41


def test_facts_reject_bad_input():
    with pytest.raises(F.FactsError):
        F.validate_facts({"item": "x", "days": ["funday"]})
    with pytest.raises(F.FactsError):
        F.validate_facts({"item": "x", "terms": ["free_everything"]})
    with pytest.raises(F.FactsError):
        F.validate_facts({"item": "x", "discount_pct": 120})


def test_blast_radius_touches_only_dependents():
    old = LOCK.model_dump()
    new = {**old, "days": ["sun"]}
    slots = F.changed_slots(old, new)
    assert slots == {"days"}
    assets = [{"id": "a1", "facts_used": ["item", "days", "time"]}, {"id": "a2", "facts_used": ["item", "price"]},
              {"id": "a3", "facts_used": ["days"]}]
    r = F.blast_radius(assets, slots)
    assert r["changed"] == ["a1", "a3"] and r["frozen"] == ["a2"]


def test_changing_item_changes_everything():
    old = LOCK.model_dump()
    assert F.changed_slots(old, {**old, "item": "Masala dosa"}) == set(F.SLOTS)


# ---- planner ------------------------------------------------------------------------------------------------------------
WANTED = [{"lang": l, "channel": c, "audience_id": a} for l in ("en", "hi", "kn") for a in ("locals", "office")
          for c in ("instagram", "whatsapp", "poster")]
LIM = {"time_s": 180, "money_inr": 50, "review_s": 480}


def test_planner_fits_18_assets_without_reels():
    r = solve({"wanted": WANTED, "limits": LIM})
    assert r["feasible"] and len(r["chosen"]["assets"]) == 18
    assert r["cost"]["time_s"] <= 180 and r["cost"]["review_s"] <= 480 and r["cost"]["money_inr"] <= 50


def test_planner_never_exceeds_limits_property():
    for review in (60, 120, 240, 300, 480):
        for t in (60, 90, 180):
            r = solve({"wanted": WANTED, "limits": {"time_s": t, "money_inr": 50, "review_s": review}})
            if r["feasible"]:
                assert r["cost"]["review_s"] <= review + 1e-6 and r["cost"]["time_s"] <= t + 1e-6


def test_planner_drops_reel_that_cannot_fit_and_explains():
    r = solve({"wanted": WANTED, "reel_seconds": 16, "reels": 1, "limits": LIM})
    assert r["chosen"]["reel_clips"] == []
    assert any("video queue" in d["reason"] for d in r["dropped"])


def test_planner_takes_reel_when_limits_allow():
    r = solve({"wanted": WANTED, "reel_seconds": 16, "reels": 1, "limits": {"time_s": 400, "money_inr": 50, "review_s": 900}})
    assert sum(r["chosen"]["reel_clips"]) == 16 and all(4 <= c <= 12 for c in r["chosen"]["reel_clips"])
    assert len(r["chosen"]["reel_clips"]) == 2  # fewest clips first: video costs 60 s per call at 1 RPM


def test_planner_review_limit_is_binding_and_drops_assets():
    r = solve({"wanted": WANTED, "limits": {**LIM, "review_s": 240}})
    assert len(r["chosen"]["assets"]) < 18 and "review_s" in r["binding"]
    langs_pairs = {(a.split("-")[0], a.split("-")[1]) for a in r["chosen"]["assets"]}
    assert len(langs_pairs) >= 3  # coverage bonus keeps several (audience, language) pairs represented


def test_planner_is_deterministic_and_uses_calibration():
    a = solve({"wanted": WANTED, "limits": LIM})
    b = solve({"wanted": WANTED, "limits": LIM})
    assert a["chosen"] == b["chosen"]
    slow = Calibration(latency={"text": 60.0, "image": 30.0, "video": 150.0})
    assert solve({"wanted": WANTED, "limits": LIM}, slow)["cost"]["time_s"] > a["cost"]["time_s"]


def test_reel_clip_options():
    opts = reel_clip_options(16)
    assert opts[0] in {(8, 8), (12, 4)} and all(sum(o) == 16 for o in opts)
    assert reel_clip_options(3) == []
    assert reel_clip_options(12)[0] == (12,)  # fewest clips first
