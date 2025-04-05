const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { logToFile } = require('./logger');

function getResourcePath(resource) {
  const app = require('electron').app;
  return app.isPackaged
    ? path.join(process.resourcesPath, resource)
    : path.join(__dirname, '../../', resource);
}

// Specific function for preload script which has a different path structure
function getPreloadPath() {
  const app = require('electron').app;
  if (!app.isPackaged) {
    return path.join(__dirname, 'preload', 'preload.js');
  }
  
  // In packaged app, try multiple possible locations
  const possiblePaths = [
    path.join(process.resourcesPath, 'app.asar', 'src', 'main', 'preload', 'preload.js'),
    path.join(process.resourcesPath, 'src', 'main', 'preload', 'preload.js'),
    path.join(process.resourcesPath, 'preload', 'preload.js'),
    path.join(__dirname, 'preload', 'preload.js')
  ];
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      logToFile(`Found preload script at: ${possiblePath}`);
      return possiblePath;
    }
  }
  
  // If no path is found, log it and return the first path (it will fail, but with a clear error)
  logToFile('WARNING: Could not find preload script in any expected location');
  return possiblePaths[0];
}

function createWindow() {
  try {
    logToFile('Creating main window...');
    const win = new BrowserWindow({
      width: 800,
      height: 800,
      minWidth: 800,
      frame: false,
      show: false,
      backgroundColor: '#0B0F19',
      icon: getResourcePath('assets/icon.png'),
      webPreferences: {
        preload: getPreloadPath(),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      },
    });

    win.once('ready-to-show', () => {
      logToFile('Window content loaded, showing window');
      win.show();
      
        // Open DevTools for debugging
       win.webContents.openDevTools(); // <--------------------------------------------------------------------------------DEVTOOLS HERE
      // logToFile('DevTools opened for debugging');
    });

    // Determine the correct path to the HTML file based on whether we're packaged
    let htmlPath;
    const app = require('electron').app;
    if (app.isPackaged) {
      // In packaged app, we need to handle paths differently
      htmlPath = path.join(process.resourcesPath, 'app.asar', 'src', 'renderer', 'index.html');
      // Add fallback paths if the primary one doesn't exist
      if (!fs.existsSync(htmlPath)) {
        // Try alternative paths
        const alternatives = [
          path.join(process.resourcesPath, 'src', 'renderer', 'index.html'),
          path.join(process.resourcesPath, 'renderer', 'index.html'),
          path.join(process.resourcesPath, 'app', 'src', 'renderer', 'index.html'),
          path.join(__dirname, '..', '..', 'renderer', 'index.html')
        ];
        
        for (const alt of alternatives) {
          if (fs.existsSync(alt)) {
            htmlPath = alt;
            logToFile(`Found HTML at alternative path: ${alt}`);
            break;
          }
        }
      }
    } else {
      // In development
      htmlPath = path.join(__dirname, '../../src/renderer/index.html');
    }
    
    logToFile(`Attempting to load HTML from: ${htmlPath}`);
    win.loadFile(htmlPath).catch(err => {
      logToFile(`Error loading index.html from ${htmlPath}: ${err.message}`);
      dialog.showErrorBox('Application Error', `Failed to load interface: ${err.message} loading ${htmlPath}`);
    });

    return win;
  } catch (error) {
    logToFile(`Window creation failed: ${error.message}`);
    dialog.showErrorBox('Fatal Error', error.message);
    return null;
  }
}

module.exports = { createWindow };