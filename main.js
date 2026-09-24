const { app, BrowserWindow, session, ipcMain, shell, Menu } = require('electron');
const path = require('path');

let mainWindow;

// Standard Firefox User Agent (bypasses Google Auth "secure browser" checks more reliably than Chrome because it does not require Client Hints)
const MODERN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';
const SHARED_PARTITION = 'persist:omniai_session';

// Critical for bypassing Google Auth "secure browser" checks
app.userAgentFallback = MODERN_USER_AGENT;

// Prevent multiple simultaneous instances - without this, opening the app twice
// spawns two full copies that fight over the same session/cache files on disk
// (LevelDB/IndexedDB lock errors), instead of just focusing the existing window.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Hosts whose popups are sign-in flows and must stay in-app (sharing the
// session partition) instead of being sent to the external browser.
const AUTH_HOSTS = [
  'google.com', 'login.microsoftonline.com', 'login.live.com', 'login.microsoft.com',
  'appleid.apple.com', 'auth.openai.com', 'auth0.com', 'clerk.accounts.dev'
];

function isAuthPopupUrl(url) {
  try {
    const { hostname, pathname, search } = new URL(url);
    if (AUTH_HOSTS.some(h => hostname === h || hostname.endsWith('.' + h))) return true;
    return /oauth|signin|sign-in|login|auth|sso/i.test(pathname + search);
  } catch (e) {
    return false;
  }
}

function configureSessions() {
  const ses = session.fromPartition(SHARED_PARTITION);
  
  // Set custom user agent globally on the session
  ses.setUserAgent(MODERN_USER_AGENT);

  // Modify headers to remove ALL Electron/Chromium specific hints
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = MODERN_USER_AGENT;
    // Delete ALL Client Hints headers — Firefox never sends any sec-ch-* headers,
    // so their presence would expose this as Chromium and trigger Google's block.
    Object.keys(details.requestHeaders).forEach(key => {
      if (key.toLowerCase().startsWith('sec-ch-')) {
        delete details.requestHeaders[key];
      }
    });
    
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

function createWindow() {
  const isMac = process.platform === 'darwin';
  const isWin = process.platform === 'win32';
  // Always point at our bundled platform-specific icon (works both in dev and
  // packaged builds - Electron reads files transparently out of app.asar).
  // Previously this was `undefined` for packaged Windows builds, relying only
  // on the exe's embedded icon resource; we now also set it explicitly below
  // via mainWindow.setIcon() as a second, more direct guarantee for the
  // taskbar/title-bar icon (WM_SETICON), since WM_GETICON can otherwise
  // return null and force a fallback to the window class icon.
  let iconPath;
  if (isWin) {
    iconPath = path.join(__dirname, 'win/icon.ico');
  } else if (isMac) {
    iconPath = path.join(__dirname, 'mac/icon.png');
  } else {
    iconPath = path.join(__dirname, 'linux/icon.png');
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'OmniAI Chat',
    backgroundColor: '#0a0b10',
    icon: iconPath,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    // Stay hidden until the icon is explicitly applied below - this avoids a
    // window (and its taskbar button) ever being created/shown with no/blank
    // icon, which is what made the icon look "white" right after a fresh
    // install auto-launches the app for the first time.
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      devTools: true
    },
    // Always keep the native frame. On macOS `titleBarStyle: 'hiddenInset'`
    // already gives the inset-traffic-lights look (paired with the
    // -webkit-app-region: drag CSS on .sidebar-brand); setting frame:false
    // here as well would remove the traffic lights entirely, leaving no
    // mouse-based way to close/minimize/maximize the window on macOS.
    frame: true
  });

  if (isWin) {
    mainWindow.setIcon(iconPath);
  }

  const showWindowOnce = (() => {
    let shown = false;
    return () => {
      if (shown || mainWindow.isDestroyed()) return;
      shown = true;
      // Re-apply the icon right before showing: on Windows the native peer's
      // taskbar association can otherwise pick up a blank icon at the moment
      // the window first becomes visible, even if setIcon() was already
      // called earlier while the window was still hidden.
      if (isWin) {
        mainWindow.setIcon(iconPath);
      }
      mainWindow.show();
    };
  })();

  mainWindow.once('ready-to-show', showWindowOnce);
  // Safety net: don't let a slow/blocked first paint (e.g. the Google Fonts
  // request in index.html on a poor connection) keep the window hidden
  // indefinitely - show it anyway after a short timeout.
  setTimeout(showWindowOnce, 3000);

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // (Removed mainWindow.webContents.setWindowOpenHandler since we'll handle it globally)

  // Handle window cleanup
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setAppMenu() {
  const isMac = process.platform === 'darwin';
  
  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(isMac ? [
          { role: 'pasteAndMatchStyle' },
          { role: 'delete' },
          { role: 'selectAll' },
          { type: 'separator' },
          {
            label: 'Speech',
            submenu: [
              { role: 'startSpeaking' },
              { role: 'stopSpeaking' }
            ]
          }
        ] : [
          { role: 'delete' },
          { type: 'separator' },
          { role: 'selectAll' }
        ])
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Initialize sessions and app
app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.omniaichat.app');
  }
  if (process.platform === 'darwin' && !app.isPackaged) {
    // In a packaged .app, the Dock icon comes from Info.plist (built from
    // assets/icon.png via electron-builder's mac.icon). In dev mode
    // (`npm start`), Electron shows its own default icon unless we set one
    // explicitly - this keeps the Dock icon consistent in both cases.
    app.dock.setIcon(path.join(__dirname, 'assets/icon.png'));
  }
  setAppMenu();
  configureSessions();

  // Enforce custom user agent on ANY new window/webContents created (including allowpopups from webviews)
  app.on('web-contents-created', (event, contents) => {
    contents.on('will-attach-webview', (e, webPreferences, params) => {
      webPreferences.userAgent = MODERN_USER_AGENT;
    });
    
    contents.userAgent = MODERN_USER_AGENT;

    // Anti-fingerprint: mask Chromium-specific JavaScript properties on Google pages
    // so that the JS environment matches our Firefox User-Agent.
    // (window.chrome exists in Chromium but NOT in Firefox — Google can detect this mismatch)
    contents.on('dom-ready', () => {
      try {
        const url = contents.getURL();
        const host = url ? new URL(url).hostname : '';
        if (/(^|\.)(google\.com|googleapis\.com|gstatic\.com)$/.test(host)) {
          contents.executeJavaScript(`
            try {
              // Firefox does not have window.chrome — remove it to match our Firefox UA
              if (window.chrome) { delete window.chrome; }
              // Ensure the webdriver flag is not set (set by some Electron/automation configs)
              Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
              // Firefox navigator.plugins returns an empty PluginArray
              Object.defineProperty(navigator, 'plugins', { get: () => [], configurable: true });
            } catch(e) {}
          `).catch(() => {});
        }
      } catch(e) {}
    });

    // Globally handle ANY popup (window.open) triggered by ANY webContents (including webviews)
    contents.setWindowOpenHandler(({ url }) => {
      // Allow SSO / login popups to open as secure, stripped-down BrowserWindows
      if (isAuthPopupUrl(url)) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            webPreferences: {
              nodeIntegration: false, // Critical for Google Auth!
              contextIsolation: true,
              sandbox: true,
              partition: SHARED_PARTITION,
              userAgent: MODERN_USER_AGENT
            }
          }
        };
      }
      
      // All other external links (not auth) go to default OS browser
      if (/^(https?|mailto):/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handler to clear session storage/cookies for individual platforms (supports clearing specific origins in the shared partition)
ipcMain.handle('clear-session', async (event, { partition, origin }) => {
  try {
    const ses = session.fromPartition(partition || SHARED_PARTITION);
    if (origin) {
      await ses.clearStorageData({ origin: origin });
      console.log(`Cleared storage data for origin: ${origin} in session: ${partition}`);
    } else {
      await ses.clearStorageData();
      console.log(`Cleared all storage data for session: ${partition}`);
    }
    return { success: true };
  } catch (error) {
    console.error(`Failed to clear session data:`, error);
    return { success: false, error: error.message };
  }
});

// IPC Handler to toggle always-on-top
ipcMain.handle('set-always-on-top', async (event, value) => {
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(value);
    return { success: true, alwaysOnTop: value };
  }
  return { success: false };
});

// IPC Handler to get always-on-top state
ipcMain.handle('get-always-on-top', async () => {
  if (mainWindow) {
    return { alwaysOnTop: mainWindow.isAlwaysOnTop() };
  }
  return { alwaysOnTop: false };
});

// ===================================================================
// IPC Handlers for Sites Configuration (sites.json)
// ===================================================================
const BUNDLED_SITES_PATH = path.join(__dirname, 'sites.json');
const USER_SITES_PATH = path.join(app.getPath('userData'), 'sites.json');

// Copy bundled sites.json to userData on first run, and merge bundled updates
// (new portals, URL changes, popularity ordering) whenever the bundled
// `configVersion` is newer than the user's copy. User-added custom sites and
// their per-site `enabled` flags are preserved.
let userSitesSynced = false;
function ensureUserSitesConfig() {
  if (userSitesSynced) return;
  userSitesSynced = true;
  const fs = require('fs');
  if (!fs.existsSync(USER_SITES_PATH)) {
    try {
      fs.copyFileSync(BUNDLED_SITES_PATH, USER_SITES_PATH);
    } catch (e) {
      console.error('Failed to copy sites.json to userData:', e);
    }
    return;
  }
  try {
    const bundledData = JSON.parse(fs.readFileSync(BUNDLED_SITES_PATH, 'utf8'));
    const userData = JSON.parse(fs.readFileSync(USER_SITES_PATH, 'utf8'));
    if (!Array.isArray(bundledData.sites) || !Array.isArray(userData.sites)) return;
    if ((userData.configVersion || 0) >= (bundledData.configVersion || 0)) return;

    // Legacy ids renamed in newer bundles
    const RENAMED_IDS = { you: 'youcom' };
    const userById = new Map();
    userData.sites.forEach(site => {
      const id = RENAMED_IDS[site.id] || site.id;
      userById.set(id, { ...site, id });
    });

    // Bundled sites come first, in bundled (popularity) order
    const merged = bundledData.sites.map(bundled => {
      const existing = userById.get(bundled.id);
      userById.delete(bundled.id);
      return existing ? { ...bundled, enabled: existing.enabled } : bundled;
    });
    // Then any custom sites the user added themselves
    userById.forEach(site => merged.push(site));

    const output = { ...userData, configVersion: bundledData.configVersion, sites: merged };
    fs.writeFileSync(USER_SITES_PATH, JSON.stringify(output, null, 2), 'utf8');
  } catch (e) {
    console.error('Error updating user sites config:', e);
  }
}

// Read sites config: user copy first, fallback to bundled
ipcMain.handle('read-sites-config', async () => {
  const fs = require('fs');
  ensureUserSitesConfig();
  try {
    const data = fs.readFileSync(USER_SITES_PATH, 'utf8');
    const parsed = JSON.parse(data);
    return { success: true, data: parsed };
  } catch (e) {
    // Fallback to bundled
    try {
      const data = fs.readFileSync(BUNDLED_SITES_PATH, 'utf8');
      const parsed = JSON.parse(data);
      return { success: true, data: parsed };
    } catch (e2) {
      return { success: false, error: e2.message };
    }
  }
});

// Write sites config to user's copy
ipcMain.handle('write-sites-config', async (event, jsonString) => {
  const fs = require('fs');
  try {
    // Validate JSON
    const parsed = JSON.parse(jsonString);
    if (!parsed.sites || !Array.isArray(parsed.sites)) {
      return { success: false, error: '"sites" must be an array' };
    }
    // Validate each site entry
    const requiredFields = ['id', 'name', 'url', 'icon', 'color', 'category', 'enabled', 'trayLabel'];
    const ids = new Set();
    for (const site of parsed.sites) {
      for (const field of requiredFields) {
        if (site[field] === undefined || site[field] === null) {
          return { success: false, error: `Site "${site.id || site.name || '?'}" is missing required field: "${field}"` };
        }
      }
      if (ids.has(site.id)) {
        return { success: false, error: `Duplicate site id: "${site.id}"` };
      }
      ids.add(site.id);
      if (!site.url.startsWith('http://') && !site.url.startsWith('https://')) {
        return { success: false, error: `Site "${site.id}" has invalid URL (must start with http:// or https://)` };
      }
      if (!['ai', 'utility'].includes(site.category)) {
        return { success: false, error: `Site "${site.id}" has invalid category (must be "ai" or "utility")` };
      }
    }
    // Keep the config version so the next launch doesn't re-merge bundled sites
    if (parsed.configVersion === undefined) {
      try {
        parsed.configVersion = JSON.parse(fs.readFileSync(BUNDLED_SITES_PATH, 'utf8')).configVersion || 0;
      } catch (e) {
        parsed.configVersion = 0;
      }
    }
    // Write to disk
    fs.writeFileSync(USER_SITES_PATH, JSON.stringify(parsed, null, 2), 'utf8');
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Reset sites config to bundled default
ipcMain.handle('reset-sites-config', async () => {
  const fs = require('fs');
  try {
    fs.copyFileSync(BUNDLED_SITES_PATH, USER_SITES_PATH);
    const data = fs.readFileSync(USER_SITES_PATH, 'utf8');
    return { success: true, data: JSON.parse(data) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
