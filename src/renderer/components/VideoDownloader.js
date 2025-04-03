import Utils from '../utils/utils.js';
import RangeSlider from './RangeSlider.js';
import ProgressManager from './ProgressManager.js';

class AppState {
  constructor() {
    this.videoDurationSeconds = 0;
    this._videoUrl = '';
    this.currentStage = 'initial';
    this.downloadStartTime = null;
    this.progressRing = null;
  }
}

class VideoDownloader {
  constructor() {
    this.state = new AppState();
    this.slider = new RangeSlider(this.state);
    this.progress = new ProgressManager();
    this.state.progressRing = this.progress;
    this.isFullscreen = false;
    this.init();
    
    // Add default console message
    const output = document.getElementById('output');
    if (output && output.innerHTML === '') {
      output.innerHTML = '<div class="text-gray-500">Console output will appear here.</div>';
    }
  }

  init() {
    this.slider.setupDefault();
    this.bindEvents();
  }

  get videoUrl() { return this.state._videoUrl; }
  set videoUrl(value) { this.state._videoUrl = typeof value === 'string' ? value : String(value); }

  clearForm() {
    const downloadLocation = document.getElementById('downloadLocation').value;
    document.getElementById('url').value = '';
    this.videoUrl = '';
    document.getElementById('videoDuration').textContent = '--:--:--';
    document.getElementById('durationInfo').classList.add('hidden');
    this.slider.setupDefault();
    this.state.videoDurationSeconds = 0;
    document.getElementById('start').value = '';
    document.getElementById('end').value = '';
    document.getElementById('videoDurationDisplay').textContent = '00:00:00';
    document.getElementById('downloadLocation').value = downloadLocation;
    this.switchToInitialState();
    // Reset the download button state
    this.updateButtonState('idle');
    this.logOutput('Form cleared while preserving download location. Ready for new input.', 'text-accent-500');
  }

  switchToInitialState() {
    this.state.currentStage = 'initial';
    document.getElementById('progressState').classList.add('hidden');
    document.getElementById('resultState').classList.add('hidden');
    document.getElementById('initialState').classList.remove('hidden');
  }

  bindEvents() {
    document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.windowControl('close'));
    document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.windowControl('minimize'));
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      this.isFullscreen = !this.isFullscreen;
      this.updateFullscreenIcon();
      window.electronAPI.windowControl('toggleFullScreen');
    });

    this.updateFullscreenIcon = () => {
      const fullscreenIcon = document.getElementById('fullscreenIcon');
      const exitFullscreenIcon = document.getElementById('exitFullscreenIcon');
      fullscreenIcon.classList.toggle('hidden', this.isFullscreen);
      exitFullscreenIcon.classList.toggle('hidden', !this.isFullscreen);
    };

    document.getElementById('clearFormBtn').addEventListener('click', () => this.clearForm());

    document.getElementById('browseButton').addEventListener('click', () => {
      // Use a wrapper to ensure proper window focus before opening dialog
      setTimeout(async () => {
        try {
          const folderPath = await window.electronAPI.selectFolder();
          if (folderPath) {
            const input = document.getElementById('downloadLocation');
            input.value = folderPath;
            input.classList.add('ring-2', 'ring-accent-500');
            setTimeout(() => input.classList.remove('ring-2', 'ring-accent-500'), 1000);
          }
        } catch (error) {
          console.error('Error selecting folder:', error);
        }
      }, 50); // Small delay to ensure window focus
    });

    const urlInput = document.getElementById('url');
    urlInput.addEventListener('click', async () => {
      if (!urlInput.value.trim() && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        if (text.match(/^https?:\/\//i)) {
          urlInput.value = text.trim();
          urlInput.dispatchEvent(new Event('blur'));
        }
      }
    });

    urlInput.addEventListener('paste', () => setTimeout(() => this.handleUrlChange(urlInput.value.trim()), 100));
    urlInput.addEventListener('blur', () => this.handleUrlChange(urlInput.value.trim()));

    document.getElementById('downloadForm').addEventListener('submit', (e) => this.handleSubmit(e));

    window.electronAPI.onDownloadUpdate((update) => this.handleDownloadUpdate(update));
    window.electronAPI.onDownloadComplete((data) => this.handleDownloadComplete(data));

    // Add a simpler toggle logs function
    const toggleLogsBtn = document.getElementById('toggleLogs');
    if (toggleLogsBtn) {
      toggleLogsBtn.addEventListener('click', () => {
        const output = document.getElementById('output');
        
        // Ensure there's some content in the output
        if (!output.innerHTML || output.innerHTML.trim() === '') {
          output.innerHTML = '<div class="text-gray-500">Console output will appear here. Click "Show Console Output" to toggle visibility.</div>';
        }
        
        // Super simple toggle - just flip the current display state
        if (window.getComputedStyle(output).display === 'none' || output.classList.contains('hidden')) {
          // Show
          output.classList.remove('hidden');
          output.style.display = 'block';
          output.style.height = 'auto';
          output.style.minHeight = '200px';
          output.style.maxHeight = '200px';
          this.logOutput('Console output is now visible', 'text-accent-500');
          toggleLogsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" /></svg> Hide Console Output';
        } else {
          // Hide
          output.classList.add('hidden');
          output.style.display = 'none';
          toggleLogsBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg> Show Console Output';
        }
      });
    }
  }

  async handleUrlChange(url) {
    if (!url.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
      this.logOutput('Please enter a valid URL (e.g., https://www.youtube.com/watch?v=...)', 'text-red-500');
      return;
    }
    if (url && url !== this.videoUrl) {
      this.videoUrl = url;
      await this.fetchVideoDuration(url);
    }
  }

  async fetchVideoDuration(url) {
    const elements = {
      info: document.getElementById('durationInfo'),
      loading: document.getElementById('durationLoading'),
      duration: document.getElementById('videoDuration'),
      container: document.getElementById('timeRangeContainer')
    };

    elements.info.classList.remove('hidden');
    elements.loading.classList.remove('hidden');
    elements.duration.textContent = 'Loading...';
    elements.container.style.pointerEvents = 'none';

    try {
      this.logOutput(`Fetching video duration for: ${url}`);
      this.state.videoDurationSeconds = await window.electronAPI.fetchVideoDuration(url);
      elements.duration.textContent = Utils.formatTimeFromSeconds(this.state.videoDurationSeconds);
      this.slider.setupTickMarks(this.state.videoDurationSeconds);
      document.getElementById('end').value = Utils.formatTimeFromSeconds(this.state.videoDurationSeconds);
      elements.container.style.pointerEvents = 'auto';
      elements.loading.classList.add('hidden');
      this.logOutput(`Video duration: ${Utils.formatTimeFromSeconds(this.state.videoDurationSeconds)}`);
    } catch (error) {
      elements.duration.textContent = 'Error';
      elements.loading.classList.add('hidden');
      this.logOutput(`Failed to fetch video duration: ${error.message}`, 'text-red-500');
    }
  }

  // Update download button with loading state
  updateButtonState(state) {
    const button = document.querySelector('#downloadForm button[type="submit"]');
    if (!button) return;

    // SVG icons for different states
    const downloadIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" />
    </svg>`;
    
    const loadingIcon = `<svg class="animate-spin -ml-1 h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>`;
    
    const successIcon = `<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
    </svg>`;

    switch(state) {
      case 'loading':
        button.innerHTML = `${loadingIcon}Downloading...`;
        button.disabled = true;
        // Removed opacity change that was causing blur
        break;
      case 'success':
        button.innerHTML = `${successIcon}Download Complete`;
        button.disabled = false;
        
        // Reset after a delay (keeping only text/icon changes, no color change)
        setTimeout(() => {
          button.innerHTML = `${downloadIcon}Download Video`;
        }, 3000);
        break;
      default: // 'idle'
        button.innerHTML = `${downloadIcon}Download Video`;
        button.disabled = false;
    }
  }

  handleSubmit(e) {
    e.preventDefault();
    
    // Validate URL is present
    let url = document.getElementById('url').value;
    if (!url || !url.trim()) {
      this.logOutput('Please enter a valid URL before downloading', 'text-red-500');
      return;
    }
    
    this.updateButtonState('loading');
    this.switchToProgressState();

    if (typeof url !== 'string') url = String(url);
    const startPercent = parseFloat(this.slider.startHandle.style.left) || 0;
    const endPercent = parseFloat(this.slider.endHandle.style.left) || 100;
    const startSeconds = Math.round((startPercent / 100) * this.state.videoDurationSeconds);
    const endSeconds = Math.round((endPercent / 100) * this.state.videoDurationSeconds);
    const start = Utils.formatTimeFromSeconds(startSeconds);
    const end = Utils.formatTimeFromSeconds(endSeconds);

    document.getElementById('start').value = start;
    document.getElementById('end').value = end;
    const downloadLocation = document.getElementById('downloadLocation').value;

    this.state.downloadStartTime = new Date();
    window.electronAPI.downloadVideo({ url, start, end, downloadLocation });
  }

  handleDownloadUpdate(update) {
    this.logOutput(update, update.includes('[ERROR]') ? 'text-red-500' : update.includes('Download finished') || update.includes('[TRIMMED_DURATION]') ? 'text-accent-500' : '');
    this.updateProgressFromMessage(update);
  }

  handleDownloadComplete(data) {
    const finalDuration = data.duration && typeof data.duration === 'number'
      ? Utils.formatTimeFromSeconds(data.duration)
      : Utils.formatTimeFromSeconds(this.state.videoDurationSeconds || 0);

    document.getElementById('downloadSuccessMessage').textContent = `Video successfully downloaded! (${finalDuration})`;
    document.getElementById('downloadedVideoDuration').textContent = finalDuration;
    document.getElementById('statusText').textContent = `Download complete - Duration: ${finalDuration}`;
    this.progress.setProgress(100);
    this.switchToResultState();
    
    // Update the download button to show success state
    this.updateButtonState('success');
  }

  updateProgressFromMessage(message) {
    const statusTextEl = document.getElementById('statusText');
    let progressPercent = null;
    let statusText = 'Processing...';
    let progressDescription = '';

    const dlMatch = message.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+[\d.]+\w+\s+at\s+[\d.]+\w+\/s\s+ETA\s+[\d:]+/);
    if (dlMatch && dlMatch[1]) {
      const dlPercent = parseFloat(dlMatch[1]);
      progressPercent = 25 + (dlPercent * 0.5);
      statusText = `Downloading: ${dlPercent.toFixed(1)}%`;
      progressDescription = `(${Math.round(progressPercent)}% overall)`;
    } else if (message.includes('frame=') && message.includes('time=')) {
      const timeMatch = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
      if (timeMatch) {
        const hours = parseInt(timeMatch[1]);
        const minutes = parseInt(timeMatch[2]);
        const seconds = parseFloat(timeMatch[3]);
        const elapsed = hours * 3600 + minutes * 60 + seconds;
        const total = this.state.videoDurationSeconds || 600;
        const trimPercent = Math.min(100, (elapsed / total) * 100);
        progressPercent = 75 + (trimPercent * 0.15);
        statusText = `Trimming: ${Math.round(trimPercent)}%`;
        progressDescription = `(${Math.round(progressPercent)}% overall)`;
      }
    } else {
      const statusMapping = {
        'Script running': { text: 'Initializing...', progress: 2 },
        'Checking dependencies': { text: 'Checking dependencies...', progress: 5 },
        'Download location': { text: 'Setting up download location...', progress: 8 },
        'Fetching metadata': { text: 'Fetching video info...', progress: 12 },
        'Got title': { text: 'Retrieved title...', progress: 18 },
        'Cleaning X title': { text: 'Processing title...', progress: 20 },
        'Using title for file': { text: 'Preparing filename...', progress: 22 },
        'Downloading video': { text: 'Starting download...', progress: 25 },
        'Download completed successfully': { text: 'Download finished, preparing...', progress: 75 },
        'Trimming video from': { text: 'Starting trimming...', progress: 80 },
        'Trimming completed successfully': { text: 'Trimming complete...', progress: 90 },
        'Applying basic metadata': { text: 'Applying metadata...', progress: 95 },
        'Metadata applied successfully': { text: 'Metadata applied...', progress: 98 },
        'Final video duration': { text: 'Finalizing...', progress: 100 },
        'Download finished': { text: 'Download complete!', progress: 100 },
        '[ERROR]': { text: 'Error occurred!', progress: -1 }
      };

      for (const [key, value] of Object.entries(statusMapping)) {
        if (message.includes(key)) {
          statusText = value.text;
          if (progressPercent === null && value.progress > 0) progressPercent = value.progress;
          break;
        }
      }
    }

    statusTextEl.innerHTML = statusText;
    let descriptionEl = document.getElementById('progress-description');
    if (!descriptionEl && progressDescription) {
      descriptionEl = document.createElement('span');
      descriptionEl.id = 'progress-description';
      descriptionEl.className = 'progress-description';
      statusTextEl.appendChild(descriptionEl);
    }
    if (descriptionEl && progressDescription) descriptionEl.textContent = ' ' + progressDescription;

    if (progressPercent !== null && progressPercent >= 0) this.progress.setProgress(progressPercent);

    if (message.includes('[TRIMMED_DURATION]')) {
      const durationMatch = message.match(/\[TRIMMED_DURATION\](\d+\.\d+)/);
      if (durationMatch) {
        const seconds = parseFloat(durationMatch[1]);
        statusText = `Download complete - Duration: ${Utils.formatTimeFromSeconds(seconds)}`;
        statusTextEl.innerHTML = statusText;
        if (descriptionEl) descriptionEl.textContent = ' (100% complete)';
        this.progress.setProgress(100);
      }
    }
  }

  switchToProgressState() {
    this.state.currentStage = 'progress';
    document.getElementById('initialState').classList.add('hidden');
    document.getElementById('resultState').classList.add('hidden');
    document.getElementById('progressState').classList.remove('hidden');
    this.progress.setProgress(0);
    document.getElementById('statusText').textContent = 'Initializing...';
    
    // Clear the console but don't hide it if it's already visible
    const output = document.getElementById('output');
    output.innerHTML = '';
  }

  switchToResultState() {
    this.state.currentStage = 'result';
    document.getElementById('initialState').classList.add('hidden');
    document.getElementById('progressState').classList.add('hidden');
    document.getElementById('resultState').classList.remove('hidden');
    this.progress.setProgress(100);
  }

  logOutput(message, className = '') {
    const output = document.getElementById('output');
    
    // If output only contains the placeholder, clear it first
    if (output.childElementCount === 1 && output.children[0].classList.contains('text-gray-500')) {
      output.innerHTML = '';
    }
    
    const div = document.createElement('div');
    div.textContent = message;
    if (className) div.className = className;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
    
    // If the output is hidden, make sure the toggle button is highlighted to draw attention
    if (output.classList.contains('hidden')) {
      const toggleButton = document.getElementById('toggleLogs');
      if (toggleButton) {
        toggleButton.classList.add('animate-pulse');
        setTimeout(() => toggleButton.classList.remove('animate-pulse'), 1000);
      }
    }
  }
}

export default VideoDownloader;