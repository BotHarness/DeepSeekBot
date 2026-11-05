const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('callBridge', {
  ready: () => ipcRenderer.send('call-ready'),
  pcm: (data) => ipcRenderer.send('call-pcm', data),
  state: (state) => ipcRenderer.send('call-state', state),
  played: (playback, ok) => ipcRenderer.send('call-played', playback, ok),
});
