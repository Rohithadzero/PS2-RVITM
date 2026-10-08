"""Deterministic spoken-number parser for English, Hindi and Kannada (docs/validator-and-scoring.md section 8).

Why: calibration showed the LLM misreads spoken number words in Kanglish/Hinglish ("bees" -> 3). Numbers in the
lock are accepted from the LLM only when this parser agrees; otherwise the owner confirms them.

The Hindi and Kannada lexicons below are INCOMPLETE and unreviewed: unknown words simply produce no number
(which triggers an owner confirmation), never a guess. Native speakers should extend them (docs/native-review.md).
"""
from __future__ import annotations

import re
from dataclasses import dataclass

EN = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
    "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
    "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
    "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90, "hundred": 100,
}

HI_LATIN = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "chaar": 4, "paanch": 5, "panch": 5, "chhe": 6, "chhah": 6, "saat": 7,
    "aath": 8, "nau": 9, "das": 10, "gyarah": 11, "barah": 12, "terah": 13, "chaudah": 14, "pandrah": 15,
    "solah": 16, "satrah": 17, "atharah": 18, "unnis": 19, "bees": 20, "ikkis": 21, "ikkees": 21, "baees": 22,
    "teis": 23, "chaubis": 24, "pachchis": 25, "pachchees": 25, "pachis": 25, "chhabbis": 26, "sattais": 27,
    "atthais": 28, "untis": 29, "tees": 30, "tis": 30, "chaalis": 40, "chalis": 40, "pachaas": 50, "pachas": 50,
    "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90, "sau": 100,
    "adtalis": 48, "adtaalis": 48, "achhtalis": 48, "atthtalis": 48,
}
HI_NATIVE = {
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पांच": 5, "पाँच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8, "नौ": 9,
    "दस": 10, "ग्यारह": 11, "बारह": 12, "पंद्रह": 15, "बीस": 20, "पच्चीस": 25, "तीस": 30, "चालीस": 40,
    "पचास": 50, "अड़तालीस": 48, "सौ": 100,
}
KN_LATIN = {
    "ondu": 1, "eradu": 2, "mooru": 3, "naalku": 4, "aidu": 5, "aaru": 6, "elu": 7, "entu": 8, "ombattu": 9,
    "hattu": 10, "hannondu": 11, "hanneradu": 12, "hadimooru": 13, "hadinaalku": 14, "hadinaidu": 15,
    "hadinaaru": 16, "hadinelu": 17, "hadinentu": 18, "hathombattu": 19, "ippattu": 20, "ippattondu": 21,
    "ippatteradu": 22, "ippattaidu": 25, "muvattu": 30, "nalavattu": 40, "nalvattu": 40, "aivattu": 50,
    "aravattu": 60, "eppattu": 70, "embattu": 80, "tombattu": 90, "nooru": 100, "nalvattentu": 48,
    "nalavattentu": 48,
}
KN_NATIVE = {
    "ಒಂದು": 1, "ಎರಡು": 2, "ಮೂರು": 3, "ನಾಲ್ಕು": 4, "ಐದು": 5, "ಆರು": 6, "ಏಳು": 7, "ಎಂಟು": 8, "ಒಂಬತ್ತು": 9,
    "ಹತ್ತು": 10, "ಹನ್ನೊಂದು": 11, "ಹನ್ನೆರಡು": 12, "ಹದಿನೈದು": 15, "ಇಪ್ಪತ್ತು": 20, "ಮೂವತ್ತು": 30,
    "ನಲವತ್ತು": 40, "ಐವತ್ತು": 50, "ನೂರು": 100,
}

LEXICON = {**EN, **HI_LATIN, **HI_NATIVE, **KN_LATIN, **KN_NATIVE}
# English "do"/"one"/"char" collide with ordinary words; Latin Hindi/Kannada words are only trusted in romanized text.
AMBIGUOUS = {"do", "char", "ek", "one", "sau", "das", "nau", "saat", "teen"}

PERCENT = {"%", "percent", "pct", "percentage", "parsent", "persent", "प्रतिशत", "परसेंट", "फ़ीसदी", "फीसदी",
           "ಶೇಕಡಾ", "ಶೇಕಡ", "ಪರ್ಸೆಂಟ್", "ಪರ್ಸೆಂಟ", "ಪರ್ಸೆಂಟು"}
RUPEE = {"₹", "rs", "rs.", "rupee", "rupees", "rupaye", "rupayi", "rupaiya", "rupayee", "रुपये", "रुपए", "रुपया",
         "ರೂಪಾಯಿ", "ರೂ", "ರೂಪಾಯಿಗೆ"}
FILLER_BETWEEN = {"and", "aur", "mattu", "और", "ಮತ್ತು"}
TOKEN_RE = re.compile(r"[₹%]|[A-Za-z]+\.?|[0-9]+|[^\s\d%₹A-Za-z]+")


@dataclass
class Num:
    value: int
    text: str
    index: int  # token index of the first token


def _tokens(text: str) -> list[str]:
    out = []
    for raw in re.split(r"[\s,;:!?()\[\]\"“”‘’।|/\-–—]+", text):
        if not raw:
            continue
        # split a leading/trailing symbol such as "₹48" or "20%"
        parts = re.findall(r"[₹%]|[^₹%]+", raw)
        out.extend(x.strip(".") if not x.replace(".", "").isdigit() else x for x in parts if x.strip(".") or x.isdigit())
    return out


def _value(tok: str):
    t = tok.lower().rstrip(".")
    if t.isdigit():
        return int(t)
    return LEXICON.get(t)


def find_numbers(text: str, romanized: bool = True) -> list[Num]:
    toks = _tokens(text)
    nums, i = [], 0
    while i < len(toks):
        v = _value(toks[i])
        if v is None or (toks[i].lower() in AMBIGUOUS and not romanized and not toks[i].isdigit()):
            i += 1
            continue
        start, acc, used = i, 0, []
        j = i
        while j < len(toks):
            tv = _value(toks[j])
            if tv is None and toks[j].lower() in FILLER_BETWEEN and used and j + 1 < len(toks) and _value(toks[j + 1]) is not None:
                j += 1
                continue
            if tv is None:
                break
            if tv == 100 and acc < 100:
                acc = (acc or 1) * 100
            elif acc == 0:
                acc = tv
            elif acc % 100 == 0:
                acc += tv  # "ek sau bees" = 100 + 20
            elif acc % 100 >= 20 and acc % 10 == 0 and tv < 10:
                acc += tv  # "twenty five"
            else:
                break  # two unrelated numbers in a row: stop
            used.append(toks[j])
            j += 1
        nums.append(Num(acc, " ".join(used), start))
        i = max(j, i + 1)
    return nums


def extract_offer_numbers(text: str, romanized: bool = True) -> dict:
    """Pick the discount percent and the price from a spoken brief.

    Self-corrections: when several numbers claim the same role the LAST one wins and `corrected` is True.
    Returns {"discount_pct": int|None, "price_inr": int|None, "corrected": [...], "unparsed_hint": bool}.
    """
    toks = _tokens(text)
    pcts, prices = [], []
    for n in find_numbers(text, romanized):
        end = n.index + len(n.text.split())
        after = [t.lower() for t in toks[end:end + 2]]
        before = [t.lower() for t in toks[max(0, n.index - 1):n.index]]
        if any(a in PERCENT or a.rstrip("%") in PERCENT for a in after) or "%" in after[:1]:
            pcts.append(n.value)
        elif any(a in RUPEE for a in after) or any(b in RUPEE for b in before):
            prices.append(n.value)
    corrected = []
    if len(pcts) > 1:
        corrected.append("discount_pct")
    if len(prices) > 1:
        corrected.append("price_inr")
    return {
        "discount_pct": pcts[-1] if pcts else None,
        "price_inr": prices[-1] if prices else None,
        "corrected": corrected,
    }


def reconcile(llm_facts: dict, parsed: dict) -> dict:
    """Which numeric fields can be trusted. A field is `confirmed` only when parser and LLM agree.

    Returns {"confirmed": {field: value}, "unconfirmed": [{"field","llm","parser"}]}.
    """
    confirmed, unconfirmed = {}, []
    for f in ("discount_pct", "price_inr"):
        llm, par = llm_facts.get(f), parsed.get(f)
        if llm is None and par is None:
            continue
        if llm is not None and par is not None and int(llm) == int(par):
            confirmed[f] = int(llm)
        else:
            unconfirmed.append({"field": f, "llm": llm, "parser": par})
    return {"confirmed": confirmed, "unconfirmed": unconfirmed}
