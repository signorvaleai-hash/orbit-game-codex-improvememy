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
- `BACKEND_DB_PATH=backend/data/orbit.sqlite` (auto-switches to `/var/data/orbit.sqlite` on Render when available)
- `BACKEND_PERSISTENT_PATHS=/var/data` (comma-separated roots considered durable)
- `BACKEND_REQUIRE_DURABLE_DB=0` (`1` = fail startup if DB path is not on durable storage)
- `BACKEND_DB_BACKUP_INTERVAL_MS=300000` (5 min snapshots, set `0` to disable)
- `BACKEND_DB_BACKUP_KEEP=96` (backup rotation limit)
- `BACKEND_DB_BACKUP_DIR=<db-dir>/backups`
- `BACKEND_CORS_ORIGIN=*`
- `BACKEND_API_KEY=` (optional)
- `BACKEND_ADMIN_KEY=` (required for admin dashboard endpoints)
- `BACKEND_RATE_LIMIT_WINDOW_MS=60000`
- `BACKEND_RATE_LIMIT_MAX=120`

## API summary

- `GET /health`
- `POST /v1/profile/register`
  - body: `{ profileId?, name, deviceId }`
- `POST /v1/visit`
  - body: `{ deviceId, referrer?, landingPath?, utmSource?, utmMedium?, utmCampaign?, userAgent?, timezone?, language? }`
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

Admin-only (requires `X-Admin-Key` header matching `BACKEND_ADMIN_KEY`):
- `GET /v1/admin/dashboard?rangeDays=30&liveMinutes=15`
  - returns overview KPIs, top players, recent players/runs, traffic source analytics, day charts, event counts, and storage health
- `POST /v1/admin/storage/snapshot`
  - triggers an immediate SQLite snapshot into backup directory

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

## Durable analytics storage on Render

To avoid analytics loss across deploys/restarts, use persistent storage:

1. Create/mount a Render disk to the API service at `/var/data`.
2. Set `BACKEND_DB_PATH=/var/data/orbit.sqlite`.
3. Optionally set `BACKEND_REQUIRE_DURABLE_DB=1` to block accidental boot on ephemeral storage.
4. Keep `BACKEND_DB_BACKUP_INTERVAL_MS` enabled for snapshot backups.

The admin dashboard now shows `Storage Durable` vs `Storage Ephemeral` so you can verify persistence mode after each deploy.
