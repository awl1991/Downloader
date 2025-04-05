const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { logToFile } = require('./logger');

// We'll track if we've successfully loaded settings
let settingsLoaded = false;

// Default download location (fallback)
const defaultDownloadLocation = path.join(os.homedir(), 'Downloads');

// Simple manual storage as a last resort
const manualStorageFile = path.join(
  app.isPackaged 
    ? app.getPath('userData')  // Production: use app data
    : path.join(process.cwd(), 'data'), // Dev: use local folder 
  'user-settings.json'
);

// Make sure the directory exists
try {
  const storageDir = path.dirname(manualStorageFile);
  fs.mkdirSync(storageDir, { recursive: true });
  logToFile(`Ensured storage directory exists: ${storageDir}`);
} catch (dirError) {
  logToFile(`Note: ${dirError.message}`);
}

// In-memory settings (fallback)
let inMemorySettings = {
  downloadLocation: defaultDownloadLocation
};

// Try to read settings from file directly
try {
  if (fs.existsSync(manualStorageFile)) {
    const fileContent = fs.readFileSync(manualStorageFile, 'utf8');
    const loadedSettings = JSON.parse(fileContent);
    
    if (loadedSettings && typeof loadedSettings === 'object') {
      inMemorySettings = loadedSettings;
      settingsLoaded = true;
      logToFile(`Successfully loaded settings from manual storage: ${manualStorageFile}`);
      logToFile(`Loaded settings: ${JSON.stringify(inMemorySettings)}`);
    }
  } else {
    logToFile(`No existing settings file found at: ${manualStorageFile}`);
  }
} catch (readError) {
  logToFile(`Failed to read manual settings file: ${readError.message}`);
}

// Function to manually save settings to file
function saveSettingsToFile() {
  try {
    const jsonData = JSON.stringify(inMemorySettings, null, 2);
    fs.writeFileSync(manualStorageFile, jsonData, 'utf8');
    logToFile(`Settings saved to: ${manualStorageFile}`);
    return true;
  } catch (writeError) {
    logToFile(`Error writing settings file: ${writeError.message}`);
    return false;
  }
}

// Also attempt to initialize electron-store in background
(async function initElectronStore() {
  try {
    const electronStore = await import('electron-store');
    const Store = electronStore.default;
    
    const store = new Store({
      name: 'app-settings',
      cwd: app.getPath('userData'), // Explicitly use userData for all environments
    });
    
    logToFile(`Electron-store path: ${store.path}`);
    
    // Try to copy our manually saved settings to electron-store for future use
    if (inMemorySettings.downloadLocation) {
      store.set('downloadLocation', inMemorySettings.downloadLocation);
      logToFile(`Copied download location to electron-store: ${inMemorySettings.downloadLocation}`);
    }
    
    // Try to read from electron-store if we don't have settings yet
    if (!settingsLoaded) {
      const storeLocation = store.get('downloadLocation');
      if (storeLocation) {
        inMemorySettings.downloadLocation = storeLocation;
        settingsLoaded = true;
        logToFile(`Retrieved download location from electron-store: ${storeLocation}`);
        
        // Save to our backup file too
        saveSettingsToFile();
      }
    }
  } catch (error) {
    logToFile(`Non-critical: electron-store initialization failed: ${error.message}`);
    logToFile(`Will continue using manual storage approach`);
  }
})();

/**
 * Gets the default downloads folder path
 * @returns {string} The default downloads folder path
 */
function getDefaultDownloadsPath() {
  return defaultDownloadLocation;
}

/**
 * Gets the saved download location with fallback options
 * @returns {string} The download location or default downloads folder
 */
function getDownloadLocation() {
  try {
    if (inMemorySettings.downloadLocation) {
      // Verify path exists
      const normalizedPath = path.normalize(inMemorySettings.downloadLocation);
      if (fs.existsSync(normalizedPath)) {
        logToFile(`Using saved download location: ${normalizedPath}`);
        return normalizedPath;
      }
    }
    
    // Fall back to default downloads folder
    logToFile(`Using default download location: ${defaultDownloadLocation}`);
    return defaultDownloadLocation;
  } catch (error) {
    logToFile(`Error getting download location: ${error.message}`);
    return defaultDownloadLocation;
  }
}

/**
 * Saves the download location
 * @param {string} location - The download location to save
 * @returns {boolean} Success or failure
 */
function saveDownloadLocation(location) {
  try {
    if (!location || typeof location !== 'string') {
      logToFile(`Invalid download location: ${location}`);
      return false;
    }
    
    // Normalize path
    const normalizedLocation = path.normalize(location);
    
    // Update in-memory settings
    inMemorySettings.downloadLocation = normalizedLocation;
    
    // Save to file immediately
    const saved = saveSettingsToFile();
    
    // Try to update electron-store in the background (will succeed silently if available)
    (async () => {
      try {
        const electronStore = await import('electron-store');
        const Store = electronStore.default;
        const store = new Store({
          name: 'app-settings',
          cwd: app.getPath('userData'), // Explicitly use userData
        });
        store.set('downloadLocation', normalizedLocation);
        logToFile(`Also saved download location to electron-store: ${normalizedLocation}`);
      } catch (storeError) {
        // Just log, we're using the manual file as primary now
        logToFile(`Could not save to electron-store (non-critical): ${storeError.message}`);
      }
    })().catch(e => {});
    
    if (saved) {
      logToFile(`Successfully saved download location: ${normalizedLocation}`);
    } else {
      logToFile(`Warning: May have failed to save download location`);
    }
    
    return true;
  } catch (error) {
    logToFile(`Error saving download location: ${error.message}`);
    return false;
  }
}

// Export simple synchronous functions
module.exports = {
  getDownloadLocation,
  saveDownloadLocation,
  // For graceful shutdown
  saveSettingsToFile
};