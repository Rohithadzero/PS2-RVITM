# Calibration results

Raw file: `data/calibration/agnes-20261008T154625.json` (gitignored). Script: `apps/api/calibration/quick_calibrate.py`. Mode: quick, Free tier assumed, 8 Oct 2026, one run, laptop network from Bengaluru.

## Agnes (`agnes-3.0-flash`, `agnes-image-2.5-flash`)

| Probe | n | p50 | p90 | Notes |
|---|---|---|---|---|
| ping | 1 | 17.6 s | 17.6 s | First call of the run; likely cold start. Treat as outlier, not steady state |
| JSON extraction | 3 | 3.9 s | 4.3 s | 3/3 valid, correct values (20%, Rs 48) |
| Tool call | 1 | 10.9 s | - | Supported |
| Copy batch (kn+hi+en with slots) | 3 | 7.1 s | 10.6 s | ~160 tokens in, ~215 out per call |
| Pairwise persona scoring | 3 | 3.3 s | 6.8 s | 3/3 valid JSON |
| Image 1K | 1 | 9.5 s | - | URL returned |

- No errors, no 429s. The service returned **no rate-limit headers**, so limits come from the tier preset (Free: text 10 RPM, image 1K 10 RPM), not from detection.
- JSON validity 100% (3/3); tool calling supported.
- Video was not tested (full mode only).

## Kannada/Hindi finding (important)

The script check passed (Kannada and Devanagari characters present, placeholders used, no stray digits), but reading the Kannada sample shows it is **not good enough to trust**:
- It contains a Latin fragment inside Kannada text ("ಈ ಆffer"), i.e. a mixed-script glitch.
- Phrases look awkward (e.g. "ದಿನಗಳ ನಿಯಮವಾಗಿ", "ನಮ್ಮ ಮೆಟ್ಟಿಗೆಯ ಬಳಿ ಬಾ"), which a native speaker must judge; I cannot.
- The Hindi and English samples look natural on a quick read.

Actions:
1. Add a **mixed-script check** to the validator and calibration: reject a Kannada/Hindi asset containing Latin letters outside slots and brand names.
2. A native Kannada speaker must rate the sample in `data/calibration/...json` (`kannada.sample_for_native_review`) before Kannada is promised in the demo.
3. Iterate the Kannada copy prompt (few-shot examples written by native speakers, explicit "no English words except the brand name") and re-run; compare.
4. Fallback stays as planned: demo Hindi and English live, Kannada on paper if it does not reach the quality bar.

## Planner implications (replace the placeholder numbers)

- Text call p50 about 3-7 s, p90 up to ~11 s: with 10 RPM bucket spacing (6 s) the bucket, not latency, dominates for batches of many calls; latency dominates a serial chain (brief -> copy -> validate -> score).
- 12-16 text calls for config A at 6.5 s spacing is about 80-105 s of bucket time plus the serial tail; consistent with the earlier ~1:55 estimate. Cached calls cost nothing.
- Image 1K p50 about 10 s (single sample); the earlier planning figure of 14 s is in range. Needs more samples.

## Not yet measured

Video clip time, 2K image, burst/limit behaviour, STT/TTS providers, repeat runs for stable p90. Run the full mode before the demo.

---

## Code-mixed probe (Kanglish / Hinglish), 8 Oct 2026 evening

Scripts: `apps/api/calibration/codemix_probe.py`, `codemix_probe2.py`. Raw: `data/calibration/codemix-*.json`, `codemix2-*.json`. Native speaker feedback on the first Kannada sample: **9/10, but too formal**.

### 1. Understanding spoken Kanglish/Hinglish briefs (6 cases, structure + numbers)
- Days, items and conditions were extracted correctly almost every time (days 6/6).
- **Spoken number words are the failure.** With the plain prompt the model returned wrong discounts and prices in every case ("bees percent" read as 3, "pachchees" as 65, "achhtalis rupaye" as 111, "ippattu" as null); numeric field accuracy was about 2 in 10 to 3 in 10. Thinking mode did not fix it (2/10).
- Adding a **number-word glossary to the prompt** raised numeric accuracy to **7/10** (6/10 with thinking). Caveat: the glossary contained the test sentences' own words, and some romanizations were mine, not standard spellings, so this number is inflated and must be re-tested with sentences written by native speakers.
- Self-corrections ("ippattu... alla alla hanneradu") were handled correctly once the glossary was present (12 and 15 as intended).

Consequences for the design:
1. **Numbers must not be trusted from an LLM.** Add a deterministic number-word parser (EN/HI/KN, native script and Latin romanizations, built from native-speaker lexicons) that runs on the transcript; compare its result with the LLM's extraction. If they disagree, or either is missing, the field is marked "unconfirmed" and the owner is asked ("Did you say 20 percent?") before anything is locked. This is the same lexicon the validator's V2 rule needs.
2. The read-back approval step is not optional: it is the safety net for exactly this failure.
3. STT output in Latin script is acceptable input, but offer-critical tokens are highlighted for confirmation.

### 2. Writing casual copy
- **Kannada script, "casual" prompt:** worse, not better. Samples were gibberish or invented words ("ಇನ್ಶಾಲೆ ಇನ್ವೇಂಟ್", "ಸಿಕ್ಸ್ಟಿಕ್ ಆರ್ಮಿ ಕಾಫಿ"). Asking the model for colloquial Kannada makes it hallucinate.
- **"Make the 9/10 caption less formal" rewrite (3 samples):** broken spellings and non-words ("ಇವತಲ್", "ಕಮ್ಮ", "ಇತ್ತು" changing meaning). Not usable.
- **Kanglish (Latin script):** one sample read as plain English with a Bengaluru label, the other was broken ("Tere", "tuku", "Nee nu ... order pannu" is Tamil-flavoured). Not usable unchecked.
- **Hinglish (Latin script):** decent, natural, fits slots. Two samples fine; one added an invented "3 din" fact outside slots (the validator would catch it).
- **Hindi Devanagari casual:** natural, but mixed Latin letters appear ("offer", "thump", "local spot ... killer offer"). Fine for deliberate English loanwords, broken when it tries to merge scripts mid-word ("थump").

Consequences:
1. Kannada: keep the **formal, correct** register that earned 9/10 as the default. Casual Kannada should come from a **small bank of native-speaker-written phrases and templates** (greetings, call to action, closings) that the model composes from, not free generation. Ask the native speakers for 10 to 20 colloquial templates with slots; use them as few-shot examples and as a fixed phrase library.
2. Offer a tone control with two real settings for Kannada ("correct" and "friendly (template-based)"), not a free "casual" slider.
3. Kanglish: do not auto-generate; require native-speaker template bank. Hinglish: can be generated, with validator and native review.
4. Validator additions:
   - **Mixed-script check:** in Kannada/Devanagari assets, Latin letters are allowed only inside slots, the brand name and an allow-list of loanwords written in the intended script; flag a Latin run inside a native word (e.g. "ಆffer", "थump").
   - **Romanized-script assets** (Hinglish/Kanglish) are a separate asset type with their own lexicons for number words, day names and conditions (V2/V4 apply to romanized spellings).
   - **Invented-fact check** (V1/V2/V4/V7) already catches "3 din"-style additions; keep it.
5. Quality gate: nothing in Kannada or Kanglish reaches Approved without a native-speaker confirmation recorded in the decision log.

### 3. Next tests (need native speakers)
- Have the speakers say 20 offer sentences in natural Kanglish and Hinglish (with number words, self-corrections, "alla alla", "nahi nahi") and use those as the real extraction test set; measure number accuracy for: LLM only, parser only, parser plus LLM with disagreement flag.
- Collect the colloquial template bank and re-run generation with it as few-shot examples; rate 1-5 on formality and correctness.
