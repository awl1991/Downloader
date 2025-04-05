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
        document.getElementById('clearFormBtn').addEventListener('click', () => this.app.formManager.clearForm());
        document.getElementById('browseButton').addEventListener('click', () => this.handleBrowseButton());
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
    }

    bindUrlInput() {
        const urlInput = document.getElementById('url');
        urlInput.addEventListener('click', () => this.app.urlHandler.handleUrlClick(urlInput));
        urlInput.addEventListener('paste', () => setTimeout(() => this.app.urlHandler.handleUrlChange(urlInput.value.trim()), 100));
        urlInput.addEventListener('blur', () => this.app.urlHandler.handleUrlChange(urlInput.value.trim()));
    }

    // ... (other methods unchanged)
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

    bindFormControls() {
        const clearBtn = document.getElementById('clearFormBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => this.app.formManager.clearForm());
        } else {
            console.warn('Clear form button not found');
        }
        document.getElementById('browseButton').addEventListener('click', () => this.handleBrowseButton());
    }
    // ...

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