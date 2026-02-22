# Production Status (App Store + Play Store)

## Implemented in project

- Capacitor mobile shell configured (`android/`, `capacitor.config.json`, build/sync scripts).
- Adaptive single-mode gameplay (`Earth Orbit`) with escalating difficulty over time.
- Cloud-ready backend (`backend/src/server.js`) with:
  - profile registration
  - consent storage
  - server-authoritative run scoring
  - leaderboard APIs
  - analytics/crash intake endpoints
- Consent-first flow in UI before run start (analytics + crash toggles).
- Retention systems:
  - persistent lifetime progression
  - rank ladder with next target and remaining seconds
  - daily streak + daily challenge
  - unlock announcement
  - forever-growing lifetime metric (distance orbited)
- Simulated leaderboard + synced leaderboard fallback.
- PWA + mobile hardening:
  - safe-area CSS
  - visibility/background pause handling
  - offline queue for run sync
  - service worker + manifest updated to `index.html`
- Compliance docs added:
  - privacy policy template
  - terms template
  - consent flow
  - QA matrix
  - metadata templates
  - rating questionnaire notes

## Still requires your production credentials/accounts

- iOS platform folder is created, but native dependency install is blocked until full Xcode app is installed and selected (`xcodebuild` unavailable with Command Line Tools only).
- Android release bundle build requires JDK 21 (`invalid source release: 21` with older JDK).
- Android signing is configured with a local generated keystore; for real production you should move to your organization’s long-term release key custody.
- App Store Connect + Play Console records must be created and completed.
- Hosted public legal URLs (privacy/support/marketing) must be finalized.
- Production telemetry accounts (Sentry/Firebase) need real keys in `runtime-config.js`.
- Production backend hosting and domain/HTTPS setup (Render/Fly/Cloud Run/Cloudflare, etc.).

## Definition of done before store submission

- Signed Android AAB built and uploaded.
- iOS archive built and uploaded through Xcode Organizer.
- All store forms validated (content rating, data safety, privacy nutrition).
- QA matrix executed on target device set.
- Backend load and reconnect tests passed.
