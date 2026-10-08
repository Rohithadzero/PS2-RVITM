"""Sessions. AUTH_MODE=dev signs in the demo owner (local only). Google OAuth is the production path and is not
implemented yet: /auth/google/login answers 501 until it is (docs/security.md section 3).

Cookie = '<owner_id>.<hmac>' signed with SESSION_SECRET, HttpOnly, SameSite=Lax. Allow-list enforced when set.
"""
from __future__ import annotations

import hashlib
import hmac
import uuid

from fastapi import HTTPException, Request, Response

from . import db
from .config import settings

COOKIE = "session"
DEV_EMAIL = "demo@local"


def _sign(owner_id: str) -> str:
    mac = hmac.new(settings.session_secret.encode(), owner_id.encode(), hashlib.sha256).hexdigest()[:32]
    return f"{owner_id}.{mac}"


def _verify(token: str | None):
    if not token or "." not in token:
        return None
    owner_id, mac = token.rsplit(".", 1)
    good = hmac.new(settings.session_secret.encode(), owner_id.encode(), hashlib.sha256).hexdigest()[:32]
    return owner_id if hmac.compare_digest(mac, good) else None


def get_or_create_owner(email: str, sub: str | None = None) -> dict:
    if settings.allow_list and email not in settings.allow_list:
        raise HTTPException(403, {"error": {"code": "not_allowed", "message": "This account is not on the allow-list"}})
    row = db.one("SELECT * FROM owner WHERE email=?", (email,))
    if row:
        return row
    oid = uuid.uuid4().hex[:12]
    db.run("INSERT INTO owner(id,google_sub,email,created_at) VALUES(?,?,?,?)", (oid, sub, email, db.now()))
    return db.one("SELECT * FROM owner WHERE id=?", (oid,))


def set_session(response: Response, owner_id: str) -> None:
    response.set_cookie(COOKIE, _sign(owner_id), httponly=True, samesite="lax", secure=False, max_age=60 * 60 * 12)


def current_owner(request: Request, response: Response) -> dict:
    owner_id = _verify(request.cookies.get(COOKIE))
    if owner_id:
        row = db.one("SELECT * FROM owner WHERE id=?", (owner_id,))
        if row:
            return row
    if settings.auth_mode == "dev":
        row = get_or_create_owner(DEV_EMAIL)
        set_session(response, row["id"])
        return row
    raise HTTPException(401, {"error": {"code": "unauthenticated", "message": "Sign in required"}})


def csrf_guard(request: Request) -> None:
    """State-changing requests must carry a custom header (SameSite cookie + header check)."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and settings.auth_mode != "dev":
        if request.headers.get("x-requested-with") != "ps2":
            raise HTTPException(403, {"error": {"code": "csrf", "message": "Missing X-Requested-With header"}})
