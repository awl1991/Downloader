// Manages the application state, including video metadata, clips, and progress
export default class AppState {
    constructor() {
      this.videoDurationSeconds = 0;
      this._videoUrl = '';
      this.currentStage = 'initial';
      this.downloadStartTime = null;
      this.progressRing = null;
      this.clips = [{ id: 1, startTime: 0, endTime: 0, color: '#10B981' }];
      this.activeClipId = 1;
    }
  
    get videoUrl() { return this._videoUrl; }
    set videoUrl(value) { this._videoUrl = typeof value === 'string' ? value : String(value); }
  }