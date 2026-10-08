# Validator, drift check and scoring

Three separate mechanisms with different trust levels. The deterministic validator is the only one allowed to block or allow. Scores inform ranking; they never override the validator.

## 1. Slots: facts are filled by code

The model writes copy with slots, never numbers or dates:

```
"ಈ {days} {time}, {item} ಮೇಲೆ {discount} ರಿಯಾಯಿತಿ - ಬೆಲೆ {price}. {terms}"
```

Slots: `{item}`, `{discount}`, `{price}`, `{original_price}`, `{days}`, `{dates}`, `{time}`, `{terms}`.
The renderer replaces slots from the approved Offer Facts using per-language formatters:
- numbers always in **Western digits** (1, 2, 20, 48) in every script;
- `{discount}` -> "20%"; `{price}` -> "Rs 48" (or the owner's convention); `{days}` -> native day names; `{terms}` -> verified phrases for each controlled term.

Invariants checked after rendering:
- every slot in the template is bound to a lock field; unknown slots fail;
- every field in the asset's declared `facts_used` appears (a required slot is present);
- no field outside `facts_used` leaks in.

## 2. Deterministic validator

Runs on the **rendered** text (and on text overlaid on posters). Rules:

| ID | Rule | Detail |
|---|---|---|
| V1 | Stray digits | Any digit outside a filled slot = fail. Includes ASCII digits, Devanagari digits (U+0966-096F), Kannada digits (U+0CE6-0CEF), fullwidth digits |
| V2 | Spelled-out numbers | Lexicon per language (EN/HI/KN) of number words; any spelled number outside a slot = fail. Lexicons are written and verified by native speakers |
| V3 | Percentages | `%`, "percent", "प्रतिशत", "ಶೇಕಡಾ" etc. must come only from `{discount}` |
| V4 | Day/date names | Weekday and month names (EN/HI/KN) must come only from `{days}`/`{dates}`; "weekend", "today", "tomorrow", "this Sunday" flagged unless mapped to a lock field |
| V5 | Times | Clock expressions only from `{time}` |
| V6 | Conditions present | Every term in the lock's controlled `terms` list must appear (via its verified phrase). Dropped condition = fail |
| V7 | Implied promises | Extracted claim phrases ("all drinks", "free", "unlimited", "every day", "buy one get one") must map to a lock field/term or the asset is blocked. Matching is lexicon-based per language, with a structured LLM extraction as a second signal (see section 3) |
| V8 | Brand rules | Banned phrases and taboo claims from the Brand Constitution |
| V9 | Channel limits | Instagram caption length; WhatsApp length; SMS segments (below) |
| V10 | Stale facts | `asset.facts_version` must equal the approved version |
| V11 | Arithmetic | `price == original * (1 - pct/100)` under the documented rounding (checked at lock time too) |

Result: pass, or fail with `{rule, token, expected_field, position}` shown on the asset ("Blocked: '50' not in slot; lock price is 48").

**Block means block.** A blocked asset cannot be approved or sent. The optimizer cannot resolve a block by editing the lock; it must change the copy to match the lock.

### SMS segment check
- GSM-7: 160 chars (153 per segment when concatenated). Kannada and Hindi are Unicode (UCS-2): 70 chars (67 per segment when concatenated).
- Validator computes segment count, warns above the owner's limit, and verifies the facts are not pushed into an unsent segment by truncation.

## 3. Drift check (structured, not a vibe)

Purpose: ensure the *meaning* in Kannada/Hindi still equals the English lock.

1. Back-translate the rendered asset to English (separate prompt, temperature 0).
2. **Extract the offer fields from the back-translation** into the same JSON schema as the lock (item, discount_pct, price, days, time window, terms), via a constrained structured-output prompt.
3. **Diff extracted vs lock as structured data**, field by field. Any mismatch or missing term = drift flag.
4. Show the extracted table next to the lock on S8.

Why not "ask the model if it matches": a model judging its own translation is circular. Structured extraction plus a deterministic diff reduces that to a comparison the model cannot fudge by being agreeable. The deterministic validator remains the blocker; drift flags go to Pending with a warning unless they coincide with a V-rule failure.

Native speakers spot-check a sample of Kannada/Hindi assets each round (recorded in `comparison.human_votes` or a note).

## 4. Persona scoring (pre-launch proxy)

Honest framing: a pre-launch proxy built from LLM role-play. It ranks variants; it does not predict sales.

**Personas** are not invented per run. They are a fixed set grounded in Priya's customers (from her uploaded list and her description): e.g. "retired neighbour who prefers Kannada", "office worker, Hinglish, lunch rush", "college student, price sensitive, English", "weekend family". Stored in `audience.persona` and reused.

**Blind pairwise comparison**
1. For a pair of variants (original vs optimized, or two languages' same intent), randomize which is A and B.
2. A **separate scorer prompt** (not the writer prompt, lower temperature, different system framing) gets the persona, the two texts (labels hidden), and asks: which would this person respond to, and why; plus a 1-10 on clarity, appeal, trust, local feel, call to action.
3. Repeat N times (default 5) with position swapped each time.
4. Report **win rate with a confidence interval** (e.g. Wilson), the position-swap consistency, and the persona reasons.
5. Batch: one call covers all personas x one pair to respect 10 RPM; repeats are separate calls.

Honest limits shown in UI: same model family writes and judges, so results are labelled "proxy". Mitigations: blind order, repeats, variance, validator in loop, and **native-speaker votes** displayed beside the model result.

## 5. Optimizer loop

```
for round in 1..2:
    pick assets whose pairwise win rate vs the best sibling < threshold, or score below threshold
    rewrite (template with slots only; facts untouched)
    render + validator (must pass)        <- inside the loop
    drift check
    blind pairwise vs previous version
    keep the rewrite only if it passes the validator AND wins (CI lower bound > 0.5) or ties with fewer issues
```

Rules:
- The writer cannot see scores as a target to game numbers: it receives qualitative persona reasons, not the numeric score.
- A rewrite that fails the validator is discarded and counted; the discard count is shown (transparency).
- Max 2 rounds; stop early if no asset improves.
- "Optimized beats original" is shown as the final pairwise result with variance and human votes, not a single before/after number.

## 6. Fault-injection test ("0 mismatches" as evidence)

Build a test set of **at least 20 corrupted assets** and report the catch rate:

| Category | Examples |
|---|---|
| Wrong price | "Rs 50" vs lock 48; "Rs 4.8"; price in Kannada digits |
| Wrong discount | 25% vs 20%; "ಇಪ್ಪತ್ತು ಶೇಕಡಾ" spelled out |
| Wrong day | Sunday only vs Sat+Sun; "this weekend" vs dated |
| Wrong time | 8-12 vs 8-11; "all day" |
| Dropped condition | missing "dine-in only" |
| Implied promise | "all drinks", "free refills", "buy 1 get 1" |
| Script digits | Devanagari/Kannada numerals |
| Stale version | asset from facts v1 while v2 approved |
| Banned phrase | "cheap", "best in Bengaluru" |
| SMS overflow | facts truncated by segment limit |

Pass criteria: 100% of injected faults blocked or flagged; false positives on 20 clean assets reported. Show the table in the demo.

## 7. Test inputs owned by native speakers

- Number-word lexicons EN/HI/KN (0-100 plus hundreds).
- Day/month names and common variants.
- Verified phrases for each controlled term.
- Implied-promise phrase lists.
- A set of 10 correct and 10 subtly wrong Kannada/Hindi offer sentences for validator tuning.
