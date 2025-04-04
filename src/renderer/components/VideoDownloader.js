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
    // Add clips array for multiple clips
    this.clips = [{ id: 1, startTime: 0, endTime: 0, color: '#10B981' }]; // Default first clip
    this.activeClipId = 1; // Track which clip is currently being adjusted
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
    
    // Create initial clip selection UI
    this.updateClipSelectionUI();
  }

  get videoUrl() { return this.state._videoUrl; }
  set videoUrl(value) { this.state._videoUrl = typeof value === 'string' ? value : String(value); }

  clearForm() {
    const downloadLocation = document.getElementById('downloadLocation').value;
    document.getElementById('url').value = '';
    this.videoUrl = '';
    document.getElementById('videoDuration').textContent = '--:--:--';
    document.getElementById('durationInfo').classList.add('hidden');
    
    // Reset to single clip state - clear all additional clips
    this.state.clips = [{ 
      id: 1, 
      startTime: 0, 
      endTime: 0, 
      color: '#10B981' 
    }];
    this.state.activeClipId = 1;
    
    // Remove any additional clip handles and tracks from the DOM
    this.slider.cleanupMultiClipElements();
    
    // Reset slider to default single clip display
    this.slider.setupDefault();
    
    // Clear the clip selection container completely
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    if (clipSelectionContainer) {
      clipSelectionContainer.innerHTML = '';
    }
    
    this.state.videoDurationSeconds = 0;
    document.getElementById('start').value = '';
    document.getElementById('end').value = '';
    document.getElementById('videoDurationDisplay').textContent = '00:00:00';
    document.getElementById('downloadLocation').value = downloadLocation;
    
    // Ensure we rebuild the clip box (for single clip) after a form clear
    requestAnimationFrame(() => {
      this.updateClipSelectionUI();
      this.updateClipHeaderText();
    });
    
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
    
    // Add event listener for the "Add Clip" button
    const addClipBtn = document.getElementById('addClipBtn');
    if (addClipBtn) {
      addClipBtn.addEventListener('click', () => this.addClip());
    }

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
      videoName: document.getElementById('videoName'),
      container: document.getElementById('timeRangeContainer')
    };

    elements.info.classList.remove('hidden');
    elements.loading.classList.remove('hidden');
    elements.duration.textContent = 'Loading...';
    elements.videoName.textContent = 'Loading...';
    elements.container.style.pointerEvents = 'none';

    try {
      this.logOutput(`Fetching video duration for: ${url}`);
      
      // Start two promises in parallel - one for duration, one for title
      const durationPromise = window.electronAPI.fetchVideoDuration(url);
      const titlePromise = window.electronAPI.getVideoTitle(url);
      
      // Wait for both to complete
      const [duration, title] = await Promise.all([
        durationPromise.catch(err => {
          console.error("Error fetching duration:", err);
          return 0;
        }),
        titlePromise.catch(err => {
          console.error("Error fetching title:", err);
          return null;
        })
      ]);
      
      // Store the video duration
      this.state.videoDurationSeconds = duration;
      const formattedDuration = Utils.formatTimeFromSeconds(this.state.videoDurationSeconds);
      
      // Display the duration
      elements.duration.textContent = formattedDuration;
      
      // Handle the title (truncate to 8 words)
      if (title) {
        // Store full title
        this.videoTitle = title;
        
        // Decode HTML entities (like &amp; to &)
        const decodeEntities = (text) => {
          const textArea = document.createElement('textarea');
          textArea.innerHTML = text;
          return textArea.value;
        };
        
        const decodedTitle = decodeEntities(title);
        
        // If name is longer than 8 words, truncate without adding extension
        const words = decodedTitle.split(' ');
        let truncatedTitle;
        if (words.length > 8) {
          // Simply cut off at 8 words without extension
          truncatedTitle = words.slice(0, 8).join(' ');
        } else {
          truncatedTitle = decodedTitle;
        }
        
        // Update the video name element
        elements.videoName.textContent = truncatedTitle;
      } else {
        elements.videoName.textContent = 'Unknown.mp4';
      }
      
      // Update all clips to use the full video duration for their end time if not set
      this.state.clips.forEach(clip => {
        if (clip.endTime === 0 || clip.endTime > this.state.videoDurationSeconds) {
          clip.endTime = this.state.videoDurationSeconds;
        }
      });
      
      // Setup the slider with the duration
      this.slider.setupTickMarks(this.state.videoDurationSeconds);
      
      // Update the end input field
      document.getElementById('end').value = Utils.formatTimeFromSeconds(this.state.videoDurationSeconds);
      
      // Update the multi-clip UI
      this.slider.setupMultiClips(this.state.clips, this.state.activeClipId);
      this.updateClipSelectionUI();
      
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

  addClip() {
    // Generate a new color for the clip
    const clipColors = [
      '#10B981', // Default green (accent-500)
      '#3B82F6', // Blue
      '#8B5CF6', // Purple
      '#EC4899', // Pink
      '#F59E0B', // Amber
      '#EF4444'  // Red
    ];
    
    // Check if any existing clip covers the full or near-full duration
    const duration = this.state.videoDurationSeconds || 0;
    
    // Only reject if a clip covers more than 95% of the total duration
    // This allows adding clips once the user has adjusted a previously full-duration clip
    const minSpaceNeeded = Math.max(Math.floor(duration * 0.05), 3); // Need at least 5% of duration or 3 seconds
    
    // Check if there's enough space to add another clip
    let hasEnoughSpace = false;
    
    // Check start of video to first clip
    if (this.state.clips.length > 0) {
      const firstClip = this.state.clips.reduce((earliest, clip) => 
        clip.startTime < earliest.startTime ? clip : earliest, this.state.clips[0]);
      
      if (firstClip.startTime >= minSpaceNeeded) {
        hasEnoughSpace = true;
      }
    }
    
    // Check between clips
    for (let i = 0; i < this.state.clips.length - 1; i++) {
      // Sort clips by start time to check gaps between them
      const sortedClips = [...this.state.clips].sort((a, b) => a.startTime - b.startTime);
      const gap = sortedClips[i+1].startTime - sortedClips[i].endTime;
      if (gap >= minSpaceNeeded) {
        hasEnoughSpace = true;
        break;
      }
    }
    
    // Check end of last clip to end of video
    if (this.state.clips.length > 0) {
      const lastClip = this.state.clips.reduce((latest, clip) => 
        clip.endTime > latest.endTime ? clip : latest, this.state.clips[0]);
      
      if (duration - lastClip.endTime >= minSpaceNeeded) {
        hasEnoughSpace = true;
      }
    }
    
    if (!hasEnoughSpace) {
      this.logOutput('Not enough space to add another clip. Please adjust existing clips to make room.', 'text-red-500');
      return;
    }
    
    const newClipId = this.state.clips.length + 1;
    const colorIndex = (newClipId - 1) % clipColors.length;
    
    // Get the end time of the previous clip
    const previousClip = this.state.clips[this.state.clips.length - 1];
    
    // Calculate bubble width in time units - use approximately 5% of duration or minimum 3 seconds
    const bubbleWidthInSeconds = Math.max(Math.floor(duration * 0.05), 3);
    
    // Add spacing after previous clip (at least a bubble's width)
    const startTime = previousClip ? 
      Math.min(previousClip.endTime + bubbleWidthInSeconds, duration - 10) : 0;
    
    // Calculate a sensible end time (either video end or start + 10% of video duration)
    const defaultClipDuration = Math.max(Math.floor(duration * 0.1), 5); // At least 5 seconds
    const endTime = Math.min(startTime + defaultClipDuration, duration);
    
    // Make sure we still have room for this clip
    if (startTime >= duration - 2) {
      this.logOutput('No more room for additional clips', 'text-red-500');
      return;
    }
    
    // Add a new clip to the array
    this.state.clips.push({
      id: newClipId,
      startTime: startTime,
      endTime: endTime,
      color: clipColors[colorIndex]
    });
    
    // Set the new clip as active
    this.state.activeClipId = newClipId;
    
    // Update the slider to show the new clip
    this.slider.setupMultiClips(this.state.clips, this.state.activeClipId);
    
    // Update the clip selection and length UI
    this.updateClipSelectionUI();
  }
  
  setActiveClip(clipId) {
    this.state.activeClipId = clipId;
    
    // Update the slider to highlight the active clip
    this.slider.setActiveClip(clipId);
    
    // Update the UI to show active clip info
    this.updateClipSelectionUI();
    
    // Update the manual input fields for the active clip
    const activeClip = this.state.clips.find(clip => clip.id === clipId);
    if (activeClip) {
      document.getElementById('start').value = Utils.formatTimeFromSeconds(activeClip.startTime);
      document.getElementById('end').value = Utils.formatTimeFromSeconds(activeClip.endTime);
      document.getElementById('videoDurationDisplay').textContent = 
        Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    }
  }
  
  updateClipSelectionUI() {
    // Update clip selection UI elements
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    const videoDurationDisplay = document.getElementById('videoDurationDisplay');
    if (!clipSelectionContainer) return;
    
    // Update header text based on number of clips
    this.updateClipHeaderText();
    
    // Always hide the original videoDurationDisplay element
    if (videoDurationDisplay) {
      videoDurationDisplay.style.display = 'none';
    }
    
    // Configure container for clip boxes regardless of clip count
    clipSelectionContainer.style.display = 'flex';
    clipSelectionContainer.style.flexDirection = 'row';
    clipSelectionContainer.style.flexWrap = 'wrap';
    clipSelectionContainer.style.gap = '8px';
    clipSelectionContainer.style.marginTop = '0';
    clipSelectionContainer.style.width = '100%';
    
    // Ensure proper coloring for single clips
    if (this.state.clips.length === 1) {
      // Update color to default green
      this.state.clips[0].color = '#10B981';
      
      // Update the slider elements directly to ensure proper coloring
      const startHandle = document.getElementById('startHandle');
      const endHandle = document.getElementById('endHandle');
      const rangeInner = document.getElementById('rangeSliderInner');
      
      if (startHandle && endHandle && rangeInner) {
        startHandle.style.backgroundColor = '#10B981';
        endHandle.style.backgroundColor = '#10B981';
        rangeInner.style.backgroundColor = '#10B981';
      }
    }
    
    // Check if we need to rebuild the container or just update durations
    if (clipSelectionContainer.children.length !== this.state.clips.length) {
      // Clear and rebuild if the number of clips changed
      clipSelectionContainer.innerHTML = '';
      
        // Add clip length information for each clip
        this.state.clips.forEach(clip => {
          // Create clip element with exact styling as specified
          const clipEl = document.createElement('div');
          clipEl.className = 'flex items-center relative';
          clipEl.id = `clip-selection-${clip.id}`;
          
          // Apply exact styling as specified
          clipEl.style.padding = '4px 8px';
          clipEl.style.height = '24px';
          clipEl.style.lineHeight = '20px';
          clipEl.style.boxSizing = 'border-box';
          clipEl.style.cursor = 'pointer';
          clipEl.style.marginRight = '8px';
          clipEl.style.marginBottom = '0px';
          clipEl.style.display = 'inline-flex';
          clipEl.style.flexShrink = '0';
          clipEl.style.flexBasis = 'auto';
          clipEl.style.minWidth = 'min-content';
          
          // Add color indicator
          const colorIndicator = document.createElement('div');
          colorIndicator.className = 'w-3 h-3 rounded-full mr-2';
          colorIndicator.style.backgroundColor = clip.color;
          clipEl.appendChild(colorIndicator);
          
          // Add clip info text with separate duration span for easy updates
          const clipText = document.createElement('span');
          clipText.className = `text-xs ${clip.id === this.state.activeClipId ? 'text-white' : 'text-gray-400 font-bold'}`;
          
          // Create elements for label and duration for easy updating
          const clipLabel = document.createElement('span');
          clipLabel.textContent = `Clip ${clip.id} Length: `;
          
          const clipDuration = document.createElement('span');
          clipDuration.className = 'clip-duration text-white font-bold';
          clipDuration.id = `clip-duration-${clip.id}`;
          clipDuration.textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
          
          clipText.appendChild(clipLabel);
          clipText.appendChild(clipDuration);
          clipEl.appendChild(clipText);
          
          // Add delete button (x icon) for all clips with specific clip ID in closure
          const deleteButton = document.createElement('button');
          deleteButton.className = 'ml-2 text-gray-400 hover:text-red-500 focus:outline-none';
          deleteButton.innerHTML = '×';
          deleteButton.style.fontSize = '16px';
          deleteButton.style.lineHeight = '16px';
          deleteButton.style.fontWeight = 'bold';
          deleteButton.style.paddingLeft = '4px';
          deleteButton.style.paddingRight = '4px';
          
          // Store clip ID in the button's data attribute
          deleteButton.dataset.clipId = clip.id;
          
          // Stop propagation and prevent default to avoid triggering other actions
          deleteButton.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Get the specific clip ID from the dataset
            const clipIdToRemove = parseInt(e.currentTarget.dataset.clipId, 10);
            this.logOutput(`Removing clip ${clipIdToRemove}`, 'text-accent-500');
            this.removeClip(clipIdToRemove);
            return false; // Extra precaution to prevent event bubbling
          });
          
          // Set button type to "button" to prevent form submission
          deleteButton.type = "button";
          
          clipEl.appendChild(deleteButton);
          
          // Make it clickable to select the clip
          clipEl.style.cursor = 'pointer';
          clipEl.addEventListener('click', () => this.setActiveClip(clip.id));
          
          // Highlight the active clip with background color
          if (clip.id === this.state.activeClipId) {
            clipEl.classList.add('bg-dark-700', 'rounded');
          }
          
          clipSelectionContainer.appendChild(clipEl);
        });
    } else {
      // Just update durations and active state for each clip
      this.state.clips.forEach(clip => {
        const clipEl = document.getElementById(`clip-selection-${clip.id}`);
        const clipDuration = document.getElementById(`clip-duration-${clip.id}`);
        
        if (clipEl && clipDuration) {
          // Update duration text
          clipDuration.textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
          
          // Update active state
          const clipText = clipEl.querySelector('span');
          if (clipText) {
            clipText.className = `text-xs ${clip.id === this.state.activeClipId ? 'text-white' : 'text-gray-400 font-bold'}`;
          }
          
          // Ensure all durations have white text
          clipDuration.classList.remove('text-accent-500');
          clipDuration.classList.add('text-white', 'font-bold');
          
          // Update highlight - ensure clip box gets background when active
          if (clip.id === this.state.activeClipId) {
            clipEl.classList.add('bg-dark-700', 'rounded');
          } else {
            clipEl.classList.remove('bg-dark-700', 'rounded');
          }
        }
      });
    }
  }
  
  removeClip(clipId) {
    // Debug logging
    console.log(`Removing clip with ID: ${clipId}`, this.state.clips.map(c => c.id));
    
    // Find the index of the clip to remove
    const clipIndex = this.state.clips.findIndex(clip => clip.id === clipId);
    if (clipIndex === -1) {
      console.log(`Clip with ID ${clipId} not found`);
      return;
    }
    
    // Get the clip to remove
    const removedClip = this.state.clips[clipIndex];
    console.log(`Found clip at index ${clipIndex}: `, removedClip);
    
    // Make a copy of the clips array before modifying it
    const updatedClips = [...this.state.clips];
    updatedClips.splice(clipIndex, 1);
    this.state.clips = updatedClips;
    
    console.log(`After removal: `, this.state.clips.map(c => c.id));
    
    // If we removed all clips, create a new default clip
    if (this.state.clips.length === 0) {
      this.state.clips.push({ 
        id: 1, 
        startTime: 0, 
        endTime: this.state.videoDurationSeconds || 0, 
        color: '#10B981' 
      });
      this.state.activeClipId = 1;
    } else {
      // Renumber and reassign colors for remaining clips
      const clipColors = [
        '#10B981', // Default green (accent-500)
        '#3B82F6', // Blue
        '#8B5CF6', // Purple
        '#EC4899', // Pink
        '#F59E0B', // Amber
        '#EF4444'  // Red
      ];
      
      this.state.clips.forEach((clip, index) => {
        const newId = index + 1;
        const colorIndex = (newId - 1) % clipColors.length; // Reassign color based on new ID
        
        // If this was the active clip, update activeClipId
        if (clip.id === this.state.activeClipId) {
          this.state.activeClipId = newId;
        }
        
        // Update ID and color
        clip.id = newId;
        clip.color = clipColors[colorIndex]; // Ensure colors match new sequence
      });
      
      // Ensure first clip is always default green
      if (this.state.clips.length === 1) {
        this.state.clips[0].color = '#10B981';
      }
      
      // If the removed clip was active, set the first clip as active
      if (this.state.activeClipId === clipId) {
        this.state.activeClipId = 1;
      }
    }
    
    // Special case: If we're back to a single clip, reset to default state
    if (this.state.clips.length === 1) {
      // Reset clip header text
      const clipLengthLabel = document.querySelector('.flex.justify-between.items-center .flex.items-center label');
      if (clipLengthLabel) {
        clipLengthLabel.textContent = 'Clip Length';
      }
      
      // Reset the slider to default single clip display
      this.slider.setupDefault();
      
      // Update clip selection UI
      this.updateClipSelectionUI();
    } else {
      // Re-setup the slider with the renumbered clips
      this.slider.setupMultiClips(this.state.clips, this.state.activeClipId);
      
      // Update the UI
      this.updateClipSelectionUI();
    }
    
    // Log the removal
    this.logOutput(`Removed clip ${clipId}`, 'text-accent-500');
    console.log(`Final clips after renumbering: `, this.state.clips.map(c => c.id));
  }
  
  updateClipHeaderText() {
    // Get the clip length row directly by ID
    const clipLengthRow = document.getElementById('clipLengthRow');
    if (!clipLengthRow) {
      console.error('Clip length row not found - cannot position clip boxes');
      return;
    }
    
    // Get the add clip button
    const addClipBtn = document.getElementById('addClipBtn');
    if (!addClipBtn) {
      console.error('Add Clip button not found');
      return;
    }
    
    // Store button height for consistent sizing across methods
    this.addClipBtnHeight = addClipBtn.offsetHeight || 28; // Default to 28px
    
    // Get the clip selection container and duration display
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    const durationDisplay = document.getElementById('videoDurationDisplay');
    if (!clipSelectionContainer || !durationDisplay) {
      console.error('Required UI elements not found');
      return;
    }
    
    // Always hide the videoDurationDisplay - we'll use clip boxes instead
    durationDisplay.style.display = 'none';
    
    // Set a fixed height for the Add Clip button to prevent it from changing height
    addClipBtn.style.height = '24px';
    addClipBtn.style.lineHeight = '20px';
    addClipBtn.style.boxSizing = 'border-box';
    
    // Always create a wrapper for clip boxes regardless of clip count
    let wrapper = document.getElementById('clipBoxWrapper');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'clipBoxWrapper';
      wrapper.style.display = 'flex';  // Changed from inline-flex to flex
      wrapper.style.flexDirection = 'row';
      wrapper.style.flexWrap = 'wrap';
      wrapper.style.alignItems = 'center';
      wrapper.style.marginLeft = '0px';
      wrapper.style.minHeight = '24px';  // Match button height
      wrapper.style.paddingLeft = '10px';
    }
    
    // Style the clip selection container for horizontal layout
    clipSelectionContainer.style.display = 'flex';  // Changed from inline-flex to flex
    clipSelectionContainer.style.flexDirection = 'row';
    clipSelectionContainer.style.flexWrap = 'wrap';
    clipSelectionContainer.style.alignItems = 'center';
    clipSelectionContainer.style.margin = '0';
    clipSelectionContainer.style.padding = '0';
    clipSelectionContainer.style.width = '100%';  // Allow it to take up full width of wrapper
    
    // Style individual clip items with exact specifications
    const clipItems = clipSelectionContainer.querySelectorAll('[id^="clip-selection-"]');
    clipItems.forEach(item => {
      item.style.display = 'flex';
      item.style.marginRight = '8px';
      item.style.marginBottom = '0px';
      item.style.padding = '4px 8px';
      item.style.height = '24px';
      item.style.lineHeight = '20px';
      item.style.boxSizing = 'border-box';
      item.style.cursor = 'pointer';
      item.style.alignItems = 'center';
      item.style.flexShrink = '0';
      item.style.flexBasis = 'auto';
    });
    
    // Remove clip selection container from its current parent
    if (clipSelectionContainer.parentNode && clipSelectionContainer.parentNode !== wrapper) {
      clipSelectionContainer.parentNode.removeChild(clipSelectionContainer);
    }
    
    // Add selection container to wrapper
    if (clipSelectionContainer.parentNode !== wrapper) {
      wrapper.appendChild(clipSelectionContainer);
    }
    
    // Create a container for the button and clip boxes to control layout
    const buttonAndClipsContainer = document.getElementById('buttonAndClipsContainer');
    if (!buttonAndClipsContainer) {
      // Create a flex container to hold both the button and clip boxes
      const container = document.createElement('div');
      container.id = 'buttonAndClipsContainer';
      container.style.display = 'flex';
      container.style.flexWrap = 'wrap';
      container.style.alignItems = 'center';
      
      // Ensure the row doesn't collapse when clips wrap
      container.style.minHeight = '24px';
      
      // Get the parent of the Add Clip button
      const btnParent = addClipBtn.parentNode;
      
      // Remove clip wrapper from DOM if it exists somewhere else
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      
      // Move the Add Clip button into the new container
      if (addClipBtn.parentNode) {
        addClipBtn.parentNode.removeChild(addClipBtn);
      }
      
      // Create standalone divider
      const divider = document.createElement('div');
      divider.style.width = '2px';
      divider.style.height = '20px';
      divider.style.backgroundColor = 'rgb(55, 65, 81)';
      divider.style.margin = '0 0 0 10px';
      
      // Add button, divider, and wrapper to the container
      container.appendChild(addClipBtn);
      container.appendChild(divider);
      container.appendChild(wrapper);
      
      // Add the container to the original parent
      btnParent.appendChild(container);
    } else {
      // Container exists, ensure divider and wrapper are inside it
      const existingDivider = buttonAndClipsContainer.querySelector('div:not(#clipBoxWrapper):not(#addClipBtn)');
      
      // Create divider if it doesn't exist
      if (!existingDivider) {
        const divider = document.createElement('div');
        divider.style.width = '2px';
        divider.style.height = '20px';
        divider.style.backgroundColor = 'rgb(55, 65, 81)';
        divider.style.margin = '0 10px';
        
        // Insert divider after the button
        if (addClipBtn.nextSibling) {
          buttonAndClipsContainer.insertBefore(divider, addClipBtn.nextSibling);
        } else {
          buttonAndClipsContainer.appendChild(divider);
        }
      }
      
      // Ensure wrapper is inside container
      if (wrapper.parentNode !== buttonAndClipsContainer) {
        if (wrapper.parentNode) {
          wrapper.parentNode.removeChild(wrapper);
        }
        buttonAndClipsContainer.appendChild(wrapper);
      }
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
    const downloadLocation = document.getElementById('downloadLocation').value;
    
    // Process all clips
    this.state.downloadStartTime = new Date();
    
    // Create a batch of clip download jobs
    const clipJobs = this.state.clips.map(clip => {
      const start = Utils.formatTimeFromSeconds(clip.startTime);
      const end = Utils.formatTimeFromSeconds(clip.endTime);
      return { 
        url, 
        start, 
        end, 
        downloadLocation,
        clipId: clip.id
      };
    });
    
    // Send all clips for processing
    window.electronAPI.downloadVideo({ 
      url, 
      downloadLocation,
      clips: clipJobs
    });
    
    this.logOutput(`Processing ${clipJobs.length} clip${clipJobs.length > 1 ? 's' : ''}...`);
  }

  handleDownloadUpdate(update) {
    this.logOutput(update, update.includes('[ERROR]') ? 'text-red-500' : update.includes('Download finished') || update.includes('[TRIMMED_DURATION]') ? 'text-accent-500' : '');
    this.updateProgressFromMessage(update);
  }

  handleDownloadComplete(data) {
    const finalDuration = data.duration && typeof data.duration === 'number'
      ? Utils.formatTimeFromSeconds(data.duration)
      : Utils.formatTimeFromSeconds(this.state.videoDurationSeconds || 0);

    let successMessage = `Video successfully downloaded! (${finalDuration})`;
    
    // If multiple clips were processed, mention that
    if (data.totalClips && data.totalClips > 1) {
      successMessage = `${data.totalClips} clips successfully downloaded! (${finalDuration})`;
    }

    document.getElementById('downloadSuccessMessage').textContent = successMessage;
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