const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  downloadVideo: (options) => ipcRenderer.send('download-video', options),
  onDownloadUpdate: (callback) => ipcRenderer.on('download-update', (event, message) => callback(message)),
  onDownloadComplete: (callback) => ipcRenderer.on('download-complete', (event, data) => callback(data)),
  fetchVideoDuration: (url) => ipcRenderer.invoke('fetch-video-duration', url),
  getVideoTitle: (url) => ipcRenderer.invoke('get-video-title', url),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  getDependencyStatus: () => ipcRenderer.invoke('get-dependency-status'),
  openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
  windowControl: (action) => ipcRenderer.send('window-control', action),
  getDownloadLocation: () => ipcRenderer.invoke('get-download-location'),
  saveDownloadLocation: (location) => ipcRenderer.invoke('save-download-location', location)
});