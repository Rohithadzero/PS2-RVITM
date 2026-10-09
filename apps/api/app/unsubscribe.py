"""unsubscribe: every email carries a one-click way to stop, and a stop is final.

  - each email has a link  /u/<token>  (the token is the one already used for the open pixel, so it identifies one send)
  - GET shows a page with a button; only the POST unsubscribes. That way a mail scanner that "visits" links cannot unsubscribe
    someone by accident. The mail header List-Unsubscribe-Post lets mail apps do the POST themselves (one-click, RFC 8058)
  - an unsubscribed address goes on a suppression list. Nothing is ever emailed to it again, whoever asks, even if the shop owner
    ticks "agreed to email" later. The person can only be added back by themselves, outside this app
  - customers with that address are switched off for email at once, with the reason recorded

The suppression list is by address, not by shop owner, because the person is refusing mail from this service.
"""
from __future__ import annotations

import html
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Request, Response

from app.db import Database

router = APIRouter()

SCHEMA = """
CREATE TABLE IF NOT EXISTS email_suppression (
  email TEXT PRIMARY KEY,
  ts TEXT NOT NULL,
  source TEXT NOT NULL
);
"""
TOKEN = re.compile(r"^[0-9a-f]{32}$")
PAGE_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-store",
}
STYLE = "body{font:16px/1.5 system-ui,sans-serif;max-width:30rem;margin:12vh auto;padding:0 20px;color:#1f1a14}button{font:inherit;padding:10px 20px;border-radius:999px;border:0;background:#1f1a14;color:#fff;cursor:pointer}"


def ensure_schema(db: Database) -> None:
    db.ensure(SCHEMA)


def norm(email: str | None) -> str:
    return (email or "").strip().lower()


def is_suppressed(db: Database, email: str | None) -> bool:
    return bool(email) and db.query_one("SELECT 1 AS x FROM email_suppression WHERE email = ?", (norm(email),)) is not None


def suppress(db: Database, email: str, source: str) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    db.execute("INSERT OR IGNORE INTO email_suppression (email, ts, source) VALUES (?, ?, ?)", (norm(email), now, source))
    db.execute("UPDATE customer SET consent_email = 0, consent_source = ?, updated_at = ? WHERE lower(email) = ? AND consent_email = 1",
               (f"Unsubscribed by the customer through the link in an email on {now[:10]}", now, norm(email)))


def link_for(base: str, token: str) -> str:
    return f"{base}/u/{token}"


def _page(body: str, status: int = 200) -> Response:
    return Response(f"<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
                    f"<title>Unsubscribe</title><style>{STYLE}</style></head><body>{body}</body></html>", status_code=status,
                    media_type="text/html; charset=utf-8", headers=PAGE_HEADERS)


def _recipient(db: Database, token: str) -> str | None:
    if not TOKEN.match(token):
        return None
    row = db.query_one("SELECT recipient_email FROM email_send WHERE token = ?", (token,))
    return row["recipient_email"] if row else None


@router.get("/u/{token}")
def confirm(token: str, request: Request) -> Response:
    email = _recipient(request.app.state.db, token)
    if email is None:
        return _page("<h1>Link not recognised</h1><p>This unsubscribe link is not valid. If you keep getting emails you do not want, reply to one and say so.</p>", 404)
    if is_suppressed(request.app.state.db, email):
        return _page("<h1>You are unsubscribed</h1><p>You will not get any more emails from us.</p>")
    return _page(f"<h1>Stop these emails?</h1><p>This will stop emails to <strong>{html.escape(email)}</strong>.</p>"
                 f"<form method=\"post\" action=\"/u/{token}\"><button type=\"submit\">Unsubscribe</button></form>")


@router.post("/u/{token}")
def do_unsubscribe(token: str, request: Request) -> Response:
    db: Database = request.app.state.db
    email = _recipient(db, token)
    if email is None:
        return _page("<h1>Link not recognised</h1><p>This unsubscribe link is not valid.</p>", 404)
    suppress(db, email, "link")
    return _page("<h1>You are unsubscribed</h1><p>You will not get any more emails from us. This can take a moment to reach every list.</p>")
