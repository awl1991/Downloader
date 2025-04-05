// Handles download initiation, updates, and completion
import Utils from '../utils/utils.js';

export default class DownloadHandler {
    constructor(app) {
        this.app = app;
    }

    // ... (other methods unchanged)
    handleSubmit(e) {
        e.preventDefault();
        console.log('handleSubmit called');
        const url = document.getElementById('url').value.trim();
        if (!url) {
            this.app.logger.logOutput('Please enter a valid URL before downloading', 'text-red-500');
            console.log('No URL provided');
            return;
        }
        console.log('Starting download for URL:', url);
        this.updateButtonState('loading');
        this.app.stateManager.switchToProgressState();
        this.startDownload(url);
    }

    startDownload(url) {
        const downloadLocation = document.getElementById('downloadLocation').value;
        this.app.state.downloadStartTime = new Date();
        const clipJobs = this.app.state.clips.map(clip => ({
            url,
            start: Utils.formatTimeFromSeconds(clip.startTime),
            end: Utils.formatTimeFromSeconds(clip.endTime),
            downloadLocation,
            clipId: clip.id
        }));
        if (!window.electronAPI || !window.electronAPI.downloadVideo) {
            console.error('Electron API not available');
            this.app.logger.logOutput('Error: Electron API not available', 'text-red-500');
            this.updateButtonState('idle');
            this.app.stateManager.switchToInitialState();
            return;
        }
        console.log('Sending to Electron:', { url, downloadLocation, clips: clipJobs });
        window.electronAPI.downloadVideo({ url, downloadLocation, clips: clipJobs });
        this.app.logger.logOutput(`Processing ${clipJobs.length} clip${clipJobs.length > 1 ? 's' : ''}...`);
    }
    // ...

    handleDownloadUpdate(update) {
        const className = update.includes('[ERROR]') ? 'text-red-500' :
            (update.includes('Download finished') || update.includes('[TRIMMED_DURATION]')) ? 'text-accent-500' : '';
        this.app.logger.logOutput(update, className);
        this.updateProgressFromMessage(update);
    }

    handleDownloadComplete(data) {
        const finalDuration = this.getFinalDuration(data);
        const successMessage = data.totalClips && data.totalClips > 1
            ? `${data.totalClips} clips successfully downloaded! (${finalDuration})`
            : `Video successfully downloaded! (${finalDuration})`;
        this.updateResultUI(successMessage, finalDuration);
        this.updateButtonState('success');
    }

    getFinalDuration(data) {
        return data.duration && typeof data.duration === 'number'
            ? Utils.formatTimeFromSeconds(data.duration)
            : Utils.formatTimeFromSeconds(this.app.state.videoDurationSeconds || 0);
    }

    updateResultUI(successMessage, finalDuration) {
        document.getElementById('downloadSuccessMessage').textContent = successMessage;
        document.getElementById('downloadedVideoDuration').textContent = finalDuration;
        document.getElementById('statusText').textContent = `Download complete - Duration: ${finalDuration}`;
        this.app.progress.setProgress(100);
        this.app.stateManager.switchToResultState();
    }

    updateProgressFromMessage(message) {
        const statusTextEl = document.getElementById('statusText');
        const { progressPercent, statusText, progressDescription } = this.parseProgressMessage(message);
        statusTextEl.innerHTML = statusText;
        this.updateProgressDescription(statusTextEl, progressDescription);
        if (progressPercent !== null && progressPercent >= 0) this.app.progress.setProgress(progressPercent);
        this.handleTrimmedDuration(message, statusTextEl);
    }

    parseProgressMessage(message) {
        let progressPercent = null;
        let statusText = 'Processing...';
        let progressDescription = '';
        const dlMatch = message.match(/\[download\]\s+(\d+(?:\.\d+)?)%\s+of\s+[\d.]+\w+\s+at\s+[\d.]+\w+\/s\s+ETA\s+[\d:]+/);
        if (dlMatch) {
            const dlPercent = parseFloat(dlMatch[1]);
            progressPercent = 25 + (dlPercent * 0.5);
            statusText = `Downloading: ${dlPercent.toFixed(1)}%`;
            progressDescription = `(${Math.round(progressPercent)}% overall)`;
        } else if (message.includes('frame=') && message.includes('time=')) {
            const timeMatch = message.match(/time=(\d+):(\d+):(\d+\.\d+)/);
            if (timeMatch) {
                const elapsed = parseInt(timeMatch[1]) * 3600 + parseInt(timeMatch[2]) * 60 + parseFloat(timeMatch[3]);
                const total = this.app.state.videoDurationSeconds || 600;
                const trimPercent = Math.min(100, (elapsed / total) * 100);
                progressPercent = 75 + (trimPercent * 0.15);
                statusText = `Trimming: ${Math.round(trimPercent)}%`;
                progressDescription = `(${Math.round(progressPercent)}% overall)`;
            }
        } else {
            const statusMapping = this.getStatusMapping();
            for (const [key, value] of Object.entries(statusMapping)) {
                if (message.includes(key)) {
                    statusText = value.text;
                    if (progressPercent === null && value.progress > 0) progressPercent = value.progress;
                    break;
                }
            }
        }
        return { progressPercent, statusText, progressDescription };
    }

    getStatusMapping() {
        return {
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
    }

    updateProgressDescription(statusTextEl, progressDescription) {
        let descriptionEl = document.getElementById('progress-description');
        if (!descriptionEl && progressDescription) {
            descriptionEl = document.createElement('span');
            descriptionEl.id = 'progress-description';
            descriptionEl.className = 'progress-description';
            statusTextEl.appendChild(descriptionEl);
        }
        if (descriptionEl && progressDescription) descriptionEl.textContent = ' ' + progressDescription;
    }

    handleTrimmedDuration(message, statusTextEl) {
        const durationMatch = message.match(/\[TRIMMED_DURATION\](\d+\.\d+)/);
        if (durationMatch) {
            const seconds = parseFloat(durationMatch[1]);
            statusTextEl.innerHTML = `Download complete - Duration: ${Utils.formatTimeFromSeconds(seconds)}`;
            const descriptionEl = document.getElementById('progress-description');
            if (descriptionEl) descriptionEl.textContent = ' (100% complete)';
            this.app.progress.setProgress(100);
        }
    }

    updateButtonState(state) {
        const button = document.querySelector('#downloadForm button[type="submit"]');
        if (!button) return;
        const icons = this.getButtonIcons();
        this.setButtonState(button, state, icons);
    }

    getButtonIcons() {
        return {
            download: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>',
            loading: '<svg class="animate-spin -ml-1 h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>',
            success: '<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" /></svg>'
        };
    }

    setButtonState(button, state, icons) {
        switch (state) {
            case 'loading':
                button.innerHTML = `${icons.loading}Downloading...`;
                button.disabled = true;
                break;
            case 'success':
                button.innerHTML = `${icons.success}Download Complete`;
                button.disabled = false;
                setTimeout(() => button.innerHTML = `${icons.download}Download Video`, 3000);
                break;
            default:
                button.innerHTML = `${icons.download}Download Video`;
                button.disabled = false;
        }
    }
}