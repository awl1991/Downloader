// Manages clip creation, removal, and UI updates
import Utils from '../utils/utils.js';

export default class ClipManager {
  constructor(app) {
    this.app = app;
  }

  resetClips() {
    this.app.state.clips = [{ id: 1, startTime: 0, endTime: 0, color: '#10B981' }];
    this.app.state.activeClipId = 1;
    const clipSelectionContainer = document.getElementById('clipSelectionContainer');
    if (clipSelectionContainer) clipSelectionContainer.innerHTML = '';
  }

  addClip() {
    if (!this.hasEnoughSpaceForClip()) {
      this.app.logger.logOutput('Not enough space to add another clip. Please adjust existing clips to make room.', 'text-red-500');
      return;
    }
    const newClip = this.createNewClip();
    if (newClip) {
      this.app.state.clips.push(newClip);
      this.app.state.activeClipId = newClip.id;
      this.updateClipUI();
    }
  }

  hasEnoughSpaceForClip() {
    const duration = this.app.state.videoDurationSeconds || 0;
    const minSpaceNeeded = Math.max(Math.floor(duration * 0.05), 3);
    return this.checkClipSpace(duration, minSpaceNeeded);
  }

  checkClipSpace(duration, minSpaceNeeded) {
    if (!this.app.state.clips.length) return true;
    const sortedClips = [...this.app.state.clips].sort((a, b) => a.startTime - b.startTime);
    if (sortedClips[0].startTime >= minSpaceNeeded) return true;
    for (let i = 0; i < sortedClips.length - 1; i++) {
      if (sortedClips[i + 1].startTime - sortedClips[i].endTime >= minSpaceNeeded) return true;
    }
    const lastClip = sortedClips[sortedClips.length - 1];
    return duration - lastClip.endTime >= minSpaceNeeded;
  }

  createNewClip() {
    const clipColors = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444'];
    const newClipId = this.app.state.clips.length + 1;
    const colorIndex = (newClipId - 1) % clipColors.length;
    const duration = this.app.state.videoDurationSeconds || 0;
    
    // Calculate bubble width for spacing purposes only
    const bubbleWidthInSeconds = Math.max(duration * 0.05, 3);
    
    // Get previous clip
    const previousClip = this.app.state.clips[this.app.state.clips.length - 1];
    
    // Set clip duration to exactly 10% of the total video duration
    const clipDurationInSeconds = duration * 0.1;
    
    // Calculate start position: half bubble width after previous clip
    let startTime = 0;
    if (previousClip) {
      startTime = previousClip.endTime + (bubbleWidthInSeconds / 2);
      
      // Ensure we don't overlap with previous clip
      if (startTime <= previousClip.endTime) {
        startTime = previousClip.endTime + (bubbleWidthInSeconds / 2);
      }
    }
    
    // Check if there's enough room at the end of the video for the clip
    if (startTime + clipDurationInSeconds > duration) {
      // Not enough space at calculated position
      if (duration >= clipDurationInSeconds) {
        // If video is long enough, position at the end minus the clip duration
        startTime = Math.max(0, duration - clipDurationInSeconds);
        
        // If this would cause overlap, there's no room for another clip
        if (previousClip && startTime <= previousClip.endTime) {
          this.app.logger.logOutput('Not enough space for another clip', 'text-red-500');
          return null;
        }
      } else {
        // Video is shorter than the calculated clip duration
        this.app.logger.logOutput('Video is too short for another clip', 'text-red-500');
        return null;
      }
    }
    
    // Set end time to exactly the calculated duration after start time (or end of video if not enough room)
    const endTime = Math.min(startTime + clipDurationInSeconds, duration);
    
    // Final check - ensure we have enough space and aren't overlapping
    if (endTime - startTime < 1 || (previousClip && startTime < previousClip.endTime)) {
      this.app.logger.logOutput('Cannot add clip - not enough space', 'text-red-500');
      return null;
    }
    
    return { id: newClipId, startTime, endTime, color: clipColors[colorIndex] };
  }

  updateClipUI() {
    this.app.slider.setupMultiClips(this.app.state.clips, this.app.state.activeClipId);
    this.updateClipSelectionUI();
  }

  setActiveClip(clipId) {
    this.app.state.activeClipId = clipId;
    this.app.slider.setActiveClip(clipId);
    this.updateClipSelectionUI();
    this.updateManualInputs(clipId);
  }

  updateManualInputs(clipId) {
    const activeClip = this.app.state.clips.find(clip => clip.id === clipId);
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
    if (this.app.state.clips.length === 1) {
      this.app.state.clips[0].color = '#10B981';
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
    if (container.children.length !== this.app.state.clips.length) {
      container.innerHTML = '';
      this.app.state.clips.forEach(clip => this.createClipElement(container, clip));
    } else {
      this.app.state.clips.forEach(clip => this.updateExistingClipElement(clip));
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
    if (clip.id === this.app.state.activeClipId) element.classList.add('bg-dark-700', 'rounded');
  }

  createColorIndicator(clip) {
    const indicator = document.createElement('div');
    indicator.className = 'w-3 h-3 rounded-full mr-2';
    indicator.style.backgroundColor = clip.color;
    return indicator;
  }

  createClipText(clip) {
    const text = document.createElement('span');
    text.className = `text-xs ${clip.id === this.app.state.activeClipId ? 'text-white' : 'text-gray-400 font-bold'}`;
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
      if (clipText) clipText.className = `text-xs ${clip.id === this.app.state.activeClipId ? 'text-white' : 'text-gray-400 font-bold'}`;
      clipDuration.classList.add('text-white', 'font-bold');
      clipDuration.classList.remove('text-accent-500');
      clipEl.classList.toggle('bg-dark-700', clip.id === this.app.state.activeClipId);
      clipEl.classList.toggle('rounded', clip.id === this.app.state.activeClipId);
    }
  }

  removeClip(clipId) {
    const clipIndex = this.app.state.clips.findIndex(clip => clip.id === clipId);
    if (clipIndex === -1) return;
    
    // Special case: if this is the only clip, reset it to full duration instead of removing
    if (this.app.state.clips.length === 1 && this.app.state.videoDurationSeconds > 0) {
      this.app.state.clips[0].startTime = 0;
      this.app.state.clips[0].endTime = this.app.state.videoDurationSeconds;
      this.app.slider.setupMultiClips(this.app.state.clips, this.app.state.activeClipId);
      this.updateClipSelectionUI();
      this.updateManualInputs(this.app.state.clips[0].id);
      this.app.logger.logOutput(`Reset clip to full video duration`, 'text-accent-500');
      return;
    }
    
    // Normal case: remove the clip
    this.app.state.clips.splice(clipIndex, 1);
    this.handleClipRemoval();
    this.app.logger.logOutput(`Removed clip ${clipId}`, 'text-accent-500');
  }

  handleClipRemoval() {
    if (!this.app.state.clips.length) {
      this.resetToDefaultClip();
    } else {
      this.renumberClips();
      this.updateUIAfterRemoval();
    }
  }

  resetToDefaultClip() {
    this.app.state.clips.push({ id: 1, startTime: 0, endTime: this.app.state.videoDurationSeconds || 0, color: '#10B981' });
    this.app.state.activeClipId = 1;
    this.app.slider.setupDefault();
    this.updateClipSelectionUI();
  }

  renumberClips() {
    const clipColors = ['#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#EF4444'];
    this.app.state.clips.forEach((clip, index) => {
      const newId = index + 1;
      if (clip.id === this.app.state.activeClipId) this.app.state.activeClipId = newId;
      clip.id = newId;
      clip.color = clipColors[(newId - 1) % clipColors.length];
    });
    if (this.app.state.clips.length === 1) this.app.state.clips[0].color = '#10B981';
    if (this.app.state.activeClipId > this.app.state.clips.length) this.app.state.activeClipId = 1;
  }

  updateUIAfterRemoval() {
    this.app.slider.setupMultiClips(this.app.state.clips, this.app.state.activeClipId);
    this.updateClipSelectionUI();
    if (this.app.state.clips.length === 1) {
      const clipLengthLabel = document.querySelector('.flex.justify-between.items-center .flex.items-center label');
      if (clipLengthLabel) clipLengthLabel.textContent = 'Clip Length';
    }
  }

  updateClipsDuration() {
    this.app.state.clips.forEach(clip => {
      if (clip.endTime === 0 || clip.endTime > this.app.state.videoDurationSeconds) {
        clip.endTime = this.app.state.videoDurationSeconds;
      }
    });
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
}