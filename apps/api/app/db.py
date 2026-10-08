"""SQLite store (WAL). Schema follows docs/data-model.md. Every row is owner-scoped by the routes."""
import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS owner (id TEXT PRIMARY KEY, google_sub TEXT UNIQUE, email TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS brand (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, version INTEGER NOT NULL, voice TEXT NOT NULL,
  banned_phrases TEXT NOT NULL, taboo_claims TEXT NOT NULL, sample_posts TEXT NOT NULL, languages TEXT NOT NULL,
  created_at TEXT NOT NULL, UNIQUE(owner_id, version));
CREATE TABLE IF NOT EXISTS audience (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT, persona TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS menu_item (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, price_inr INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS upload (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, kind TEXT NOT NULL, path TEXT NOT NULL, mime TEXT NOT NULL,
  use_for_posters INTEGER DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campaign (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, brand_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL, brief TEXT, transcript_raw TEXT, transcript_edited TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS offer_facts (campaign_id TEXT NOT NULL, version INTEGER NOT NULL, json TEXT NOT NULL, approved INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT, approval_method TEXT, PRIMARY KEY (campaign_id, version));
CREATE TABLE IF NOT EXISTS plan (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, request TEXT NOT NULL, chosen TEXT NOT NULL, dropped TEXT NOT NULL,
  cost TEXT NOT NULL, confirmed INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS asset (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, audience_id TEXT, lang TEXT NOT NULL, channel TEXT NOT NULL,
  type TEXT NOT NULL, template TEXT, content TEXT, media_path TEXT, facts_used TEXT NOT NULL, facts_version INTEGER NOT NULL,
  status TEXT NOT NULL, block_reason TEXT, score TEXT, is_fallback INTEGER DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS validator_report (id TEXT PRIMARY KEY, asset_id TEXT NOT NULL, facts_version INTEGER NOT NULL, results TEXT NOT NULL,
  back_translation TEXT, extracted TEXT, drift TEXT, passed INTEGER NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS comparison (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, a_asset_id TEXT NOT NULL, b_asset_id TEXT NOT NULL,
  repeats INTEGER NOT NULL, results TEXT NOT NULL, win_rate_b REAL, ci_low REAL, ci_high REAL, human_votes TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS decision_log (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, asset_id TEXT, before TEXT, after TEXT, reason TEXT NOT NULL,
  rule TEXT, rule_status TEXT, expires_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS customer (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, phone TEXT NOT NULL, lang_pref TEXT NOT NULL,
  opted_out INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, UNIQUE(owner_id, phone));
CREATE TABLE IF NOT EXISTS consent (id TEXT PRIMARY KEY, customer_id TEXT NOT NULL, channel TEXT NOT NULL, granted_at TEXT NOT NULL,
  text_version TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS send_log (id TEXT PRIMARY KEY, campaign_id TEXT NOT NULL, customer_id TEXT NOT NULL, asset_id TEXT, facts_version INTEGER,
  channel TEXT NOT NULL, outcome TEXT NOT NULL, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_config (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, capability TEXT NOT NULL, lang TEXT,
  provider TEXT NOT NULL, mode TEXT NOT NULL, model TEXT, base_url TEXT, key_ciphertext BLOB, key_last4 TEXT, tier TEXT, custom_limits TEXT,
  priority INTEGER NOT NULL DEFAULT 0, enabled INTEGER NOT NULL DEFAULT 1, status TEXT, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calibration (id TEXT PRIMARY KEY, owner_id TEXT, provider TEXT NOT NULL, capability TEXT NOT NULL, model TEXT,
  mode TEXT NOT NULL, metrics TEXT NOT NULL, measured_at TEXT NOT NULL, ttl_s INTEGER NOT NULL DEFAULT 86400);
CREATE TABLE IF NOT EXISTS usage_ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, provider TEXT NOT NULL, capability TEXT NOT NULL,
  unit_type TEXT NOT NULL, units REAL NOT NULL, est_cost_inr REAL, actual_cost_inr REAL DEFAULT 0, ts TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS job (id TEXT PRIMARY KEY, campaign_id TEXT, kind TEXT NOT NULL, status TEXT NOT NULL, provider TEXT, cache_hit INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0, error TEXT, progress TEXT, created_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE IF NOT EXISTS event_log (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, campaign_id TEXT, ts TEXT NOT NULL,
  actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS idx_asset_campaign ON asset(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_event_campaign ON event_log(campaign_id, ts);
"""

_lock = threading.RLock()
_conn = None
_path = None


def now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def init(path) -> None:
    global _conn, _path
    with _lock:
        if _conn is not None:
            _conn.close()
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        _conn = sqlite3.connect(str(path), check_same_thread=False)
        _conn.row_factory = sqlite3.Row
        if str(path) != ":memory:":
            _conn.execute("PRAGMA journal_mode=WAL")
        _conn.executescript(SCHEMA)
        _path = path


@contextmanager
def tx():
    with _lock:
        assert _conn is not None, "db.init() not called"
        try:
            yield _conn
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def one(sql: str, args=()):
    with tx() as c:
        r = c.execute(sql, args).fetchone()
        return dict(r) if r else None


def many(sql: str, args=()):
    with tx() as c:
        return [dict(r) for r in c.execute(sql, args).fetchall()]


def run(sql: str, args=()):
    with tx() as c:
        return c.execute(sql, args)


def jd(v):
    return json.dumps(v, ensure_ascii=False)


def jl(v, default=None):
    if v is None or v == "":
        return default
    return json.loads(v)
