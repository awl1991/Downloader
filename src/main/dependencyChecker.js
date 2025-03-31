const path = require('path');
const { app } = require('electron');
const fs = require('fs');

let dependencyStatus = {
  ytDlpAvailable: true,
  ffmpegAvailable: true,
  ffprobeAvailable: true,
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

async function checkDependencies() {
  dependencyStatus.ytDlpPath = getResourcePath('assets/bin/yt-dlp.exe');
  dependencyStatus.ffmpegPath = getResourcePath('assets/bin/ffmpeg.exe');
  dependencyStatus.ffprobePath = getResourcePath('assets/bin/ffprobe.exe');

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