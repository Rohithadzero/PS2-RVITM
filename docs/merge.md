# One app from two builds: what was kept from each

Two parallel builds existed on 8 Oct 2026. This record says what was compared, what was kept and why, so nobody has to rediscover it.

- **Build A (this repo):** Rohith's React/Vite GrowIT UI on mock data, plus Kabir's docs, planner, validator lab, Vosk adapter and calibration.
- **Build B (`francisreubenr-rvu/PS2RVITM`):** Francis's FastAPI + SQLite backend and Next.js app, "Counter Voice". Real, 146 tests, verified live against Agnes.

## Backend: Build B is the runnable API

| Concern | Kept | Why |
|---|---|---|
| Interview, grounding, plan, schedule | **B** | Scripted questions in code; every number, date and weekday must appear in the owner's words; every plan line carries its source quote. Stronger than our free-form voice brief |
| Validator | **B** (`app/validator.py`) | Covers KN/HI weekdays, month names, terms contradictions; passes all 10 dataset audit cases |
| Meaning check | **B** (`app/review.py`) | Blind back-translation, code decides, one repair. Replaces our drift-check sketch |
| Change by voice, selective regeneration | **B** | Uses real `facts_used` dependencies and re-queues only affected assets |
| Media, outreach, dashboard, personas | **B** | Agnes images, tracked links, SMTP with mailto fallback, dashboard from the app's own tables, synthetic-persona prediction and optimizer |
| Budget planner (exact knapsack) | **A** (`app/lab/domain/planner.py`) | B has no planner. Extended to B's image channels |
| Offline speech to text (Vosk) | **A** (`app/lab/voice/vosk_stt.py`) | B uses browser speech only |
| Bring-your-own provider keys | **A** (`app/extras.py`, `app/lab/security.py`) | Encrypted at rest, write-only, SSRF check on custom URLs; a saved key overrides the server key |
| Calibration | **A** | Measured numbers feed the planner |

Not carried over (still in git history, commit `518eaba`): the slot renderer with validator V0-V12 (`app/lab/domain/`, kept and tested but not wired into B's pipeline), the offline LLM stub, Wilson-interval pairwise scoring, SQLite schema with versioned facts, Google session auth. B's persona scoring replaces pairwise scoring for the pre-launch proxy. Auth is still open.

`app/lab/` is the lab core from build A: `domain/` (facts, slots, validator V0-V12, number words, planner), `voice/` (Vosk), `security.py`. Its 59 tests still run.

## Frontend: A's shell, B's flow

| Choice | From | Why |
|---|---|---|
| Visual language: dark glass panel, orange accent, white content cards, Figtree | **A** | One consistent product look, Indic fonts handled, works with the sidebar |
| Sidebar, floating stage pill, Studio group, greyed screens with no backend | **A** | Wider than B's four screens; the pill is the single stage navigation |
| Talk: one question at a time, spoken aloud, big mic, "What I heard" with the owner's own words and edit | **B** | Better voice-first UX than a single transcript box |
| Plan: offer sentence first, a quote under every line, dated schedule | **B** | Shows why each fact is there |
| Campaign 0: each asset drawn as its real surface (email, Instagram post and story, WhatsApp bubble, blog, poster, Google post) with fact and meaning checks | **B** | Owners judge assets in context |
| Dashboard: real numbers only, empty states say what has not happened | **B** | No placeholder data |
| Home, right panel, header chips | **A** layout, **B** data | Cards and calendar kept, now read from the API |
| Budget Planner page | **A** UI, **A** server solver | Calls `POST /planner/solve` |
| Settings | **A** layout, trimmed to what is real | Providers (own Agnes key per capability), offline voice, calibration. Limits, usage and data tabs removed until they have a backend |
| Next.js app, Tauri and Capacitor shells | shells **B**, app dropped | Shells now point at `Frontend/dist`; the hash router works from a static folder. Not built or run here |

B's campaign screens live in `Frontend/src/campaign/` (TypeScript, copied from `apps/web`). Their CSS is scoped under `.cv` (`campaign.css`) and re-skinned by `theme.css`; Francis's original retro paper style is no longer used. Sheets render in a portal so the glass panel does not trap them.

## Screens

| Screen | Slug | Backend |
|---|---|---|
| Home | `home` | `/campaigns/overview`, `/campaign/:id/dashboard` |
| Talk | `voice` | `/interview/*` |
| Plan | `plan` | `/campaign/:id/plan`, `/plan/approve` |
| Budget Planner | `planner` | `POST /planner/solve` |
| Campaign 0 | `campaign` | `/campaign/generate`, `/board`, `/assets/*` |
| Dashboard | `dashboard` | `/campaign/:id/dashboard`, `/predict`, `/optimize` |
| Change by Voice, Change Log | `change`, `log` | `/campaign/:id/change/*`, board events |
| Settings | `settings` | `/settings/providers`, `/calibration`, `/stt` |
| Studio, Build my business, Names, Website, Reels | greyed | teammates' services |
| Customers, Brand & Data, Bake-off | greyed | no backend yet |

The current campaign is kept in `localStorage` (`ll-campaign`) so every screen opens on it.

## Known gaps

- Kannada copy from `agnes-3.0-flash` is unreliable; the meaning check catches invented words and wrong claims it can read, not meaning inversions with no keyword. Native review is still required.
- A full campaign takes minutes at the free 10 RPM.
- Sign in with Google is built (`app/auth.py`, login screen) but needs a Google client: set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. It is open by default for local work; set `REQUIRE_LOGIN=1` to protect the API and `ALLOWED_EMAILS` to restrict who gets in. The desktop and phone shells will need their own Google client types later.
- Real microphone recognition needs a human test in Chrome. Vosk Hindi accuracy is untested.
- Offer types such as bundles, buy-one-get-one, thresholds and caps are not modelled in the offer facts.
- Tauri and Capacitor shells are repointed but untested.
