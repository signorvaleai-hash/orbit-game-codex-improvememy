#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function cleanBase(url) {
  return String(url || '').replace(/\/+$/, '');
}

const runtimeConfig = {
  backendBase: cleanBase(process.env.ORBIT_BACKEND_BASE || 'http://127.0.0.1:8787'),
  apiKey: String(process.env.ORBIT_API_KEY || ''),
  sentryDsn: String(process.env.ORBIT_SENTRY_DSN || ''),
  firebaseMeasurementId: String(process.env.ORBIT_FIREBASE_MEASUREMENT_ID || '')
};

const distDir = path.join(__dirname, '..', 'dist');
const outputPath = path.join(distDir, 'runtime-config.js');
const content = `window.ORBIT_RUNTIME = ${JSON.stringify(runtimeConfig, null, 2)};\n`;

fs.mkdirSync(distDir, { recursive: true });
fs.writeFileSync(outputPath, content, 'utf8');

console.log(`Wrote ${outputPath}`);
