# Synthetic dataset (Counter Voice pack, HR26-AI-02)

- `counter_voice_final_dataset.zip`: 46 files. `data/`: cafe.json (Brew Bandi Café), customers.json (60 synthetic personas), historical_campaigns.json, ledgers.json (4 offers), audit_cases.json (good and bad assets), voice_utterances.json (spoken briefs with traps), cafe_images.json, image_prompts.json; `images/`: food, place and people photos.
- `synthetic_data.ipynb`: the seeded notebook that regenerates the JSON files into `./data`.

All data is synthetic; label any historical result as synthetic in the demo.

Notes for the team:
- The dataset's cafe is "Brew Bandi Café" (owner Meena); the frontend mock still uses "Priya's Café".
- `ledgers.json` has offer types the Offer Facts schema does not model yet (bundle price with items, buy-one-get-one, a minimum-order threshold, a per-bill discount cap, "all day"). Extend `OfferFacts` and the validator before using L2 to L4.
- `audit_cases.json` is free text, while the validator checks slot-rendered text. Free-text audits need a mode that compares numbers found in the text against the lock instead of flagging every digit.
- `voice_utterances.json` includes traps (ambiguous "mooru nooru" 300 vs 299, self-correction to buy-one-get-one, "five hundred" vs "fifty", "next Sunday"). Use it as the extraction test set.
