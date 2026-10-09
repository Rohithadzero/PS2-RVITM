"""WhatsApp click-to-chat: numbers are cleaned, text comes from the server, only approved assets, honest about dead links."""
from urllib.parse import parse_qs, unquote, urlparse

import pytest

from app import plan, whatsapp
from b_helpers import PLAN, make_client, seed, write_copy


@pytest.mark.parametrize("raw,expected", [
    ("98450 12345", "919845012345"), ("+91 98450-12345", "919845012345"), ("098450 12345", "919845012345"),
    ("0091 98450 12345", "919845012345"), ("(98450) 12345", "919845012345"), ("+1 415 555 0132", "14155550132"),
    ("919845012345", "919845012345"),
])
def test_numbers_are_cleaned_to_wa_me_digits(raw, expected):
    assert whatsapp.normalize_phone(raw) == (expected, None)


@pytest.mark.parametrize("raw,reason", [
    ("", "empty"), ("call me", "contains letters"), ("12345", "wrong length"), ("5845012345", "Indian mobile numbers start with 6, 7, 8 or 9"),
    ("+91 98450 123456789", "wrong length"),
])
def test_bad_numbers_are_refused_with_a_reason(raw, reason):
    assert whatsapp.normalize_phone(raw) == (None, reason)


def test_masking_hides_all_but_the_end():
    m = whatsapp.mask("919845012345")
    assert m.endswith("345") and "98450" not in m and m.startswith("+91")


@pytest.fixture
def rig(tmp_path, monkeypatch):
    app, client = make_client(tmp_path)
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: PLAN)
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://growit.example")
    cid, assets = seed(client, app)
    write_copy(app, assets["whatsapp"], status="approved")
    write_copy(app, assets["poster"], status="pending")
    return app, client, cid, assets, monkeypatch


def test_the_server_builds_the_message_and_one_chat_link_per_valid_number(rig):
    app, client, _, assets, _ = rig
    out = client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": ["98450 12345", "+91 99000 11122", "99000 11122", "oops", ""]}).json()
    assert out["has_link"] and out["link"].startswith("https://growit.example/r/") and out["link"] in out["text"]
    assert out["duplicates_dropped"] == 1 and out["invalid"] == 2
    good = [r for r in out["recipients"] if r["valid"]]
    assert len(good) == 2
    first = urlparse(good[0]["wa_url"])
    assert first.netloc == "wa.me" and first.path == "/919845012345"
    assert unquote(parse_qs(first.query)["text"][0]) == out["text"]
    assert all("9845012345" not in r["number"] for r in out["recipients"])  # masked in the answer
    assert out["chat_url"].startswith("https://wa.me/?text=")
    assert "agreed to hear from you" in out["note"]


def test_only_approved_assets_can_be_prepared(rig):
    app, client, _, assets, _ = rig
    refused = client.post(f"/assets/{assets['poster']['id']}/whatsapp", json={"numbers": ["98450 12345"]})
    assert refused.status_code == 409 and refused.json()["detail"]["code"] == "not_approved"
    assert client.post("/assets/nope/whatsapp", json={"numbers": []}).status_code == 404


def test_a_batch_is_capped(rig):
    _, client, _, assets, _ = rig
    numbers = [f"9{i:09d}" for i in range(100000000, 100000060)]
    r = client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": numbers})
    assert r.status_code == 422 and r.json()["detail"]["code"] == "too_many"


def test_a_link_that_only_works_on_this_computer_is_flagged(rig):
    _, client, _, assets, monkeypatch = rig
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://127.0.0.1:8000")
    out = client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": []}).json()
    assert out["link_reachable"] is False and out["has_link"] is True
    monkeypatch.setenv("PUBLIC_BASE_URL", "http://192.168.1.20:8000")
    assert client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": []}).json()["link_reachable"] is False
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://abc.trycloudflare.com")
    assert client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": []}).json()["link_reachable"] is True


def test_without_a_call_to_action_the_text_goes_without_a_link(rig):
    app, client, _, assets, monkeypatch = rig
    monkeypatch.setattr(plan, "get_plan", lambda db, cid: {**PLAN, "cta": {"kind": "url", "value": "", "destination_url": None}})
    out = client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": []}).json()
    assert out["has_link"] is False and out["link"] is None and "http" not in out["text"]


def test_kannada_text_survives_the_url_round_trip(rig):
    app, client, _, assets, _ = rig
    write_copy(app, assets["whatsapp"], "ಫಿಲ್ಟರ್ ಕಾಫಿ ಮೇಲೆ 20% ರಿಯಾಯಿತಿ, ಭಾನುವಾರ ಮಾತ್ರ, ₹80.", status="approved")
    out = client.post(f"/assets/{assets['whatsapp']['id']}/whatsapp", json={"numbers": ["98450 12345"]}).json()
    url = out["recipients"][0]["wa_url"]
    assert unquote(parse_qs(urlparse(url).query)["text"][0]).startswith("ಫಿಲ್ಟರ್ ಕಾಫಿ")


def test_poster_style_assets_say_the_picture_must_be_attached_by_hand(rig):
    app, client, _, assets, _ = rig
    app.state.db.asset_update(assets["poster"]["id"], status="approved")
    out = client.post(f"/assets/{assets['poster']['id']}/whatsapp", json={"numbers": []}).json()
    assert "attach it yourself" in out["image_note"]
