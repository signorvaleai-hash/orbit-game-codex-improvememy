# iOS Setup (Required Once on Mac)

`npm run cap:add:ios` requires CocoaPods.

## Install prerequisites

```bash
xcode-select --install
brew install cocoapods
pod --version
```

Install full Xcode from the App Store (Command Line Tools alone are not enough).

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
xcodebuild -version
sudo xcodebuild -license accept
```

If build destinations show `iOS <version> is not installed`, install platform components:

```bash
DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer xcodebuild -downloadPlatform iOS
```

## Add iOS platform

```bash
npm run cap:add:ios
npm run cap:sync
npm run cap:ios
```

Then in Xcode:

1. Set signing team and bundle identifier.
2. Set version/build numbers.
3. Archive and upload using Organizer.
