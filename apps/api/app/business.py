"""business: the owner's shop details, and the one-page website built from them.

One profile per signed-in owner: name, WhatsApp number, address, hours, short story, tagline and colours per language, menu, and
the site settings. The website is built by plain code from that profile and the APPROVED offer facts of a campaign, never from
unapproved text, and every value is HTML-escaped. "Order on WhatsApp" is a wa.me link to the owner's own number with the message
ready, one per menu item and one in the hero. Without a number there is no order button, and the preview says so.

Publishing puts the page at /site/<slug>, which is public (customers open it), served with a locked-down content policy.
"""
from __future__ import annotations

import html
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote, urlparse

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field, field_validator

from app import connections, languages, outreach
from app.db import Database
from app.media import fail
from app.whatsapp import normalize_phone

router = APIRouter()

SCHEMA = """
CREATE TABLE IF NOT EXISTS business (
  owner TEXT PRIMARY KEY,
  profile TEXT NOT NULL DEFAULT '{}',
  site_slug TEXT,
  published INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_slug ON business(site_slug) WHERE site_slug IS NOT NULL;
"""
LANGS = languages.CODES
SLUG = re.compile(r"^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$")
RESERVED = {"admin", "api", "auth", "login", "static", "assets", "www", "site", "health", "docs"}
HEX = re.compile(r"^#[0-9a-fA-F]{6}$")
SECTIONS = ("hero", "menu", "about", "hours", "whatsapp")
DEFAULT_PALETTE = {"bg": "#fff7ef", "ink": "#2b1d14", "accent": "#c4561a", "soft": "#fde3cf"}
UI = {"en": {"order": "Order on WhatsApp", "menu": "Menu", "about": "About us", "hours": "Hours and place", "hello": "Hi {name}, I'd like to order", "map": "Open the map", "off": "off"}}
UI.update({l["code"]: l["ui"] for l in languages.LANGUAGES if l.get("ui")})
FONTS = {"f1": ("Poppins", "Noto Sans Kannada"), "f2": ("Playfair Display", "Noto Sans"), "f3": ("Inter", "Noto Sans Devanagari")}


def ensure_schema(db: Database) -> None:
    for stmt in SCHEMA.split(";"):
        if stmt.strip():
            db.execute(stmt)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


# ---------------------------------------------------------------- the profile

class MenuItem(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    price: float = Field(gt=0, le=100000)


PerLang = dict[str, str]  # language code -> text, up to 400 characters each; codes are checked on save


class ProfileIn(BaseModel):
    """Every field is optional: a save changes only what it sends."""
    name: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=30)
    address: str | None = Field(default=None, max_length=200)
    maps_url: str | None = Field(default=None, max_length=300)
    hours: str | None = Field(default=None, max_length=200)
    about: PerLang | None = None
    tagline: PerLang | None = None
    palette: dict[str, str] | None = None
    fonts: str | None = Field(default=None, max_length=4)
    logo: int | None = Field(default=None, ge=0, le=2)
    menu: list[MenuItem] | None = Field(default=None, max_length=80)
    langs: list[str] | None = Field(default=None, max_length=3)
    sections: dict[str, bool] | None = None
    campaign_id: str | None = Field(default=None, max_length=64)

    @field_validator("palette")
    @classmethod
    def _palette(cls, v):
        if v is None:
            return v
        if set(v) - set(DEFAULT_PALETTE) or any(not HEX.match(c) for c in v.values()):
            raise ValueError("palette needs bg, ink, accent and soft as #rrggbb colours")
        return v

    @field_validator("maps_url")
    @classmethod
    def _maps(cls, v):
        if v and urlparse(v).scheme != "https":
            raise ValueError("the map link must start with https://")
        return v

    @field_validator("about", "tagline")
    @classmethod
    def _per_lang(cls, v):
        if v is None:
            return v
        if set(v) - set(languages.CODES) or any(len(t) > 400 for t in v.values()):
            raise ValueError("text per language needs registered language codes and at most 400 characters each")
        return v

    @field_validator("langs")
    @classmethod
    def _langs(cls, v):
        if v is not None and (not v or any(x not in LANGS for x in v)):
            raise ValueError("languages must be a non-empty list of registered language codes")
        return v


def _load(db: Database, owner: str) -> tuple[dict[str, Any], dict[str, Any] | None]:
    row = db.query_one("SELECT * FROM business WHERE owner = ?", (owner,))
    return (json.loads(row["profile"]) if row else {}), row


def _site_info(row: dict[str, Any] | None) -> dict[str, Any]:
    slug = row["site_slug"] if row else None
    published = bool(row and row["published"] and slug)
    return {"slug": slug, "published": published, "url": f"{outreach.public_base()}/site/{slug}" if published else None}


@router.get("/business")
def get_business(request: Request) -> dict:
    db: Database = request.app.state.db
    profile, row = _load(db, connections._require_owner(request))
    return {"profile": profile, "site": _site_info(row)}


@router.put("/business")
def put_business(body: ProfileIn, request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    profile, row = _load(db, owner)
    changes = body.model_dump(exclude_none=True)
    if "phone" in changes:
        if changes["phone"].strip():
            digits, reason = normalize_phone(changes["phone"])
            if not digits:
                raise fail("bad_phone", f"That WhatsApp number does not look right ({reason}).", 422)
            changes["phone"] = digits
        else:
            changes["phone"] = ""
    profile.update(changes)
    db.execute("INSERT INTO business (owner, profile, updated_at) VALUES (?, ?, ?) ON CONFLICT(owner) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at",
               (owner, json.dumps(profile, ensure_ascii=False), _now()))
    return {"profile": profile, "site": _site_info(db.query_one("SELECT * FROM business WHERE owner = ?", (owner,)))}


class NamesAsk(BaseModel):
    idea: str = Field(min_length=3, max_length=160)
    city: str = Field(min_length=2, max_length=80)


@router.post("/business/names")
async def names(body: NamesAsk, request: Request) -> dict:
    """Name and tagline ideas from the assistant (the same service as Build my business). Suggestions only; nothing is saved."""
    from app import launch  # imported here to keep module start-up light
    connections._require_owner(request)
    return await launch.names(launch.NamesIn(idea=body.idea, city=body.city), request)


# ---------------------------------------------------------------- the page

def _e(value: Any) -> str:
    return html.escape(str(value or ""), quote=True)


def _money(value: float) -> str:
    return f"₹{value:,.0f}" if float(value).is_integer() else f"₹{value:,.2f}"


def order_link(phone: str, text: str) -> str:
    return f"https://wa.me/{phone}?text={quote(text, safe='')}"


def approved_facts(db: Database, profile: dict[str, Any]) -> dict[str, Any] | None:
    """The offer on the page comes only from an approved lock: the chosen campaign's, else the newest one that has one."""
    ids = [profile["campaign_id"]] if profile.get("campaign_id") else [c["id"] for c in db.campaign_list()]
    for cid in ids:
        row = db.facts_approved(cid)
        if row:
            return json.loads(row["json"])
    return None


def render_site(profile: dict[str, Any], facts: dict[str, Any] | None, lang: str = "en", preview: bool = False, slug: str | None = None) -> tuple[str, list[str]]:
    """Returns (html, warnings). Pure: the same inputs give the same page. The preview leaves out the language switch (the editor has its own)."""
    lang = lang if lang in LANGS else "en"
    t = UI[lang]
    pal = {**DEFAULT_PALETTE, **(profile.get("palette") or {})}
    heading, body_font = FONTS.get(profile.get("fonts") or "f1", FONTS["f1"])
    name = profile.get("name") or "Our shop"
    phone = profile.get("phone") or ""
    sections = {**{s: True for s in SECTIONS}, **(profile.get("sections") or {})}
    langs = [x for x in (profile.get("langs") or ["en"]) if x in LANGS] or ["en"]
    warnings: list[str] = []
    if not phone:
        warnings.append("No WhatsApp number is saved, so the page has no order button. Add it under Brand & Data.")
    if not facts:
        warnings.append("No approved offer yet, so the page shows no offer. Approve the facts on a campaign first.")
    if not profile.get("menu"):
        warnings.append("The menu is empty.")

    tagline = (profile.get("tagline") or {}).get(lang) or (profile.get("tagline") or {}).get("en") or ""
    hello = t["hello"].format(name=name)

    def order_href(item_index: int | None, text: str) -> str:
        """Live page: through the site's own counting link. Preview: straight to WhatsApp, so nothing is counted while editing."""
        if slug and not preview:
            return f"/site/{slug}/order?lang={lang}" + (f"&i={item_index}" if item_index is not None else "")
        return order_link(phone, text)
    parts = [f"<header><strong>{_e(name)}</strong>"]
    if len(langs) > 1 and not preview:
        parts.append("<nav aria-label=\"Language\">" + " ".join(f'<a target="_self" href="?lang={l}"{" aria-current=\"true\"" if l == lang else ""}>{l.upper()}</a>' for l in langs) + "</nav>")
    parts.append("</header><main>")
    if sections["hero"]:
        parts.append(f"<section class=\"hero\"><h1>{_e(tagline or name)}</h1>")
        if facts:
            bits = [_e(facts.get("item"))]
            if facts.get("discount_percent"):
                bits.append(f"{facts['discount_percent']:g}% {t['off']}")
            if facts.get("price_amount"):
                bits.append(_money(facts["price_amount"]))
            parts.append(f"<p class=\"offer\">{' · '.join(b for b in bits if b)}</p>")
            when = ", ".join(x for x in [", ".join(facts.get("dates") or []), facts.get("timings") or ""] if x)
            if when:
                parts.append(f"<p>{_e(when)}</p>")
            if facts.get("terms"):
                parts.append(f"<p class=\"small\">{_e(facts['terms'])}</p>")
        if sections["whatsapp"] and phone:
            item = f" {facts['item']}" if facts and facts.get("item") else ""
            parts.append(f"<p><a class=\"btn\" href=\"{_e(order_href(None, hello + item))}\" rel=\"noopener\">{_e(t['order'])}</a></p>")
        parts.append("</section>")
    if sections["menu"] and profile.get("menu"):
        parts.append(f"<section><h2>{_e(t['menu'])}</h2><ul class=\"menu\">")
        for n, it in enumerate(profile["menu"]):
            row = f"<span>{_e(it['name'])}</span><span>{_money(it['price'])}</span>"
            if sections["whatsapp"] and phone:
                row += f"<a href=\"{_e(order_href(n, hello + ' ' + it['name']))}\" rel=\"noopener\" aria-label=\"{_e(t['order'])}: {_e(it['name'])}\">+</a>"
            parts.append(f"<li>{row}</li>")
        parts.append("</ul></section>")
    about = (profile.get("about") or {}).get(lang) or (profile.get("about") or {}).get("en")
    if sections["about"] and about:
        parts.append(f"<section><h2>{_e(t['about'])}</h2><p>{_e(about)}</p></section>")
    if sections["hours"] and (profile.get("hours") or profile.get("address") or profile.get("maps_url")):
        parts.append(f"<section><h2>{_e(t['hours'])}</h2>")
        for key in ("hours", "address"):
            if profile.get(key):
                parts.append(f"<p>{_e(profile[key])}</p>")
        if profile.get("maps_url"):
            parts.append(f"<p><a href=\"{_e(profile['maps_url'])}\" rel=\"noopener\">{_e(t['map'])}</a></p>")
        parts.append("</section>")
    parts.append("</main>")
    css = (f":root{{--bg:{pal['bg']};--ink:{pal['ink']};--accent:{pal['accent']};--soft:{pal['soft']}}}"
           f"*{{box-sizing:border-box}}body{{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 '{body_font}',system-ui,sans-serif}}"
           f"header{{display:flex;justify-content:space-between;align-items:center;padding:14px 20px;background:var(--soft)}}"
           f"header strong{{font:700 18px '{heading}',system-ui,sans-serif}}nav a{{margin-left:10px;color:var(--ink)}}"
           f"main{{max-width:720px;margin:0 auto;padding:8px 20px 40px}}h1,h2{{font-family:'{heading}',system-ui,sans-serif;line-height:1.2}}"
           f"h1{{color:var(--accent);font-size:2rem;margin:28px 0 8px}}.offer{{font-size:1.2rem;font-weight:600}}.small{{font-size:.85rem;opacity:.8}}"
           f".btn{{display:inline-block;padding:12px 22px;border-radius:999px;background:var(--accent);color:#fff;font-weight:700;text-decoration:none}}"
           f".menu{{list-style:none;padding:0}}.menu li{{display:flex;gap:12px;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid var(--soft)}}"
           f".menu li span:first-child{{flex:1}}.menu a{{width:30px;height:30px;border-radius:50%;background:var(--accent);color:#fff;text-align:center;line-height:30px;text-decoration:none;font-weight:700}}"
           f"a:focus-visible{{outline:3px solid var(--ink);outline-offset:2px}}")
    page = (f"<!doctype html><html lang=\"{lang}\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><base target=\"_blank\">"
            f"<title>{_e(name)}</title><style>{css}</style></head><body>{''.join(parts)}</body></html>")
    return page, warnings


SITE_HEADERS = {
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "Cache-Control": "no-cache",
}


@router.get("/business/site/preview")
def preview(request: Request, lang: str = "en") -> dict:
    db: Database = request.app.state.db
    profile, _ = _load(db, connections._require_owner(request))
    page, warnings = render_site(profile, approved_facts(db, profile), lang, preview=True)
    return {"html": page, "warnings": warnings, "order_button": bool(profile.get("phone")) and (profile.get("sections") or {}).get("whatsapp", True)}


class PublishIn(BaseModel):
    slug: str = Field(min_length=3, max_length=40)


@router.post("/business/site/publish")
def publish(body: PublishIn, request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    profile, _ = _load(db, owner)
    slug = body.slug.strip().lower()
    if not SLUG.match(slug) or slug in RESERVED:
        raise fail("bad_slug", "Use 3 to 40 letters, numbers or hyphens, not starting or ending with a hyphen.", 422)
    if not profile.get("name"):
        raise fail("no_name", "Save the business name first.", 409)
    taken = db.query_one("SELECT owner FROM business WHERE site_slug = ? AND owner != ?", (slug, owner))
    if taken:
        raise fail("slug_taken", "That web address is taken. Pick another.", 409)
    db.execute("INSERT INTO business (owner, profile, site_slug, published, updated_at) VALUES (?, '{}', ?, 1, ?) "
               "ON CONFLICT(owner) DO UPDATE SET site_slug = excluded.site_slug, published = 1, updated_at = excluded.updated_at", (owner, slug, _now()))
    return {"site": _site_info(db.query_one("SELECT * FROM business WHERE owner = ?", (owner,)))}


@router.delete("/business/site/publish")
def unpublish(request: Request) -> dict:
    db: Database = request.app.state.db
    owner = connections._require_owner(request)
    db.execute("UPDATE business SET published = 0, updated_at = ? WHERE owner = ?", (_now(), owner))
    return {"site": _site_info(db.query_one("SELECT * FROM business WHERE owner = ?", (owner,)))}


@router.get("/site/{slug}")
def public_site(slug: str, request: Request, lang: str = "en") -> Response:
    db: Database = request.app.state.db
    row = db.query_one("SELECT * FROM business WHERE site_slug = ? AND published = 1", (slug,))
    if row is None:
        return Response("Not found", status_code=404, media_type="text/plain", headers={"X-Content-Type-Options": "nosniff"})
    profile = json.loads(row["profile"])
    page, _ = render_site(profile, approved_facts(db, profile), lang, slug=slug)
    return Response(page, media_type="text/html; charset=utf-8", headers=SITE_HEADERS)


@router.get("/site/{slug}/order")
def order_tap(slug: str, request: Request, lang: str = "en", i: int | None = None) -> Response:
    """A visitor tapped Order on WhatsApp. Count it, then send them to the shop's own WhatsApp with the message ready.
    The address is built here from the saved number, never taken from the request, so this cannot redirect anywhere else."""
    db: Database = request.app.state.db
    row = db.query_one("SELECT * FROM business WHERE site_slug = ? AND published = 1", (slug,))
    profile = json.loads(row["profile"]) if row else {}
    if row is None or not profile.get("phone"):
        return Response("Not found", status_code=404, media_type="text/plain", headers={"X-Content-Type-Options": "nosniff"})
    lang = lang if lang in languages.CODES else "en"
    menu = profile.get("menu") or []
    item = menu[i]["name"] if i is not None and 0 <= i < len(menu) else None
    facts = approved_facts(db, profile)
    what = item or (facts or {}).get("item")
    text = UI.get(lang, UI["en"])["hello"].format(name=profile.get("name") or "") + (f" {what}" if what else "")
    from app import notifications  # imported here: notifications uses modules that import this one
    notifications.notify(db, row["owner"], "order", f"Order tapped on your website" + (f": {what}" if what else ""),
                         "A visitor tapped Order on WhatsApp. GrowIT cannot see whether they sent the message, so check your WhatsApp.", "customers",
                         f"order:{slug}:{what}:{datetime.now(timezone.utc).strftime('%Y%m%d%H%M')}")  # taps within the same minute are one line
    return Response(status_code=302, headers={"Location": order_link(profile["phone"], text), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})
