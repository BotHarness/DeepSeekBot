const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('localVideoBridge', {
  ready: () => ipcRenderer.send('local-video-ready'),
  failed: () => ipcRenderer.send('local-video-failed'),
  onAnswer: (handler) => {
    ipcRenderer.on('local-video-answer', async (_event, sdp) => {
      try { await handler(sdp); ipcRenderer.send('local-video-answer', true); }
      catch { ipcRenderer.send('local-video-answer', false); }
    });
  },
});
