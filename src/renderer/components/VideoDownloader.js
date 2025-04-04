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
    this.clips = [{ id: 1, startTime: 0, endTime: 0, color: '#10B981' }];
    this.activeClipId = 1;
  }
}

class VideoDownloader {
  constructor() {
    this.state = new AppState();
    this.slider = new RangeSlider(this.state);
    this.progress = new ProgressManager();
    this.state.progressRing = this.progress;
    this.isFullscreen = false;
    this.initialize();
  }

  initialize() {
    this.slider.setupDefault();
    this.setupEventListeners();
    this.updateClipSelectionUI();
    this.initializeConsoleOutput();
  }

  initializeConsoleOutput() {
    const output = document.getElementById('output');
    if (output && !output.innerHTML) {
      output.innerHTML = '<div class="text-gray-500">Console output will appear here.</div>';
    }
  }

  // Getters and Setters
  get videoUrl() { return this.state._videoUrl; }
  set videoUrl(value) { this.state._videoUrl = typeof value === 'string' ? value : String(value); }

  // Form Management
  clearForm() {
    const downloadLocation = document.getElementById('downloadLocation').value;
    this.resetFormFields(downloadLocation);
    this.resetClips();
    this.resetSlider();
    this.updateUIAfterClear(downloadLocation);
  }

  resetFormFields(downloadLocation) {
    document.getElementById('url').value = '';
    this.videoUrl = '';
    document.getElementById('videoDuration').textContent = '--:--:--';
    document.getElementById('durationInfo').classList.add('hidden');
    this.state.videoDurationSeconds = 0;
    document.getElementById('start').value = '';
    document.getElementById('end').value = '';
    document.getElementById('videoDurationDisplay').textContent = '00:00:00';
    document.getElementById('downloadLocation').value = downloadLocation;
  }

  resetClips() {
    this.state.clips = [{ id: 1, startTime: 0, endTime: 0, color: '#10B981' }];
    this.state.activeClipId = 1;
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    if (clipSelectionContainer) clipSelectionContainer.innerHTML = '';
  }

  resetSlider() {
    this.slider.cleanupMultiClipElements();
    this.slider.setupDefault();
  }

  updateUIAfterClear(downloadLocation) {
    requestAnimationFrame(() => {
      this.updateClipSelectionUI();
      this.updateClipHeaderText();
    });
    this.switchToInitialState();
    this.updateButtonState('idle');
    this.logOutput('Form cleared while preserving download location. Ready for new input.', 'text-accent-500');
  }

  // State Management
  switchToInitialState() {
    this.state.currentStage = 'initial';
    this.toggleStateVisibility('initialState', true);
    this.toggleStateVisibility('progressState', false);
    this.toggleStateVisibility('resultState', false);
  }

  switchToProgressState() {
    this.state.currentStage = 'progress';
    this.toggleStateVisibility('initialState', false);
    this.toggleStateVisibility('progressState', true);
    this.toggleStateVisibility('resultState', false);
    this.progress.setProgress(0);
    document.getElementById('statusText').textContent = 'Initializing...';
    document.getElementById('output').innerHTML = '';
  }

  switchToResultState() {
    this.state.currentStage = 'result';
    this.toggleStateVisibility('initialState', false);
    this.toggleStateVisibility('progressState', false);
    this.toggleStateVisibility('resultState', true);
    this.progress.setProgress(100);
  }

  toggleStateVisibility(elementId, isVisible) {
    const element = document.getElementById(elementId);
    element.classList.toggle('hidden', !isVisible);
  }

  // Event Binding
  setupEventListeners() {
    this.bindWindowControls();
    this.bindFormControls();
    this.bindUrlInput();
    this.bindDownloadForm();
    this.bindElectronEvents();
    this.bindClipControls();
    this.bindConsoleToggle();
  }

  bindWindowControls() {
    document.getElementById('closeBtn').addEventListener('click', () => window.electronAPI.windowControl('close'));
    document.getElementById('minimizeBtn').addEventListener('click', () => window.electronAPI.windowControl('minimize'));
    document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
  }

  toggleFullscreen() {
    this.isFullscreen = !this.isFullscreen;
    this.updateFullscreenIcon();
    window.electronAPI.windowControl('toggleFullScreen');
  }

  updateFullscreenIcon() {
    const fullscreenIcon = document.getElementById('fullscreenIcon');
    const exitFullscreenIcon = document.getElementById('exitFullscreenIcon');
    fullscreenIcon.classList.toggle('hidden', this.isFullscreen);
    exitFullscreenIcon.classList.toggle('hidden', !this.isFullscreen);
  }

  bindFormControls() {
    document.getElementById('clearFormBtn').addEventListener('click', () => this.clearForm());
    document.getElementById('browseButton').addEventListener('click', () => this.handleBrowseButton());
  }

  async handleBrowseButton() {
    setTimeout(async () => {
      try {
        const folderPath = await window.electronAPI.selectFolder();
        if (folderPath) this.updateDownloadLocation(folderPath);
      } catch (error) {
        console.error('Error selecting folder:', error);
      }
    }, 50);
  }

  updateDownloadLocation(folderPath) {
    const input = document.getElementById('downloadLocation');
    input.value = folderPath;
    input.classList.add('ring-2', 'ring-accent-500');
    setTimeout(() => input.classList.remove('ring-2', 'ring-accent-500'), 1000);
  }

  bindUrlInput() {
    const urlInput = document.getElementById('url');
    urlInput.addEventListener('click', () => this.handleUrlClick(urlInput));
    urlInput.addEventListener('paste', () => setTimeout(() => this.handleUrlChange(urlInput.value.trim()), 100));
    urlInput.addEventListener('blur', () => this.handleUrlChange(urlInput.value.trim()));
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

  bindDownloadForm() {
    document.getElementById('downloadForm').addEventListener('submit', (e) => this.handleSubmit(e));
  }

  bindElectronEvents() {
    window.electronAPI.onDownloadUpdate((update) => this.handleDownloadUpdate(update));
    window.electronAPI.onDownloadComplete((data) => this.handleDownloadComplete(data));
  }

  bindClipControls() {
    const addClipBtn = document.getElementById('addClipBtn');
    if (addClipBtn) addClipBtn.addEventListener('click', () => this.addClip());
  }

  bindConsoleToggle() {
    const toggleLogsBtn = document.getElementById('toggleLogs');
    if (toggleLogsBtn) toggleLogsBtn.addEventListener('click', () => this.toggleConsoleVisibility(toggleLogsBtn));
  }

  toggleConsoleVisibility(toggleLogsBtn) {
    const output = document.getElementById('output');
    this.ensureConsoleContent(output);
    const isHidden = window.getComputedStyle(output).display === 'none' || output.classList.contains('hidden');
    this.updateConsoleDisplay(output, toggleLogsBtn, isHidden);
  }

  ensureConsoleContent(output) {
    if (!output.innerHTML.trim()) {
      output.innerHTML = '<div class="text-gray-500">Console output will appear here. Click "Show Console Output" to toggle visibility.</div>';
    }
  }

  updateConsoleDisplay(output, toggleLogsBtn, isHidden) {
    if (isHidden) {
      output.classList.remove('hidden');
      output.style.display = 'block';
      output.style.height = 'auto';
      output.style.minHeight = '200px';
      output.style.maxHeight = '200px';
      this.logOutput('Console output is now visible', 'text-accent-500');
      toggleLogsBtn.innerHTML = this.getHideConsoleIcon();
    } else {
      output.classList.add('hidden');
      output.style.display = 'none';
      toggleLogsBtn.innerHTML = this.getShowConsoleIcon();
    }
  }

  getShowConsoleIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" /></svg> Show Console Output';
  }

  getHideConsoleIcon() {
    return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 mr-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clip-rule="evenodd" /></svg> Hide Console Output';
  }

  // URL Handling
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
    const elements = this.getDurationElements();
    this.prepareDurationDisplay(elements);
    try {
      this.logOutput(`Fetching video duration for: ${url}`);
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
    this.state.videoDurationSeconds = duration;
    const formattedDuration = Utils.formatTimeFromSeconds(duration);
    elements.duration.textContent = formattedDuration;
    this.updateVideoTitle(elements, title);
    this.updateClipsDuration();
    this.updateSliderAndUI(elements, formattedDuration);
  }

  updateVideoTitle(elements, title) {
    if (title) {
      this.videoTitle = title;
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

  updateClipsDuration() {
    this.state.clips.forEach(clip => {
      if (clip.endTime === 0 || clip.endTime > this.state.videoDurationSeconds) {
        clip.endTime = this.state.videoDurationSeconds;
      }
    });
  }

  updateSliderAndUI(elements, formattedDuration) {
    this.slider.setupTickMarks(this.state.videoDurationSeconds);
    document.getElementById('end').value = formattedDuration;
    this.slider.setupMultiClips(this.state.clips, this.state.activeClipId);
    this.updateClipSelectionUI();
    elements.container.style.pointerEvents = 'auto';
    elements.loading.classList.add('hidden');
    this.logOutput(`Video duration: ${formattedDuration}`);
  }

  handleDurationError(elements, error) {
    elements.duration.textContent = 'Error';
    elements.loading.classList.add('hidden');
    this.logOutput(`Failed to fetch video duration: ${error.message}`, 'text-red-500');
  }

  // Button State Management
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

  // Clip Management
  addClip() {
    if (!this.hasEnoughSpaceForClip()) {
      this.logOutput('Not enough space to add another clip. Please adjust existing clips to make room.', 'text-red-500');
      return;
    }
    const newClip = this.createNewClip();
    this.state.clips.push(newClip);
    this.state.activeClipId = newClip.id;
    this.updateClipUI();
  }

  hasEnoughSpaceForClip() {
    const duration = this.state.videoDurationSeconds || 0;
    const minSpaceNeeded = Math.max(Math.floor(duration * 0.05), 3);
    return this.checkClipSpace(duration, minSpaceNeeded);
  }

  checkClipSpace(duration, minSpaceNeeded) {
    if (!this.state.clips.length) return true;
    const sortedClips = [...this.state.clips].sort((a, b) => a.startTime - b.startTime);
    if (sortedClips[0].startTime >= minSpaceNeeded) return true;
    for (let i = 0; i < sortedClips.length - 1; i++) {
      if (sortedClips[i + 1].startTime - sortedClips[i].endTime >= minSpaceNeeded) return true;
    }
    const lastClip = sortedClips[sortedClips.length - 1];
    return duration - lastClip.endTime >= minSpaceNeeded;
  }

  createNewClip() {
    const clipColors = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444'];
    const newClipId = this.state.clips.length + 1;
    const colorIndex = (newClipId - 1) % clipColors.length;
    const duration = this.state.videoDurationSeconds || 0;
    const bubbleWidthInSeconds = Math.max(Math.floor(duration * 0.05), 3);
    const previousClip = this.state.clips[this.state.clips.length - 1];
    const startTime = previousClip ? Math.min(previousClip.endTime + bubbleWidthInSeconds, duration - 10) : 0;
    const defaultClipDuration = Math.max(Math.floor(duration * 0.1), 5);
    const endTime = Math.min(startTime + defaultClipDuration, duration);
    if (startTime >= duration - 2) {
      this.logOutput('No more room for additional clips', 'text-red-500');
      return null;
    }
    return { id: newClipId, startTime, endTime, color: clipColors[colorIndex] };
  }

  updateClipUI() {
    this.slider.setupMultiClips(this.state.clips, this.state.activeClipId);
    this.updateClipSelectionUI();
  }

  setActiveClip(clipId) {
    this.state.activeClipId = clipId;
    this.slider.setActiveClip(clipId);
    this.updateClipSelectionUI();
    this.updateManualInputs(clipId);
  }

  updateManualInputs(clipId) {
    const activeClip = this.state.clips.find(clip => clip.id === clipId);
    if (activeClip) {
      document.getElementById('start').value = Utils.formatTimeFromSeconds(activeClip.startTime);
      document.getElementById('end').value = Utils.formatTimeFromSeconds(activeClip.endTime);
      document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    }
  }

  updateClipSelectionUI() {
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    if (!clipSelectionContainer) return;
    this.updateClipHeaderText();
    document.getElementById('videoDurationDisplay').style.display = 'none';
    this.styleClipSelectionContainer(clipSelectionContainer);
    this.handleSingleClipColor();
    this.updateClipElements(clipSelectionContainer);
  }

  styleClipSelectionContainer(container) {
    Object.assign(container.style, {
      display: 'block',
      marginTop: '0',
      width: '100%',
      overflow: 'hidden'
    });
  }

  handleSingleClipColor() {
    if (this.state.clips.length === 1) {
      this.state.clips[0].color = '#10B981';
      this.updateSliderColors('#10B981');
    }
  }

  updateSliderColors(color) {
    ['startHandle', 'endHandle', 'rangeSliderInner'].forEach(id => {
      const element = document.getElementById(id);
      if (element) element.style.backgroundColor = color;
    });
  }

  updateClipElements(container) {
    if (container.children.length !== this.state.clips.length) {
      container.innerHTML = '';
      this.state.clips.forEach(clip => this.createClipElement(container, clip));
    } else {
      this.state.clips.forEach(clip => this.updateExistingClipElement(clip));
    }
  }

  createClipElement(container, clip) {
    const clipEl = document.createElement('div');
    this.styleClipElement(clipEl, clip);
    clipEl.appendChild(this.createColorIndicator(clip));
    clipEl.appendChild(this.createClipText(clip));
    clipEl.appendChild(this.createDeleteButton(clip));
    clipEl.addEventListener('click', () => this.setActiveClip(clip.id));
    container.appendChild(clipEl);
  }

  styleClipElement(element, clip) {
    element.id = `clip-selection-${clip.id}`;
    element.className = 'flex items-center relative';
    Object.assign(element.style, {
      padding: '4px 8px',
      height: '24px',
      lineHeight: '20px',
      boxSizing: 'border-box',
      cursor: 'pointer',
      marginRight: '8px',
      marginBottom: '0px',
      display: 'inline-flex',
      flexShrink: '0',
      flexBasis: 'auto',
      minWidth: 'min-content',
      float: 'left'
    });
    if (clip.id === this.state.activeClipId) element.classList.add('bg-dark-700', 'rounded');
  }

  createColorIndicator(clip) {
    const indicator = document.createElement('div');
    indicator.className = 'w-3 h-3 rounded-full mr-2';
    indicator.style.backgroundColor = clip.color;
    return indicator;
  }

  createClipText(clip) {
    const text = document.createElement('span');
    text.className = `text-xs ${clip.id === this.state.activeClipId ? 'text-white' : 'text-gray-400 font-bold'}`;
    text.appendChild(this.createClipLabel(clip));
    text.appendChild(this.createClipDuration(clip));
    return text;
  }

  createClipLabel(clip) {
    const label = document.createElement('span');
    label.textContent = `Clip ${clip.id} Length: `;
    return label;
  }

  createClipDuration(clip) {
    const duration = document.createElement('span');
    duration.className = 'clip-duration text-white font-bold';
    duration.id = `clip-duration-${clip.id}`;
    duration.textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
    return duration;
  }

  createDeleteButton(clip) {
    const button = document.createElement('button');
    button.className = 'ml-2 text-gray-400 hover:text-red-500 focus:outline-none';
    button.innerHTML = '×';
    button.type = 'button';
    Object.assign(button.style, { fontSize: '16px', lineHeight: '16px', fontWeight: 'bold', padding: '0 4px' });
    button.dataset.clipId = clip.id;
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.removeClip(parseInt(e.currentTarget.dataset.clipId, 10));
    });
    return button;
  }

  updateExistingClipElement(clip) {
    const clipEl = document.getElementById(`clip-selection-${clip.id}`);
    const clipDuration = document.getElementById(`clip-duration-${clip.id}`);
    if (clipEl && clipDuration) {
      clipDuration.textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
      const clipText = clipEl.querySelector('span');
      if (clipText) clipText.className = `text-xs ${clip.id === this.state.activeClipId ? 'text-white' : 'text-gray-400 font-bold'}`;
      clipDuration.classList.add('text-white', 'font-bold');
      clipDuration.classList.remove('text-accent-500');
      clipEl.classList.toggle('bg-dark-700', clip.id === this.state.activeClipId);
      clipEl.classList.toggle('rounded', clip.id === this.state.activeClipId);
    }
  }

  removeClip(clipId) {
    const clipIndex = this.state.clips.findIndex(clip => clip.id === clipId);
    if (clipIndex === -1) return;
    this.state.clips.splice(clipIndex, 1);
    this.handleClipRemoval();
    this.logOutput(`Removed clip ${clipId}`, 'text-accent-500');
  }

  handleClipRemoval() {
    if (!this.state.clips.length) {
      this.resetToDefaultClip();
    } else {
      this.renumberClips();
      this.updateUIAfterRemoval();
    }
  }

  resetToDefaultClip() {
    this.state.clips.push({ id: 1, startTime: 0, endTime: this.state.videoDurationSeconds || 0, color: '#10B981' });
    this.state.activeClipId = 1;
    this.slider.setupDefault();
    this.updateClipSelectionUI();
  }

  renumberClips() {
    const clipColors = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444'];
    this.state.clips.forEach((clip, index) => {
      const newId = index + 1;
      if (clip.id === this.state.activeClipId) this.state.activeClipId = newId;
      clip.id = newId;
      clip.color = clipColors[(newId - 1) % clipColors.length];
    });
    if (this.state.clips.length === 1) this.state.clips[0].color = '#10B981';
    if (this.state.activeClipId > this.state.clips.length) this.state.activeClipId = 1;
  }

  updateUIAfterRemoval() {
    this.slider.setupMultiClips(this.state.clips, this.state.activeClipId);
    this.updateClipSelectionUI();
    if (this.state.clips.length === 1) {
      const clipLengthLabel = document.querySelector('.flex.justify-between.items-center .flex.items-center label');
      if (clipLengthLabel) clipLengthLabel.textContent = 'Clip Length';
    }
  }

  updateClipHeaderText() {
    const clipLengthRow = document.getElementById('clipLengthRow');
    if (!clipLengthRow) return;
    const addClipBtn = document.getElementById('addClipBtn');
    if (!addClipBtn) return;
    this.styleAddClipButton(addClipBtn);
    this.manageClipBoxWrapper(addClipBtn);
  }

  styleAddClipButton(button) {
    Object.assign(button.style, {
      height: '24px',
      lineHeight: '20px',
      boxSizing: 'border-box',
      minWidth: '85px'
    });
    this.addClipBtnHeight = button.offsetHeight || 28;
  }

  manageClipBoxWrapper(button) {
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    const durationDisplay = document.getElementById('videoDurationDisplay');
    if (!clipSelectionContainer || !durationDisplay) return;
    durationDisplay.style.display = 'none';
    const wrapper = this.getOrCreateClipBoxWrapper();
    this.styleClipItems(clipSelectionContainer);
    this.integrateWrapperWithContainer(button, wrapper, clipSelectionContainer);
  }

  getOrCreateClipBoxWrapper() {
    let wrapper = document.getElementById('clipBoxWrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'clipBoxWrapper';
      Object.assign(wrapper.style, {
        display: 'block',
        marginLeft: '0px',
        minHeight: '24px',
        paddingLeft: '10px',
        width: 'calc(100% - 10px)'
      });
    }
    return wrapper;
  }

  styleClipItems(container) {
    Object.assign(container.style, {
      display: 'block',
      alignItems: 'center',
      margin: '0',
      padding: '0',
      width: '100%',
      overflow: 'hidden'
    });
    container.querySelectorAll('[id^="clip-selection-"]').forEach(item => {
      Object.assign(item.style, {
        display: 'flex',
        marginRight: '8px',
        marginBottom: '0px',
        padding: '4px 8px',
        height: '24px',
        lineHeight: '20px',
        boxSizing: 'border-box',
        cursor: 'pointer',
        alignItems: 'center',
        flexShrink: '0',
        flexBasis: 'auto',
        float: 'left'
      });
    });
  }

  integrateWrapperWithContainer(button, wrapper, clipSelectionContainer) {
    if (clipSelectionContainer.parentNode && clipSelectionContainer.parentNode !== wrapper) {
      clipSelectionContainer.parentNode.removeChild(clipSelectionContainer);
    }
    if (clipSelectionContainer.parentNode !== wrapper) wrapper.appendChild(clipSelectionContainer);
    const container = this.getOrCreateButtonAndClipsContainer(button);
    this.ensureContainerContents(container, button, wrapper);
  }

  getOrCreateButtonAndClipsContainer(button) {
    let container = document.getElementById('buttonAndClipsContainer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'buttonAndClipsContainer';
      Object.assign(container.style, {
        display: 'flex',
        flexWrap: 'nowrap',
        alignItems: 'flex-start',
        minHeight: '24px'
      });
      const btnParent = button.parentNode;
      if (button.parentNode) button.parentNode.removeChild(button);
      if (btnParent) btnParent.appendChild(container);
    }
    return container;
  }

  ensureContainerContents(container, button, wrapper) {
    if (!container.contains(button)) container.appendChild(button);
    const divider = this.getOrCreateDivider(container, button);
    if (!container.contains(wrapper)) container.appendChild(wrapper);
  }

  getOrCreateDivider(container, button) {
    let divider = container.querySelector('div:not(#clipBoxWrapper):not(#addClipBtn)');
    if (!divider) {
      divider = document.createElement('div');
      Object.assign(divider.style, {
        width: '2px',
        height: '20px',
        backgroundColor: 'rgb(55, 65, 81)',
        margin: '2px 0 0 10px'
      });
      if (button.nextSibling) {
        container.insertBefore(divider, button.nextSibling);
      } else {
        container.appendChild(divider);
      }
    }
    return divider;
  }

  // Download Handling
  handleSubmit(e) {
    e.preventDefault();
    const url = document.getElementById('url').value.trim();
    if (!url) {
      this.logOutput('Please enter a valid URL before downloading', 'text-red-500');
      return;
    }
    this.updateButtonState('loading');
    this.switchToProgressState();
    this.startDownload(url);
  }

  startDownload(url) {
    const downloadLocation = document.getElementById('downloadLocation').value;
    this.state.downloadStartTime = new Date();
    const clipJobs = this.state.clips.map(clip => ({
      url,
      start: Utils.formatTimeFromSeconds(clip.startTime),
      end: Utils.formatTimeFromSeconds(clip.endTime),
      downloadLocation,
      clipId: clip.id
    }));
    window.electronAPI.downloadVideo({ url, downloadLocation, clips: clipJobs });
    this.logOutput(`Processing ${clipJobs.length} clip${clipJobs.length > 1 ? 's' : ''}...`);
  }

  handleDownloadUpdate(update) {
    const className = update.includes('[ERROR]') ? 'text-red-500' : 
                     (update.includes('Download finished') || update.includes('[TRIMMED_DURATION]')) ? 'text-accent-500' : '';
    this.logOutput(update, className);
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
      : Utils.formatTimeFromSeconds(this.state.videoDurationSeconds || 0);
  }

  updateResultUI(successMessage, finalDuration) {
    document.getElementById('downloadSuccessMessage').textContent = successMessage;
    document.getElementById('downloadedVideoDuration').textContent = finalDuration;
    document.getElementById('statusText').textContent = `Download complete - Duration: ${finalDuration}`;
    this.progress.setProgress(100);
    this.switchToResultState();
  }

  updateProgressFromMessage(message) {
    const statusTextEl = document.getElementById('statusText');
    const { progressPercent, statusText, progressDescription } = this.parseProgressMessage(message);
    statusTextEl.innerHTML = statusText;
    this.updateProgressDescription(statusTextEl, progressDescription);
    if (progressPercent !== null && progressPercent >= 0) this.progress.setProgress(progressPercent);
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
        const total = this.state.videoDurationSeconds || 600;
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
      this.progress.setProgress(100);
    }
  }

  // Logging
  logOutput(message, className = '') {
    const output = document.getElementById('output');
    if (output.childElementCount === 1 && output.children[0].classList.contains('text-gray-500')) {
      output.innerHTML = '';
    }
    const div = document.createElement('div');
    div.textContent = message;
    if (className) div.className = className;
    output.appendChild(div);
    output.scrollTop = output.scrollHeight;
    this.highlightToggleButtonIfHidden(output);
  }

  highlightToggleButtonIfHidden(output) {
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