# Orbit Backend

Server-authoritative profile + leaderboard service for Orbital Defense.

## Run locally

```bash
cp .env.example .env   # optional
cd ..
npm run backend:start
```

Defaults:
- `BACKEND_HOST=127.0.0.1`
- `BACKEND_PORT=8787`
- `BACKEND_DB_PATH=backend/data/orbit.sqlite`
- `BACKEND_CORS_ORIGIN=*`
- `BACKEND_API_KEY=` (optional)
- `BACKEND_RATE_LIMIT_WINDOW_MS=60000`
- `BACKEND_RATE_LIMIT_MAX=120`

## API summary

- `GET /health`
- `POST /v1/profile/register`
  - body: `{ profileId?, name, deviceId }`
- `POST /v1/visit`
  - body: `{ deviceId }`
- `GET /v1/stats/public`
- `POST /v1/consent`
  - body: `{ profileId, analyticsAllowed, crashAllowed }`
- `POST /v1/runs/start`
  - body: `{ profileId, challengeMultiplier }`
- `POST /v1/runs/finish`
  - body: `{ profileId, sessionId, survivalSeconds, planetReached, difficulty }`
- `GET /v1/leaderboard/top?limit=5`
- `GET /v1/leaderboard/profile/:id`
- `GET /v1/profile/:id`
- `POST /v1/analytics/event`
- `POST /v1/crash`

Notes:
- leaderboard top is per-player best score (one row per real profile)
- leaderboard profile endpoint returns `{ bestScore, bestSurvival, rank, size }`
- public stats endpoint returns aggregate numbers: visitors, players, runs, highest score, top player

## Anti-cheat model

The backend recalculates score from server-validated run data:

`score = floor((floor(survivalSeconds * 10) + (planetReached - 1) * 500) * challengeMultiplier)`

Controls:
- session must be opened with `/v1/runs/start`
- run finish requires matching open session
- survival seconds are capped by server observed elapsed run time + tolerance
- challenge multiplier is normalized to approved values

## Production hardening recommendations

- Put backend behind HTTPS + WAF
- Set `BACKEND_API_KEY` and send `X-Orbit-Api-Key` from the app
- Add rate limits by profile/device/IP
- Store leaderboard in Postgres/Redis for scale
- Add signed app-attestation (DeviceCheck/Play Integrity)
