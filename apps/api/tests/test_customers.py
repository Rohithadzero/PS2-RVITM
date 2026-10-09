"""Customers list: validation, consent, import, export, isolation, and that sends only reach people who agreed. No network."""
import pytest
from fastapi.testclient import TestClient

from app import auth, customers, outreach, plan
from app.config import Settings
from app.main import create_app
from b_helpers import PLAN, seed, write_copy
from test_outreach import SMTP_ENV, FakeSMTP

CSV = """Name,Mobile,E-mail,Lang,Segment,Notes
Asha Rao,98450 12345,asha@example.com,kannada,"students, regulars",likes filter coffee
Ravi,+91 99000 11122,,hi,regulars,
,98000 00000,noname@example.com,en,,
Meena,12345,,en,,bad phone
Asha Again,98450 12345,,en,,same number as Asha
=cmd|' /C calc'!A0,97000 11122,,en,,formula in the name
"""


def make(tmp_path, monkeypatch, *, require=False):
    for n in ("REQUIRE_LOGIN", "ALLOWED_EMAILS"):
        monkeypatch.delenv(n, raising=False)
    if require:
        monkeypatch.setenv("REQUIRE_LOGIN", "1")
    s = Settings(agnes_api_key=None, agnes_base_url="http://x.invalid/v1", agnes_origin="http://x.invalid", database_path=tmp_path / "t.db", assets_dir=tmp_path / "a")
    return TestClient(create_app(s), base_url="http://127.0.0.1:8000")


def add(c, **kw):
    return c.post("/customers", json={"name": "Asha Rao", "phone": "98450 12345", **kw})


def test_a_person_is_cleaned_and_starts_with_no_consent(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    r = add(c, email="Asha@Example.com", language="kannada", tags="Students, regulars, students")
    assert r.status_code == 200
    p = r.json()
    assert p["phone"] == "919845012345" and p["email"] == "asha@example.com" and p["language"] == "kn" and p["tags"] == ["students", "regulars"]
    assert p["consent_whatsapp"] is False and p["consent_email"] is False and p["consent_at"] is None


@pytest.mark.parametrize("body,reason", [
    ({"name": ""}, "name is missing"), ({"name": "A", "phone": "12345"}, "phone: wrong length"), ({"name": "A", "email": "not-an-email"}, "email does not look right"),
    ({"name": "A"}, "needs a phone number or an email"), ({"name": "A", "phone": "98450 12345", "language": "tamil"}, "language must be en, kn or hi"),
])
def test_bad_people_are_refused_with_a_reason(tmp_path, monkeypatch, body, reason):
    r = make(tmp_path, monkeypatch).post("/customers", json=body)
    assert r.status_code == 422 and r.json()["detail"]["message"] == reason


def test_consent_needs_a_note_on_how_the_person_agreed_and_only_counts_for_a_channel_with_a_contact(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    r = add(c, consent_whatsapp=True)
    assert r.status_code == 422 and r.json()["detail"]["code"] == "consent_source_needed"
    ok = add(c, consent_whatsapp=True, consent_email=True, consent_source="signed the counter notebook").json()
    assert ok["consent_whatsapp"] is True and ok["consent_email"] is False  # no email on file, so no email consent
    assert ok["consent_source"] == "signed the counter notebook" and ok["consent_at"]


def test_the_same_phone_or_email_cannot_be_added_twice(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    add(c, email="asha@example.com")
    assert add(c).status_code == 409
    assert c.post("/customers", json={"name": "Someone", "email": "ASHA@example.com"}).status_code == 409


def test_edit_keeps_the_original_consent_time_and_delete_removes(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    p = add(c, consent_whatsapp=True, consent_source="counter").json()
    e = c.put(f"/customers/{p['id']}", json={"name": "Asha R", "phone": "98450 12345", "consent_whatsapp": True}).json()
    assert e["name"] == "Asha R" and e["consent_at"] == p["consent_at"] and e["consent_source"] == "counter"
    off = c.put(f"/customers/{p['id']}", json={"name": "Asha R", "phone": "98450 12345", "consent_whatsapp": False}).json()
    assert off["consent_whatsapp"] is False and off["consent_at"] is None and off["consent_source"] is None  # withdrawn consent leaves no stale record
    assert c.delete(f"/customers/{p['id']}").json() == {"deleted": True}
    assert c.delete(f"/customers/{p['id']}").status_code == 404
    assert c.get("/customers").json()["summary"]["total"] == 0


def test_dry_run_import_shows_what_would_happen_and_stores_nothing(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    r = c.post("/customers/import", json={"csv": CSV}).json()
    assert r["dry_run"] is True and r["added"] == 3 and r["skipped_duplicates"] == 1 and r["error_count"] == 2
    assert {e["reason"] for e in r["errors"]} == {"name is missing", "phone: wrong length"}
    assert [x["name"] for x in r["preview"]][:2] == ["Asha Rao", "Ravi"] and r["preview"][0]["phone"] == "919845012345" and r["preview"][0]["language"] == "kn"
    assert c.get("/customers").json()["summary"]["total"] == 0


def test_committed_import_stores_people_without_consent_unless_the_owner_says_so(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    r = c.post("/customers/import", json={"csv": CSV, "dry_run": False}).json()
    assert r["added"] == 3 and r["summary"]["total"] == 3 and r["summary"]["whatsapp_ok"] == 0
    c2 = make(tmp_path / "b", monkeypatch)
    refused = c2.post("/customers/import", json={"csv": CSV, "dry_run": False, "consent_whatsapp": True})
    assert refused.status_code == 422 and refused.json()["detail"]["code"] == "consent_source_needed"
    ok = c2.post("/customers/import", json={"csv": CSV, "dry_run": False, "consent_whatsapp": True, "consent_source": "counter sign-up sheet, Oct 2026"}).json()
    assert ok["summary"]["whatsapp_ok"] == 3 and ok["summary"]["email_ok"] == 0


def test_import_updates_existing_people_only_when_asked_and_merges_tags(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    add(c, tags="regulars")
    again = "name,phone,tags\nAsha Rao,98450 12345,students\n"
    assert c.post("/customers/import", json={"csv": again, "dry_run": False}).json()["skipped_duplicates"] == 1
    r = c.post("/customers/import", json={"csv": again, "dry_run": False, "update_existing": True}).json()
    assert r["updated"] == 1
    assert c.get("/customers").json()["customers"][0]["tags"] == ["regulars", "students"]


@pytest.mark.parametrize("text,code", [("", "empty_file"), ("name,phone\n", "no_rows"), ("city,age\nx,1\n", "columns_missing"), ("name\nAsha\n", "columns_missing")])
def test_bad_files_are_explained(tmp_path, monkeypatch, text, code):
    r = make(tmp_path, monkeypatch).post("/customers/import", json={"csv": text})
    assert r.status_code == 422 and r.json()["detail"]["code"] == code


def test_semicolon_files_from_excel_with_a_byte_order_mark_are_read(tmp_path, monkeypatch):
    r = make(tmp_path, monkeypatch).post("/customers/import", json={"csv": "﻿name;phone;email\nAsha;98450 12345;a@b.co\nRavi;99000 11122;\n"}).json()
    assert r["added"] == 2 and r["error_count"] == 0


def test_export_escapes_cells_that_would_run_as_spreadsheet_formulas(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    c.post("/customers", json={"name": "=HYPERLINK(\"http://evil\")", "phone": "98450 12345", "notes": "+1+1"})
    body = c.get("/customers/export.csv").text
    assert "'=HYPERLINK" in body and "'+1+1" in body and "attachment" in c.get("/customers/export.csv").headers["content-disposition"]
    assert body.splitlines()[0].startswith("name,phone,email")


def test_search_and_filters(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    c.post("/customers/import", json={"csv": CSV, "dry_run": False, "consent_email": True, "consent_whatsapp": True, "consent_source": "counter"})
    names = lambda **q: sorted(p["name"] for p in c.get("/customers", params=q).json()["customers"])
    assert names(q="asha") == ["Asha Rao"] and names(q="99000") == ["Ravi"] and names(language="hi") == ["Ravi"] and names(tag="students") == ["Asha Rao"]
    assert names(q="rao") == ["Asha Rao"] and "Ravi" not in names(q="asha")  # a name search does not match every phone number
    assert len(names(consent="whatsapp")) == 3 and names(consent="none") == []


def test_delete_all_needs_confirmation(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    add(c)
    assert c.delete("/customers").status_code == 400
    assert c.delete("/customers", params={"confirm": True}).json() == {"deleted": 1}


def test_each_owner_sees_only_their_own_list(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch, require=True)
    assert c.get("/customers").status_code == 401
    for email in ("a@example.com", "b@example.com"):
        c.cookies.clear()
        c.cookies.set(auth.SESSION_COOKIE, auth.sign(c.app, {"email": email, "name": email, "sub": email}, 600))
        if email == "a@example.com":
            assert add(c).status_code == 200
    assert c.get("/customers").json()["summary"]["total"] == 0  # b sees nothing of a's
    c.cookies.set(auth.SESSION_COOKIE, auth.sign(c.app, {"email": "a@example.com", "name": "a", "sub": "a"}, 600))
    assert c.get("/customers").json()["summary"]["total"] == 1


def test_recipients_are_only_people_who_agreed_on_that_channel_with_a_valid_contact(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    add(c, consent_whatsapp=True, consent_source="counter")
    c.post("/customers", json={"name": "Ravi", "phone": "99000 11122"})  # no consent
    c.post("/customers", json={"name": "Mail only", "email": "m@example.com", "consent_email": True, "consent_source": "form"})
    wa = c.get("/customers/recipients", params={"channel": "whatsapp"}).json()
    em = c.get("/customers/recipients", params={"channel": "email"}).json()
    assert [p["name"] for p in wa["people"]] == ["Asha Rao"] and [p["name"] for p in em["people"]] == ["Mail only"]
    assert "phone" not in wa["people"][0] and "email" not in em["people"][0]  # the picker needs names, not contact details
    assert c.get("/customers/recipients", params={"channel": "sms"}).status_code == 422


# ---- sends only reach consented people
@pytest.fixture
def rig(tmp_path, monkeypatch):
    c = make(tmp_path, monkeypatch)
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    monkeypatch.setattr(outreach.smtplib, "SMTP", FakeSMTP)
    FakeSMTP.sent, FakeSMTP.refuse, FakeSMTP.opened = [], set(), []
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://loudlaunch.example")
    cid, assets = seed(c, c.app)
    write_copy(c.app, assets["whatsapp"], status="approved")
    write_copy(c.app, assets["cold_email"], "Hi {name},\n\nFilter coffee 20% off on Sunday only, just ₹80.", status="approved")
    add(c, email="asha@example.com", consent_whatsapp=True, consent_email=True, consent_source="counter notebook")
    c.post("/customers", json={"name": "Ravi", "phone": "99000 11122", "email": "ravi@example.com"})  # never agreed
    c.post("/customers", json={"name": "Kn Reader", "phone": "97000 11122", "language": "kn", "consent_whatsapp": True, "consent_source": "form"})
    return c, assets, monkeypatch


def test_whatsapp_chats_are_prepared_only_for_consented_customers(rig):
    c, assets, _ = rig
    out = c.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"customers": {}}).json()
    assert sorted(r["name"] for r in out["recipients"]) == ["Asha Rao", "Kn Reader"] and all(r["wa_url"].startswith("https://wa.me/91") for r in out["recipients"])
    assert all("Ravi" not in r["number"] for r in out["recipients"])
    kn = c.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"customers": {"language": "kn"}}).json()
    assert [r["name"] for r in kn["recipients"]] == ["Kn Reader"]
    nobody = c.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"customers": {"tag": "nobody"}})
    assert nobody.status_code == 409 and nobody.json()["detail"]["code"] == "no_consented_customers"


def test_email_goes_only_to_customers_who_agreed_to_email(rig):
    c, assets, monkeypatch = rig
    for k, v in SMTP_ENV.items():
        monkeypatch.setenv(k, v)
    out = c.post(f"/assets/{assets['cold_email']['id']}/send-email", json={"customers": {}}).json()
    assert out["sent"] == 1 and [m["To"] for m in FakeSMTP.sent] == ["Asha Rao <asha@example.com>"]
    c.put(f"/customers/{c.get('/customers', params={'q': 'asha'}).json()['customers'][0]['id']}", json={"name": "Asha Rao", "phone": "98450 12345", "email": "asha@example.com"})
    refused = c.post(f"/assets/{assets['cold_email']['id']}/send-email", json={"customers": {}})
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "no_consented_customers"
