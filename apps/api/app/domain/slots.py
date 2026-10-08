"""Slot renderer: the model writes `{slots}`, code fills facts (docs/validator-and-scoring.md section 1).

Numbers are always Western digits in every script. Rendering returns the spans filled from facts so the
validator can search only the text OUTSIDE them for stray numbers, days, percentages and promises.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from .facts import SLOTS, OfferFacts
from .lexicon import AND, DAYS, MONTHS, PERIOD, TERMS

SLOT_RE = re.compile(r"\{([A-Za-z_]+)\}")

# Slots each fact field feeds, to decide which slots an asset can legitimately declare.
REQUIRED_FOR_FACT = {
    "item": "item", "discount": "discount", "price": "price", "days": "days", "time": "time", "terms": "terms",
}


@dataclass
class Rendered:
    text: str
    spans: list = field(default_factory=list)  # (start, end, slot)
    errors: list = field(default_factory=list)
    slots_used: list = field(default_factory=list)


def _join(items: list[str], lang: str) -> str:
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + f" {AND[lang]} " + items[-1]


def _hour12(h: int) -> int:
    return h % 12 or 12


def fmt_time(facts: OfferFacts, lang: str) -> str | None:
    if not (facts.time_from and facts.time_to):
        return None
    fh, fm = (int(x) for x in facts.time_from.split(":"))
    th, tm = (int(x) for x in facts.time_to.split(":"))

    def clock(h, m):
        return f"{_hour12(h)}" if m == 0 else f"{_hour12(h)}:{m:02d}"

    if lang == "en":
        a = "am" if fh < 12 else "pm"
        b = "am" if th < 12 else "pm"
        return f"{clock(fh, fm)} {a}–{clock(th, tm)} {b}" if a != b else f"{clock(fh, fm)}–{clock(th, tm)} {b}"
    p = PERIOD[lang]
    word = p["morning"] if fh < 12 else (p["afternoon"] if fh < 16 else p["evening"])
    suffix = f" {p['suffix']}" if p["suffix"] else ""
    return f"{word} {clock(fh, fm)}–{clock(th, tm)}{suffix}"


def fmt_dates(facts: OfferFacts, lang: str) -> str | None:
    if not facts.start_date:
        return None
    sy, sm, sd = (int(x) for x in facts.start_date.split("-"))
    if not facts.end_date or facts.end_date == facts.start_date:
        return f"{sd} {MONTHS[lang][sm - 1]}"
    ey, em, ed = (int(x) for x in facts.end_date.split("-"))
    if (ey, em) == (sy, sm):
        return f"{sd}–{ed} {MONTHS[lang][sm - 1]}"
    return f"{sd} {MONTHS[lang][sm - 1]}–{ed} {MONTHS[lang][em - 1]}"


def slot_value(slot: str, facts: OfferFacts, lang: str):
    """Text for a slot, or None when the lock has no value for it."""
    if slot == "item":
        return facts.item_i18n.get(lang) or facts.item
    if slot == "discount":
        return None if facts.discount_pct is None else f"{facts.discount_pct}%"
    if slot == "price":
        return None if facts.price_inr is None else f"₹{facts.price_inr}"
    if slot == "original_price":
        return None if facts.original_price_inr is None else f"₹{facts.original_price_inr}"
    if slot == "days":
        return _join([DAYS[lang][d] for d in facts.days], lang) if facts.days else None
    if slot == "dates":
        return fmt_dates(facts, lang)
    if slot == "time":
        return fmt_time(facts, lang)
    if slot == "terms":
        return "; ".join(TERMS[t][lang] for t in facts.terms) if facts.terms else None
    return None


def render(template: str, facts: OfferFacts, lang: str) -> Rendered:
    out, spans, errors, used = [], [], [], []
    pos = 0
    last = 0
    for m in SLOT_RE.finditer(template):
        out.append(template[last:m.start()])
        pos += m.start() - last
        slot = m.group(1)
        last = m.end()
        if slot not in SLOTS:
            errors.append(f"unknown slot {{{slot}}}")
            out.append(m.group(0))
            pos += len(m.group(0))
            continue
        val = slot_value(slot, facts, lang)
        if val is None:
            errors.append(f"slot {{{slot}}} has no value in the approved facts")
            out.append("")
            continue
        out.append(val)
        spans.append((pos, pos + len(val), slot))
        pos += len(val)
        if slot not in used:
            used.append(slot)
    out.append(template[last:])
    return Rendered("".join(out), spans, errors, used)


def slots_in(template: str) -> list[str]:
    seen = []
    for m in SLOT_RE.finditer(template):
        if m.group(1) not in seen:
            seen.append(m.group(1))
    return seen
