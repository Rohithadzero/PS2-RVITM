# Architecture

Companion to [prd](prd.md). Stack follows `Architecture.pdf`, extended for the decisions in the PRD.

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js + Tailwind, installable PWA | One codebase for laptop board and phone mic; PWA avoids app-store work |
| Backend | FastAPI (Python), async | Agent orchestrator, queue, validator, adapters |
| Auth | Google OAuth (Authorization Code flow, backend-held session cookie) | "Google login to sync" with no extra service |
| Store | SQLite (WAL) + local `/assets` folder | Zero setup, one file to back up |
| Realtime | Server-Sent Events (SSE) per campaign | Phone and laptop see the same board; simpler than WebSockets |
| LLM | Default `agnes-3.0-flash` via `https://apihub.agnes-ai.com/v1/chat/completions` (512K context, 65,536 max output, tool calling; thinking mode off for latency unless a step needs it). User-selectable provider via Settings | Mandated by hackathon, free |
| Images | Default `agnes-image-2.5-flash` via `/v1/images/generations` (`size`, `ratio`, optional `extra_body.image` for editing; client timeout 60-360 s) | Backgrounds / creatives when no real photo |
| Video | Default `agnes-video-2.5` Flash: `POST /v1/videos` (`mode`, `seconds` "4".."12", `size`), then poll `GET https://apihub.agnes-ai.com/agnesapi?video_id=...&model_name=...` every 1-2 s; statuses queued / in_progress / completed / failed | Optional reels |
| Provider registry | Per owner, per capability: default / BYO key / local, fallback chain, tier, encrypted key ([settings](settings.md)) | User can bring their own API key |
| Calibration | Backend module measuring latency, limits, tokens, capability support ([calibration](calibration.md)) | Feeds token buckets and the planner |
| STT / TTS | Pluggable adapters (see [voice-stack](voice-stack.md)) | Agnes has no audio |
| Overlay renderer | HTML template to PNG with Playwright (or Satori) | Text is stamped by code, never drawn by the image model |
| Local models | Run on RTX 5060 (CUDA) or M4 (Metal/CPU) behind HTTP adapters | Free, offline-capable |

## 2. System diagram

```
 Phone (PWA, mic)         Laptop (board)
        \                    /
         \---- HTTPS ------/            Google OAuth
                  |                          |
           +------v--------------------------v------+
           |              FastAPI app               |
           |  routes -> orchestrator -> agents      |
           |        \-> job queue (token buckets)   |
           |        \-> validator (deterministic)   |
           |        \-> renderer (slots, overlay)   |
           |        \-> SSE hub                     |
           +--+---------+----------+----------+-----+
              |         |          |          |
         SQLite +    Voice      Agnes API    Playwright
         /assets    adapters   (text/img/   overlay
                    (STT/TTS)   video)      renderer
                       |
          local models (RTX 5060 / M4) or free cloud tiers
```

Phone reaches the laptop backend over the same Wi-Fi, or through a free tunnel (Cloudflare Tunnel / ngrok) for the demo. Keep the tunnel URL out of git.

## 3. Pipeline

1. **Voice in**: audio -> STT adapter -> raw transcript (any language mix) -> owner can edit.
2. **Transcript cleaner** (LLM, suzune-style rules: apply self-corrections first, never answer or act on the text, keep every other word, no format changes).
3. **Brief Agent**: extracts intent, tone, audiences, channels, offer details. Asks back by voice only if something critical is missing. Reads Brand Constitution.
4. **Offer Facts lock**: structured JSON, versioned. Read-back by TTS from templates, on-screen confirm, owner approval. Nothing downstream runs until approved.
5. **Budget planner** (knapsack, deterministic): owner's wanted assets + reel seconds + limits -> chosen plan. See [knapsack-planner](knapsack-planner.md).
6. **Planner Agent**: expands the chosen plan into the asset matrix with dependency map (`asset -> facts_used[]`).
7. **Copy Agent**: one batched call per language covering all channels and audiences; output uses `{slots}`; native-language prompt, not translation.
8. **Renderer**: fills slots from the locked Offer Facts (Western digits in all scripts), enforces channel limits (WhatsApp length, SMS segments).
9. **Creative Agent**: poster = owner's real photo (default) or text-free Agnes image; overlay renderer stamps copy and facts.
10. **Video Agent (P1)**: queued (video bucket, 1 RPM on the Free tier), create then poll until `completed` or `failed`, status UI, labelled saved fallback. A reel longer than 12 s is several 4-12 s clips (stitched deterministically with ffmpeg).
11. **Validator** (deterministic) + structured back-translation diff. Blocks mismatches.
12. **Persona Panel + Optimizer**: blind pairwise scoring with repeats, rewrite weak variants, validator re-runs inside each loop, max 2 loops.
13. **Board**: every asset tagged Approved / Pending / Changed / Blocked; SSE pushes updates.

## 4. Change handling

```
voice/text command -> STT -> Diff Agent classifies: fact | tone | scope
fact  -> bump Offer Facts version, new read-back + approval, regenerate assets whose facts_used contains the changed field
tone  -> update Brand/campaign tone, regenerate copy only for affected audiences (preview first)
scope -> planner re-runs knapsack with new asset/reel list, adds/removes assets
always -> blast-radius preview ("changes 4 of 18") before running; untouched Approved assets stay frozen
```

## 5. Request queue and rate limits

One server-side queue with token buckets per class:

| Class | Limit | Notes |
|---|---|---|
| text | 10 RPM | Batch: 1 call per language, 1 call for all personas x variants |
| image 1K | 10 RPM (2K: 5, 3K/4K: 1) | Default 1K |
| video | 1 RPM | Strict single worker; poll status; label fallback |

- Exponential backoff with jitter on 429.
- Cache key = hash(model, prompt, inputs, facts_version). Hit = no call, no cost.
- Pre-warm: before the demo, run the full pipeline once so re-demos are free and instant.
- Every saved fallback shown in UI with the label "saved demo output".

Call budget for config A (18 assets): about 3 copy calls + 1 persona/pairwise call per round + 1-2 rewrite calls + 1 brief + 1 diff + back-translation checks (batched per language) = roughly 12-16 text calls, about 90 s of RPM budget. The planner computes this exactly.

### 5a. Limits come from tier and calibration, not constants
The numbers above are the **Agnes Free tier** (text 10, image 1K 10 / 2K 5 / 3K-4K 1, video 1 RPM). Enterprise (text 20, image 1K 40 / 2K 20, video 2) and Token Plan (text 1000, image 1K 100 / 2K 80, video 5) tiers exist, and a user's own key may be on a different tier. Bucket sizes therefore read `provider_config.tier` / custom limits and the latest `calibration` record; production 429s shrink the effective RPM and it recovers slowly (AIMD). The shared default key and each user's own key have separate buckets. Voice providers have their own buckets (e.g. Groq Whisper free: 20 RPM, 2,000 req/day, 7,200 audio-seconds/hour; Sarvam Starter: STT 60 req/min, TTS 60 req/min, Bulbul v3 30).

## 6. Provider adapters

```
STT.transcribe(audio, lang_hint) -> {text, segments[{start,end,text,conf}], lang}
TTS.speak(text, lang, voice)     -> audio bytes + duration
LLM.chat(messages, tools)        -> Agnes
```

Adapters are registered by name in config. The active provider per language is chosen by bake-off result and can be switched at runtime. If the active provider fails, fall back down a configured list and show which one answered.

## 7. Realtime sync

- `GET /campaign/:id/events` (SSE) streams `asset.updated`, `job.progress`, `facts.versioned`, `change.logged`.
- Phone and laptop both subscribe; board state is server-derived, not client-held.
- On reconnect the client refetches the board then resumes events (event ids).

## 8. Storage layout

```
data/
  app.db                 SQLite (WAL)
  assets/{campaign}/{asset}.png|.mp4
  uploads/{owner}/...    photos, menu files, customer CSV
  cache/{hash}.json      LLM/image outputs
  fallbacks/             labelled saved demo outputs
```

Schema in [data-model](data-model.md).

## 9. Deployment (hackathon)

- Backend and frontend on the demo laptop (RTX 5060 for local models; M4 as backup).
- `.env` on the server only (default Agnes key, Google client id/secret, session secret, `KEY_ENCRYPTION_MASTER` for user-supplied keys, `CALIBRATE_ON_START`). User-supplied keys live encrypted in the DB, never in `.env`.
- Phone connects over Wi-Fi or tunnel; laptop projects the board.
- Offline fallback: local STT/TTS adapters (EN/HI via Vosk or Whisper; Kannada via the bake-off winner) and saved outputs, so venue Wi-Fi failure does not kill the demo.

## 10. Failure modes

| Failure | Behavior |
|---|---|
| Agnes 429 | Backoff + queue; UI shows position |
| Agnes down | Serve cached/saved outputs, labelled |
| STT wrong | Editable transcript; offer-critical tokens highlighted; STT never writes lock directly |
| TTS provider down | On-screen read-back only plus second provider |
| Validator mismatch | Asset set to Blocked with the offending token and the lock field; optimizer may not "fix" by editing facts |
| Phone offline | Queue the voice clip locally (PWA) and send on reconnect |
| Video task slow/failed | Keep status polling; show labelled saved clip |
