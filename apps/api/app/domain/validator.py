"""Deterministic validator V1-V12 (docs/validator-and-scoring.md). Not an LLM: it blocks or allows.

Runs on RENDERED text. Text inside slot spans came from the approved lock, so only the text outside them
is searched for numbers, days, percentages, times and promises the lock never authorised.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .facts import OfferFacts
from .lexicon import (DAYS, IMPLIED_PROMISES, LATIN_ALLOW, MONTHS, NUMBER_WORDS, PERCENT_WORDS,
                      RELATIVE_TIME_WORDS, TERMS)
from .slots import Rendered

DIGIT_RE = re.compile(r"[0-9०-९೦-೯０-９]+")
LATIN_RE = re.compile(r"[A-Za-z]+")
SPLIT_RE = re.compile(r"[\s,.;:!?()\[\]{}\"'“”‘’।|/\-–—_#@*]+")

# time-of-day words are V5, the rest of RELATIVE_TIME_WORDS is V4 (dates)
V5_WORDS = {
    "en": {"noon", "midnight", "morning", "evening", "afternoon", "all day", "24/7"},
    "hi": {"दिन भर", "सुबह", "शाम", "दोपहर"},
    "kn": {"ದಿನವಿಡೀ", "ಬೆಳಿಗ್ಗೆ", "ಸಂಜೆ", "ಮಧ್ಯಾಹ್ನ"},
}

CHANNEL_LIMITS = {"instagram": 2200, "whatsapp": 1000, "poster": 180, "sms": 0}

GSM7 = set("@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà")

RULE_NAMES = {
    "V0": "Slot integrity", "V1": "Stray digits", "V2": "Spelled-out numbers", "V3": "Percentages",
    "V4": "Day and date words", "V5": "Time words", "V6": "Conditions present", "V7": "Implied promises",
    "V8": "Brand rules", "V9": "Channel limits", "V10": "Facts version", "V12": "Mixed script",
}


@dataclass
class Issue:
    rule: str
    token: str
    field: str
    detail: str
    position: int = -1

    def as_dict(self):
        return {"rule": self.rule, "token": self.token, "field": self.field, "detail": self.detail, "position": self.position}


@dataclass
class Report:
    passed: bool
    results: list = field(default_factory=list)
    issues: list = field(default_factory=list)
    sms: dict | None = None

    def block_reason(self):
        if not self.issues:
            return None
        i = self.issues[0]
        return {"token": i["token"], "field": i["field"], "rule": i["rule"], "detail": i["detail"]}

    def as_dict(self):
        return {"passed": self.passed, "results": self.results, "issues": self.issues, "sms": self.sms}


def _mask(text: str, spans) -> str:
    """Blank out the slot-filled regions (keeps positions)."""
    chars = list(text)
    for s, e, _slot in spans:
        for i in range(s, min(e, len(chars))):
            chars[i] = " "
    return "".join(chars)


_INDIC_WORD = "a-z0-9ऀ-ॿಀ-೿"


def _has_phrase(text_lc: str, phrase: str) -> int:
    """Position of `phrase` in lowercase text, or -1.

    Latin phrases match on word boundaries. Indic phrases of 4+ characters match as substrings, because Kannada and
    Hindi attach suffixes ("ಭಾನುವಾರದಂದು" = "on Sunday") and a hard-coded day must still be caught. Short Indic phrases
    (<= 3 characters, e.g. the month "ಮೇ" inside "ಮೇಲೆ" = "on top of") need word boundaries or they collide with
    ordinary words.
    """
    p = phrase.lower()
    if re.fullmatch(r"[a-z0-9 /\-]+", p):
        m = re.search(r"(?<![a-z0-9])" + re.escape(p) + r"(?![a-z0-9])", text_lc)
        return m.start() if m else -1
    if len(p) <= 3:
        m = re.search(r"(?<![" + _INDIC_WORD + r"])" + re.escape(p) + r"(?![" + _INDIC_WORD + r"])", text_lc)
        return m.start() if m else -1
    return text_lc.find(p)


def sms_segments(text: str) -> dict:
    gsm = all(ch in GSM7 for ch in text)
    n = len(text)
    if gsm:
        segs = 1 if n <= 160 else -(-n // 153)
        return {"encoding": "GSM-7", "chars": n, "segments": segs}
    segs = 1 if n <= 70 else -(-n // 67)
    return {"encoding": "UCS-2", "chars": n, "segments": segs}


def _numeric_candidates(facts: OfferFacts) -> list[str]:
    out = []
    for name in ("discount_pct", "price_inr", "original_price_inr"):
        v = getattr(facts, name)
        if v is not None:
            out.append(f"{name}={v}")
    return out


def validate(rendered: Rendered, facts: OfferFacts, lang: str, channel: str, *, banned: list[str] | None = None,
             brand_names: list[str] | None = None, romanized: bool = False, asset_facts_version: int | None = None,
             approved_facts_version: int | None = None, template_slots_ok: bool = True,
             max_sms_segments: int = 2) -> Report:
    text = rendered.text
    outside = _mask(text, rendered.spans)
    lc = outside.lower()
    banned = banned or []
    brand_names = [b.lower() for b in (brand_names or [])]
    issues: list[Issue] = []
    by_rule: dict[str, list[Issue]] = {r: [] for r in RULE_NAMES}

    def add(i: Issue):
        issues.append(i)
        by_rule[i.rule].append(i)

    # V0 slot integrity
    for e in rendered.errors:
        add(Issue("V0", e, "slot", e))
    if re.search(r"\{[^}]*\}", text):
        add(Issue("V0", re.search(r"\{[^}]*\}", text).group(0), "slot", "unfilled placeholder left in text"))
    if not template_slots_ok:
        add(Issue("V0", "template", "slot", "template uses a slot that is not bound to a lock field"))

    # V1 stray digits outside slots (ASCII, Devanagari, Kannada, fullwidth)
    for m in DIGIT_RE.finditer(outside):
        add(Issue("V1", m.group(0), "; ".join(_numeric_candidates(facts)) or "none",
                  f"number '{m.group(0)}' is not from a slot; the lock has {', '.join(_numeric_candidates(facts)) or 'no numbers'}", m.start()))

    # V2 spelled-out numbers outside slots
    tokens = [t for t in SPLIT_RE.split(outside) if t]
    words = set(NUMBER_WORDS["en"]) if lang == "en" or romanized else set()
    words |= set(NUMBER_WORDS["hi"]) | set(NUMBER_WORDS["kn"])
    if romanized:
        words |= set(NUMBER_WORDS["hi_latin"]) | set(NUMBER_WORDS["kn_latin"])
    for t in tokens:
        if t.lower() in words:
            add(Issue("V2", t, "none", f"spelled-out number '{t}' is not from a slot"))

    # V3 percentages outside slots
    for w in PERCENT_WORDS:
        pos = _has_phrase(lc, w)
        if pos >= 0:
            add(Issue("V3", w, "discount_pct", f"'{w}' appears outside the {{discount}} slot", pos))

    # V4 relative date words and day/month names outside slots
    day_month_words = []
    for lg in DAYS:
        day_month_words += list(DAYS[lg].values()) + MONTHS[lg]
    rel = [w for w in RELATIVE_TIME_WORDS["en"] + RELATIVE_TIME_WORDS[lang] if w not in V5_WORDS["en"] | V5_WORDS.get(lang, set())]
    for w in day_month_words + rel:
        pos = _has_phrase(lc, w)
        if pos >= 0:
            add(Issue("V4", w, "days/dates", f"'{w}' is a day/date claim outside the {{days}}/{{dates}} slots", pos))

    # V5 time-of-day words outside slots
    for w in sorted(V5_WORDS["en"] | V5_WORDS.get(lang, set())):
        pos = _has_phrase(lc, w)
        if pos >= 0:
            add(Issue("V5", w, "time_from/time_to", f"'{w}' is a time claim outside the {{time}} slot", pos))

    # V6 every condition in the lock must appear
    for term in facts.terms:
        phrase = TERMS[term][lang]
        if phrase.lower() not in text.lower():
            add(Issue("V6", term, "terms", f"condition '{term}' ({phrase}) is missing from the asset"))

    # V7 implied promises outside slots, unless the owner allowed them
    allowed = [a.lower() for a in facts.allowed_claims]
    for w in IMPLIED_PROMISES["en"] + IMPLIED_PROMISES[lang]:
        pos = _has_phrase(lc, w)
        if pos >= 0 and w.lower() not in allowed:
            add(Issue("V7", w, "none", f"'{w}' promises something the lock does not contain", pos))

    # V8 brand rules (anywhere in the text)
    tl = text.lower()
    for b in banned:
        if b and b.lower() in tl:
            add(Issue("V8", b, "brand", f"banned phrase '{b}'", tl.find(b.lower())))

    # V9 channel limits
    sms = None
    if channel == "sms":
        sms = sms_segments(text)
        if sms["segments"] > max_sms_segments:
            add(Issue("V9", f"{sms['segments']} segments", "channel", f"SMS needs {sms['segments']} segments ({sms['encoding']}); limit {max_sms_segments}"))
    else:
        lim = CHANNEL_LIMITS.get(channel)
        if lim and len(text) > lim:
            add(Issue("V9", f"{len(text)} chars", "channel", f"{channel} limit is {lim} characters"))

    # V10 stale facts version
    if asset_facts_version is not None and approved_facts_version is not None and asset_facts_version != approved_facts_version:
        add(Issue("V10", f"v{asset_facts_version}", "facts_version",
                  f"asset was made for facts v{asset_facts_version}; approved is v{approved_facts_version}"))

    # V12 Latin letters inside Kannada/Devanagari assets (outside slots, brand names and allow-list)
    if lang in ("hi", "kn") and not romanized:
        allow = set(brand_names) | {w.lower() for w in LATIN_ALLOW.get(lang, set())}
        for m in LATIN_RE.finditer(outside):
            w = m.group(0)
            if w.lower() not in allow and not any(w.lower() in a.split() for a in allow):
                add(Issue("V12", w, "script", f"Latin letters '{w}' inside a {lang} asset", m.start()))

    results = []
    for rule in ("V0", "V1", "V2", "V3", "V4", "V5", "V6", "V7", "V8", "V9", "V10", "V12"):
        results.append({"rule": rule, "name": RULE_NAMES[rule], "passed": not by_rule[rule],
                        "issues": [i.as_dict() for i in by_rule[rule]]})
    return Report(passed=not issues, results=results, issues=[i.as_dict() for i in issues], sms=sms)
