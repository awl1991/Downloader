const { ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkDependencies, dependencyStatus } = require('./dependencyChecker');
const { logToFile } = require('./logger');

function getResourcePath(resource) {
  const app = require('electron').app;
  return app.isPackaged
    ? path.join(process.resourcesPath, resource)
    : path.join(__dirname, '../../', resource);
}

// Send a log message to the renderer process
function logMessage(mainWindow, message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('download-update', `[YT-DLP] ${message}`);
  }
  logToFile(`[YT-DLP] ${message}`);
}

// Send an error message to the renderer process
function logError(mainWindow, message) {
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('download-update', `[ERROR] ${message}`);
  }
  logToFile(`[ERROR] ${message}`);
  return false;
}

async function getVideoDuration(mainWindow, ffprobePath, filePath) {
  if (!fs.existsSync(filePath)) {
    logMessage(mainWindow, `Warning: File not found: ${filePath}`);
    return 0;
  }

  return new Promise((resolve) => {
    const ffprobe = spawn(ffprobePath, [
      '-v', 'warning',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ], { shell: false });

    let duration = 0;
    ffprobe.stdout.on('data', (data) => {
      duration = parseFloat(data.toString().trim()) || 600; // Default 10 minutes
    });
    ffprobe.stderr.on('data', (data) => logMessage(mainWindow, `ffprobe error: ${data.toString()}`));
    ffprobe.on('close', (code) => {
      if (code === 0) {
        logMessage(mainWindow, `Successfully detected video duration: ${duration} seconds`);
        resolve(duration);
      } else {
        logMessage(mainWindow, `Error in duration detection: ffprobe failed`);
        resolve(600); // Default
      }
    });
  });
}

async function fetchDuration(mainWindow, ytDlpPath, url) {
  logMessage(mainWindow, `Starting to fetch duration using yt-dlp at: ${ytDlpPath}`);
  logToFile(`Attempting to use yt-dlp at: ${ytDlpPath}`);
  
  // Check if the ytDlpPath exists
  if (!fs.existsSync(ytDlpPath)) {
    const errorMsg = `yt-dlp executable not found at path: ${ytDlpPath}`;
    logError(mainWindow, errorMsg);
    logToFile(errorMsg);
    return Promise.reject(new Error(errorMsg));
  }
  
  logToFile(`yt-dlp executable found at: ${ytDlpPath}`);
  
  return new Promise((resolve, reject) => {
    logMessage(mainWindow, `Spawning yt-dlp process for URL: ${url}`);
    const ytDlp = spawn(ytDlpPath, [
      '--skip-download',
      '--print', 'duration',
      '--extractor-args', 'youtube:player_client=android,web',
      '--no-check-certificate',
      '--geo-bypass',
      '--extractor-retries', '3',
      url
    ], { shell: false });

    let duration = '';
    ytDlp.stdout.on('data', (data) => {
      const output = data.toString().trim();
      logMessage(mainWindow, `yt-dlp stdout: ${output}`);
      duration = output;
    });
    
    ytDlp.stderr.on('data', (data) => {
      const errorOutput = data.toString().trim();
      logError(mainWindow, `yt-dlp stderr: ${errorOutput}`);
    });
    
    ytDlp.on('error', (err) => {
      logError(mainWindow, `yt-dlp spawn error: ${err.message}`);
      reject(new Error(`Failed to spawn yt-dlp process: ${err.message}`));
    });
    
    ytDlp.on('close', (code) => {
      logMessage(mainWindow, `yt-dlp process exited with code: ${code}`);
      
      if (code === 0 && !isNaN(parseFloat(duration))) {
        const dur = parseFloat(duration);
        logMessage(mainWindow, `Successfully fetched duration: ${dur} seconds`);
        resolve(dur);
      } else {
        const errorMessage = `Duration fetch failed with exit code ${code}. Duration value: "${duration}"`;
        logError(mainWindow, errorMessage);
        reject(new Error(errorMessage));
      }
    });
  });
}

async function invokeYtdlpDownload(mainWindow, { url, start, end, downloadLocation }, status) {
  logMessage(mainWindow, 'Script running');
  downloadLocation = downloadLocation || path.join(require('os').homedir(), 'Downloads');
  downloadLocation = downloadLocation.replace(/\\/g, '/');

  if (!status.ytDlpAvailable || !status.ffmpegAvailable || !status.ffprobeAvailable) {
    logError(mainWindow, 'Dependencies missing');
    return null;
  }

  fs.mkdirSync(downloadLocation, { recursive: true });
  if (!fs.existsSync(downloadLocation)) {
    logError(mainWindow, 'Failed to create download directory');
    return null;
  }
  logMessage(mainWindow, `Download location: ${downloadLocation}`);

  logMessage(mainWindow, 'Fetching metadata');
  let title = `video_${new Date().toISOString().replace(/[-:T]/g, '').split('.')[0]}`;
  try {
    const ytDlpMeta = spawn(status.ytDlpPath, ['--get-title', '--get-description', url], { shell: false });
    let output = '';
    ytDlpMeta.stdout.on('data', (data) => output += data.toString());
    ytDlpMeta.stderr.on('data', (data) => logMessage(mainWindow, `Metadata fetch error: ${data.toString()}`));
    await new Promise(resolve => ytDlpMeta.on('close', resolve));
    const lines = output.trim().split('\n');
    const possibleTitle = lines[0]?.trim();
    if (possibleTitle && !/^(WARNING|ERROR|nsig extraction failed)/i.test(possibleTitle)) {
      title = possibleTitle;
      logMessage(mainWindow, `Got title: ${title}`);
      if (/x\.com|twitter\.com/i.test(url)) {
        title = title.replace(/^[^-]+\s*-\s*/, '');
        logMessage(mainWindow, 'Cleaning X title');
      }
    }
  } catch (e) {
    logMessage(mainWindow, `Error during metadata fetch: ${e.message}`);
  }

  const cleanTitle = title.replace(/[<>:\"/\\|?*]/g, '').trim() || `video_${new Date().toISOString().replace(/[-:T]/g, '').split('.')[0]}`;
  logMessage(mainWindow, `Using title for file: ${cleanTitle}`);

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const tempFile = path.join(downloadLocation, `${cleanTitle}_temp.mp4`);
  const outputFile = path.join(downloadLocation, `${cleanTitle}_${timestamp}.mp4`);

  logMessage(mainWindow, 'Downloading video');
  const ytdlpArgs = [
    '-f', '[height<=1080][ext=mp4]/bestvideo[height<=1080][ext=mp4]+bestaudio/best[height<=1080][ext=mp4]/best[ext=mp4]', // 1080p or lower
    '--merge-output-format', 'mp4', // Ensure MP4 output
    '--no-mtime', // Don’t set modification time
    '--no-check-certificate', // Skip SSL verification
    '--geo-bypass', // Bypass geo-restrictions
    '--ignore-errors', // Continue on errors
    '--force-overwrites', // Overwrite existing files
    '--retry-sleep', '5', // Wait 5 seconds between retries
    '--extractor-args', 'youtube:player_client=android,web', // Extractor settings
    '--extractor-retries', '3', // Retry extraction 3 times
    '-o', tempFile, // Output file path
    url // The Rumble URL
  ];
  const ytDlp = spawn(status.ytDlpPath, ytdlpArgs, { shell: false });
  ytDlp.stdout.on('data', (data) => logMessage(mainWindow, `yt-dlp: ${data.toString().trim()}`));
  ytDlp.stderr.on('data', (data) => {
    const output = data.toString().trim();
    if (output.includes('ERROR') || output.includes('error') || output.includes('Failed') || output.includes('failed')) {
      logError(mainWindow, output);
    } else {
      // Don't log standard ffmpeg/ytdlp output that goes to stderr
    }
  });
  await new Promise((resolve) => ytDlp.on('close', (code) => {
    if (code !== 0 || !fs.existsSync(tempFile)) {
      logError(mainWindow, 'Download failed after retries');
      resolve(false);
    } else {
      logMessage(mainWindow, 'Download completed successfully');
      resolve(true);
    }
  }));
  if (!fs.existsSync(tempFile)) return null;

  let finalDuration;
  if (start && end) {
    logMessage(mainWindow, `Trimming video from ${start} to ${end}`);
    const timePattern = /^([0-9]{2}:)?[0-5][0-9]:[0-5][0-9]$/;
    if (!timePattern.test(start) || !timePattern.test(end)) {
      logError(mainWindow, 'Invalid timestamp format. Use HH:MM:SS or MM:SS');
      return null;
    }

    const startTime = start.split(':').reverse().reduce((acc, val, i) => acc + parseInt(val) * Math.pow(60, i), 0);
    let endTime = end.split(':').reverse().reduce((acc, val, i) => acc + parseInt(val) * Math.pow(60, i), 0);
    if (endTime <= startTime) {
      endTime = startTime + 30;
      logMessage(mainWindow, 'Warning: End time adjusted to be after start time');
    }
    const duration = endTime - startTime;

    const trimmedTempFile = path.join(downloadLocation, `trimmed_${cleanTitle}_${timestamp}.mp4`);
    const ffmpegArgs = [
      '-i', tempFile,
      '-ss', start,
      '-t', duration.toString(),
      '-c:v', 'libx264',
      '-c:a', 'aac',
      '-preset', 'fast',
      '-y',
      trimmedTempFile
    ];
    const ffmpegTrim = spawn(status.ffmpegPath, ffmpegArgs, { shell: false });
    ffmpegTrim.stdout.on('data', (data) => logMessage(mainWindow, `ffmpeg: ${data.toString().trim()}`));
    ffmpegTrim.stderr.on('data', (data) => {
      const output = data.toString().trim();
      // Only log actual errors, not verbose output
      if (output.includes('Error') || output.includes('ERROR') || output.includes('failed') || output.includes('Failed') || output.includes('Invalid')) {
        logError(mainWindow, output);
      } else if (output.includes('frame=') && output.includes('time=')) {
        // Log progress information but in a friendly way
        const timeMatch = output.match(/time=(\d+):(\d+):(\d+\.\d+)/);
        if (timeMatch) {
          const hours = parseInt(timeMatch[1]);
          const minutes = parseInt(timeMatch[2]);
          const seconds = parseFloat(timeMatch[3]);
          const elapsed = hours * 3600 + minutes * 60 + seconds;
          const total = mainWindow.webContents ? mainWindow.webContents.duration || 0 : 0;
          const percent = Math.min(100, (elapsed / (total || 1)) * 100);
          logMessage(mainWindow, `Trimming: ${Math.round(percent)}% complete`);
        }
      }
    });
    await new Promise((resolve) => ffmpegTrim.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(trimmedTempFile)) {
        logError(mainWindow, 'Trimming failed');
        resolve(false);
      } else {
        resolve(true);
      }
    }));
    if (!fs.existsSync(trimmedTempFile)) return null;

    const trimmedDuration = await getVideoDuration(mainWindow, status.ffprobePath, trimmedTempFile);
    logMessage(mainWindow, `Trimmed video duration: ${trimmedDuration} seconds`);
    logMessage(mainWindow, `[TRIMMED_DURATION]${trimmedDuration}`);
    fs.unlinkSync(tempFile);
    fs.renameSync(trimmedTempFile, outputFile);
    logMessage(mainWindow, 'Trimming completed successfully');
    finalDuration = trimmedDuration;
  } else {
    logMessage(mainWindow, 'No trimming needed, moving file to final location');
    fs.renameSync(tempFile, outputFile);
    finalDuration = await getVideoDuration(mainWindow, status.ffprobePath, outputFile);
    logMessage(mainWindow, `Video duration: ${finalDuration} seconds`);
    logMessage(mainWindow, `[TRIMMED_DURATION]${finalDuration}`);
  }

  logMessage(mainWindow, 'Applying basic metadata to video');
  const tempMetadataFile = path.join(downloadLocation, `temp_metadata_${timestamp}.mp4`);
  const ffmpegMetadataArgs = [
    '-i', outputFile,
    '-metadata', `title=${title}`,
    '-c:v', 'copy',
    '-c:a', 'copy',
    '-y',
    tempMetadataFile
  ];
  const ffmpegMeta = spawn(status.ffmpegPath, ffmpegMetadataArgs, { shell: false });
  ffmpegMeta.stdout.on('data', (data) => logMessage(mainWindow, `ffmpeg: ${data.toString().trim()}`));
  ffmpegMeta.stderr.on('data', (data) => {
    const output = data.toString().trim();
    // Only log actual errors, not standard output
    if (output.includes('Error') || output.includes('ERROR') || output.includes('failed') || output.includes('Failed') || output.includes('Invalid')) {
      logError(mainWindow, output);
    }
  });
  await new Promise((resolve) => ffmpegMeta.on('close', (code) => {
    if (code !== 0) {
      logMessage(mainWindow, 'Warning: Metadata application failed, continuing with original file');
      resolve(false);
    } else {
      fs.unlinkSync(outputFile);
      fs.renameSync(tempMetadataFile, outputFile);
      logMessage(mainWindow, 'Metadata applied successfully');
      resolve(true);
    }
  }));

  logMessage(mainWindow, `Final video duration: ${finalDuration} seconds`);
  logMessage(mainWindow, `Download finished: ${outputFile}`);
  mainWindow.webContents.send('download-complete', { filePath: outputFile, duration: finalDuration });
  return outputFile;
}

function setupIpcHandlers(mainWindow) {
  if (!mainWindow) {
    logToFile('Error: mainWindow is undefined in setupIpcHandlers');
    return;
  }
  ipcMain.handle('select-folder', async () => {
    const defaultPath = path.join(require('os').homedir(), 'Downloads');
    
    // In a real production app, you'd implement a robust custom folder selector
    // For now, let's use Electron's dialog but with a synchronous and no-parent version
    // that avoids creating the transparent window
    try {
      // Using synchronous version with specific settings to avoid the flash
      const result = dialog.showOpenDialogSync({
        title: 'Select Download Location',
        defaultPath: defaultPath,
        buttonLabel: 'Select Folder',
        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
        message: 'Choose where to save downloaded videos'
      });
      
      return result ? result[0] : null;
    } catch (error) {
      logToFile(`Error selecting folder: ${error.message}`);
      return null;
    }
  });

  ipcMain.on('window-control', (event, action) => {
    const window = require('electron').BrowserWindow.fromWebContents(event.sender);
    if (!window) return;
    switch (action) {
      case 'close': window.close(); break;
      case 'minimize': window.minimize(); break;
      case 'toggleFullScreen': window.setFullScreen(!window.isFullScreen()); break;
    }
  });

  ipcMain.handle('get-dependency-status', () => dependencyStatus);

  ipcMain.handle('open-external-link', async (event, url) => {
    if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  ipcMain.handle('fetch-video-duration', async (event, url) => {
    try {
      const status = await checkDependencies();
      const ytDlpPath = path.resolve(getResourcePath('assets/bin/yt-dlp.exe'));
      
      logMessage(mainWindow, `Dependency check for duration fetch: yt-dlp=${status.ytDlpAvailable}, path=${ytDlpPath}`);
      logToFile(`Fetching duration with yt-dlp at: ${ytDlpPath} for URL: ${url}`);
      
      if (!status.ytDlpAvailable) {
        const errorMsg = 'yt-dlp unavailable';
        logError(mainWindow, errorMsg);
        logToFile(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Always use absolute path to yt-dlp
      return await fetchDuration(mainWindow, ytDlpPath, url);
    } catch (error) {
      const errorMsg = `Error in fetch-video-duration handler: ${error.message}`;
      logError(mainWindow, errorMsg);
      logToFile(errorMsg);
      throw error;
    }
  });

  ipcMain.on('download-video', async (event, options) => {
    try {
      const status = await checkDependencies();
      
      // Override the paths with absolute paths
      status.ytDlpPath = path.resolve(getResourcePath('assets/bin/yt-dlp.exe'));
      status.ffmpegPath = path.resolve(getResourcePath('assets/bin/ffmpeg.exe'));
      status.ffprobePath = path.resolve(getResourcePath('assets/bin/ffprobe.exe'));
      
      logToFile(`Download video with binaries: yt-dlp=${status.ytDlpPath}, ffmpeg=${status.ffmpegPath}, ffprobe=${status.ffprobePath}`);
      
      await invokeYtdlpDownload(mainWindow, options, status);
    } catch (error) {
      const errorMsg = `Error downloading video: ${error.message}`;
      logError(mainWindow, errorMsg);
      logToFile(errorMsg);
    }
  });
}

module.exports = { setupIpcHandlers };