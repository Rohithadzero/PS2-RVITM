# Test plan

Goal: prove the claims the demo makes (zero fact mismatches reach Approved, change touches only dependents, plans respect limits, optimized beats original) with evidence a judge can see.

## 1. Claims and how each is proven

| Claim | Test | Evidence shown |
|---|---|---|
| 0 mismatches reach Approved | Fault injection (20+ corrupted assets) + 20 clean assets | Catch-rate table, false-positive count |
| A change touches only dependents | Dependency-map unit tests + integration: change `days`, assert exact set regenerated | "6 of 18 changed, 12 frozen" diff |
| Plan never exceeds limits | Property tests on the knapsack solver | Plan proof table in S5 |
| Optimized beats original | Blind pairwise, N repeats, position swap, native votes | Win rate + CI + votes |
| Kannada copy is authentic | Native speaker ratings >= 4/5 on a sample | Recorded ratings |
| Voice brief works in 3 languages | STT bake-off OCTA, end-to-end voice -> facts | Bake-off table |
| Under 3 minutes | Stopwatch run with warm cache, then cold run documented | Timer on screen |
| Read-back is correct | Native speakers verify templates and number/day pronunciation | Verified-template checklist |

## 2. Unit tests (backend, pytest)

- **Slot renderer**: each field renders in EN/HI/KN with Western digits; unknown slot fails; missing required slot fails.
- **Validator rules V1-V11**: table-driven cases per rule and per language; Devanagari/Kannada digits; spelled numbers; weekend/today phrases; dropped terms; implied promises; banned phrases; SMS segments (GSM-7 vs UCS-2 edges at 70/67).
- **Arithmetic**: price vs discount rounding; reject inconsistent locks.
- **Dependency map**: changing each field yields the expected asset set.
- **Knapsack**: limits respected; language fixed-charge logic; reel clip combinations; determinism; infeasible case returns nearest feasible plan.
- **Token buckets**: no more than the limit per minute under load; backoff on 429.
- **Cache**: same inputs hit; different facts_version miss.
- **Status machine**: illegal transitions rejected (e.g. approve a blocked asset, approve stale version).
- **Consent gate**: no send without channel consent; opt-out skipped; blocked/stale assets cannot send.
- **Auth/authz**: other owner's ids return 404; unauthenticated 401; non-allow-listed 403.

- **Provider registry / BYO keys**: key encrypted at rest; no API response, log line or error contains a key; replace/remove reverts to default; SSRF rejection (`localhost`, `169.254.169.254`, `10.x`, redirects to those); format errors never echo the key.
- **Tier limits**: selecting Free/Enterprise/Token Plan/Custom sets bucket sizes; under simulated load no bucket exceeds its setting.
- **Calibration**: quick run stays within 10 text RPM on Free; results change planner output (inject records); 429 storm shrinks effective RPM; video only in full mode.

## 3. Integration tests

1. Voice clip fixture -> STT adapter (mock + one real) -> cleaner -> brief -> facts draft.
2. Cleaner guard: numbers changed by the cleaner without a stated correction are flagged.
3. Facts approval -> plan -> generate (mock Agnes) -> board; all assets reach Pending or Blocked, none Approved without owner action.
4. Fact change: "make it Sunday only" -> preview -> new version -> read-back approval -> selective regeneration; untouched Approved assets keep their timestamps and content.
5. Optimizer: injected rewrite that changes a price is rejected by in-loop validator.
6. Offline: kill network -> local STT/TTS and saved outputs keep demo alive; all fallbacks labelled.
7. Sync: approve on phone client, assert laptop client receives `asset.updated` within 1 s.
8. Rate limits: simulate 429; queue drains with backoff; UI shows position.
9. Settings: new account runs end-to-end on default Agnes + local voice with zero setup; adding a user key switches the provider chip within one request; shared default key exhausted shows the banner and keeps queued work.
10. Capability gating: provider without tool calling disables tool-based change classification; provider without TTS for a language falls back to on-screen confirm.

## 4. Evaluations (not pass/fail unit tests)

**Fault-injection harness** (`tests/fault_injection/`): generates corrupted variants of real outputs across the categories in [validator-and-scoring](validator-and-scoring.md); outputs a CSV and a summary table; part of CI for the validator.

**STT bake-off** (S14): OCTA per provider per language, saved to `docs/voice-decisions.md` with date.

**TTS bake-off**: pronunciation pass/fail per script per provider.

**Pairwise evaluation**: for a fixed seed set of 5 campaigns, compute win rates before/after optimization; store raw runs.

**Native-speaker review sheet**: 20 assets x (accuracy, naturalness, brand voice) 1-5; averaged and shown.

## 5. Frontend tests

- Component tests for `StatusChip`, `SlotText`, `BudgetMeter`, `BlastRadiusList`.
- Playwright E2E: login (mock), voice stub, facts approve, plan, generate, board, change by voice, compare.
- Visual checks for Kannada and Devanagari rendering (no clipped matras) at phone and laptop widths.
- Accessibility: axe checks on key screens; keyboard navigation for the board.
- PWA: install, offline shell, queued clip upload on reconnect.

## 6. Demo rehearsal tests

- 3 full run-throughs with timer.
- Cold-cache run once to know the worst case.
- Network-off run using local adapters.
- Phone + laptop sync with a real Google account.
- Pre-warmed cache check: every demo prompt hash present.
- Fallback labels visible on every saved output.

## 7. Exit criteria before the event

- [ ] Fault injection: 100% of injected faults blocked/flagged; false positives reported.
- [ ] Kannada native speakers signed off on read-back templates and validator lexicons.
- [ ] STT/TTS defaults chosen by bake-off and recorded.
- [ ] End-to-end cold run completes; warm run under 3 min.
- [ ] No keys in repo or frontend bundle.
- [ ] Simulated-send banner present; only team numbers in customer list.
