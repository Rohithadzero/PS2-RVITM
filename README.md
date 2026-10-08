# PS2 RVITM: "Tell it once" campaign studio (HR26-AI-02)

Voice-first marketing campaigns for small businesses on Agnes models. Design lives in [`docs/`](docs/README.md); the app UI lives in [`Frontend/`](Frontend/); backend experiments (calibration) in [`apps/api/calibration/`](apps/api/calibration/).

## Run the frontend (demo mode, mock data)
```
cd Frontend
npm install
npm run dev        # http://localhost:5173
```
No backend is needed yet: pages read `src/data/mock.js` and `src/state/store.jsx`. `src/api/client.js` already wraps every route in `docs/api-spec.md`; set `VITE_API_URL` when the FastAPI backend exists.

## What is real vs placeholder
| Part | Status |
|---|---|
| Screens S0-S14, flows, status rules, planner maths, offer-facts diff | Implemented in the frontend against mock data |
| Agnes calibration numbers (Settings > Calibration, provider status) | **Real**, measured 8 Oct 2026 (`docs/calibration-results.md`) |
| Voice bake-off, usage, home dashboard numbers | **Sample data**, labelled in the UI |
| Backend (FastAPI), real Agnes calls from the app, STT/TTS, validator service | Not built yet; specs in `docs/` |

## Calibrate Agnes (needs your own key)
```
copy .env.example .env      # then set AGNES_API_KEY (never commit .env)
python apps/api/calibration/quick_calibrate.py
```

## Team
Start at [`docs/README.md`](docs/README.md), then [`docs/team-plan.md`](docs/team-plan.md). Native-speaker review sheet: [`docs/native-review.md`](docs/native-review.md).
