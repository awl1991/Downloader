const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;
const { logToFile } = require('./logger');

let dependencyStatus = {
  ytDlpAvailable: false,
  ffmpegAvailable: false,
  ffprobeAvailable: false,
  ytDlpPath: null,
  ffmpegPath: null,
  ffprobePath: null,
  errorMessages: []
};

function getResourcePath(resource) {
  return app.isPackaged
    ? path.join(process.resourcesPath, resource)
    : path.join(__dirname, '../../', resource);
}

// Fixes paths in packaged apps by converting app.asar paths to app.asar.unpacked
function fixAsarPath(originalPath) {
  if (!app.isPackaged) return originalPath;
  
  // Check if this is a path inside an asar archive
  if (originalPath && originalPath.includes('app.asar')) {
    // Replace app.asar with app.asar.unpacked which is where binaries are actually stored
    const fixedPath = originalPath.replace('app.asar', 'app.asar.unpacked');
    logToFile(`Converted ASAR path: ${originalPath} -> ${fixedPath}`);
    return fixedPath;
  }
  
  return originalPath;
}

async function checkDependencies() {
  try {
    // Set yt-dlp to local binary path 
    dependencyStatus.ytDlpPath = getResourcePath('assets/bin/yt-dlp.exe');
    
    // For ffmpeg and ffprobe, use the npm package paths but fix them for packaged apps
    dependencyStatus.ffmpegPath = fixAsarPath(ffmpegPath);
    dependencyStatus.ffprobePath = fixAsarPath(ffprobePath);
    
    logToFile(`Using paths:
yt-dlp: ${dependencyStatus.ytDlpPath}
ffmpeg: ${dependencyStatus.ffmpegPath}
ffprobe: ${dependencyStatus.ffprobePath}
`);
  
    // Check if binaries exist and are accessible
    if (!fs.existsSync(dependencyStatus.ytDlpPath)) {
      dependencyStatus.ytDlpAvailable = false;
      dependencyStatus.errorMessages.push(`yt-dlp not found at ${dependencyStatus.ytDlpPath}`);
      logToFile(`ERROR: yt-dlp not found at ${dependencyStatus.ytDlpPath}`);
    } else {
      dependencyStatus.ytDlpAvailable = true;
      logToFile(`yt-dlp found at ${dependencyStatus.ytDlpPath}`);
    }
    
    // For ffmpeg
    try {
      if (fs.existsSync(dependencyStatus.ffmpegPath)) {
        dependencyStatus.ffmpegAvailable = true;
        logToFile(`ffmpeg found at ${dependencyStatus.ffmpegPath}`);
      } else {
        // Try direct fallback to PATH
        dependencyStatus.ffmpegPath = 'ffmpeg';
        dependencyStatus.ffmpegAvailable = true;
        logToFile(`ffmpeg not found at specified path, falling back to PATH`);
      }
    } catch (err) {
      // If there's an error checking, fall back to just using 'ffmpeg'
      dependencyStatus.ffmpegPath = 'ffmpeg';
      dependencyStatus.ffmpegAvailable = true;
      logToFile(`Error checking ffmpeg path, falling back to PATH: ${err.message}`);
    }
    
    // For ffprobe
    try {
      if (fs.existsSync(dependencyStatus.ffprobePath)) {
        dependencyStatus.ffprobeAvailable = true;
        logToFile(`ffprobe found at ${dependencyStatus.ffprobePath}`);
      } else {
        // Try direct fallback to PATH
        dependencyStatus.ffprobePath = 'ffprobe';
        dependencyStatus.ffprobeAvailable = true;
        logToFile(`ffprobe not found at specified path, falling back to PATH`);
      }
    } catch (err) {
      // If there's an error checking, fall back to just using 'ffprobe'
      dependencyStatus.ffprobePath = 'ffprobe';
      dependencyStatus.ffprobeAvailable = true;
      logToFile(`Error checking ffprobe path, falling back to PATH: ${err.message}`);
    }
    
    // Log final dependency status
    logToFile(`Final dependency status:
- yt-dlp: ${dependencyStatus.ytDlpAvailable ? 'Available' : 'Missing'} (${dependencyStatus.ytDlpPath})
- ffmpeg: ${dependencyStatus.ffmpegAvailable ? 'Available' : 'Missing'} (${dependencyStatus.ffmpegPath})
- ffprobe: ${dependencyStatus.ffprobeAvailable ? 'Available' : 'Missing'} (${dependencyStatus.ffprobePath})
`);
    
    return dependencyStatus;
  } catch (error) {
    logToFile(`Fatal error in dependency checker: ${error.message}`);
    dependencyStatus.errorMessages.push(`Fatal error: ${error.message}`);
    return dependencyStatus;
  }
}

module.exports = { checkDependencies, dependencyStatus };