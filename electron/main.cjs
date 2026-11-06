const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { fork } = require('child_process');

let mainWindow = null;
let backendProcess = null;
let autoUpdater = null;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function startBackend() {
  if (isDev) {
    // In dev mode, the backend runs separately
    return;
  }
  try {
    const serverPath = path.join(app.getAppPath(), 'backend', 'server.js');
    console.log('[Electron] Launching embedded backend server:', serverPath);
    backendProcess = fork(serverPath, [], {
      env: {
        ...process.env,
        PORT: '5000',
        MONGODB_URI:
          process.env.MONGODB_URI ||
          'mongodb+srv://catamaran_app_user:CatamaranPosSystem@cluster0.xopp0.mongodb.net/catamaran_pos?retryWrites=true&w=majority',
        ELECTRON_RUN_AS_NODE: '1'
      },
      stdio: 'inherit'
    });
    backendProcess.on('error', (err) => {
      console.error('[Electron] Backend process error:', err);
    });
    backendProcess.on('exit', (code, signal) => {
      console.log(`[Electron] Backend process exited with code ${code}, signal ${signal}`);
    });
  } catch (err) {
    console.error('[Electron] Failed to start backend server:', err);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Catamaran Beach Restaurant & Surf Club - POS Terminal',
    icon: path.join(__dirname, '../src/assets/logo.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    }
  });

  // Open maximized for true POS workstation experience
  mainWindow.maximize();

  if (isDev) {
    mainWindow.loadURL('http://localhost:5175');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Prevent external link navigation from replacing the app window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -------------------------------------------------------------
// Thermal Printer Hardware IPC Handlers
// -------------------------------------------------------------
ipcMain.handle('get-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle('print-thermal', async (event, options = {}) => {
  if (!mainWindow) return { success: false, error: 'No active window' };
  return new Promise((resolve) => {
    mainWindow.webContents.print(
      {
        silent: options.silent ?? true,
        printBackground: true,
        deviceName: options.deviceName || '',
        pageSize: {
          width: 80000, // 80mm standard roll width in microns
          height: 297000
        },
        margins: {
          marginType: 'none'
        }
      },
      (success, failureReason) => {
        if (!success) {
          resolve({ success: false, error: failureReason });
        } else {
          resolve({ success: true });
        }
      }
    );
  });
});

ipcMain.handle('open-external', async (event, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
    return true;
  }
  return false;
});

ipcMain.on('window-minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window-maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow?.maximize();
  }
});

ipcMain.on('window-close', () => {
  mainWindow?.close();
});

// -------------------------------------------------------------
// Auto-Updater Integration (GitHub Releases)
// -------------------------------------------------------------
function setupAutoUpdater() {
  if (isDev) {
    console.log('[AutoUpdater] Development mode - auto-update check skipped');
    return;
  }

  try {
    const updaterModule = require('electron-updater');
    autoUpdater = updaterModule.autoUpdater;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      console.log('[AutoUpdater] Checking for updates on GitHub Releases...');
      mainWindow?.webContents.send('update-message', {
        status: 'checking',
        text: 'Checking for updates on GitHub...'
      });
    });

    autoUpdater.on('update-available', (info) => {
      console.log('[AutoUpdater] Update available:', info.version);
      mainWindow?.webContents.send('update-message', {
        status: 'available',
        version: info.version,
        text: `Update v${info.version} available! Downloading in background...`
      });
    });

    autoUpdater.on('update-not-available', (info) => {
      console.log('[AutoUpdater] Up to date.');
      mainWindow?.webContents.send('update-message', {
        status: 'up-to-date',
        version: app.getVersion(),
        text: `Catamaran POS is up to date (v${app.getVersion()})`
      });
    });

    autoUpdater.on('download-progress', (progressObj) => {
      const percent = Math.floor(progressObj.percent);
      mainWindow?.webContents.send('update-message', {
        status: 'downloading',
        percent,
        text: `Downloading update: ${percent}%`
      });
    });

    autoUpdater.on('update-downloaded', (info) => {
      console.log('[AutoUpdater] Update downloaded successfully:', info.version);
      mainWindow?.webContents.send('update-message', {
        status: 'downloaded',
        version: info.version,
        text: `Update v${info.version} downloaded! Restart application to apply.`
      });
    });

    autoUpdater.on('error', (err) => {
      console.warn('[AutoUpdater] Update check error:', err?.message || err);
      mainWindow?.webContents.send('update-message', {
        status: 'error',
        text: 'Update check failed: ' + (err?.message || 'Network error')
      });
    });

    // Check 5 seconds after launch, and periodically every 30 minutes
    setTimeout(() => {
      autoUpdater?.checkForUpdatesAndNotify().catch((err) => {
        console.warn('[AutoUpdater] Initial check error:', err.message);
      });
    }, 5000);

    setInterval(() => {
      autoUpdater?.checkForUpdatesAndNotify().catch(() => {});
    }, 30 * 60 * 1000);
  } catch (err) {
    console.warn('[AutoUpdater] Failed to initialize electron-updater:', err?.message || err);
  }
}

ipcMain.handle('check-for-updates', async () => {
  if (isDev || !autoUpdater) {
    return {
      status: 'dev',
      text: `Running in development mode (v${app.getVersion()})`
    };
  }
  try {
    const res = await autoUpdater.checkForUpdates();
    return {
      status: 'ok',
      version: res?.updateInfo?.version || app.getVersion(),
      text: `Checked for updates. Current version is v${app.getVersion()}.`
    };
  } catch (err) {
    return {
      status: 'error',
      text: err?.message || 'Could not reach GitHub Releases'
    };
  }
});

ipcMain.handle('restart-and-install-update', () => {
  autoUpdater?.quitAndInstall();
});

app.whenReady().then(() => {
  startBackend();
  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (backendProcess) {
    try {
      backendProcess.kill();
    } catch {}
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
