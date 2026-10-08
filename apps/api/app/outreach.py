"""outreach: tracked links, click redirect, outreach events, real SMTP email with an open pixel. Contract in PLAN.md.

Every number the dashboard shows about distribution comes from the tables below:
  link           one stable short code per asset
  click          one row per real hit on GET /r/{code}
  outreach_event one row per owner action (copied, shared, downloaded, posted, mail app opened) or failed send
  email_send     one row per delivered message, with its own open-pixel token
  email_open     one row per hit on GET /o/{token}.gif
"""
from __future__ import annotations

import asyncio
import html
import json
import os
import re
import secrets
import smtplib
from email.message import EmailMessage
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse, Response
from pydantic import BaseModel

from app import plan
from app.db import Database
from app.media import asset_or_404, fail
from app.service import now

router = APIRouter()

SCHEMA = """
CREATE TABLE IF NOT EXISTS link (
  code TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL UNIQUE,
  campaign_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS click (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  code TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  lang TEXT NOT NULL,
  ua TEXT,
  referrer TEXT
);
CREATE TABLE IF NOT EXISTS outreach_event (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT
);
CREATE TABLE IF NOT EXISTS email_send (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  asset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  recipient_name TEXT,
  recipient_email TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_open (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  token TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  campaign_id TEXT NOT NULL,
  ua TEXT
);
CREATE INDEX IF NOT EXISTS idx_click_campaign ON click(campaign_id, ts);
CREATE INDEX IF NOT EXISTS idx_outreach_campaign ON outreach_event(campaign_id, id);
CREATE INDEX IF NOT EXISTS idx_send_campaign ON email_send(campaign_id);
CREATE INDEX IF NOT EXISTS idx_open_campaign ON email_open(campaign_id);
"""

# Owner actions that count as distribution. email_failed is logged for honesty and never counts.
ACTIONS = ("copied", "shared_whatsapp", "downloaded", "posted_manually", "email_opened_in_app")
SMTP_VARS = ("SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM")
CODE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"
TOKEN = re.compile(r"^[0-9a-f]{32}$")
EMAIL = re.compile(r"^[^@\s<>,;]+@[^@\s<>,;]+\.[^@\s<>,;]+$")
# 1x1 transparent GIF.
PIXEL = bytes.fromhex("47494638396101000100800000000000ffffff21f90401000000002c00000000010001000002024401003b")


def ensure_schema(db: Database) -> None:
    db.ensure(SCHEMA)


def public_base() -> str:
    return (os.environ.get("PUBLIC_BASE_URL") or "http://127.0.0.1:8000").rstrip("/")


def destination(db: Database, campaign_id: str) -> str | None:
    campaign_plan = plan.get_plan(db, campaign_id)
    value = ((campaign_plan or {}).get("cta") or {}).get("destination_url")
    if not isinstance(value, str) or not value.strip() or re.search(r"[\x00-\x1f\x7f]", value):
        return None
    return value.strip()


def link_for(db: Database, asset_id: str) -> dict[str, str] | None:
    row = db.query_one("SELECT code FROM link WHERE asset_id = ?", (asset_id,))
    return None if row is None else {"code": row["code"], "url": f"{public_base()}/r/{row['code']}"}


def ensure_link(db: Database, asset: dict[str, Any]) -> dict[str, str]:
    existing = link_for(db, asset["id"])
    if existing:
        return existing
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(7))
        if db.query_one("SELECT 1 AS found FROM link WHERE code = ?", (code,)) is None:
            break
    db.execute(
        "INSERT INTO link (code, asset_id, campaign_id, created_at) VALUES (?, ?, ?, ?)",
        (code, asset["id"], asset["campaign_id"], now()),
    )
    return {"code": code, "url": f"{public_base()}/r/{code}"}


def outreach_counts(db: Database, campaign_id: str) -> dict[str, dict[str, int]]:
    """Per-asset counters for the assets/state endpoint."""
    counts: dict[str, dict[str, int]] = {}

    def slot(asset_id: str) -> dict[str, int]:
        return counts.setdefault(
            asset_id,
            {**{action: 0 for action in ACTIONS}, "email_sent": 0, "clicks": 0, "opens": 0},
        )

    for row in db.query(
        "SELECT asset_id, action, COUNT(*) AS n FROM outreach_event WHERE campaign_id = ? GROUP BY asset_id, action",
        (campaign_id,),
    ):
        if row["action"] in ACTIONS:
            slot(row["asset_id"])[row["action"]] = row["n"]
    for row in db.query("SELECT asset_id, COUNT(*) AS n FROM email_send WHERE campaign_id = ? GROUP BY asset_id", (campaign_id,)):
        slot(row["asset_id"])["email_sent"] = row["n"]
    for row in db.query("SELECT asset_id, COUNT(*) AS n FROM click WHERE campaign_id = ? GROUP BY asset_id", (campaign_id,)):
        slot(row["asset_id"])["clicks"] = row["n"]
    # Opens are unique recipients (tokens), not pixel hits, so a mail client reloading the image does not inflate them.
    for row in db.query(
        "SELECT asset_id, COUNT(DISTINCT token) AS n FROM email_open WHERE campaign_id = ? GROUP BY asset_id",
        (campaign_id,),
    ):
        slot(row["asset_id"])["opens"] = row["n"]
    return counts


def links_for_campaign(db: Database, campaign_id: str) -> dict[str, dict[str, str]]:
    base = public_base()
    return {
        row["asset_id"]: {"code": row["code"], "url": f"{base}/r/{row['code']}"}
        for row in db.query("SELECT asset_id, code FROM link WHERE campaign_id = ?", (campaign_id,))
    }


@router.post("/assets/{asset_id}/link")
def create_link(asset_id: str, request: Request) -> dict:
    db = request.app.state.db
    asset = asset_or_404(db, asset_id)
    if destination(db, asset["campaign_id"]) is None:
        raise fail("no_cta", "The plan has no call to action destination to link to.", 409)
    return ensure_link(db, asset)


@router.get("/r/{code}")
def follow_link(code: str, request: Request) -> RedirectResponse:
    db = request.app.state.db
    row = db.query_one("SELECT * FROM link WHERE code = ?", (code,))
    if row is None:
        raise fail("not_found", "No such link.", 404)
    target = destination(db, row["campaign_id"])
    if target is None:
        raise fail("no_cta", "The plan has no call to action destination to send people to.", 409)
    asset = db.asset_get(row["asset_id"])
    db.execute(
        "INSERT INTO click (ts, code, asset_id, campaign_id, channel, lang, ua, referrer) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (
            now(),
            code,
            row["asset_id"],
            row["campaign_id"],
            asset["channel"] if asset else "",
            asset["lang"] if asset else "",
            request.headers.get("user-agent"),
            request.headers.get("referer"),
        ),
    )
    return RedirectResponse(target, status_code=302)


class OutreachIn(BaseModel):
    action: str


@router.post("/assets/{asset_id}/outreach")
def log_outreach(asset_id: str, body: OutreachIn, request: Request) -> dict:
    db = request.app.state.db
    asset = asset_or_404(db, asset_id)
    if body.action not in ACTIONS:
        raise fail("unknown_action", f"Action must be one of {', '.join(ACTIONS)}.", 400)
    require_approved(asset)
    ts = now()
    db.execute(
        "INSERT INTO outreach_event (ts, asset_id, campaign_id, action, detail) VALUES (?, ?, ?, ?, NULL)",
        (ts, asset_id, asset["campaign_id"], body.action),
    )
    row = db.query_one("SELECT id FROM outreach_event WHERE asset_id = ? ORDER BY id DESC LIMIT 1", (asset_id,))
    return {"id": row["id"], "ts": ts, "asset_id": asset_id, "action": body.action}


def require_approved(asset: dict[str, Any]) -> None:
    if asset["status"] != "approved":
        raise fail("not_approved", "Only approved assets can be distributed.", 409)


class Recipient(BaseModel):
    name: str | None = None
    email: str


class SendEmailIn(BaseModel):
    recipients: list[Recipient] | None = None


def smtp_settings() -> dict[str, str] | None:
    values = {name: (os.environ.get(name) or "").strip() for name in SMTP_VARS}
    return values if all(values.values()) else None


def _extra(asset: dict[str, Any]) -> dict[str, Any]:
    raw = asset.get("extra")
    if not raw:
        return {}
    try:
        value = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _fill_name(text: str, name: str | None) -> str:
    if name:
        return text.replace("{name}", name)
    # No name known: drop the placeholder and the space before it rather than invent one.
    return re.sub(r"[ \t]*\{name\}", "", text)


def build_message(
    settings: dict[str, str],
    asset: dict[str, Any],
    recipient: dict[str, str | None],
    subject: str,
    link_url: str | None,
    pixel_url: str,
) -> EmailMessage:
    body = _fill_name(asset["content"] or "", recipient["name"])
    text = body + (f"\n\n{link_url}" if link_url else "")
    paragraphs = "".join(f"<p>{html.escape(part).replace(chr(10), '<br>')}</p>" for part in body.split("\n\n") if part.strip())
    anchor = f'<p><a href="{html.escape(link_url, quote=True)}">{html.escape(link_url)}</a></p>' if link_url else ""
    message = EmailMessage()
    message["From"] = settings["SMTP_FROM"]
    message["To"] = f"{recipient['name']} <{recipient['email']}>" if recipient["name"] else str(recipient["email"])
    message["Subject"] = subject
    message.set_content(text)
    message.add_alternative(
        f'<html><body>{paragraphs}{anchor}<img src="{html.escape(pixel_url, quote=True)}" width="1" height="1" alt="" style="display:none"></body></html>',
        subtype="html",
    )
    return message


def deliver(settings: dict[str, str], messages: list[EmailMessage]) -> list[str | None]:
    """Send each message on one SMTP session. Returns None per delivered message, else the error text."""
    port = int(settings["SMTP_PORT"])
    results: list[str | None] = []
    client: smtplib.SMTP = (
        smtplib.SMTP_SSL(settings["SMTP_HOST"], port, timeout=30)
        if port == 465
        else smtplib.SMTP(settings["SMTP_HOST"], port, timeout=30)
    )
    with client:
        client.ehlo()
        if port != 465 and client.has_extn("starttls"):
            client.starttls()
            client.ehlo()
        client.login(settings["SMTP_USER"], settings["SMTP_PASSWORD"])
        for message in messages:
            try:
                client.send_message(message)
                results.append(None)
            except smtplib.SMTPException as exc:
                results.append(str(exc)[:200])
    return results


@router.post("/assets/{asset_id}/send-email")
async def send_email(asset_id: str, request: Request, body: SendEmailIn | None = None) -> dict:
    db = request.app.state.db
    asset = asset_or_404(db, asset_id)
    if asset["channel"] != "cold_email":
        raise fail("not_email", "Only cold_email assets can be sent as email.", 400)
    require_approved(asset)
    settings = smtp_settings()
    if settings is None:
        raise fail("smtp_not_configured", "SMTP is not configured. Open the email in the mail app instead.", 409)
    campaign_plan = plan.get_plan(db, asset["campaign_id"]) or {}
    wanted = body.recipients if body and body.recipients is not None else [Recipient(**r) for r in campaign_plan.get("email_recipients") or []]
    if not wanted:
        raise fail("no_recipients", "No recipients were given and the plan has none.", 400)

    failed: list[dict[str, str]] = []
    valid: list[Recipient] = []
    for recipient in wanted:
        if EMAIL.match(recipient.email.strip()):
            valid.append(recipient)
        else:
            failed.append({"email": recipient.email, "error": "invalid email address"})

    extra = _extra(asset)
    subject = re.sub(r"[\r\n]+", " ", str(extra.get("subject") or (campaign_plan.get("business") or {}).get("name") or "")).strip()
    if not subject:
        raise fail("no_subject", "The email has no subject and the plan has no business name to use.", 409)
    link = ensure_link(db, asset) if destination(db, asset["campaign_id"]) else None
    base = public_base()

    tokens = [secrets.token_hex(16) for _ in valid]
    messages = [
        build_message(
            settings,
            asset,
            {"name": (r.name or "").strip() or None, "email": r.email.strip()},
            subject,
            link["url"] if link else None,
            f"{base}/o/{token}.gif",
        )
        for r, token in zip(valid, tokens)
    ]
    try:
        results = await asyncio.to_thread(deliver, settings, messages) if messages else []
    except (smtplib.SMTPException, OSError) as exc:
        results = [f"SMTP connection failed: {str(exc)[:160]}"] * len(messages)

    sent = 0
    for recipient, token, error in zip(valid, tokens, results):
        email = recipient.email.strip()
        if error is None:
            sent += 1
            db.execute(
                "INSERT INTO email_send (ts, token, asset_id, campaign_id, recipient_name, recipient_email) VALUES (?, ?, ?, ?, ?, ?)",
                (now(), token, asset_id, asset["campaign_id"], (recipient.name or "").strip() or None, email),
            )
        else:
            failed.append({"email": email, "error": error})
            db.execute(
                "INSERT INTO outreach_event (ts, asset_id, campaign_id, action, detail) VALUES (?, ?, ?, 'email_failed', ?)",
                (now(), asset_id, asset["campaign_id"], f"{email}: {error}"),
            )
    return {"sent": sent, "failed": failed}


@router.get("/o/{token}.gif")
def email_open_pixel(token: str, request: Request) -> Response:
    db = request.app.state.db
    if TOKEN.match(token):
        row = db.query_one("SELECT * FROM email_send WHERE token = ?", (token,))
        if row:
            db.execute(
                "INSERT INTO email_open (ts, token, asset_id, campaign_id, ua) VALUES (?, ?, ?, ?, ?)",
                (now(), token, row["asset_id"], row["campaign_id"], request.headers.get("user-agent")),
            )
    return Response(PIXEL, media_type="image/gif", headers={"Cache-Control": "no-store, max-age=0"})
