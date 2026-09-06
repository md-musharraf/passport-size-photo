const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  licenseCheck: () => ipcRenderer.invoke('license-check'),
  licenseActivate: (key) => ipcRenderer.invoke('license-activate', key),
  licenseRequestTrial: () => ipcRenderer.invoke('license-request-trial'),
  licenseWipe: () => ipcRenderer.invoke('license-wipe'),
  getDashboardUrl: () => ipcRenderer.invoke('get-dashboard-url'),
  saveDashboardUrl: (url) => ipcRenderer.invoke('save-dashboard-url', url),
  isDashboardConfigured: () => ipcRenderer.invoke('is-dashboard-configured'),
  recordSync: () => ipcRenderer.invoke('record-sync'),
});


