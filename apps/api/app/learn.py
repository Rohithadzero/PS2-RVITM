"""learn: close the loop. The owner logs what actually happened; the app compares it with its own forecast, says what it got
wrong, adjusts later forecasts with the owner's real numbers, and drafts the next campaign for approval.

Results are entered by the owner (people reached and people who redeemed, per asset). Nothing here is measured by the app
except what the owner types, so every payload says where the numbers came from. Few results move the forecast only a
little: the owner's pooled rate is blended in with weight n / (n + PRIOR_ASSETS), where n counts assets with results.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app import forecast as fc
from app import plan
from app.db import Database
from app.media import fail
from app.service import now

router = APIRouter()

PRIOR_ASSETS = 5
SCHEMA = """
CREATE TABLE IF NOT EXISTS result (
  asset_id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  reach INTEGER NOT NULL,
  redemptions INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_result_campaign ON result(campaign_id);
"""
SOURCE = "Entered by the owner"


def ensure_schema(db: Database) -> None:
    db.ensure(SCHEMA)


class ResultIn(BaseModel):
    asset_id: str
    reach: int = Field(gt=0, le=10_000_000)
    redemptions: int = Field(ge=0)


class ResultsIn(BaseModel):
    results: list[ResultIn] = Field(min_length=1, max_length=100)


def owner_channel_stats(db: Database) -> dict[str, dict[str, float]]:
    """Pooled redemption rate per history channel across every logged result, with its blend weight."""
    stats: dict[str, dict[str, float]] = {}
    for row in db.query("SELECT channel, reach, redemptions FROM result"):
        hist = fc.CHANNEL_MAP.get(row["channel"])
        if hist is None:
            continue
        s = stats.setdefault(hist, {"reach": 0.0, "redemptions": 0.0, "n": 0.0})
        s["reach"] += row["reach"]
        s["redemptions"] += row["redemptions"]
        s["n"] += 1
    for s in stats.values():
        s["rate"] = s["redemptions"] / s["reach"] if s["reach"] else 0.0
        s["weight"] = s["n"] / (s["n"] + PRIOR_ASSETS)
    return stats


def _lessons(items: list[dict[str, Any]]) -> list[str]:
    out = []
    for i in items:
        label = f"{i['channel'].replace('_', ' ')} ({i['lang']})"
        if i["verdict"] == "within":
            out.append(f"{label} redeemed {i['actual_rate'] * 100:.1f}%, inside the expected range. The forecast held.")
        elif i["verdict"] == "above":
            out.append(f"{label} redeemed {i['actual_rate'] * 100:.1f}%, above the expected {i['expected']['low'] * 100:.1f} to "
                       f"{i['expected']['high'] * 100:.1f}%. The forecast was too cautious here.")
        elif i["verdict"] == "below":
            out.append(f"{label} redeemed {i['actual_rate'] * 100:.1f}%, below the expected {i['expected']['low'] * 100:.1f} to "
                       f"{i['expected']['high'] * 100:.1f}%. Look at the offer, timing or audience before sending this channel again.")
    return out


def _next_idea(plan_data: dict[str, Any], ranked: list[str]) -> str | None:
    """A new idea written only from facts the owner already locked, with the channels that worked best first."""
    if not plan_data:
        return None
    f = plan_data["offer_facts"]
    biz = plan_data["business"]
    offer = f"{int(f['discount_percent'])}% off" if f.get("discount_percent") else (f"rupees {int(f['price_amount'])}" if f.get("price_amount") else "an offer")
    channel_words = {"whatsapp": "WhatsApp", "poster": "poster", "instagram_post": "Instagram post", "instagram_story": "Instagram story",
                     "cold_email": "email", "blog_post": "blog", "google_business_post": "Google", "reel": "reel"}
    names = {"whatsapp_broadcast": "whatsapp", "counter_poster_a4": "poster"}
    order = [names.get(c, c) for c in ranked] + [c for c in plan_data["channels"]]
    seen, channels = set(), []
    for c in order:
        if c in plan_data["channels"] and c not in seen:
            seen.add(c)
            channels.append(channel_words.get(c, c))
    langs = {"en": "English", "kn": "Kannada", "hi": "Hindi"}
    parts = [f"I run {biz['name']}, a {biz['type']} in {biz['area']}.",
             f"I want to promote an offer: {offer} {f['item']}"]
    if f.get("timings"):
        parts[-1] += f" {f['timings']}"
    parts[-1] += f" for {' and '.join(a.replace('_', ' ') for a in plan_data['audiences'])},"
    parts.append(f"in {' and '.join(langs.get(l, l) for l in plan_data['languages'])}, on {' and '.join(channels)}.")
    cta = (plan_data.get("cta") or {}).get("value")
    if cta:
        parts.append(f"Customers can reach us at {cta}.")
    return " ".join(parts)


def learning(db: Database, campaign_id: str) -> dict[str, Any]:
    plan_data = plan.get_plan(db, campaign_id)
    offer = fc.offer_type(plan_data)
    assets = {a["id"]: a for a in db.assets_for(campaign_id)}
    rows = db.query("SELECT * FROM result WHERE campaign_id = ?", (campaign_id,))
    items = []
    for r in rows:
        a = assets.get(r["asset_id"])
        if a is None:
            continue
        actual = r["redemptions"] / r["reach"]
        # Judge against what the history alone predicted, so the verdict is not graded by data it already contains.
        f = fc.forecast_asset(a, offer, r["reach"])
        item = {"asset_id": a["id"], "channel": a["channel"], "lang": a["lang"], "reach": r["reach"], "redemptions": r["redemptions"],
                "actual_rate": round(actual, 4), "expected": None, "verdict": "no_forecast", "gap_points": None}
        if f["comparable"]:
            lo, mid, hi = f["rate"]["low"], f["rate"]["mid"], f["rate"]["high"]
            item["expected"] = f["rate"]
            item["verdict"] = "above" if actual > hi else "below" if actual < lo else "within"
            item["gap_points"] = round((actual - mid) * 100, 1)
        items.append(item)
    judged = [i for i in items if i["verdict"] != "no_forecast"]
    by_channel: dict[str, list[float]] = {}
    for i in items:
        by_channel.setdefault(i["channel"], []).append(i["actual_rate"])
    ranked = sorted(by_channel, key=lambda c: -sum(by_channel[c]) / len(by_channel[c]))
    ranked_hist = [fc.CHANNEL_MAP[c] for c in ranked if c in fc.CHANNEL_MAP]
    stats = owner_channel_stats(db)
    return {
        "source": SOURCE, "items": items,
        "summary": {
            "assets_with_results": len(items), "judged": len(judged),
            "within": sum(1 for i in judged if i["verdict"] == "within"),
            "mean_abs_gap_points": round(sum(abs(i["gap_points"]) for i in judged) / len(judged), 1) if judged else None,
            "best_channel": ranked[0] if ranked else None,
            "total_reached": sum(i["reach"] for i in items), "total_redemptions": sum(i["redemptions"] for i in items),
        },
        "lessons": _lessons(items),
        "owner_model": {c: {"assets": int(s["n"]), "pooled_rate": round(s["rate"], 4), "weight": round(s["weight"], 2)} for c, s in stats.items()},
        "next_idea": _next_idea(plan_data, ranked_hist) if items else None,
    }


@router.post("/campaign/{campaign_id}/results")
def save_results(campaign_id: str, body: ResultsIn, request: Request) -> dict:
    db = request.app.state.db
    if db.campaign_get(campaign_id) is None:
        raise fail("not_found", "No campaign with that id.", 404)
    assets = {a["id"]: a for a in db.assets_for(campaign_id)}
    for r in body.results:
        if r.asset_id not in assets:
            raise fail("unknown_asset", "That asset is not in this campaign.", 422)
        if r.redemptions > r.reach:
            raise fail("bad_numbers", "More people redeemed than were reached. Check the numbers.", 422)
    for r in body.results:
        db.execute(
            "INSERT INTO result (asset_id, campaign_id, channel, reach, redemptions, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(asset_id) DO UPDATE SET reach=excluded.reach, redemptions=excluded.redemptions, updated_at=excluded.updated_at",
            (r.asset_id, campaign_id, assets[r.asset_id]["channel"], r.reach, r.redemptions, now(), now()),
        )
    return learning(db, campaign_id)


@router.get("/campaign/{campaign_id}/learning")
def get_learning(campaign_id: str, request: Request) -> dict:
    db = request.app.state.db
    if db.campaign_get(campaign_id) is None:
        raise fail("not_found", "No campaign with that id.", 404)
    return learning(db, campaign_id)
