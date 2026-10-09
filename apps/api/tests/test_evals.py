"""The harness itself: it passes on the real guards and fails when a guard is broken."""
import re

from fastapi.testclient import TestClient

from app import evals, panel, reply
from app.config import Settings
from app.main import create_app


def test_all_guardrail_checks_pass():
    out = evals.run_all()
    assert out["ok"], [(c["id"], c["failures"]) for c in out["checks"] if not c["ok"]]
    assert len(out["checks"]) == 7


def test_the_harness_catches_a_broken_reply_guard(monkeypatch):
    monkeypatch.setattr(reply, "SENSITIVE", re.compile(r"^$"))
    out = {c["id"]: c for c in evals.run_all()["checks"]}
    assert out["reply_guard"]["ok"] is False and any("not escalated" in f for f in out["reply_guard"]["failures"])


def test_the_harness_catches_a_referee_that_approves_unchecked(monkeypatch):
    monkeypatch.setattr(panel, "referee", lambda verdicts: {"status": "clear", "needs_human": False, "disagreements": []})
    out = {c["id"]: c for c in evals.run_all()["checks"]}
    assert out["referee"]["ok"] is False


def test_evals_route(tmp_path):
    s = Settings(agnes_api_key=None, agnes_base_url="http://x.invalid/v1", agnes_origin="http://x.invalid",
                 database_path=tmp_path / "t.db", assets_dir=tmp_path / "a")
    body = TestClient(create_app(s)).get("/evals").json()
    assert body["ok"] and all(c["passed"] == c["total"] for c in body["checks"])
