# Windows Platform (win)

This directory contains Windows-specific configurations, assets, and documentation.

## Packaging Configuration
The Windows build utilizes `electron-builder` and generates an NSIS installer.
- **Icon Path:** `win/icon.ico` (multi-resolution icon format).
- **Target:** NSIS installer for both `x64` and `arm64` Architectures.

## Developer Quick Start
To build and pack the installer for Windows:
```bash
# Install dependencies
npm install

# Run the app in development mode
npm start

# Pack the Windows installer (.exe)
npm run dist:win
```

## NSIS Details
- The configuration is set up in `package.json` under the `build.win` and `build.nsis` keys.
- By default, `runAfterFinish` is disabled to allow custom launch flows post-install if desired.
