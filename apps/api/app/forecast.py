"""forecast: expected redemption rate per asset, fit on the 30 synthetic historical campaigns in the dataset.

This replaces a bare 1-10 opinion as the headline prediction. It is a small ridge regression on the logit of the
redemption rate (channel, language, offer type, log reach, emoji count, length, clear price). It is validated by
leave-one-out against two baselines and is only used when it beats the channel average; otherwise the channel
average is used and the response says so. Intervals come from the leave-one-out residuals. The history is synthetic,
so every payload says so. Channels with no history (email, blog, Google post, reel) get no forecast rather than an
invented one.
"""
from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
from fastapi import APIRouter, Request

from app import plan
from app.media import fail

router = APIRouter()


def ensure_schema(db) -> None:
    """Nothing to create: the forecast reads other tables."""

DATA_FILE = Path(__file__).parent / "data" / "historical_campaigns.synthetic.json"
LABEL = "Forecast from 30 synthetic historical campaigns"
CHANNEL_MAP = {  # app channel -> history channel
    "instagram_post": "instagram_post",
    "instagram_story": "instagram_story",
    "whatsapp": "whatsapp_broadcast",
    "poster": "counter_poster_a4",
}
OFFER_MAP = {  # interview offer_type -> history offer_type; fixed_price is the nearest to a combo and flagged approximate
    "percent_off": "pct_off", "buy_one_get_one": "bogo", "free_item": "free_item", "fixed_price": "combo",
}
CHANNELS = ("instagram_post", "instagram_story", "whatsapp_broadcast", "counter_poster_a4")
LANGS = ("en", "hi", "kn")
OFFERS = ("pct_off", "bogo", "free_item", "combo")
ALPHAS = (0.1, 0.3, 1.0, 3.0, 10.0, 30.0)
EMOJI_RE = re.compile("[\U0001F300-\U0001FAFF☀-➿⭐⬆↔-↪️]")
NAMES = ([f"channel: {c.replace('_', ' ')}" for c in CHANNELS] + [f"language: {c}" for c in LANGS]
         + [f"offer: {o.replace('_', ' ')}" for o in OFFERS] + ["clear price", "reach", "emoji count", "length in words"])


@lru_cache(maxsize=1)
def history() -> tuple[dict[str, Any], ...]:
    return tuple(json.loads(DATA_FILE.read_text(encoding="utf-8")))


def _logit(p: float) -> float:
    p = min(max(p, 1e-4), 1 - 1e-4)
    return float(np.log(p / (1 - p)))


def _sigmoid(x):
    return 1.0 / (1.0 + np.exp(-x))


def features(channel: str, language: str, offer: str, reach: float, emoji: int, words: int, clear_price: bool,
             scale: dict[str, tuple[float, float]]) -> np.ndarray:
    parts = [1.0 if channel == c else 0.0 for c in CHANNELS]
    langs = set(language.split("-"))
    parts += [1.0 if code in langs else 0.0 for code in LANGS]
    parts += [1.0 if offer == o else 0.0 for o in OFFERS]
    parts.append(1.0 if clear_price else 0.0)
    for key, value in (("log_reach", float(np.log(max(reach, 1.0)))), ("emoji", float(emoji)), ("words", float(words))):
        mu, sd = scale[key]
        parts.append((value - mu) / sd)
    return np.array(parts)


def _scale(rows) -> dict[str, tuple[float, float]]:
    cols = {
        "log_reach": [np.log(r["reach"]) for r in rows],
        "emoji": [r["emoji_count"] for r in rows],
        "words": [r["length_words"] for r in rows],
    }
    return {k: (float(np.mean(v)), float(np.std(v)) or 1.0) for k, v in cols.items()}


def _design(rows, scale):
    return np.array([features(r["channel"], r["language"], r["offer_type"], r["reach"], r["emoji_count"],
                              r["length_words"], r["has_clear_price"], scale) for r in rows])


def _ridge(X: np.ndarray, y: np.ndarray, alpha: float) -> np.ndarray:
    """Intercept is the last coefficient and is not penalised."""
    A = np.hstack([X, np.ones((len(X), 1))])
    pen = alpha * np.eye(A.shape[1])
    pen[-1, -1] = 0.0
    return np.linalg.solve(A.T @ A + pen, A.T @ y)


@lru_cache(maxsize=1)
def fit() -> dict[str, Any]:
    rows = list(history())
    scale = _scale(rows)
    X = _design(rows, scale)
    y = np.array([_logit(r["redemption_rate"]) for r in rows])
    rate = np.array([r["redemption_rate"] for r in rows])
    n = len(rows)
    chan = np.array([r["channel"] for r in rows])

    def loo(predict) -> np.ndarray:
        return np.array([predict(np.arange(n) != i, i) for i in range(n)])

    def channel_mean(mask, i):
        same = mask & (chan == chan[i])
        return _sigmoid(y[same].mean() if same.any() else y[mask].mean())

    global_pred = loo(lambda m, i: _sigmoid(y[m].mean()))
    channel_pred = loo(channel_mean)
    ridge_preds = {a: loo(lambda m, i, a=a: _sigmoid(np.append(X[i], 1.0) @ _ridge(X[m], y[m], a))) for a in ALPHAS}
    best_alpha = min(ridge_preds, key=lambda a: np.mean(np.abs(ridge_preds[a] - rate)))
    mae = {
        "global_mean": float(np.mean(np.abs(global_pred - rate))),
        "channel_mean": float(np.mean(np.abs(channel_pred - rate))),
        "ridge": float(np.mean(np.abs(ridge_preds[best_alpha] - rate))),
    }
    use = "ridge" if mae["ridge"] < mae["channel_mean"] else "channel_mean"
    chosen = ridge_preds[best_alpha] if use == "ridge" else channel_pred
    resid = np.array([_logit(r) for r in rate]) - np.array([_logit(p) for p in chosen])
    lo, hi = float(np.quantile(resid, 0.1)), float(np.quantile(resid, 0.9))
    return {
        "scale": scale, "coef": _ridge(X, y, best_alpha), "model": use, "alpha": best_alpha, "mae": mae,
        "interval": (lo, hi), "n": n, "X": X,
        "chan_logit": {c: float(y[chan == c].mean()) for c in CHANNELS if (chan == c).any()},
        "reach_median": {c: float(np.median([r["reach"] for r in rows if r["channel"] == c])) for c in CHANNELS},
    }


def model_card() -> dict[str, Any]:
    f = fit()
    return {
        "label": LABEL, "n": f["n"], "model": f["model"],
        "leave_one_out_mae": {k: round(v, 4) for k, v in f["mae"].items()},
        "interval": "80%, from leave-one-out residuals",
        "caveat": "Fit on 30 synthetic campaigns. Channel explains most of the difference; copy wording is not modelled. "
                  "A forecast is an expected range, not a promise.",
    }


def asset_text(asset: dict[str, Any]) -> str:
    extra = asset.get("extra")
    try:
        extra = json.loads(extra) if isinstance(extra, str) else (extra or {})
    except json.JSONDecodeError:
        extra = {}
    bits = [asset.get("content") or ""]
    for key in ("headline", "subline", "title"):
        if extra.get(key):
            bits.append(str(extra[key]))
    return " ".join(bits)


def _logit_for(f: dict[str, Any], channel: str, x: np.ndarray) -> float:
    if f["model"] == "ridge":
        return float(np.append(x, 1.0) @ f["coef"])
    return f["chan_logit"][channel]


def _blend(z: float, channel: str, owner: dict[str, dict[str, float]] | None) -> float:
    """Pull the history estimate toward the owner's own pooled rate for the channel, by how many results exist."""
    s = (owner or {}).get(channel)
    if not s or s["rate"] <= 0:
        return z
    return (1 - s["weight"]) * z + s["weight"] * _logit(s["rate"])


def forecast_asset(asset: dict[str, Any], offer: str | None, reach: float | None = None,
                   owner: dict[str, dict[str, float]] | None = None) -> dict[str, Any]:
    f = fit()
    channel = CHANNEL_MAP.get(asset["channel"])
    base = {"asset_id": asset["id"], "channel": asset["channel"], "lang": asset["lang"]}
    if channel is None:
        return {**base, "comparable": False, "reason": "No history for this channel, so no forecast is made."}
    if not asset.get("content"):
        return {**base, "comparable": False, "reason": "Not written yet."}
    hist_offer = OFFER_MAP.get(offer or "")
    if hist_offer is None:
        return {**base, "comparable": False, "reason": "The offer type has no history to compare with."}
    text = asset_text(asset)
    emoji, words = len(EMOJI_RE.findall(text)), len(re.findall(r"\S+", text))
    clear = bool(re.search(r"\d", text))
    used_reach = float(reach) if reach else f["reach_median"][channel]
    x = features(channel, asset["lang"], hist_offer, used_reach, emoji, words, clear, f["scale"])
    z = _blend(_logit_for(f, channel, x), channel, owner)
    lo, hi = f["interval"]
    rates = [float(_sigmoid(z + lo)), float(_sigmoid(z)), float(_sigmoid(z + hi))]
    drivers = []
    if f["model"] == "ridge":
        contrib = f["coef"][:-1] * (x - f["X"].mean(axis=0))
        for i in np.argsort(-np.abs(contrib))[:3]:
            if abs(contrib[i]) > 0.05:
                drivers.append({"factor": NAMES[i], "effect": "raises" if contrib[i] > 0 else "lowers"})
    else:
        drivers.append({"factor": NAMES[CHANNELS.index(channel)], "effect": "sets the baseline"})
    if owner and channel in owner and owner[channel]["rate"] > 0:
        drivers.append({"factor": "your logged results", "effect": "pull it toward your shop"})
    others = {}
    for ch in CHANNELS:
        xc = features(ch, asset["lang"], hist_offer, f["reach_median"][ch], emoji, words, clear, f["scale"])
        others[ch] = round(float(_sigmoid(_blend(_logit_for(f, ch, xc), ch, owner))), 4)
    return {
        **base, "comparable": True, "approximate": offer == "fixed_price",
        "owner_adjusted": bool(owner and channel in owner and owner[channel]["rate"] > 0),
        "rate": {"low": round(rates[0], 4), "mid": round(rates[1], 4), "high": round(rates[2], 4)},
        "reach_assumed": round(used_reach), "reach_is_default": not reach,
        "redemptions": {k: round(r * used_reach) for k, r in zip(("low", "mid", "high"), rates)},
        "features": {"emoji_count": emoji, "words": words, "clear_price": clear},
        "drivers": drivers, "same_offer_by_channel": others,
    }


def offer_type(plan_data: dict[str, Any] | None) -> str | None:
    for answer in (plan_data or {}).get("answers") or []:
        if answer.get("field") == "offer_type" and answer.get("status") == "accepted":
            value = answer.get("value")
            if isinstance(value, list):
                value = value[0] if value else None
            if isinstance(value, dict):
                value = value.get("value")
            return value
    return None


def campaign_forecast(db, campaign_id: str, reach: float | None = None) -> dict[str, Any]:
    from app.learn import owner_channel_stats  # imported here: learn depends on this module

    offer = offer_type(plan.get_plan(db, campaign_id))
    owner = owner_channel_stats(db)
    items = [forecast_asset(a, offer, reach, owner) for a in db.assets_for(campaign_id)]
    comparable = [i for i in items if i["comparable"]]
    totals = {k: sum(i["redemptions"][k] for i in comparable) for k in ("low", "mid", "high")} if comparable else None
    notes = []
    if comparable:
        weakest = min(comparable, key=lambda i: i["rate"]["mid"])
        table = weakest["same_offer_by_channel"]
        top = max(table, key=table.get)
        if CHANNEL_MAP.get(weakest["channel"]) != top and table[top] > weakest["rate"]["mid"] * 1.5:
            notes.append(
                f"Historically {top.replace('_', ' ')} redeemed about {table[top] * 100:.0f}% for a similar offer, "
                f"against about {weakest['rate']['mid'] * 100:.0f}% expected for {weakest['channel'].replace('_', ' ')}.")
    adjusted = {c: {"assets": int(v["n"]), "pooled_rate": round(v["rate"], 4), "weight": round(v["weight"], 2)} for c, v in owner.items()}
    if adjusted:
        notes.append("Adjusted with your own logged results: " + ", ".join(
            f"{c.replace('_', ' ')} from {v['assets']} asset(s) at {v['weight'] * 100:.0f}% weight" for c, v in adjusted.items()) + ".")
    return {"label": LABEL, "model": model_card(), "offer_type": offer, "owner_adjusted": adjusted, "items": items, "totals": totals,
            "best_asset_id": max(comparable, key=lambda i: i["rate"]["mid"])["asset_id"] if comparable else None,
            "notes": notes}


@router.get("/campaign/{campaign_id}/forecast")
def forecast(campaign_id: str, request: Request, reach: float | None = None) -> dict:
    db = request.app.state.db
    if db.campaign_get(campaign_id) is None:
        raise fail("not_found", "No campaign with that id.", 404)
    return campaign_forecast(db, campaign_id, reach)
