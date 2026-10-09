"""Learning loop: owner-entered results, verdicts against the history forecast, blending, next idea. No network."""
from app import forecast as fc
from app import learn
from tests.b_helpers import make_client, seed

PLAN = {
    "campaign_id": "x", "status": "locked", "business": {"name": "Brew House", "type": "cafe", "area": "Indiranagar, Bengaluru"},
    "offer_facts": {"item": "filter coffee", "discount_percent": 20, "price_amount": None, "timings": "Saturday and Sunday",
                    "terms": None},
    "audiences": ["students", "families"], "languages": ["en"], "channels": ["instagram_post", "whatsapp", "poster"],
    "cta": {"value": "https://instagram.com/brewhouse"},
    "answers": [{"field": "offer_type", "status": "accepted", "value": "percent_off"}],
}


def setup(tmp_path, monkeypatch):
    app, client = make_client(tmp_path)
    cid, assets = seed(client, app)
    app.state.db.execute("UPDATE asset SET content = ? WHERE campaign_id = ?", ("Filter coffee 20% off on Saturday and Sunday.", cid))
    monkeypatch.setattr(learn.plan, "get_plan", lambda db, campaign_id: PLAN)
    monkeypatch.setattr(fc.plan, "get_plan", lambda db, campaign_id: PLAN)
    return app, client, cid, assets


def test_results_validate_and_upsert(tmp_path, monkeypatch):
    app, c, cid, a = setup(tmp_path, monkeypatch)
    wa = a["whatsapp"]["id"]
    assert c.post(f"/campaign/{cid}/results", json={"results": [{"asset_id": wa, "reach": 100, "redemptions": 200}]}).status_code == 422
    assert c.post(f"/campaign/{cid}/results", json={"results": [{"asset_id": "nope", "reach": 100, "redemptions": 1}]}).status_code == 422
    assert c.post(f"/campaign/nope/results", json={"results": [{"asset_id": wa, "reach": 100, "redemptions": 1}]}).status_code == 404
    first = c.post(f"/campaign/{cid}/results", json={"results": [{"asset_id": wa, "reach": 1000, "redemptions": 160}]}).json()
    second = c.post(f"/campaign/{cid}/results", json={"results": [{"asset_id": wa, "reach": 1000, "redemptions": 170}]}).json()
    assert first["summary"]["assets_with_results"] == second["summary"]["assets_with_results"] == 1  # same asset, replaced
    assert second["items"][0]["redemptions"] == 170 and second["source"] == "Entered by the owner"


def test_verdict_compares_against_the_history_forecast(tmp_path, monkeypatch):
    app, c, cid, a = setup(tmp_path, monkeypatch)
    body = {"results": [
        {"asset_id": a["whatsapp"]["id"], "reach": 1000, "redemptions": 160},       # about 16%: in range
        {"asset_id": a["instagram_post"]["id"], "reach": 1000, "redemptions": 5},   # 0.5%: well below
        {"asset_id": a["poster"]["id"], "reach": 1000, "redemptions": 400},         # 40%: far above
        {"asset_id": a["cold_email"]["id"], "reach": 1000, "redemptions": 30},      # no history for email
    ]}
    out = c.post(f"/campaign/{cid}/results", json=body).json()
    verdicts = {i["channel"]: i["verdict"] for i in out["items"]}
    assert verdicts == {"whatsapp": "within", "instagram_post": "below", "poster": "above", "cold_email": "no_forecast"}
    assert out["summary"]["judged"] == 3 and out["summary"]["within"] == 1
    assert out["summary"]["best_channel"] == "poster"
    assert any("below the expected" in l for l in out["lessons"])


def test_owner_numbers_pull_later_forecasts_toward_them_but_only_a_little_at_first(tmp_path, monkeypatch):
    app, c, cid, a = setup(tmp_path, monkeypatch)
    asset = {"id": "z", "channel": "instagram_post", "lang": "en", "content": "20% off filter coffee", "extra": None}
    base = fc.forecast_asset(asset, "percent_off")["rate"]["mid"]
    one = {"instagram_post": {"rate": 0.20, "weight": 1 / (1 + learn.PRIOR_ASSETS), "n": 1}}
    many = {"instagram_post": {"rate": 0.20, "weight": 20 / (20 + learn.PRIOR_ASSETS), "n": 20}}
    a1 = fc.forecast_asset(asset, "percent_off", owner=one)["rate"]["mid"]
    a20 = fc.forecast_asset(asset, "percent_off", owner=many)["rate"]["mid"]
    assert base < a1 < a20 < 0.20
    assert fc.forecast_asset(asset, "percent_off", owner=one)["owner_adjusted"] is True
    assert fc.forecast_asset(asset, "percent_off")["owner_adjusted"] is False


def test_campaign_forecast_reports_owner_adjustment(tmp_path, monkeypatch):
    app, c, cid, a = setup(tmp_path, monkeypatch)
    c.post(f"/campaign/{cid}/results", json={"results": [{"asset_id": a["whatsapp"]["id"], "reach": 1000, "redemptions": 300}]})
    out = c.get(f"/campaign/{cid}/forecast").json()
    assert "whatsapp_broadcast" in out["owner_adjusted"]
    assert any("your own logged results" in n for n in out["notes"])


def test_next_idea_uses_only_locked_facts_and_ranks_the_best_channel_first(tmp_path, monkeypatch):
    app, c, cid, a = setup(tmp_path, monkeypatch)
    out = c.post(f"/campaign/{cid}/results", json={"results": [
        {"asset_id": a["whatsapp"]["id"], "reach": 1000, "redemptions": 160},
        {"asset_id": a["instagram_post"]["id"], "reach": 1000, "redemptions": 30}]}).json()
    idea = out["next_idea"]
    assert "Brew House" in idea and "20% off filter coffee" in idea and "https://instagram.com/brewhouse" in idea
    assert idea.index("WhatsApp") < idea.index("Instagram post")
    assert "2030" not in idea and "starting" not in idea  # no dates invented: the agent will ask for them
