# Frontend PRD

What the owner (and the judges) will see. Screens S0-S14 are defined in [screen-flow](screen-flow.md). Stack: Next.js + Tailwind, installable PWA. Data and events come from [api-spec](api-spec.md). Backend never exposes keys; the frontend only talks to our API.

## 1. Principles

1. **One primary action per screen.** Priya has busy hands; the phone screen has a mic and almost nothing else.
2. **Facts are visible and unforgeable.** Every price, date and condition on screen shows where it came from and whether it matches the lock.
3. **Status is always honest.** Approved / Pending / Changed / Blocked, plus "simulated send" and "saved demo output" labels wherever they apply.
4. **Show the evidence.** Scores come with variance; blocks come with the offending token; changes come with a blast-radius list.
5. **Native script is first-class.** Kannada and Devanagari render correctly everywhere (fonts, line height, no clipped matras).
6. **Fast, projector-ready.** Laptop board is dense but legible from the back of a room.

## 2. Platforms and layout

| Surface | Breakpoint | Layout |
|---|---|---|
| Phone (PWA) | 360-480 px | Single column, bottom action bar, large mic (min 72 px), thumb reach |
| Tablet / small laptop | 768-1280 px | Two panes (list + detail) |
| Laptop / projector | 1280+ px | Board grid (3-4 columns), side rail for change log and plan |

PWA: installable, standalone display, offline shell, queued voice clips when offline, camera/photo picker for uploads.

## 3. Design tokens

- Color: neutral warm background, one brand accent (taken from the owner's brand kit when present, default amber), semantic status colors that also differ by icon/shape (not color alone).
- Status chips: Approved (check, green), Pending (clock, grey/blue), Changed (diff arrow, amber), Blocked (shield-x, red).
- Type: UI in Inter or system sans. Content in Noto Sans Kannada and Noto Sans Devanagari with generous line height (>= 1.5). Never mix scripts in one chip without fallback fonts loaded.
- Spacing: 4 px grid; touch targets >= 44 px (primary >= 56 px).
- Motion: short, respects `prefers-reduced-motion`.
- Dark mode: follows system; poster previews always on neutral canvas.

## 4. Global components

| Component | Description |
|---|---|
| `AppShell` | Top bar (campaign name, sync dot, provider chip), nav rail on laptop, bottom bar on phone |
| `SyncDot` | Green = SSE connected, amber = reconnecting, grey = offline |
| `StatusChip` | The four statuses + `Simulated`, `Saved demo output` |
| `FactChip` | One fact (e.g. "20% off") with source tag ("you said", "menu") and lock version |
| `SlotText` | Renders copy with `{slots}` highlighted and, on hover, the lock field they bind to |
| `ValidatorBadge` | Green "0 issues" or red "2 issues" opening the report |
| `ProviderChip` | Which STT/TTS/LLM provider answered, latency |
| `BudgetMeter` | Three bars: rate-limit time, money, review effort, with caps |
| `Mic` | Press-and-hold and tap-toggle; waveform; language badge; permission help |
| `TranscriptEditor` | Live transcript, offer-critical tokens highlighted, inline edit, per-word confidence on long-press |
| `ReadBackPlayer` | Play/pause the TTS read-back, shows the exact script text being spoken |
| `BlastRadiusList` | Changed vs frozen assets with reason |
| `ScoreBar` | Win rate with confidence interval and repeat count |
| `Toast/Banner` | Rate-limit queue position, fallbacks, errors |

## 5. Screens

### S0 Login
- Single button "Continue with Google". Short line: "Your brand and campaigns sync to your phone and laptop."
- States: loading, not-allow-listed message, error retry.

### S1 Onboarding: Brand and data
```
+--------------------------------------------------------------+
| Set up your cafe                              Step 2 of 4    |
|--------------------------------------------------------------|
| [Menu & prices]  [Photos]  [Sample posts]  [Customers]       |
|                                                              |
|  Menu & prices: upload CSV/XLSX/PDF or type items            |
|  +--------------------------------------------------------+  |
|  | Filter coffee        Rs 60                             |  |
|  | Masala dosa          Rs 120                            |  |
|  +--------------------------------------------------------+  |
|                                                              |
|  Brand voice (editable)     Banned phrases   Taboo claims    |
|  "warm, neighbourly"        cheap, best      health claims   |
|                                                              |
|  Audiences (from your customers)                             |
|  [Regular locals] [Office crowd]  [+ Add]                    |
|                                         [ Save and continue ]|
+--------------------------------------------------------------+
```
- Customer upload: CSV mapper (phone, language, consent per channel with date). Shows counts, rejected rows and why.
- Photo upload: grid with "use for posters" toggle; shows server re-encoded preview.
- Brand Constitution is proposed from samples, editable, versioned.
- Skippable steps show the cost of skipping ("posters will use generated backgrounds").

### S2 Home / Campaigns
- List of campaigns with status summary ("12 approved, 2 pending, 1 blocked"), last change, "New campaign" (mic icon).
- Empty state: "Say your first idea" with big mic.

### S3 Voice Brief (phone-first)
```
+----------------------------+
| New campaign        [KN|EN]|
|                            |
|  "Weekend filter coffee    |
|   offer, ಇಪ್ಪತ್ತು ಪರ್ಸೆಂಟ್   |
|   off, Saturday Sunday"    |
|   ^ numbers/days highlighted|
|                            |
|        ( HOLD TO TALK )    |
|   waveform ~~~~~~~~        |
|                            |
| [Edit text]  [Looks right] |
+----------------------------+
```
- Live partial text, language badge per segment, offer-critical tokens highlighted.
- Edit transcript before continuing. "Looks right" runs cleaner + Brief Agent.
- If something critical is missing, the app asks by voice and text ("Which days?"), answer by mic.
- Fallbacks: type instead; switch STT provider from chip.

### S4 Offer Facts Lock
```
+--------------------------------------------------------------+
| Offer facts   v2 (draft)                         [Play read-back]|
|--------------------------------------------------------------|
| Item           Filter coffee            source: you said     |
| Discount       20 %                     source: you said     |
| Price          Rs 48 (was Rs 60)        source: menu x 0.8   |
| Days           Sat, Sun                 source: you said     |
| Timing         8 am - 11 am             source: asked back   |
| Terms          Dine-in only             source: you said     |
|--------------------------------------------------------------|
| Read-back script (exact words spoken):                       |
| "Filter coffee, twenty percent off, price forty-eight rupees,|
|  Saturday and Sunday, eight to eleven a.m., dine-in only."   |
|                                                              |
| [ Edit field ]                         [ Approve facts v2 ]  |
+--------------------------------------------------------------+
```
- Every field editable; each edit shows a diff and creates a new draft version.
- Read-back is per-language template-generated; shows the exact script. Approval requires play or explicit "I checked on screen" confirm.
- Locked state after approval: banner "v2 approved by Priya, 14:03" with a "Change facts" action.

### S5 Budget Planner
```
+--------------------------------------------------------------+
| What do you want?                                            |
| Languages [x] EN [x] HI [x] KN    Audiences [x] Locals [x] Office |
| Channels  [x] Instagram [x] WhatsApp [x] Poster [ ] Reel     |
| Reel seconds: [ 16 ]  (clips are 4-12 s, stitched)           |
|--------------------------------------------------------------|
| Limits   Time 3:00   Money Rs 50   Review effort 8 min       |
|--------------------------------------------------------------|
| Plan: 18 assets, 0 reels        Time 1:55  Rs 2  Review 6:40 |
| Dropped: reels (needs 5:30 of video queue, over time limit)  |
| Alternatives: [ 9 assets + 2 x 16 s reels ] [ 12 assets + 1 reel ] |
| BudgetMeter  time ####..  money #.....  review #####.        |
|                                         [ Confirm plan ]     |
+--------------------------------------------------------------+
```
- Live recompute on every toggle (client runs a fast estimate; server confirms).
- Shows why each dropped item was dropped and the cheapest way to get it back.
- See [knapsack-planner](knapsack-planner.md).

### S6 Generating
- Per-asset rows with step chips (copy, render, validate, score), queue position, per-class bars (text / image / video), cache-hit badge, retry on failure.
- A top line "Estimated finish 1:40" updating from the real queue.
- Partial results are clickable while others still run.

### S7 Campaign Board (laptop-first)
```
+----------------------------------------------------------------------+
| Weekend coffee   Facts v2 (approved)   Filter: [All] [Blocked] [KN]  |
|----------------------------------------------------------------------|
|           Instagram        WhatsApp          Poster                  |
| Locals EN [Approved 7.8]  [Approved 7.4]    [Pending 7.9]            |
| Locals HI [Approved 7.1]  [Changed]         [Pending]                |
| Locals KN [Approved 8.0]  [Blocked: "Rs 50" vs lock Rs 48]  [...]    |
| Office EN ...                                                        |
|----------------------------------------------------------------------|
| Side rail: Plan 18/18 | Change log | Next: approve 3 pending         |
+----------------------------------------------------------------------+
```
- Matrix grid by audience x language x channel; each cell shows a mini preview, `StatusChip`, score chip, validator badge.
- Bulk approve disabled for Blocked; selecting a Blocked cell opens the fix panel.
- "Best variant" star with the reason.

### S8 Asset Detail
- Left: poster/copy preview (zoom, copy-to-clipboard). Right tabs:
  - **Copy**: text with `SlotText` highlighting; language switch; edit with required reason (feeds decision log).
  - **Validator**: list of checks (digits, spelled numbers, days, conditions, slot integrity, banned phrases, SMS segments) pass/fail with the lock field referenced.
  - **Back-translation**: translated back to EN, offer fields extracted, diff vs lock as a table.
  - **History**: versions of this asset and the facts version each used.
- Actions: Approve (disabled if Blocked), Regenerate, Replace photo.

### S9 Compare and Optimize
- Pick two variants (or original vs optimized). Shows **blind pairwise** results: N repeats, win rate with confidence interval, position-swap check, per-persona reasons.
- Native-speaker vote buttons (A / B / tie) with the team member's name; shown beside the model result.
- "Optimize" runs the loop; shows each round's rewrite, validator result (must be clean), and before/after win rate. Honest label: "Pre-launch proxy, not a prediction of real sales."

### S10 Change by Voice (phone-first)
```
+----------------------------+
| Change something           |
|  ( HOLD TO TALK )          |
|  "make it Sunday only"     |
|                            |
| This is a FACT change      |
| days: Sat, Sun -> Sun      |
| Changes 6 of 18 assets     |
| 12 stay frozen             |
| [See list]   [Apply]       |
+----------------------------+
```
- Classification chip (fact / tone / scope), diff of the field, blast-radius count and list. A fact change then routes to S4 for new read-back approval before regeneration starts.

### S11 Change Log
- Timeline: time, who (Priya / system / agent), what, why, links to assets and facts versions; "pending" section on top.
- Filters: facts, tone, scope, edits, sends.

### S12 Customers and Send (simulated)
```
+--------------------------------------------------------------+
| Customers (12)           SIMULATED SEND - no real messages    |
| Phone        Lang  WhatsApp consent   SMS consent   Status   |
| +91 98xxx    KN    yes 02 Oct         no            ready    |
| +91 98xxx    HI    yes 28 Sep         yes           ready    |
| +91 98xxx    EN    opted out          -             skipped  |
|--------------------------------------------------------------|
| Audience [Locals]  Channel [WhatsApp]   Asset set [v2]       |
| Preview per language: KN 5  HI 4  EN 2   Skipped: 1          |
| Validator gate: 0 issues                  [ Simulate send ]  |
+--------------------------------------------------------------+
```
- Table shows only phone (masked), language, per-channel consent with date. Opt-out toggle.
- Send is blocked if any selected asset is Blocked or stale (older facts version).
- Send log lists each simulated message with language, asset id, facts version.

### S13 Settings (summary; full spec in [settings](settings.md))
Tabs: Providers (Agnes default or own key per capability), Voice (STT/TTS per language with sample test), Limits and budget (tier presets or custom RPM, caps), Calibration (measured latency/limits, run buttons), Usage (free-allowance meters), Data and privacy. Keys are write-only: the UI only ever shows `••••` and the last 4 characters. A banner appears when the shared default key is rate limited, offering "add your own key". Previous short description below is superseded.

#### (superseded) S13 Settings and Voice
- Provider selectors per language for STT and TTS with health, last latency, and test button.
- Language defaults, data export, delete all data, sign out.
- Banner explaining which providers are cloud vs local.

### S14 Bake-off (team tool)
- Record a list of 20 offer sentences per speaker; run each STT/TTS provider; score offer-critical-token accuracy and native-speaker ratings; table of results and a chosen-default button. Hidden from the owner UI behind a flag.

## 6. Interaction details

- **Press-and-hold mic** with haptic cue; tap-to-toggle for hands-free. Release sends the clip; interim text streams from the adapter.
- **Optimistic UI** only for non-fact actions; fact approvals wait for server confirmation.
- **Undo** for recent edits (30 s) except approvals (approvals are reversed by a new version, not undone).
- **Keyboard**: board navigable by arrows; Enter opens asset; A approves; B blocks view.
- **Live sync**: SSE updates cells in place with a short highlight.

## 7. Accessibility and i18n

- WCAG 2.2 AA target: contrast, focus visible, labels, status not by color alone, text resize to 200%.
- Screen reader names for chips ("Blocked: price mismatch").
- UI strings in English with Kannada and Hindi UI labels as P1; content scripts always correct regardless.
- `lang` attributes on every piece of generated copy so assistive tech and font selection work.
- Voice features have a typed alternative everywhere.

## 8. Performance

- Board renders 30+ asset cells without jank; images lazy-loaded and thumbnailed.
- First interactive on phone < 3 s on Wi-Fi; the mic screen is code-split and loads first.
- No client-side secrets; no calls to third-party APIs from the browser.

## 9. Frontend states checklist

For each screen: loading skeleton, empty, partial data, error with retry, offline, forbidden (not allow-listed), long text (Kannada wrapping), RTL not needed.

## 10. Demo-critical screens (build order)

1. S3 Voice Brief, S4 Offer Facts (lock + read-back)
2. S5 Budget Planner
3. S7 Board + S8 Asset Detail (validator and back-translation)
4. S10 Change by Voice with blast radius
5. S9 Compare and Optimize
6. S1 Onboarding, S12 Customers and Send
7. S0, S2, S11, S13, S14 (polish)


## 11. Studio, business builder, brand identity, website, video (S15-S19)

All run on mock data; the parts marked **real** are computed in the browser.

| Screen | What it shows | Real in the browser | Backend |
|---|---|---|---|
| S15 Studio | Two paths (have a business / no business yet), deliverable cards, "Your pack" grouped by pipeline | Selection and routing | `POST /studio/pack` (planned) |
| S16 Build my business | 6-step wizard: About you, Ideas (3 cards with example costs and risks), Name and tagline (hi/kn flagged draft), Brand look (palette + starter logos), Offer and prices (editable, opening price calculated), Launch pack (checklist, each item opens its screen) | Wizard state, price arithmetic, contrast | `POST /launch/ideas`, `/launch/names`, `/launch/pack` (planned) |
| S17 Names and brand look | Name, tagline per language, colour editor with WCAG contrast table, three starter logos, font pair, live brand preview | Contrast ratios and grades, logo SVGs | `POST /identity/propose`, `PUT /brand` |
| S18 Website | Section toggles, languages, address, device preview built from brand and approved facts, Generate and Publish | Preview | `POST /website/generate`, `GET /website/:id`, `POST /website/:id/publish` (website team) |
| S19 Reels and video | Shot list (4-12 s each), shape, length, clips, queue-time estimate, list price, job states | Maths (1 RPM queue, $0.025/s list price) | `POST /video/reel`, `GET /jobs/:id` (video team) |

Cross-cutting:
- **Screens with no backend are greyed out** in the sidebar (dimmed, tooltip "No backend yet") and on Studio cards. They stay clickable. The list is `NO_BACKEND` in `Frontend/src/data/studio.js`; remove a slug when its backend is wired. There are no Demo/Building/Teammates tags and no build-status page.
- **NotConnected banner** and **ContractCard** (`components/ui/studio.jsx`) show where a teammate's service plugs in (Website, Video). `src/api/client.js` has stub methods (`api.website.generate`, `api.video.createReel`, ...) that reject with HTTP 501 until replaced.
- The collapsed sidebar scrolls so all screens fit on a laptop height.
- Hindi and Kannada generated text is always labelled "draft: needs native review" until a native speaker checks it.
