"""Meaning check: fix-required filtering, two independent passes, allowed names, full-date weekday rule."""
import json

import pytest

from app import review
from app.prompts import review_messages
from app.schemas import OfferFacts
from app.validator import validate_content

FACTS = OfferFacts(item="combo", discount_percent=20, timings="Saturday and Sunday", audiences=["regulars"],
                   dates=["2026-10-10", "2026-10-11"])
BACK = "Come here for a combo, 20% off on Saturday and Sunday."
CONTENT = "ಬನ್ನಿ ಇಲ್ಲಿಗೆ ಬ್ರೂ ಬಾಂಡಿ ಕಾಂಬೋ ಮತ್ತು ಒಂದೇ ಕಾಂಬೋ ಆರ್ಡರ್ ಮಾಡಿ, 20% ಶನಿವಾರ ಮತ್ತು ಭಾನುವಾರ. ಬಿರ್ಯಾನಿ wala"


def parsed(problems):
    return {"back_translation": BACK, "language_problems": problems}


# What the live reviewer reported on the token plan run: real words, identical corrections, style remarks.
FALSE_ALARMS = [
    {"quote": "ಬನ್ನಿ", "type": "garbled", "note": "common word", "fix": ""},
    {"quote": "ಮತ್ತು", "type": "not_a_word", "note": "Typo for 'and' (ಮತ್ತು)", "fix": "ಮತ್ತು"},
    {"quote": "ಇಲ್ಲಿಗೆ", "type": "not_a_word", "note": "to here", "fix": " ಇಲ್ಲಿಗೆ "},
    {"quote": "ಬ್ರೂ", "type": "not_a_word", "note": "nonsense", "fix": "ಬ್ರೂ."},
    {"quote": "ಒಂದೇ ಕಾಂಬೋ ಆರ್ಡರ್ ಮಾಡಿ", "type": "not_a_word", "note": "awkward phrasing", "fix": "ಒಂದು ಕಾಂಬೋ ಆರ್ಡರ್ ಮಾಡಿ"},
    {"quote": "ಬಿರ್ಯಾನಿ wala", "type": "not_a_word", "note": "unknown", "fix": "ಬಿರ್ಯಾನಿ ವಾಲಾ"},
]


@pytest.mark.parametrize("alarm", FALSE_ALARMS, ids=[a["quote"] for a in FALSE_ALARMS])
def test_known_false_alarms_never_block_even_when_both_passes_repeat_them(alarm):
    outcome = review.assess(parsed([alarm]), FACTS, CONTENT, parsed([alarm]))
    assert outcome["status"] == review.OK and outcome["language_problems"] == []
    assert outcome["dropped_unverified"] == 1


def test_hindi_wala_with_no_fix_is_dropped():
    content = "कॉम्बो वाला ऑफ़र"
    alarm = {"quote": "वाला", "type": "not_a_word", "note": "Hinglish particle"}
    assert review.assess(parsed([alarm]), FACTS, content, parsed([alarm]))["status"] == review.OK


REAL = {"quote": "ಬಿರ್ಯಾನಿ", "type": "not_a_word", "note": "invented", "fix": "ಬಿರಿಯಾನಿ"}


def test_a_real_defect_flagged_by_both_passes_blocks():
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, parsed([{**REAL, "fix": "ಬಿರಿಯಾನಿ ಅಂಗಡಿ"}]))
    assert outcome["status"] == review.FLAGGED
    assert any("ಬಿರ್ಯಾನಿ" in issue for issue in outcome["issues"])
    assert outcome["dropped_unconfirmed"] == 0
    assert len(outcome["passes"]) == 2 and outcome["passes"][1]["problems"][0]["quote"] == "ಬಿರ್ಯಾನಿ"


def test_overlapping_quotes_confirm_each_other():
    wider = {**REAL, "quote": "ಬಿರ್ಯಾನಿ wala", "type": "garbled"}
    assert review.assess(parsed([REAL]), FACTS, CONTENT, parsed([wider]))["status"] == review.FLAGGED


def test_a_defect_flagged_by_only_one_pass_does_not_block():
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, parsed([]))
    assert outcome["status"] == review.OK and outcome["dropped_unconfirmed"] == 1
    other = {**REAL, "quote": "ಕಾಂಬೋ", "fix": "ಕಾಂಬೊ"}
    # Two different complaints from two passes are two unconfirmed complaints, and neither blocks.
    two = review.assess(parsed([REAL]), FACTS, CONTENT, parsed([other]))
    assert two["status"] == review.OK and two["dropped_unconfirmed"] == 2


def test_without_a_second_pass_no_language_problem_can_block():
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, None)
    assert outcome["status"] == review.OK and outcome["passes"][1] is None


def test_back_translation_rules_need_two_passes_to_agree():
    bad = {"back_translation": "Combo 20% off on Monday.", "language_problems": []}
    assert review.assess(bad, FACTS, CONTENT, bad, parsed([]))["status"] == review.FLAGGED
    # One translation that drifts while two others are fine is chance, not a defect.
    assert review.assess(bad, FACTS, CONTENT, parsed([]), parsed([]))["status"] == review.OK
    # With a single usable pass there is no one to vote against, so its translation decides.
    assert review.assess(bad, FACTS, CONTENT, None, None)["status"] == review.FLAGGED


def test_reviewer_prompt_has_allowed_names_and_stays_blind_to_the_offer():
    for variant in (0, 1):
        prompt = json.dumps(review_messages("ಬ್ರೂ ಬಾಂಡಿ", "kn", ["Brew Bandi", "Indiranagar", "combo"], variant), ensure_ascii=False)
        assert "Brew Bandi" in prompt and "Indiranagar" in prompt and "fix" in prompt
        assert "offer_facts" not in prompt and "Saturday" not in prompt and "20" not in prompt
    first = review_messages("x", "kn", None, 0)[0]["content"]
    second = review_messages("x", "kn", None, 1)[0]["content"]
    assert first != second


# ---- weekday_missing only waives for full dates

def test_full_dates_in_the_window_waive_weekday_missing():
    assert validate_content("Combo 20% off on 10 October and 11 October.", FACTS).ok
    assert validate_content("Combo 20% off, 2026-10-10 and 2026-10-11.", FACTS).ok
    assert validate_content("Combo 20% off, October 10 and October 11.", FACTS).ok


def test_day_numbers_alone_do_not_waive_weekday_missing():
    result = validate_content("ಕಾಂಬೋ 20% ರಿಯಾಯಿತಿ, 10 ಮತ್ತು 11ರಂದು.", FACTS)
    assert "weekday_missing" in result.codes
    assert "weekday_missing" in validate_content("Combo 20% off on 10 and 11 October.", FACTS).codes
    assert "weekday_missing" in validate_content("Combo 20% off on 10 October.", FACTS).codes


# ---- degeneration check (validator) and the whole-sentence sense check

from app.validator import repeated_text  # noqa: E402

SUNDAY = OfferFacts(item="filter coffee", discount_percent=20, price_amount=80, timings="Sunday only", audiences=["regulars"])
LOOP = "ಈ ಏಳೈದು ಕೆಳಗಿನ ಒಂದು ದಾಖಲೆಯನ್ನು ಒಂದು ಇ-ಮೇಲ್ ಮೂಲಕ ಒಂದು ಪಿಡಿಎಫ್ ಆಗಿ ನಮಗೂ ಕಳುಹಿಸಿ."


def test_a_sentence_said_twice_is_degenerate_copy():
    copy = f"ಭಾನುವಾರ ಫಿಲ್ಟರ್ ಕಾಫಿ 20% ರಿಯಾಯಿತಿ. {LOOP} {LOOP.lower()}"
    assert repeated_text(copy)
    assert "repeated_text" in validate_content(copy, SUNDAY).codes


def test_a_short_clause_repeated_three_times_is_degenerate():
    assert repeated_text("रविवार केलिए, रविवार केलिए, रविवार केलिए!")


def test_a_five_word_run_three_times_is_degenerate():
    run = "visit us for fresh hot coffee"
    assert repeated_text(f"{run} today and {run} tomorrow and {run} always")


def test_legitimate_repetition_is_not_flagged():
    for copy in (
        "Sunday special: filter coffee 20% off on Sunday. Come on Sunday, bring a friend.",
        "Filter coffee, filter coffee beans and filter coffee powder.",
        "#coffee #coffee\nSunday coffee",
        "ಭಾನುವಾರ ಮಾತ್ರ. ಭಾನುವಾರ ಬನ್ನಿ.",
        "Come early. Come hungry.",
    ):
        assert repeated_text(copy) is None, copy
    assert validate_content("Filter coffee 20% off, ₹80, Sunday only. Sunday is the day.", SUNDAY).ok


def sense(sentences, back=BACK):
    return {"back_translation": back, "language_problems": [], "nonsense_sentences": sentences}


S1, S2 = "ಖಾತೆ ಒಳಗೆ ಕುಳಿತು ಕಾಯಿಂಗೊಳ್ಳಿ.", "ನಮ್ಮ ಸ್ವಂತರು ಬಂದು ಗಿಡುಗಿಡ ಮಾಡಿರಿ!"
SENSE_CONTENT = f"ನಮ್ಮ ಫಿಲ್ಟರ್ ಕಾಫಿಗೆ 20% ರಿಯಾಯಿತಿ. {S1} {S2}"


def test_a_sentence_named_by_both_passes_blocks():
    outcome = review.assess(sense([S1]), FACTS, SENSE_CONTENT, sense([S1.rstrip("."), S2]))
    assert outcome["status"] == review.FLAGGED and outcome["nonsense_sentences"] == [S1]
    assert any("nonsense sentence" in issue for issue in outcome["issues"])
    assert outcome["dropped_nonsense_unconfirmed"] == 1  # S2 was named by pass 2 alone
    assert outcome["passes"][0]["nonsense_sentences"] == [S1]


def test_a_sentence_named_by_one_pass_or_two_different_ones_does_not_block():
    one = review.assess(sense([S1]), FACTS, SENSE_CONTENT, sense([]))
    assert one["status"] == review.OK and one["dropped_nonsense_unconfirmed"] == 1
    differ = review.assess(sense([S1]), FACTS, SENSE_CONTENT, sense([S2]))
    assert differ["status"] == review.OK and differ["nonsense_sentences"] == []
    assert review.assess(sense([S1]), FACTS, SENSE_CONTENT, None)["status"] == review.OK


def test_a_nonsense_sentence_must_occur_in_the_copy():
    invented = "ಇದು ಕಾಪಿಯಲ್ಲಿ ಇಲ್ಲದ ವಾಕ್ಯ"
    outcome = review.assess(sense([invented]), FACTS, SENSE_CONTENT, sense([invented]))
    assert outcome["status"] == review.OK and outcome["nonsense_sentences"] == []


def test_the_sense_check_is_independent_of_the_word_problem_list():
    word = {"quote": "ಕಾಯಿಂಗೊಳ್ಳಿ", "type": "garbled", "note": "bad verb", "fix": "ಕಾಯಿರಿ"}
    first = {**sense([]), "language_problems": [word]}
    outcome = review.assess(first, FACTS, SENSE_CONTENT, sense([S1]))
    assert outcome["status"] == review.OK  # word problem unconfirmed, sentence named by one pass only


def test_the_prompt_asks_for_nonsense_sentences():
    assert "nonsense_sentences" in review_messages("x", "kn", None, 0)[0]["content"]


# ---- three passes, 2-of-3 voting

def test_two_of_three_passes_block_even_when_pass_one_missed_it():
    outcome = review.assess(parsed([]), FACTS, CONTENT, parsed([REAL]), parsed([{**REAL, "fix": "ಬಿರಿಯಾನಿ ಅಂಗಡಿ"}]))
    assert outcome["status"] == review.FLAGGED and outcome["usable_passes"] == 3
    assert any("ಬಿರ್ಯಾನಿ" in issue for issue in outcome["issues"])


def test_one_of_three_does_not_block():
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, parsed([]), parsed([]))
    assert outcome["status"] == review.OK and outcome["dropped_unconfirmed"] == 1


def test_three_passes_disagreeing_on_three_different_defects_do_not_block():
    a = {**REAL, "quote": "ಕಾಂಬೋ", "fix": "ಕಾಂಬೊ"}
    b = {**REAL, "quote": "ಆರ್ಡರ್", "type": "garbled", "fix": "ಆರ್ಡರು"}
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, parsed([a]), parsed([b]))
    assert outcome["status"] == review.OK and outcome["dropped_unconfirmed"] == 3


def test_a_failed_pass_abstains_and_the_other_two_still_vote():
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, None, parsed([REAL]))
    assert outcome["status"] == review.FLAGGED and outcome["usable_passes"] == 2
    assert outcome["passes"][1] is None


def test_with_one_usable_pass_nothing_can_block():
    outcome = review.assess(parsed([REAL]), FACTS, CONTENT, None, None)
    assert outcome["status"] == review.OK and outcome["usable_passes"] == 1
    sense_only = review.assess(sense([S1]), FACTS, SENSE_CONTENT, None, None)
    assert sense_only["status"] == review.OK


def test_nonsense_sentence_two_of_three_blocks_and_one_of_three_does_not():
    assert review.assess(sense([]), FACTS, SENSE_CONTENT, sense([S1]), sense([S1]))["status"] == review.FLAGGED
    assert review.assess(sense([S1]), FACTS, SENSE_CONTENT, sense([]), sense([S2]))["status"] == review.OK


def test_the_three_framings_differ_and_stay_blind():
    texts = [review_messages("x", "kn", ["Brew Bandi"], v)[0]["content"] for v in range(3)]
    assert len(set(texts)) == 3
    assert all("offer_facts" not in t and "Saturday" not in t for t in texts)


def test_a_nonsense_quote_with_a_stray_character_still_points_at_its_sentence():
    mangled = S1.replace("ಒಳಗೆ", "ಒಳಗe")
    outcome = review.assess(sense([mangled]), FACTS, SENSE_CONTENT, sense([S1.rstrip(".")]), sense([]))
    assert outcome["nonsense_sentences"] == [S1]
    fragment = review.assess(sense(["ಕುಳಿತು ಕಾಯಿಂಗೊಳ್ಳಿ"]), FACTS, SENSE_CONTENT, sense([S1]), sense([]))
    assert fragment["nonsense_sentences"] == [S1]


def test_a_clipped_word_quote_and_a_style_note_are_not_defects():
    content = "ಬನ್ನಿ, ಒಳಗೆ ಕುಳಿತು ಸವಿಯಿರಿ. 20% छूट केवल डाइन-इन के लिए।"
    clipped = {"quote": "ಸವಿಯಿರ", "type": "not_a_word", "note": "typo", "fix": "ಸವಿಯಿರಿ"}
    style = {"quote": "20% छूट केवल डाइन-इन के लिए", "type": "garbled", "note": "Unnatural phrasing", "fix": "डाइन-इन पर 20% छूट"}
    out = review.assess(parsed([clipped, style]), FACTS, content, parsed([clipped, style]), parsed([clipped, style]))
    assert out["status"] == review.OK and out["dropped_unverified"] == 2


def test_a_not_a_word_fix_that_is_a_different_word_is_a_rewrite_not_a_defect():
    content = "ಒಟ್ಟು ಬಿಲ್ 80 ರೂಪಾಯಿ"
    rewrite = {"quote": "ಒಟ್ಟು", "type": "not_a_word", "note": "Typo", "fix": "ಒಂದು"}
    assert review.assess(parsed([rewrite]), FACTS, content, parsed([rewrite]), parsed([rewrite]))["status"] == review.OK
    typo = {"quote": "ಬಿಲ್ಲ್", "type": "not_a_word", "note": "Typo", "fix": "ಬಿಲ್"}
    assert review.problem_items([typo], "ಒಟ್ಟು ಬಿಲ್ಲ್ 80")[0]
