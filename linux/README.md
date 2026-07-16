# Linux Platform (linux)

This directory houses Linux-specific configurations, assets, and distribution packaging documentation.

## Packaging Configurations
OmniAI Chat desktop client can be packaged for Linux distributions (AppImage, deb, and rpm) using `electron-builder`.

- **Icon Path:** `linux/icon.png` (high-resolution PNG format).

## Build Setup
By default, the packaging scripts in `package.json` can be extended to support Linux packaging. You can run the builder directly:

```bash
# Package for default Linux target (AppImage)
npx electron-builder --linux
```

To add a dedicated script, insert this in your `package.json` scripts:
```json
"dist:linux": "electron-builder --linux"
```

## Desktop Entry Example
A standard `.desktop` file configuration (e.g. `omniaichat.desktop`) can be created to register the app in application launchers:
```ini
[Desktop Entry]
Name=OmniAIChat
Exec=omniaichat
Icon=omniaichat
Type=Application
Categories=Productivity;Utility;
Terminal=false
```
