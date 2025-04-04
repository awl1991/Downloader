import Utils from '../utils/utils.js';

class RangeSlider {
  constructor(state) {
    this.state = state;
    this.container = document.getElementById('timeRangeContainer');
    this.startHandle = document.getElementById('startHandle');
    this.endHandle = document.getElementById('endHandle');
    this.rangeInner = document.getElementById('rangeSliderInner');
    this.startValue = document.getElementById('startValue');
    this.endValue = document.getElementById('endValue');
    this.startInput = document.getElementById('start');
    this.endInput = document.getElementById('end');
    
    // For multiple clips
    this.handles = new Map(); // Maps clipId to {start: handle, end: handle}
    this.valueElements = new Map(); // Maps clipId to {start: element, end: element}
    this.rangeTracks = new Map(); // Maps clipId to range track element
    this.activeHandleInfo = null; // {clipId, isStart}
    this.dragHandle = null;
    
    // Bind methods to ensure proper this context
    this.handleMove = this.handleMove.bind(this);
    this.handleEnd = this.handleEnd.bind(this);
  }

  setupTickMarks(duration) {
    document.getElementById('ticksContainer').innerHTML = '';
    this.initRangeSlider(duration);
  }

  initRangeSlider(duration) {
    this.duration = duration;
    
    // Initialize the first clip if it doesn't have time values yet
    if (this.state.clips && this.state.clips.length > 0) {
      const firstClip = this.state.clips[0];
      if (firstClip.startTime === 0 && firstClip.endTime === 0 && duration > 0) {
        firstClip.endTime = duration;
        this.state.clips[0] = firstClip;
      }
    }
    
    // Setup the single clip view initially
    this.startTime = 0;
    this.endTime = duration;
    this.updateHandlePosition(this.startHandle, 0);
    this.updateHandlePosition(this.endHandle, duration);
    this.updateRangeTrack();
    this.addEventListeners();
    
    // If we have multiple clips, set up the multi-clip view
    if (this.state.clips && this.state.clips.length > 0) {
      this.setupMultiClips(this.state.clips, this.state.activeClipId);
    }
  }

  setupDefault() {
    this.startHandle.style.left = '0%';
    this.endHandle.style.left = '100%';
    this.rangeInner.style.left = '0%';
    this.rangeInner.style.width = '100%';
    
    // Remove any existing labels
    const existingLabels = document.querySelectorAll('.default-handle-label');
    existingLabels.forEach(label => label.remove());
    
    // Hide value elements
    document.querySelectorAll('.range-slider-value').forEach(el => el.style.display = 'none');
    
    // Reset clips state
    this.cleanupMultiClipElements();
    
    // Reset the first clip in state
    if (this.state.clips && this.state.clips.length > 0) {
      this.state.clips[0] = { 
        id: 1, 
        startTime: 0, 
        endTime: this.duration || 0, 
        color: '#10B981' 
      };
      this.state.activeClipId = 1;
    }
  }
  
  cleanupMultiClipElements() {
    // Remove all additional clip handles and tracks
    this.handles.forEach((handles, clipId) => {
      if (clipId !== 1) { // Keep first clip
        if (handles.start) handles.start.remove();
        if (handles.end) handles.end.remove();
      }
    });
    
    this.valueElements.forEach((elements, clipId) => {
      if (clipId !== 1) { // Keep first clip
        if (elements.start) elements.start.remove();
        if (elements.end) elements.end.remove();
      }
    });
    
    this.rangeTracks.forEach((track, clipId) => {
      if (clipId !== 1) { // Keep first clip
        track.remove();
      }
    });
    
    // Clear the maps
    this.handles = new Map();
    this.valueElements = new Map();
    this.rangeTracks = new Map();
    
    // Set default references for first clip
    this.handles.set(1, { start: this.startHandle, end: this.endHandle });
    this.valueElements.set(1, { start: this.startValue, end: this.endValue });
    this.rangeTracks.set(1, this.rangeInner);
  }
  
  setupMultiClips(clips, activeClipId) {
    // Cleanup any existing elements first
    this.cleanupMultiClipElements();
    
    // Create elements for each clip
    clips.forEach(clip => {
      if (clip.id === 1) {
        // Use existing elements for the first clip
        this.handles.set(1, { start: this.startHandle, end: this.endHandle });
        this.valueElements.set(1, { start: this.startValue, end: this.endValue });
        this.rangeTracks.set(1, this.rangeInner);
        
        // Update the first clip's styling
        this.startHandle.style.backgroundColor = clip.color;
        this.endHandle.style.backgroundColor = clip.color;
        this.rangeInner.style.backgroundColor = clip.color;
        
        // Set z-index high enough to ensure handles are always clickable
        this.startHandle.style.zIndex = 20; // High base z-index
        this.endHandle.style.zIndex = 20;
      } else {
        // Create new elements for additional clips
        const startHandle = document.createElement('div');
        startHandle.className = 'range-slider-handle';
        startHandle.id = `startHandle-${clip.id}`;
        startHandle.style.backgroundColor = clip.color;
        startHandle.style.zIndex = 20; // High base z-index for all handles
        
        const endHandle = document.createElement('div');
        endHandle.className = 'range-slider-handle';
        endHandle.id = `endHandle-${clip.id}`;
        endHandle.style.backgroundColor = clip.color;
        endHandle.style.zIndex = 20;
        
        const rangeTrack = document.createElement('div');
        rangeTrack.className = 'range-slider-track-inner';
        rangeTrack.id = `rangeSliderInner-${clip.id}`;
        rangeTrack.style.backgroundColor = clip.color;
        rangeTrack.style.zIndex = 1 + clip.id; // Ensure tracks are stacked but below handles
        
        // Add elements to container
        this.container.appendChild(startHandle);
        this.container.appendChild(endHandle);
        this.container.insertBefore(rangeTrack, this.container.firstChild);
        
        // Store references
        this.handles.set(clip.id, { start: startHandle, end: endHandle });
        this.valueElements.set(clip.id, { start: null, end: null }); // Store null references for consistency
        this.rangeTracks.set(clip.id, rangeTrack);
        
        // Add event listeners for the new handles
        this.addHandleEventListeners(clip.id, startHandle, endHandle);
      }
      
      // Update positions based on clip times
      this.updateClipPositions(clip);
    });
    
    // Highlight the active clip
    this.setActiveClip(activeClipId);
  }
  
  updateClipPositions(clip) {
    const handles = this.handles.get(clip.id);
    const rangeTrack = this.rangeTracks.get(clip.id);
    
    if (!handles || !rangeTrack) return;
    
    // Update handle positions
    const startPercent = this.duration > 0 ? (clip.startTime / this.duration) * 100 : 0;
    const endPercent = this.duration > 0 ? (clip.endTime / this.duration) * 100 : 100;
    
    handles.start.style.left = `${startPercent}%`;
    handles.end.style.left = `${endPercent}%`;
    
    rangeTrack.style.left = `${startPercent}%`;
    rangeTrack.style.width = `${endPercent - startPercent}%`;
    
    // If this is the active clip, update the input fields
    if (clip.id === this.state.activeClipId) {
      this.startInput.value = Utils.formatTimeFromSeconds(clip.startTime);
      this.endInput.value = Utils.formatTimeFromSeconds(clip.endTime);
      document.getElementById('videoDurationDisplay').textContent = 
        Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
    }
  }
  
  setActiveClip(clipId) {
    this.state.activeClipId = clipId;
    
    // Update styling to highlight active clip
    this.handles.forEach((handles, id) => {
      const isActive = id === clipId;
      
      // Add/remove the white dot indicator class
      if (isActive) {
        handles.start.classList.add('active-dot');
        handles.end.classList.add('active-dot');
      } else {
        handles.start.classList.remove('active-dot');
        handles.end.classList.remove('active-dot');
      }
      
      // Always keep high z-index so all handles remain clickable
      // But give active handles an even higher z-index
      if (isActive) {
        handles.start.style.zIndex = 30; // Super high z-index for active handles
        handles.end.style.zIndex = 30;
      } else {
        handles.start.style.zIndex = 20; // Still high enough to be clickable
        handles.end.style.zIndex = 20;
      }
    });
    
    // Directly apply background to the active clip box
    const clipBoxEl = document.getElementById(`clip-selection-${clipId}`);
    if (clipBoxEl) {
      // Add the background class
      clipBoxEl.classList.add('bg-dark-700', 'rounded');
      
      // Remove it from other clip boxes
      this.state.clips.forEach(otherClip => {
        if (otherClip.id !== clipId) {
          const otherClipEl = document.getElementById(`clip-selection-${otherClip.id}`);
          if (otherClipEl) {
            otherClipEl.classList.remove('bg-dark-700', 'rounded');
          }
        }
      });
    }
    
    // Update the active clip's values to the input fields
    const activeClip = this.state.clips.find(clip => clip.id === clipId);
    if (activeClip) {
      this.startTime = activeClip.startTime;
      this.endTime = activeClip.endTime;
      this.startInput.value = Utils.formatTimeFromSeconds(activeClip.startTime);
      this.endInput.value = Utils.formatTimeFromSeconds(activeClip.endTime);
      document.getElementById('videoDurationDisplay').textContent = 
        Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    }
    
    // Update the UI to reflect the active clip
    if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
      this.state.updateClipSelectionUI();
    }
  }

  updateHandlePosition(handle, seconds) {
    const percent = this.duration > 0 ? (seconds / this.duration) * 100 : 0;
    handle.style.left = `${percent}%`;
  }

  updateRangeTrack() {
    const startPercent = this.duration > 0 ? (this.startTime / this.duration) * 100 : 0;
    const endPercent = this.duration > 0 ? (this.endTime / this.duration) * 100 : 100;
    this.rangeInner.style.left = `${startPercent}%`;
    this.rangeInner.style.width = `${endPercent - startPercent}%`;
    this.startInput.value = Utils.formatTimeFromSeconds(this.startTime);
    this.endInput.value = Utils.formatTimeFromSeconds(this.endTime);
    document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(this.endTime - this.startTime);
    
    // Update the active clip in state
    if (this.state.activeClipId && this.state.clips) {
      const clipIndex = this.state.clips.findIndex(clip => clip.id === this.state.activeClipId);
      if (clipIndex >= 0) {
        this.state.clips[clipIndex].startTime = this.startTime;
        this.state.clips[clipIndex].endTime = this.endTime;
      }
    }
  }

  adjustTime(isStart, increment) {
    const step = 1;
    
    // Get the active clip first
    const activeClip = this.state.clips.find(clip => clip.id === this.state.activeClipId);
    if (!activeClip) return;
    
    // Update the active clip's start or end time directly
    if (isStart) {
      const newTime = Math.max(0, Math.min(activeClip.startTime + increment * step, activeClip.endTime - step));
      activeClip.startTime = newTime;
      
      // For the first clip, also update the main startTime property for backward compatibility
      if (activeClip.id === 1) {
        this.startTime = newTime;
        this.updateHandlePosition(this.startHandle, this.startTime);
      }
      
      // For other clips, update the specific handle
      if (activeClip.id !== 1) {
        const activeHandles = this.handles.get(activeClip.id);
        if (activeHandles) {
          this.updateHandlePosition(activeHandles.start, newTime);
        }
      }
    } else {
      const newTime = Math.max(activeClip.startTime + step, Math.min(activeClip.endTime + increment * step, this.duration));
      activeClip.endTime = newTime;
      
      // For the first clip, also update the main endTime property for backward compatibility
      if (activeClip.id === 1) {
        this.endTime = newTime;
        this.updateHandlePosition(this.endHandle, this.endTime);
      }
      
      // For other clips, update the specific handle
      if (activeClip.id !== 1) {
        const activeHandles = this.handles.get(activeClip.id);
        if (activeHandles) {
          this.updateHandlePosition(activeHandles.end, newTime);
        }
      }
    }
    
    // Update the UI for the active clip
    this.updateClipPositions(activeClip);
    
    // Update the manual input fields
    document.getElementById('start').value = Utils.formatTimeFromSeconds(activeClip.startTime);
    document.getElementById('end').value = Utils.formatTimeFromSeconds(activeClip.endTime);
    document.getElementById('videoDurationDisplay').textContent = 
      Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    
    // Update the clip duration display for this specific clip
    const clipDurationEl = document.getElementById(`clip-duration-${activeClip.id}`);
    if (clipDurationEl) {
      clipDurationEl.textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    }
    
    // Update the clip selection UI to reflect the changes
    if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
      this.state.updateClipSelectionUI();
    }
  }

  addEventListeners() {
    this.addHandleEventListeners(1, this.startHandle, this.endHandle);
    
    this.container.addEventListener('click', (e) => {
      // Skip if clicking on any handle
      if (e.target.classList.contains('range-slider-handle')) return;
      
      const rect = this.container.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seconds = Math.round(percent * this.duration);
      
      // Find the active clip
      const activeClip = this.state.clips.find(clip => clip.id === this.state.activeClipId);
      if (!activeClip) return;
      
      // Find the index of active clip to check for adjacent clips
      const clipIndex = this.state.clips.findIndex(c => c.id === activeClip.id);
      
      // Determine whether to move the start or end handle
      if (Math.abs(seconds - activeClip.startTime) <= Math.abs(seconds - activeClip.endTime)) {
        // Moving start handle - check previous clip to prevent overlap
        let minAllowedTime = 0;
        if (clipIndex > 0) {
          const previousClip = this.state.clips[clipIndex - 1];
          minAllowedTime = previousClip.endTime;
        }
        
        // Apply constraints: can't go before previous clip or after current clip's end
        activeClip.startTime = Math.max(minAllowedTime, Math.min(seconds, activeClip.endTime - 1));
        this.startTime = activeClip.startTime;
      } else {
        // Moving end handle - check next clip to prevent overlap
        let maxAllowedTime = this.duration;
        if (clipIndex < this.state.clips.length - 1) {
          const nextClip = this.state.clips[clipIndex + 1];
          maxAllowedTime = nextClip.startTime;
        }
        
        // Apply constraints: can't go after next clip or before current clip's start
        activeClip.endTime = Math.min(maxAllowedTime, Math.max(seconds, activeClip.startTime + 1));
        this.endTime = activeClip.endTime;
      }
      
      // Update the slider
      this.updateClipPositions(activeClip);
      
      // Make sure to update the clip selection UI to show current durations
      if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
        // Force immediate update of clip length boxes
        requestAnimationFrame(() => {
          this.state.updateClipSelectionUI();
        });
      }
    });

    [this.startInput, this.endInput].forEach((input, i) => {
      input.addEventListener('input', () => {
        const timeArray = input.value.split(':').map(Number);
        let seconds = 0;
        if (timeArray.length === 3) seconds = timeArray[0] * 3600 + timeArray[1] * 60 + timeArray[2];
        else if (timeArray.length === 2) seconds = timeArray[0] * 60 + timeArray[1];
        else if (timeArray.length === 1) seconds = timeArray[0];

        if (!isNaN(seconds) && this.duration > 0) {
          const activeClip = this.state.clips.find(clip => clip.id === this.state.activeClipId);
          if (!activeClip) return;
          
          if (i === 0) {
            activeClip.startTime = Math.min(seconds, activeClip.endTime);
            this.startTime = activeClip.startTime;
          } else {
            activeClip.endTime = Math.max(seconds, activeClip.startTime);
            this.endTime = activeClip.endTime;
          }
          
          this.updateClipPositions(activeClip);
          
          // Update the clip duration display
          const clipDurationEl = document.getElementById(`clip-duration-${activeClip.id}`);
          if (clipDurationEl) {
            clipDurationEl.textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          }
          
          // Update the main duration display
          document.getElementById('videoDurationDisplay').textContent = 
            Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          
          // Update the clip selection UI to reflect changes
          if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
            this.state.updateClipSelectionUI();
          }
        }
      });
    });

    // Add change event listeners to capture arrow button changes
    [this.startInput, this.endInput].forEach((input, i) => {
      input.addEventListener('change', () => {
        const timeArray = input.value.split(':').map(Number);
        let seconds = 0;
        if (timeArray.length === 3) seconds = timeArray[0] * 3600 + timeArray[1] * 60 + timeArray[2];
        else if (timeArray.length === 2) seconds = timeArray[0] * 60 + timeArray[1];
        else if (timeArray.length === 1) seconds = timeArray[0];

        if (!isNaN(seconds) && this.duration > 0) {
          const activeClip = this.state.clips.find(clip => clip.id === this.state.activeClipId);
          if (!activeClip) return;
          
          if (i === 0) {
            activeClip.startTime = Math.min(seconds, activeClip.endTime);
            this.startTime = activeClip.startTime;
          } else {
            activeClip.endTime = Math.max(seconds, activeClip.startTime);
            this.endTime = activeClip.endTime;
          }
          
          this.updateClipPositions(activeClip);
          
          // Update the clip duration display
          const clipDurationEl = document.getElementById(`clip-duration-${activeClip.id}`);
          if (clipDurationEl) {
            clipDurationEl.textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          }
          
          // Update the main duration display
          document.getElementById('videoDurationDisplay').textContent = 
            Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          
          // Update the clip selection UI to reflect changes
          if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
            this.state.updateClipSelectionUI();
          }
        }
      });
    });

    document.getElementById('startIncrementBtn').addEventListener('click', () => this.adjustTime(true, 1));
    document.getElementById('startDecrementBtn').addEventListener('click', () => this.adjustTime(true, -1));
    document.getElementById('endIncrementBtn').addEventListener('click', () => this.adjustTime(false, 1));
    document.getElementById('endDecrementBtn').addEventListener('click', () => this.adjustTime(false, -1));
  }

  // Define handleMove as a proper class method
  handleMove(e) {
    if (!this.dragHandle || !this.activeHandleInfo) return;
    
    const rect = this.container.getBoundingClientRect();
    let percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seconds = Math.round(percent * this.duration);
    
    const clip = this.state.clips.find(c => c.id === this.activeHandleInfo.clipId);
    if (!clip) return;
    
    // Find the index of current clip
    const clipIndex = this.state.clips.findIndex(c => c.id === clip.id);
    
    if (this.activeHandleInfo.isStart) {
      // For start handle, check previous clip to prevent overlap
      let minAllowedTime = 0;
      if (clipIndex > 0) {
        const previousClip = this.state.clips[clipIndex - 1];
        minAllowedTime = previousClip.endTime;
      }
      
      // Apply constraints: can't go before previous clip or after current clip's end
      clip.startTime = Math.max(minAllowedTime, Math.min(seconds, clip.endTime - 1));
      this.startTime = clip.startTime;
    } else {
      // For end handle, check next clip to prevent overlap
      let maxAllowedTime = this.duration;
      if (clipIndex < this.state.clips.length - 1) {
        const nextClip = this.state.clips[clipIndex + 1];
        maxAllowedTime = nextClip.startTime;
      }
      
      // Apply constraints: can't go after next clip or before current clip's start
      clip.endTime = Math.min(maxAllowedTime, Math.max(seconds, clip.startTime + 1));
      this.endTime = clip.endTime;
    }
    
    // Update the clip position in the UI
    this.updateClipPositions(clip);
    
    // Real-time update of clip durations - directly update the relevant clip duration element
    const clipDurationEl = document.getElementById(`clip-duration-${clip.id}`);
    if (clipDurationEl) {
      clipDurationEl.textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
      
      // Ensure all durations have white text
      clipDurationEl.classList.remove('text-accent-500');
      clipDurationEl.classList.add('text-white', 'font-bold');
      
      // Make sure all clip durations have white text
      this.state.clips.forEach(otherClip => {
        const otherDurationEl = document.getElementById(`clip-duration-${otherClip.id}`);
        if (otherDurationEl) {
          otherDurationEl.classList.remove('text-accent-500');
          otherDurationEl.classList.add('text-white', 'font-bold');
        }
      });
    }
    
    // Also ensure the complete clip selection UI is updated periodically
    if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
      // Only call the full UI update occasionally to avoid performance issues
      if (!this._lastUIUpdate || Date.now() - this._lastUIUpdate > 200) {
        this._lastUIUpdate = Date.now();
        
        // First, ensure this clip is set as active
        if (this.state.activeClipId !== clip.id) {
          this.state.activeClipId = clip.id;
        }
        
        // Now update the UI to highlight the clip box with bg-dark-700
        this.state.updateClipSelectionUI();
        
        // Also explicitly set the background on the clip box
        const clipBoxEl = document.getElementById(`clip-selection-${clip.id}`);
        if (clipBoxEl) {
          // Add the background class
          clipBoxEl.classList.add('bg-dark-700', 'rounded');
          
          // Remove it from other clip boxes
          this.state.clips.forEach(otherClip => {
            if (otherClip.id !== clip.id) {
              const otherClipEl = document.getElementById(`clip-selection-${otherClip.id}`);
              if (otherClipEl) {
                otherClipEl.classList.remove('bg-dark-700', 'rounded');
              }
            }
          });
        }
      }
    }
  }
  
  // Define handleEnd as a proper class method
  handleEnd() {
    if (this.dragHandle) {
      this.dragHandle.classList.remove('active');
      this.dragHandle = null;
      this.activeHandleInfo = null;
    }
    document.removeEventListener('mousemove', this.handleMove);
    document.removeEventListener('mouseup', this.handleEnd);
  }

  addHandleEventListeners(clipId, startHandle, endHandle) {
    const handleStart = (e, handle, isStart) => {
      this.dragHandle = handle;
      this.activeHandleInfo = { clipId, isStart };
      // Apply active style to the handle being dragged
      this.dragHandle.classList.add('active');
      document.addEventListener('mousemove', this.handleMove);
      document.addEventListener('mouseup', this.handleEnd);
      e.preventDefault();
      
      // Set this clip as active
      this.setActiveClip(clipId);
    };

    startHandle.addEventListener('mousedown', (e) => handleStart(e, startHandle, true));
    endHandle.addEventListener('mousedown', (e) => handleStart(e, endHandle, false));
  }
}

export default RangeSlider;