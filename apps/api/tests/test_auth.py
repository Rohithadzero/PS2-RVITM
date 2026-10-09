"""Google sign-in: PKCE redirect, callback checks, sessions, the optional login gate. No network."""
import base64
import hashlib
import json
import time
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient

from app import auth
from app.config import Settings
from app.main import create_app

CID = "client-123.apps.googleusercontent.com"


def make(tmp_path, monkeypatch, *, configured=True, require=False, allow=""):
    for name in ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "REQUIRE_LOGIN", "ALLOWED_EMAILS", "SESSION_SECRET", "FRONTEND_URL", "CORS_ORIGINS"):
        monkeypatch.delenv(name, raising=False)
    if configured:
        monkeypatch.setenv("GOOGLE_CLIENT_ID", CID)
        monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "secret-xyz")
    if require:
        monkeypatch.setenv("REQUIRE_LOGIN", "1")
    if allow:
        monkeypatch.setenv("ALLOWED_EMAILS", allow)
    s = Settings(agnes_api_key=None, agnes_base_url="http://x.invalid/v1", agnes_origin="http://x.invalid",
                 database_path=tmp_path / "t.db", assets_dir=tmp_path / "a")
    return TestClient(create_app(s), follow_redirects=False, base_url="http://127.0.0.1:8000")


def jwt(claims):
    part = lambda d: base64.urlsafe_b64encode(json.dumps(d).encode()).rstrip(b"=").decode()
    return f"{part({'alg': 'RS256'})}.{part(claims)}.sig"


GOOD = {"iss": "https://accounts.google.com", "aud": CID, "exp": time.time() + 600, "email": "Owner@Example.com", "email_verified": True,
        "sub": "123", "name": "Meena Owner", "picture": "https://example.com/p.png"}


class FakeResp:
    def __init__(self, status, body):
        self.status_code, self._body = status, body

    def json(self):
        return self._body


def fake_google(monkeypatch, status=200, claims=None, nonce=None, seen=None):
    class FakeClient:
        def __init__(self, *a, **k):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *a):
            return False

        async def post(self, url, data=None, **k):
            if seen is not None:
                seen.update(data)
            body = {"id_token": jwt({**(claims or GOOD), "nonce": nonce})} if status == 200 else {"error": "invalid_grant"}
            return FakeResp(status, body)

    monkeypatch.setattr(auth.httpx, "AsyncClient", FakeClient)


def start(c):
    r = c.get("/auth/google/login")
    q = parse_qs(urlparse(r.headers["location"]).query)
    return r, q


# ---- signing
def test_sessions_are_tamper_proof_and_expire(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    app = c.app
    tok = auth.sign(app, {"email": "a@b.co"}, 60)
    assert auth.verify(app, tok)["email"] == "a@b.co"
    body, _, sig = tok.partition(".")
    assert auth.verify(app, body + "." + sig[:-2] + "xx") is None
    forged = auth._b64(json.dumps({"email": "evil@x.co", "exp": time.time() + 999}).encode())
    assert auth.verify(app, forged + "." + sig) is None
    assert auth.verify(app, auth.sign(app, {"email": "a@b.co"}, -5)) is None
    assert auth.verify(app, None) is None and auth.verify(app, "garbage") is None


# ---- login redirect
def test_login_needs_configuration(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch, configured=False)
    r = c.get("/auth/google/login")
    assert r.status_code == 501 and r.json()["detail"]["code"] == "google_not_configured"
    me = c.get("/auth/me").json()
    assert me["configured"] is False and me["signed_in"] is False


def test_login_redirects_to_google_with_pkce_and_state(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    r, q = start(c)
    assert r.status_code == 302 and r.headers["location"].startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    assert q["client_id"] == [CID] and q["response_type"] == ["code"] and q["scope"] == ["openid email profile"]
    assert q["code_challenge_method"] == ["S256"] and q["redirect_uri"] == ["http://127.0.0.1:8000/auth/google/callback"]
    flow = auth.verify(c.app, c.cookies.get(auth.FLOW_COOKIE))
    assert flow["state"] == q["state"][0] and flow["nonce"] == q["nonce"][0]
    expect = base64.urlsafe_b64encode(hashlib.sha256(flow["verifier"].encode()).digest()).rstrip(b"=").decode()
    assert q["code_challenge"] == [expect]  # the challenge matches the verifier kept in the cookie
    cookie = r.headers["set-cookie"].lower()
    assert "httponly" in cookie and "samesite=lax" in cookie


# ---- callback
def test_callback_signs_the_owner_in(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    _, q = start(c)
    seen = {}
    fake_google(monkeypatch, nonce=q["nonce"][0], seen=seen)
    r = c.get("/auth/google/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.status_code == 302 and r.headers["location"] == "http://127.0.0.1:5173/#/home"
    assert seen["code_verifier"] and seen["client_secret"] == "secret-xyz" and seen["grant_type"] == "authorization_code"
    me = c.get("/auth/me").json()
    assert me["signed_in"] and me["user"]["email"] == "owner@example.com" and me["user"]["name"] == "Meena Owner"
    assert "secret" not in json.dumps(me)
    assert c.post("/auth/logout").json() == {"signed_in": False}
    assert c.get("/auth/me").json()["signed_in"] is False


@pytest.mark.parametrize("params,code", [
    ({"code": "abc", "state": "wrong"}, "failed"),
    ({"state": "x"}, "failed"),
    ({"error": "access_denied"}, "denied"),
])
def test_callback_rejects_bad_requests(tmp_path, monkeypatch, params, code):
    c = make(tmp_path, monkeypatch)
    start(c)
    r = c.get("/auth/google/callback", params=params)
    assert r.headers["location"].endswith(f"/#/login/{code}")
    assert c.get("/auth/me").json()["signed_in"] is False


def test_callback_without_the_flow_cookie_is_rejected(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    fake_google(monkeypatch, nonce="n")
    r = c.get("/auth/google/callback", params={"code": "abc", "state": "s"})
    assert r.headers["location"].endswith("/#/login/failed")


@pytest.mark.parametrize("override,code", [
    ({"aud": "someone-else"}, "failed"), ({"iss": "https://evil.example"}, "failed"), ({"exp": time.time() - 5}, "failed"),
    ({"email_verified": False}, "unverified"),
])
def test_callback_checks_the_token_claims(tmp_path, monkeypatch, override, code):
    c = make(tmp_path, monkeypatch)
    _, q = start(c)
    fake_google(monkeypatch, claims={**GOOD, **override}, nonce=q["nonce"][0])
    r = c.get("/auth/google/callback", params={"code": "abc", "state": q["state"][0]})
    assert r.headers["location"].endswith(f"/#/login/{code}") and c.get("/auth/me").json()["signed_in"] is False


def test_nonce_mismatch_and_token_endpoint_failure(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    _, q = start(c)
    fake_google(monkeypatch, nonce="replayed")
    assert c.get("/auth/google/callback", params={"code": "a", "state": q["state"][0]}).headers["location"].endswith("/#/login/failed")
    c2 = make(tmp_path, monkeypatch)
    _, q2 = start(c2)
    fake_google(monkeypatch, status=400)
    assert c2.get("/auth/google/callback", params={"code": "a", "state": q2["state"][0]}).headers["location"].endswith("/#/login/failed")


def test_allow_list_blocks_other_accounts(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch, allow="someone@else.com, team@example.com")
    _, q = start(c)
    fake_google(monkeypatch, nonce=q["nonce"][0])
    r = c.get("/auth/google/callback", params={"code": "a", "state": q["state"][0]})
    assert r.headers["location"].endswith("/#/login/forbidden") and c.get("/auth/me").json()["signed_in"] is False
    c2 = make(tmp_path, monkeypatch, allow="owner@example.com")
    _, q2 = start(c2)
    fake_google(monkeypatch, nonce=q2["nonce"][0])
    assert c2.get("/auth/google/callback", params={"code": "a", "state": q2["state"][0]}).headers["location"].endswith("/#/home")


# ---- the gate
def test_gate_protects_the_api_only_when_login_is_required(tmp_path, monkeypatch):
    open_ = make(tmp_path, monkeypatch)
    assert open_.get("/campaigns").status_code == 200  # default: hackathon dev stays open
    c = make(tmp_path, monkeypatch, require=True)
    r = c.get("/campaigns")
    assert r.status_code == 401 and r.json()["detail"]["code"] == "login_required"
    for public in ("/health", "/auth/me", "/o/nothing.gif"):
        assert c.get(public).status_code != 401
    assert c.get("/auth/me").json()["require_login"] is True
    _, q = start(c)
    fake_google(monkeypatch, nonce=q["nonce"][0])
    c.get("/auth/google/callback", params={"code": "a", "state": q["state"][0]})
    assert c.get("/campaigns").status_code == 200


def test_a_forged_cookie_does_not_pass_the_gate(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch, require=True)
    c.cookies.set(auth.SESSION_COOKIE, auth._b64(b'{"email":"a@b.co","exp":9999999999}') + ".AAAA")
    assert c.get("/campaigns").status_code == 401


def test_cors_allows_credentials_only_for_known_origins(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    ok = c.get("/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173" and ok.headers["access-control-allow-credentials"] == "true"
    bad = c.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
    gated = make(tmp_path, monkeypatch, require=True).get("/campaigns", headers={"Origin": "http://localhost:5173"})
    assert gated.status_code == 401 and gated.headers["access-control-allow-origin"] == "http://localhost:5173"
