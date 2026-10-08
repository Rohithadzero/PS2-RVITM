from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.dates import MONTHS, dates_in_text
from app.schemas import OfferFacts

DAYS = (
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
)
# \d also matches Kannada and Devanagari digits, and float() parses them.
# Indic words carry combining vowel signs, which break \b, so they match as plain substrings.
PERCENT_RE = re.compile(
    r"(\d+(?:\.\d+)?)\s*(?:%|percent\b|प्रतिशत|फ़ीसदी|फीसदी|ಶೇಕಡಾ|ಶೇ)|(?:ಶೇಕಡಾ|ಶೇ)\.?\s*(\d+(?:\.\d+)?)",
    re.IGNORECASE,
)
PRICE_RE = re.compile(
    r"(?:₹|\brs\.?|\binr|रु\.?|ರೂ\.?)\s*(\d+(?:\.\d+)?)"
    r"|(\d+(?:\.\d+)?)\s*(?:rupees?\b|रुपये|रुपए|रुपया|ರೂಪಾಯಿ|ರೂ)",
    re.IGNORECASE,
)
FREE_RE = re.compile(r"\bfree\b|मुफ़्त|मुफ्त|फ्री|ಉಚಿತ|ಫ್ರೀ", re.IGNORECASE)
DAY_RE = re.compile(
    r"\b(mondays?|tuesdays?|wednesdays?|thursdays?|fridays?|saturdays?|sundays?"
    r"|somvar|mangalvar|budhvar|guruvar|shukravar|shanivar|ravivar|itwar)\b",
    re.IGNORECASE,
)
# Capitalised only, so "sun" or "wed" inside ordinary English does not count as a weekday.
DAY_ABBR_RE = re.compile(r"\b(Mon|Tue|Tues|Wed|Thu|Thur|Thurs|Fri|Sat|Sun)\b\.?")
ROMAN_DAYS = {
    "somvar": "monday",
    "mangalvar": "tuesday",
    "budhvar": "wednesday",
    "guruvar": "thursday",
    "shukravar": "friday",
    "shanivar": "saturday",
    "ravivar": "sunday",
    "itwar": "sunday",
}
INDIC_DAYS = {
    "monday": ("ಸೋಮವಾರ", "सोमवार"),
    "tuesday": ("ಮಂಗಳವಾರ", "मंगलवार"),
    "wednesday": ("ಬುಧವಾರ", "बुधवार"),
    "thursday": ("ಗುರುವಾರ", "गुरुवार", "बृहस्पतिवार"),
    "friday": ("ಶುಕ್ರವಾರ", "शुक्रवार"),
    "saturday": ("ಶನಿವಾರ", "शनिवार"),
    "sunday": ("ಭಾನುವಾರ", "ರವಿವಾರ", "रविवार", "इतवार"),
}
DAILY_RE = re.compile(
    r"\b(every day|everyday|all week|daily)\b|हर दिन|हर रोज़|हर रोज|रोज़ाना|रोजाना|पूरे हफ्ते|ಪ್ರತಿದಿನ|ದಿನನಿತ್ಯ|ವಾರಪೂರ್ತಿ",
    re.IGNORECASE,
)
WEEKDAYS_RE = re.compile(r"\bweekdays\b|वीकडेज़|वीकडेज|ಕೆಲಸದ ದಿನ", re.IGNORECASE)
WORKWEEK = {"monday", "tuesday", "wednesday", "thursday", "friday"}
WEEKEND_RE = re.compile(r"\bweekends?\b|वीकेंड|सप्ताहांत|ವಾರಾಂತ್ಯ|ವೀಕೆಂಡ್", re.IGNORECASE)
TIME_RE = re.compile(r"\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b", re.IGNORECASE)


@dataclass(frozen=True)
class Issue:
    code: str
    message: str


@dataclass(frozen=True)
class ValidationResult:
    ok: bool
    issues: list[Issue]

    @property
    def codes(self) -> list[str]:
        return [issue.code for issue in self.issues]

    def messages(self) -> list[str]:
        return [issue.message for issue in self.issues]


def _days_in(text: str) -> set[str]:
    found: set[str] = set()
    for match in DAY_RE.finditer(text):
        word = match.group(1).lower()
        if word in ROMAN_DAYS:
            found.add(ROMAN_DAYS[word])
            continue
        for day in DAYS:
            if word.startswith(day):
                found.add(day)
                break
    for match in DAY_ABBR_RE.finditer(text):
        prefix = match.group(1).lower()[:3]
        found.update(day for day in DAYS if day.startswith(prefix))
    for day, words in INDIC_DAYS.items():
        if any(word in text for word in words):
            found.add(day)
    return found


def _percents(content: str) -> list[float]:
    return [float(match.group(1) or match.group(2)) for match in PERCENT_RE.finditer(content)]


def _money(facts: OfferFacts, amount: float) -> str:
    rendered = f"{amount:g}"
    if (facts.currency or "INR").upper() == "INR":
        return f"₹{rendered}"
    return f"{rendered} {facts.currency}"


def _amounts(content: str) -> list[float]:
    amounts: list[float] = []
    for match in PRICE_RE.finditer(content):
        raw = match.group(1) or match.group(2)
        amounts.append(float(raw))
    return amounts


REPEAT_RUN = 5  # a run of this many words that occurs this many times is degenerate copy
REPEAT_RUN_TIMES = 3
_CLAUSE_SPLIT = re.compile(r"[.!?\u0964\n,;:]+")


def _words(text: str) -> list[str]:
    cleaned = "".join(ch if unicodedata.category(ch)[0] in "LMN" else " " for ch in text.lower())
    return cleaned.split()


def repeated_text(content: str) -> str | None:
    """Language-agnostic degeneration check. Returns what repeats, or None.

    A clause of two or more words that occurs twice, or any 5-word run that occurs three times.
    A single repeated word (a day name, a hashtag) is fine.
    """
    seen: set[str] = set()
    for clause in _CLAUSE_SPLIT.split(content):
        words = _words(clause)
        if len(words) < 2:
            continue
        key = " ".join(words)
        if key in seen:
            return clause.strip()
        seen.add(key)
    words = _words(content)
    runs: dict[tuple[str, ...], int] = {}
    for i in range(len(words) - REPEAT_RUN + 1):
        run = tuple(words[i : i + REPEAT_RUN])
        runs[run] = runs.get(run, 0) + 1
        if runs[run] >= REPEAT_RUN_TIMES:
            return " ".join(run)
    return None


def validate_content(content: str, facts: OfferFacts) -> ValidationResult:
    if not content or not content.strip():
        return ValidationResult(False, [Issue("empty", "Asset has no copy.")])

    issues: list[Issue] = []
    repeated = repeated_text(content)
    if repeated:
        issues.append(Issue("repeated_text", f"Copy repeats itself ({repeated[:60]})."))
    terms = facts.terms or ""
    # Numbers the locked terms state themselves (e.g. "max ₹100 off per bill") may be repeated.
    terms_percents = _percents(terms)
    # A bare number in the terms ("order above 500") is the owner's own, so the copy may repeat it as a price.
    terms_amounts = _amounts(terms) + [float(n) for n in re.findall(r"\d+(?:\.\d+)?", terms)]
    percents = [p for p in _percents(content) if not _in(p, terms_percents)]
    if facts.discount_percent is None:
        if percents:
            issues.append(Issue("percent_unexpected", "Copy states a discount but the offer facts lock none."))
    else:
        for percent in percents:
            if abs(percent - facts.discount_percent) > 0.01:
                issues.append(
                    Issue(
                        "percent_mismatch",
                        f"Copy states {percent:g}% but the locked discount is {facts.discount_percent:g}%.",
                    )
                )

    amounts = [a for a in _amounts(content) if not _in(a, terms_amounts)]
    if facts.price_amount is None:
        if amounts:
            issues.append(Issue("price_unexpected", "Copy states a price but the offer facts lock none."))
    else:
        for amount in amounts:
            if abs(amount - facts.price_amount) > 0.01:
                issues.append(
                    Issue(
                        "price_mismatch",
                        f"Copy states {_money(facts, amount)} but the locked price is {_money(facts, facts.price_amount)}.",
                    )
                )
        if FREE_RE.search(content) and facts.price_amount != 0:
            issues.append(Issue("free_mismatch", "Copy says free but the offer facts lock a price."))

    scope = f"{facts.item} {terms}"
    for code, says, applies, message in CLAIM_RULES:
        if says.search(content) and applies(scope, terms):
            issues.append(Issue(code, message.format(item=facts.item, terms=terms)))

    copy_dates, invalid_dates = dates_in_text(content)
    for label in invalid_dates:
        issues.append(Issue("date_invalid", f"Copy contains a date that is not a real calendar day ({label})."))
    locked_dates = set(facts.dates)
    for found in copy_dates:
        if found in locked_dates:
            continue
        if locked_dates:
            issues.append(
                Issue("date_mismatch", f"Copy states {found} but that date is not in the locked offer facts.")
            )
        else:
            issues.append(Issue("date_unexpected", "Copy states a date but the offer facts lock none."))

    fact_days = locked_days(facts)
    copy_days = _days_in(content)
    named_days = copy_days | ({"saturday", "sunday"} if WEEKEND_RE.search(content) else set())
    named_days |= WORKWEEK if WEEKDAYS_RE.search(content) else set()
    extra_days = copy_days - fact_days
    if fact_days and not fact_days <= named_days and not states_every_date(content, facts):
        missing = ", ".join(day.capitalize() for day in DAYS if day in fact_days - named_days)
        issues.append(
            Issue("weekday_missing", f"Copy does not state the locked days ({missing}), so readers may assume any day.")
        )
    if fact_days and extra_days:
        shown = ", ".join(day.capitalize() for day in DAYS if day in extra_days)
        issues.append(
            Issue(
                "weekday_mismatch",
                f"Copy mentions {shown} but the locked timing is {facts.timings}.",
            )
        )
    if fact_days:
        widens_to_daily = DAILY_RE.search(content)
        widens_to_weekend = WEEKEND_RE.search(content) and fact_days != {"saturday", "sunday"}
        widens_to_workweek = WEEKDAYS_RE.search(content) and not WORKWEEK <= fact_days
        if widens_to_daily or widens_to_weekend or widens_to_workweek:
            issues.append(Issue("weekday_widen", "Copy widens the days locked in the offer facts."))

    return ValidationResult(not issues, issues)


_DAY_MONTH_RE = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?([A-Za-z]+)\b", re.I)
_MONTH_DAY_RE = re.compile(r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\b", re.I)


def states_every_date(content: str, facts: OfferFacts) -> bool:
    """True when the copy names every locked date in full (ISO, or day number plus month name). Day numbers alone do not count."""
    if not facts.dates:
        return False
    stated = set(dates_in_text(content)[0])
    pairs = {(int(m.group(1)), MONTHS.get(m.group(2).lower())) for m in _DAY_MONTH_RE.finditer(content)}
    pairs |= {(int(m.group(2)), MONTHS.get(m.group(1).lower())) for m in _MONTH_DAY_RE.finditer(content)}
    for locked in facts.dates:
        year, month, day = (int(x) for x in locked.split("-"))
        if locked not in stated and (day, month) not in pairs:
            return False
    return True


def _in(value: float, allowed: list[float]) -> bool:
    return any(abs(value - other) <= 0.01 for other in allowed)


# Claims the copy must not make unless the locked facts support them: (code, copy pattern, applies(scope, terms), message).
CLAIM_RULES = (
    (
        "scarcity_unlocked",
        re.compile(r"\bonly\s+\d+\s+left\b|\b\d+\s+(?:left|remaining)\b|\blimited stock\b|\bselling fast\b", re.I),
        lambda scope, terms: not re.search(r"\b(limited|stock)\b", terms, re.I),
        "Copy claims limited stock that the offer facts do not lock.",
    ),
    (
        "limit_contradicted",
        re.compile(r"\bno limit\b|\bunlimited\b|\bno conditions\b|\bno strings\b", re.I),
        lambda scope, terms: bool(re.search(r"\b(max|maximum|limit|cap|one|per)\b", terms, re.I)),
        "Copy says there is no limit but the locked terms set one ({terms}).",
    ),
    (
        "dine_in_contradicted",
        re.compile(r"\b(?:take ?away|takeout|delivery|parcel)\b", re.I),
        lambda scope, terms: bool(re.search(r"\bdine[- ]?in only\b", terms, re.I)),
        "Copy offers takeaway or delivery but the locked terms say dine-in only.",
    ),
    (
        "scope_widen",
        re.compile(r"\ball (?:drinks|items|food|beverages|menu)\b|\bentire menu\b|\beverything\b|\bstorewide\b", re.I),
        lambda scope, terms: not re.search(r"\ball\b", scope, re.I),
        "Copy widens the offer beyond {item}.",
    ),
)


def locked_days(facts: OfferFacts) -> set[str]:
    timings = facts.timings or ""
    days = _days_in(timings)
    if WEEKEND_RE.search(timings):
        days |= {"saturday", "sunday"}
    return days


def facts_in_content(content: str, facts: OfferFacts, declared: list[str] | None = None) -> list[str]:
    """Offer fields an asset depends on: what the copy visibly states, plus what the writer declared.

    Numbers, dates and days are detected in the text. Terms cannot be detected across languages,
    so they count only when declared. The item is always a dependency.
    """
    used = {"item"}
    if _percents(content):
        used.add("discount_percent")
    if _amounts(content) or FREE_RE.search(content):
        used.add("price_amount")
    found_dates, invalid_dates = dates_in_text(content)
    if found_dates or invalid_dates:
        used.add("dates")
    if _days_in(content) or DAILY_RE.search(content) or WEEKEND_RE.search(content) or TIME_RE.search(content):
        used.add("timings")
    used.update(field for field in declared or [] if field in fields_present(facts))
    return [field for field in FACT_FIELDS if field in used]


FACT_FIELDS = ("item", "discount_percent", "price_amount", "dates", "timings", "terms")


def fields_present(facts: OfferFacts) -> list[str]:
    present = ["item"]
    if facts.discount_percent is not None:
        present.append("discount_percent")
    if facts.price_amount is not None:
        present.append("price_amount")
    if facts.dates:
        present.append("dates")
    if facts.timings:
        present.append("timings")
    if facts.terms:
        present.append("terms")
    return present
