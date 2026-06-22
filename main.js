const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const path = require('path');

let mainWindow;

// Modern Firefox User Agent to bypass Google's "secure browser" restriction on Electron webviews
const MODERN_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';
const SHARED_PARTITION = 'persist:omniai_session';

function configureSessions() {
  const ses = session.fromPartition(SHARED_PARTITION);
  
  // Set custom user agent globally on the session
  ses.setUserAgent(MODERN_USER_AGENT);

  // Modify headers if needed or handle web requests
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = MODERN_USER_AGENT;
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
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webviewTag: true,
      devTools: true
    },
    frame: true // Standard window frame for easy minimize/maximize/close
  });

  mainWindow.loadFile('index.html');
  mainWindow.webContents.openDevTools();

  // Open links with target="_blank" in the default OS browser instead of inside the app main view
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle window cleanup
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize sessions and app
app.whenReady().then(() => {
  configureSessions();
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
