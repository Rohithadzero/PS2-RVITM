"""whatsapp: click-to-chat sending of an approved asset, checked on the server.

This is not the WhatsApp Business API. The owner's own WhatsApp opens with the message ready for one chat, and the owner presses
send. It works with no Meta setup, and it keeps a person in the loop for every message. What this module adds over a bare wa.me link:

  - the text is built here, from the approved asset and its tracked link, never from whatever the browser holds
  - only approved assets can be prepared
  - phone numbers are cleaned and checked (country code, length), duplicates dropped, at most MAX_RECIPIENTS per batch
  - the numbers are masked in the answer, and nothing about them is stored: opening a chat is logged as a count only
  - it says when the tracked link only works on this computer (a 127.0.0.1 link is dead on a customer's phone)

Only message people who agreed to hear from you. The screen says so; the code cannot know.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from app import outreach
from app.db import Database
from app.media import fail

router = APIRouter()

MAX_RECIPIENTS = 50
DEFAULT_COUNTRY_CODE = "91"


def ensure_schema(db: Database) -> None:
    """Nothing to create: opening a chat is logged through the existing outreach events."""


def normalize_phone(raw: str, default_cc: str = DEFAULT_COUNTRY_CODE) -> tuple[str | None, str | None]:
    """Returns (digits for wa.me, None) or (None, reason). Indian numbers may be written with or without +91 or a leading 0."""
    text = (raw or "").strip()
    if not text:
        return None, "empty"
    if re.search(r"[A-Za-z]", text):
        return None, "contains letters"
    digits = re.sub(r"\D", "", text)
    if text.lstrip().startswith("00"):
        digits = digits[2:]
    elif text.lstrip().startswith("+"):
        pass
    elif len(digits) == 11 and digits.startswith("0"):
        digits = default_cc + digits[1:]
    elif len(digits) == 10:
        digits = default_cc + digits
    if digits.startswith(default_cc) and len(digits) == len(default_cc) + 10 and default_cc == "91" and digits[2] not in "6789":
        return None, "Indian mobile numbers start with 6, 7, 8 or 9"
    if not 11 <= len(digits) <= 15:
        return None, "wrong length"
    return digits, None


def mask(digits: str) -> str:
    return f"+{digits[:2]} {'•' * max(len(digits) - 5, 3)} {digits[-3:]}"


def distributable_text(asset: dict[str, Any], link: str | None) -> str:
    """The message for an approved asset: its words, plus the tracked link. Mirrors what the Campaign screen copies."""
    extra = outreach._extra(asset)
    out = asset.get("content") or ""
    channel = asset["channel"]
    if channel == "instagram_post" and extra.get("hashtags"):
        out += "\n\n" + " ".join(h if str(h).startswith("#") else f"#{h}" for h in extra["hashtags"])
    elif channel == "blog_post" and extra.get("title"):
        out = f"{extra['title']}\n\n{out}"
    elif channel in ("poster",) or "story" in channel:
        if extra.get("headline"):
            out = f"{extra['headline']}\n{extra.get('subline') or ''}\n{out}".strip()
    if link and link not in out:
        out += f"\n\n{link}"
    return out.strip()


def link_reachable() -> bool:
    """False when the tracked link points at this machine, so a customer's phone could not open it."""
    host = (urlparse(outreach.public_base()).hostname or "").lower()
    return not (host in ("localhost", "0.0.0.0") or host.startswith("127.") or host.endswith(".local")
                or re.match(r"^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)", host))


class CustomerPick(BaseModel):
    """Chats for people in the Customers list. Only those who agreed to WhatsApp, with a valid number, are ever used."""
    ids: list[str] | None = None
    language: str | None = None
    tag: str | None = None


class PrepareIn(BaseModel):
    numbers: list[str] = Field(default_factory=list, max_length=500)
    customers: CustomerPick | None = None


@router.post("/assets/{asset_id}/whatsapp")
def prepare(asset_id: str, body: PrepareIn, request: Request) -> dict:
    db: Database = request.app.state.db
    asset = outreach.asset_or_404(db, asset_id)
    outreach.require_approved(asset)
    link = None
    if outreach.destination(db, asset["campaign_id"]) is not None:
        link = outreach.ensure_link(db, asset)["url"]
    text = distributable_text(asset, link)
    enc = quote(text, safe="")
    recipients, seen, dropped = [], set(), 0
    for n, raw in enumerate(body.numbers):
        digits, reason = normalize_phone(raw)
        if digits and digits in seen:
            dropped += 1
            continue
        if digits:
            seen.add(digits)
        recipients.append({"id": n, "valid": digits is not None, "number": mask(digits) if digits else (raw or "")[:4] + "…",
                           "reason": reason, "wa_url": f"https://wa.me/{digits}?text={enc}" if digits else None})
    if body.customers is not None:
        from app import connections, customers as people  # imported here: they import modules that import this one
        owner = connections._require_owner(request)
        picked = people.recipients(db, owner, "whatsapp", ids=body.customers.ids, language=body.customers.language, tag=body.customers.tag)
        for c in picked:
            if c["phone"] in seen:
                dropped += 1
                continue
            seen.add(c["phone"])
            recipients.append({"id": len(recipients), "valid": True, "customer_id": c["id"], "name": c["name"], "number": f"{c['name']} ({mask(c['phone'])})",
                               "reason": None, "wa_url": f"https://wa.me/{c['phone']}?text={enc}"})
        if not picked and not body.numbers:
            raise fail("no_consented_customers", "No customer who agreed to WhatsApp matches. Check the list and each person's WhatsApp consent.", 409)
    valid = [r for r in recipients if r["valid"]]
    if len(valid) > MAX_RECIPIENTS:
        raise fail("too_many", f"Send to at most {MAX_RECIPIENTS} people at a time.", 422)
    return {"text": text, "link": link, "link_reachable": link is None or link_reachable(), "has_link": link is not None,
            "chat_url": f"https://wa.me/?text={enc}", "recipients": recipients, "duplicates_dropped": dropped,
            "invalid": sum(1 for r in recipients if not r["valid"]),
            "note": "Opens your own WhatsApp with the message ready. You press send. Only message people who agreed to hear from you.",
            "image_note": "WhatsApp links carry text only. Download the picture and attach it yourself." if asset["channel"] in outreach_image_channels() else None}


def outreach_image_channels() -> tuple[str, ...]:
    return ("poster", "instagram_post", "instagram_story", "blog_post", "google_business_post")
