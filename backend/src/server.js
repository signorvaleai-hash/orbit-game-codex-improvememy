#!/usr/bin/env node

const http = require('node:http');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const HOST = process.env.BACKEND_HOST || '127.0.0.1';
const PORT = Number(process.env.BACKEND_PORT || 8787);
const CORS_ORIGIN = process.env.BACKEND_CORS_ORIGIN || '*';
const API_KEY = String(process.env.BACKEND_API_KEY || '');
const RATE_LIMIT_WINDOW_MS = Number(process.env.BACKEND_RATE_LIMIT_WINDOW_MS || 60_000);
const RATE_LIMIT_MAX = Number(process.env.BACKEND_RATE_LIMIT_MAX || 120);
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.BACKEND_DB_PATH || path.join(DATA_DIR, 'orbit.sqlite');
const rateBuckets = new Map();

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  device_id TEXT,
  total_runs INTEGER NOT NULL DEFAULT 0,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_survival REAL NOT NULL DEFAULT 0,
  last_seen_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  challenge_multiplier REAL NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  session_id TEXT,
  survival_seconds REAL NOT NULL,
  planet_reached INTEGER NOT NULL,
  difficulty INTEGER NOT NULL,
  challenge_multiplier REAL NOT NULL,
  authoritative_score INTEGER NOT NULL,
  submitted_at INTEGER NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS consent (
  profile_id TEXT PRIMARY KEY,
  analytics_allowed INTEGER NOT NULL DEFAULT 0,
  crash_allowed INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  event_name TEXT NOT NULL,
  payload_json TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS crash_events (
  id TEXT PRIMARY KEY,
  profile_id TEXT NOT NULL,
  message TEXT NOT NULL,
  stack TEXT,
  app_version TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY(profile_id) REFERENCES profiles(id)
);

CREATE TABLE IF NOT EXISTS visitors (
  device_id TEXT PRIMARY KEY,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  session_count INTEGER NOT NULL DEFAULT 1
);
`);

const query = {
  createProfile: db.prepare(`INSERT INTO profiles (id, name, device_id, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)`),
  profileById: db.prepare(`SELECT * FROM profiles WHERE id = ?`),
  profileByDevice: db.prepare(`SELECT * FROM profiles WHERE device_id = ? ORDER BY last_seen_at DESC LIMIT 1`),
  updateProfileSeen: db.prepare(`UPDATE profiles SET name = ?, device_id = ?, last_seen_at = ? WHERE id = ?`),
  createSession: db.prepare(`INSERT INTO sessions (id, profile_id, started_at, challenge_multiplier) VALUES (?, ?, ?, ?)`),
  sessionById: db.prepare(`SELECT * FROM sessions WHERE id = ?`),
  closeSession: db.prepare(`UPDATE sessions SET status = 'closed' WHERE id = ?`),
  insertRun: db.prepare(`INSERT INTO runs (id, profile_id, session_id, survival_seconds, planet_reached, difficulty, challenge_multiplier, authoritative_score, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`),
  updateProfileStats: db.prepare(`UPDATE profiles
    SET total_runs = total_runs + 1,
        best_score = CASE WHEN best_score < ? THEN ? ELSE best_score END,
        best_survival = CASE WHEN best_survival < ? THEN ? ELSE best_survival END,
        last_seen_at = ?
    WHERE id = ?`),
  leaderboardTop: db.prepare(`
    SELECT p.id AS profile_id, p.name AS player_name, b.best_score AS score, b.best_survival AS survival_seconds
    FROM (
      SELECT profile_id, MAX(authoritative_score) AS best_score, MAX(survival_seconds) AS best_survival
      FROM runs
      GROUP BY profile_id
    ) b
    JOIN profiles p ON p.id = b.profile_id
    ORDER BY b.best_score DESC, b.best_survival DESC, p.created_at ASC
    LIMIT ?
  `),
  leaderboardRankByScore: db.prepare(`
    SELECT COUNT(*) + 1 AS rank
    FROM (
      SELECT MAX(authoritative_score) AS best_score
      FROM runs
      GROUP BY profile_id
      HAVING best_score > ?
    )
  `),
  leaderboardSize: db.prepare(`SELECT COUNT(*) AS size FROM (SELECT profile_id FROM runs GROUP BY profile_id)`),
  profileBestRun: db.prepare(`SELECT COALESCE(MAX(authoritative_score), 0) AS best_score, COALESCE(MAX(survival_seconds), 0) AS best_survival FROM runs WHERE profile_id = ?`),
  upsertConsent: db.prepare(`
    INSERT INTO consent (profile_id, analytics_allowed, crash_allowed, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET
      analytics_allowed = excluded.analytics_allowed,
      crash_allowed = excluded.crash_allowed,
      updated_at = excluded.updated_at
  `),
  consentByProfile: db.prepare(`SELECT * FROM consent WHERE profile_id = ?`),
  insertAnalytics: db.prepare(`INSERT INTO analytics_events (id, profile_id, event_name, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`),
  insertCrash: db.prepare(`INSERT INTO crash_events (id, profile_id, message, stack, app_version, created_at) VALUES (?, ?, ?, ?, ?, ?)`),
  profileSummary: db.prepare(`SELECT id, name, total_runs, best_score, best_survival, created_at, last_seen_at FROM profiles WHERE id = ?`),
  upsertVisitor: db.prepare(`
    INSERT INTO visitors (device_id, first_seen_at, last_seen_at, session_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(device_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      session_count = visitors.session_count + 1
  `),
  visitorsTotal: db.prepare(`SELECT COUNT(*) AS count FROM visitors`),
  visitorsActiveSince: db.prepare(`SELECT COUNT(*) AS count FROM visitors WHERE last_seen_at >= ?`),
  playersTotal: db.prepare(`SELECT COUNT(*) AS count FROM profiles`),
  runsTotal: db.prepare(`SELECT COUNT(*) AS count FROM runs`),
  runsSince: db.prepare(`SELECT COUNT(*) AS count FROM runs WHERE submitted_at >= ?`),
  highestScore: db.prepare(`SELECT COALESCE(MAX(authoritative_score), 0) AS score FROM runs`),
  topRun: db.prepare(`
    SELECT p.name AS player_name, r.authoritative_score AS score
    FROM runs r
    JOIN profiles p ON p.id = r.profile_id
    ORDER BY r.authoritative_score DESC, r.submitted_at ASC
    LIMIT 1
  `)
};

function nowMs() {
  return Date.now();
}

function json(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': CORS_ORIGIN,
    'Access-Control-Allow-Headers': 'Content-Type,X-Orbit-Api-Key',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sanitizeName(name) {
  return String(name || '')
    .replace(/[^a-zA-Z0-9 _-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 18);
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function normalizeChallengeMultiplier(value) {
  const allowed = [0.95, 1.02, 1.12, 1.25, 1.35];
  const num = Number(value);
  let best = allowed[0];
  let bestDelta = Math.abs(num - best);
  for (const candidate of allowed) {
    const delta = Math.abs(num - candidate);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best;
}

function computeAuthoritativeScore({ survivalSeconds, planetReached, challengeMultiplier }) {
  const timePoints = Math.floor(survivalSeconds * 10);
  const planetBonus = Math.max(0, planetReached - 1) * 500;
  return Math.floor((timePoints + planetBonus) * challengeMultiplier);
}

function ensureProfile(profileId) {
  const profile = query.profileById.get(profileId);
  if (!profile) throw new Error('Profile not found');
  return profile;
}

function getClientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return xff || req.socket.remoteAddress || 'unknown';
}

function enforceRateLimit(req) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(ip, bucket);
  return bucket.count <= RATE_LIMIT_MAX;
}

function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    return json(res, 204, { ok: true });
  }

  if (pathname === '/health' && req.method === 'GET') {
    return json(res, 200, { ok: true, service: 'orbit-backend', time: nowMs() });
  }

  if (!enforceRateLimit(req)) {
    return json(res, 429, { error: 'rate_limit_exceeded' });
  }

  if (API_KEY) {
    const clientKey = String(req.headers['x-orbit-api-key'] || '');
    if (!clientKey || clientKey !== API_KEY) {
      return json(res, 401, { error: 'unauthorized' });
    }
  }

  if (pathname === '/v1/profile/register' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const cleanName = sanitizeName(body.name);
        const cleanDeviceId = String(body.deviceId || '').slice(0, 128);

        let profile = null;
        if (body.profileId) {
          profile = query.profileById.get(String(body.profileId));
        }
        if (!profile && cleanDeviceId) {
          profile = query.profileByDevice.get(cleanDeviceId);
        }

        const ts = nowMs();
        if (profile) {
          const resolvedName = cleanName || sanitizeName(profile.name) || 'Pilot';
          query.updateProfileSeen.run(resolvedName, cleanDeviceId, ts, profile.id);
          return json(res, 200, { profileId: profile.id, name: resolvedName, existing: true });
        }

        if (!cleanName) return json(res, 400, { error: 'name_required' });
        const profileId = randomUUID();
        query.createProfile.run(profileId, cleanName, cleanDeviceId, ts, ts);
        query.upsertConsent.run(profileId, 0, 0, ts);
        return json(res, 201, { profileId, name: cleanName, existing: false });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  if (pathname === '/v1/visit' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const deviceId = String(body.deviceId || '').slice(0, 128).trim();
        if (!deviceId) return json(res, 400, { error: 'device_id_required' });
        const ts = nowMs();
        query.upsertVisitor.run(deviceId, ts, ts);
        return json(res, 202, { ok: true });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  if (pathname === '/v1/stats/public' && req.method === 'GET') {
    const now = nowMs();
    const since24h = now - 24 * 60 * 60 * 1000;
    const visitors = query.visitorsTotal.get();
    const visitorsToday = query.visitorsActiveSince.get(since24h);
    const players = query.playersTotal.get();
    const runs = query.runsTotal.get();
    const runsToday = query.runsSince.get(since24h);
    const highest = query.highestScore.get();
    const top = query.topRun.get();
    return json(res, 200, {
      visitors: Number(visitors ? visitors.count : 0),
      visitorsToday: Number(visitorsToday ? visitorsToday.count : 0),
      players: Number(players ? players.count : 0),
      totalRuns: Number(runs ? runs.count : 0),
      runsToday: Number(runsToday ? runsToday.count : 0),
      highestScore: Number(highest ? highest.score : 0),
      topPlayer: top ? String(top.player_name || 'No one yet') : 'No one yet'
    });
  }

  if (pathname === '/v1/runs/start' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const profileId = String(body.profileId || '');
        ensureProfile(profileId);
        const challengeMultiplier = normalizeChallengeMultiplier(body.challengeMultiplier || 1.12);
        const sessionId = randomUUID();
        query.createSession.run(sessionId, profileId, nowMs(), challengeMultiplier);
        return json(res, 201, { sessionId, challengeMultiplier });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  if (pathname === '/v1/runs/finish' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const profileId = String(body.profileId || '');
        const sessionId = String(body.sessionId || '');
        const profile = ensureProfile(profileId);
        const session = query.sessionById.get(sessionId);
        if (!session || session.profile_id !== profileId || session.status !== 'open') {
          return json(res, 400, { error: 'invalid_session' });
        }

        const now = nowMs();
        const elapsedSeconds = Math.max(0, (now - Number(session.started_at)) / 1000);
        const clientSurvival = clampNumber(body.survivalSeconds, 0, 7200);
        const authoritativeSurvival = Math.min(clientSurvival, elapsedSeconds + 4);
        const planetReached = Math.floor(clampNumber(body.planetReached, 1, 99));
        const difficulty = Math.floor(clampNumber(body.difficulty, 1, 999));
        const challengeMultiplier = normalizeChallengeMultiplier(session.challenge_multiplier);

        const authoritativeScore = computeAuthoritativeScore({
          survivalSeconds: authoritativeSurvival,
          planetReached,
          challengeMultiplier
        });

        const runId = randomUUID();
        query.insertRun.run(
          runId,
          profileId,
          sessionId,
          authoritativeSurvival,
          planetReached,
          difficulty,
          challengeMultiplier,
          authoritativeScore,
          now
        );
        query.closeSession.run(sessionId);
        query.updateProfileStats.run(authoritativeScore, authoritativeScore, authoritativeSurvival, authoritativeSurvival, now, profileId);

        const top = query.leaderboardTop.all(5);
        const bestRow = query.profileBestRun.get(profileId);
        const bestScore = Number(bestRow ? bestRow.best_score : authoritativeScore);
        const rankRow = bestScore > 0 ? query.leaderboardRankByScore.get(bestScore) : null;
        const sizeRow = query.leaderboardSize.get();

        return json(res, 200, {
          runId,
          player: profile.name,
          authoritative: {
            score: authoritativeScore,
            survivalSeconds: Number(authoritativeSurvival.toFixed(2)),
            challengeMultiplier,
            elapsedSeconds: Number(elapsedSeconds.toFixed(2))
          },
          leaderboard: {
            top,
            rank: rankRow ? rankRow.rank : 1,
            size: sizeRow ? sizeRow.size : 1,
            bestScore
          }
        });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  if (pathname === '/v1/leaderboard/top' && req.method === 'GET') {
    const limit = Math.floor(clampNumber(url.searchParams.get('limit') || 5, 1, 50));
    const top = query.leaderboardTop.all(limit);
    return json(res, 200, { top });
  }

  if (pathname.startsWith('/v1/leaderboard/profile/') && req.method === 'GET') {
    const profileId = pathname.split('/').pop();
    const profile = query.profileById.get(profileId);
    if (!profile) return json(res, 404, { error: 'not_found' });

    const best = query.profileBestRun.get(profileId);
    const bestScore = Number(best ? best.best_score : 0);
    const bestSurvival = Number(best ? best.best_survival : 0);
    const sizeRow = query.leaderboardSize.get();
    const size = sizeRow ? Number(sizeRow.size || 0) : 0;
    const rankRow = bestScore > 0 ? query.leaderboardRankByScore.get(bestScore) : null;

    return json(res, 200, {
      profileId,
      bestScore,
      bestSurvival,
      rank: rankRow ? Number(rankRow.rank || 0) : 0,
      size
    });
  }

  if (pathname.startsWith('/v1/profile/') && req.method === 'GET') {
    const profileId = pathname.split('/').pop();
    const profile = query.profileSummary.get(profileId);
    if (!profile) return json(res, 404, { error: 'not_found' });
    return json(res, 200, { profile });
  }

  if (pathname === '/v1/consent' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const profileId = String(body.profileId || '');
        ensureProfile(profileId);
        const analyticsAllowed = body.analyticsAllowed ? 1 : 0;
        const crashAllowed = body.crashAllowed ? 1 : 0;
        query.upsertConsent.run(profileId, analyticsAllowed, crashAllowed, nowMs());
        return json(res, 200, { ok: true, analyticsAllowed: !!analyticsAllowed, crashAllowed: !!crashAllowed });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  if (pathname === '/v1/analytics/event' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const profileId = String(body.profileId || '');
        ensureProfile(profileId);
        const consent = query.consentByProfile.get(profileId);
        if (!consent || consent.analytics_allowed !== 1) return json(res, 403, { error: 'analytics_consent_required' });
        const eventName = String(body.eventName || '').slice(0, 64);
        if (!eventName) return json(res, 400, { error: 'event_name_required' });
        query.insertAnalytics.run(randomUUID(), profileId, eventName, JSON.stringify(body.payload || {}), nowMs());
        return json(res, 202, { ok: true });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  if (pathname === '/v1/crash' && req.method === 'POST') {
    return parseJsonBody(req)
      .then((body) => {
        const profileId = String(body.profileId || '');
        ensureProfile(profileId);
        const consent = query.consentByProfile.get(profileId);
        if (!consent || consent.crash_allowed !== 1) return json(res, 403, { error: 'crash_consent_required' });
        const message = String(body.message || '').slice(0, 500);
        if (!message) return json(res, 400, { error: 'message_required' });
        query.insertCrash.run(randomUUID(), profileId, message, String(body.stack || '').slice(0, 4000), String(body.appVersion || '').slice(0, 64), nowMs());
        return json(res, 202, { ok: true });
      })
      .catch((error) => json(res, 400, { error: error.message }));
  }

  return json(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  route(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`orbit-backend listening on http://${HOST}:${PORT}`);
});
