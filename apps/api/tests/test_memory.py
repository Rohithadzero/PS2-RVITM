"""Memory: owner-written items, suggestions that wait for acceptance, dismissals that stick, and a copy prompt that never sees prices."""
import json

import pytest

from app import memory, prompts
from b_helpers import make_client, seed
from app.schemas import OfferFacts


@pytest.fixture
def rig(tmp_path):
    app, client = make_client(tmp_path)
    seed(client, app)  # approved facts: filter coffee, 20% off, Sunday only
    client.put("/business", json={"name": "Brew Bandi", "phone": "98450 12345", "hours": "8am to 9pm", "menu": [{"name": "Filter coffee", "price": 60}]})
    return app, client


def test_owner_can_add_edit_pin_and_delete(rig):
    _, c = rig
    made = c.post("/memory", json={"kind": "menu", "title": "Dosa menu", "body": "Plain dosa 70", "pinned": True}).json()
    assert made["source"] == "you" and made["status"] == "active" and made["pinned"]
    edited = c.put(f"/memory/{made['id']}", json={"kind": "menu", "title": "Dosa menu", "body": "Plain dosa 75"}).json()
    assert edited["body"] == "Plain dosa 75" and not edited["pinned"]
    assert [i["title"] for i in c.get("/memory").json()["items"]] == ["Dosa menu"]
    assert c.get("/memory", params={"q": "75"}).json()["items"] and not c.get("/memory", params={"q": "zzz"}).json()["items"]
    c.delete(f"/memory/{made['id']}")
    assert c.get("/memory").json()["items"] == []
    assert c.post("/memory", json={"kind": "bogus", "title": "x"}).json()["detail"]["code"] == "bad_kind"


def test_refresh_proposes_suggestions_with_evidence_and_uses_none_until_accepted(rig):
    _, c = rig
    out = c.post("/memory/refresh").json()
    assert out["added"] >= 3
    got = c.get("/memory").json()
    assert got["items"] == [] and got["suggested"]
    titles = {s["title"] for s in got["suggested"]}
    assert {"Menu and prices", "Opening hours"} <= titles and any(t.startswith("Offer: filter coffee") for t in titles)
    menu = [s for s in got["suggested"] if s["title"] == "Menu and prices"][0]
    assert menu["source"] == "growit" and "Filter coffee: ₹60" in menu["body"] and menu["evidence"]
    assert c.post("/memory/refresh").json()["added"] == 0  # same facts, nothing new


def test_accept_keeps_it_and_the_next_refresh_does_not_overwrite_it(rig):
    _, c = rig
    c.post("/memory/refresh")
    sug = [s for s in c.get("/memory").json()["suggested"] if s["title"] == "Opening hours"][0]
    assert c.post(f"/memory/{sug['id']}/accept").json()["status"] == "active"
    c.put("/business", json={"hours": "9am to 5pm"})
    out = c.post("/memory/refresh").json()
    kept = [i for i in c.get("/memory").json()["items"] if i["title"] == "Opening hours"][0]
    assert kept["body"] == "8am to 9pm" and out["updated"] == 0


def test_a_waiting_suggestion_follows_new_data(rig):
    _, c = rig
    c.post("/memory/refresh")
    c.put("/business", json={"hours": "10am to 6pm"})
    assert c.post("/memory/refresh").json()["updated"] == 1
    assert [s for s in c.get("/memory").json()["suggested"] if s["title"] == "Opening hours"][0]["body"] == "10am to 6pm"


def test_dismissed_or_deleted_suggestions_do_not_return(rig):
    _, c = rig
    c.post("/memory/refresh")
    for s in c.get("/memory").json()["suggested"]:
        c.post(f"/memory/{s['id']}/dismiss")
    assert c.get("/memory").json()["suggested"] == [] and c.post("/memory/refresh").json()["added"] == 0
    assert c.post("/memory/nope/accept").status_code == 404


def test_editing_a_suggestion_makes_it_the_owners(rig):
    _, c = rig
    c.post("/memory/refresh")
    s = c.get("/memory").json()["suggested"][0]
    r = c.put(f"/memory/{s['id']}", json={"kind": s["kind"], "title": s["title"], "body": "My own words"}).json()
    assert r["source"] == "you" and r["status"] == "active"


def test_only_voice_and_rules_reach_the_copy_prompt_and_never_a_price(rig):
    app, c = rig
    c.post("/memory", json={"kind": "voice", "title": "Warm and short", "body": "Talk like a neighbour."})
    c.post("/memory", json={"kind": "rules", "title": "No discounts talk", "body": "Never say cheap."})
    c.post("/memory", json={"kind": "menu", "title": "Menu", "body": "Coffee 999 rupees"})
    c.post("/memory", json={"kind": "voice", "title": "Private", "body": "Do not use me", "use_ai": False})
    notes = memory.prompt_notes(app.state.db)
    assert len(notes) == 2 and all("999" not in n for n in notes) and any(n.startswith("Avoid:") for n in notes) and not any("Private" in n for n in notes)
    facts = OfferFacts(item="filter coffee", audiences=["regulars"])
    msgs = prompts.copy_messages(facts, {"lang": "en", "channel": "whatsapp"}, None, {"owner_notes": notes})
    user = json.loads(msgs[1]["content"])
    assert user["owner_notes"] == notes and "never a source for a price" in msgs[0]["content"]


def test_export_and_forget(rig):
    _, c = rig
    c.post("/memory", json={"kind": "other", "title": "A", "body": "b"})
    assert [i["title"] for i in c.get("/memory/export").json()["items"]] == ["A"]
    assert c.delete("/memory").json()["detail"]["code"] == "confirm_required"
    c.delete("/memory", params={"confirm": "true"})
    assert c.get("/memory").json() == {**c.get("/memory").json(), "items": [], "suggested": []}


def test_memory_belongs_to_its_owner(rig):
    app, c = rig
    made = c.post("/memory", json={"kind": "other", "title": "Mine"}).json()
    app.state.db.execute("UPDATE memory_item SET owner = 'other@x.com'")
    assert c.get("/memory").json()["items"] == [] and c.put(f"/memory/{made['id']}", json={"kind": "other", "title": "x"}).status_code == 404


def test_results_you_entered_become_a_suggestion_with_evidence(rig):
    app, c = rig
    campaign = app.state.db.campaign_list()[0]["id"]
    assets = app.state.db.assets_for(campaign)
    wa = [a for a in assets if a["channel"] == "whatsapp"][0]
    r = c.post(f"/campaign/{campaign}/results", json={"results": [{"asset_id": wa["id"], "reach": 200, "redemptions": 30}]})
    assert r.status_code == 200, r.text
    c.post("/memory/refresh")
    got = [s for s in c.get("/memory").json()["suggested"] if s["kind"] == "results"]
    assert got and got[0]["title"].startswith("What worked: filter coffee") and "Best channel: whatsapp" in got[0]["body"]
    assert "200" in got[0]["evidence"] and got[0]["status"] == "suggested"
