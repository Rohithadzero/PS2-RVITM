"""plan: the campaign plan built only from the owner's interview answers, plus its deterministic schedule."""
from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, HTTPException, Request

from app.config import CHANNELS
from app.db import Database
from app.schemas import OfferFacts
from app.service import Service, ServiceError, now
from app import speech
from app.speech import days_phrase
from app.validator import locked_days

router = APIRouter()

SCHEMA = """
CREATE TABLE IF NOT EXISTS plan (
  campaign_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"""

GOAL_LABELS = {
    "more_walkins": "More walk-ins",
    "promote_offer": "Promote an offer",
    "launch_product": "Launch a product",
    "announce_opening": "Announce an opening",
    "grow_followers": "Grow followers",
}
BOGO_TERMS = "Buy one get one free."
REMINDER_CHANNELS = ("instagram_story", "whatsapp")


def ensure_schema(db: Database) -> None:
    # asset.extra holds the per-channel fields (subject, title, headline, hashtags, button, script).
    db.ensure(SCHEMA, columns=(("asset", "extra", "TEXT"),))


def facts_from_fields(fields: dict[str, dict[str, Any]]) -> tuple[OfferFacts, dict[str, str]]:
    """Offer Facts from interview fields only. Returns the facts and which answer each fact came from."""

    def value(name: str) -> Any:
        return (fields.get(name) or {}).get("value")

    def source(name: str) -> str | None:
        return (fields.get(name) or {}).get("answer_id")

    sources: dict[str, str] = {}
    offer_type = value("offer_type")
    if value("offer_item"):
        item, sources["item"] = value("offer_item"), source("offer_item")
    else:
        # A follower campaign with no offer has no item; the business name is the only thing it can be about.
        item, sources["item"] = value("business_name"), source("business_name")
    percent = value("discount_percent") if offer_type == "percent_off" else None
    price = None
    if offer_type == "fixed_price":
        price = value("price_amount")
    elif offer_type == "free_item":
        price = 0.0
    if percent is not None:
        sources["discount_percent"] = source("discount_percent")
    if offer_type == "fixed_price":
        sources["price_amount"] = source("price_amount")
    elif offer_type == "free_item":
        sources["price_amount"] = source("offer_type")
    dates = [d for d in (value("start_date"), value("end_date")) if d]
    sources["dates"] = source("start_date")
    timings = days_phrase(value("days") or ["every_day"]) if value("days") else None
    if timings:
        sources["timings"] = source("days")
        if value("time_window"):
            timings = f"{timings}, {value('time_window')}"
    terms_parts = []
    if offer_type == "buy_one_get_one":
        terms_parts.append(BOGO_TERMS)
        sources["terms"] = source("offer_type")
    if value("terms"):
        terms_parts.append(value("terms"))
        sources["terms"] = source("terms")
    facts = OfferFacts(
        item=item,
        discount_percent=percent,
        price_amount=price,
        dates=dates,
        timings=timings,
        terms=" ".join(terms_parts) or None,
        audiences=value("audiences") or [],
        languages=value("languages") or [],
        channels=value("channels") or [],
    )
    for name in ("audiences", "languages", "channels"):
        sources[name] = source(name)
    return facts, sources


def build_data(fields: dict[str, dict[str, Any]], answers: list[dict[str, Any]], facts_sources: dict[str, str]) -> dict[str, Any]:
    """The stored half of the plan: everything that is not derived from the live Offer Facts."""

    def value(name: str) -> Any:
        return (fields.get(name) or {}).get("value")

    def source(name: str) -> str | None:
        return (fields.get(name) or {}).get("answer_id")

    cta = value("cta") or {}
    return {
        "business": {"name": value("business_name"), "type": value("business_type"), "area": value("area")},
        "goal": {"value": value("goal"), "label": GOAL_LABELS.get(value("goal"), value("goal")), "source_answer_id": source("goal")},
        "facts_sources": facts_sources,
        "tone": value("tone"),
        "time_window": value("time_window"),
        "cta": {**cta, "source_answer_id": source("cta")},
        "email_recipients": value("email_recipients") or [],
        "sources": {
            name: source(name)
            for name in (
                "business_name", "business_type", "area", "goal", "audiences", "languages", "channels",
                "tone", "cta", "email_recipients", "start_date", "end_date", "days", "time_window",
            )
            if source(name)
        },
        "answers": answers,
    }


def store(db: Database, campaign_id: str, data: dict[str, Any]) -> None:
    stamp = now()
    db.execute(
        "INSERT INTO plan (campaign_id, data, created_at, updated_at) VALUES (?, ?, ?, ?) "
        "ON CONFLICT(campaign_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        (campaign_id, json.dumps(data, ensure_ascii=False), stamp, stamp),
    )


def build_schedule(facts: OfferFacts) -> list[dict[str, Any]]:
    """Dated rows from documented rules. Each row names the rule that produced it; nothing is generated."""
    if not facts.dates:
        return []
    start, end = date.fromisoformat(min(facts.dates)), date.fromisoformat(max(facts.dates))
    chosen = [c for c in CHANNELS if c in facts.channels]
    offer_days = locked_days(facts)
    rows: list[dict[str, Any]] = []

    def add(day: date, channel: str, purpose: str, rule: str) -> None:
        rows.append({"date": day.isoformat(), "weekday": day.strftime("%A"), "channel": channel, "purpose": purpose, "rule": rule})

    for channel in chosen:
        if channel in REMINDER_CHANNELS:
            add(start - timedelta(days=1), channel, "teaser", "teaser: the day before start_date, instagram_story and whatsapp")
    for channel in chosen:
        add(start, channel, "launch", "launch: start_date, every chosen channel once")
    day = start + timedelta(days=1)
    while day < end:
        if not offer_days or day.strftime("%A").lower() in offer_days:
            for channel in chosen:
                if channel in REMINDER_CHANNELS:
                    add(day, channel, "reminder", "reminder: each offer day inside the window, instagram_story and whatsapp")
        day += timedelta(days=1)
    if end > start:
        for channel in chosen:
            if channel in REMINDER_CHANNELS:
                add(end, channel, "last_day", "last_day: end_date when the window is longer than one day")
    order = {channel: index for index, channel in enumerate(CHANNELS)}
    rows.sort(key=lambda row: (row["date"], order[row["channel"]]))
    return rows


_WORD_HOURS = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9,
               "ten": 10, "eleven": 11, "twelve": 12, "noon": 12}
_CLOCK = r"(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?"
_RANGE_RE = re.compile(_CLOCK + r"\s*(?:to|till|until|-|\u2013|se|tak)\s*" + _CLOCK, re.IGNORECASE)


def parse_time_window(text: str | None) -> tuple[str | None, str | None]:
    """'9am to 1pm' -> ('09:00', '13:00'). Anything not clearly two clock times gives (None, None); nothing is guessed."""
    if not text:
        return None, None
    low = speech.ascii_digits(text).lower()
    low = re.sub(r"\b(" + "|".join(_WORD_HOURS) + r")\b", lambda m: str(_WORD_HOURS[m.group(1)]), low)
    found = _RANGE_RE.findall(low)
    if len(found) != 1:
        return None, None
    h1, m1, ap1, h2, m2, ap2 = found[0]
    h1, h2 = int(h1), int(h2)
    ap1, ap2 = ap1[:1], ap2[:1]
    if not (0 <= h1 <= 24 and 0 <= h2 <= 24):
        return None, None
    morning = "morning" in low
    evening = any(w in low for w in ("evening", "afternoon", "night"))
    if h1 > 12 or h2 > 12:
        pass  # already 24 hour
    elif ap1 and ap2:
        pass
    elif ap2 or ap1:
        # The unmarked side shares the marker unless that would put the start after the end; then it flips.
        other = "p" if (ap1 or ap2) == "a" else "a"
        for unmarked in ("start" if not ap1 else "end",):
            same = (ap1 or ap2)
            h24 = lambda h, m: (h % 12) + (12 if m == "p" else 0)
            if unmarked == "start":
                ap1 = same if h24(h1, same) <= h24(h2, ap2) else other
            else:
                ap2 = same if h24(h2, same) >= h24(h1, ap1) else other
    elif h2 < h1 or (h1 < 12 and h2 == 12):
        ap1, ap2 = "a", "p"
    elif morning:
        ap1 = ap2 = "a"
    elif evening:
        ap1 = ap2 = "p"
    else:
        return None, None

    def clock(hour: int, minute: str, marker: str) -> str:
        if marker == "p" and hour < 12:
            hour += 12
        if marker == "a" and hour == 12:
            hour = 0
        return f"{hour % 24:02d}:{minute or '00'}"

    return clock(h1, m1, ap1), clock(h2, m2, ap2)


def offer_window(facts: OfferFacts, time_window_text: str | None) -> dict[str, Any]:
    """Days, dates and clock times for the poster overlay, from the owner's answers only."""
    days = [d[:3] for d in locked_days_in_order(facts)]
    start, end = (min(facts.dates), max(facts.dates)) if facts.dates else (None, None)
    t_start, t_end = parse_time_window(time_window_text)
    return {"days": days, "start_date": start, "end_date": end if end != start else None, "time_start": t_start, "time_end": t_end}


def locked_days_in_order(facts: OfferFacts) -> list[str]:
    """The locked weekdays in week order. An every-day offer locks none, so it is all seven."""
    locked = locked_days(facts)
    names = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
    return [d for d in names if d in locked] or list(names)


def _facts_row(db: Database, campaign_id: str) -> tuple[dict[str, Any] | None, bool]:
    approved = db.facts_approved(campaign_id)
    if approved:
        return approved, True
    return db.facts_latest(campaign_id), False


def get_plan(db: Database, campaign_id: str) -> dict | None:
    """Contract for other modules: the campaign plan (see PLAN.md, Plan object), or None.

    Offer facts, audiences, languages, channels and the schedule are read from the newest facts,
    so a change by voice shows up here without a second copy to keep in step.
    """
    row = db.query_one("SELECT data FROM plan WHERE campaign_id = ?", (campaign_id,))
    if row is None:
        return None
    facts_row, locked = _facts_row(db, campaign_id)
    if facts_row is None:
        return None
    data = json.loads(row["data"])
    facts = OfferFacts.model_validate_json(facts_row["json"])
    return {
        "campaign_id": campaign_id,
        "status": "locked" if locked else "draft",
        "business": data["business"],
        "goal": data["goal"],
        "offer_facts": facts.model_dump(),
        "facts_sources": data["facts_sources"],
        "audiences": facts.audiences,
        "languages": facts.languages,
        "channels": facts.channels,
        "tone": data["tone"],
        "cta": data["cta"],
        "email_recipients": data["email_recipients"],
        "offer_window": offer_window(facts, data.get("time_window")),
        "schedule": build_schedule(facts),
        "sources": data["sources"],
        "answers": data["answers"],
    }


def copy_context(db: Database, campaign_id: str) -> dict[str, Any] | None:
    """The only plan values a copy prompt may see besides the Offer Facts."""
    row = db.query_one("SELECT data FROM plan WHERE campaign_id = ?", (campaign_id,))
    if row is None:
        return None
    data = json.loads(row["data"])
    cta = data.get("cta") or {}
    return {
        "business_name": data["business"]["name"],
        "area": data["business"]["area"],
        "tone": data["tone"],
        "cta": {"kind": cta.get("kind"), "value": cta.get("value")} if cta.get("value") else None,
    }


def time_window(db: Database, campaign_id: str) -> str | None:
    row = db.query_one("SELECT data FROM plan WHERE campaign_id = ?", (campaign_id,))
    return json.loads(row["data"]).get("time_window") if row else None


def _guard(call):
    try:
        return call()
    except ServiceError as exc:
        raise HTTPException(status_code=exc.status, detail={"code": exc.code, "message": exc.message}) from exc


def _not_found() -> HTTPException:
    return HTTPException(status_code=404, detail={"code": "plan_not_found", "message": "This campaign has no plan."})


@router.get("/campaign/{campaign_id}/plan")
def read_plan(campaign_id: str, request: Request) -> dict:
    plan = get_plan(request.app.state.db, campaign_id)
    if plan is None:
        raise _not_found()
    return plan


@router.post("/campaign/{campaign_id}/plan/approve")
def approve_plan(campaign_id: str, request: Request) -> dict:
    db = request.app.state.db
    if get_plan(db, campaign_id) is None:
        raise _not_found()
    _guard(lambda: Service(db).approve_latest(campaign_id))
    plan = get_plan(db, campaign_id)
    if plan is None:
        raise _not_found()
    return plan
