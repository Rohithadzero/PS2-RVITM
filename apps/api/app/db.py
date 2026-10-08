from __future__ import annotations

import sqlite3
import threading
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS campaign (
  id TEXT PRIMARY KEY,
  brand_voice TEXT,
  status TEXT NOT NULL,
  transcript TEXT NOT NULL DEFAULT '',
  suggestion TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS offer_facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  json TEXT NOT NULL,
  approved INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(campaign_id, version)
);
CREATE TABLE IF NOT EXISTS asset (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  audience TEXT NOT NULL,
  lang TEXT NOT NULL,
  channel TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  facts_used TEXT NOT NULL DEFAULT '[]',
  facts_version INTEGER,
  status TEXT NOT NULL,
  block_reason TEXT,
  score REAL,
  score_detail TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS event_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  campaign_id TEXT
);
CREATE TABLE IF NOT EXISTS job (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  asset_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  provider_ref TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS output_cache (
  prompt_hash TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  response TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_asset_campaign ON asset(campaign_id);
CREATE INDEX IF NOT EXISTS idx_facts_campaign ON offer_facts(campaign_id, version);
CREATE INDEX IF NOT EXISTS idx_event_campaign ON event_log(campaign_id, id);
CREATE INDEX IF NOT EXISTS idx_job_campaign ON job(campaign_id);
"""

ASSET_FIELDS = {
    "content",
    "status",
    "facts_used",
    "facts_version",
    "block_reason",
    "score",
    "score_detail",
    "review",
}
JOB_FIELDS = {"status", "detail", "provider_ref", "payload"}
# Columns added after the first schema. migrate() adds them to databases created before them.
ADDED_COLUMNS = (
    ("asset", "review", "TEXT"),
    ("job", "payload", "TEXT"),
)


def _row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return dict(row)


class Database:
    def __init__(self, path: Path) -> None:
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row

    def migrate(self) -> None:
        with self._lock:
            self._conn.executescript(SCHEMA)
            for table, column, kind in ADDED_COLUMNS:
                existing = {row[1] for row in self._conn.execute(f"PRAGMA table_info({table})")}
                if column not in existing:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
            self._conn.commit()

    def ensure(self, schema: str, columns: tuple[tuple[str, str, str], ...] = ()) -> None:
        """Let a feature module own its tables: run its CREATE IF NOT EXISTS script and add missing columns."""
        with self._lock:
            self._conn.executescript(schema)
            for table, column, kind in columns:
                existing = {row[1] for row in self._conn.execute(f"PRAGMA table_info({table})")}
                if column not in existing:
                    self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {kind}")
            self._conn.commit()

    def query(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return self._all(sql, params)

    def query_one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        return self._one(sql, params)

    def execute(self, sql: str, params: tuple[Any, ...] | dict[str, Any] = ()) -> None:
        self._run(sql, params)

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _one(self, sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        with self._lock:
            return _row(self._conn.execute(sql, params).fetchone())

    def _all(self, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(row) for row in self._conn.execute(sql, params).fetchall()]

    def _run(self, sql: str, params: tuple[Any, ...] = ()) -> None:
        with self._lock:
            self._conn.execute(sql, params)
            self._conn.commit()

    def campaign_insert(self, row: dict[str, Any]) -> None:
        self._run(
            """
            INSERT INTO campaign (id, brand_voice, status, transcript, suggestion, created_at)
            VALUES (:id, :brand_voice, :status, :transcript, :suggestion, :created_at)
            """,
            row,
        )

    def campaign_get(self, campaign_id: str) -> dict[str, Any] | None:
        return self._one("SELECT * FROM campaign WHERE id = ?", (campaign_id,))

    def campaign_list(self) -> list[dict[str, Any]]:
        return self._all("SELECT * FROM campaign ORDER BY created_at DESC")

    def campaign_set(self, campaign_id: str, **fields: Any) -> None:
        allowed = {"status", "brand_voice", "suggestion", "transcript"}
        unknown = set(fields) - allowed
        if unknown:
            raise ValueError(f"unknown campaign fields: {sorted(unknown)}")
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self._run(
            f"UPDATE campaign SET {assignments} WHERE id = ?",
            tuple(fields.values()) + (campaign_id,),
        )

    def facts_insert(self, row: dict[str, Any]) -> None:
        self._run(
            """
            INSERT INTO offer_facts (campaign_id, version, json, approved, created_at)
            VALUES (:campaign_id, :version, :json, :approved, :created_at)
            """,
            row,
        )

    def facts_next_version(self, campaign_id: str) -> int:
        row = self._one(
            "SELECT COALESCE(MAX(version), 0) AS version FROM offer_facts WHERE campaign_id = ?",
            (campaign_id,),
        )
        return int(row["version"]) + 1 if row else 1

    def facts_latest(self, campaign_id: str) -> dict[str, Any] | None:
        return self._one(
            """
            SELECT * FROM offer_facts
            WHERE campaign_id = ?
            ORDER BY version DESC
            LIMIT 1
            """,
            (campaign_id,),
        )

    def facts_approved(self, campaign_id: str) -> dict[str, Any] | None:
        return self._one(
            """
            SELECT * FROM offer_facts
            WHERE campaign_id = ? AND approved = 1
            ORDER BY version DESC
            LIMIT 1
            """,
            (campaign_id,),
        )

    def facts_approve(self, campaign_id: str, version: int) -> None:
        self._run(
            "UPDATE offer_facts SET approved = 1 WHERE campaign_id = ? AND version = ?",
            (campaign_id, version),
        )

    def asset_insert(self, row: dict[str, Any]) -> None:
        self._run(
            """
            INSERT INTO asset (
              id, campaign_id, audience, lang, channel, type, content, facts_used,
              facts_version, status, block_reason, score, score_detail, review, created_at
            ) VALUES (
              :id, :campaign_id, :audience, :lang, :channel, :type, :content, :facts_used,
              :facts_version, :status, :block_reason, :score, :score_detail, :review, :created_at
            )
            """,
            {"review": None, **row},
        )

    def asset_get(self, asset_id: str) -> dict[str, Any] | None:
        return self._one("SELECT * FROM asset WHERE id = ?", (asset_id,))

    def asset_find(self, campaign_id: str, audience: str, lang: str, channel: str) -> dict[str, Any] | None:
        return self._one(
            """
            SELECT * FROM asset
            WHERE campaign_id = ? AND audience = ? AND lang = ? AND channel = ?
            """,
            (campaign_id, audience, lang, channel),
        )

    def assets_for(self, campaign_id: str) -> list[dict[str, Any]]:
        return self._all(
            """
            SELECT * FROM asset
            WHERE campaign_id = ?
            ORDER BY lang, channel, audience
            """,
            (campaign_id,),
        )

    def asset_update(self, asset_id: str, **fields: Any) -> None:
        unknown = set(fields) - ASSET_FIELDS
        if unknown:
            raise ValueError(f"unknown asset fields: {sorted(unknown)}")
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self._run(
            f"UPDATE asset SET {assignments} WHERE id = ?",
            tuple(fields.values()) + (asset_id,),
        )

    def log(self, ts: str, actor: str, action: str, detail: str | None, campaign_id: str | None) -> None:
        self._run(
            """
            INSERT INTO event_log (ts, actor, action, detail, campaign_id)
            VALUES (?, ?, ?, ?, ?)
            """,
            (ts, actor, action, detail, campaign_id),
        )

    def events(self, campaign_id: str, limit: int = 40) -> list[dict[str, Any]]:
        return self._all(
            """
            SELECT * FROM event_log
            WHERE campaign_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (campaign_id, limit),
        )

    def job_insert(self, row: dict[str, Any]) -> None:
        self._run(
            """
            INSERT INTO job (
              id, campaign_id, asset_id, kind, status, detail, provider_ref, payload, created_at, updated_at
            ) VALUES (
              :id, :campaign_id, :asset_id, :kind, :status, :detail, :provider_ref, :payload, :created_at, :updated_at
            )
            """,
            {"payload": None, **row},
        )

    def job_get(self, job_id: str) -> dict[str, Any] | None:
        return self._one("SELECT * FROM job WHERE id = ?", (job_id,))

    def job_update(self, job_id: str, updated_at: str, **fields: Any) -> None:
        unknown = set(fields) - JOB_FIELDS
        if unknown:
            raise ValueError(f"unknown job fields: {sorted(unknown)}")
        fields = {**fields, "updated_at": updated_at}
        assignments = ", ".join(f"{key} = ?" for key in fields)
        self._run(
            f"UPDATE job SET {assignments} WHERE id = ?",
            tuple(fields.values()) + (job_id,),
        )

    def job_open_for_asset(self, asset_id: str, kind: str = "copy") -> dict[str, Any] | None:
        return self._one(
            """
            SELECT * FROM job
            WHERE asset_id = ? AND kind = ? AND status IN ('queued', 'waiting_for_key', 'running')
            ORDER BY created_at DESC
            LIMIT 1
            """,
            (asset_id, kind),
        )

    def jobs_for_campaign(self, campaign_id: str, limit: int = 100) -> list[dict[str, Any]]:
        return self._all(
            """
            SELECT * FROM job
            WHERE campaign_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (campaign_id, limit),
        )

    def cache_get(self, prompt_hash: str) -> str | None:
        row = self._one("SELECT response FROM output_cache WHERE prompt_hash = ?", (prompt_hash,))
        return None if row is None else row["response"]

    def cache_put(self, prompt_hash: str, kind: str, response: str, created_at: str) -> None:
        self._run(
            """
            INSERT INTO output_cache (prompt_hash, kind, response, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(prompt_hash) DO UPDATE SET response = excluded.response, kind = excluded.kind
            """,
            (prompt_hash, kind, response, created_at),
        )
