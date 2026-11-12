const { contextBridge, ipcRenderer } = require('electron');
const diagnosticsEnabled = process.argv.includes('--botharness-call-diagnostics=1');
contextBridge.exposeInMainWorld('callBridge', {
  diagnosticsEnabled,
  connection: (snapshot) => {
    try {
      if (diagnosticsEnabled) ipcRenderer.send('call-connection', snapshot);
    } catch {}
  },
  ready: () => ipcRenderer.send('call-ready'),
  pcm: (data) => ipcRenderer.send('call-pcm', data),
  state: (state) => ipcRenderer.send('call-state', state),
  played: (playback, ok) => ipcRenderer.send('call-played', playback, ok),
});
