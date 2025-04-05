const { ipcMain, dialog, shell } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { checkDependencies, dependencyStatus } = require('./dependencyChecker');
const { logToFile } = require('./logger');
const { getDownloadLocation, saveDownloadLocation } = require('./settingsManager');

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
  try {
    const { start, end, clipId } = clip;
    
    // Safety check for invalid parameters
    if (!sourceFile || !fs.existsSync(sourceFile)) {
      logError(mainWindow, `Source file not found for clip ${clipId}: ${sourceFile}`);
      return null;
    }
    
    if (!downloadLocation) {
      downloadLocation = path.join(require('os').homedir(), 'Downloads');
      logMessage(mainWindow, `Using fallback download location: ${downloadLocation}`);
    }
    
    // Ensure download directory exists
    try {
      fs.mkdirSync(downloadLocation, { recursive: true });
    } catch (mkdirError) {
      logError(mainWindow, `Failed to ensure download directory exists: ${mkdirError.message}`);
      return null;
    }
    
    // Use the sessionId (random number) prefix with the clip number
    const outputFileName = `${sessionId}_clip ${clipId}.mp4`;
    let outputFile = path.join(downloadLocation, outputFileName);
  
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
    // Add process timeout protection
    let ffmpegTimeout;
    let isProcessCompleted = false;
    
    logMessage(mainWindow, `Starting ffmpeg trim process for clip ${clipId} [${start} to ${end}]`);
    
    const ffmpegTrim = spawn(status.ffmpegPath, ffmpegArgs, { shell: false });
    ffmpegTrim.stdout.on('data', (data) => logMessage(mainWindow, `ffmpeg stdout: ${data.toString().trim()}`));
    
    // Track last output time to detect hanging
    let lastOutputTime = Date.now();
    
    ffmpegTrim.stderr.on('data', (data) => {
      // Update last output time
      lastOutputTime = Date.now();
      
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
    
    // Handle process error
    ffmpegTrim.on('error', (err) => {
      logError(mainWindow, `ffmpeg process error: ${err.message}`);
      clearTimeout(ffmpegTimeout);
      if (!isProcessCompleted) {
        isProcessCompleted = true;
        // Kill the process just to be sure
        try { ffmpegTrim.kill('SIGKILL'); } catch (e) {}
      }
    });

    // Set up progress checking timer to detect hanging
    const progressTimer = setInterval(() => {
      const now = Date.now();
      // If no output for more than 60 seconds, consider it hung
      if (now - lastOutputTime > 60000) {
        logError(mainWindow, `ffmpeg process appears to be hanging (no output for 60s) - killing`);
        clearInterval(progressTimer);
        try { ffmpegTrim.kill('SIGKILL'); } catch (e) {}
      }
    }, 10000);

    try {
      await new Promise((resolve, reject) => {
        // Set a timeout in case the process hangs
        ffmpegTimeout = setTimeout(() => {
          if (!isProcessCompleted) {
            isProcessCompleted = true;
            logError(mainWindow, `ffmpeg process timed out after 5 minutes`);
            try { ffmpegTrim.kill('SIGKILL'); } catch (e) {}
            resolve(false);
          }
        }, 300000); // 5 minute timeout
        
        ffmpegTrim.on('close', (code) => {
          clearTimeout(ffmpegTimeout);
          clearInterval(progressTimer);
          isProcessCompleted = true;
          
          if (code !== 0 || !fs.existsSync(trimmedTempFile)) {
            logError(mainWindow, `Trimming failed for clip ${clipId} with code ${code}`);
            resolve(false);
          } else {
            logMessage(mainWindow, `Trimming process completed successfully for clip ${clipId}`);
            resolve(true);
          }
        });
      });
    } catch (ffmpegError) {
      logError(mainWindow, `Exception during ffmpeg execution: ${ffmpegError.message}`);
      clearTimeout(ffmpegTimeout);
      clearInterval(progressTimer);
      try { ffmpegTrim.kill('SIGKILL'); } catch (e) {}
    }
    if (!fs.existsSync(trimmedTempFile)) return null;

    const trimmedDuration = await getVideoDuration(mainWindow, status.ffprobePath, trimmedTempFile);
    logMessage(mainWindow, `Trimmed clip ${clipId} duration: ${trimmedDuration} seconds`);
    logMessage(mainWindow, `[TRIMMED_DURATION]${trimmedDuration}`);
    
    try {
      // Use fs.copyFileSync instead of renameSync (more reliable across volumes in Windows)
      fs.copyFileSync(trimmedTempFile, outputFile);
      
      // Only delete source after successful copy
      try {
        fs.unlinkSync(trimmedTempFile);
      } catch (unlinkError) {
        logMessage(mainWindow, `Warning: Could not delete temp trimmed file (will be cleaned up later): ${unlinkError.message}`);
        // Don't throw - continue even if temp file deletion fails
      }
      
      logMessage(mainWindow, `Trimming completed successfully for clip ${clipId}`);
      finalDuration = trimmedDuration;
    } catch (fileOpError) {
      logError(mainWindow, `Error finalizing trimmed file: ${fileOpError.message}`);
      
      // Fallback: Try direct usage of trimmed file if copy fails
      if (fs.existsSync(trimmedTempFile)) {
        logMessage(mainWindow, `Using trimmed temp file directly: ${trimmedTempFile}`);
        return { 
          path: trimmedTempFile, 
          duration: finalDuration,
          clipId: clipId
        };
      }
      
      return null;
    }
  } else {
    logMessage(mainWindow, `No trimming needed for clip ${clipId}, copying full video`);
    
    // Make a copy of the file with safer error handling
    try {
      // Use fs.copyFileSync for more reliable copying (especially in Windows packaged apps)
      fs.copyFileSync(sourceFile, outputFile);
      logMessage(mainWindow, `Copied full video for clip ${clipId}`);
    } catch (copyError) {
      logError(mainWindow, `Error copying file: ${copyError.message}`);
      
      // Fallback to stream copying if direct copy fails
      try {
        logMessage(mainWindow, `Attempting stream copy fallback for clip ${clipId}`);
        const readStream = fs.createReadStream(sourceFile);
        const writeStream = fs.createWriteStream(outputFile);
        await new Promise((resolve, reject) => {
          readStream.pipe(writeStream);
          writeStream.on('finish', resolve);
          writeStream.on('error', (err) => {
            logError(mainWindow, `Stream copy error: ${err.message}`);
            reject(err);
          });
        });
      } catch (streamError) {
        logError(mainWindow, `Stream copy also failed: ${streamError.message}`);
        return null;
      }
    }
    
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
      try {
        // Safe file operations with verification
        if (fs.existsSync(outputFile)) {
          fs.unlinkSync(outputFile);
        }
        
        // Use copyFileSync instead of renameSync (more reliable in Windows)
        fs.copyFileSync(tempMetadataFile, outputFile);
        
        // Only delete source after successful copy
        try {
          fs.unlinkSync(tempMetadataFile);
        } catch (unlinkTempError) {
          logMessage(mainWindow, `Warning: Could not delete metadata temp file: ${unlinkTempError.message}`);
          // Continue anyway
        }
        
        logMessage(mainWindow, `Metadata applied successfully to clip ${clipId}`);
      } catch (finalizeError) {
        logError(mainWindow, `Error finalizing with metadata: ${finalizeError.message}`);
        
        // If we failed to apply metadata but the temp file exists, use it directly
        if (fs.existsSync(tempMetadataFile)) {
          logMessage(mainWindow, `Using metadata temp file directly: ${tempMetadataFile}`);
          outputFile = tempMetadataFile; // Update output path to the temp file
        } else {
          logMessage(mainWindow, `Continuing with original file without metadata`);
        }
      }
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
  } catch (error) {
    logError(mainWindow, `Error processing clip ${clip?.clipId || 'unknown'}: ${error.message}`);
    return null;
  }
}

async function invokeYtdlpDownload(mainWindow, options, status) {
  try {
    logMessage(mainWindow, 'Script running');
    
    const { url, downloadLocation, clips } = options;
    const formattedDownloadLocation = downloadLocation || path.join(require('os').homedir(), 'Downloads');
    
    // Generate a 7-digit random number for this download session
    const sessionId = Math.floor(1000000 + Math.random() * 9000000).toString();
    logMessage(mainWindow, `Session ID for this download: ${sessionId}`);
  
    // Use normalized path that will be properly persisted by electron-store
    const normalizedLocation = path.normalize(formattedDownloadLocation);
    
    // Log path for troubleshooting
    logToFile(`Using download location: ${normalizedLocation}`);

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
  
  // Enhanced safe cleanup with fallback for Windows specific issues
  let tempFileCleaned = false;
  
  // First attempt - standard file deletion
  try {
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
        tempFileCleaned = true;
        logMessage(mainWindow, `Temporary file cleaned up`);
      } catch (err) {
        logMessage(mainWindow, `Standard cleanup failed: ${err.message}, trying alternative methods...`);
      }
    } else {
      tempFileCleaned = true; // File doesn't exist, so it's "cleaned"
    }
  } catch (cleanupError) {
    logMessage(mainWindow, `Error checking temp file existence: ${cleanupError.message}`);
  }
  
  // Second attempt - if standard deletion failed, try using the rimraf pattern
  // This is especially helpful for Windows where files might be locked
  if (!tempFileCleaned) {
    try {
      logMessage(mainWindow, `Attempting alternative cleanup for: ${tempFile}`);
      
      // Create a dummy file then delete it - this can sometimes release locks
      // (Windows-specific workaround)
      const dummyPath = `${tempFile}.cleanup`;
      try {
        fs.writeFileSync(dummyPath, '');
        fs.unlinkSync(dummyPath);
      } catch (dummyError) {
        // Ignore errors with the dummy file
      }
      
      // Try deletion again after a short delay
      setTimeout(() => {
        try {
          if (fs.existsSync(tempFile)) {
            fs.unlinkSync(tempFile);
            logMessage(mainWindow, `Delayed cleanup successful`);
          }
        } catch (finalError) {
          logMessage(mainWindow, `Final cleanup attempt failed, file may remain: ${finalError.message}`);
        }
      }, 1000);
    } catch (altCleanupError) {
      logMessage(mainWindow, `Alternative cleanup method failed: ${altCleanupError.message}`);
    }
  }
  
  // Enhanced completion notification that won't break in packaged apps
  // Use setTimeout to ensure we're not in the same event loop as file operations
  // This helps prevent issues with file handles not being fully released
  setTimeout(() => {
    try {
      if (processedFiles.length > 0) {
        // Notify about successful completion with the last processed file
        let lastFile = processedFiles[processedFiles.length - 1];
        
        // Extra validation for last file
        if (!lastFile || typeof lastFile !== 'object') {
          lastFile = { path: "", duration: 0, clipId: 0 };
        }
        
        // Ensure we don't crash by accessing non-existent properties
        const lastFileInfo = {
          filePath: lastFile?.path || "",
          duration: lastFile?.duration || 0,
          totalClips: processedFiles.length
        };
        
        // Send completion notification if mainWindow is still valid
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          try {
            mainWindow.webContents.send('download-complete', lastFileInfo);
            logMessage(mainWindow, `Download complete notification sent`);
          } catch (ipcError) {
            logToFile(`Error sending download-complete via IPC: ${ipcError.message}`);
          }
        } else {
          logToFile(`Warning: Could not send download-complete, window may be closed`);
        }
      } else {
        logMessage(mainWindow, `No processed files to report completion for`);
      }
    } catch (completionError) {
      logToFile(`Critical error during completion notification: ${completionError.message}`);
    }
  }, 500); // Small delay to ensure file operations are complete
  
    return processedFiles;
  } catch (completionError) {
    logToFile(`Critical error during completion handler: ${completionError.message}`);
    // Still try to send completion notification despite error
    try {
      if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('download-complete', { 
          duration: 0,
          totalClips: 0
        });
      }
    } catch (finalError) {
      logToFile(`Failed to send backup completion notification: ${finalError.message}`);
    }
    
    return null;
  }
}

function setupIpcHandlers(mainWindow) {
  if (!mainWindow) {
    logToFile('Error: mainWindow is undefined in setupIpcHandlers');
    return;
  }
  
  // Set up error handler for window close during operation
  mainWindow.on('closed', () => {
    logToFile('Main window was closed, any pending operations will be terminated');
  });
  ipcMain.handle('select-folder', async () => {
    const defaultPath = getDownloadLocation();
    
    logToFile(`Select folder dialog opened with default path: ${defaultPath}`);
    
    try {
      // Using synchronous version with specific settings
      const result = dialog.showOpenDialogSync({
        title: 'Select Download Location',
        defaultPath: defaultPath,
        buttonLabel: 'Select Folder',
        properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'],
        message: 'Choose where to save downloaded videos'
      });
      
      // If user selected a folder, save it automatically
      if (result && result[0]) {
        const selectedPath = result[0];
        logToFile(`User selected folder: ${selectedPath}, saving to settings`);
        
        // Save the selected location to persistent storage
        const saveSuccess = saveDownloadLocation(selectedPath);
        logToFile(`Download location ${saveSuccess ? 'successfully saved' : 'failed to save'}`);
        
        return selectedPath;
      }
      
      logToFile('User cancelled folder selection');
      return null;
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

  ipcMain.handle('get-download-location', () => {
    return getDownloadLocation();
  });

  ipcMain.handle('save-download-location', (event, location) => {
    logToFile(`Explicit save download location request for: ${location}`);
    const result = saveDownloadLocation(location);
    logToFile(`Explicit save result: ${result ? 'success' : 'failed'}`);
    return result;
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
      
      try {
        await invokeYtdlpDownload(mainWindow, options, status);
      } catch (downloadError) {
        const errorMsg = `Error in download process: ${downloadError.message}`;
        logError(mainWindow, errorMsg);
        logToFile(errorMsg);
        
        // Attempt to send error notification to renderer
        try {
          if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('download-update', `[ERROR] Download failed: ${downloadError.message}`);
          }
        } catch (notifyError) {
          logToFile(`Failed to notify renderer of download error: ${notifyError.message}`);
        }
      }
    } catch (error) {
      const errorMsg = `Error initializing download: ${error.message}`;
      logError(mainWindow, errorMsg);
      logToFile(errorMsg);
      
      // Try to notify renderer even if main process errors out
      try {
        if (mainWindow && mainWindow.webContents && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('download-update', `[ERROR] ${errorMsg}`);
        }
      } catch (notifyError) {
        logToFile(`Failed to notify renderer of initialization error: ${notifyError.message}`);
      }
    }
  });
}

module.exports = { setupIpcHandlers };