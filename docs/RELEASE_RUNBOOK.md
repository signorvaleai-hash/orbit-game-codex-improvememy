# Release Runbook

## 1. Prepare runtime + legal values

```bash
cp runtime-config.example.js runtime-config.js
# edit runtime-config.js with production values
```

Set before release:
- `backendBase` to HTTPS production API
- `apiKey` to your backend API key (if enabled)
- `sentryDsn` (optional)
- `firebaseMeasurementId` (optional)
- Privacy policy/support/marketing URLs in store metadata docs

## 2. Generate icons/splash assets

```bash
npm install
npm run assets:generate
```

## 3. Build web assets

```bash
npm run build
```

## 4. Backend deploy

- Deploy `backend/src/server.js` behind HTTPS (Render/Fly/Cloud Run)
- Set backend env vars from `backend/.env.example`
- Add uptime checks and alerting

## 5. Native sync

```bash
npm run cap:sync
```

### Android

- Ensure JDK 21 is active (`java -version`).
- Configure signing:
  - `cp android/key.properties.example android/key.properties`
  - set real keystore path/passwords
  - keep `android/key.properties` and keystore out of git
  - full steps: `docs/ANDROID_SIGNING.md`
- Build signed AAB:

```bash
npm run android:release:aab
```

- Output: `android/app/build/outputs/bundle/release/app-release.aab`

### iOS

```bash
npm run cap:add:ios   # first time, requires CocoaPods + Xcode
npm run cap:ios
```

- Ensure full Xcode is installed and selected:
  - `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`
  - `xcodebuild -version`
- Configure bundle id, signing team, capabilities
- Archive and upload in Xcode
- setup details: `docs/IOS_SETUP.md`

## 6. Pre-release checks

- QA matrix complete
- Privacy policy hosted and linked
- Consent flow validated
- Crash + analytics ingestion verified
- Store screenshots and metadata finalized
