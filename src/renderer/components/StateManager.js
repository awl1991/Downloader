// Manages UI state transitions (initial, progress, result)
export default class StateManager {
    constructor(app) {
      this.app = app;
    }
  
    switchToInitialState() {
      this.app.state.currentStage = 'initial';
      this.toggleStateVisibility('initialState', true);
      this.toggleStateVisibility('progressState', false);
      this.toggleStateVisibility('resultState', false);
    }
  
    switchToProgressState() {
      this.app.state.currentStage = 'progress';
      this.toggleStateVisibility('initialState', false);
      this.toggleStateVisibility('progressState', true);
      this.toggleStateVisibility('resultState', false);
      this.app.progress.setProgress(0);
      document.getElementById('statusText').textContent = 'Initializing...';
      document.getElementById('output').innerHTML = '';
    }
  
    switchToResultState() {
      this.app.state.currentStage = 'result';
      this.toggleStateVisibility('initialState', false);
      this.toggleStateVisibility('progressState', false);
      this.toggleStateVisibility('resultState', true);
      this.app.progress.setProgress(100);
    }
  
    toggleStateVisibility(elementId, isVisible) {
      const element = document.getElementById(elementId);
      element.classList.toggle('hidden', !isVisible);
    }
  }