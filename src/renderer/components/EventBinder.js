// Binds all event listeners to DOM elements
export default class EventBinder {
    constructor(app) {
        this.app = app;
        this.isFullscreen = false;
    }

    setupEventListeners() {
        this.bindWindowControls();
        this.bindFormControls();
        this.bindUrlInput();
        this.bindDownloadForm();
        this.bindElectronEvents();
        this.bindClipControls();
        this.bindConsoleToggle();
        this.loadSavedDownloadLocation();
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
        const clearBtn = document.getElementById('clearFormBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.app.formManager.clearForm());
        } else {
            console.warn('Clear form button not found');
        }
        
        document.getElementById('browseButton').addEventListener('click', () => this.handleBrowseButton());
        
        // Add event listener for direct changes to download location
        const downloadLocationInput = document.getElementById('downloadLocation');
        downloadLocationInput.addEventListener('change', () => {
            this.saveDownloadLocation(downloadLocationInput.value);
        });
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
        
        // Save the download location
        this.saveDownloadLocation(folderPath);
    }

    async loadSavedDownloadLocation() {
        try {
            const savedLocation = await window.electronAPI.getDownloadLocation();
            if (savedLocation) {
                const input = document.getElementById('downloadLocation');
                input.value = savedLocation;
                this.app.logger.logOutput('Loaded saved download location', 'text-gray-400');
            }
        } catch (error) {
            console.error('Error loading saved download location:', error);
        }
    }
    
    saveDownloadLocation(location) {
        if (location && location.trim()) {
            window.electronAPI.saveDownloadLocation(location)
                .catch(error => console.error('Error saving download location:', error));
        }
    }

    bindUrlInput() {
        const urlInput = document.getElementById('url');
        urlInput.addEventListener('click', () => this.app.urlHandler.handleUrlClick(urlInput));
        urlInput.addEventListener('paste', () => setTimeout(() => this.app.urlHandler.handleUrlChange(urlInput.value.trim()), 100));
        urlInput.addEventListener('blur', () => this.app.urlHandler.handleUrlChange(urlInput.value.trim()));
    }

    bindDownloadForm() {
        const form = document.getElementById('downloadForm');
        if (!form) {
            console.error('Form with ID "downloadForm" not found in the DOM');
            return;
        }
        form.addEventListener('submit', (e) => {
            console.log('Form submit event triggered');
            this.app.downloadHandler.handleSubmit(e);
        });
    }

    bindElectronEvents() {
        window.electronAPI.onDownloadUpdate((update) => this.app.downloadHandler.handleDownloadUpdate(update));
        window.electronAPI.onDownloadComplete((data) => this.app.downloadHandler.handleDownloadComplete(data));
    }

    bindClipControls() {
        const addClipBtn = document.getElementById('addClipBtn');
        if (addClipBtn) addClipBtn.addEventListener('click', () => this.app.clipManager.addClip());
    }

    bindConsoleToggle() {
        const toggleLogsBtn = document.getElementById('toggleLogs');
        if (toggleLogsBtn) toggleLogsBtn.addEventListener('click', () => this.app.logger.toggleConsoleVisibility(toggleLogsBtn));
    }
}