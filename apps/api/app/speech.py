"""Deterministic reading of what an owner said: digits, number words, weekdays, dates. No AI.

Used by the interview and by change-by-voice. Everything the grounding check accepts comes from here,
so a number, date or weekday the owner did not say can never be accepted.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, timedelta

from app.dates import MONTHS
from app.validator import DAILY_RE, DAYS, WEEKDAYS_RE, WEEKEND_RE, WORKWEEK, _days_in

# Kannada and Devanagari digits to ASCII. Same length, so character offsets survive.
_DIGITS = str.maketrans("೦೧೨೩೪೫೬೭೮೯०१२३४५६७८९", "01234567890123456789")
TOKEN_RE = re.compile(r"\d+(?:\.\d+)?|[%₹]|[^\s\d,.;:!?()\[\]\"'%₹…]+")


def ascii_digits(text: str) -> str:
    return text.translate(_DIGITS)


def squash(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


# ---------------------------------------------------------------- number words

_EN = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14, "fifteen": 15,
    "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20, "thirty": 30,
    "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    "hundred": 100, "thousand": 1000,
}
_HI_ROMAN = {
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "panch": 5, "chhe": 6, "chhah": 6, "saat": 7,
    "aath": 8, "nau": 9, "das": 10, "gyarah": 11, "barah": 12, "terah": 13, "chaudah": 14, "pandrah": 15,
    "solah": 16, "satrah": 17, "atharah": 18, "unnis": 19, "bees": 20, "pachchis": 25, "tees": 30,
    "chalis": 40, "pachas": 50, "panchas": 50, "saath": 60, "sattar": 70, "assi": 80, "nabbe": 90,
    "sau": 100, "hazaar": 1000, "hazar": 1000,
}
_KN_ROMAN = {
    "ondu": 1, "eradu": 2, "mooru": 3, "muru": 3, "naalku": 4, "nalku": 4, "aidu": 5, "aaru": 6,
    "elu": 7, "entu": 8, "ombattu": 9, "hattu": 10, "hannondu": 11, "hanneradu": 12, "hadimooru": 13,
    "hadinaalku": 14, "hadinaidu": 15, "hadinaaru": 16, "hadinelu": 17, "hadinentu": 18,
    "hdinombattu": 19, "ippattu": 20, "ippattaidu": 25, "muvattu": 30, "nalavattu": 40, "aivattu": 50,
    "aravattu": 60, "eppattu": 70, "embattu": 80, "tombattu": 90, "nooru": 100, "saavira": 1000,
    "savira": 1000,
}
_HI = {
    "एक": 1, "दो": 2, "तीन": 3, "चार": 4, "पाँच": 5, "पांच": 5, "छह": 6, "छः": 6, "सात": 7, "आठ": 8,
    "नौ": 9, "दस": 10, "बीस": 20, "पच्चीस": 25, "तीस": 30, "चालीस": 40, "पचास": 50, "साठ": 60,
    "सत्तर": 70, "अस्सी": 80, "नब्बे": 90, "सौ": 100, "हज़ार": 1000, "हजार": 1000,
}
_KN = {
    "ಒಂದು": 1, "ಎರಡು": 2, "ಮೂರು": 3, "ನಾಲ್ಕು": 4, "ಐದು": 5, "ಆರು": 6, "ಏಳು": 7, "ಎಂಟು": 8,
    "ಒಂಬತ್ತು": 9, "ಹತ್ತು": 10, "ಇಪ್ಪತ್ತು": 20, "ಮೂವತ್ತು": 30, "ನಲವತ್ತು": 40, "ಐವತ್ತು": 50,
    "ಅರವತ್ತು": 60, "ಎಪ್ಪತ್ತು": 70, "ಎಂಬತ್ತು": 80, "ತೊಂಬತ್ತು": 90, "ನೂರು": 100, "ಸಾವಿರ": 1000,
}
NUMBER_WORDS: dict[str, int] = {**_EN, **_HI_ROMAN, **_KN_ROMAN, **_HI, **_KN}
# Words that are also ordinary Hindi or English ("rakh do", "ek ke saath ek"): a number only before a multiplier.
_AMBIGUOUS = {"do", "ek", "teen", "char", "das", "nau", "saat", "saath"}
_MULTIPLIERS = {"sau", "hazaar", "hazar", "nooru", "saavira", "savira", "hundred", "thousand", "सौ", "हज़ार", "हजार", "ನೂರು", "ಸಾವಿರ"}


@dataclass(frozen=True)
class Num:
    value: float
    first: int  # token index
    last: int
    words: bool


def _tokens(text: str) -> list[tuple[str, int, int]]:
    return [(m.group(), m.start(), m.end()) for m in TOKEN_RE.finditer(ascii_digits(text))]


def _word_value(tokens: list[tuple[str, int, int]], i: int) -> int | None:
    low = tokens[i][0].lower()
    value = NUMBER_WORDS.get(low)
    if value is None:
        return None
    if low in _AMBIGUOUS:
        following = tokens[i + 1][0].lower() if i + 1 < len(tokens) else ""
        if following not in _MULTIPLIERS:
            return None
    return value


def _eval_run(run: list[tuple[int, int]]) -> list[Num]:
    """Read a run of number words. Indian price speech: 'two ninety nine' is 299, 'mooru nooru' is 300."""
    out: list[Num] = []
    cur = first = last = None

    def emit() -> None:
        if cur is not None:
            out.append(Num(float(cur), first, last, True))

    for value, index in run:
        if cur is None:
            cur, first, last = value, index, index
            continue
        if value == 100 and cur < 100:
            cur *= 100
        elif value == 1000 and cur < 1000:
            cur *= 1000
        elif value < 10 and cur >= 20 and cur % 10 == 0:
            cur += value
        elif 20 <= value < 100 and cur < 10:
            cur = cur * 100 + value
        elif value < 100 and cur >= 100 and cur % 100 == 0:
            cur += value
        else:
            emit()
            cur, first = value, index
        last = index
    emit()
    return out


def _scan(text: str) -> tuple[list[tuple[str, int, int]], list[Num]]:
    tokens = _tokens(text)
    nums: list[Num] = []
    run: list[tuple[int, int]] = []

    def flush() -> None:
        nonlocal run
        if run:
            nums.extend(_eval_run(run))
            run = []

    for i, (tok, _s, _e) in enumerate(tokens):
        if tok[0].isdigit():
            flush()
            nums.append(Num(float(tok), i, i, False))
            continue
        value = _word_value(tokens, i)
        if value is not None:
            run.append((value, i))
        elif tok.lower() == "and" and run and i + 1 < len(tokens) and _word_value(tokens, i + 1) is not None:
            continue
        else:
            flush()
    flush()
    return tokens, nums


def numbers(text: str) -> list[float]:
    """Every number the owner said, in order: digits (ASCII, Kannada, Devanagari) and number words."""
    return [n.value for n in _scan(text)[1]]


_PERCENT_AFTER = {"%", "percent", "percentage", "pc", "prasatha", "pratishat", "pratisat", "प्रतिशत", "फ़ीसदी", "फीसदी", "ಶೇಕಡಾ", "ಶೇ"}
_PERCENT_BEFORE = {"ಶೇಕಡಾ", "ಶೇ"}
_RUPEE_AFTER = {"rupees", "rupee", "rs", "rupaye", "rupaiye", "rupayi", "रुपये", "रुपए", "रुपया", "ರೂಪಾಯಿ", "ರೂ", "inr"}
_RUPEE_BEFORE = {"₹", "rs", "inr", "रु", "ರೂ"}


def _marked(text: str, after: set[str], before: set[str]) -> list[float]:
    tokens, nums = _scan(text)
    found = []
    for n in nums:
        nxt = tokens[n.last + 1][0].lower() if n.last + 1 < len(tokens) else ""
        prv = tokens[n.first - 1][0].lower() if n.first > 0 else ""
        if nxt in after or prv in before:
            found.append(n.value)
    return found


def percents(text: str) -> list[float]:
    return _marked(text, _PERCENT_AFTER, _PERCENT_BEFORE)


def rupees(text: str) -> list[float]:
    return _marked(text, _RUPEE_AFTER, _RUPEE_BEFORE)


def non_time_numbers(text: str) -> list[float]:
    """Numbers that are not clock times ('nine to one', '9 am'), for fields where a long utterance mixes both."""
    tokens, nums = _scan(text)
    out = []
    for n in nums:
        nxt = tokens[n.last + 1][0].lower() if n.last + 1 < len(tokens) else ""
        prv = tokens[n.first - 1][0].lower() if n.first > 0 else ""
        if nxt in {"to", "se", "tak", "am", "pm", "baje", "o'clock", "oclock"} or prv in {"to", "se"}:
            continue
        out.append(n.value)
    return out


def words_to_digits(text: str) -> str:
    """Write spoken amounts as digits ('five hundred' -> '500'). Small single words ('one', 'buy one get one') stay words."""
    ascii_text = ascii_digits(text)
    tokens, nums = _scan(ascii_text)
    out = ascii_text
    for n in reversed(nums):
        if not n.words or (n.value < 20 and n.first == n.last):
            continue
        start, end = tokens[n.first][1], tokens[n.last][2]
        shown = f"{n.value:g}"
        out = out[:start] + shown + out[end:]
    return out


# ---------------------------------------------------------------- corrections

_CORRECTION = re.compile(
    r"\.{2,}|…"
    r"|\b(?:wait|sorry|actually|i mean|scratch that|correction|oops|no no|nahi nahi|nahin nahin|illa illa|alla alla)\b"
    r"|नहीं नहीं|ಅಲ್ಲ ಅಲ್ಲ"
    r"|[,;]\s*(?:no|nahi|nahin|illa|alla|नहीं|ಅಲ್ಲ)\s*[,;]",
    re.IGNORECASE,
)


def segments(text: str) -> list[str]:
    """Split a spoken answer at self-corrections. The last segment that holds a value wins."""
    parts = [squash(part).strip(" ,;.") for part in _CORRECTION.split(text)]
    return [part for part in parts if part] or [squash(text)]


# ---------------------------------------------------------------- weekdays

_ROMAN_DAY_WORDS = {
    "somvar": "monday", "somavar": "monday", "mangalvar": "tuesday", "mangalavar": "tuesday",
    "budhvar": "wednesday", "budhavar": "wednesday", "guruvar": "thursday", "shukravar": "friday",
    "shanivar": "saturday", "ravivar": "sunday", "bhanuvar": "sunday", "itvar": "sunday",
}
_ABBR = {"mon": "monday", "tue": "tuesday", "tues": "tuesday", "wed": "wednesday", "thu": "thursday",
         "thur": "thursday", "thurs": "thursday", "fri": "friday", "sat": "saturday", "sun": "sunday"}


def _norm_day(token: str) -> str:
    low = re.sub(r"(.)\1", r"\1", token.lower().replace("w", "v"))
    return low.rstrip("a")


_ROMAN_NORM = {_norm_day(word): day for word, day in _ROMAN_DAY_WORDS.items()}


def weekdays_in(text: str, abbr: bool = False) -> set[str]:
    """Weekday names in English, Kannada, Hindi and romanised speech. Abbreviations like 'sat' only when asked for."""
    found = set(_days_in(text))
    for tok, _s, _e in _tokens(text):
        day = _ROMAN_NORM.get(_norm_day(tok))
        if day:
            found.add(day)
        if abbr and tok.lower() in _ABBR:
            found.add(_ABBR[tok.lower()])
    return found


DAY_OPTIONS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun", "weekend", "weekdays", "every_day")


def read_days(text: str) -> list[str]:
    """The day options the owner named. 'every_day' wins over anything else."""
    if DAILY_RE.search(text):
        return ["every_day"]
    chosen = {day[:3] for day in weekdays_in(text, abbr=True)}
    if WEEKEND_RE.search(text):
        chosen.add("weekend")
    if WEEKDAYS_RE.search(text):
        chosen.add("weekdays")
    return [option for option in DAY_OPTIONS if option in chosen]


def expand_days(options: list[str]) -> list[str]:
    """Day options to full weekday names in week order. Empty when every day (no day is locked)."""
    names: set[str] = set()
    for option in options:
        if option == "weekend":
            names |= {"saturday", "sunday"}
        elif option == "weekdays":
            names |= WORKWEEK
        elif option == "every_day":
            return []
        else:
            names |= {day for day in DAYS if day.startswith(option)}
    return [day for day in DAYS if day in names]


def days_phrase(options: list[str]) -> str:
    """'Saturday and Sunday'. Every day is stated as 'Every day', which locks no weekday."""
    names = [day.capitalize() for day in expand_days(options)]
    if not names or len(names) == 7:
        return "Every day"
    if len(names) == 1:
        return names[0]
    return ", ".join(names[:-1]) + " and " + names[-1]


# ---------------------------------------------------------------- dates

_MONTH_PAT = "|".join(sorted((re.escape(name) for name in MONTHS), key=len, reverse=True)) + "|sept"
_ISO = re.compile(r"\b(\d{4})-(\d{1,2})-(\d{1,2})\b")
_DAY_MONTH = re.compile(rf"\b(\d{{1,2}})(?:st|nd|rd|th)?\s*(?:of\s+)?({_MONTH_PAT})\b(?:\s*,?\s*(\d{{4}}))?")
_MONTH_DAY = re.compile(rf"\b({_MONTH_PAT})\s+(\d{{1,2}})(?:st|nd|rd|th)?\b(?:\s*,?\s*(\d{{4}}))?")
_SLASH = re.compile(r"\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b")
_ORDINAL = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)\b")
_NEXT = re.compile(r"\bnext\b|अगले|अगला|ಮುಂದಿನ", re.IGNORECASE)
_DAY_AFTER = ("day after tomorrow", "parso", "parson", "ಮರಾಳೆ", "परसों")
_TOMORROW = ("tomorrow", "naale", "nale", "ನಾಳೆ")
_TODAY = ("today", "aaj", "ivattu", "ಇವತ್ತು", "ಇಂದು", "आज")
_KAL = ("kal", "कल")


@dataclass(frozen=True)
class DateRead:
    status: str  # "ok" | "ambiguous" | "none"
    iso: str | None = None
    reason: str | None = None


def _month_number(name: str) -> int:
    return MONTHS["sep" if name == "sept" else name]


def _build(year: int | None, month: int, day: int, today: date) -> date | None:
    try:
        if year is not None:
            return date(year, month, day)
        built = date(today.year, month, day)
        return built if built >= today else date(today.year + 1, month, day)
    except ValueError:
        return None


def _upcoming(day: str, today: date, skip_today: bool = False) -> date:
    delta = (DAYS.index(day) - today.weekday()) % 7
    if delta == 0 and skip_today:
        delta = 7
    return today + timedelta(days=delta)


def _segment_dates(segment: str, today: date) -> tuple[list[date], list[date], str | None]:
    """Dates one segment states: (stated, alternatives the words allow, problem)."""
    text = ascii_digits(segment).lower()
    stated: list[date] = []
    alts: list[date] = []
    taken: list[tuple[int, int]] = []

    def free(span: tuple[int, int]) -> bool:
        return all(span[1] <= a or span[0] >= b for a, b in taken)

    def add(match: re.Match, built: date | None) -> str | None:
        taken.append(match.span())
        if built is None:
            return f"'{match.group(0).strip()}' is not a real calendar day"
        stated.append(built)
        return None

    problem = None
    for match in _ISO.finditer(text):
        problem = problem or add(match, _build(int(match.group(1)), int(match.group(2)), int(match.group(3)), today))
    for match in _DAY_MONTH.finditer(text):
        if free(match.span()):
            year = int(match.group(3)) if match.group(3) else None
            problem = problem or add(match, _build(year, _month_number(match.group(2)), int(match.group(1)), today))
    for match in _MONTH_DAY.finditer(text):
        if free(match.span()):
            year = int(match.group(3)) if match.group(3) else None
            problem = problem or add(match, _build(year, _month_number(match.group(1)), int(match.group(2)), today))
    for match in _SLASH.finditer(text):
        if free(match.span()):
            year = int(match.group(3)) if match.group(3) else None
            if year is not None and year < 100:
                year += 2000
            problem = problem or add(match, _build(year, int(match.group(2)), int(match.group(1)), today))
    for match in _ORDINAL.finditer(text):
        if free(match.span()):
            day = int(match.group(1))
            built = _build(today.year, today.month, day, today) if day >= today.day else None
            if built is None:
                nxt_month = today.month % 12 + 1
                built = _build(today.year + (1 if today.month == 12 else 0), nxt_month, day, date(1, 1, 1))
            problem = problem or add(match, built)

    if any(word in text for word in _DAY_AFTER):
        stated.append(today + timedelta(days=2))
    elif any(word in text for word in _TOMORROW):
        stated.append(today + timedelta(days=1))
    elif any(re.search(rf"(?<![a-z]){word}(?![a-z])", text) if word.isascii() else word in text for word in _TODAY):
        stated.append(today)
    elif any(re.search(rf"(?<![a-z]){word}(?![a-z])", text) if word.isascii() else word in text for word in _KAL):
        return [], [], "'kal' can mean yesterday or tomorrow"

    days = weekdays_in(segment, abbr=True)
    if len(days) > 1:
        return stated, [], f"more than one weekday: {', '.join(sorted(days))}"
    if days:
        day = next(iter(days))
        if _NEXT.search(segment):
            first, second = _upcoming(day, today, skip_today=True), _upcoming(day, today, skip_today=True) + timedelta(days=7)
            # 'next Sunday' is not the same day to everyone, so it is never guessed.
            alts.extend([first, second])
        elif _upcoming(day, today) == today:
            alts.extend([today, today + timedelta(days=7)])
        else:
            stated.append(_upcoming(day, today))
    return stated, alts, problem


def read_date(text: str, today: date) -> DateRead:
    """Resolve a spoken or typed date against the server's today. Ambiguity is reported, never guessed."""
    for segment in reversed(segments(text)):
        stated, alts, problem = _segment_dates(segment, today)
        if problem:
            return DateRead("ambiguous", reason=problem)
        distinct = sorted(set(stated))
        if alts:
            first = ", ".join(d.strftime("%A %d %B") for d in alts)
            return DateRead("ambiguous", reason=f"Which day did you mean: {first}?")
        if len(distinct) > 1:
            return DateRead("ambiguous", reason="I heard more than one date: " + ", ".join(d.isoformat() for d in distinct))
        if distinct:
            if distinct[0] < today:
                return DateRead("ambiguous", reason=f"{distinct[0].isoformat()} has already passed.")
            return DateRead("ok", iso=distinct[0].isoformat())
    return DateRead("none")


_ORDINALS = {
    "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9,
    "tenth": 10, "eleventh": 11, "twelfth": 12, "thirteenth": 13, "fourteenth": 14, "fifteenth": 15, "sixteenth": 16,
    "seventeenth": 17, "eighteenth": 18, "nineteenth": 19, "twentieth": 20, "thirtieth": 30,
}


def _ordinal_days(text: str) -> set[float]:
    """'fifteenth', 'twenty fifth': day numbers said as ordinal words. Used only to ground a date, never as an amount."""
    tokens = [t[0].lower() for t in _tokens(text)]
    out: set[float] = set()
    for i, tok in enumerate(tokens):
        if tok in _ORDINALS:
            value = float(_ORDINALS[tok])
            if i and tokens[i - 1] in ("twenty", "thirty") and value < 10:
                value += NUMBER_WORDS[tokens[i - 1]]
            out.add(value)
    return out


def date_grounded(iso: str, text: str, today: date) -> bool:
    """A date is grounded only when the owner's words lead to it: a stated date, relative word, weekday, or day number."""
    try:
        target = date.fromisoformat(iso)
    except ValueError:
        return False
    for segment in segments(text):
        stated, alts, _ = _segment_dates(segment, today)
        if target in stated or target in alts:
            return True
    lowered = ascii_digits(text).lower()
    month_named = [m for m in re.findall(_MONTH_PAT, lowered)]
    if month_named and not any(_month_number(m) == target.month for m in month_named):
        return False
    return float(target.day) in numbers(text) or float(target.day) in _ordinal_days(text)


def number_grounded(value: float, text: str) -> bool:
    return any(abs(value - heard) <= 0.01 for heard in numbers(text))
