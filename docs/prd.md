# PRD: "Tell it once" campaign studio (HR26-AI-02, Marketing Campaigns)

Status: v2 (supersedes `PS2PRD.pdf`). Owner: team PS2-RVITM. Event: HR26 AI Track, Agnes AI India Hackathon, 8 Oct 2026.
Related docs: [settings](settings.md) | [calibration](calibration.md) | [architecture](architecture.md) | [security](security.md) | [screen-flow](screen-flow.md) | [frontend.prd](frontend.prd.md) | [data-model](data-model.md) | [api-spec](api-spec.md) | [knapsack-planner](knapsack-planner.md) | [voice-stack](voice-stack.md) | [validator-and-scoring](validator-and-scoring.md) | [test-plan](test-plan.md) | [team-plan](team-plan.md) | [demo-script](demo-script.md)

---

## 1. Problem

Small business owners know what they want to say but have no time, designer or marketer. A single campaign must carry the same offer to different audiences, in different languages, across different channels, in a voice that sounds like the owner. Requirements keep changing as she sees results. The one thing that cannot go wrong is what customers are told to expect (price, date, conditions).

Hackathon brief (AI-02) minimum objectives:
1. Generate a coherent campaign adapted to different audiences, languages and channels.
2. Predict performance before launch and autonomously optimize it.
3. Preserve the exact business intent while adapting messaging to cultural and linguistic contexts.

Open creativity is scored beyond these.

## 2. Pitch in one line

**Tell it once.** Priya speaks her idea one time. The system remembers her brand, locks the facts, builds every asset, fits the work to her time/cost budget, and when she says "make it Sunday only" it changes only what depends on that.

Trust is the proof, not the headline: no asset with a wrong price/date/condition can ever be marked Approved, and we show the evidence.

## 3. Target user

Priya, owner of a cafe in Indiranagar, Bengaluru. Busy hands, behind the counter. Customers speak Kannada, Hindi and English. Posts on Instagram and WhatsApp. No designer, no marketing team.

Assumption (pitched with confidence, not user-interviewed): her felt pain is time and re-explaining herself every campaign; her fear is a wrong price going to customers.

## 4. Goals and non-goals

Goals
- Voice to a full, approved-ready campaign in under 3 minutes of owner-visible time (cache-warmed demo).
- Zero fact mismatches reach Approved.
- A change touches only dependent assets, with a blast-radius preview before it runs.
- The owner sees what exists, what changed and what is pending at all times.
- Fits free-tier limits: no paid keys.

Non-goals (out of scope)
- Posting to real social accounts, paid ad buying, analytics integrations.
- Real SMS/WhatsApp sending (DLT / WhatsApp Business Platform needs registration). Sending is simulated.
- Real-world performance learning (pitch only).

## 5. Key decisions (from team interview, 8 Oct 2026)

| # | Decision |
|---|---|
| D1 | Native Kannada speakers are on the team. Kannada stays the headline language and is bake-off tested with real speakers. |
| D2 | Hardware: MacBook M4 and RTX 5060 laptops. Local models are viable. **No paid API keys**: free tiers and local models only. |
| D3 | Team of 3-4, about 36 hours. Roles are assigned in [team-plan](team-plan.md). Work is pushed to GitHub and pulled by the PRD owner. |
| D4 | **Owner chooses the assets and reel length; a knapsack planner** shows what fits her budget (RPM, money, review effort). See [knapsack-planner](knapsack-planner.md). |
| D5 | Voice providers are pluggable and free. Local first, then Sarvam, Groq Whisper, AI4Bharat, Ollama speech models, ElevenLabs free tier, one by one by bake-off. See [voice-stack](voice-stack.md). |
| D6 | Optimizer quality is judged by **blind pairwise comparison with variance**, plus human votes from native speakers; not by a single self-score. |
| D7 | The model never writes facts. It writes `{slots}`; code fills them. The **validator runs inside the optimizer loop**. |
| D8 | P0 includes: Brand Constitution + decision log, real photo upload for posters, TTS read-back approval of the Offer Facts lock. |
| D9 | Outbound messaging: the owner uploads her own data (customers, prices, photos). Send is **simulated**, consent-checked, and gated by the validator. |
| D10 | Surface: web app on laptop and phone (PWA), synced through Google login. |
| D11 | **Bring your own key.** Text/image/video default to Agnes with the team's server-held key; any capability can be switched to the user's own key in Settings. Voice defaults to local/free adapters (Agnes has no audio). See [settings](settings.md). |
| D12 | **Calibration runs in the backend** and feeds the queue and the knapsack with measured latency, limits and token usage. See [calibration](calibration.md). |

## 6. Concrete scope matrix

Owner-defined, planner-checked. Reference demo configurations:

| Config | Assets | Reels | Notes |
|---|---|---|---|
| A (default demo) | 18 | none | 3 languages x 3 channels (Instagram post, WhatsApp text, poster) x 2 audiences |
| B | 9 | 2 x 16 s | 16 s = two stitched 4-12 s clips (Agnes Video limit is 4-12 s per clip) |
| C | custom | custom | Planner shows what fits |

Audiences are defined by the owner at onboarding and grounded in her uploaded customer list. Default two: "regular locals" and "new / nearby office crowd". Languages: English, Hindi, Kannada.

## 7. User stories

1. Priya speaks her idea and gets a full campaign in minutes.
2. She hears and sees the locked offer details (read-back) and approves them before anything goes out.
3. She tells the system how many assets and how many seconds of reel she wants; it shows what fits and why.
4. She says "make it Sunday only"; it previews "this changes 6 of 18 assets", then updates only those.
5. She can see what is approved, what changed and what is pending.
6. She sees which variant will likely do best and why, with honest uncertainty.
7. She is told about any asset blocked for a wrong price, date or dropped condition, and sees the fix.
8. She uploads her own photos, menu/prices and customer list once; they are reused in every campaign.
9. The system remembers her corrections ("never say 'cheap'") and applies them next time.
10. She uses the same account on phone (voice) and laptop (board); both stay in sync.

## 8. Features

### P0 (must ship)
1. **Onboarding data upload**: menu/prices, photos, sample posts, customer list (phone, language, per-channel consent), audiences.
2. **Brand Constitution + decision log**: voice, banned phrases, taboo claims, sample posts injected into every model call; each owner edit stored with reason.
3. **Voice input (EN + KN + HI)** with editable transcript.
4. **Offer Facts lock**: versioned JSON, TTS read-back, on-screen confirm, owner approval.
5. **Budget planner (knapsack)**: asset list + reel seconds in; best-fitting plan out, with cost breakdown.
6. **Copy** in 3 languages x channels from `{slots}`, written natively, not translated.
7. **Posters**: Agnes image or the owner's real photo, text stamped by overlay renderer.
8. **Deterministic validator** (digits, days, conditions, slot integrity, SMS length) plus structured back-translation diff.
9. **Persona scoring + one optimize loop** with blind pairwise comparison and variance, validator in loop.
10. **Voice change handling** with blast-radius preview and selective regeneration.
11. **Status board + change log**.
12. **Mock send**: per-customer language, consent check, validator gate, simulated-send log.
13. **Google login + live sync** across phone and laptop.
14. **Settings: bring your own key per capability, default Agnes**, rate-limit tiers, usage meters, and backend calibration ([settings](settings.md), [calibration](calibration.md)).

### P1 (if time)
- 8 s (or planner-sized) promo reel via Agnes Video, queued, with task-status UI and a labelled saved fallback.
- Brand kit visuals (logo, colours) reused across campaigns.

### P2 (pitch only)
- Real scheduling and sending (DLT / WhatsApp Business), live engagement feedback, festival calendar suggestions.

## 9. Success metrics (demo)

| Metric | Target | Evidence shown |
|---|---|---|
| Voice to full campaign | under 3 min (warm cache) | stopwatch on screen |
| Fact mismatches reaching Approved | 0 | fault-injection report: 20 wrong prices/dates, catch rate |
| Change blast radius | only dependent assets regenerate | diff view "4 of 18" |
| Optimized vs original | wins in blind pairwise, majority of repeats, plus native-speaker vote | variance bars, not one number |
| Kannada quality | native speaker rating >= 4/5 on offer copy | recorded ratings |
| Budget planner | plan never exceeds the owner's limits | planner proof table |

## 10. Constraints (Agnes brief of 2 Oct 2026, cross-checked with the Agnes wiki on 8 Oct 2026; re-check on the platform)

- Free-tier limits: text 10 RPM; image 1K 10, 2K 5, 3K/4K 1; video 1 RPM. Enterprise: text 20, image 1K 40 / 2K 20, video 2. Token Plan: text 1000, image 1K 100 / 2K 80, video 5. The tier belongs to the account, so a user's own key can change these limits ([settings](settings.md)).
- `agnes-3.0-flash`: 512K context, 65,536 max output, tool calling, text + image-URL input only (no audio). STT/TTS are outside Agnes.
- Images: generation can take "several seconds to tens of seconds"; use 60-360 s client timeouts.
- Video: `seconds` 4-12 per clip, async create + poll; Flash is 720P and free for a limited time; it is not an editor.
- Keep API keys on the server (user-supplied keys are stored encrypted and write-only); queue with backoff; label any saved fallback as "saved demo output".
- Prices (for the planner): text $0.05/1M input ($0.005 cached), $0.15/1M output; image $0.010 (1K) to $0.024 (4K); video 2.5 $0.025/s at 720P plus input-video duration at the same rate. Currently free: text, image, Video 2.5 Flash; promotional end dates are set by the Agnes platform.
- Voice providers (verified 8 Oct 2026, see [settings](settings.md)): Sarvam gives Rs 100 free credits (STT Rs 30/h, TTS Bulbul v3 Rs 30 per 10K chars; Starter limits STT 60 req/min, TTS 60 req/min, 30 for Bulbul v3). Groq free Whisper: 20 RPM, 2,000 requests/day, 7,200 audio-seconds/hour, 28,800/day. ElevenLabs free-tier limits are **unconfirmed**.

## 11. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Indic STT accuracy (Kannada, code-mixed) | Bake-off on offer-critical tokens; always show editable transcript; STT never writes to the lock |
| Agnes Kannada copy quality unverified | Hour-1 native-speaker check; fall back to Hindi/English live, Kannada shown as verified sample |
| Rate limits (10 RPM text) | One batched call per language covering all channels; one call for all personas x variants; cache by hash; pre-warm demo |
| Self-graded scoring looks fake | Blind pairwise, repeats, variance, human vote, honest "pre-launch proxy" label |
| AI food images are a broken promise | Real photo upload as default for posters; AI image only as background/texture |
| Wrong pronunciation in TTS read-back causes wrong approval | Template-based read-back verified by Kannada speakers; confirm on screen too |
| Scope creep | P0 list frozen at hour 4; planner is the product's own scope-control story |

## 12. Open questions

1. Sync backend: Google OAuth with sessions in FastAPI (assumed in [architecture](architecture.md)) vs Firebase Auth. Revisit if setup time is short.
2. Which STT/TTS provider wins the bake-off (see [voice-stack](voice-stack.md)).
3. Final audience names and persona set (need Priya's real customer list).
4. Video: are two stitched 4-12 s clips acceptable for a "16 s reel"?

## 13. Glossary

- **Offer Facts**: structured JSON of item, discount, price, dates, timings, terms. Single source of truth, versioned, owner-approved.
- **Slot**: a placeholder like `{discount}` bound to an Offer Facts field; filled by code, never by the model.
- **Brand Constitution**: owner's voice, banned phrases, taboo claims, sample posts.
- **Blast radius**: the set of assets that depend on a changed field.
- **Asset**: one deliverable (audience, language, channel, type).
