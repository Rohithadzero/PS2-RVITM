# Screen flow

Companion to [prd](prd.md) and [frontend.prd](frontend.prd.md). Screens are numbered S1... and referenced by `frontend.prd.md`.

## 1. Screen inventory

| ID | Screen | Device emphasis | Purpose |
|---|---|---|---|
| S0 | Login (Google) | both | Sign in, sync across devices |
| S1 | Onboarding: Brand & data | laptop (phone ok) | Upload menu/prices, photos, sample posts, customers; build Brand Constitution and audiences |
| S2 | Home / Campaigns | both | List campaigns, start new, resume |
| S3 | Voice Brief | phone-first | Big mic, live transcript, edit, cleaned brief |
| S4 | Offer Facts Lock | both | Structured facts form, TTS read-back, approve |
| S5 | Budget Planner | both | Pick assets and reel seconds; see what fits (knapsack) |
| S6 | Generating | both | Queue progress per asset, token-bucket status |
| S7 | Campaign Board | laptop-first | Asset grid with statuses, filters, scores |
| S8 | Asset Detail | both | Preview, copy per language, validator report, back-translation, edit |
| S9 | Compare & Optimize | laptop | Blind pairwise A/B, variance, persona reasons, optimize result |
| S10 | Change by Voice | phone-first | Speak a change, blast-radius preview, confirm |
| S11 | Change Log | both | What changed, why, pending |
| S12 | Customers & Send | laptop | Consent list, per-customer language, simulated send, send log |
| S13 | Settings (Providers, Voice, Limits, Calibration, Usage, Data) | laptop | Bring-your-own API keys per capability (default Agnes), STT/TTS providers, rate-limit tiers, calibration, usage, data export/delete. See [settings](settings.md) |
| S14 | Bake-off (internal) | laptop | Record/score STT and TTS providers (team tool, hidden from owner) |
| S15 | Studio | both | Choose what to make (posts, WhatsApp, posters, taglines, brand kit, website, reel); routes to the pipeline that makes each |
| S16 | Build my business | both | No-business path: about you, ideas, name and tagline, brand look, offer and prices, launch pack |
| S17 | Names and brand look | laptop | Business name, taglines per language, colours with contrast checks, starter logos, fonts |
| S18 | Website | laptop | Section editor and live local preview; generation/publish by the website service |
| S19 | Reels and video | both | Shot list, length, queue time and cost; generation by the video service |

## 2. Primary flow

```
S0 Login
  | first time
  v
S1 Onboarding (brand + data upload) ---------------------+
  |                                                      |
  v                                                      |
S2 Home -- new campaign --> S3 Voice Brief               |
                              | edit transcript          |
                              v                          |
                           S4 Offer Facts Lock           |
                              | read-back + approve      |
                              v                          |
                           S5 Budget Planner             |
                              | confirm plan             |
                              v                          |
                           S6 Generating                 |
                              | per-asset progress       |
                              v                          |
                           S7 Board <---------------------+ (uses Brand Constitution, customers)
                       /   |    |     \
                      v    v    v      v
                    S8   S9   S10     S12
                  Asset Compare Change  Customers
                  Detail Optimize by Voice & Send
                              |
                              v
                            S11 Change Log
```

## 3. Flow steps in detail

1. **S0**: "Continue with Google". Allow-listed accounts only. On success go to S1 (first time) or S2.
2. **S1**: upload menu/prices, photos, sample posts, customer CSV with language and consent columns. System proposes Brand Constitution (voice, banned phrases, taboo claims) and 2 audiences. Owner edits and saves. Skippable steps show what is lost.
3. **S2**: campaigns list with status chips and "New campaign".
4. **S3**: press-and-hold or tap mic. Live transcript with language badge. Offer-critical tokens (numbers, days, %) highlighted. Edit inline. "Looks right" -> cleaner + Brief Agent. If critical info missing, voice question appears (e.g. "Which days?").
5. **S4**: brief becomes structured Offer Facts (item, discount, price, dates, timings, terms). Per-field source chip ("you said", "from menu price list"). **Play read-back** (TTS from template) and confirm. "Approve facts" creates version N. Nothing generates before this.
6. **S5**: owner enters wanted assets (matrix of languages, channels, audiences) and reel seconds, plus limits (time, money, review effort). Planner shows the chosen plan, what was dropped, and why. "Confirm plan".
7. **S6**: live progress with queue position, per-class bars (text/image/video), cache hits, any labelled fallbacks.
8. **S7**: grid by audience x language x channel. Status chips: Approved, Pending, Changed, Blocked. Score chip with confidence. Filters by status/language. Bulk approve only for non-Blocked.
9. **S8**: poster/copy preview, `{slots}` rendered, validator report (green/red, which token vs which lock field), back-translation extracted fields vs lock, edit with reason (feeds decision log), approve.
10. **S9**: pick two variants -> blind pairwise result with repeats and variance, persona reasons, native-speaker vote buttons. "Optimize" runs the loop and shows before/after.
11. **S10**: speak "make it Sunday only". Transcript shown. Diff Agent says "fact change: days". **Blast radius**: "changes 6 of 18 assets; 12 stay frozen" with the list. Confirm -> new facts version needs read-back approval -> selective regeneration.
12. **S11**: timeline of events: who/what/why, facts versions, pending items.
13. **S12**: customer table with language, consent per channel, opt-out. Pick audience -> "Simulate send": each customer gets own language asset; consent check; validator gate; send log. Banner: "Simulated send, no real messages".
14. **S13**: six tabs. Providers: Agnes default or own key per capability (text, image, video) with Test & save. Voice: STT/TTS provider per language with sample test. Limits: rate-limit tier and budget caps. Calibration: measured latency/limits and run buttons. Usage: calls, audio seconds, characters, list-price cost vs actual. Data: export/delete data and keys. Add-a-key flow: paste -> backend test -> save encrypted -> background calibration -> active. Details in [settings](settings.md).

## 4. State rules

| Rule | Behavior |
|---|---|
| Facts gate | S5-S12 locked until facts version approved |
| New facts version | All assets using changed fields move to Changed and need re-validation; others stay Approved and frozen |
| Blocked asset | Cannot be approved or sent; shows offending token and lock field |
| Offline phone | Voice clip queued locally, banner "will send when online" |
| Provider failure | Auto fallback; chip shows provider that answered |
| Fallback output | Always labelled "saved demo output" |

## 5. Cross-device behavior

- Phone: S3, S10 (voice), quick approve on S4/S7. Large touch targets, one primary action per screen.
- Laptop: board, compare, customers, settings. Projector-friendly density.
- Both live-sync through SSE; an approve on the phone appears on the laptop immediately.

## 6. Error and empty states (by screen)

| Screen | Empty | Error |
|---|---|---|
| S2 | "No campaigns yet - speak your first idea" | load failure retry |
| S3 | mic permission prompt guidance | STT fail -> type instead / switch provider |
| S4 | no brief yet | missing field highlighted |
| S5 | nothing selected | infeasible: shows nearest feasible plan |
| S6 | n/a | 429 queue message; failed asset retry |
| S7 | no assets | partial results with gap notes |
| S12 | no customers -> upload | no consent -> skipped count |


## 7. Studio and no-business flows (S15-S19)

```
S2 Home --> S15 Studio --+--> "I have a business" --> pick deliverables --> first item's screen
                         |        posts / WhatsApp / posters --> S3 Voice Brief (campaign pipeline)
                         |        taglines / brand kit        --> S17 Names and brand look
                         |        website                     --> S18 Website   (website service)
                         |        reel                        --> S19 Reels     (video service)
                         |
                         +--> "I don't have a business yet" --> S16 Build my business
                                  1 About you -> 2 Ideas -> 3 Name & tagline -> 4 Brand look
                                  -> 5 Offer & prices -> 6 Launch pack -> S3 Voice Brief (opening campaign)
```

Rules:
- Screens and Studio items with no backend yet are greyed out (sidebar and Studio cards). They stay clickable so the team can build against them. The list is `NO_BACKEND` in `Frontend/src/data/studio.js`.
- S16 outputs are examples until the planner service exists; the owner sets every price. The opening-offer price is calculated from the discount, never typed.
- S17 colour contrast and starter logos are computed in the browser (real). Hindi and Kannada taglines are drafts and carry "needs native review".
- S18 and S19 show a "not connected" banner when the owner presses Generate, plus the contract the service must implement. Local previews and cost maths stay usable.
- Website and video text go through the same locked-facts rules: prices and offer text are stamped from the approved facts by code.
