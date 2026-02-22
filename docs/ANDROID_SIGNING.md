# Android Signing

## Prerequisites

- Android Studio + SDK command-line tools
- JDK 21 (`java -version` should report 21.x for Capacitor 7)

## 1. Create keystore (one time)

```bash
mkdir -p keystore
keytool -genkeypair -v -keystore keystore/orbital-defense-release.jks -alias orbitaldefense -keyalg RSA -keysize 2048 -validity 10000
```

## 2. Add signing values

```bash
cp android/key.properties.example android/key.properties
```

Edit `android/key.properties` with real values.

## 3. Build signed bundle

```bash
npm run android:release:aab
```

Output path:

- `android/app/build/outputs/bundle/release/app-release.aab`
