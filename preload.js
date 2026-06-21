const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('streaming', {
  launch: (options) => ipcRenderer.invoke('moonlight:launch', options)
});

contextBridge.exposeInMainWorld('electronAPI', {
  onSetupProgress: (callback) => ipcRenderer.on('setup-progress', callback)
});
