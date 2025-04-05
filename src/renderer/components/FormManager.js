// Manages form-related logic, including clearing and resetting fields
export default class FormManager {
    constructor(app) {
      this.app = app;
    }
  
    clearForm() {
        const downloadLocation = document.getElementById('downloadLocation').value;
        this.resetFormFields(downloadLocation);
        this.app.clipManager.resetClips(); // Resets clips in state
        this.app.slider.setupDefault();    // Corrected to call setupDefault()
        if (this.app.state.clips && this.app.state.clips.length > 0) {
          this.app.state.clips[0].endTime = 0; // Ensure endTime is 0 for new input
        }
        this.updateUIAfterClear(downloadLocation);
      }
  
    resetFormFields(downloadLocation) {
      document.getElementById('url').value = '';
      this.app.state.videoUrl = '';
      document.getElementById('videoDuration').textContent = '--:--:--';
      document.getElementById('durationInfo').classList.add('hidden');
      this.app.state.videoDurationSeconds = 0;
      document.getElementById('start').value = '';
      document.getElementById('end').value = '';
      document.getElementById('videoDurationDisplay').textContent = '00:00:00';
      document.getElementById('downloadLocation').value = downloadLocation;
    }
  
    updateUIAfterClear(downloadLocation) {
      requestAnimationFrame(() => {
        this.app.clipManager.updateClipSelectionUI();
        this.app.clipManager.updateClipHeaderText();
      });
      this.app.stateManager.switchToInitialState();
      this.app.downloadHandler.updateButtonState('idle');
      this.app.logger.logOutput('Form cleared while preserving download location. Ready for new input.', 'text-accent-500');
    }
  }