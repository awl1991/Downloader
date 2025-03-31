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
  }

  setupTickMarks(duration) {
    document.getElementById('ticksContainer').innerHTML = '';
    this.initRangeSlider(duration);
  }

  initRangeSlider(duration) {
    this.duration = duration;
    this.startTime = 0;
    this.endTime = duration;
    this.updateHandlePosition(this.startHandle, this.startValue, 0);
    this.updateHandlePosition(this.endHandle, this.endValue, duration);
    this.updateRangeTrack();
    this.addEventListeners();
  }

  setupDefault() {
    this.startHandle.style.left = '0%';
    this.endHandle.style.left = '100%';
    this.rangeInner.style.left = '0%';
    this.rangeInner.style.width = '100%';
    ['start', 'end'].forEach((type, i) => {
      const id = `default${type.charAt(0).toUpperCase() + type.slice(1)}Label`;
      if (!document.getElementById(id)) {
        const label = document.createElement('div');
        label.id = id;
        label.className = 'default-handle-label';
        label.textContent = type.charAt(0).toUpperCase() + type.slice(1);
        label.style.left = i === 0 ? '0%' : '100%';
        this.container.appendChild(label);
      }
    });
    document.querySelectorAll('.range-slider-value').forEach(el => el.style.display = 'none');
  }

  updateHandlePosition(handle, valueElement, seconds) {
    const percent = this.duration > 0 ? (seconds / this.duration) * 100 : 0;
    handle.style.left = `${percent}%`;
    valueElement.style.left = `${percent}%`;
    valueElement.textContent = Utils.formatTimeShort(seconds);
  }

  updateRangeTrack() {
    const startPercent = this.duration > 0 ? (this.startTime / this.duration) * 100 : 0;
    const endPercent = this.duration > 0 ? (this.endTime / this.duration) * 100 : 100;
    this.rangeInner.style.left = `${startPercent}%`;
    this.rangeInner.style.width = `${endPercent - startPercent}%`;
    this.startInput.value = Utils.formatTimeFromSeconds(this.startTime);
    this.endInput.value = Utils.formatTimeFromSeconds(this.endTime);
    document.getElementById('videoDurationDisplay').textContent = Utils.formatTimeFromSeconds(this.endTime - this.startTime);
  }

  adjustTime(isStart, increment) {
    const step = 1;
    if (isStart) {
      const newTime = Math.max(0, Math.min(this.startTime + increment * step, this.endTime - step));
      this.startTime = newTime;
      this.updateHandlePosition(this.startHandle, this.startValue, this.startTime);
    } else {
      const newTime = Math.max(this.startTime + step, Math.min(this.endTime + increment * step, this.duration));
      this.endTime = newTime;
      this.updateHandlePosition(this.endHandle, this.endValue, this.endTime);
    }
    this.updateRangeTrack();
    const bubble = isStart ? this.startValue : this.endValue;
    bubble.classList.add('updated');
    setTimeout(() => bubble.classList.remove('updated'), 500);
  }

  addEventListeners() {
    let activeHandle = null;

    const handleStart = (e, handle) => {
      activeHandle = handle;
      activeHandle.classList.add('active');
      document.addEventListener('mousemove', this.handleMove);
      document.addEventListener('mouseup', this.handleEnd);
      e.preventDefault();
    };

    this.handleMove = (e) => {
      if (!activeHandle) return;
      const rect = this.container.getBoundingClientRect();
      let percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seconds = Math.round(percent * this.duration);

      if (activeHandle === this.startHandle) {
        this.startTime = Math.min(seconds, this.endTime);
        this.updateHandlePosition(this.startHandle, this.startValue, this.startTime);
      } else {
        this.endTime = Math.max(seconds, this.startTime);
        this.updateHandlePosition(this.endHandle, this.endValue, this.endTime);
      }
      this.updateRangeTrack();
    };

    this.handleEnd = () => {
      if (activeHandle) {
        activeHandle.classList.remove('active');
        activeHandle = null;
      }
      document.removeEventListener('mousemove', this.handleMove);
      document.removeEventListener('mouseup', this.handleEnd);
    };

    this.startHandle.addEventListener('mousedown', (e) => handleStart(e, this.startHandle));
    this.endHandle.addEventListener('mousedown', (e) => handleStart(e, this.endHandle));

    this.container.addEventListener('click', (e) => {
      if (e.target === this.startHandle || e.target === this.endHandle) return;
      const rect = this.container.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seconds = Math.round(percent * this.duration);
      if (Math.abs(seconds - this.startTime) <= Math.abs(seconds - this.endTime)) {
        this.startTime = Math.min(seconds, this.endTime);
        this.updateHandlePosition(this.startHandle, this.startValue, this.startTime);
      } else {
        this.endTime = Math.max(seconds, this.startTime);
        this.updateHandlePosition(this.endHandle, this.endValue, this.endTime);
      }
      this.updateRangeTrack();
    });

    [this.startInput, this.endInput].forEach((input, i) => {
      input.addEventListener('input', () => {
        const timeArray = input.value.split(':').map(Number);
        let seconds = 0;
        if (timeArray.length === 3) seconds = timeArray[0] * 3600 + timeArray[1] * 60 + timeArray[2];
        else if (timeArray.length === 2) seconds = timeArray[0] * 60 + timeArray[1];
        else if (timeArray.length === 1) seconds = timeArray[0];

        if (!isNaN(seconds) && this.duration > 0) {
          if (i === 0) {
            this.startTime = Math.min(seconds, this.endTime);
            this.updateHandlePosition(this.startHandle, this.startValue, this.startTime);
          } else {
            this.endTime = Math.max(seconds, this.startTime);
            this.updateHandlePosition(this.endHandle, this.endValue, this.endTime);
          }
          this.updateRangeTrack();
        }
      });
    });

    document.getElementById('startIncrementBtn').addEventListener('click', () => this.adjustTime(true, 1));
    document.getElementById('startDecrementBtn').addEventListener('click', () => this.adjustTime(true, -1));
    document.getElementById('endIncrementBtn').addEventListener('click', () => this.adjustTime(false, 1));
    document.getElementById('endDecrementBtn').addEventListener('click', () => this.adjustTime(false, -1));
  }
}

export default RangeSlider;