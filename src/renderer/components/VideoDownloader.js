// Main class that initializes and coordinates all modules
import AppState from './AppState.js';
import RangeSlider from './RangeSlider.js';
import ProgressManager from './ProgressManager.js';
import FormManager from './FormManager.js';
import StateManager from './StateManager.js';
import EventBinder from './EventBinder.js';
import UrlHandler from './UrlHandler.js';
import ClipManager from './ClipManager.js';
import DownloadHandler from './DownloadHandler.js';
import Logger from './Logger.js';

export default class VideoDownloader {
  constructor() {
    this.state = new AppState();
    this.slider = new RangeSlider(this.state);
    this.progress = new ProgressManager();
    this.state.progressRing = this.progress;
    this.logger = new Logger();
    this.formManager = new FormManager(this);
    this.stateManager = new StateManager(this);
    this.eventBinder = new EventBinder(this);
    this.urlHandler = new UrlHandler(this);
    this.clipManager = new ClipManager(this);
    this.downloadHandler = new DownloadHandler(this);
    this.initialize();
  }

  initialize() {
    this.slider.setupDefault();
    this.eventBinder.setupEventListeners();
    this.clipManager.updateClipSelectionUI();
    this.logger.initializeConsoleOutput();
  }
}