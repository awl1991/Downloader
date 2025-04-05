const { app, BrowserWindow, protocol, dialog } = require('electron');
const url = require('url');
const fs = require('fs');
const { createWindow } = require('./windowManager');
const { setupIpcHandlers } = require('./ipcHandlers');
const { logToFile } = require('./logger');
const { checkDependencies } = require('./dependencyChecker');
const settingsManager = require('./settingsManager'); // Need the API for saveSettingsToFile

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
    
    try {
      // Wait for settings initialization to complete
      logToFile('Initializing settings store...');
      
      // Create main window after settings initialization is attempted
      const mainWindow = createWindow();
      if (!mainWindow) {
        logToFile('Failed to create main window, quitting application');
        app.quit();
        return;
      }
      
      // Set up IPC handlers 
      setupIpcHandlers(mainWindow);
      
      // Check dependencies
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
      
      logToFile('Application successfully initialized');
    } catch (error) {
      logToFile(`Error during application initialization: ${error.message}`);
      logToFile(error.stack);
      app.quit();
    }
  }).catch(error => {
    logToFile(`Fatal startup error: ${error.message}\n${error.stack}`);
    app.quit();
  });
}, 500);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Explicit handler to ensure settings are saved before exit
app.on('before-quit', (event) => {
  logToFile('Application is preparing to quit. Explicitly saving settings...');
  
  // Give time for any pending operations to complete
  event.preventDefault();
  
  try {
    // Explicitly save settings to file
    const saved = settingsManager.saveSettingsToFile();
    logToFile(`Settings explicitly saved before exit: ${saved ? 'success' : 'failed'}`);
    
    // Small delay to ensure file operations complete
    setTimeout(() => {
      logToFile('Settings should be persisted, proceeding with application exit');
      app.exit(0);
    }, 500); // Longer delay for better reliability
  } catch (error) {
    logToFile(`Error during shutdown: ${error.message}`);
    app.exit(1);
  }
});

// More graceful error handling for packaged app
// Only quit on truly fatal errors, not file operation issues
process.on('uncaughtException', (error) => {
  logToFile(`Uncaught Exception: ${error.message}\nStack: ${error.stack}`);
  
  // Don't quit the app for file operation errors which are common in packaged builds
  if (error.code && ['EACCES', 'EPERM', 'EBUSY', 'ENOENT', 'EMFILE', 'EEXIST'].includes(error.code)) {
    logToFile(`Non-fatal file error caught: ${error.code}`);
  } else {
    dialog.showErrorBox('Application Error', 
      `A critical error occurred: ${error.message}\n\nCheck log for details.`);
  }
});

process.on('unhandledRejection', (reason) => {
  logToFile(`Unhandled Promise Rejection: ${reason}`);
});