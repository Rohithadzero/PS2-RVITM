# Settings page (S13): providers, keys, limits, calibration

Lets any user run the product on **their own API keys**, while a fresh account works immediately on the **default Agnes setup**. Replaces the thin S13 in [frontend.prd](frontend.prd.md). Backend side: [calibration](calibration.md), [architecture](architecture.md), [security](security.md).

## 1. Principles

1. **Works on first run.** Text, image and video default to Agnes (`agnes-3.0-flash`, `agnes-image-2.5-flash`, `agnes-video-2.5` Flash) using the team's server-held key. The user does nothing.
2. **Bring your own key, per capability.** Any capability can be switched to the user's own key without touching the others.
3. **Keys are write-only.** After saving, a key is never sent back to the browser (only `••••` + last 4). It is encrypted at rest and used only by the backend.
4. **Limits are real, not assumed.** Each provider has a rate-limit tier. The backend measures actual latency and limits ([calibration](calibration.md)); the queue and the budget planner ([knapsack-planner](knapsack-planner.md)) use those numbers.
5. **Honest about quality.** Kannada/Hindi quality and tool-calling support differ by provider; the page shows capability badges and warnings before switching.
6. **Always an escape hatch.** Any provider failure falls back down a user-ordered chain, ending in local or on-screen alternatives, and the UI says which provider answered.

## 2. Capabilities and defaults

| Capability | Used for | Default | Notes |
|---|---|---|---|
| Text / LLM | Brief, cleaner, copy, planner, diff, personas, back-translation | **Agnes** `agnes-3.0-flash` | Needs JSON output and tool calling |
| Image | Poster backgrounds, creatives | **Agnes** `agnes-image-2.5-flash` | Text is never drawn by the model; overlay renderer stamps it |
| Video (optional) | Reels | **Agnes** `agnes-video-2.5` (Flash) | Async; 4-12 s clips; Agnes-specific API |
| STT | Voice brief and change commands | Local adapter (bake-off winner), else browser Web Speech | **Agnes has no audio**, so there is no Agnes default for voice |
| TTS | Read-back approval | Local adapter (bake-off winner), else browser SpeechSynthesis | Template-based text only |

"Default Agnes" therefore applies to text, image and video. For STT/TTS the default is the best free local option until the bake-off picks a winner ([voice-stack](voice-stack.md)).

## 3. Provider catalog (what the page offers)

Facts below were checked against official pages on 2026-10-08. Re-verify before the event; limits change.

### Agnes (default for text/image/video)
- Text/Image base URL: `https://apihub.agnes-ai.com/v1` (`POST /chat/completions`, `/responses`, `/messages`, `/images/generations`, `/videos`). Platform: `https://platform.agnes-ai.com`.
- Auth: `Authorization: Bearer <key>` (Messages API also accepts `x-api-key` + `anthropic-version`).
- `agnes-3.0-flash`: 512K context, 65,536 max output, text + image-URL input, tool calling, optional thinking mode. Currently free; list price $0.05/M input, $0.005/M cached, $0.15/M output.
- Image: `agnes-image-2.5-flash` `size` 1K/2K/3K/4K or WxH, `ratio` option, editing via `extra_body.image`; generation can take "several seconds to tens of seconds" (recommended client timeout 60-360 s). Currently free.
- Video: `POST /v1/videos` (`model`, `prompt`, `mode` text|keyframe|reference, `seconds` "4".."12", `size` 720P|1080P|1K|2K, `aspect_ratio`); poll `GET https://apihub.agnes-ai.com/agnesapi?video_id=<id>&model_name=agnes-video-2.5` (status `queued` / `in_progress` / `completed` / `failed`, use `status` and `url`). Flash variant free for a limited time (720P only).
- **Rate limits by account tier** (plans page): 

| Tier | Text RPM | Image RPM (1K / 2K / 3K / 4K) | Video RPM |
|---|---|---|---|
| Free / default | 10 | 10 / 5 / 1 / 1 | 1 |
| Enterprise verified | 20 | 40 / 20 / 1 / 1 | 2 |
| Token Plan | 1000 | 100 / 80 / 1 / 1 | 5 |

Token Plan quotas also exist (Starter 1,500 text requests per 5 h, 15K/week; images 4,000/day; video 500 s/day; Plus and Pro higher). The Agnes text doc says limits "are determined by your account entitlement"; the plans page is the numeric source. How to obtain a key is not documented on the wiki pages checked; use the platform dashboard.

### Sarvam (Indic STT/TTS option)
- Auth header `api-subscription-key`. TTS endpoint `https://api.sarvam.ai/text-to-speech`, model `bulbul:v3`, language codes `kn-IN`, `hi-IN`, `en-IN`, up to **2,500 characters per request**, sample rates 8000-24000 Hz (REST up to 48000), 30+ voices.
- STT: **Saaras v4**, 23 languages (22 Indian + English) including `kn-IN`, output modes `transcribe`, `translate`, `verbatim`, `translit`, `codemix`.
- Pricing: **Rs 100 free credits** on signup (never expire). STT Rs 30/hour (per second); TTS Bulbul v3 Rs 30 per 10K characters (beta pricing). So Rs 100 buys about 3.3 hours of STT or about 33,000 TTS characters.
- Rate limits (Starter): STT 60 req/min REST (20 concurrent WebSocket, 20/min batch); TTS 60 req/min REST, **Bulbul v3: 30 req/min** and 30 concurrent WebSocket. Pro: STT 100, TTS 200. Business: STT 4,000, TTS 1,000.

### Groq (cloud Whisper STT option)
- Free plan, `whisper-large-v3` and `whisper-large-v3-turbo`: **20 RPM, 2,000 requests/day, 7,200 audio-seconds/hour, 28,800 audio-seconds/day** (official rate-limit page). A secondary source states a 10-second minimum billed length per request. Whisper's Kannada accuracy is unverified; run the bake-off.
- Also offers free text LLMs with their own token limits (not used by default; tool-calling and Kannada quality must be checked).

### ElevenLabs (optional TTS/STT)
- **Free-tier details NOT confirmed from the official page** (pricing page did not state them). A secondary source reports 10,000 credits per month on the free plan. The pricing page lists Scribe v2 (STT) at 90+ languages and v3 TTS at 70+ languages; whether Kannada/Hindi are covered, whether Scribe is on the free tier, and commercial-use rules for free accounts must be checked in a real account before relying on it.

### Local adapters (free, offline)
- STT: faster-whisper / whisper.cpp (Whisper large-v3), AI4Bharat Indic models, Vosk for EN/HI only (no Kannada), Parakeet for English.
- TTS: Svara, Indic Parler-TTS, AI4Bharat Indic TTS (see `indic-tts-operators (1).pdf`, treat its table as a shortlist).
- Runs on the RTX 5060 (CUDA) or M4 (Metal). No key; shows model-ready status.

### Custom OpenAI-compatible endpoint (advanced)
- For text and (optionally) image: user supplies `base_url`, `api key`, `model`. Restrictions in section 7 (SSRF). Must pass capability probes (JSON output, tool calling) or the page warns and disables the features that need them.
- Video and the Agnes-specific polling API are **not** generic: BYO video is only offered for providers with an adapter.

## 4. Page layout

Tabs: **Providers**, **Voice**, **Limits and budget**, **Calibration**, **Usage**, **Data and privacy**.

```
+--------------------------------------------------------------------+
| Settings                                                           |
| [Providers] [Voice] [Limits] [Calibration] [Usage] [Data & privacy]|
|--------------------------------------------------------------------|
| TEXT / LLM                                                         |
|  Provider  (o) Agnes - default (shared key)   ( ) My own key       |
|  Model     agnes-3.0-flash                                         |
|  Status    OK  p50 2.1 s  p90 3.4 s   JSON 100%  Tools yes         |
|  Tier      Free (10 RPM)  [change]                                 |
|  Fallback  1. My Groq key   2. (none)            [reorder]         |
|--------------------------------------------------------------------|
| IMAGE      Agnes - default   Model agnes-image-2.5-flash  Size 1K  |
|  Status    OK  p50 14 s (timeout 120 s)                            |
|--------------------------------------------------------------------|
| VIDEO      Agnes - default (Flash, 720P)   [ ] Enable reels        |
|  Status    Not calibrated   [Calibrate video (uses 1 clip)]        |
|--------------------------------------------------------------------|
| Add / replace a key                                                |
|  Provider [Agnes v]  Key [ ********************* ]  [Test & save]  |
|  Key is stored encrypted on our server and never shown again.      |
+--------------------------------------------------------------------+
```

### Providers tab
- One card per capability (Text, Image, Video). Radio: **Agnes default** or **My own key** (provider dropdown + key field + model).
- Status line: last probe result, p50/p90 latency, JSON validity, tool-call support, current tier, observed 429s today.
- Badges: `Default`, `Your key`, `Local`, `Cloud`, `Free tier`, `Kannada: verified/unverified`.
- Actions: Test & save, Replace key, Remove key (reverts to Agnes default), Calibrate now.
- Fallback chain editor (drag to reorder) per capability.

### Voice tab
- STT and TTS cards **per language** (English, Hindi, Kannada) with provider dropdown (Local models, Sarvam, Groq, ElevenLabs, browser), key field where needed, and **Test with sample** (plays a fixed clip / speaks a fixed sentence; shows result and latency).
- Shows free-tier meters where known (e.g. Sarvam credits used, Groq audio seconds today) from the usage ledger.
- Local model readiness list (loaded / loading / missing, size).
- Link to the bake-off tool (flag-gated) and the recorded default decisions.

### Limits and budget tab
- Per provider: **Rate-limit tier** selector (presets from section 3) or **Custom** (RPM per class, daily caps, concurrency). Default tier = lowest (Agnes Free). Choosing a higher tier raises the queue's token buckets and the planner's capacity.
- Auto-detect: if the provider returns rate-limit headers, the backend shows "detected: 20 RPM" and offers to apply.
- Budget caps used by the planner: time limit, money cap (currency, default INR), review-effort cap. Defaults copied into S5.
- Price table (read-only list prices with last-verified date, user-overridable for custom endpoints).

### Calibration tab
- Table of latest measurements per provider/capability: latency p50/p90, error rate, observed limit, tokens per call type, last run time, TTL.
- Buttons: **Run quick calibration** (cheap probes), **Run full calibration** (adds video and burst test, warns about cost/time), per-capability run.
- Live progress through SSE; results saved and fed to the planner; the planner shows "using calibration from 14:02".

### Usage tab
- Per provider: calls today/this week, tokens, audio seconds, characters, images, video seconds, list-price cost vs actual spend (Rs 0 on free), 429 count, cache hits saved.
- Warnings when a free allowance is close (e.g. Groq 6,000 of 7,200 audio seconds this hour).

### Data and privacy tab
- Export all data, delete all data, delete all stored API keys, sign out of all devices.
- Statement of what goes to which provider (cloud vs local), with a per-provider toggle "allow sending audio to this provider".

## 5. Add-a-key flow

```
choose capability + provider -> paste key (+ model/base_url if custom)
  -> client-side format hint only (never validates by regex alone)
  -> POST /settings/providers/test   (backend makes a tiny real call; key not stored yet)
       ok    -> show detected model, tier hint, latency, capability badges
       fail  -> exact reason (401 invalid key, 403 plan, 404 model, timeout, DNS, SSRF-blocked)
  -> [Save] -> backend encrypts and stores, marks provider active for that capability
  -> backend schedules quick calibration (background) -> SSE updates the card
  -> old key (if any) destroyed
```

Rules:
- A key is saved only after a successful test (or explicit "save without testing" with a warning).
- Replacing a key never interrupts jobs in flight; new jobs use the new key.
- Removing a key reverts that capability to the Agnes default (text/image/video) or local/browser (voice).
- If the active provider fails repeatedly, the page shows a banner with the fallback now in use.

## 6. Feature gating by provider capability

| Feature | Requires | If missing |
|---|---|---|
| Brief / copy / planner | JSON output reliability >= 95% on probe, instruction following | Warn; allow, but show "may produce invalid JSON; retries enabled" |
| Diff agent / tool loop | Tool calling | Disable change-by-voice classification via tools; fall back to JSON-only prompt |
| Back-translation drift | Strong Kannada/Hindi | Warn "unverified quality"; native speaker review recommended |
| Posters from AI backgrounds | Image provider | Posters use the owner's photos only |
| Reels | Video provider with adapter | Reel option hidden in S5 |
| Read-back approval | TTS for the language | On-screen confirm only; flag "no audio read-back" |
| Live transcript | STT for the language | Typed brief only |

The planner reads these flags; unavailable features never appear as plannable items.

## 7. Security for user keys (details in [security](security.md))

- Stored encrypted (AES-GCM or Fernet) with a master key from server env; per-key random nonce; DB holds ciphertext only.
- Keys never returned by any API, never logged, never put in URLs, redacted from error messages and traces.
- Decrypted only inside the backend call path, held in memory for the request.
- Custom `base_url`: HTTPS only; resolve DNS and **block private, loopback, link-local and metadata IP ranges** (SSRF); no redirects to blocked ranges; per-request timeout and size caps; allow-list option for the hackathon.
- Rate-limit test and calibration calls per owner to prevent abuse of other people's endpoints.
- Deleting a key overwrites the ciphertext row; "delete all keys" is one action.
- Browser autofill off; the field is `type=password`; no clipboard logging.

## 8. Data (see [data-model](data-model.md))

- `provider_config(owner_id, capability, provider, mode default|byo|local, model, base_url, key_ciphertext, key_last4, tier, custom_limits, priority, enabled, last_test, status)`
- `calibration(provider, capability, model, metrics JSON, measured_at, ttl)`
- `usage_ledger(owner_id, provider, capability, units, unit_type, est_cost, ts)`

## 9. API (see [api-spec](api-spec.md))

`GET/PUT /settings/providers`, `POST /settings/providers/test`, `DELETE /settings/providers/:capability/key`, `PUT /settings/limits`, `GET /settings/usage`, `POST /calibration/run`, `GET /calibration`, `GET /settings/voice`, `PUT /settings/voice`.

## 10. States and errors

| State | UI |
|---|---|
| No key, default Agnes | Green "Default", note that the shared key has team-wide limits |
| Shared default key exhausted (429/quota) | Banner "Default key is rate limited"; prompt to add your own key or wait; queue shows position |
| Invalid key | "Provider rejected this key (401)". Never echo the key |
| Plan lacks access | "Your plan does not include this model (403)" |
| Model missing | List models returned by the provider when available |
| Timeout | Suggest higher timeout (image 60-360 s per Agnes) |
| Blocked URL | "That address is not allowed" |
| Calibration failed | Keep previous values, mark stale, planner uses conservative defaults |

## 11. Acceptance criteria

1. A new account generates a full campaign with zero setup (default Agnes + local/browser voice).
2. Switching text to the user's own key and running Test & save changes the active provider within one request, and the provider chip shows it.
3. The key never appears in any API response, log, client storage or build output (automated scan).
4. After adding a key, the backend calibrates it and the planner's numbers change accordingly.
5. Selecting a higher rate-limit tier raises the queue's buckets; selecting Custom with a lower RPM lowers them; no bucket ever exceeds its setting (test with simulated load).
6. Removing a key reverts to the default and nothing breaks mid-campaign.
7. SSRF test: `http://169.254.169.254`, `http://localhost`, `https://10.0.0.5` all rejected.
8. Each voice provider can be tested with a sample and shows pass/fail plus latency.

## 12. Verified limits (source list)

| Provider | Verified item | Source |
|---|---|---|
| Agnes | Endpoints, auth, 512K context, 65,536 output, tool calling, thinking mode | https://wiki.agnes-ai.com/en/docs/agnes-30-flash |
| Agnes | Tier RPM table, token plan quotas | https://wiki.agnes-ai.com/en/docs/tokenplan |
| Agnes | Pricing and free status | https://wiki.agnes-ai.com/en/docs/pricing |
| Agnes | Image request fields, timeout guidance | https://wiki.agnes-ai.com/en/docs/agnes-image-25-flash |
| Agnes | Video create/poll, 4-12 s, status values, media limits | https://wiki.agnes-ai.com/en/docs/agnes-video-25 |
| Sarvam | Rate limits, Rs 100 credits | https://docs.sarvam.ai/api/ratelimits.md |
| Sarvam | STT Rs 30/h, TTS Bulbul v3 Rs 30/10K chars | https://docs.sarvam.ai/api/pricing.md |
| Sarvam | Bulbul v3 languages, 2,500 chars, endpoint, header | https://docs.sarvam.ai/api/getting-started/models/bulbul |
| Sarvam | Saaras v4, 23 languages incl. Kannada, codemix | https://docs.sarvam.ai/api-reference-docs/getting-started/models |
| Groq | Free whisper limits (20 RPM, 2K RPD, 7.2K ASH, 28.8K ASD) | https://console.groq.com/docs/rate-limits |
| ElevenLabs | Not confirmed; secondary source only | https://elevenlabs.io/pricing/api (no free-tier numbers) |
