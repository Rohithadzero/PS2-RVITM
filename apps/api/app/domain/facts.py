"""Offer Facts: schema, arithmetic check, slot mapping, diff, dependency map (docs/data-model.md)."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from pydantic import BaseModel, Field, field_validator

from .lexicon import DAY_ORDER, TERMS

# fact field -> slot name used in templates and asset.facts_used
FIELD_TO_SLOT = {
    "item": "item",
    "discount_pct": "discount",
    "price_inr": "price",
    "original_price_inr": "original_price",
    "days": "days",
    "start_date": "dates",
    "end_date": "dates",
    "time_from": "time",
    "time_to": "time",
    "terms": "terms",
}
SLOTS = sorted(set(FIELD_TO_SLOT.values()))


class FactsError(ValueError):
    pass


class OfferFacts(BaseModel):
    item: str
    menu_item_id: Optional[str] = None
    item_i18n: dict[str, str] = Field(default_factory=dict)  # item name per language, in that script
    discount_pct: Optional[int] = None
    price_inr: Optional[int] = None
    original_price_inr: Optional[int] = None
    days: list[str] = Field(default_factory=list)
    start_date: Optional[str] = None  # YYYY-MM-DD
    end_date: Optional[str] = None
    time_from: Optional[str] = None  # HH:MM 24h
    time_to: Optional[str] = None
    terms: list[str] = Field(default_factory=list)
    exclusions: list[str] = Field(default_factory=list)
    allowed_claims: list[str] = Field(default_factory=list)  # phrases the owner explicitly allows (V7)

    @field_validator("days")
    @classmethod
    def _days(cls, v):
        bad = [d for d in v if d not in DAY_ORDER]
        if bad:
            raise ValueError(f"unknown days {bad}")
        return sorted(set(v), key=DAY_ORDER.index)

    @field_validator("terms")
    @classmethod
    def _terms(cls, v):
        bad = [t for t in v if t not in TERMS]
        if bad:
            raise ValueError(f"unknown terms {bad}; allowed: {sorted(TERMS)}")
        return sorted(set(v))

    @field_validator("discount_pct")
    @classmethod
    def _pct(cls, v):
        if v is not None and not (0 < v < 100):
            raise ValueError("discount_pct must be between 1 and 99")
        return v

    @field_validator("time_from", "time_to")
    @classmethod
    def _time(cls, v):
        if v is None:
            return v
        try:
            h, m = v.split(":")
            assert 0 <= int(h) < 24 and 0 <= int(m) < 60
        except Exception:
            raise ValueError("time must be HH:MM (24h)")
        return v


def expected_price(original: int, pct: int) -> int:
    """Whole rupees, half-up: 60 at 20% -> 48."""
    return int((Decimal(original) * (Decimal(100) - Decimal(pct)) / Decimal(100)).quantize(Decimal("1"), ROUND_HALF_UP))


def check_arithmetic(f: OfferFacts) -> list[str]:
    """Problems that must block approval of the lock. Empty = consistent."""
    problems = []
    if f.discount_pct is not None and f.original_price_inr is not None:
        want = expected_price(f.original_price_inr, f.discount_pct)
        if f.price_inr is None:
            problems.append(f"price_inr missing; {f.discount_pct}% off {f.original_price_inr} is {want}")
        elif f.price_inr != want:
            problems.append(f"price_inr {f.price_inr} does not match {f.discount_pct}% off {f.original_price_inr} (= {want})")
    if f.price_inr is not None and f.original_price_inr is not None and f.price_inr > f.original_price_inr:
        problems.append("price_inr is higher than original_price_inr")
    if (f.time_from is None) != (f.time_to is None):
        problems.append("time_from and time_to must both be set or both empty")
    if f.time_from and f.time_to and f.time_from >= f.time_to:
        problems.append("time_to must be after time_from")
    if f.start_date and f.end_date and f.start_date > f.end_date:
        problems.append("end_date is before start_date")
    return problems


def validate_facts(raw: dict) -> OfferFacts:
    try:
        return OfferFacts(**raw)
    except Exception as e:  # pydantic ValidationError
        raise FactsError(str(e))


def diff_facts(old: dict | None, new: dict) -> list[str]:
    """Fact field names whose value differs."""
    old = old or {}
    return [k for k in FIELD_TO_SLOT if old.get(k) != new.get(k)]


def changed_slots(old: dict | None, new: dict) -> set[str]:
    out = {FIELD_TO_SLOT[k] for k in diff_facts(old, new)}
    if (old or {}).get("item") != new.get("item"):
        out |= set(SLOTS)  # a different product changes everything
    return out


def blast_radius(assets: list[dict], slots: set[str]) -> dict:
    """assets: rows with id, facts_used (list), status. An asset is affected if it uses a changed slot."""
    changed, frozen = [], []
    for a in assets:
        used = set(a["facts_used"])
        (changed if used & slots else frozen).append(a["id"])
    return {"changed": changed, "frozen": frozen}
