const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;

// Standard Chrome User Agent (matches the underlying Chromium engine of Electron to avoid discrepancy detection)
const MODERN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SHARED_PARTITION = 'persist:omniai_session';

// Critical for bypassing Google Auth "secure browser" checks
app.userAgentFallback = MODERN_USER_AGENT;

function configureSessions() {
  const ses = session.fromPartition(SHARED_PARTITION);
  
  // Set custom user agent globally on the session
  ses.setUserAgent(MODERN_USER_AGENT);

  // Modify headers to remove Electron/Chromium specific hints
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = MODERN_USER_AGENT;
    // Delete headers that might reveal this is an embedded/Electron browser
    delete details.requestHeaders['sec-ch-ua'];
    delete details.requestHeaders['sec-ch-ua-mobile'];
    delete details.requestHeaders['sec-ch-ua-platform'];
    
    callback({ cancel: false, requestHeaders: details.requestHeaders });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    title: 'OmniAI Chat',
    backgroundColor: '#0a0b10',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      devTools: true
    },
    frame: true // Standard window frame for easy minimize/maximize/close
  });

  mainWindow.loadFile('index.html');

  // (Removed mainWindow.webContents.setWindowOpenHandler since we'll handle it globally)

  // Handle window cleanup
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize sessions and app
app.whenReady().then(() => {
  configureSessions();
  createWindow();

  // Enforce custom user agent on ANY new window/webContents created (including allowpopups from webviews)
  app.on('web-contents-created', (event, contents) => {
    contents.on('will-attach-webview', (e, webPreferences, params) => {
      webPreferences.userAgent = MODERN_USER_AGENT;
    });
    
    contents.userAgent = MODERN_USER_AGENT;

    // Globally handle ANY popup (window.open) triggered by ANY webContents (including webviews)
    contents.setWindowOpenHandler(({ url }) => {
      // Allow Google login popups to open as secure, stripped-down BrowserWindows
      if (url.includes('accounts.google.com') || url.includes('oauth') || url.includes('signin') || url.includes('google.com')) {
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
      shell.openExternal(url);
      return { action: 'deny' };
    });
  });

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
