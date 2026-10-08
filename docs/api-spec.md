# API spec

FastAPI. JSON unless stated. All routes except `/auth/*` require the session cookie and are owner-scoped. Errors: `{ "error": {"code": "...", "message": "..."} }`. Long work returns a `job_id` and progress arrives over SSE or `GET /jobs/:id`.

## 1. Auth

| Method | Path | Notes |
|---|---|---|
| GET | `/auth/google/login` | Redirect to Google (PKCE) |
| GET | `/auth/google/callback` | Sets session cookie; allow-list enforced |
| POST | `/auth/logout` | Clears session |
| GET | `/me` | `{id, email}` |

## 2. Onboarding and brand

| Method | Path | Body / result |
|---|---|---|
| POST | `/uploads` | multipart: `kind`, file. Returns upload record (re-encoded) |
| GET | `/uploads?kind=` | List |
| POST | `/menu/import` | From a menu upload or JSON items; returns parsed items for review |
| PUT | `/menu` | Save reviewed items |
| POST | `/customers/import` | CSV; returns accepted, rejected rows with reasons |
| GET | `/customers` | Masked phone, lang, consents, opt-out |
| PATCH | `/customers/:id` | Opt-out, language |
| DELETE | `/customers` | Delete all customer data |
| POST | `/brand/propose` | LLM proposes Brand Constitution from samples |
| PUT | `/brand` | Save new version |
| GET | `/brand` | Latest |
| GET/PUT | `/audiences` | List / save audiences |

## 3. Voice

| Method | Path | Notes |
|---|---|---|
| POST | `/voice` | multipart audio + `lang_hint` + `provider?`. Returns `{transcript, segments[{start,end,text,conf}], lang, provider, latency_ms}` |
| POST | `/voice/clean` | `{transcript}` -> cleaned text (self-corrections applied, no acting on content) |
| POST | `/tts/readback` | `{campaign_id, facts_version, lang}` -> `{audio_url, script_text}`; template-generated; cached per version |
| GET | `/voice/providers` | Health, latency, language support |
| PUT | `/voice/providers` | Default provider per language |

## 4. Campaign flow

| Method | Path | Notes |
|---|---|---|
| POST | `/campaign` | `{name}` -> campaign |
| POST | `/campaign/:id/brief` | `{transcript_edited}` -> brief + draft facts (`facts_version` n) + any missing-info questions |
| PUT | `/campaign/:id/facts` | Edit draft facts; returns new draft version |
| POST | `/facts/approve` | `{campaign_id, version, method}` -> locks version; rejects if arithmetic/terms invalid |
| POST | `/campaign/:id/plan` | `{wanted, reel_seconds, limits}` -> plan (chosen, dropped, alternatives, cost) |
| POST | `/campaign/:id/plan/confirm` | `{plan_id}` |
| POST | `/campaign/generate` | `{campaign_id, plan_id}` -> `{job_id}` (requires approved facts and confirmed plan) |
| GET | `/campaign/:id/board` | Assets with status, score, validator summary, facts versions |
| GET | `/asset/:id` | Detail incl. validator_report, history |
| PATCH | `/asset/:id` | Edit copy with `reason`; revalidates; writes decision_log |
| POST | `/asset/:id/approve` | 409 if blocked or facts_version stale |
| POST | `/asset/:id/regenerate` | Job |
| GET | `/jobs/:id` | `{status, progress, queue_position, provider, cache_hit, error}` |
| GET | `/campaign/:id/events` | SSE stream (see section 6) |

## 5. Scoring, optimization, change

| Method | Path | Notes |
|---|---|---|
| POST | `/compare` | `{a_asset_id, b_asset_id, repeats}` -> comparison with win rate, CI, persona reasons |
| POST | `/compare/:id/vote` | `{choice}` human vote |
| POST | `/campaign/:id/optimize` | Runs <= 2 rounds; validator inside each round; returns before/after comparisons |
| POST | `/campaign/change` | `{campaign_id, text}` (voice flow sends `/voice` first) -> `{class: fact|tone|scope, diff, blast_radius: {changed[], frozen[]}}` (preview only) |
| POST | `/campaign/change/apply` | `{preview_id}` -> new facts draft or job; fact changes still need `/facts/approve` |
| GET | `/campaign/:id/log` | event_log + pending items |

## 6. Customers and send (simulated)

| Method | Path | Notes |
|---|---|---|
| POST | `/send/preview` | `{campaign_id, audience_id, channel}` -> per-language counts, skipped (no consent / opt-out), blocked (validator / stale facts) |
| POST | `/send/simulate` | Writes `send_log` rows with outcome; never contacts a real provider |
| GET | `/send/log` | Send log |

## 7. Planner

| Method | Path | Notes |
|---|---|---|
| POST | `/planner/solve` | Pure function: `{wanted, reel_seconds, limits, calibration?}` -> plan. Used by the UI for live recompute (also available client-side) |
| GET | `/planner/calibration` | Measured per-call latencies and prices used by the solver |

## 7a. Settings, providers and calibration (see [settings](settings.md), [calibration](calibration.md))

| Method | Path | Notes |
|---|---|---|
| GET | `/settings/providers` | Per capability: active provider, mode (default/byo/local), model, tier, `key_last4`, status, fallback chain. **Never returns a key** |
| POST | `/settings/providers/test` | `{capability, provider, key, model?, base_url?}` -> tiny real call; returns ok, latency, detected model/tier, capability badges, or exact error. Key is not stored |
| PUT | `/settings/providers` | Save (encrypts key); triggers quick calibration; body may set fallback order |
| DELETE | `/settings/providers/:capability/key` | Remove own key; capability reverts to default (text/image/video) or local/browser (voice) |
| PUT | `/settings/limits` | Tier presets or custom RPM/daily caps, budget caps, currency |
| GET | `/settings/usage` | Calls, tokens, audio seconds, characters, images, video seconds, list-price cost vs actual, 429 counts |
| GET/PUT | `/settings/voice` | Per-language STT/TTS provider and key |
| POST | `/calibration/run` | `{capability?, provider?, mode: quick|full}` -> `{job_id}` |
| GET | `/calibration` | Latest records |
| DELETE | `/settings/data` | Delete all data and keys |

SSE additions: `calibration.updated`, `provider.status` (health/fallback in use), `usage.warning` (allowance nearly used).

## 8. Bake-off (internal, flag-gated)

| Method | Path | Notes |
|---|---|---|
| POST | `/bakeoff/stt` | Run a sample set through providers; returns offer-critical-token accuracy, WER, latency |
| POST | `/bakeoff/tts` | Generate read-backs per provider; collects native ratings |
| GET | `/bakeoff/results` | Table |

## 9. SSE events (`GET /campaign/:id/events`)

```
event: asset.updated      data: {asset_id, status, score?, facts_version}
event: job.progress       data: {job_id, kind, status, queue_position?, provider?, cache_hit?}
event: facts.versioned    data: {version, approved}
event: change.logged      data: {event_id, action}
event: plan.updated       data: {plan_id}
event: send.logged        data: {outcome_counts}
```
Each event has an id; clients resume with `Last-Event-ID`.

## 10. Core contracts (shared types)

```ts
type Status = 'pending' | 'approved' | 'changed' | 'blocked'
type Channel = 'instagram' | 'whatsapp' | 'poster' | 'reel'
type Lang = 'en' | 'hi' | 'kn'

type Asset = {
  id: string; audience_id: string; lang: Lang; channel: Channel
  content?: string; media_url?: string
  facts_used: string[]; facts_version: number
  status: Status; block_reason?: {token: string; field: string; rule: string}
  score?: {win_rate: number; ci: [number, number]; repeats: number}
  is_fallback: boolean
}

type PlanRequest = {
  wanted: {lang: Lang; channel: Channel; audience_id: string; priority?: number}[]
  reel_seconds: number
  limits: {time_s: number; money_inr: number; review_s: number}
}
```
Keep these in `packages/contracts` and generate types for both web and API.

## 11. Status codes

200/201 success, 202 job accepted, 400 validation, 401 unauth, 403 not allow-listed, 404 not found (also for other owners' objects), 409 state conflict (blocked / stale), 429 rate limited (with `retry_after`), 502 provider error (with fallback info).


## 12. Planned services (frontend contracts; not built by the backend team)

The frontend already calls these through `src/api/client.js` (they reject with 501 today). Owners implement them; the shapes below are what the UI sends and reads. All text on generated assets goes through the same slot renderer and validator as campaign copy, and carries `facts_version`.

| Method | Path | Owner | Notes |
|---|---|---|---|
| POST | `/studio/pack` | Backend | Body: selected deliverables. Returns which pipelines will run and their readiness |
| POST | `/launch/ideas` | Backend (planner agent) | Body: city, skills, budget, hours, avoid. Returns ranked ideas with startup range, first-month target, risks, channels. Ranges must be labelled estimates |
| POST | `/launch/names` | Backend | Body: idea id, language list. Returns names and taglines per language; hi/kn flagged `needs_native_review` |
| POST | `/launch/pack` | Backend | Returns the launch checklist and which deliverables are ready |
| POST | `/identity/propose` | Backend | Returns palette, fonts, voice, banned phrases; palettes must meet WCAG AA text contrast |
| POST | `/website/generate` | Website team | See the Website screen for the exact JSON; returns 202 with `site_id` |
| GET | `/website/:id` | Website team | `status` queued / in_progress / ready / failed, `preview_url`, `facts_version`, `validator` |
| POST | `/website/:id/publish` | Website team | Returns the live URL; refuses if `facts_version` is stale or validator failed |
| POST | `/video/reel` | Video team | Body: shots (4-12 s each), aspect ratio, overlay from locked facts. Returns `reel_id` and one `job_id` per clip |
| GET | `/video/:id` | Video team | Status and stitched URL; `labelled_fallback` true for saved demo output |

Website: business name and tagline, palette and fonts, languages, sections, menu, offer facts and photos in; `site_id`, status, preview URL, facts version and validator result out.

Video: Agnes clips are 4-12 s, created with `POST /v1/videos` and polled until `completed` or `failed`; free-tier video is 1 request per minute. A reel longer than 12 s is several clips joined deterministically (ffmpeg). Offer text and prices on screen are stamped by code from the approved facts, never drawn by the model.

Not-connected behaviour: until a service is live the UI shows a "not connected" banner with the service owner and keeps local previews and cost maths usable.
