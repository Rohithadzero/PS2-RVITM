"""auth: Sign in with Google (authorization code flow with PKCE) and a signed session cookie.

Flow
  GET  /auth/google/login     builds the Google URL, keeps state + PKCE verifier + nonce in a short signed cookie, redirects.
  GET  /auth/google/callback  checks state, exchanges the code with Google server to server (client secret never reaches the
                              browser), checks the ID token claims, applies the optional allow-list, sets the session cookie.
  GET  /auth/me               who is signed in, and whether this server requires login.
  POST /auth/logout           clears the session cookie.

The ID token comes straight from Google's token endpoint over TLS, so its signature is not re-verified (Google's guidance for
that case); issuer, audience, expiry, nonce and verified email are checked. Sessions are HMAC-signed, HttpOnly, SameSite=Lax.

Settings (environment): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET (else a key file is created in the data folder),
ALLOWED_EMAILS (comma separated, empty means any Google account), REQUIRE_LOGIN=1 to protect the API, FRONTEND_URL,
GOOGLE_REDIRECT_URI (only if behind a proxy), COOKIE_SECURE=1 on https.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse, Response

router = APIRouter()

SESSION_COOKIE = "ll_session"
FLOW_COOKIE = "ll_oauth"
SESSION_TTL = 7 * 24 * 3600
FLOW_TTL = 600
AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
ISSUERS = ("accounts.google.com", "https://accounts.google.com")
# Paths that work without a session even when login is required (tracked links and email pixels are opened by customers).
PUBLIC_PREFIXES = ("/auth/", "/health", "/r/", "/o/", "/u/", "/media/", "/site/", "/docs", "/openapi.json", "/redoc")


def ensure_schema(db) -> None:
    """Nothing to create: sessions live in a signed cookie."""


# ---------------------------------------------------------------- config

def _env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def configured() -> bool:
    return bool(_env("GOOGLE_CLIENT_ID") and _env("GOOGLE_CLIENT_SECRET"))


def require_login() -> bool:
    return _env("REQUIRE_LOGIN").lower() in ("1", "true", "yes")


def allowed_emails() -> set[str]:
    return {e.strip().lower() for e in _env("ALLOWED_EMAILS").split(",") if e.strip()}


_secret_cache: dict[str, bytes] = {}


def _secret(app: FastAPI) -> bytes:
    if _env("SESSION_SECRET"):
        return _env("SESSION_SECRET").encode()
    path: Path = app.state.settings.database_path.parent / "session.key"
    key = str(path)
    if key not in _secret_cache:
        if not path.exists():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(secrets.token_urlsafe(48), encoding="utf-8")
        _secret_cache[key] = path.read_text(encoding="utf-8").strip().encode()
    return _secret_cache[key]


# ---------------------------------------------------------------- signed values

def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(text: str) -> bytes:
    return base64.urlsafe_b64decode(text + "=" * (-len(text) % 4))


def sign(app: FastAPI, payload: dict, ttl: int) -> str:
    body = _b64(json.dumps({**payload, "exp": int(time.time()) + ttl}, separators=(",", ":")).encode())
    sig = _b64(hmac.new(_secret(app), body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify(app: FastAPI, token: str | None) -> dict | None:
    if not token or "." not in token:
        return None
    body, _, sig = token.partition(".")
    good = _b64(hmac.new(_secret(app), body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, good):
        return None
    try:
        data = json.loads(_unb64(body))
    except (ValueError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) and data.get("exp", 0) > time.time() else None


def current_user(request: Request) -> dict | None:
    data = verify(request.app, request.cookies.get(SESSION_COOKIE))
    return {k: data.get(k) for k in ("sub", "email", "name", "picture")} if data and data.get("email") else None


def _secure(request: Request) -> bool:
    return _env("COOKIE_SECURE").lower() in ("1", "true", "yes") or request.url.scheme == "https"


def _frontend(request: Request) -> str:
    return (_env("FRONTEND_URL") or f"http://{request.url.hostname}:5173").rstrip("/")


def _redirect_uri(request: Request) -> str:
    return _env("GOOGLE_REDIRECT_URI") or str(request.url.replace(path="/auth/google/callback", query=""))


def _fail(request: Request, code: str) -> Response:
    """Back to the login screen with a reason. The flow cookie is dropped so a failed try cannot be replayed."""
    resp = RedirectResponse(f"{_frontend(request)}/#/login/{code}", status_code=302)
    resp.delete_cookie(FLOW_COOKIE, path="/")
    return resp


def _claims(id_token: str) -> dict:
    try:
        return json.loads(_unb64(id_token.split(".")[1]))
    except (IndexError, ValueError, json.JSONDecodeError):
        return {}


def check_claims(claims: dict, client_id: str, nonce: str, now: float | None = None) -> str | None:
    """Return a failure code, or None when the token is acceptable."""
    if claims.get("iss") not in ISSUERS:
        return "failed"
    aud = claims.get("aud")
    if aud != client_id and not (isinstance(aud, list) and client_id in aud):
        return "failed"
    if claims.get("exp", 0) <= (now or time.time()):
        return "failed"
    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        return "failed"
    if not claims.get("email") or claims.get("email_verified") is not True:
        return "unverified"
    return None


# ---------------------------------------------------------------- routes

@router.get("/auth/google/login")
def login(request: Request) -> Response:
    if not configured():
        return JSONResponse(status_code=501, content={"detail": {"code": "google_not_configured",
                            "message": "Google sign-in is not set up on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."}})
    verifier, state, nonce = secrets.token_urlsafe(64), secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    challenge = _b64(hashlib.sha256(verifier.encode()).digest())
    params = {"client_id": _env("GOOGLE_CLIENT_ID"), "redirect_uri": _redirect_uri(request), "response_type": "code",
              "scope": "openid email profile", "state": state, "nonce": nonce, "code_challenge": challenge,
              "code_challenge_method": "S256", "access_type": "online", "prompt": "select_account"}
    resp = RedirectResponse(f"{AUTH_URL}?{urlencode(params)}", status_code=302)
    resp.set_cookie(FLOW_COOKIE, sign(request.app, {"state": state, "verifier": verifier, "nonce": nonce}, FLOW_TTL),
                    max_age=FLOW_TTL, httponly=True, samesite="lax", secure=_secure(request), path="/")
    return resp


@router.get("/auth/google/callback")
async def callback(request: Request, code: str | None = None, state: str | None = None, error: str | None = None) -> Response:
    if not configured():
        return _fail(request, "failed")
    if error:
        return _fail(request, "denied" if error == "access_denied" else "failed")
    flow = verify(request.app, request.cookies.get(FLOW_COOKIE))
    if not flow or not code or not state or not hmac.compare_digest(state, flow.get("state", "")):
        return _fail(request, "failed")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(TOKEN_URL, data={
                "code": code, "client_id": _env("GOOGLE_CLIENT_ID"), "client_secret": _env("GOOGLE_CLIENT_SECRET"),
                "redirect_uri": _redirect_uri(request), "grant_type": "authorization_code", "code_verifier": flow["verifier"]})
    except httpx.HTTPError:
        return _fail(request, "failed")
    if r.status_code != 200 or "id_token" not in r.json():
        return _fail(request, "failed")
    claims = _claims(r.json()["id_token"])
    problem = check_claims(claims, _env("GOOGLE_CLIENT_ID"), flow["nonce"])
    if problem:
        return _fail(request, problem)
    email = claims["email"].lower()
    allow = allowed_emails()
    if allow and email not in allow:
        return _fail(request, "forbidden")
    resp = RedirectResponse(f"{_frontend(request)}/#/home", status_code=302)
    resp.set_cookie(SESSION_COOKIE, sign(request.app, {"sub": claims.get("sub"), "email": email, "name": claims.get("name") or email,
                                                       "picture": claims.get("picture")}, SESSION_TTL),
                    max_age=SESSION_TTL, httponly=True, samesite="lax", secure=_secure(request), path="/")
    resp.delete_cookie(FLOW_COOKIE, path="/")
    return resp


@router.get("/auth/me")
def me(request: Request) -> dict:
    user = current_user(request)
    return {"configured": configured(), "require_login": require_login(), "signed_in": user is not None, "user": user,
            "restricted": bool(allowed_emails())}


@router.post("/auth/logout")
def logout() -> Response:
    resp = JSONResponse({"signed_in": False})
    resp.delete_cookie(SESSION_COOKIE, path="/")
    return resp


def install(app: FastAPI) -> None:
    """Add the login gate. It does nothing unless REQUIRE_LOGIN is set. Add it before the CORS middleware so 401s carry CORS headers."""

    @app.middleware("http")
    async def gate(request: Request, call_next):
        if require_login() and request.method != "OPTIONS" and not request.url.path.startswith(PUBLIC_PREFIXES):
            if current_user(request) is None:
                return JSONResponse(status_code=401, content={"detail": {"code": "login_required", "message": "Sign in to continue."}})
        return await call_next(request)
