# Backend calibration

The backend measures how the configured providers actually behave and publishes those numbers to the request queue and the budget planner ([knapsack-planner](knapsack-planner.md)). It runs inside the FastAPI backend (module `apps/api/calibration/`), never in the browser, using the same provider adapters and keys as production calls ([settings](settings.md)).

**Status:** specified, not yet run. Running it needs a valid Agnes key and the backend; neither exists yet. It is the first thing to execute once they do (team-plan hour 2-4).

## 1. Why

- Agnes's own docs do not give latency, and note rate limits are "determined by your account entitlement"; the plans page gives numeric RPMs per tier.
- Image generation "may take several seconds to tens of seconds"; video is queued at 1 RPM plus generation time. The planner's time estimate needs measured values, not guesses.
- BYO keys change everything: a Token Plan key is 100x faster than Free; a custom endpoint may lack tool calling or reliable JSON.
- Free allowances (Groq audio seconds, Sarvam credits) must be tracked so the app warns before running out.

## 2. What is measured

| Metric | How | Used by |
|---|---|---|
| Latency p50/p90 per capability and call type | k timed probe calls (below) | Planner time model, UI estimates |
| Time to first token / total (text, streaming) | stream probe | Live UI hints |
| Image generation time at 1K | 1-3 probe images | Planner, client timeouts |
| Video queue + generation time (4 s 720P) | 1 clip, optional | Planner reel cost; marked "full calibration only" |
| STT latency and real-time factor | fixed fixture clips (EN/HI/KN, 5 s) | Voice UX, provider choice |
| STT offer-critical-token check | fixtures with known numbers/days | Quick sanity before activating a provider |
| TTS latency and duration per character | fixed fixture strings | Read-back timing |
| Tool-call support | one forced function call | Feature gating |
| JSON validity rate | 5 structured-output probes | Feature gating, retry policy |
| Kannada sanity | one short Kannada generation scored by a script (script/Unicode block check) plus flag for native review | Badge "Kannada: unverified/verified" |
| Token usage per call type | `usage` fields from responses (copy batch, persona batch, brief, diff) | Planner money cost |
| Rate limits | response headers if present (`x-ratelimit-*`, `retry-after`) else configured tier; 429 observed in production | Token buckets |
| Error rate | failures / probes | Provider health |
| Max output / context | known from docs (Agnes: 65,536 / 512K), verified by probe if cheap | Batching size |

Rate-limit **discovery by hammering is avoided**. The calibration reads headers and the configured tier. A "burst test" exists only in full calibration, is opt-in, sends at most `limit + 1` requests within a minute, and stops at the first 429.

## 3. When it runs

| Trigger | Mode | Notes |
|---|---|---|
| Backend startup (if `CALIBRATE_ON_START=true`) | quick | Uses default providers; results cached |
| A provider/key is added, replaced, or its tier changes | quick for that provider | Triggered by `POST /settings/providers` |
| User presses "Run quick/full calibration" | quick / full | S13 Calibration tab |
| Before the demo | full | Runbook step |
| Staleness: result older than 24 h, or p50 drifts > 30% vs recent production, or sustained 429s | quick | Self-correcting |

Calibration calls go through the **same queue and token buckets** as normal work, at lowest priority, one provider at a time, so calibration cannot starve a live campaign or breach a limit.

## 4. Probes (quick mode)

Total budget: about 12 text calls, 2 images, 0 video, plus voice fixtures if a voice provider is under test. At Agnes Free (10 RPM text) that is about 1.5 minutes of bucket time; images at 10 RPM are quick.

```
text:
  P1 ping           "reply with OK" (latency floor)
  P2 json           structured Offer-Facts extraction from a fixed sentence (validity + latency)
  P3 tools          one function call (tool support)
  P4 copy-batch     one Kannada+Hindi+English copy request with slots (realistic tokens, latency, Kannada script check)
  P5 pairwise       one persona pairwise scoring request (realistic tokens)
  repeat P2,P4,P5 up to 3 times for p50/p90
image:
  I1 1K poster background, 16:9 or 1:1, fixed prompt; record time and bytes
  (I2 repeat once)
stt (per language under test):
  fixture_en.wav, fixture_hi.wav, fixture_kn.wav (known text with numbers/days)
tts (per language under test):
  fixture strings; record latency, audio duration, and playable check
```

Full mode adds: video 4 s 720P clip (Agnes: `POST /v1/videos`, then poll `GET /agnesapi?video_id=...&model_name=agnes-video-2.5` every 1-2 s until `completed`/`failed`), burst test, 2K image, and 10 repeats.

Fixtures live in `tests/fixtures/calibration/` and are labelled; calibration never uses owner or customer data.

## 5. Output

Stored in `calibration` ([data-model](data-model.md)) and returned by `GET /calibration`:

```json
{
  "provider": "agnes", "capability": "text", "model": "agnes-3.0-flash",
  "measured_at": "2026-10-08T14:02:11Z", "ttl_s": 86400, "mode": "quick",
  "tier": "free",
  "limits": {"rpm": 10, "source": "tier_preset"},
  "latency_s": {"ping": {"p50": 0.9, "p90": 1.6}, "json": {"p50": 1.8, "p90": 2.9},
                "copy_batch": {"p50": 6.2, "p90": 9.4}, "pairwise": {"p50": 5.1, "p90": 8.0}},
  "tokens": {"copy_batch": {"in": 1900, "out": 1700}, "pairwise": {"in": 1400, "out": 600}},
  "json_valid_rate": 1.0, "tools_supported": true,
  "kannada": {"script_ok": true, "needs_native_review": true},
  "error_rate": 0.0
}
```
Numbers above are placeholders to show the shape; real values come from the run. Image record example: `{"size":"1K","p50":14,"p90":28,"timeout_s":120}`.

## 6. How the numbers are used

1. **Token buckets** take RPM from `limits.rpm` (tier preset, detected headers, or custom setting). Bucket capacity never exceeds it. Production 429s multiplicatively reduce the effective RPM and slowly raise it back (AIMD).
2. **Planner** ([knapsack-planner](knapsack-planner.md)):
   - bucket time per call = 60 / RPM;
   - latency per call = measured p50 (plan) and p90 (risk range);
   - text/image/video classes run in parallel; per-class time = serial bucket time + tail latency;
   - money = measured tokens x provider price (Agnes list prices even though currently free);
   - review effort stays a user setting.
3. **UI**: S3/S6 time estimates; S13 status lines; provider health badges.
4. **Client timeouts**: image/video request timeouts = max(60 s, 3 x p90) up to the 360 s Agnes recommends.
5. **Gating** ([settings](settings.md) section 6): tools/JSON/Kannada results enable or disable features.

## 7. Failure and staleness

- A failed probe records the error and keeps the previous good values, marked `stale`.
- No calibration yet: planner uses conservative defaults (text 10 RPM, p50 8 s, image p50 30 s, video p50 150 s) and shows "estimate, not calibrated".
- Calibration never blocks a user: it runs in the background and the app is usable immediately.
- If calibration itself exceeds its budget (more than 3 minutes quick, 10 minutes full) it aborts and reports partial results.

## 8. Implementation sketch

```python
# apps/api/calibration/run.py
async def calibrate(owner_id, capability=None, mode="quick"):
    providers = active_providers(owner_id, capability)
    for p in providers:
        probes = PROBES[p.capability][mode]
        results = []
        for probe in probes:
            t0 = time.monotonic()
            try:
                resp = await queue.submit(p, probe, priority="low")   # same buckets as prod
                results.append(Probe(name=probe.name, ok=check(probe, resp),
                                     dt=time.monotonic()-t0, usage=resp.usage,
                                     headers=resp.rate_limit_headers))
            except RateLimited as e:
                results.append(Probe(name=probe.name, ok=False, rate_limited=True, retry_after=e.retry_after))
        save(summarize(p, results))
        sse.publish(owner_id, "calibration.updated", {...})
```

`summarize` computes p50/p90 (nearest-rank), error rate, JSON validity, tool support, token averages, detected limits.

## 9. API (see [api-spec](api-spec.md))

- `POST /calibration/run` `{capability?, provider?, mode: quick|full}` -> `{job_id}`
- `GET /calibration` -> latest records per provider/capability
- SSE `calibration.updated`

## 10. Acceptance criteria

1. With only the default Agnes key set, `POST /calibration/run` (quick) completes without exceeding 10 text RPM and writes text and image records.
2. Planner output changes when calibration values change (unit test with injected records).
3. A provider without tool calling is detected and the dependent feature is disabled in the UI.
4. A simulated 429 storm reduces the effective RPM and the planner reflects it.
5. No calibration call contains owner or customer data; no key appears in logs.
6. Video calibration runs only in full mode and respects 1 RPM.

## 11. Runbook (first run)

1. Put the Agnes key in `.env` (server only).
2. Start the backend; set `CALIBRATE_ON_START=true`.
3. `POST /calibration/run {mode:"quick"}`; watch SSE.
4. Check text p50/p90, image p50, JSON validity and Kannada script check; ask a native speaker to read the P4 Kannada output (calibration cannot judge authenticity).
5. Run full mode once before the demo (adds video) and record results in `docs/calibration-results.md` with the date.
