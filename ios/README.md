# iOS Capacitor Project (ios)

This directory contains the Xcode workspace for the iOS application compiled by Capacitor.

## Developer Commands

Every time you change the web code in the project root:
1. Rebuild/copy static files to the web output directory:
   ```bash
   npm run build:web
   ```
2. Sync the assets to the iOS native folder:
   ```bash
   npx cap sync
   ```
3. Open in Xcode to run, debug, or sign:
   ```bash
   npx cap open ios
   ```

## Info.plist Permissions
If the embedded AI chat pages need microphone or camera access, add descriptions under `ios/App/App/Info.plist` (or via target properties in Xcode):
- `NSMicrophoneUsageDescription`: "OmniAI Chat needs microphone access so voice input works on AI chat sites that support it."
- `NSCameraUsageDescription`: "OmniAI Chat needs camera access so video/image features work on AI chat sites that support it."

## App Store Compliance
> [!IMPORTANT]
> Ensure custom helper features (like prompt history, broadcast bar, widgets) are highlighted in screenshots during app store submissions to fulfill Apple Guideline 4.2.
