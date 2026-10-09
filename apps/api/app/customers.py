"""customers: the shop's own list of people, entered by the owner. Names, phone numbers, emails, language, tags and consent.

Why consent is a field and not an assumption: handing over a phone number at the counter is not the same as agreeing to be messaged.
Each person has two switches, WhatsApp and email, and both start OFF. Turning one on records when and how the person agreed.
Only people with the switch on, and a valid number or address, ever appear as recipients. Everything here belongs to the signed-in
owner, can be exported, and can be deleted one by one or all at once.

Import accepts CSV from a spreadsheet or the owner's old notebook typed into one. The first pass is a dry run that shows what
would happen; nothing is stored until the owner confirms. Exports escape cells that begin with =, +, - or @ so a name cannot
become a spreadsheet formula.
"""
from __future__ import annotations

import csv
import io
import json
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel, Field

from app import connections
from app.db import Database
from app.media import fail
from app.whatsapp import normalize_phone

router = APIRouter()

LANGS = ("en", "kn", "hi")
MAX_IMPORT_ROWS = 5000
MAX_IMPORT_BYTES = 5 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s,;<>]{1,64}@[^@\s,;<>]{1,190}\.[A-Za-z]{2,24}$")
SCHEMA = """
CREATE TABLE IF NOT EXISTS customer (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  language TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  consent_whatsapp INTEGER NOT NULL DEFAULT 0,
  consent_email INTEGER NOT NULL DEFAULT 0,
  consent_at TEXT,
  consent_source TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_phone ON customer(owner, phone) WHERE phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_email ON customer(owner, email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customer_owner ON customer(owner, name);
"""
HEADERS = {
    "name": ("name", "full name", "customer", "customer name", "fullname"),
    "phone": ("phone", "mobile", "mobile number", "phone number", "number", "whatsapp", "contact", "contact number", "cell"),
    "email": ("email", "e-mail", "email address", "mail", "e mail"),
    "language": ("language", "lang", "preferred language"),
    "tags": ("tags", "tag", "segment", "group", "labels"),
    "notes": ("notes", "note", "comment", "comments", "remarks"),
}


def ensure_schema(db: Database) -> None:
    db.ensure(SCHEMA)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean(text: Any, limit: int) -> str:
    return re.sub(r"[\x00-\x08\x0b-\x1f\x7f]", "", str(text or "")).strip()[:limit]


def clean_tags(raw: Any) -> list[str]:
    parts = raw if isinstance(raw, list) else re.split(r"[;,|]", str(raw or ""))
    out: list[str] = []
    for p in parts:
        tag = re.sub(r"\s+", " ", _clean(p, 24)).lower()
        if tag and re.fullmatch(r"[\w][\w \-]*", tag) and tag not in out:
            out.append(tag)
    return out[:10]


def validate(raw: dict[str, Any]) -> tuple[dict[str, Any] | None, str | None]:
    """One person from loose input. Returns (clean record, None) or (None, reason). Nothing is guessed."""
    name = _clean(raw.get("name"), 80)
    if not name:
        return None, "name is missing"
    phone = email = None
    if _clean(raw.get("phone"), 40):
        phone, reason = normalize_phone(_clean(raw.get("phone"), 40))
        if phone is None:
            return None, f"phone: {reason}"
    if _clean(raw.get("email"), 254):
        email = _clean(raw.get("email"), 254).lower()
        if not EMAIL_RE.match(email):
            return None, "email does not look right"
    if not phone and not email:
        return None, "needs a phone number or an email"
    lang = _clean(raw.get("language"), 12).lower() or None
    lang = {"english": "en", "kannada": "kn", "hindi": "hi"}.get(lang, lang)
    if lang and lang not in LANGS:
        return None, "language must be en, kn or hi"
    return {"name": name, "phone": phone, "email": email, "language": lang, "tags": clean_tags(raw.get("tags")), "notes": _clean(raw.get("notes"), 500)}, None


def _view(row: dict[str, Any]) -> dict[str, Any]:
    return {"id": row["id"], "name": row["name"], "phone": row["phone"], "email": row["email"], "language": row["language"],
            "tags": json.loads(row["tags"] or "[]"), "notes": row["notes"], "consent_whatsapp": bool(row["consent_whatsapp"]),
            "consent_email": bool(row["consent_email"]), "consent_at": row["consent_at"], "consent_source": row["consent_source"],
            "source": row["source"], "created_at": row["created_at"]}


def _owner(request: Request) -> str:
    return connections._require_owner(request)


def _require_source(wa: bool, em: bool, source: str | None) -> str | None:
    """Turning consent on needs a note on how the person agreed: that note is the owner's record."""
    if (wa or em) and len(_clean(source, 200)) < 3:
        raise fail("consent_source_needed", "Say how these people agreed to hear from you (for example: signed up at the counter).", 422)
    return _clean(source, 200) or None


# ---------------------------------------------------------------- recipients (used by WhatsApp and email sending)

def recipients(db: Database, owner: str, channel: str, *, ids: list[str] | None = None, language: str | None = None, tag: str | None = None,
               limit: int = 500) -> list[dict[str, Any]]:
    """People who agreed on this channel and have a valid contact. This is the only way a send gets customers."""
    col, field = ("consent_whatsapp", "phone") if channel == "whatsapp" else ("consent_email", "email")
    rows = db.query(f"SELECT * FROM customer WHERE owner = ? AND {col} = 1 AND {field} IS NOT NULL ORDER BY name LIMIT ?", (owner, limit))
    out = [_view(r) for r in rows]
    if ids is not None:
        wanted = set(ids)
        out = [c for c in out if c["id"] in wanted]
    if language:
        out = [c for c in out if c["language"] == language]
    if tag:
        out = [c for c in out if tag.lower() in c["tags"]]
    return out


# ---------------------------------------------------------------- routes

class CustomerIn(BaseModel):
    name: str = Field(default="", max_length=200)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=300)
    language: str | None = Field(default=None, max_length=20)
    tags: list[str] | str | None = None
    notes: str | None = Field(default=None, max_length=1000)
    consent_whatsapp: bool = False
    consent_email: bool = False
    consent_source: str | None = Field(default=None, max_length=300)


def _summary(db: Database, owner: str) -> dict[str, Any]:
    rows = db.query("SELECT language, phone, email, consent_whatsapp AS w, consent_email AS e, tags FROM customer WHERE owner = ?", (owner,))
    langs: dict[str, int] = {}
    tags: dict[str, int] = {}
    for r in rows:
        langs[r["language"] or "unknown"] = langs.get(r["language"] or "unknown", 0) + 1
        for t in json.loads(r["tags"] or "[]"):
            tags[t] = tags.get(t, 0) + 1
    return {"total": len(rows), "with_phone": sum(1 for r in rows if r["phone"]), "with_email": sum(1 for r in rows if r["email"]),
            "whatsapp_ok": sum(1 for r in rows if r["w"] and r["phone"]), "email_ok": sum(1 for r in rows if r["e"] and r["email"]),
            "languages": langs, "tags": dict(sorted(tags.items(), key=lambda kv: -kv[1])[:20])}


@router.get("/customers")
def list_customers(request: Request, q: str = "", language: str = "", tag: str = "", consent: str = "", limit: int = 50, offset: int = 0) -> dict:
    owner = _owner(request)
    db: Database = request.app.state.db
    limit, offset = max(1, min(limit, 200)), max(0, offset)
    where, params = ["owner = ?"], [owner]
    if q.strip():
        where.append("(LOWER(name) LIKE ? OR phone LIKE ? OR LOWER(email) LIKE ?)")
        like = f"%{q.strip().lower()}%"
        digits = re.sub(r"\D", "", q)
        params += [like, f"%{digits}%" if digits else "\0", like]  # a name search must not match every phone number
    if language in LANGS:
        where.append("language = ?")
        params.append(language)
    if tag.strip():
        where.append("tags LIKE ?")
        params.append(f'%"{tag.strip().lower()}"%')
    if consent == "whatsapp":
        where.append("consent_whatsapp = 1")
    elif consent == "email":
        where.append("consent_email = 1")
    elif consent == "none":
        where.append("consent_whatsapp = 0 AND consent_email = 0")
    sql = " AND ".join(where)
    total = db.query_one(f"SELECT COUNT(*) AS n FROM customer WHERE {sql}", tuple(params))["n"]
    rows = db.query(f"SELECT * FROM customer WHERE {sql} ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?", (*params, limit, offset))
    return {"customers": [_view(r) for r in rows], "total_matching": total, "summary": _summary(db, owner), "limit": limit, "offset": offset}


def _insert(db: Database, owner: str, rec: dict[str, Any], wa: bool, em: bool, source_note: str | None, how: str) -> dict[str, Any]:
    cid, stamp = uuid.uuid4().hex, _now()
    wa, em = wa and bool(rec["phone"]), em and bool(rec["email"])
    db.execute("INSERT INTO customer (id, owner, name, phone, email, language, tags, notes, consent_whatsapp, consent_email, consent_at, consent_source, source, created_at, updated_at) "
               "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
               (cid, owner, rec["name"], rec["phone"], rec["email"], rec["language"], json.dumps(rec["tags"]), rec["notes"], int(wa), int(em),
                stamp if (wa or em) else None, source_note if (wa or em) else None, how, stamp, stamp))
    return db.query_one("SELECT * FROM customer WHERE id = ?", (cid,))


def _clash(db: Database, owner: str, rec: dict[str, Any], skip_id: str | None = None) -> dict[str, Any] | None:
    for field in ("phone", "email"):
        if rec[field]:
            row = db.query_one(f"SELECT * FROM customer WHERE owner = ? AND {field} = ?" + (" AND id != ?" if skip_id else ""), (owner, rec[field], skip_id) if skip_id else (owner, rec[field]))
            if row:
                return row
    return None


@router.post("/customers")
def add_customer(body: CustomerIn, request: Request) -> dict:
    owner = _owner(request)
    db: Database = request.app.state.db
    rec, reason = validate(body.model_dump())
    if rec is None:
        raise fail("invalid_customer", reason or "Check the details.", 422)
    note = _require_source(body.consent_whatsapp and bool(rec["phone"]), body.consent_email and bool(rec["email"]), body.consent_source)
    clash = _clash(db, owner, rec)
    if clash:
        raise fail("duplicate", f"{clash['name']} is already in the list with that {'phone number' if clash['phone'] == rec['phone'] else 'email'}.", 409)
    return _view(_insert(db, owner, rec, body.consent_whatsapp, body.consent_email, note, "manual"))


@router.put("/customers/{customer_id}")
def edit_customer(customer_id: str, body: CustomerIn, request: Request) -> dict:
    owner = _owner(request)
    db: Database = request.app.state.db
    row = db.query_one("SELECT * FROM customer WHERE id = ? AND owner = ?", (customer_id, owner))
    if not row:
        raise fail("not_found", "No such customer.", 404)
    rec, reason = validate(body.model_dump())
    if rec is None:
        raise fail("invalid_customer", reason or "Check the details.", 422)
    wa, em = body.consent_whatsapp and bool(rec["phone"]), body.consent_email and bool(rec["email"])
    newly = (wa and not row["consent_whatsapp"]) or (em and not row["consent_email"])
    note = _require_source(wa if newly else False, em if newly else False, body.consent_source) if newly else row["consent_source"]
    clash = _clash(db, owner, rec, skip_id=customer_id)
    if clash:
        raise fail("duplicate", f"{clash['name']} already has that phone number or email.", 409)
    stamp = _now()
    keep_at = row["consent_at"] if (wa or em) and not newly else (stamp if newly else None)
    db.execute("UPDATE customer SET name=?, phone=?, email=?, language=?, tags=?, notes=?, consent_whatsapp=?, consent_email=?, consent_at=?, consent_source=?, updated_at=? WHERE id=? AND owner=?",
               (rec["name"], rec["phone"], rec["email"], rec["language"], json.dumps(rec["tags"]), rec["notes"], int(wa), int(em), keep_at,
                note if (wa or em) else None, stamp, customer_id, owner))
    return _view(db.query_one("SELECT * FROM customer WHERE id = ?", (customer_id,)))


@router.delete("/customers/{customer_id}")
def delete_customer(customer_id: str, request: Request) -> dict:
    owner = _owner(request)
    db: Database = request.app.state.db
    if not db.query_one("SELECT id FROM customer WHERE id = ? AND owner = ?", (customer_id, owner)):
        raise fail("not_found", "No such customer.", 404)
    db.execute("DELETE FROM customer WHERE id = ? AND owner = ?", (customer_id, owner))
    return {"deleted": True}


@router.delete("/customers")
def delete_all(request: Request, confirm: bool = False) -> dict:
    owner = _owner(request)
    if not confirm:
        raise fail("confirm_needed", "Add ?confirm=true to delete every customer. This cannot be undone.", 400)
    db: Database = request.app.state.db
    n = db.query_one("SELECT COUNT(*) AS n FROM customer WHERE owner = ?", (owner,))["n"]
    db.execute("DELETE FROM customer WHERE owner = ?", (owner,))
    return {"deleted": n}


# ---------------------------------------------------------------- import and export

class ImportIn(BaseModel):
    csv: str = Field(default="", max_length=MAX_IMPORT_BYTES)
    rows: list[dict[str, Any]] | None = Field(default=None, max_length=MAX_IMPORT_ROWS)
    consent_whatsapp: bool = False
    consent_email: bool = False
    consent_source: str | None = Field(default=None, max_length=300)
    update_existing: bool = False
    dry_run: bool = True


def parse_csv(text: str) -> list[dict[str, Any]]:
    text = text.lstrip("﻿")
    if not text.strip():
        raise fail("empty_file", "The file is empty.", 422)
    try:
        dialect = csv.Sniffer().sniff(text[:4096], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    reader = csv.reader(io.StringIO(text), dialect)
    rows = [r for r in reader if any(c.strip() for c in r)]
    if len(rows) < 2:
        raise fail("no_rows", "The file needs a header row and at least one person.", 422)
    header = [re.sub(r"\s+", " ", h.strip().lower()) for h in rows[0]]
    index: dict[str, int] = {}
    for field, names in HEADERS.items():
        for i, h in enumerate(header):
            if h in names and field not in index:
                index[field] = i
    if "name" not in index or not ({"phone", "email"} & set(index)):
        raise fail("columns_missing", "The first row must name the columns: a name column, and a phone and/or email column.", 422)
    if len(rows) - 1 > MAX_IMPORT_ROWS:
        raise fail("too_many_rows", f"Import at most {MAX_IMPORT_ROWS} people at a time.", 422)
    return [{f: (r[i] if i < len(r) else "") for f, i in index.items()} for r in rows[1:]]


@router.post("/customers/import")
def import_customers(body: ImportIn, request: Request) -> dict:
    owner = _owner(request)
    db: Database = request.app.state.db
    raw_rows = body.rows if body.rows is not None else parse_csv(body.csv)
    if len(raw_rows) > MAX_IMPORT_ROWS:
        raise fail("too_many_rows", f"Import at most {MAX_IMPORT_ROWS} people at a time.", 422)
    note = _require_source(body.consent_whatsapp, body.consent_email, body.consent_source)
    added = updated = skipped = 0
    errors: list[dict[str, Any]] = []
    preview: list[dict[str, Any]] = []
    seen_phone: set[str] = set()
    seen_email: set[str] = set()
    for n, raw in enumerate(raw_rows, start=2):  # row 1 is the header
        rec, reason = validate(raw)
        if rec is None:
            errors.append({"row": n, "reason": reason, "name": _clean(raw.get("name"), 40)})
            continue
        if (rec["phone"] and rec["phone"] in seen_phone) or (rec["email"] and rec["email"] in seen_email):
            skipped += 1
            continue
        if rec["phone"]:
            seen_phone.add(rec["phone"])
        if rec["email"]:
            seen_email.add(rec["email"])
        clash = _clash(db, owner, rec)
        action = "add"
        if clash:
            action = "update" if body.update_existing else "skip"
        if len(preview) < 20:
            preview.append({"row": n, "name": rec["name"], "phone": rec["phone"], "email": rec["email"], "language": rec["language"], "action": action})
        if action == "skip":
            skipped += 1
            continue
        if action == "update":
            updated += 1
            if not body.dry_run:
                db.execute("UPDATE customer SET name = ?, language = COALESCE(?, language), tags = ?, notes = CASE WHEN ? != '' THEN ? ELSE notes END, updated_at = ? WHERE id = ?",
                           (rec["name"], rec["language"], json.dumps(sorted(set(json.loads(clash["tags"] or "[]")) | set(rec["tags"]))[:10]), rec["notes"], rec["notes"], _now(), clash["id"]))
            continue
        added += 1
        if not body.dry_run:
            _insert(db, owner, rec, body.consent_whatsapp, body.consent_email, note, "import")
    return {"dry_run": body.dry_run, "added": added, "updated": updated, "skipped_duplicates": skipped, "errors": errors[:50], "error_count": len(errors),
            "preview": preview, "summary": _summary(db, owner) if not body.dry_run else None}


def _cell(value: Any) -> str:
    s = "" if value is None else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


@router.get("/customers/export.csv")
def export_csv(request: Request) -> Response:
    owner = _owner(request)
    rows = request.app.state.db.query("SELECT * FROM customer WHERE owner = ? ORDER BY name COLLATE NOCASE", (owner,))
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["name", "phone", "email", "language", "tags", "notes", "whatsapp_consent", "email_consent", "consent_at", "consent_source"])
    for r in rows:
        w.writerow([_cell(r["name"]), _cell(("+" + r["phone"]) if r["phone"] else ""), _cell(r["email"]), _cell(r["language"]), _cell(", ".join(json.loads(r["tags"] or "[]"))),
                    _cell(r["notes"]), "yes" if r["consent_whatsapp"] else "no", "yes" if r["consent_email"] else "no", _cell(r["consent_at"]), _cell(r["consent_source"])])
    return Response(buf.getvalue(), media_type="text/csv; charset=utf-8", headers={"Content-Disposition": 'attachment; filename="customers.csv"'})


@router.get("/customers/recipients")
def get_recipients(request: Request, channel: str = "whatsapp", language: str = "", tag: str = "") -> dict:
    """The people a send may go to: consented on this channel, with a valid number or address. For the pickers on the asset card."""
    if channel not in ("whatsapp", "email"):
        raise fail("bad_channel", "channel must be whatsapp or email.", 422)
    owner = _owner(request)
    people = recipients(request.app.state.db, owner, channel, language=language or None, tag=tag or None)
    return {"channel": channel, "count": len(people),
            "people": [{"id": c["id"], "name": c["name"], "language": c["language"], "tags": c["tags"]} for c in people]}
