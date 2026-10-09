"""scheduler: send an approved email at a chosen time, or remind the owner to post by hand.

Two kinds of item:
  email     a cold_email asset sent through the normal send path (same SMTP, same consent filter) when the time comes
  reminder  for posts the owner makes by hand (Instagram, poster, WhatsApp). Nothing is sent; the item shows as "due" until marked done

Safety, because a send happens when nobody is watching:
  - only approved assets can be scheduled, and the words are fingerprinted at schedule time. If the asset was edited or un-approved
    since, the send is skipped and says why, instead of sending different words from the ones the owner agreed to
  - customers are chosen by the consent filter at SEND time, so someone who withdrew consent in between is not emailed
  - an item that is more than a day late (the server was off) is marked missed, not sent
  - each item is claimed with a single UPDATE, so two overlapping runs cannot send it twice
The loop runs inside the app process (start-up hook, one tick every 30 seconds). It does not run in tests; they call run_due directly.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app import connections, outreach
from app.db import Database
from app.media import asset_or_404, fail

router = APIRouter()

TICK_SECONDS = 30
MISSED_AFTER = timedelta(hours=24)
MAX_AHEAD = timedelta(days=180)
MAX_PENDING = 100
SCHEMA = """
CREATE TABLE IF NOT EXISTS scheduled_item (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  run_at TEXT NOT NULL,
  status TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  note TEXT,
  result TEXT,
  claim TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_item(status, run_at);
CREATE INDEX IF NOT EXISTS idx_sched_owner ON scheduled_item(owner, run_at);
"""


def ensure_schema(db: Database) -> None:
    for stmt in SCHEMA.split(";"):
        if stmt.strip():
            db.execute(stmt)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat(timespec="seconds")


def fingerprint(asset: dict[str, Any]) -> str:
    return hashlib.sha256(json.dumps([asset.get("content"), asset.get("extra"), asset.get("status")], sort_keys=True, default=str).encode()).hexdigest()[:24]


def _view(row: dict[str, Any], now: datetime | None = None) -> dict[str, Any]:
    now = now or _now()
    status = row["status"]
    if status == "pending" and datetime.fromisoformat(row["run_at"]) <= now:
        status = "due" if row["kind"] == "reminder" else "pending"
    ist = datetime.fromisoformat(row["run_at"]).astimezone(timezone(timedelta(hours=5, minutes=30)))
    return {"id": row["id"], "asset_id": row["asset_id"], "kind": row["kind"], "run_at": row["run_at"], "status": status, "note": row["note"],
            "result": json.loads(row["result"]) if row["result"] else None, "label": ist.strftime("%a %d %b, %I:%M %p").replace(" 0", " ") + " IST"}


# ---------------------------------------------------------------- the work

async def run_one(db: Database, row: dict[str, Any]) -> dict[str, Any]:
    """Do one claimed item. Returns the result to store; never raises."""
    try:
        asset = db.asset_get(row["asset_id"])
        if asset is None:
            return {"status": "skipped", "reason": "The asset no longer exists."}
        if asset["status"] != "approved" or fingerprint(asset) != row["fingerprint"]:
            return {"status": "skipped", "reason": "The asset was edited or un-approved after it was scheduled, so nothing was sent. Schedule it again."}
        payload = json.loads(row["payload"] or "{}")
        pick = payload.get("customers")
        body = outreach.SendEmailIn(customers=outreach.CustomerPick(**pick)) if pick is not None else None
        res = await outreach.send_email_core(db, row["asset_id"], body, row["owner"])
        return {"status": "sent" if res["sent"] else "failed", "sent": res["sent"], "failed": res["failed"][:20],
                "reason": None if res["sent"] else "Nothing was delivered."}
    except Exception as exc:  # a scheduled send must report, not crash the loop
        detail = getattr(exc, "detail", None)
        message = detail.get("message") if isinstance(detail, dict) else None
        return {"status": "failed", "reason": message or f"{type(exc).__name__}: {str(exc)[:160]}"}


async def run_due(db: Database, now: datetime | None = None) -> int:
    """Claim and run every email due now. Returns how many items were handled."""
    now = now or _now()
    rows = db.query("SELECT id FROM scheduled_item WHERE kind = 'email' AND status = 'pending' AND run_at <= ? ORDER BY run_at LIMIT 20", (_iso(now),))
    handled = 0
    for r in rows:
        token = uuid.uuid4().hex
        db.execute("UPDATE scheduled_item SET status = 'running', claim = ?, updated_at = ? WHERE id = ? AND status = 'pending'", (token, _iso(now), r["id"]))
        row = db.query_one("SELECT * FROM scheduled_item WHERE id = ? AND claim = ?", (r["id"], token))
        if row is None:
            continue  # another run claimed it first
        if now - datetime.fromisoformat(row["run_at"]) > MISSED_AFTER:
            result = {"status": "missed", "reason": "The app was not running within a day of the time, so it was not sent."}
        else:
            result = await run_one(db, row)
        db.execute("UPDATE scheduled_item SET status = ?, result = ?, updated_at = ? WHERE id = ?",
                   (result["status"], json.dumps(result, ensure_ascii=False), _iso(_now()), row["id"]))
        handled += 1
    return handled


async def loop(app) -> None:
    while True:
        try:
            await run_due(app.state.db)
        except Exception:
            pass  # next tick tries again
        await asyncio.sleep(TICK_SECONDS)


@asynccontextmanager
async def lifespan(app):
    """Runs the loop for as long as the app is up. Off with SCHEDULER=off. TestClient only runs this inside a `with` block."""
    task = None
    if (os.environ.get("SCHEDULER") or "").lower() != "off":
        task = asyncio.create_task(loop(app))
    try:
        yield
    finally:
        if task:
            task.cancel()


# ---------------------------------------------------------------- routes

class ScheduleIn(BaseModel):
    kind: str = Field(pattern="^(email|reminder)$")
    at: str = Field(max_length=40)
    note: str | None = Field(default=None, max_length=300)
    customers: outreach.CustomerPick | None = None


def _parse_when(text: str) -> datetime:
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        raise fail("bad_time", "Give the time as an ISO date with a time zone, like 2026-10-12T19:00:00+05:30.", 422)
    if dt.tzinfo is None:
        raise fail("bad_time", "The time needs a time zone, like +05:30 for India.", 422)
    now = _now()
    if dt <= now + timedelta(minutes=1):
        raise fail("in_the_past", "Pick a time in the future.", 422)
    if dt > now + MAX_AHEAD:
        raise fail("too_far", "Schedule at most 180 days ahead.", 422)
    return dt


@router.post("/assets/{asset_id}/schedule")
def schedule(asset_id: str, body: ScheduleIn, request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    asset = asset_or_404(db, asset_id)
    outreach.require_approved(asset)
    if body.kind == "email" and asset["channel"] != "cold_email":
        raise fail("not_email", "Only email assets can be scheduled to send. Use a reminder for posts you make by hand.", 400)
    when = _parse_when(body.at)
    if db.query_one("SELECT COUNT(*) AS n FROM scheduled_item WHERE owner = ? AND status = 'pending'", (owner,))["n"] >= MAX_PENDING:
        raise fail("too_many", f"At most {MAX_PENDING} items can wait at once. Cancel some first.", 409)
    if body.kind == "email" and outreach.smtp_settings() is None:
        raise fail("smtp_not_configured", "Email sending is not set up on the server (SMTP), so it cannot be sent later. Use a reminder instead.", 409)
    item_id = uuid.uuid4().hex[:12]
    stamp = _iso(_now())
    payload = {"customers": body.customers.model_dump()} if body.customers is not None else {}
    db.execute("INSERT INTO scheduled_item (id, owner, asset_id, kind, run_at, status, fingerprint, payload, note, created_at, updated_at) "
               "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)",
               (item_id, owner, asset_id, body.kind, _iso(when), fingerprint(asset), json.dumps(payload), (body.note or "").strip() or None, stamp, stamp))
    return _view(db.query_one("SELECT * FROM scheduled_item WHERE id = ?", (item_id,)))


@router.get("/schedule")
def listing(request: Request, status: str | None = None) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    rows = db.query("SELECT * FROM scheduled_item WHERE owner = ? ORDER BY run_at DESC LIMIT 300", (owner,))
    items = [_view(r) for r in rows]
    if status:
        items = [i for i in items if i["status"] == status]
    items.sort(key=lambda i: i["run_at"])
    return {"items": items, "counts": {s: sum(1 for i in items if i["status"] == s) for s in ("pending", "due", "sent", "failed", "skipped", "missed", "done", "cancelled")}}


def _mine(db: Database, owner: str, item_id: str) -> dict[str, Any]:
    row = db.query_one("SELECT * FROM scheduled_item WHERE id = ? AND owner = ?", (item_id, owner))
    if row is None:
        raise fail("not_found", "No scheduled item with that id.", 404)
    return row


@router.delete("/schedule/{item_id}")
def cancel(item_id: str, request: Request) -> dict:
    db: Database = request.app.state.db
    row = _mine(db, connections._require_owner(request), item_id)
    if row["status"] != "pending":
        raise fail("not_pending", "Only items still waiting can be cancelled.", 409)
    db.execute("UPDATE scheduled_item SET status = 'cancelled', updated_at = ? WHERE id = ? AND status = 'pending'", (_iso(_now()), item_id))
    return _view(db.query_one("SELECT * FROM scheduled_item WHERE id = ?", (item_id,)))


@router.post("/schedule/{item_id}/done")
def done(item_id: str, request: Request) -> dict:
    db: Database = request.app.state.db
    row = _mine(db, connections._require_owner(request), item_id)
    if row["kind"] != "reminder" or row["status"] != "pending":
        raise fail("not_pending", "Only a waiting reminder can be marked done.", 409)
    db.execute("UPDATE scheduled_item SET status = 'done', updated_at = ? WHERE id = ?", (_iso(_now()), item_id))
    return _view(db.query_one("SELECT * FROM scheduled_item WHERE id = ?", (item_id,)))
