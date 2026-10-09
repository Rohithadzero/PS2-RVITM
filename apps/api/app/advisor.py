"""advisor: who to aim a post at, which hashtags, and when to post it. Plain rules and counts, no model call.

Every suggestion carries where it came from. The ranking rules come from data/instagram_playbook.json (an Instagram page, a study of
9.6 million posts, and articles that quote Instagram's head); Instagram does not publish its formula, so the advice is a starting
point and says how sure it is. The audience numbers come from the synthetic personas the forecast uses plus the owner's own
Customers list. The timing blends the playbook's general windows with the owner's own recent posts, when Instagram is connected.

Hashtags are built from the words of the offer (item, area, brand), never invented, and pass a code filter: legal characters,
at most 30 characters, no digits-only or spam tags, no repeats, at most 5.
"""
from __future__ import annotations

import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app import connections
from app.db import Database
from app.media import asset_or_404

router = APIRouter()

DATA = Path(__file__).parent / "data"
MAX_TAGS = 5
IST = timezone(timedelta(hours=5, minutes=30))
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
SPAM_TAGS = {"follow4follow", "followforfollow", "f4f", "like4like", "l4l", "likeforlike", "followback", "instalike", "instagood",
             "love", "photooftheday", "tagsforlikes", "likesforlikes", "followme", "sfs", "spamforspam"}
STOP = {"the", "a", "an", "and", "or", "of", "for", "to", "at", "in", "on", "with", "from", "off", "get", "buy", "free", "only", "this", "that", "your", "our",
        "all", "any", "per", "percent", "day", "days", "today", "now", "new", "big", "sale", "offer", "special", "limited"}
CTA_WORDS = ("visit", "come", "order", "book", "call", "dm", "message", "tag", "share", "send", "tell", "bring", "drop by", "reserve", "whatsapp", "link")


def ensure_schema(db: Database) -> None:
    """Nothing to create: the advisor only reads."""


@lru_cache(maxsize=1)
def playbook() -> dict[str, Any]:
    return json.loads((DATA / "instagram_playbook.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def personas() -> list[dict[str, Any]]:
    return json.loads((DATA / "personas.synthetic.json").read_text(encoding="utf-8"))


# ---------------------------------------------------------------- hashtags

def _words(text: str) -> list[str]:
    return [w for w in re.findall(r"[A-Za-z][A-Za-z']+", text or "") if len(w) > 2]


def clean_tag(raw: str) -> str | None:
    """A tag body (no #) that Instagram accepts and that is not spam, or None."""
    body = re.sub(r"[^\w]", "", (raw or "").lstrip("#"), flags=re.UNICODE)
    if not body or len(body) > 30 or body.isdigit() or body.lower() in SPAM_TAGS or len(body) < 3:
        return None
    return body


def _camel(words: list[str]) -> str:
    return "".join(w[:1].upper() + w[1:].lower() for w in words)


def hashtags(item: str, brand: str | None, area: str | None, audiences: list[str], caption: str, language_counts: dict[str, int]) -> list[dict[str, str]]:
    """Brand, item, local, community, in that order of value. Each entry says why it is there."""
    out: list[dict[str, str]] = []

    def add(raw: str, kind: str, why: str) -> None:
        tag = clean_tag(raw)
        if tag and tag.lower() not in {t["tag"].lstrip("#").lower() for t in out} and len(out) < MAX_TAGS:
            out.append({"tag": "#" + tag, "kind": kind, "why": why})

    if brand:
        add(_camel(_words(brand)), "brand", "Your own tag, so people can find all your posts together.")
    item_words = [w for w in _words(item) if w.lower() not in STOP]
    if item_words:
        add(_camel(item_words[:3]), "item", "What the post is about, in the words of the offer.")
        if len(item_words) > 1:
            add(item_words[-1].capitalize(), "item", "A shorter tag for the same item that people search for.")
    if area:
        area_words = [w for w in _words(area) if w.lower() not in STOP]
        if area_words:
            add(_camel(area_words[:2]), "local", "Your neighbourhood, where most of your customers are.")
            if item_words:
                add(_camel(area_words[:2]) + item_words[-1].capitalize(), "local", "Item plus place, a narrow tag few others use.")
    if any(a.lower() in ("students", "student", "college students") for a in audiences) or any("student" in a.lower() for a in audiences):
        add("StudentOffer", "community", "The audience named in the offer.")
    elif audiences:
        words = [w for w in _words(audiences[0]) if w.lower() not in STOP]
        if words:
            add(_camel(words[:2]), "community", "The audience named in the offer.")
    kn = language_counts.get("kn", 0)
    if kn and kn >= language_counts.get("en", 0) / 2 and area:
        add("Kannada" + _camel(_words(item)[:1]) if _words(item) else "KannadaFood", "community", "Many of your customers speak Kannada.")
    return out[:MAX_TAGS]


# ---------------------------------------------------------------- caption checks

def caption_checks(caption: str, item: str, area: str | None, tags_in_caption: int) -> list[dict[str, Any]]:
    text = caption or ""
    first = text[:125]
    low = text.lower()
    item_words = [w.lower() for w in _words(item) if w.lower() not in STOP]
    checks = [
        {"id": "hook", "ok": bool(item_words) and any(w in first.lower() for w in item_words), "rule": "hook",
         "ok_text": "The item shows in the first 125 characters, before the feed cuts the caption.",
         "fix": "Move the item and the offer into the first 125 characters. The feed cuts the caption after that."},
        {"id": "keywords", "ok": bool(item_words) and any(w in low for w in item_words) and (not area or any(a.lower() in low for a in _words(area))), "rule": "keywords",
         "ok_text": "The caption names the item" + (" and the area" if area else "") + " in plain words.",
         "fix": "Say the item" + (" and the area" if area else "") + " in plain words. Search reads the caption."},
        {"id": "cta", "ok": any(w in low for w in CTA_WORDS), "rule": "signals-top3",
         "ok_text": "There is a clear next step.", "fix": "Add one next step, ideally one worth sending to a friend: 'Send this to who you'd bring along.'"},
        {"id": "hashtag-count", "ok": tags_in_caption <= MAX_TAGS, "rule": "hashtags-few",
         "ok_text": "Five hashtags or fewer.", "fix": f"Keep to {MAX_TAGS} hashtags or fewer. Instagram's head is reported to call them 'not a huge lever'."},
        {"id": "length", "ok": len(text) <= 2200, "rule": "hook",
         "ok_text": "Within Instagram's 2,200 character limit.", "fix": "Shorten the caption below 2,200 characters, the Instagram limit."},
    ]
    return [{"id": c["id"], "ok": c["ok"], "message": c["ok_text"] if c["ok"] else c["fix"], "rule": c["rule"]} for c in checks]


# ---------------------------------------------------------------- audience

def audience_stats(channel: str) -> dict[str, Any]:
    people = personas()
    want = {"instagram_post": "Instagram", "instagram_story": "Instagram", "whatsapp": "WhatsApp"}.get(channel)
    on = [p for p in people if want and want in p["primary_channel"]] if want else []
    pool = on or people
    seg = Counter(p["segment"] for p in pool).most_common(3)
    days = Counter(d for p in pool for d in p["preferred_days"])
    return {
        "basis": "synthetic personas (made up for the demo, not real customers)",
        "channel_match": len(on), "of": len(people),
        "top_segments": [{"segment": s.replace("_", " "), "share": round(n / len(pool), 2)} for s, n in seg],
        "cares_about": [w for w, _ in Counter(c for p in pool for c in p["cares_about"]).most_common(5)],
        "days": {d: round(days.get(d, 0) / len(pool), 2) for d in DAYS},
        "languages": dict(Counter(p["language_pref"] for p in pool)),
    }


def customer_stats(db: Database, owner: str) -> dict[str, Any]:
    rows = db.query("SELECT language, tags, consent_whatsapp, consent_email FROM customer WHERE owner = ?", (owner,))
    langs = Counter((r["language"] or "unknown") for r in rows)
    tags: Counter = Counter()
    for r in rows:
        try:
            tags.update(json.loads(r["tags"] or "[]"))
        except json.JSONDecodeError:
            pass
    return {"basis": "your Customers list", "total": len(rows), "languages": dict(langs), "top_tags": [t for t, _ in tags.most_common(5)],
            "whatsapp_ok": sum(1 for r in rows if r["consent_whatsapp"]), "email_ok": sum(1 for r in rows if r["consent_email"])}


# ---------------------------------------------------------------- timing

def own_slots(media: list[dict[str, Any]]) -> dict[tuple[int, int], float]:
    """(weekday, hour) in IST -> average engagement of the owner's own posts there. Needs timestamps and counts."""
    sums: dict[tuple[int, int], list[float]] = {}
    for m in media:
        ts, likes, comments = m.get("timestamp"), m.get("likes"), m.get("comments")
        if not ts or likes is None:
            continue
        try:
            t = datetime.fromisoformat(str(ts).replace("Z", "+00:00").replace("+0000", "+00:00")).astimezone(IST)
        except ValueError:
            continue
        sums.setdefault((t.weekday(), t.hour), []).append(float(likes) + 2.0 * float(comments or 0))
    return {k: sum(v) / len(v) for k, v in sums.items()}


def suggest_times(now: datetime, persona_days: dict[str, float], mine: dict[tuple[int, int], float], posts_seen: int, count: int = 3) -> dict[str, Any]:
    """Score every hour in the next 7 days and keep the best few on different days. Own history counts for more as it grows."""
    pb = playbook()["general_windows"]
    own_weight = 0.0 if posts_seen < 5 else min(0.6, posts_seen / 40)
    best_own = max(mine.values()) if mine else 0.0
    top_persona = max(persona_days.values()) if persona_days and max(persona_days.values()) else 1.0
    scored = []
    for d in range(0, 8):
        day = (now + timedelta(days=d)).astimezone(IST)
        for hour_s, hw in pb["hour_weight"].items():
            slot = day.replace(hour=int(hour_s), minute=0, second=0, microsecond=0)
            if slot <= now + timedelta(minutes=30):
                continue
            wd = slot.weekday()
            general = pb["weekday_weight"][DAYS[wd]] * hw
            audience = 0.5 + 0.5 * (persona_days.get(DAYS[wd], 0) / top_persona)
            base = general * audience
            own = (mine.get((wd, slot.hour), 0.0) / best_own) if best_own else 0.0
            score = (1 - own_weight) * base + own_weight * (own if best_own else base)
            scored.append((score, slot, own > 0.6 and own_weight > 0))
    scored.sort(key=lambda s: -s[0])
    picks, used_days = [], set()
    for score, slot, from_own in scored:
        if slot.date() in used_days:
            continue
        used_days.add(slot.date())
        reasons = [f"{DAYS[slot.weekday()]} {slot.strftime('%I %p').lstrip('0')} IST sits in the commonly quoted India windows (lunch and after work)."]
        if persona_days.get(DAYS[slot.weekday()], 0) >= 0.2:
            reasons.append("Your sample audience says they are out on this day.")
        if from_own:
            reasons.append("Your own posts did well around this time.")
        picks.append({"at": slot.isoformat(), "label": f"{DAYS[slot.weekday()]} {slot.day} {slot.strftime('%b')}, {slot.strftime('%I:%M %p').lstrip('0')} IST",
                      "score": round(score, 2), "reasons": reasons})
        if len(picks) == count:
            break
    confidence = "medium" if own_weight >= 0.3 else "low"
    note = ("Based on your recent posts and general studies." if own_weight else
            "Based on general studies only. Connect Instagram on the Connections screen so your own posts can shape this." if posts_seen == 0 else
            f"Only {posts_seen} of your posts to learn from, so general studies still lead.")
    return {"slots": picks, "confidence": confidence, "own_posts_used": posts_seen if own_weight else 0, "timezone": "IST (UTC+05:30)", "note": note,
            "caveat": "A post's words matter more than its minute. Be ready to reply in the first day."}


# ---------------------------------------------------------------- route

class AdviceIn(BaseModel):
    caption: str | None = Field(default=None, max_length=5000)
    brand: str | None = Field(default=None, max_length=100)
    area: str | None = Field(default=None, max_length=100)


def _instagram_media(db: Database, owner: str) -> list[dict[str, Any]]:
    row = db.query_one("SELECT media FROM connection WHERE provider = 'instagram' AND owner = ?", (owner,))
    try:
        return json.loads(row["media"] or "[]") if row else []
    except json.JSONDecodeError:
        return []


@router.post("/assets/{asset_id}/advice")
def advice(asset_id: str, body: AdviceIn, request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    asset = asset_or_404(db, asset_id)
    facts_row = db.facts_approved(asset["campaign_id"]) or db.facts_latest(asset["campaign_id"])
    facts = json.loads(facts_row["json"]) if facts_row else {}
    item = facts.get("item") or ""
    caption = body.caption if body.caption is not None else (asset.get("content") or "")
    people = customer_stats(db, owner)
    tags = hashtags(item, body.brand, body.area, facts.get("audiences") or [], caption, people["languages"])
    aud = audience_stats(asset["channel"])
    media = _instagram_media(db, owner)
    timing = suggest_times(datetime.now(timezone.utc), aud["days"], own_slots(media), len(media))
    pb = playbook()
    rules_used = {"signals-feed", "signals-top3", "hook", "keywords", "hashtags-few", "hashtags-mix", "originality", "consistency", "times-buffer", "times-india"}
    rules = [r for r in pb["rules"] if r["id"] in rules_used]
    src = {s["id"]: s for s in pb["sources"]}
    return {
        "asset_id": asset_id, "channel": asset["channel"],
        "audience": {"personas": aud, "customers": people},
        "hashtags": {"tags": tags, "text": " ".join(t["tag"] for t in tags),
                     "note": "Hashtags are a small lever. A few relevant ones beat many. Instagram allows up to 30; this keeps to 5."},
        "caption_checks": caption_checks(caption, item, body.area, len(re.findall(r"(?<!\w)#\w+", caption))),
        "timing": timing,
        "rules": [{**r, "source_title": src[r["source"]]["title"], "source_url": src[r["source"]]["url"]} for r in rules],
        "disclaimer": f"Instagram does not publish how it ranks posts. This advice comes from the sources listed (read {pb['retrieved']}), some of them articles quoting Instagram's head. Treat it as a starting point and trust your own results.",
    }
