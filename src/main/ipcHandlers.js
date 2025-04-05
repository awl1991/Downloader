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
    mainWindow.webContents.send('download-update', `[OUTPUT] ${message}`);
  }
  logToFile(`[OUTPUT] ${message}`);
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
  // logMessage(mainWindow, `Starting to fetch duration using yt-dlp at: ${ytDlpPath}`);
  // logToFile(`Attempting to use yt-dlp at: ${ytDlpPath}`);
  
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
      '--progress',
      url
    ], { shell: false });

    let duration = '';
    ytDlp.stdout.on('data', (data) => {
      const output = data.toString().trim();
      logMessage(mainWindow, `→ stdout: ${output}`);
      duration = output;
    });
    
    ytDlp.stderr.on('data', (data) => {
      const errorOutput = data.toString().trim();
      logError(mainWindow, `→ stderr: ${errorOutput}`);
    });
    
    ytDlp.on('error', (err) => {
      logError(mainWindow, `→ spawn error: ${err.message}`);
      reject(new Error(`Failed to spawn yt-dlp process: ${err.message}`));
    });
    
    ytDlp.on('close', (code) => {
      logMessage(mainWindow, `→ process exited with code: ${code}`);
      
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

async function processClip(mainWindow, status, sourceFile, downloadLocation, baseTitle, timestamp, clip, sessionId) {
  const { start, end, clipId } = clip;
  
  // Use the sessionId (random number) prefix with the clip number
  const outputFileName = `${sessionId}_clip ${clipId}.mp4`;
  const outputFile = path.join(downloadLocation, outputFileName);
  
  let finalDuration;
  
  if (start && end) {
    logMessage(mainWindow, `Trimming clip ${clipId} from ${start} to ${end}`);
    const timePattern = /^([0-9]{2}:)?[0-5][0-9]:[0-5][0-9]$/;
    if (!timePattern.test(start) || !timePattern.test(end)) {
      logError(mainWindow, `Invalid timestamp format for clip ${clipId}. Use HH:MM:SS or MM:SS`);
      return null;
    }

    const startTime = start.split(':').reverse().reduce((acc, val, i) => acc + parseInt(val) * Math.pow(60, i), 0);
    let endTime = end.split(':').reverse().reduce((acc, val, i) => acc + parseInt(val) * Math.pow(60, i), 0);
    if (endTime <= startTime) {
      endTime = startTime + 30;
      logMessage(mainWindow, `Warning: End time adjusted to be after start time for clip ${clipId}`);
    }
    const duration = endTime - startTime;

    const trimmedTempFile = path.join(downloadLocation, `trimmed_${baseTitle}_clip${clipId}_${timestamp}.mp4`);
    const ffmpegArgs = [
      '-i', sourceFile,
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
          logMessage(mainWindow, `Trimming clip ${clipId}: ${Math.round(percent)}% complete`);
        }
      }
    });
    await new Promise((resolve) => ffmpegTrim.on('close', (code) => {
      if (code !== 0 || !fs.existsSync(trimmedTempFile)) {
        logError(mainWindow, `Trimming failed for clip ${clipId}`);
        resolve(false);
      } else {
        resolve(true);
      }
    }));
    if (!fs.existsSync(trimmedTempFile)) return null;

    const trimmedDuration = await getVideoDuration(mainWindow, status.ffprobePath, trimmedTempFile);
    logMessage(mainWindow, `Trimmed clip ${clipId} duration: ${trimmedDuration} seconds`);
    logMessage(mainWindow, `[TRIMMED_DURATION]${trimmedDuration}`);
    
    fs.renameSync(trimmedTempFile, outputFile);
    logMessage(mainWindow, `Trimming completed successfully for clip ${clipId}`);
    finalDuration = trimmedDuration;
  } else {
    logMessage(mainWindow, `No trimming needed for clip ${clipId}, copying full video`);
    
    // Make a copy of the file
    const readStream = fs.createReadStream(sourceFile);
    const writeStream = fs.createWriteStream(outputFile);
    await new Promise((resolve, reject) => {
      readStream.pipe(writeStream);
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    finalDuration = await getVideoDuration(mainWindow, status.ffprobePath, outputFile);
    logMessage(mainWindow, `Full video duration for clip ${clipId}: ${finalDuration} seconds`);
    logMessage(mainWindow, `[TRIMMED_DURATION]${finalDuration}`);
  }

  logMessage(mainWindow, `Applying basic metadata to clip ${clipId}`);
  
  // Add clip information to the title metadata
  const clipTitle = `clip ${clipId}`;
  
  const tempMetadataFile = path.join(downloadLocation, `temp_metadata_clip${clipId}_${timestamp}.mp4`);
  const ffmpegMetadataArgs = [
    '-i', outputFile,
    '-metadata', `title=${clipTitle}`,
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
      logMessage(mainWindow, `Warning: Metadata application failed for clip ${clipId}, continuing with original file`);
      resolve(false);
    } else {
      fs.unlinkSync(outputFile);
      fs.renameSync(tempMetadataFile, outputFile);
      logMessage(mainWindow, `Metadata applied successfully to clip ${clipId}`);
      resolve(true);
    }
  }));

  logMessage(mainWindow, `Final clip ${clipId} duration: ${finalDuration} seconds`);
  logMessage(mainWindow, `Clip ${clipId} finished: ${outputFile}`);
  
  return { 
    path: outputFile, 
    duration: finalDuration,
    clipId: clipId
  };
}

async function invokeYtdlpDownload(mainWindow, options, status) {
  logMessage(mainWindow, 'Script running');
  
  const { url, downloadLocation, clips } = options;
  const formattedDownloadLocation = downloadLocation || path.join(require('os').homedir(), 'Downloads');
  
  // Generate a 7-digit random number for this download session
  const sessionId = Math.floor(1000000 + Math.random() * 9000000).toString();
  logMessage(mainWindow, `Session ID for this download: ${sessionId}`);
  
  // Normalize path separators
  const normalizedLocation = formattedDownloadLocation.replace(/\\/g, '/');

  if (!status.ytDlpAvailable || !status.ffmpegAvailable || !status.ffprobeAvailable) {
    logError(mainWindow, 'Dependencies missing');
    return null;
  }

  fs.mkdirSync(normalizedLocation, { recursive: true });
  if (!fs.existsSync(normalizedLocation)) {
    logError(mainWindow, 'Failed to create download directory');
    return null;
  }
  logMessage(mainWindow, `Download location: ${normalizedLocation}`);

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
  const tempFile = path.join(normalizedLocation, `${cleanTitle}_temp.mp4`);
  
  logMessage(mainWindow, 'Downloading video');
  const ytdlpArgs = [
    '-f', '[height<=1080][ext=mp4]/bestvideo[height<=1080][ext=mp4]+bestaudio/best[height<=1080][ext=mp4]/best[ext=mp4]', // 1080p or lower
    '--merge-output-format', 'mp4', // Ensure MP4 output
    '--no-mtime', // Don't set modification time
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
  ytDlp.stdout.on('data', (data) => logMessage(mainWindow, `⇊ ${data.toString().trim()}`));
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
  
  // Process all clips
  const processedFiles = [];
  
  // If no clips provided, or we have only one simple request, handle as a single clip
  if (!clips || !Array.isArray(clips) || clips.length === 0) {
    // Handle as a single clip if start/end provided directly in options
    const singleClip = {
      start: options.start,
      end: options.end,
      clipId: 1
    };
    
    const outputFile = await processClip(
      mainWindow, 
      status,
      tempFile,
      normalizedLocation,
      cleanTitle,
      timestamp,
      singleClip,
      sessionId
    );
    
    if (outputFile) {
      processedFiles.push(outputFile);
    }
  } else {
    // Process each clip in sequence
    logMessage(mainWindow, `Processing ${clips.length} clips...`);
    
    for (let i = 0; i < clips.length; i++) {
      const clip = clips[i];
      logMessage(mainWindow, `Processing clip ${clip.clipId} of ${clips.length}...`);
      
      const outputFile = await processClip(
        mainWindow, 
        status,
        tempFile,
        normalizedLocation,
        cleanTitle,
        timestamp,
        clip,
        sessionId
      );
      
      if (outputFile) {
        processedFiles.push(outputFile);
      }
    }
  }
  
  // Clean up the temporary download file
  if (fs.existsSync(tempFile)) {
    try {
      fs.unlinkSync(tempFile);
    } catch (err) {
      logMessage(mainWindow, `Warning: Could not delete temp file: ${err.message}`);
    }
  }
  
  if (processedFiles.length > 0) {
    // Notify about successful completion with the last processed file
    const lastFile = processedFiles[processedFiles.length - 1];
    const lastFileInfo = {
      filePath: lastFile.path,
      duration: lastFile.duration,
      totalClips: processedFiles.length
    };
    
    mainWindow.webContents.send('download-complete', lastFileInfo);
    return processedFiles;
  }
  
  return null;
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
      // Use yt-dlp path from dependencyStatus, which is set from yt-dlp-wrap
      
      logMessage(mainWindow, `Dependency check for duration fetch: yt-dlp=${status.ytDlpAvailable}, path=${status.ytDlpPath}`);
      logToFile(`Fetching duration with yt-dlp at: ${status.ytDlpPath} for URL: ${url}`);
      
      if (!status.ytDlpAvailable) {
        const errorMsg = 'yt-dlp unavailable';
        logError(mainWindow, errorMsg);
        logToFile(errorMsg);
        throw new Error(errorMsg);
      }
      
      // Use the path from dependencyStatus which comes from yt-dlp-wrap
      return await fetchDuration(mainWindow, status.ytDlpPath, url);
    } catch (error) {
      const errorMsg = `Error in fetch-video-duration handler: ${error.message}`;
      logError(mainWindow, errorMsg);
      logToFile(errorMsg);
      throw error;
    }
  });
  
  ipcMain.handle('get-video-title', async (event, url) => {
    try {
      const status = await checkDependencies();
      // Use yt-dlp path from dependencyStatus, which is set from yt-dlp-wrap
      
      logMessage(mainWindow, `Fetching video title for: ${url}`);
      
      if (!status.ytDlpAvailable) {
        const errorMsg = 'yt-dlp unavailable for title fetch';
        logError(mainWindow, errorMsg);
        return null;
      }
      
      return new Promise((resolve) => {
        const ytDlpMeta = spawn(status.ytDlpPath, ['--get-title', url], { shell: false });
        let output = '';
        
        ytDlpMeta.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        ytDlpMeta.stderr.on('data', (data) => {
          logMessage(mainWindow, `Title fetch error: ${data.toString()}`);
        });
        
        ytDlpMeta.on('close', (code) => {
          if (code !== 0) {
            logMessage(mainWindow, `Title fetch process exited with code: ${code}`);
            resolve(null);
            return;
          }
          
          const title = output.trim();
          if (!title || /^(WARNING|ERROR|nsig extraction failed)/i.test(title)) {
            resolve(null);
            return;
          }
          
          let processedTitle = title;
          // Clean up Twitter/X titles
          if (/x\.com|twitter\.com/i.test(url)) {
            processedTitle = title.replace(/^[^-]+\s*-\s*/, '');
          }
          
          logMessage(mainWindow, `Got video title: ${processedTitle}`);
          resolve(processedTitle);
        });
      });
    } catch (error) {
      logError(mainWindow, `Error fetching video title: ${error.message}`);
      return null;
    }
  });

  ipcMain.on('download-video', async (event, options) => {
    try {
      const status = await checkDependencies();
      
      // No need to override paths - use the ones from dependencyStatus which come from npm packages
      
      logToFile(`Download video with npm package binaries: yt-dlp=${status.ytDlpPath}, ffmpeg=${status.ffmpegPath}, ffprobe=${status.ffprobePath}`);
      
      // Log the number of clips if provided
      if (options.clips && Array.isArray(options.clips)) {
        logMessage(mainWindow, `Received request to download ${options.clips.length} clips`);
      }
      
      await invokeYtdlpDownload(mainWindow, options, status);
    } catch (error) {
      const errorMsg = `Error downloading video: ${error.message}`;
      logError(mainWindow, errorMsg);
      logToFile(errorMsg);
    }
  });
}

module.exports = { setupIpcHandlers };