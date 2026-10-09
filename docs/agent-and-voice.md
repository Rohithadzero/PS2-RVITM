# Agent workflow, forecast fix, and what to add next (voice AI and agentic AI)

## 1. The agent (built): describe the idea once, watch the workflow, step in at the gates

Screen `Agent` (`#/agent`), API `apps/api/app/agent.py`.

```
  idea (typed or spoken)
     |
  [1 Read your idea]  AI    exact phrases only, anything not quoted is dropped
     |
  [2 Fill the gaps]   AI+you answers the scripted interview with those phrases; asks you what is missing
     |
  [3 Lock the plan]   YOU   plan with your own quotes; nothing is written before this
     |
  [4 Check it fits]   code  knapsack planner on channels x languages x audiences
     |
  [5 Write Campaign 0] AI   copy, validator, blind back-translation meaning check, one repair
     |
  [6 Forecast and test] code history forecast + synthetic persona opinions
     |
  [7 Improve weak copy] AI+you  only offered if a persona mean is under 7; at most two rewrites
     |
  [8 Approve assets]  YOU
     |
  [9 Share it]        YOU   copy, WhatsApp, email, download; tracked links
```

Why this is agentic and not a script:
- **It observes, then acts.** Each tick reads the database (plan status, open jobs, checks, persona scores, approvals) and does only the work that is ready. Closing the tab and coming back resumes from real state.
- **It adapts.** Step 7 appears only if the persona opinions found weak copy. Step 2 asks only the questions the idea did not answer.
- **It cannot overreach.** It never locks facts, approves an asset or sends anything. Every owner-written fact is an exact span of the owner's words, so the same grounding checks as Talk apply.
- **It is steerable.** Optimize and Share can be skipped; any gate opens the screen that does the work.

Routes: `POST /agent/runs`, `GET /agent/runs`, `POST /agent/runs/:id/tick`, `POST /agent/runs/:id/steps/optimize/confirm`, `POST /agent/runs/:id/steps/{optimize|send}/skip`. Steps call the app's own routes through an in-process client, so they obey the same rules as the screens.

Verified live against Agnes on a café idea: 14 facts read, interview completed from the idea alone, stopped at the plan lock; after the lock it wrote, checked, forecast and tested the copy in about two minutes and stopped at the optimize gate. Tests: `tests/test_agent.py` (fake model, no network).

## 2. Prediction fix (built)

What was wrong:
- The headline was a 1 to 10 score from an AI playing customers. It has no link to real outcomes, it moves with the prompt, and the Kannada opinions came from a model that cannot reliably read Kannada (it named a dialect that is not in the text).
- One persona batch in five failed on malformed JSON and was never retried.

What changed:
- **Forecast** (`app/forecast.py`, `GET /campaign/:id/forecast`): expected redemption rate per asset with an 80% interval, fit on the 30 synthetic historical campaigns. It is checked by leaving each campaign out. Result: the channel average has a typical error of 1.6 points against 3.4 for one overall average; a larger regression (language, offer type, reach, emoji, length) did **not** beat the channel average, so it is not used and the response says so. What the history supports: channel matters a lot (WhatsApp about 16%, posters 7%, Instagram 4 to 5%); wording does not show up in 30 rows. Channels with no history (email, blog, Google post, reel) get no forecast instead of an invented one. Optional reach input turns rates into counts.
- **Persona opinions** are kept, relabelled "qualitative", and they feed the optimizer only. They retry once on bad JSON, have more room to answer, and are told to say when they cannot judge a Kannada or Hindi phrase.
- The dashboard shows the forecast first, with the model's own error and the synthetic-data caveat.

Still limited: 30 synthetic rows cannot tell good copy from bad copy. To forecast copy quality you need real past campaigns from the owner (upload sends and results; refit per business).

## 3. What else to add: voice AI

Built here: owner can speak the whole idea into the Agent; Plan has "Read it back to me" (English template, spoken before locking); offline Vosk speech to text for English and Hindi at `/stt`.

Next, in order of value:
1. **Voice for every gate.** "Lock it", "approve the Kannada poster", "skip", "what is blocked?" as spoken commands with read-back confirmation. Same grounded readers, commands only map to existing routes.
2. **Kannada and Hinglish speech to text that works.** Vosk has neither. Compare Sarvam Saaras (`kn-IN`), Groq Whisper and AI4Bharat IndicConformer on the dataset's voice utterances with native speakers; wire the winner behind the same `/stt` route.
3. **Read-back in the owner's language** from a native-reviewed template bank, so the lock confirmation is heard in Kannada or Hindi, not English.
4. **WhatsApp voice notes in.** Owner sends a voice note to a number; it becomes an idea for the Agent. Needs a WhatsApp Business account, so a stretch.
5. **Voiced assets out.** A 15 second spoken promo from the approved WhatsApp copy using Indic TTS (Sarvam Bulbul), for shops that broadcast voice notes.
6. **Code-mixed handling.** Kanglish and Hinglish numbers ("mooru nooru") are where speech and the model disagree; keep the deterministic number-word parser as the arbiter and ask the owner when they differ.
7. **Hands-free mode for the counter.** Wake word, short confirmations, large captions, works with a phone on a stand.

## 4. What else to add: agentic AI

1. **Weekly campaign loop.** After a campaign ends the agent reads real clicks and redemptions, compares them with its own forecast, says what it got wrong, and drafts next week's campaign for approval. Closes the learning loop and refits the forecast on the owner's own data.
2. **Competitor and local-event scout.** Before planning, the agent looks at public Google Business posts and a local events feed (festival, exam week, match) and suggests timing. Cited sources, owner approves.
3. **Customer reply agent.** Drafts replies to WhatsApp and Instagram questions from the locked facts only ("is it dine-in only?"); anything outside the facts is escalated to the owner, never improvised.
4. **Multi-agent review.** Separate reviewers for facts, tone, Kannada naturalness and legal claims, with a referee that only reports disagreements to a human.
5. **Budget-aware autopilot.** Give the agent a money and time budget; it runs the planner, picks channels and languages, and explains what it dropped.
6. **Build my business path.** The same agent starting from "I have no business": ideas, name, brand, first offer, then the standard workflow. The Studio screens already hold the contracts.
7. **Evaluation harness.** Replay the dataset's audit cases, voice traps and drift cases on every change so the agent's guardrails are measured, not assumed.

## 5. Guardrails to keep

- The agent proposes, the owner disposes: lock, approve and send stay human.
- Every owner fact is a quote; every number is checked by code against the lock.
- Synthetic data is labelled synthetic wherever it appears.
- No forecast for a channel with no history.
- Kannada and Hindi output stays "needs native review" until a native speaker signs off.
