"""autopilot: give a money, time and review budget; the agent picks channels and languages that fit and says what it dropped.

It runs the exact knapsack planner over a candidate set. Channel priority comes from the history forecast (channels that
redeemed more in the past get more weight), so the budget goes where it historically paid back. The result comes with a
sentence the owner can add to their idea, so the choice becomes the owner's own words and goes through the same plan lock.
"""
from __future__ import annotations

from typing import Any

import numpy as np
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app import forecast as fc
from app.extras import latest_calibration
from app.lab.domain.planner import solve

router = APIRouter()


def ensure_schema(db) -> None:
    """Nothing to create."""

DEFAULT_CHANNELS = ["whatsapp", "poster", "instagram_post", "instagram_story"]
DEFAULT_LANGS = ["en", "kn", "hi"]
LANG_NAMES = {"en": "English", "kn": "Kannada", "hi": "Hindi"}
CHANNEL_WORDS = {"whatsapp": "WhatsApp", "poster": "poster", "instagram_post": "Instagram post", "instagram_story": "Instagram story",
                 "cold_email": "email", "blog_post": "blog", "google_business_post": "Google", "reel": "reel"}
CHANNEL_NAMES = {"whatsapp": "WhatsApp update", "poster": "Poster", "instagram_post": "Instagram post", "instagram_story": "Instagram story"}


class AutopilotIn(BaseModel):
    money_inr: float = Field(default=50, ge=0, le=100000)
    time_s: float = Field(default=300, ge=10, le=7200)
    review_s: float = Field(default=600, ge=10, le=36000)
    languages: list[str] = Field(default_factory=lambda: list(DEFAULT_LANGS))
    channels: list[str] = Field(default_factory=lambda: list(DEFAULT_CHANNELS))
    audiences: list[str] = Field(default_factory=lambda: ["customers"])
    reel_seconds: int = Field(default=0, ge=0, le=60)


def expected_rates() -> dict[str, float]:
    """Historical redemption rate per app channel (only channels with history)."""
    f = fc.fit()
    rates = {}
    for app_channel, hist in fc.CHANNEL_MAP.items():
        if hist in f["chan_logit"]:
            rates[app_channel] = float(1 / (1 + np.exp(-f["chan_logit"][hist])))
    return rates


def priorities(channels: list[str]) -> dict[str, float]:
    rates = expected_rates()
    top = max(rates.values()) if rates else 1.0
    # 1 (no history or lowest) to 5 (best historical channel). Channels with no history sit at the middle: unknown, not bad.
    return {c: (1 + 4 * rates[c] / top) if c in rates else 3.0 for c in channels}


def recommend(req: AutopilotIn) -> dict[str, Any]:
    prio = priorities(req.channels)
    wanted = [{"lang": l, "channel": c, "audience_id": a, "priority": prio[c]}
              for l in req.languages for c in req.channels for a in req.audiences]
    result = solve({"wanted": wanted, "reel_seconds": req.reel_seconds, "reels": 1 if req.reel_seconds else 0,
                    "limits": {"time_s": req.time_s, "money_inr": req.money_inr, "review_s": req.review_s}},
                   latest_calibration(), poster_uses_photo=False)
    if not result["feasible"]:
        return {"feasible": False, "message": "Even the cheapest plan is over your limits. Raise time, money or review effort.",
                "channels": [], "languages": [], "assets": 0, "dropped": result["dropped"], "sentence": None}
    keys = [k.split("-", 2) for k in result["chosen"]["assets"]]  # audience-lang-channel
    chosen_channels = sorted({k[2] for k in keys}, key=lambda c: -prio[c])
    chosen_langs = [l for l in req.languages if any(k[1] == l for k in keys)]
    rates = expected_rates()
    why = []
    for c in chosen_channels:
        r = rates.get(c)
        why.append(f"{CHANNEL_NAMES.get(c, c)}: about {r * 100:.0f}% redeemed historically" if r else f"{CHANNEL_NAMES.get(c, c)}: no history, kept for reach")
    dropped_channels = [c for c in req.channels if c not in chosen_channels]
    dropped_langs = [l for l in req.languages if l not in chosen_langs]
    sentence = None
    if chosen_channels and chosen_langs:
        sentence = (f"Write it in {' and '.join(LANG_NAMES.get(l, l) for l in chosen_langs)}, "
                    f"on {' and '.join(CHANNEL_WORDS.get(c, c) for c in chosen_channels)}.")
    return {"feasible": True, "channels": chosen_channels, "languages": chosen_langs, "assets": len(keys), "cost": result["cost"],
            "binding": result["binding"], "why": why,
            "dropped_channels": dropped_channels, "dropped_languages": dropped_langs,
            "dropped": result["dropped"][:12], "sentence": sentence,
            "calibration": result["calibration"]["source"]}


@router.post("/autopilot")
def autopilot(body: AutopilotIn) -> dict:
    return recommend(body)
