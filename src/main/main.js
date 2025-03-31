const { app, BrowserWindow, protocol } = require('electron');
const url = require('url');
const fs = require('fs');
const { createWindow } = require('./windowManager');
const { setupIpcHandlers } = require('./ipcHandlers');
const { logToFile } = require('./logger');
const { checkDependencies } = require('./dependencyChecker');

// Set app-wide configuration to prevent transparent window flashes
// app.commandLine.appendSwitch('disable-renderer-backgrounding');
// app.commandLine.appendSwitch('disable-background-timer-throttling');
// app.commandLine.appendSwitch('wm-window-animations-disabled');

// Override the default Electron behavior for windows
app.on('ready', () => {
  // Fix for transparent window flash with dialogs
  const originalBrowserWindowConstructor = BrowserWindow;
  function PatchedBrowserWindow(options = {}) {
    // Force these properties for all new windows to prevent transparency issues
    const patchedOptions = {
      ...options,
      show: false, // Always start hidden then show when ready
      backgroundColor: options.backgroundColor || '#0B0F19',
      transparent: false,
      opacity: 1.0
    };
    const win = new originalBrowserWindowConstructor(patchedOptions);
    return win;
  }
  
  // Apply our patched constructor to all BrowserWindows
  global.BrowserWindow = PatchedBrowserWindow;
  Object.setPrototypeOf(PatchedBrowserWindow, originalBrowserWindowConstructor);
  Object.setPrototypeOf(PatchedBrowserWindow.prototype, originalBrowserWindowConstructor.prototype);
});

app.setPath('cache', require('path').join(app.getPath('userData'), 'cache'));

// Register a custom protocol for serving assets
function registerAssetProtocol() {
  const path = require('path');
  
  protocol.registerFileProtocol('app-asset', (request, callback) => {
    const relativePath = decodeURI(request.url.replace('app-asset://', ''));
    const assetPath = app.isPackaged
      ? path.join(process.resourcesPath, relativePath)
      : path.join(__dirname, '../../', relativePath);
    
    try {
      if (fs.existsSync(assetPath)) {
        return callback(assetPath);
      }
      logToFile(`Asset not found: ${assetPath}`);
      callback({ error: -2 /* ENOENT */ });
    } catch (error) {
      logToFile(`Protocol error: ${error.message}`);
      callback({ error: -2 /* ENOENT */ });
    }
  });
  
  logToFile('Asset protocol registered');
}

// Slight delay to ensure our patches are applied
setTimeout(() => {
  logToFile('Initializing app with delay to ensure proper setup');
  app.whenReady().then(() => {
    logToFile('App is ready, starting initialization');
    
    // Register custom protocol
    registerAssetProtocol();
    const mainWindow = createWindow();
    if (!mainWindow) {
      logToFile('Failed to create main window, quitting application');
      app.quit();
      return;
    }
    checkDependencies().then(status => {
      logToFile(`Dependency check results: yt-dlp=${status.ytDlpAvailable}, ffmpeg=${status.ffmpegAvailable}, ffprobe=${status.ffprobeAvailable}`);
      if (status.errorMessages.length > 0) {
        require('electron').dialog.showMessageBox({
          type: 'warning',
          title: 'Missing Dependencies',
          message: 'Some dependencies are missing!',
          detail: status.errorMessages.join('\n\n') + '\n\nSee the dependency section in the app.'
        });
      }
    }).catch(err => logToFile(`Error checking dependencies: ${err.message}`));
    app.on('activate', () => {
      if (require('electron').BrowserWindow.getAllWindows().length === 0) createWindow();
    });
    setupIpcHandlers(mainWindow);
    logToFile('Application successfully initialized');
  }).catch(error => {
    logToFile(`Fatal startup error: ${error.message}\n${error.stack}`);
    app.quit();
  });
}, 500);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (error) => {
  logToFile(`Uncaught Exception: ${error.message}\nStack: ${error.stack}`);
  app.quit();
});

process.on('unhandledRejection', (reason) => console.error('Unhandled Rejection:', reason));