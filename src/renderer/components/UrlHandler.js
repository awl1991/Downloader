// Handles URL input and fetches video duration/title
import Utils from '../utils/utils.js';

export default class UrlHandler {
  constructor(app) {
    this.app = app;
  }

  async handleUrlClick(urlInput) {
    if (!urlInput.value.trim() && navigator.clipboard?.readText) {
      const text = await navigator.clipboard.readText();
      if (text.match(/^https?:\/\//i)) {
        urlInput.value = text.trim();
        urlInput.dispatchEvent(new Event('blur'));
      }
    }
  }

  async handleUrlChange(url) {
    if (!url.match(/^https?:\/\/[^\s/$.?#].[^\s]*$/)) {
      this.app.logger.logOutput('Please enter a valid URL (e.g., https://www.youtube.com/watch?v=...)', 'text-red-500');
      return;
    }
    if (url && url !== this.app.state.videoUrl) {
      this.app.state.videoUrl = url;
      await this.fetchVideoDuration(url);
    }
  }

  async fetchVideoDuration(url) {
    const elements = this.getDurationElements();
    this.prepareDurationDisplay(elements);
    try {
      this.app.logger.logOutput(`Fetching video duration for: ${url}`);
      const [duration, title] = await this.fetchVideoInfo(url);
      this.processVideoInfo(elements, duration, title);
    } catch (error) {
      this.handleDurationError(elements, error);
    }
  }

  getDurationElements() {
    return {
      info: document.getElementById('durationInfo'),
      loading: document.getElementById('durationLoading'),
      duration: document.getElementById('videoDuration'),
      videoName: document.getElementById('videoName'),
      container: document.getElementById('timeRangeContainer')
    };
  }

  prepareDurationDisplay(elements) {
    elements.info.classList.remove('hidden');
    elements.loading.classList.remove('hidden');
    elements.duration.textContent = 'Loading...';
    elements.videoName.textContent = 'Loading...';
    elements.container.style.pointerEvents = 'none';
  }

  async fetchVideoInfo(url) {
    const durationPromise = window.electronAPI.fetchVideoDuration(url).catch(err => {
      console.error("Error fetching duration:", err);
      return 0;
    });
    const titlePromise = window.electronAPI.getVideoTitle(url).catch(err => {
      console.error("Error fetching title:", err);
      return null;
    });
    return Promise.all([durationPromise, titlePromise]);
  }

  processVideoInfo(elements, duration, title) {
    this.app.state.videoDurationSeconds = duration;
    const formattedDuration = Utils.formatTimeFromSeconds(duration);
    elements.duration.textContent = formattedDuration;
    this.updateVideoTitle(elements, title);
    this.app.clipManager.updateClipsDuration();
    this.updateSliderAndUI(elements, formattedDuration);
  }

  updateVideoTitle(elements, title) {
    if (title) {
      this.app.videoTitle = title;
      const decodedTitle = this.decodeHTMLEntities(title);
      elements.videoName.textContent = this.truncateTitle(decodedTitle);
    } else {
      elements.videoName.textContent = 'Unknown.mp4';
    }
  }

  decodeHTMLEntities(text) {
    const textArea = document.createElement('textarea');
    textArea.innerHTML = text;
    return textArea.value;
  }

  truncateTitle(title) {
    const words = title.split(' ');
    return words.length > 8 ? words.slice(0, 8).join(' ') : title;
  }

  updateSliderAndUI(elements, formattedDuration) {
    this.app.slider.setupTickMarks(this.app.state.videoDurationSeconds);
    document.getElementById('end').value = formattedDuration;
    this.app.slider.setupMultiClips(this.app.state.clips, this.app.state.activeClipId);
    this.app.clipManager.updateClipSelectionUI();
    elements.container.style.pointerEvents = 'auto';
    elements.loading.classList.add('hidden');
    this.app.logger.logOutput(`Video duration: ${formattedDuration}`);
  }

  handleDurationError(elements, error) {
    elements.duration.textContent = 'Error';
    elements.loading.classList.add('hidden');
    this.app.logger.logOutput(`Failed to fetch video duration: ${error.message}`, 'text-red-500');
  }
}