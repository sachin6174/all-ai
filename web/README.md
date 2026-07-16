# Web Platform (web)

This directory contains web-specific documentation, limitations, and templates for deploying OmniAI Chat as a web application.

## Embedding Constraints (The Same-Origin Challenge)

Unlike the Electron desktop client, which can disable security partitions and bypass standard header policies, web browsers enforce strict security standards:
- **`X-Frame-Options: SAMEORIGIN` / `DENY`:** Portals like ChatGPT, Claude, and Gemini explicitly block browsers from embedding their pages inside `<iframe>` tags.
- **Content Security Policy (CSP):** Restricts script injection and styles from external sources.

Deploying the current `index.html` structure directly to a public web server will result in empty iframe grids.

---

## Solutions for Web Compatibility

### Option 1: Browser Extension (Simplest Client-Side Fix)
You can build a small accompanying browser extension that:
1. Listens to headers matching the AI portals.
2. Removes `X-Frame-Options`, `Content-Security-Policy`, and `Frame-Ancestors` response headers.
3. Inject user scripts to read inputs and sync layouts.

### Option 2: Reverse Proxy Server (Server-Side Bypass)
You can run an Express.js reverse proxy that fetches pages on behalf of the client, rewrites resources, and strips frame restrictions:

```javascript
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const app = express();

app.use('/proxy/gemini', createProxyMiddleware({
  target: 'https://gemini.google.com',
  changeOrigin: true,
  onProxyRes: function (proxyRes, req, res) {
    // Strip security frame restrictions
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
  }
}));

app.listen(3000, () => console.log('Proxy Server running on port 3000'));
```
*Note: OAuth/Google authentication flows can be highly sensitive to host modifications and might require session preservation.*

### Option 3: Backend API Integration (Recommended for Production Web Apps)
Instead of embedding the full guest web pages via frames:
1. Re-design the web interface to display unified chat windows.
2. Send prompt queries directly from the client to a backend endpoint.
3. The backend makes API calls to official endpoints (OpenAI, Anthropic, Google Gemini, DeepSeek) using API keys.
4. Returns the response stream back to the UI.
