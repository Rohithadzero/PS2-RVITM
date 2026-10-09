"""Unsubscribe: a link in every email, GET only asks, POST stops, and a stop is final for every sender path."""
import re

import pytest

from app import outreach, plan, unsubscribe
from b_helpers import PLAN, make_client, seed, write_copy
from test_outreach import EMAIL_BODY, SMTP_ENV, FakeSMTP


@pytest.fixture
def rig(tmp_path, monkeypatch):
    FakeSMTP.sent, FakeSMTP.refuse, FakeSMTP.opened = [], set(), []
    app, client = make_client(tmp_path)
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    monkeypatch.setattr(outreach.smtplib, "SMTP", FakeSMTP)
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://growit.example")
    for k, v in SMTP_ENV.items():
        monkeypatch.setenv(k, v)
    cid, assets = seed(client, app)
    write_copy(app, assets["cold_email"], EMAIL_BODY, status="approved")
    return app, client, assets["cold_email"]["id"]


def token_from(message):
    return re.search(r"/u/([0-9a-f]{32})", message["List-Unsubscribe"]).group(1)


def test_every_email_has_a_footer_link_and_one_click_headers(rig):
    app, c, em = rig
    assert c.post(f"/assets/{em}/send-email", json={"recipients": [{"name": "Ravi", "email": "ravi@example.com"}]}).json()["sent"] == 1
    m = FakeSMTP.sent[0]
    assert m["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    url = m["List-Unsubscribe"].strip("<>")
    assert url.startswith("https://growit.example/u/")
    body = m.get_body(preferencelist=("plain",)).get_content()
    html = m.get_body(preferencelist=("html",)).get_content()
    assert url in body and url in html


def test_get_only_asks_post_unsubscribes(rig):
    app, c, em = rig
    c.post(f"/assets/{em}/send-email", json={"recipients": [{"email": "ravi@example.com"}]})
    t = token_from(FakeSMTP.sent[0])
    page = c.get(f"/u/{t}")
    assert page.status_code == 200 and "ravi@example.com" in page.text and "<form" in page.text
    assert not unsubscribe.is_suppressed(app.state.db, "ravi@example.com")  # a scanner visiting changed nothing
    done = c.post(f"/u/{t}")
    assert done.status_code == 200 and "unsubscribed" in done.text.lower()
    assert unsubscribe.is_suppressed(app.state.db, "RAVI@example.com")
    assert "default-src 'none'" in done.headers["content-security-policy"]


def test_bad_tokens_are_refused(rig):
    _, c, _ = rig
    assert c.get("/u/nope").status_code == 404 and c.post("/u/" + "0" * 32).status_code == 404


def test_an_unsubscribed_address_is_never_emailed_again_even_when_typed_in(rig):
    app, c, em = rig
    c.post(f"/assets/{em}/send-email", json={"recipients": [{"email": "ravi@example.com"}]})
    c.post(f"/u/{token_from(FakeSMTP.sent[0])}")
    FakeSMTP.sent.clear()
    out = c.post(f"/assets/{em}/send-email", json={"recipients": [{"email": "Ravi@Example.com"}, {"email": "asha@example.com"}]}).json()
    assert out["sent"] == 1 and out["failed"][0]["error"].startswith("unsubscribed")
    assert "ravi@example.com" not in "".join(str(m["To"]).lower() for m in FakeSMTP.sent)


def test_the_customer_is_switched_off_and_stays_out_even_if_re_ticked(rig):
    app, c, em = rig
    made = c.post("/customers", json={"name": "Ravi", "email": "ravi@example.com", "consent_email": True, "consent_source": "counter notebook"}).json()
    c.post(f"/assets/{em}/send-email", json={"recipients": [{"email": "ravi@example.com"}]})
    c.post(f"/u/{token_from(FakeSMTP.sent[0])}")
    cust = [x for x in c.get("/customers").json()["customers"] if x["id"] == made["id"]][0]
    assert cust["consent_email"] is False and "Unsubscribed by the customer" in cust["consent_source"]
    c.put(f"/customers/{made['id']}", json={"name": "Ravi", "email": "ravi@example.com", "consent_email": True, "consent_source": "asked again"})
    assert c.get("/customers/recipients", params={"channel": "email"}).json()["count"] == 0
    FakeSMTP.sent.clear()
    r = c.post(f"/assets/{em}/send-email", json={"customers": {}})
    assert r.status_code == 409 and r.json()["detail"]["code"] == "no_consented_customers" and FakeSMTP.sent == []
