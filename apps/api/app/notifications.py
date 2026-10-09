"""notifications: what happened that the owner should know about, in one place behind the name chip at the top right.

Two parts:
  suggestions  what GrowIT noticed and wants a yes or no on (from memory). They come from the memory table, not from here.
  activity     things that happened: someone tapped Order on the website, an Instagram post gained likes, comments, saves or shares,
               a scheduled email went out or failed, a reminder is due, a customer unsubscribed.

Every activity line is something the server actually saw. An "order" is a tap on the website's Order on WhatsApp button, counted when
the visitor passes through the site's own link; GrowIT cannot see whether they then sent the message, and the line says so.
Producers call notify(); the same key never creates a second line, so a retry or a refresh cannot double-count.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

from app import connections, memory
from app.db import Database
from app.media import fail

router = APIRouter()

SCHEMA = """
CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  page TEXT,
  dedupe_key TEXT,
  ts TEXT NOT NULL,
  read_at TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_key ON notification(owner, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_owner ON notification(owner, ts);
"""
KINDS = ("order", "engagement", "schedule", "customer", "system")
KEEP = 200  # newest lines kept per owner
SYNC_AFTER_SECONDS = 600  # opening the list refreshes Instagram at most this often


def ensure_schema(db: Database) -> None:
    db.ensure(SCHEMA)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def notify(db: Database, owner: str, kind: str, title: str, body: str = "", page: str | None = None, key: str | None = None) -> bool:
    """Add one line. Returns False when the same key already exists (nothing was added)."""
    if key and db.query_one("SELECT 1 AS x FROM notification WHERE owner = ? AND dedupe_key = ?", (owner, key)):
        return False
    db.execute("INSERT INTO notification (id, owner, kind, title, body, page, dedupe_key, ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
               (uuid.uuid4().hex[:12], owner, kind, title[:140], body[:400], page, key, _now()))
    db.execute("DELETE FROM notification WHERE owner = ? AND id NOT IN (SELECT id FROM notification WHERE owner = ? ORDER BY ts DESC LIMIT ?)", (owner, owner, KEEP))
    return True


def engagement_change(old: list[dict[str, Any]], new: list[dict[str, Any]]) -> dict[str, Any] | None:
    """What the owner's Instagram posts gained between two reads. Only posts present in both reads are compared."""
    before = {m.get("id"): m for m in old or []}
    gained = {"likes": 0, "comments": 0, "shares": 0, "saved": 0}
    top, top_gain = None, 0
    for m in new or []:
        o = before.get(m.get("id"))
        if not o:
            continue
        gain = 0
        for k in gained:
            d = (m.get(k) or 0) - (o.get(k) or 0)
            if d > 0:
                gained[k] += d
                gain += d
        if gain > top_gain:
            top, top_gain = m, gain
    if not any(gained.values()):
        return None
    return {**gained, "top": (top.get("caption") or "A recent post")[:60] if top else None}


def notify_engagement(db: Database, owner: str, old: list[dict[str, Any]], new: list[dict[str, Any]], stamp: str) -> None:
    change = engagement_change(old, new)
    if not change:
        return
    bits = [f"+{change[k]} {label}" for k, label in (("likes", "likes"), ("comments", "comments"), ("shares", "shares"), ("saved", "saves")) if change[k]]
    notify(db, owner, "engagement", "Your Instagram posts got more attention", ", ".join(bits) + (f". Most on: {change['top']}" if change["top"] else ""), "insights", f"ig:{stamp}")


# ---------------------------------------------------------------- the feed

def _due_reminders(db: Database, owner: str) -> None:
    now = _now()
    for r in db.query("SELECT id, note, asset_id FROM scheduled_item WHERE owner = ? AND kind = 'reminder' AND status = 'pending' AND run_at <= ?", (owner, now)):
        notify(db, owner, "schedule", "Time to post", r["note"] or "A reminder you set is due.", "campaign", f"reminder:{r['id']}")
    for r in db.query("SELECT id, status, result FROM scheduled_item WHERE owner = ? AND kind = 'email' AND status IN ('sent', 'failed', 'skipped', 'missed')", (owner,)):
        res = json.loads(r["result"]) if r["result"] else {}
        title = {"sent": f"Scheduled email sent to {res.get('sent', 0)}", "failed": "A scheduled email failed", "skipped": "A scheduled email was not sent", "missed": "A scheduled email was missed"}[r["status"]]
        notify(db, owner, "schedule", title, res.get("reason") or "", "campaign", f"email:{r['id']}")


def _unsubscribes(db: Database, owner: str) -> None:
    for r in db.query("SELECT c.id, c.name, s.ts FROM customer c JOIN email_suppression s ON lower(c.email) = s.email WHERE c.owner = ?", (owner,)):
        notify(db, owner, "customer", f"{r['name']} unsubscribed", "They will not be emailed again.", "customers", f"unsub:{r['id']}")


@router.get("/notifications")
def feed(request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    _due_reminders(db, owner)
    _unsubscribes(db, owner)
    rows = db.query("SELECT * FROM notification WHERE owner = ? ORDER BY ts DESC LIMIT 40", (owner,))
    suggested = db.query("SELECT * FROM memory_item WHERE owner = ? AND status = 'suggested' ORDER BY updated_at DESC LIMIT 20", (owner,))
    unread = db.query_one("SELECT COUNT(*) AS n FROM notification WHERE owner = ? AND read_at IS NULL", (owner,))["n"]
    return {"unread": unread, "suggestion_count": len(suggested), "badge": unread + len(suggested),
            "suggestions": [memory._view(r) for r in suggested[:3]],
            "items": [{"id": r["id"], "kind": r["kind"], "title": r["title"], "body": r["body"], "page": r["page"], "ts": r["ts"], "read": r["read_at"] is not None} for r in rows]}


@router.post("/notifications/read-all")
def read_all(request: Request) -> dict:
    db: Database = request.app.state.db
    db.execute("UPDATE notification SET read_at = ? WHERE owner = ? AND read_at IS NULL", (_now(), connections._require_owner(request)))
    return {"ok": True}


@router.post("/notifications/{note_id}/read")
def read_one(note_id: str, request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    if not db.query_one("SELECT 1 AS x FROM notification WHERE id = ? AND owner = ?", (note_id, owner)):
        raise fail("not_found", "No notification with that id.", 404)
    db.execute("UPDATE notification SET read_at = COALESCE(read_at, ?) WHERE id = ?", (_now(), note_id))
    return {"ok": True}


@router.post("/notifications/sync")
async def sync(request: Request) -> dict:
    """Ask Instagram for fresh numbers when the last read is old, so likes and shares show up without a manual refresh."""
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    row = db.query_one("SELECT fetched_at FROM connection WHERE provider = 'instagram' AND owner = ?", (owner,))
    if not row:
        return {"synced": False, "reason": "not_connected"}
    age = (datetime.now(timezone.utc) - datetime.fromisoformat(row["fetched_at"])).total_seconds()
    if age < SYNC_AFTER_SECONDS:
        return {"synced": False, "reason": "fresh"}
    try:
        await connections.refresh(request)
    except Exception as exc:  # the list must still open when Instagram is unreachable or the login expired
        return {"synced": False, "reason": getattr(getattr(exc, "detail", None), "get", lambda *_: "error")("code") or "error"}
    return {"synced": True}
