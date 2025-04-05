// Manages the range slider UI for selecting video clip times
import Utils from '../utils/utils.js';

export default class RangeSlider {
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
    this.handles = new Map();
    this.valueElements = new Map();
    this.rangeTracks = new Map();
    this.activeHandleInfo = null;
    this.dragHandle = null;
    this.handleMove = this.handleMove.bind(this);
    this.handleEnd = this.handleEnd.bind(this);
  }

  setupTickMarks(duration) {
    document.getElementById('ticksContainer').innerHTML = '';
    this.initRangeSlider(duration);
  }

  initRangeSlider(duration) {
    this.duration = duration;
    if (this.state.clips && this.state.clips.length > 0) {
      const firstClip = this.state.clips[0];
      if (firstClip.startTime === 0 && firstClip.endTime === 0 && duration > 0) {
        firstClip.endTime = duration;
        this.state.clips[0] = firstClip;
      }
    }
    this.startTime = 0;
    this.endTime = duration;
    this.updateHandlePosition(this.startHandle, 0);
    this.updateHandlePosition(this.endHandle, duration);
    this.updateRangeTrack();
    this.addEventListeners();
    if (this.state.clips && this.state.clips.length > 0) {
      this.setupMultiClips(this.state.clips, this.state.activeClipId);
    }
  }

  setupDefault() {
    this.startHandle.style.left = '0%';
    this.endHandle.style.left = '100%'; // Still set to 100% for visual reset
    this.rangeInner.style.left = '0%';
    this.rangeInner.style.width = '100%';
    const existingLabels = document.querySelectorAll('.default-handle-label');
    existingLabels.forEach(label => label.remove());
    document.querySelectorAll('.range-slider-value').forEach(el => el.style.display = 'none');
    this.cleanupMultiClipElements();
    
    // Ensure clips and state are reset even if duration is unknown
    this.state.clips = [{ id: 1, startTime: 0, endTime: 0, color: '#10B981' }]; // Reset clips directly
    this.state.activeClipId = 1;
    this.duration = 0; // Reset duration to 0 until new video is loaded
    this.startTime = 0;
    this.endTime = 0;
    
    // Update input fields to reflect cleared state
    this.startInput.value = '00:00:00';
    this.endInput.value = '00:00:00';
    document.getElementById('videoDurationDisplay').textContent = '00:00:00';
  }

  cleanupMultiClipElements() {
    this.handles.forEach((handles, clipId) => {
      if (clipId !== 1) {
        if (handles.start) handles.start.remove();
        if (handles.end) handles.end.remove();
      }
    });
    this.valueElements.forEach((elements, clipId) => {
      if (clipId !== 1) {
        if (elements.start) elements.start.remove();
        if (elements.end) elements.end.remove();
      }
    });
    this.rangeTracks.forEach((track, clipId) => {
      if (clipId !== 1) track.remove();
    });
    this.handles = new Map();
    this.valueElements = new Map();
    this.rangeTracks = new Map();
    this.handles.set(1, { start: this.startHandle, end: this.endHandle });
    this.valueElements.set(1, { start: this.startValue, end: this.endValue });
    this.rangeTracks.set(1, this.rangeInner);
  }

  setupMultiClips(clips, activeClipId) {
    this.cleanupMultiClipElements();
    clips.forEach(clip => {
      if (clip.id === 1) {
        this.handles.set(1, { start: this.startHandle, end: this.endHandle });
        this.valueElements.set(1, { start: this.startValue, end: this.endValue });
        this.rangeTracks.set(1, this.rangeInner);
        this.startHandle.style.backgroundColor = clip.color;
        this.endHandle.style.backgroundColor = clip.color;
        this.rangeInner.style.backgroundColor = clip.color;
        this.startHandle.style.zIndex = 20;
        this.endHandle.style.zIndex = 20;
      } else {
        const startHandle = document.createElement('div');
        startHandle.className = 'range-slider-handle';
        startHandle.id = `startHandle-${clip.id}`;
        startHandle.style.backgroundColor = clip.color;
        startHandle.style.zIndex = 20;
        const endHandle = document.createElement('div');
        endHandle.className = 'range-slider-handle';
        endHandle.id = `endHandle-${clip.id}`;
        endHandle.style.backgroundColor = clip.color;
        endHandle.style.zIndex = 20;
        const rangeTrack = document.createElement('div');
        rangeTrack.className = 'range-slider-track-inner';
        rangeTrack.id = `rangeSliderInner-${clip.id}`;
        rangeTrack.style.backgroundColor = clip.color;
        rangeTrack.style.zIndex = 1 + clip.id;
        this.container.appendChild(startHandle);
        this.container.appendChild(endHandle);
        this.container.insertBefore(rangeTrack, this.container.firstChild);
        this.handles.set(clip.id, { start: startHandle, end: endHandle });
        this.valueElements.set(clip.id, { start: null, end: null });
        this.rangeTracks.set(clip.id, rangeTrack);
        this.addHandleEventListeners(clip.id, startHandle, endHandle);
      }
      this.updateClipPositions(clip);
    });
    this.setActiveClip(activeClipId);
  }

  updateClipPositions(clip) {
    const handles = this.handles.get(clip.id);
    const rangeTrack = this.rangeTracks.get(clip.id);
    if (!handles || !rangeTrack) return;
    const startPercent = this.duration > 0 ? (clip.startTime / this.duration) * 100 : 0;
    const endPercent = this.duration > 0 ? (clip.endTime / this.duration) * 100 : 100;
    handles.start.style.left = `${startPercent}%`;
    handles.end.style.left = `${endPercent}%`;
    rangeTrack.style.left = `${startPercent}%`;
    rangeTrack.style.width = `${endPercent - startPercent}%`;
    if (clip.id === this.state.activeClipId) {
      this.startInput.value = Utils.formatTimeFromSeconds(clip.startTime);
      this.endInput.value = Utils.formatTimeFromSeconds(clip.endTime);
      document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
    }
  }

  setActiveClip(clipId) {
    this.state.activeClipId = clipId;
    this.handles.forEach((handles, id) => {
      const isActive = id === clipId;
      if (isActive) {
        handles.start.classList.add('active-dot');
        handles.end.classList.add('active-dot');
        handles.start.style.zIndex = 30;
        handles.end.style.zIndex = 30;
      } else {
        handles.start.classList.remove('active-dot');
        handles.end.classList.remove('active-dot');
        handles.start.style.zIndex = 20;
        handles.end.style.zIndex = 20;
      }
    });
    const clipBoxEl = document.getElementById(`clip-selection-${clipId}`);
    if (clipBoxEl) {
      clipBoxEl.classList.add('bg-dark-700', 'rounded');
      this.state.clips.forEach(otherClip => {
        if (otherClip.id !== clipId) {
          const otherClipEl = document.getElementById(`clip-selection-${otherClip.id}`);
          if (otherClipEl) otherClipEl.classList.remove('bg-dark-700', 'rounded');
        }
      });
    }
    const activeClip = this.state.clips.find(clip => clip.id === clipId);
    if (activeClip) {
      this.startTime = activeClip.startTime;
      this.endTime = activeClip.endTime;
      this.startInput.value = Utils.formatTimeFromSeconds(activeClip.startTime);
      this.endInput.value = Utils.formatTimeFromSeconds(activeClip.endTime);
      document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    }
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
    const activeClip = this.state.clips.find(clip => clip.id === this.state.activeClipId);
    if (!activeClip) return;
    if (isStart) {
      const newTime = Math.max(0, Math.min(activeClip.startTime + increment * step, activeClip.endTime - step));
      activeClip.startTime = newTime;
      if (activeClip.id === 1) {
        this.startTime = newTime;
        this.updateHandlePosition(this.startHandle, this.startTime);
      }
      if (activeClip.id !== 1) {
        const activeHandles = this.handles.get(activeClip.id);
        if (activeHandles) this.updateHandlePosition(activeHandles.start, newTime);
      }
    } else {
      const newTime = Math.max(activeClip.startTime + step, Math.min(activeClip.endTime + increment * step, this.duration));
      activeClip.endTime = newTime;
      if (activeClip.id === 1) {
        this.endTime = newTime;
        this.updateHandlePosition(this.endHandle, this.endTime);
      }
      if (activeClip.id !== 1) {
        const activeHandles = this.handles.get(activeClip.id);
        if (activeHandles) this.updateHandlePosition(activeHandles.end, newTime);
      }
    }
    this.updateClipPositions(activeClip);
    document.getElementById('start').value = Utils.formatTimeFromSeconds(activeClip.startTime);
    document.getElementById('end').value = Utils.formatTimeFromSeconds(activeClip.endTime);
    document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    const clipDurationEl = document.getElementById(`clip-duration-${activeClip.id}`);
    if (clipDurationEl) clipDurationEl.textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
    if (this.state && typeof this.state.updateClipSelectionUI === 'function') this.state.updateClipSelectionUI();
  }

  addEventListeners() {
    this.addHandleEventListeners(1, this.startHandle, this.endHandle);
    this.container.addEventListener('click', (e) => {
      if (e.target.classList.contains('range-slider-handle')) return;
      const rect = this.container.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seconds = Math.round(percent * this.duration);
      const activeClip = this.state.clips.find(clip => clip.id === this.state.activeClipId);
      if (!activeClip) return;
      const clipIndex = this.state.clips.findIndex(c => c.id === activeClip.id);
      if (Math.abs(seconds - activeClip.startTime) <= Math.abs(seconds - activeClip.endTime)) {
        let minAllowedTime = 0;
        if (clipIndex > 0) {
          const previousClip = this.state.clips[clipIndex - 1];
          minAllowedTime = previousClip.endTime;
        }
        activeClip.startTime = Math.max(minAllowedTime, Math.min(seconds, activeClip.endTime - 1));
        this.startTime = activeClip.startTime;
      } else {
        let maxAllowedTime = this.duration;
        if (clipIndex < this.state.clips.length - 1) {
          const nextClip = this.state.clips[clipIndex + 1];
          maxAllowedTime = nextClip.startTime;
        }
        activeClip.endTime = Math.min(maxAllowedTime, Math.max(seconds, activeClip.startTime + 1));
        this.endTime = activeClip.endTime;
      }
      this.updateClipPositions(activeClip);
      if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
        requestAnimationFrame(() => this.state.updateClipSelectionUI());
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
          const clipDurationEl = document.getElementById(`clip-duration-${activeClip.id}`);
          if (clipDurationEl) clipDurationEl.textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          if (this.state && typeof this.state.updateClipSelectionUI === 'function') this.state.updateClipSelectionUI();
        }
      });
    });

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
          const clipDurationEl = document.getElementById(`clip-duration-${activeClip.id}`);
          if (clipDurationEl) clipDurationEl.textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(activeClip.endTime - activeClip.startTime);
          if (this.state && typeof this.state.updateClipSelectionUI === 'function') this.state.updateClipSelectionUI();
        }
      });
    });

    document.getElementById('startIncrementBtn').addEventListener('click', () => this.adjustTime(true, 1));
    document.getElementById('startDecrementBtn').addEventListener('click', () => this.adjustTime(true, -1));
    document.getElementById('endIncrementBtn').addEventListener('click', () => this.adjustTime(false, 1));
    document.getElementById('endDecrementBtn').addEventListener('click', () => this.adjustTime(false, -1));
  }

  handleMove(e) {
    if (!this.dragHandle || !this.activeHandleInfo) return;
    const rect = this.container.getBoundingClientRect();
    let percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seconds = Math.round(percent * this.duration);
    const clip = this.state.clips.find(c => c.id === this.activeHandleInfo.clipId);
    if (!clip) return;
    const clipIndex = this.state.clips.findIndex(c => c.id === clip.id);
    if (this.activeHandleInfo.isStart) {
      let minAllowedTime = 0;
      if (clipIndex > 0) {
        const previousClip = this.state.clips[clipIndex - 1];
        minAllowedTime = previousClip.endTime;
      }
      clip.startTime = Math.max(minAllowedTime, Math.min(seconds, clip.endTime - 1));
      this.startTime = clip.startTime;
    } else {
      let maxAllowedTime = this.duration;
      if (clipIndex < this.state.clips.length - 1) {
        const nextClip = this.state.clips[clipIndex + 1];
        maxAllowedTime = nextClip.startTime;
      }
      clip.endTime = Math.min(maxAllowedTime, Math.max(seconds, clip.startTime + 1));
      this.endTime = clip.endTime;
    }
    this.updateClipPositions(clip);
    const clipDurationEl = document.getElementById(`clip-duration-${clip.id}`);
    if (clipDurationEl) {
      clipDurationEl.textContent = Utils.formatTimeFromSeconds(clip.endTime - clip.startTime);
      clipDurationEl.classList.remove('text-accent-500');
      clipDurationEl.classList.add('text-white', 'font-bold');
      this.state.clips.forEach(otherClip => {
        const otherDurationEl = document.getElementById(`clip-duration-${otherClip.id}`);
        if (otherDurationEl) {
          otherDurationEl.classList.remove('text-accent-500');
          otherDurationEl.classList.add('text-white', 'font-bold');
        }
      });
    }
    if (this.state && typeof this.state.updateClipSelectionUI === 'function') {
      if (!this._lastUIUpdate || Date.now() - this._lastUIUpdate > 200) {
        this._lastUIUpdate = Date.now();
        if (this.state.activeClipId !== clip.id) this.state.activeClipId = clip.id;
        this.state.updateClipSelectionUI();
        const clipBoxEl = document.getElementById(`clip-selection-${clip.id}`);
        if (clipBoxEl) {
          clipBoxEl.classList.add('bg-dark-700', 'rounded');
          this.state.clips.forEach(otherClip => {
            if (otherClip.id !== clip.id) {
              const otherClipEl = document.getElementById(`clip-selection-${otherClip.id}`);
              if (otherClipEl) otherClipEl.classList.remove('bg-dark-700', 'rounded');
            }
          });
        }
      }
    }
  }

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
      this.dragHandle.classList.add('active');
      document.addEventListener('mousemove', this.handleMove);
      document.addEventListener('mouseup', this.handleEnd);
      e.preventDefault();
      this.setActiveClip(clipId);
    };
    startHandle.addEventListener('mousedown', (e) => handleStart(e, startHandle, true));
    endHandle.addEventListener('mousedown', (e) => handleStart(e, endHandle, false));
  }
}