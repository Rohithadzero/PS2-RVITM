# PS2 RVITM: "GrowIt" campaign studio (HR26-AI-02)

Voice-first marketing campaigns for small businesses on Agnes models. Design lives in [`docs/`](docs/README.md); the app UI lives in [`Frontend/`](Frontend/); the API in [`apps/api/`](apps/api/) with calibration in [`apps/api/calibration/`](apps/api/calibration/); desktop and mobile shells in [`clients/`](clients/).

## Run it
```
npm run setup                  # venv + Python deps + frontend deps (Windows paths; adapt venv/Scripts on macOS)
copy .env.example .env         # set AGNES_API_KEY (never commit .env)
npm run api                    # FastAPI on http://127.0.0.1:8000
npm run web                    # GrowIt on http://127.0.0.1:5173
npm run test                   # 210 backend tests
npm run models                 # optional: offline Vosk speech models (English, Hindi)
```
The app talks to the API at `http://127.0.0.1:8000`; set `VITE_API_URL` to change it. Nothing in the screens that have a backend is mock data.

## Where it came from
One app from two builds: the GrowIt UI, planner, Vosk, bring-your-own keys and docs from this repo, and the interview, grounding, validator, meaning check, Campaign 0, outreach and dashboard from Francis's backend ([`francisreubenr-rvu/PS2RVITM`](https://github.com/francisreubenr-rvu/PS2RVITM)). What was kept from each, and why: [`docs/merge.md`](docs/merge.md).

## What is real vs not connected
| Part | Status |
|---|---|
| Talk, Plan, Campaign 0, Dashboard, Change by voice, Budget Planner, Settings | Real, on the API |
| Studio, Build my business, Names, Website, Reels | Greyed out; teammates' services, mock previews |
| Customers, Brand & Data, Bake-off | Greyed out; no backend yet |
| Login | Placeholder; the API has no auth |

## Calibrate Agnes (needs your own key)
```
copy .env.example .env      # then set AGNES_API_KEY (never commit .env)
python apps/api/calibration/quick_calibrate.py
```

## Team
Start at [`docs/README.md`](docs/README.md), then [`docs/team-plan.md`](docs/team-plan.md). Native-speaker review sheet: [`docs/native-review.md`](docs/native-review.md).
