"""scout: timing notes from occasions, before the owner locks the plan.

What it knows: a short calendar of fixed-date occasions that fall on the same day every year, plus any local events the owner
adds (a college fest, a match, exam week). Occasions whose date moves each year (Diwali, Ugadi, Eid, Pongal and similar) are
deliberately NOT built in: the app cannot work them out reliably, so the owner adds them. It does not look at competitors or the
web. It says so. Output is advice to read, never an action.
"""
from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app import plan
from app.db import Database
from app.media import fail
from app.service import now

router = APIRouter()

SCHEMA = """
CREATE TABLE IF NOT EXISTS local_event (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  start TEXT NOT NULL,
  end TEXT NOT NULL,
  created_at TEXT NOT NULL
);
"""
# (month, day, name, audiences it suits). Fixed-date only.
FIXED = (
    (1, 1, "New Year's Day", ("regulars", "families")),
    (1, 26, "Republic Day", ("families", "nearby_residents")),
    (2, 14, "Valentine's Day", ("students", "office_workers")),
    (3, 8, "International Women's Day", ("regulars", "office_workers")),
    (5, 1, "Labour Day", ("office_workers", "families")),
    (8, 15, "Independence Day", ("families", "nearby_residents")),
    (9, 5, "Teachers' Day", ("students",)),
    (10, 2, "Gandhi Jayanti", ("families", "nearby_residents")),
    (11, 1, "Kannada Rajyotsava", ("families", "regulars", "nearby_residents")),
    (11, 14, "Children's Day", ("families",)),
    (12, 25, "Christmas", ("families", "tourists")),
)
HORIZON_DAYS = 75
LEAD_DAYS = 14


class EventIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")
    end: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")


def ensure_schema(db: Database) -> None:
    db.ensure(SCHEMA)


def occasions(today: date, horizon: int = HORIZON_DAYS) -> list[dict[str, Any]]:
    out = []
    for year in (today.year, today.year + 1):
        for month, day, name, auds in FIXED:
            d = date(year, month, day)
            if today <= d <= today + timedelta(days=horizon):
                out.append({"name": name, "start": d.isoformat(), "end": d.isoformat(), "kind": "fixed", "audiences": list(auds)})
    return out


def _parse(value: str) -> date | None:
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def advise(window: tuple[date, date] | None, audiences: list[str], events: list[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    """Pure: one note per event near the offer window (or near today when no dates are set)."""
    notes = []
    for e in events:
        es, ee = _parse(e["start"]), _parse(e["end"])
        if es is None or ee is None:
            continue
        fits = bool(set(e.get("audiences") or []) & set(audiences)) or e["kind"] == "owner"
        if window:
            ws, we = window
            if es <= we and ee >= ws:
                note, tone = f"{e['name']} falls inside your offer window. Mention it in the copy to make the offer feel timely.", "overlap"
            elif ws - timedelta(days=LEAD_DAYS) <= ee < ws:
                gap = (ws - ee).days
                note, tone = f"{e['name']} is {gap} day(s) before your offer starts. A teaser around it could build interest.", "teaser"
            elif we < es <= we + timedelta(days=LEAD_DAYS):
                gap = (es - we).days
                note, tone = f"{e['name']} starts {gap} day(s) after your offer ends. Consider extending to catch the footfall.", "extend"
            else:
                continue
        else:
            if not 0 <= (es - today).days <= 30:
                continue  # already past, or too far off to plan around
            note, tone = f"{e['name']} is coming up on {e['start']}. Set your offer dates around it if it suits your customers.", "upcoming"
        notes.append({**{k: e[k] for k in ("name", "start", "end", "kind")}, "note": note, "tone": tone, "suits_audience": fits})
    return sorted(notes, key=lambda n: n["start"])


def _owner_events(db: Database) -> list[dict[str, Any]]:
    return [{"id": r["id"], "name": r["name"], "start": r["start"], "end": r["end"], "kind": "owner", "audiences": []}
            for r in db.query("SELECT * FROM local_event ORDER BY start")]


@router.get("/campaign/{campaign_id}/scout")
def scout(campaign_id: str, request: Request) -> dict:
    db: Database = request.app.state.db
    if db.campaign_get(campaign_id) is None:
        raise fail("not_found", "No campaign with that id.", 404)
    data = plan.get_plan(db, campaign_id)
    today = date.today()
    dates = [d for d in (_parse(x) for x in (data["offer_facts"]["dates"] if data else [])) if d]
    window = (min(dates), max(dates)) if dates else None
    events = occasions(today, HORIZON_DAYS + (max((window[1] - today).days, 0) if window else 0)) + _owner_events(db)
    return {"window": [d.isoformat() for d in window] if window else None, "notes": advise(window, (data or {}).get("audiences", []), events, today),
            "owner_events": _owner_events(db),
            "sources": "A short calendar of fixed-date occasions plus events you add. Moving festivals such as Diwali, Ugadi or Eid are not built in: add them below.",
            "not_connected": ["competitor posts", "web search", "a live events feed"]}


@router.post("/scout/events")
def add_event(body: EventIn, request: Request) -> dict:
    s, e = _parse(body.start), _parse(body.end or body.start)
    if s is None or e is None or e < s:
        raise fail("bad_dates", "Use real dates, with the end on or after the start.", 422)
    db: Database = request.app.state.db
    eid = uuid.uuid4().hex
    db.execute("INSERT INTO local_event (id, name, start, end, created_at) VALUES (?, ?, ?, ?, ?)", (eid, body.name.strip(), s.isoformat(), e.isoformat(), now()))
    return {"id": eid, "name": body.name.strip(), "start": s.isoformat(), "end": e.isoformat()}


@router.delete("/scout/events/{event_id}")
def delete_event(event_id: str, request: Request) -> dict:
    request.app.state.db.execute("DELETE FROM local_event WHERE id = ?", (event_id,))
    return {"deleted": True}
