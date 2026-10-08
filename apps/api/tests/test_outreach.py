"""Tracked links, click redirect, outreach events, SMTP send and open pixel. SMTP is a recording stub."""
import json
import smtplib

import pytest

from app import outreach, plan
from b_helpers import PLAN, make_client, seed, write_copy

EMAIL_BODY = "Hi {name},\n\nFilter coffee 20% off on Sunday only, just ₹80."
SMTP_ENV = {
    "SMTP_HOST": "smtp.invalid",
    "SMTP_PORT": "587",
    "SMTP_USER": "user",
    "SMTP_PASSWORD": "pw",
    "SMTP_FROM": "Brew House <hello@brewhouse.example>",
}


class FakeSMTP:
    sent = []
    refuse = set()
    opened = []

    def __init__(self, host, port, timeout=None):
        FakeSMTP.opened.append((host, port))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def ehlo(self):
        pass

    def has_extn(self, name):
        return name == "starttls"

    def starttls(self):
        pass

    def login(self, user, password):
        self.creds = (user, password)

    def send_message(self, message):
        if message["To"] in FakeSMTP.refuse or any(r in str(message["To"]) for r in FakeSMTP.refuse):
            raise smtplib.SMTPRecipientsRefused({})
        FakeSMTP.sent.append(message)


@pytest.fixture
def rig(tmp_path, monkeypatch):
    FakeSMTP.sent, FakeSMTP.refuse, FakeSMTP.opened = [], set(), []
    app, client = make_client(tmp_path)
    state = {"plan": PLAN}
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: state["plan"])
    monkeypatch.setattr(outreach.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://lan.example:8000/")
    for name in SMTP_ENV:
        monkeypatch.delenv(name, raising=False)
    campaign_id, assets = seed(client, app)
    write_copy(app, assets["instagram_post"], status="approved")
    write_copy(app, assets["cold_email"], EMAIL_BODY, status="approved")
    write_copy(app, assets["whatsapp"], status="pending")
    return app, client, campaign_id, assets, state, monkeypatch


def test_link_is_stable_and_redirects_with_logged_click(rig):
    app, client, campaign_id, assets, _, _ = rig
    aid = assets["instagram_post"]["id"]
    link = client.post(f"/assets/{aid}/link").json()
    assert link["url"] == f"http://lan.example:8000/r/{link['code']}"
    assert client.post(f"/assets/{aid}/link").json() == link
    hit = client.get(f"/r/{link['code']}", follow_redirects=False, headers={"user-agent": "UA-1", "referer": "https://ig.example/"})
    assert hit.status_code == 302 and hit.headers["location"] == "https://brewhouse.example/visit"
    row = app.state.db.query_one("SELECT * FROM click")
    assert (row["asset_id"], row["channel"], row["lang"], row["ua"], row["referrer"]) == (aid, "instagram_post", "en", "UA-1", "https://ig.example/")
    assert row["ts"]


def test_no_destination_never_redirects_and_logs_nothing(rig):
    app, client, _, assets, state, _ = rig
    aid = assets["instagram_post"]["id"]
    code = client.post(f"/assets/{aid}/link").json()["code"]
    state["plan"] = {**PLAN, "cta": {"kind": "url", "value": "", "destination_url": None}}
    resp = client.get(f"/r/{code}", follow_redirects=False)
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "no_cta"
    assert client.post(f"/assets/{aid}/link").json()["detail"]["code"] == "no_cta"
    state["plan"] = None
    assert client.get(f"/r/{code}", follow_redirects=False).status_code == 409
    assert app.state.db.query("SELECT * FROM click") == []
    assert client.get("/r/nosuch", follow_redirects=False).status_code == 404


def test_outreach_actions_need_an_approved_asset(rig):
    app, client, _, assets, _, _ = rig
    ok = client.post(f"/assets/{assets['instagram_post']['id']}/outreach", json={"action": "copied"})
    assert ok.status_code == 200 and ok.json()["action"] == "copied" and ok.json()["ts"]
    assert client.post(f"/assets/{assets['instagram_post']['id']}/outreach", json={"action": "teleported"}).status_code == 400
    refused = client.post(f"/assets/{assets['whatsapp']['id']}/outreach", json={"action": "shared_whatsapp"})
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "not_approved"
    assert len(app.state.db.query("SELECT * FROM outreach_event")) == 1


def test_send_email_refusals(rig):
    app, client, _, assets, _, monkeypatch = rig
    email = assets["cold_email"]["id"]
    assert client.post(f"/assets/{assets['instagram_post']['id']}/send-email").json()["detail"]["code"] == "not_email"
    app.state.db.asset_update(email, status="pending")
    assert client.post(f"/assets/{email}/send-email").json()["detail"]["code"] == "not_approved"
    app.state.db.asset_update(email, status="approved")
    resp = client.post(f"/assets/{email}/send-email")
    assert resp.status_code == 409 and resp.json()["detail"]["code"] == "smtp_not_configured"
    for name, value in SMTP_ENV.items():
        monkeypatch.setenv(name, value)
    monkeypatch.delenv("SMTP_PASSWORD")
    assert client.post(f"/assets/{email}/send-email").json()["detail"]["code"] == "smtp_not_configured"
    assert FakeSMTP.sent == []


def test_send_email_fills_name_adds_link_and_pixel_and_logs(rig):
    app, client, campaign_id, assets, _, monkeypatch = rig
    for name, value in SMTP_ENV.items():
        monkeypatch.setenv(name, value)
    email = assets["cold_email"]["id"]
    app.state.db.execute("UPDATE asset SET content = ? WHERE id = ?", (EMAIL_BODY, email))
    resp = client.post(
        f"/assets/{email}/send-email",
        json={"recipients": [{"name": "Ravi", "email": "ravi@example.com"}, {"email": "nameless@example.com"}, {"name": "Bad", "email": "not-an-email"}]},
    )
    assert resp.status_code == 200
    assert resp.json() == {"sent": 2, "failed": [{"email": "not-an-email", "error": "invalid email address"}]}
    assert FakeSMTP.opened == [("smtp.invalid", 587)]
    first, second = FakeSMTP.sent
    assert first["To"] == "Ravi <ravi@example.com>" and first["From"] == SMTP_ENV["SMTP_FROM"]
    assert first["Subject"] == "Brew House"
    text = first.get_body(("plain",)).get_content()
    assert text.startswith("Hi Ravi,") and "{name}" not in text
    link = client.post(f"/assets/{email}/link").json()["url"]
    assert text.rstrip().endswith(link)
    html = first.get_body(("html",)).get_content()
    sends = app.state.db.query("SELECT * FROM email_send ORDER BY id")
    assert len(sends) == 2 and f"http://lan.example:8000/o/{sends[0]['token']}.gif" in html and link in html
    assert second.get_body(("plain",)).get_content().startswith("Hi,")

    pixel = client.get(f"/o/{sends[0]['token']}.gif")
    assert pixel.status_code == 200 and pixel.headers["content-type"] == "image/gif" and pixel.content.startswith(b"GIF89a")
    client.get(f"/o/{sends[0]['token']}.gif")
    client.get(f"/o/{'0' * 32}.gif")
    client.get("/o/junk.gif")
    assert len(app.state.db.query("SELECT * FROM email_open")) == 2
    counts = outreach.outreach_counts(app.state.db, campaign_id)[email]
    assert counts["email_sent"] == 2 and counts["opens"] == 1


def test_send_uses_plan_recipients_and_extra_subject_and_records_failures(rig):
    app, client, campaign_id, assets, _, monkeypatch = rig
    for name, value in SMTP_ENV.items():
        monkeypatch.setenv(name, value)
    email = assets["cold_email"]["id"]
    app.state.db.ensure("", (("asset", "extra", "TEXT"),))
    app.state.db.execute("UPDATE asset SET extra = ? WHERE id = ?", (json.dumps({"subject": "Sunday coffee offer"}), email))
    resp = client.post(f"/assets/{email}/send-email")
    assert resp.json() == {"sent": 1, "failed": []}
    assert FakeSMTP.sent[0]["Subject"] == "Sunday coffee offer"
    FakeSMTP.refuse = {"asha@example.com"}
    again = client.post(f"/assets/{email}/send-email").json()
    assert again["sent"] == 0 and again["failed"][0]["email"] == "asha@example.com"
    assert len(app.state.db.query("SELECT * FROM email_send")) == 1
    assert app.state.db.query_one("SELECT * FROM outreach_event WHERE action = 'email_failed'")
    assert client.post(f"/assets/{email}/send-email", json={"recipients": []}).json()["detail"]["code"] == "no_recipients"
