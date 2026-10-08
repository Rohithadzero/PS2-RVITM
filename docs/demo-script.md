# Demo script (about 5 minutes)

Pitch spine: **Tell it once.** Priya speaks, the system remembers her brand, locks the facts, fits the work to her budget, and a change touches only what depends on it. Trust is the proof: a wrong price can never be approved, and we show the evidence.

Setup before going on: cache pre-warmed for all demo prompts; phone and laptop signed in with the same Google account; board projected; local STT/TTS ready; simulated-send banner on; fault-injection report open in a tab.

## 0. Opening line (15 s)
"Priya runs a cafe in Indiranagar. Her customers speak Kannada, Hindi and English. She has no designer, and she cannot afford a wrong price. She tells it once."

## 1. Her brand is already known (20 s)
- Show S1 summary: menu with prices, real photos, banned phrases ("cheap"), Kannada-first voice, two audiences from her customer list.
- Line: "She set this up once. Every campaign starts from here."

## 2. Speak the idea (45 s)  [phone, S3]
- Hold the mic, say in Kannada/English mix: "Weekend filter coffee offer, twenty percent off, Saturday Sunday, eight to eleven morning, dine-in only."
- Show live transcript with numbers and days highlighted; fix one word to show editing.
- Line: "Speech never goes straight into the offer. It becomes text she can correct."

## 3. Lock the facts (40 s)  [S4]
- Structured facts appear with sources. Press Play on the read-back (Kannada), script shown.
- Approve v1.
- Line: "These are the only facts any asset can contain. The model writes slots; code fills the numbers."

## 4. What fits her budget (35 s)  [S5]
- Select 3 languages, 2 audiences, 3 channels, reel 16 s. Limits: 3 min, review 8 min.
- Planner shows: 18 assets fit; the 16 s reel does not (video at 1 request per minute). Offer the alternative: 9 assets + reels.
- Line: "Free tiers have real limits. The planner tells her what fits and why, instead of failing."
- Confirm the 18-asset plan.

## 5. Campaign appears (30 s)  [S6 to S7]
- Progress with queue, cache hits, then the board: 18 cells, statuses, score chips.
- Open a Kannada poster: her real photo, text stamped by code. Open validator tab: all checks pass. Open back-translation: extracted fields match the lock.
- Line: "Kannada written natively, then back-translated and diffed as data, not trusted."

## 6. The guard works (45 s)  [S8 + fault-injection]
- Show a pre-seeded asset with "Rs 50" instead of 48: Blocked, with the token and the lock field. Try to approve: disabled.
- Switch to the fault-injection table: 20 injected wrong prices/dates/conditions, 20 of 20 caught, false positives noted.
- Line: "Zero mismatches reach Approved, and here is the evidence."

## 7. Which variant wins (40 s)  [S9]
- Run blind pairwise: original vs optimized, 5 repeats, position swapped. Show win rate with confidence bar and persona reasons.
- Native speakers vote live (A/B). Label: "Pre-launch proxy."
- Line: "Not one self-score: blind, repeated, with variance, and checked by people who read Kannada."

## 8. Change it by voice (50 s)  [S10, S4, S7]
- On the phone: "Make it Sunday only."
- Classified as fact change; blast radius: "changes 6 of 18; 12 stay frozen" with list.
- Apply -> new facts v2 -> read-back -> approve -> only those 6 regenerate; the other 12 keep their timestamps.
- Change log shows what/why/pending.
- Line: "She said it once. Only what depends on it moved."

## 9. Reach her customers (25 s, optional)  [S12]
- Customers uploaded by her; per-customer language, consent per channel, one opted out.
- Simulate send: counts by language, 1 skipped, validator gate green. Banner: "Simulated send".
- Line: "In production this is DLT and WhatsApp-approved templates; our slots are already that shape."

## 10. Close (15 s)
"Tell it once. The system remembers her brand, protects her facts, and fits the work to her time and money. Built on free-tier Agnes models, with voice that works in Kannada."

## Contingencies

| Problem | Move |
|---|---|
| Venue Wi-Fi down | Local STT/TTS; saved outputs labelled "saved demo output" |
| Agnes 429 | Cache is warm; if cold, show queue UI and continue with cached assets |
| STT mishears | Edit transcript (it is part of the story) |
| Kannada TTS glitch | Show script on screen, play second provider |
| Phone sync lag | Drive both flows from laptop; sync is a bonus |
| Video not ready | Show labelled saved clip; do not claim it was just generated |
| Time short | Skip steps 1 and 9; keep 2, 3, 6, 8 |

## Rehearsal checklist

- [ ] 3 timed run-throughs (target under 5 min)
- [ ] Cold-cache run to know the worst case
- [ ] Network-off run
- [ ] Each team member can narrate any step
- [ ] Questions prepared: Kannada quality, how scores are validated, why not just ChatGPT + Canva (answer: brand memory + locked facts + selective change + budget planner), compliance for real sending
