"""Forecast: fit on synthetic history, validated by leave-one-out, honest about what it cannot predict."""
from fastapi.testclient import TestClient

from app import forecast as fc
from app.config import Settings
from app.main import create_app


def asset(channel="whatsapp", lang="en", content="Grab 20% off filter coffee, Saturday and Sunday, 8 am to 11 am."):
    return {"id": "a1", "channel": channel, "lang": lang, "content": content, "extra": None}


def test_model_beats_the_global_mean_in_leave_one_out():
    card = fc.model_card()
    mae = card["leave_one_out_mae"]
    assert card["n"] == 30
    assert mae["channel_mean"] < mae["global_mean"]  # channel carries real signal in the history
    assert card["model"] == ("ridge" if mae["ridge"] < mae["channel_mean"] else "channel_mean")


def test_interval_brackets_the_estimate_and_scales_with_reach():
    out = fc.forecast_asset(asset(), "percent_off")
    r = out["rate"]
    assert out["comparable"] and 0 < r["low"] < r["mid"] < r["high"] < 1
    assert out["redemptions"]["low"] <= out["redemptions"]["mid"] <= out["redemptions"]["high"]
    big = fc.forecast_asset(asset(), "percent_off", reach=out["reach_assumed"] * 2)
    assert big["rate"] == r  # reach is a multiplier, not a model input once channel_mean is used
    assert big["redemptions"]["mid"] >= 2 * out["redemptions"]["mid"] - 2 if fc.fit()["model"] == "channel_mean" else True


def test_whatsapp_is_forecast_above_instagram_story():
    wa = fc.forecast_asset(asset("whatsapp"), "percent_off")["rate"]["mid"]
    story = fc.forecast_asset(asset("instagram_story"), "percent_off")["rate"]["mid"]
    assert wa > story  # the history says broadcasts redeem several times better than stories


def test_channels_without_history_get_no_forecast():
    for channel in ("cold_email", "blog_post", "google_business_post", "reel"):
        out = fc.forecast_asset(asset(channel), "percent_off")
        assert out["comparable"] is False and "history" in out["reason"]


def test_unwritten_asset_and_unknown_offer_are_not_forecast():
    assert fc.forecast_asset(asset(content=None), "percent_off")["comparable"] is False
    assert fc.forecast_asset(asset(), "no_offer")["comparable"] is False


def test_fixed_price_is_flagged_approximate():
    assert fc.forecast_asset(asset(), "fixed_price")["approximate"] is True


def test_forecast_route_404_and_label(tmp_path):
    s = Settings(agnes_api_key=None, agnes_base_url="https://x.test/v1", agnes_origin="https://x.test",
                 database_path=tmp_path / "t.db", assets_dir=tmp_path / "a")
    c = TestClient(create_app(s))
    assert c.get("/campaign/nope/forecast").status_code == 404
    assert "synthetic" in fc.LABEL
