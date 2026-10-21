const { contextBridge, ipcRenderer } = require('electron');

// Deliberately small: the renderer can ask for the licence state and submit a
// key/trial, but can no longer wipe keys, reset the offline window or repoint
// the licence server (main.js talks to the dashboard itself).
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  licenseCheck: (opts) => ipcRenderer.invoke('license-check', opts),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseRequestTrial: () => ipcRenderer.invoke('license-request-trial'),
});
