# macOS Platform (mac)

This directory contains macOS-specific packaging assets, codesigning certificates, entitlements, and the automated notarization script.

## Files In This Folder
- `icon.png`: High-resolution application icon.
- `entitlements.mac.plist`: Entitlements file allowing secure camera/microphone access, disabling library validation for plugins, etc.
- `notarize.js`: The post-build script that runs automatically to notarize the app with Apple's notary service using the `@electron/notarize` tool.

## Developer Setup for Codesign & Notarization
To package, codesign, and notarize the app on macOS, you must have an Apple Developer account and define the appropriate environment variables.

### Option 1: App Store Connect API Key (Recommended)
Set the following environment variables:
```bash
export APPLE_API_KEY_ID="Your_Key_ID"
export APPLE_API_ISSUER="Your_Issuer_UUID"
export APPLE_API_KEY="/path/to/AuthKey_YourKeyID.p8"
```

### Option 2: Apple ID & App-Specific Password
Set the following environment variables:
```bash
export APPLE_ID="developer@email.com"
export APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
export APPLE_TEAM_ID="YOURTEAMID12"
```

## Build Commands
```bash
# Run in dev mode
npm start

# Pack and package for macOS (dmg/zip)
npm run dist:mac
```
The packaging output will be generated inside the `dist/` directory at the root level.
