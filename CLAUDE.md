# CLAUDE.md - Project Source of Truth (GStack Style)

## Project Overview
OmniAIChat is a cross-platform Electron desktop client that embeds multiple popular AI chat portals (Gemini, ChatGPT, Claude, DeepSeek, Grok, Qwen, etc.) in a unified layout. It supports a **global broadcast bar** that injects inputs to all active channels simultaneously, has a persistent **Prompt History** log with pinning and copying capabilities, and a **Workspace Monitor** dashboard widget.

## Quick Start & Build Commands
- **Install dependencies:** `npm install`
- **Run the app locally:** `npm start`
- **Package for Windows installer:** `npm run dist:win`
- **Package for macOS installer:** `npm run dist:mac`
- **Package for all platforms:** `npm run dist:all`

## Codebase Architecture
- **Main Process:** [main.js](file:///c:/Users/sachi/Desktop/all-ai/main.js) (window creation, user agent configurations, secure session partitions, and IPC event handlers).
- **Renderer Process:** [renderer.js](file:///c:/Users/sachi/Desktop/all-ai/renderer.js) (state management, sidebar navigation, webview event listeners, dynamic guest script injection, prompt history management, and UI actions).
- **Main UI Layout:** [index.html](file:///c:/Users/sachi/Desktop/all-ai/index.html) (sidebar navigation list, focused webviews grids, settings panes, prompts history panels, and custom widgets).
- **Global Styles:** [style.css](file:///c:/Users/sachi/Desktop/all-ai/style.css) (theming variables, layout grid options, premium card UI styles, animations, and custom scrollbars).
- **Guest Injection Script:** [injection-script.js](file:///c:/Users/sachi/Desktop/all-ai/injection-script.js) (DOM-traversal script used to find inputs, click submit buttons, and automate prompt inputs inside guest pages).

## Development Guidelines

### Webview Interactivity & IPC Communication
- guest-monitoring script is dynamically injected into each webview context on `dom-ready`.
- Guest webviews log typed inputs via `console.log("OMNIAI_PROMPT_SUBMIT:" + text)`.
- The parent window handles the guest logs using the webview `console-message` listener to save prompt history entries.

### Version Upgrades
- When upgrading the version:
  1. Increment version in [package.json](file:///c:/Users/sachi/Desktop/all-ai/package.json) & [package-lock.json](file:///c:/Users/sachi/Desktop/all-ai/package-lock.json) (e.g. using `npm version <major/minor/patch> --no-git-tag-version`).
  2. Update the version string inside the footer info-card in [index.html](file:///c:/Users/sachi/Desktop/all-ai/index.html) to keep them synchronized.
  3. Rebuild the application installer.

### Code Style
- Use ES6 standard JavaScript (`const`, `let`, arrow functions, async/await).
- Follow a modular structure with feature annotations (e.g. `FEATURE: Sidebar Collapse`).
- Maintain premium design rules: curated CSS color variables, smooth interactive hovers, rounded card borders, and glassmorphism styling.
