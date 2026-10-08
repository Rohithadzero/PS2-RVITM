# Team plan

Team of 3-4, about 36 hours. The PRD owner designs the docs and contracts first; teammates build in parallel and push to GitHub; the PRD owner pulls, reviews against these docs, and integrates.

## 1. Roles

| Role | Owns | Primary docs |
|---|---|---|
| **PRD / integration lead** | These docs, contracts, review of pushed work, demo script, pitch | prd, screen-flow, demo-script |
| **Frontend** | Next.js PWA, screens S0-S14, SSE client, poster preview | frontend.prd, screen-flow |
| **Backend / agents** | FastAPI, provider registry + BYO key encryption, calibration module, queue and token buckets, Agnes calls, planner/copy/creative/diff agents, knapsack, SSE, storage | architecture, api-spec, data-model, knapsack-planner |
| **Voice / validation** | STT/TTS adapters and bake-off, read-back templates, cleaner, validator, drift check, fault injection, native-speaker lexicons | voice-stack, validator-and-scoring, test-plan |

With 3 people, merge PRD lead into whoever is lightest on the critical path; keep the voice/validation owner separate because the validator is the product's core.

## 2. Repository layout (monorepo)

```
ps2-rvitm/
  apps/
    web/                 # Next.js + Tailwind PWA
    api/                 # FastAPI
      routes/ agents/ planner/ validator/ voice/ queue/ store/
  packages/
    contracts/           # shared types + JSON schemas (Offer Facts, Asset, PlanRequest)
  tests/
    fault_injection/ e2e/ fixtures/
  docs/                  # this folder
  data/                  # gitignored runtime data
  .env.example           # placeholders only
```

## 3. GitHub workflow

- `main` protected: merges by PR only, reviewed by the integration lead.
- Branches: `feat/<area>-<short>` (e.g. `feat/validator-v1`).
- Commit small and often; push at least hourly so the lead can pull and see progress.
- Contracts first: changes to `packages/contracts` need a PR touching both sides and a note in `docs/api-spec.md`.
- Never commit `.env`, uploads, `data/`, or API keys. CI checks for secrets.
- Daily integration points at hours 8, 16, 24, 30: merge to `main`, run E2E, fix breaks.

## 4. Interfaces that unblock parallel work

Agree these in hour 0-2; each side then builds against a mock.

1. Offer Facts JSON schema and slot names (`data-model.md`).
2. Asset and status types, SSE event shapes (`api-spec.md`).
3. Planner request/response (`knapsack-planner.md`).
4. STT/TTS adapter interface (`voice-stack.md`).
5. Validator input/output (`validator-and-scoring.md`).

Mocks: a fake Agnes server returning canned copy with slots; fake STT returning fixture transcripts; fake TTS returning a beep with duration. The frontend runs fully against the mock API from hour 2.

## 5. 36-hour timeline

| Hours | Frontend | Backend / agents | Voice / validation | PRD lead / design |
|---|---|---|---|---|
| 0-2 | Scaffold Next.js PWA, design tokens, fonts, routes | FastAPI skeleton, SQLite, auth stub, queue, mock Agnes, provider registry stub | Adapter interfaces, record bake-off sets with Kannada speakers | Lock contracts and schemas; assign roles; confirm Agnes keys |
| 2-4 | Auth screen, shell, mock API client | Real Agnes text call + Kannada quality check with native speaker; **run first quick calibration** ([calibration](calibration.md)) | Run STT bake-off, start lexicons | Persona set from Priya's customers; sample data |
| 4-10 | S3 voice brief, S4 facts + read-back | Brief agent, cleaner, facts versioning, approve route | STT/TTS defaults chosen; read-back templates; validator V1-V5 | Brand Constitution content, copy prompts review |
| 10-16 | S5 planner UI | Knapsack solver + calibration, Planner and Copy agents, slot renderer | Validator V6-V11, back-translation drift | Check Kannada output with speakers |
| 16-22 | S6/S7 board, S8 asset detail | Creative agent + overlay renderer, jobs/SSE, board route | Fault-injection harness; wire validator into pipeline | Posters, brand kit visuals |
| 22-28 | S9 compare, S10 change by voice, S11 log | Diff agent, dependency map, selective regeneration, persona panel, optimizer with in-loop validator | Blind pairwise stats (CI), human vote capture | Demo data and script |
| 28-32 | S1 onboarding, S12 customers/send (simulated), S13 settings tabs ([settings](settings.md)) | Uploads, customers/consent, send gate, P1 video if time | E2E validation tests, offline adapters | Pitch deck, pre-warm cache |
| 32-36 | Polish, a11y, phone/laptop sync checks | Hardening, secrets/BYO-key scan, full calibration, fallbacks labelled | Final bake-off record, fault-injection report | Rehearse x3, recordings, fallbacks |

Priorities if time slips (cut in this order): video reel (P1), brand kit visuals, S13 polish, S14 UI (use CLI scripts), onboarding extras. Never cut: Offer Facts lock, validator, blast-radius change, board, read-back.

## 6. Definition of done (per feature)

- Matches the relevant doc and contracts.
- Unit/integration tests added from [test-plan](test-plan.md).
- Works against the mock and the real backend.
- Statuses and labels honest (Blocked, Simulated, Saved demo output).
- No secrets, no PII in logs.

## 7. Native-speaker tasks (Kannada/Hindi)

1. Hour 1: rate Agnes Kannada/Hindi copy samples (accept or fall back).
2. Hours 0-4: record the STT sets; rate TTS read-backs.
3. Hours 4-12: write number-word, day and term lexicons; verify read-back templates.
4. Hours 20-30: rate assets, vote in pairwise comparisons, review blocked-asset explanations.
5. Hours 30-36: final accuracy sign-off.

## 8. Handoff contract to the PRD lead

When pushing, include in the PR: what changed, which doc section it implements, how to run it, known gaps. The lead pulls, runs, and either merges or logs gaps in `docs/gaps.md`.
