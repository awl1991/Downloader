const path = require('path');
const { app } = require('electron');
const fs = require('fs');
const ffmpegPath = require('ffmpeg-static');
const ffprobePath = require('ffprobe-static').path;

let dependencyStatus = {
  ytDlpAvailable: true,
  ffmpegAvailable: true,
  ffprobeAvailable: true,
  ytDlpPath: null, // Will be set to local binary
  ffmpegPath: ffmpegPath, // From npm package
  ffprobePath: ffprobePath, // From npm package
  errorMessages: []
};

function getResourcePath(resource) {
  return app.isPackaged
    ? path.join(process.resourcesPath, resource)
    : path.join(__dirname, '../../', resource);
}

async function checkDependencies() {
  // Set yt-dlp to local binary path
  dependencyStatus.ytDlpPath = getResourcePath('assets/bin/yt-dlp.exe');
  
  // FFmpeg and FFprobe paths are already set from npm packages

  if (!fs.existsSync(dependencyStatus.ytDlpPath)) {
    dependencyStatus.ytDlpAvailable = false;
    dependencyStatus.errorMessages.push(`yt-dlp not found at ${dependencyStatus.ytDlpPath}`);
  }
  
  if (!fs.existsSync(dependencyStatus.ffmpegPath)) {
    dependencyStatus.ffmpegAvailable = false;
    dependencyStatus.errorMessages.push(`FFmpeg not found at ${dependencyStatus.ffmpegPath}`);
  }
  
  if (!fs.existsSync(dependencyStatus.ffprobePath)) {
    dependencyStatus.ffprobeAvailable = false;
    dependencyStatus.errorMessages.push(`ffprobe not found at ${dependencyStatus.ffprobePath}`);
  }

  return dependencyStatus;
}

module.exports = { checkDependencies, dependencyStatus };