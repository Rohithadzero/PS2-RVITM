from __future__ import annotations

import calendar
import re
from datetime import date

MONTHS: dict[str, int] = {}
for _index, _name in enumerate(calendar.month_name):
    if not _name:
        continue
    MONTHS[_name.lower()] = _index
    MONTHS[_name.lower()[:3]] = _index

ISO_RE = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
DAY_MONTH_RE = re.compile(
    r"\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})\b",
    re.IGNORECASE,
)
MONTH_DAY_RE = re.compile(
    r"\b([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b",
    re.IGNORECASE,
)


def _iso(year: int, month: int, day: int) -> str | None:
    try:
        return date(year, month, day).isoformat()
    except ValueError:
        return None


def parse_date_token(value: str) -> str | None:
    text = value.strip()
    iso = ISO_RE.fullmatch(text)
    if iso:
        return _iso(int(iso.group(1)), int(iso.group(2)), int(iso.group(3)))
    long = DAY_MONTH_RE.fullmatch(text)
    if long:
        month = MONTHS.get(long.group(2).lower())
        if month:
            return _iso(int(long.group(3)), month, int(long.group(1)))
    month_first = MONTH_DAY_RE.fullmatch(text)
    if month_first:
        month = MONTHS.get(month_first.group(1).lower())
        if month:
            return _iso(int(month_first.group(3)), month, int(month_first.group(2)))
    return None


def require_iso_date(value: str) -> str:
    parsed = parse_date_token(value)
    if not parsed:
        raise ValueError(f"unrecognized date: {value}")
    return parsed


def dates_in_text(content: str) -> tuple[list[str], list[str]]:
    found: list[str] = []
    invalid: list[str] = []

    def take(year: int, month: int, day: int, label: str) -> None:
        parsed = _iso(year, month, day)
        if parsed is None:
            invalid.append(label)
        elif parsed not in found:
            found.append(parsed)

    for match in ISO_RE.finditer(content):
        take(int(match.group(1)), int(match.group(2)), int(match.group(3)), match.group(0))
    for match in DAY_MONTH_RE.finditer(content):
        month = MONTHS.get(match.group(2).lower())
        if month:
            take(int(match.group(3)), month, int(match.group(1)), match.group(0))
    for match in MONTH_DAY_RE.finditer(content):
        month = MONTHS.get(match.group(1).lower())
        if month:
            take(int(match.group(3)), month, int(match.group(2)), match.group(0))
    return found, invalid
