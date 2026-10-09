"""Scheduler: approved-only, future-only, fingerprint guard, consent at send time, missed, double-run safety. SMTP is a stub."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app import outreach, plan, scheduler
from b_helpers import PLAN, make_client, seed, write_copy
from test_outreach import EMAIL_BODY, SMTP_ENV, FakeSMTP


@pytest.fixture
def rig(tmp_path, monkeypatch):
    FakeSMTP.sent, FakeSMTP.refuse, FakeSMTP.opened = [], set(), []
    app, client = make_client(tmp_path)
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    monkeypatch.setattr(outreach.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://loudlaunch.example")
    for k, v in SMTP_ENV.items():
        monkeypatch.setenv(k, v)
    cid, assets = seed(client, app)
    write_copy(app, assets["cold_email"], EMAIL_BODY, status="approved")
    write_copy(app, assets["instagram_post"], status="approved")
    write_copy(app, assets["poster"], status="pending")
    return app, client, assets


def when(hours=2):
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).astimezone(timezone(timedelta(hours=5, minutes=30))).isoformat(timespec="seconds")


def run(app, now=None):
    return asyncio.run(scheduler.run_due(app.state.db, now))


def test_schedule_validation(rig):
    app, client, a = rig
    em, ig, po = a["cold_email"]["id"], a["instagram_post"]["id"], a["poster"]["id"]
    code = lambda r: r.json()["detail"]["code"]
    assert code(client.post(f"/assets/{po}/schedule", json={"kind": "reminder", "at": when()})) == "not_approved"
    assert code(client.post(f"/assets/{ig}/schedule", json={"kind": "email", "at": when()})) == "not_email"
    assert code(client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": "2020-01-01T10:00:00+05:30"})) == "in_the_past"
    assert code(client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": "2026-12-01T10:00:00"})) == "bad_time"
    assert code(client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": when(24 * 400)})) == "too_far"
    assert client.post(f"/assets/{em}/schedule", json={"kind": "other", "at": when()}).status_code == 422
    assert client.post("/assets/nope/schedule", json={"kind": "reminder", "at": when()}).status_code == 404


def test_scheduled_email_sends_once_when_due(rig):
    app, client, a = rig
    em = a["cold_email"]["id"]
    item = client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": when(1)}).json()
    assert item["status"] == "pending" and item["label"].endswith("IST")
    assert run(app) == 0 and FakeSMTP.sent == []  # not due yet
    later = datetime.now(timezone.utc) + timedelta(hours=1, minutes=1)
    assert run(app, later) == 1 and len(FakeSMTP.sent) == 1  # the plan's one recipient
    assert run(app, later) == 0 and len(FakeSMTP.sent) == 1  # never twice
    got = client.get("/schedule").json()
    assert got["items"][0]["status"] == "sent" and got["items"][0]["result"]["sent"] == 1


def test_edit_after_scheduling_skips_the_send(rig):
    app, client, a = rig
    em = a["cold_email"]["id"]
    client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": when(1)})
    app.state.db.asset_update(em, content="Different words, not approved by anyone.")
    run(app, datetime.now(timezone.utc) + timedelta(hours=2))
    item = client.get("/schedule").json()["items"][0]
    assert item["status"] == "skipped" and "edited" in item["result"]["reason"] and FakeSMTP.sent == []


def test_unapproved_after_scheduling_skips_the_send(rig):
    app, client, a = rig
    em = a["cold_email"]["id"]
    client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": when(1)})
    app.state.db.asset_update(em, status="pending")
    run(app, datetime.now(timezone.utc) + timedelta(hours=2))
    assert client.get("/schedule").json()["items"][0]["status"] == "skipped" and FakeSMTP.sent == []


def test_overdue_by_more_than_a_day_is_missed_not_sent(rig):
    app, client, a = rig
    client.post(f"/assets/{a['cold_email']['id']}/schedule", json={"kind": "email", "at": when(1)})
    run(app, datetime.now(timezone.utc) + timedelta(days=3))
    item = client.get("/schedule").json()["items"][0]
    assert item["status"] == "missed" and FakeSMTP.sent == []


def test_customers_are_filtered_by_consent_at_send_time(rig):
    app, client, a = rig
    em = a["cold_email"]["id"]
    for name, mail in (("Asha", "asha@example.com"), ("Ravi", "ravi@example.com")):
        client.post("/customers", json={"name": name, "email": mail, "consent_email": True, "consent_source": "asked at the counter"})
    item = client.post(f"/assets/{em}/schedule", json={"kind": "email", "at": when(1), "customers": {}}).json()
    ravi = [c for c in client.get("/customers").json()["customers"] if c["name"] == "Ravi"][0]
    client.put(f"/customers/{ravi['id']}", json={"name": "Ravi", "email": "ravi@example.com", "consent_email": False})  # withdraws before the send
    run(app, datetime.now(timezone.utc) + timedelta(hours=2))
    assert len(FakeSMTP.sent) == 1 and "asha@example.com" in str(FakeSMTP.sent[0]["To"])
    assert "ravi@example.com" not in "".join(str(m["To"]) for m in FakeSMTP.sent)


def test_no_smtp_refuses_an_email_but_allows_a_reminder(rig, monkeypatch):
    app, client, a = rig
    monkeypatch.delenv("SMTP_HOST")
    r = client.post(f"/assets/{a['cold_email']['id']}/schedule", json={"kind": "email", "at": when()})
    assert r.json()["detail"]["code"] == "smtp_not_configured"
    ok = client.post(f"/assets/{a['instagram_post']['id']}/schedule", json={"kind": "reminder", "at": when(), "note": "Post with the cappuccino photo"})
    assert ok.status_code == 200 and ok.json()["note"].startswith("Post")


def test_reminder_becomes_due_then_done_and_is_never_sent(rig):
    app, client, a = rig
    ig = a["instagram_post"]["id"]
    item = client.post(f"/assets/{ig}/schedule", json={"kind": "reminder", "at": when(1)}).json()
    app.state.db.execute("UPDATE scheduled_item SET run_at = ? WHERE id = ?", ((datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat(timespec="seconds"), item["id"]))
    assert run(app) == 0 and FakeSMTP.sent == []
    assert client.get("/schedule").json()["items"][0]["status"] == "due"
    assert client.post(f"/schedule/{item['id']}/done").json()["status"] == "done"
    assert client.post(f"/schedule/{item['id']}/done").json()["detail"]["code"] == "not_pending"


def test_cancel_only_while_pending(rig):
    app, client, a = rig
    item = client.post(f"/assets/{a['cold_email']['id']}/schedule", json={"kind": "email", "at": when(1)}).json()
    assert client.delete(f"/schedule/{item['id']}").json()["status"] == "cancelled"
    assert client.delete(f"/schedule/{item['id']}").json()["detail"]["code"] == "not_pending"
    run(app, datetime.now(timezone.utc) + timedelta(hours=3))
    assert FakeSMTP.sent == [] and client.delete("/schedule/nope").status_code == 404


def test_items_belong_to_their_owner(rig, monkeypatch):
    app, client, a = rig
    item = client.post(f"/assets/{a['instagram_post']['id']}/schedule", json={"kind": "reminder", "at": when()}).json()
    app.state.db.execute("UPDATE scheduled_item SET owner = 'someone@else.com' WHERE id = ?", (item["id"],))
    assert client.get("/schedule").json()["items"] == []
    assert client.delete(f"/schedule/{item['id']}").status_code == 404


def test_the_loop_does_not_start_in_tests(rig):
    app, _, _ = rig
    assert not app.state.tasks
