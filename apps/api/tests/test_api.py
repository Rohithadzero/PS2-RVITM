from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

VALID = "Filter coffee is 20% off this Sunday. ₹80 on 12 October 2026."
NO_DISCOUNT = "Filter coffee this Sunday, ₹80 on 12 October 2026."


def client_for(tmp_path):
    settings = Settings(
        agnes_api_key=None,
        agnes_base_url="https://apihub.agnes-ai.com/v1",
        agnes_origin="https://apihub.agnes-ai.com",
        database_path=tmp_path / "campaign.db",
        assets_dir=tmp_path / "assets",
    )
    return TestClient(create_app(settings))


def _facts(**overrides):
    payload = {
        "item": "filter coffee",
        "discount_percent": 20,
        "price_amount": 80,
        "currency": "INR",
        "dates": ["12 Oct 2026"],
        "timings": "Sunday only",
        "terms": "dine-in",
        "audiences": ["regulars"],
        "languages": ["en"],
        "channels": ["whatsapp", "poster"],
    }
    payload.update(overrides)
    return payload


def test_health_reports_a_missing_agnes_key(tmp_path):
    client = client_for(tmp_path)
    body = client.get("/health").json()
    assert body["ok"] is True
    assert body["agnes_configured"] is False


def test_matrix_validator_and_selective_change(tmp_path):
    client = client_for(tmp_path)
    created = client.post("/voice", json={"transcript": "Sunday filter coffee, 20 percent off, 80 rupees."})
    assert created.status_code == 200
    campaign_id = created.json()["campaign"]["id"]
    assert created.json()["brief_job_id"] is None

    saved = client.put(f"/campaigns/{campaign_id}/facts", json=_facts())
    assert saved.status_code == 200
    assert saved.json()["facts"] is None
    assert saved.json()["draft"]["facts"]["dates"] == ["2026-10-12"]

    locked = client.post("/facts/approve", json={"campaign_id": campaign_id})
    assert locked.status_code == 200
    assert locked.json()["facts"]["approved"] is True
    assert locked.json()["campaign"]["status"] == "facts_locked"

    board = client.post("/campaign/generate", json={"campaign_id": campaign_id})
    assert board.status_code == 200
    assets = board.json()["assets"]
    assert len(assets) == 2
    assert {asset["status"] for asset in assets} == {"pending"}
    assert all(asset["content"] is None for asset in assets)
    assert {job["status"] for job in board.json()["jobs"]} == {"waiting_for_key"}

    again = client.post("/campaign/generate", json={"campaign_id": campaign_id})
    assert len(again.json()["assets"]) == 2
    assert len(again.json()["jobs"]) == 2

    by_channel = {asset["channel"]: asset for asset in assets}
    copy_for = {"whatsapp": VALID, "poster": NO_DISCOUNT}
    for channel, asset in by_channel.items():
        edited = client.patch(f"/assets/{asset['id']}", json={"content": "30% off this Saturday for ₹90."})
        assert edited.status_code == 200
        assert edited.json()["status"] == "blocked"
        refused = client.post(f"/assets/{asset['id']}/approve")
        assert refused.status_code == 409
        assert refused.json()["detail"]["code"] == "validation_failed"

        fixed = client.patch(f"/assets/{asset['id']}", json={"content": copy_for[channel]})
        assert fixed.json()["status"] == "pending"
        approved = client.post(f"/assets/{asset['id']}/approve")
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"

    written = {asset["channel"]: asset for asset in client.get(f"/campaign/{campaign_id}/board").json()["assets"]}
    assert "discount_percent" in written["whatsapp"]["facts_used"]
    assert "discount_percent" not in written["poster"]["facts_used"]

    db = client.app.state.db
    for job in db.jobs_for_campaign(campaign_id):
        db.job_update(job["id"], "2026-01-01T00:00:00+00:00", status="completed", detail="Closed by test.")

    changed = client.post(
        "/campaign/change",
        json={
            "campaign_id": campaign_id,
            "text": "make the discount 10 percent",
            "patch": {"discount_percent": 10},
        },
    )
    assert changed.status_code == 200
    after = {asset["channel"]: asset for asset in changed.json()["assets"]}
    assert after["whatsapp"]["status"] == "changed"
    assert after["whatsapp"]["facts_version"] == 2
    assert after["poster"]["status"] == "approved"
    assert any(event["action"] == "change_applied" for event in changed.json()["events"])
    waiting = {job["asset_id"] for job in changed.json()["jobs"] if job["status"] == "waiting_for_key"}
    assert waiting == {after["whatsapp"]["id"]}

    stale = client.post(f"/assets/{after['whatsapp']['id']}/approve")
    assert stale.status_code == 409


def test_generate_refuses_unlocked_facts(tmp_path):
    client = client_for(tmp_path)
    campaign_id = client.post("/campaigns", json={"transcript": "A lunch offer."}).json()["campaign"]["id"]
    refused = client.post("/campaign/generate", json={"campaign_id": campaign_id})
    assert refused.status_code == 409
    assert refused.json()["detail"]["code"] == "facts_not_approved"


def test_unclassified_voice_change_does_not_touch_assets(tmp_path):
    client = client_for(tmp_path)
    campaign_id = client.post("/voice", json={"transcript": "Coffee offer."}).json()["campaign"]["id"]
    client.put(f"/campaigns/{campaign_id}/facts", json=_facts(channels=["whatsapp"]))
    client.post("/facts/approve", json={"campaign_id": campaign_id})
    client.post("/campaign/generate", json={"campaign_id": campaign_id})
    asset = client.get(f"/campaign/{campaign_id}/board").json()["assets"][0]
    client.patch(f"/assets/{asset['id']}", json={"content": VALID})
    client.post(f"/assets/{asset['id']}/approve")

    board = client.post(
        "/campaign/change",
        json={"campaign_id": campaign_id, "text": "make it feel warmer"},
    )
    assert board.status_code == 200
    assert board.json()["assets"][0]["status"] == "approved"
    assert any(event["action"] == "change_unclassified" for event in board.json()["events"])


def test_weekday_change_catches_copy_that_states_the_old_day(tmp_path):
    client = client_for(tmp_path)
    campaign_id = client.post("/voice", json={"transcript": "Coffee offer."}).json()["campaign"]["id"]
    client.put(f"/campaigns/{campaign_id}/facts", json=_facts(channels=["whatsapp"], timings="Saturday and Sunday"))
    client.post("/facts/approve", json={"campaign_id": campaign_id})
    client.post("/campaign/generate", json={"campaign_id": campaign_id})
    asset = client.get(f"/campaign/{campaign_id}/board").json()["assets"][0]
    client.patch(f"/assets/{asset['id']}", json={"content": "Filter coffee 20% off, ಶನಿವಾರ ಮತ್ತು ಭಾನುವಾರ."})
    client.post(f"/assets/{asset['id']}/approve")

    board = client.post(
        "/campaign/change",
        json={"campaign_id": campaign_id, "text": "make it Sunday only", "patch": {"timings": "Sunday only"}},
    )
    assert board.json()["assets"][0]["status"] == "changed"
