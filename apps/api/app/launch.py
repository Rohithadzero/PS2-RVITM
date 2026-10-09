"""launch: the "no business yet" path. Ideas, names and taglines from a few answers, then a hand-off to the agent.

Everything the model returns here is a suggestion. Costs are model estimates, not advice, and the response says so. Kannada and
Hindi taglines are drafts for a native speaker. The hand-off sentence is composed by code from what the owner picked, so the
agent reads it like any other idea and still stops at the plan lock.
"""
from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app.agnes import AgnesError
from app.media import fail
from app.worker import parse_json_object

router = APIRouter()


def ensure_schema(db) -> None:
    """Nothing to create."""

TYPES = ("cafe", "restaurant", "bakery", "salon", "boutique", "gym", "clinic", "coaching", "other")
DAY_WORDS = {"mon": "Monday", "tue": "Tuesday", "wed": "Wednesday", "thu": "Thursday", "fri": "Friday", "sat": "Saturday", "sun": "Sunday"}
DISCLAIMER = "Suggestions from an AI, not advice. Costs are rough estimates: check prices, licences and rules where you live."


class IdeasIn(BaseModel):
    city: str = Field(min_length=2, max_length=80)
    skills: list[str] = Field(default_factory=list, max_length=12)
    budget: str = Field(default="10to50k", max_length=20)
    hours_per_week: int = Field(default=20, ge=1, le=100)
    avoid: str = Field(default="", max_length=200)


class NamesIn(BaseModel):
    idea: str = Field(min_length=3, max_length=160)
    city: str = Field(min_length=2, max_length=80)


class HandoffIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    business_type: str = Field(default="other")
    city: str = Field(min_length=2, max_length=80)
    item: str = Field(min_length=2, max_length=100)
    discount_percent: float = Field(gt=0, lt=100)
    days: list[str] = Field(default_factory=list)
    languages: list[str] = Field(default_factory=lambda: ["en", "kn"])
    channels: list[str] = Field(default_factory=lambda: ["whatsapp", "poster"])


def _s(value: Any, limit: int = 240) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def clean_ideas(raw: Any) -> list[dict[str, Any]]:
    """Shape and trim the model's ideas. Drops any that lack a title, a reason or a starter menu."""
    out = []
    for n, item in enumerate(raw if isinstance(raw, list) else []):
        if not isinstance(item, dict):
            continue
        items = []
        for it in item.get("items") or []:
            if isinstance(it, dict) and _s(it.get("name"), 60) and isinstance(it.get("price"), (int, float)) and not isinstance(it.get("price"), bool) and it["price"] > 0:
                items.append({"name": _s(it["name"], 60), "price": int(it["price"])})
        if not (_s(item.get("title"), 90) and _s(item.get("why")) and items):
            continue
        btype = item.get("business_type") if item.get("business_type") in TYPES else "other"
        out.append({"id": f"idea{n}", "title": _s(item["title"], 90), "why": _s(item["why"]), "startup": _s(item.get("startup")),
                    "first_month": _s(item.get("first_month")), "risks": [_s(r, 120) for r in (item.get("risks") or []) if _s(r, 120)][:3],
                    "channels": [_s(c, 30) for c in (item.get("channels") or []) if _s(c, 30)][:4], "business_type": btype, "items": items[:5]})
    return out[:3]


SCRIPTS = {"kn": (0x0C80, 0x0CFF), "hi": (0x0900, 0x097F)}


def script_ok(text: str, lang: str) -> bool:
    """A Kannada or Hindi line may only hold its own script plus plain ASCII. Models sometimes slip in stray scripts."""
    lo, hi = SCRIPTS[lang]
    own = 0
    for ch in text:
        if ch.isalpha() and ord(ch) < 128:
            continue
        if ch.isalpha() or (0x0900 <= ord(ch) <= 0x0DFF):
            if not lo <= ord(ch) <= hi:
                return False
            own += 1
    return own > 0


def clean_names(raw: Any) -> dict[str, Any]:
    names = [_s(n, 40) for n in (raw.get("names") if isinstance(raw, dict) else []) or [] if _s(n, 40)][:6]
    taglines = []
    for n, t in enumerate((raw.get("taglines") if isinstance(raw, dict) else []) or []):
        if isinstance(t, dict) and _s(t.get("en"), 80):
            line = {"id": f"tag{n}", "en": _s(t["en"], 80), "hi": _s(t.get("hi"), 80), "kn": _s(t.get("kn"), 80)}
            for lang in ("hi", "kn"):
                if line[lang] and not script_ok(line[lang], lang):
                    line[lang] = ""  # a line with stray scripts is withheld, not shown as if it were fine
            taglines.append(line)
    return {"names": names, "taglines": taglines[:4]}


async def _ask(request: Request, messages: list[dict[str, str]], kind: str) -> Any:
    if not request.app.state.settings.agnes_api_key:
        from app.extras import key_override
        if not key_override(request.app.state.db, "text"):
            raise fail("agnes_not_configured", "Add an Agnes key to get ideas.", 409)
    try:
        raw = await request.app.state.agnes.chat(messages, cache_kind=kind, temperature=0.7, max_tokens=2200)
        return parse_json_object(raw)
    except (AgnesError, ValueError, json.JSONDecodeError) as exc:
        raise fail("ideas_failed", f"The assistant could not answer just now ({str(exc)[:80]}). Try again.", 502) from exc


@router.post("/launch/ideas")
async def ideas(body: IdeasIn, request: Request) -> dict:
    shape = {"ideas": [{"title": "<short>", "business_type": "|".join(TYPES), "why": "<one sentence for this person>",
                        "startup": "<rough cost range in rupees and what it covers>", "first_month": "<a modest first-month aim>",
                        "risks": ["<licence, location, season ...>"], "channels": ["<where it sells>"],
                        "items": [{"name": "<product>", "price": "<example price in rupees, integer>"}]}]}
    messages = [
        {"role": "system", "content": (
            "You suggest three small, realistic business ideas for an Indian first-time owner. Fit their skills, money, hours and "
            "avoidances. Be modest about costs and say what licence or permission may be needed. Each idea needs 3 starter items "
            "with example prices. Return one JSON object only, in this shape: " + json.dumps(shape))},
        {"role": "user", "content": json.dumps(body.model_dump(), ensure_ascii=False)},
    ]
    parsed = await _ask(request, messages, "launch_ideas")
    found = clean_ideas(parsed.get("ideas"))
    if not found:
        raise fail("ideas_failed", "No usable ideas came back. Try again.", 502)
    return {"ideas": found, "disclaimer": DISCLAIMER}


@router.post("/launch/names")
async def names(body: NamesIn, request: Request) -> dict:
    shape = {"names": ["<short memorable name>"], "taglines": [{"en": "<English>", "hi": "<Hindi in Devanagari>", "kn": "<Kannada>"}]}
    messages = [
        {"role": "system", "content": (
            "You suggest business names and taglines for a small Indian business. Give 5 short, easy-to-say names that do not copy a "
            "famous brand, and 3 taglines in English, Hindi and Kannada. Keep taglines plain and warm, no unprovable claims. "
            "Return one JSON object only, in this shape: " + json.dumps(shape))},
        {"role": "user", "content": json.dumps(body.model_dump(), ensure_ascii=False)},
    ]
    out = clean_names(await _ask(request, messages, "launch_names"))
    if not out["names"] or not out["taglines"]:
        raise fail("ideas_failed", "No usable names came back. Try again.", 502)
    return {**out, "needs_native_review": ["hi", "kn"], "disclaimer": "Check that a name is free to use before you print anything."}


@router.post("/launch/handoff")
def handoff(body: HandoffIn) -> dict:
    """Compose the idea sentence for the agent from the owner's own choices. No model involved."""
    langs = {"en": "English", "kn": "Kannada", "hi": "Hindi"}
    chans = {"whatsapp": "WhatsApp", "poster": "poster", "instagram_post": "Instagram post", "instagram_story": "Instagram story"}
    btype = body.business_type if body.business_type in TYPES else "other"
    days = [DAY_WORDS[d] for d in body.days if d in DAY_WORDS]
    pct = int(body.discount_percent) if float(body.discount_percent).is_integer() else body.discount_percent
    text = (f"I run {body.name}, a {btype} in {body.city}. I want to promote an offer: {pct}% off {body.item}"
            + (f" on {' and '.join(days)}" if days else "")
            + f", in {' and '.join(langs.get(l, l) for l in body.languages)}, on {' and '.join(chans.get(c, c) for c in body.channels)}.")
    return {"idea": text, "note": "The agent will ask you who it is for, when it starts and how customers reach you."}
