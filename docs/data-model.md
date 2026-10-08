# Data model

SQLite (WAL). All rows carry `owner_id` and every query is owner-scoped (see [security](security.md)). Times are UTC ISO-8601. JSON columns hold validated JSON.

## 1. Entities

```sql
CREATE TABLE owner (
  id TEXT PRIMARY KEY,                -- internal id
  google_sub TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE brand (                  -- Brand Constitution, versioned
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  version INTEGER NOT NULL,
  voice TEXT NOT NULL,                -- "warm, neighbourly"
  banned_phrases JSON NOT NULL,       -- ["cheap","best"]
  taboo_claims JSON NOT NULL,         -- ["health claims","competitor names"]
  sample_posts JSON NOT NULL,
  languages JSON NOT NULL,            -- ["en","hi","kn"]
  created_at TEXT NOT NULL,
  UNIQUE(owner_id, version)
);

CREATE TABLE audience (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  name TEXT NOT NULL,                 -- "Regular locals"
  description TEXT,                   -- grounded in uploaded customer data
  persona JSON NOT NULL               -- fixed persona traits, not LLM-invented each run
);

CREATE TABLE menu_item (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  name TEXT NOT NULL,
  price_inr INTEGER NOT NULL          -- whole rupees
);

CREATE TABLE upload (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  kind TEXT NOT NULL,                 -- photo | menu | customers | sample_post
  path TEXT NOT NULL,                 -- under data/uploads, re-encoded
  mime TEXT NOT NULL,
  use_for_posters INTEGER DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE campaign (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  name TEXT NOT NULL,
  brand_version INTEGER NOT NULL,
  status TEXT NOT NULL,               -- draft | facts_pending | planning | generating | live
  brief JSON,                         -- cleaned brief (intent, tone, audiences, channels)
  transcript_raw TEXT,
  transcript_edited TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE offer_facts (
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  version INTEGER NOT NULL,
  json JSON NOT NULL,                 -- see schema below
  approved INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT,
  approval_method TEXT,               -- readback_played | onscreen_confirm
  PRIMARY KEY (campaign_id, version)
);

CREATE TABLE plan (                   -- knapsack output
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  request JSON NOT NULL,              -- wanted assets, reel seconds, limits
  chosen JSON NOT NULL,               -- selected asset keys, reel clips
  dropped JSON NOT NULL,              -- with reasons
  cost JSON NOT NULL,                 -- time, money, review effort, call counts
  created_at TEXT NOT NULL
);

CREATE TABLE asset (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  audience_id TEXT REFERENCES audience(id),
  lang TEXT NOT NULL,                 -- en | hi | kn
  channel TEXT NOT NULL,              -- instagram | whatsapp | poster | reel
  type TEXT NOT NULL,                 -- copy | poster | reel
  template TEXT,                      -- model output with {slots}
  content TEXT,                       -- rendered text (slots filled)
  media_path TEXT,
  facts_used JSON NOT NULL,           -- ["discount","days"]
  facts_version INTEGER NOT NULL,
  status TEXT NOT NULL,               -- pending | approved | changed | blocked
  block_reason JSON,                  -- {token, field, rule}
  score JSON,                         -- {win_rate, ci, repeats}
  is_fallback INTEGER DEFAULT 0,      -- "saved demo output"
  updated_at TEXT NOT NULL
);

CREATE TABLE validator_report (
  id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL REFERENCES asset(id),
  facts_version INTEGER NOT NULL,
  results JSON NOT NULL,              -- per-check pass/fail with tokens
  back_translation TEXT,
  extracted JSON,                     -- fields extracted from back-translation
  drift JSON,                         -- structured diff vs lock
  passed INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE comparison (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaign(id),
  a_asset_id TEXT NOT NULL,
  b_asset_id TEXT NOT NULL,
  repeats INTEGER NOT NULL,
  results JSON NOT NULL,              -- per-run winner, position, persona reasons
  win_rate_b REAL,
  ci_low REAL, ci_high REAL,
  human_votes JSON,                   -- [{voter, choice}]
  created_at TEXT NOT NULL
);

CREATE TABLE decision_log (           -- Brand memory
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  asset_id TEXT,
  before TEXT, after TEXT,
  reason TEXT NOT NULL,
  rule TEXT,                          -- derived rule e.g. "never say cheap"
  rule_status TEXT,                   -- proposed | confirmed | expired
  expires_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE customer (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  phone TEXT NOT NULL,
  lang_pref TEXT NOT NULL,
  opted_out INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE consent (
  id TEXT PRIMARY KEY,
  customer_id TEXT NOT NULL REFERENCES customer(id),
  channel TEXT NOT NULL,              -- whatsapp | sms
  granted_at TEXT NOT NULL,
  text_version TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE send_log (               -- simulated only
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  facts_version INTEGER NOT NULL,
  channel TEXT NOT NULL,
  outcome TEXT NOT NULL,              -- simulated_sent | skipped_no_consent | skipped_opt_out | blocked_validator | blocked_stale
  ts TEXT NOT NULL
);

CREATE TABLE provider_config (        -- Settings: provider per capability
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES owner(id),
  capability TEXT NOT NULL,           -- text | image | video | stt | tts
  lang TEXT,                          -- for stt/tts: en | hi | kn, else NULL
  provider TEXT NOT NULL,             -- agnes | sarvam | groq | elevenlabs | local:<name> | custom_openai
  mode TEXT NOT NULL,                 -- default | byo | local
  model TEXT,
  base_url TEXT,                      -- custom endpoints only; SSRF-validated
  key_ciphertext BLOB,                -- AES-GCM / Fernet; NULL for default/local
  key_last4 TEXT,
  tier TEXT,                          -- free | enterprise | token_plan | starter | pro | business | custom
  custom_limits JSON,                 -- {"rpm":{"text":10},"daily":{},"concurrency":1}
  priority INTEGER NOT NULL DEFAULT 0,-- fallback order, 0 = primary
  enabled INTEGER NOT NULL DEFAULT 1,
  status JSON,                        -- last test result, health
  updated_at TEXT NOT NULL
);

CREATE TABLE calibration (            -- measured by backend, see calibration.md
  id TEXT PRIMARY KEY,
  owner_id TEXT,                      -- NULL = shared default key
  provider TEXT NOT NULL,
  capability TEXT NOT NULL,
  model TEXT,
  mode TEXT NOT NULL,                 -- quick | full
  metrics JSON NOT NULL,              -- latency p50/p90 per probe, tokens, json_valid_rate, tools_supported, limits, error_rate
  measured_at TEXT NOT NULL,
  ttl_s INTEGER NOT NULL DEFAULT 86400
);

CREATE TABLE usage_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  capability TEXT NOT NULL,
  unit_type TEXT NOT NULL,            -- tokens_in | tokens_out | images | video_s | audio_s | chars
  units REAL NOT NULL,
  est_cost_inr REAL,                  -- list-price estimate
  actual_cost_inr REAL DEFAULT 0,
  ts TEXT NOT NULL
);

CREATE TABLE job (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  kind TEXT NOT NULL,                 -- text | image | video | stt | tts
  status TEXT NOT NULL,               -- queued | running | done | failed
  provider TEXT,
  cache_hit INTEGER DEFAULT 0,
  attempts INTEGER DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL,
  finished_at TEXT
);

CREATE TABLE event_log (              -- append-only
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  campaign_id TEXT,
  ts TEXT NOT NULL,
  actor TEXT NOT NULL,                -- owner | system | agent:<name>
  action TEXT NOT NULL,
  detail JSON
);
```

## 2. Offer Facts JSON schema

```json
{
  "item": {"menu_item_id": "m12", "name": "Filter coffee"},
  "discount_pct": 20,
  "price_inr": 48,
  "original_price_inr": 60,
  "days": ["sat", "sun"],
  "start_date": "2026-10-10",
  "end_date": "2026-10-11",
  "time_window": {"from": "08:00", "to": "11:00"},
  "terms": ["dine_in_only"],
  "exclusions": [],
  "cta": "visit"
}
```

Rules:
- `terms` is a controlled vocabulary (e.g. `dine_in_only`, `while_stocks_last`, `one_per_customer`, `no_delivery`) so dropped conditions can be detected.
- Every field maps to a **slot** name: `{item}`, `{discount}`, `{price}`, `{original_price}`, `{days}`, `{dates}`, `{time}`, `{terms}`.
- Numerals are stored as numbers and always rendered with **Western digits** in every script.
- `price_inr` must equal `original_price_inr` x (1 - `discount_pct`/100) rounded per documented rule, or the lock cannot be approved (arithmetic is checked in code).

## 3. Dependency map

`asset.facts_used` lists slot names the asset contains. Blast radius for a changed field `f` = all assets whose `facts_used` contains `f` (plus all assets if `item` changes). Assets with no overlap stay `approved` and frozen.

## 4. Statuses

| Status | Meaning | Transitions |
|---|---|---|
| pending | Generated, not yet approved | -> approved, blocked, changed |
| approved | Owner approved against facts_version N | -> changed (fact change touching it) |
| changed | Facts or tone changed; needs regeneration or re-validation | -> pending |
| blocked | Validator found mismatch | -> pending (after fix) |

An asset can be `approved` only if latest `validator_report.passed = 1` and `asset.facts_version` equals the campaign's approved facts version.

## 5. Indexes

- `asset(campaign_id, status)`, `asset(campaign_id, lang, channel)`
- `event_log(campaign_id, ts)`
- `customer(owner_id, phone)` unique
- `job(status, kind)`
