const { app, BrowserWindow, desktopCapturer, ipcMain, screen, session } = require('electron');
const { join } = require('node:path');

const LIMIT = 128 * 1024;
let window;
let stopping = false;
let input = '';
let busy = false;
let primary;
let rendererReady = false;
let answerWaiter;

function write(value) {
  if (stopping) return;
  const line = JSON.stringify(value) + '\n';
  if (
    Buffer.byteLength(line) > LIMIT ||
    process.stdout.writableLength + Buffer.byteLength(line) > LIMIT
  ) {
    stop();
    return;
  }
  process.stdout.write(line);
}

function stop() {
  if (stopping) return;
  stopping = true;

  try {
    if (window && !window.isDestroyed()) window.destroy();
  } finally {
    app.exit(0);
  }
}

process.stdin.on('end', stop);
process.stdin.on('error', stop);
process.stdout.on('error', stop);
process.on('SIGTERM', stop);
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);

app.setPath('userData', process.env.BOTHARNESS_MEDIA_USER_DATA);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.whenReady().then(async () => {
  if (process.platform !== 'win32' || process.versions.electron !== '44.9.3') return stop();
  primary = screen.getPrimaryDisplay();
  if (primary.bounds.x !== 0 || primary.bounds.y !== 0) return stop();
  const captureSession = session.fromPartition('local-computer-video');
  window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: captureSession,
      preload: join(__dirname, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });
  const ownsFrame = (frame) => frame && frame === window?.webContents.mainFrame;
  captureSession.setPermissionCheckHandler(
    (contents, permission) =>
      contents === window?.webContents &&
      (permission === 'media' || permission === 'display-capture'),
  );
  captureSession.setPermissionRequestHandler((contents, permission, callback, details) => {
    callback(
      contents === window?.webContents &&
        (permission === 'display-capture' ||
          (permission === 'media' && !details.mediaTypes?.length)),
    );
  });
  captureSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (!ownsFrame(request.frame) || request.audioRequested || !request.videoRequested)
        return callback(null);
      try {
        const sources = await desktopCapturer.getSources({
          types: ['screen'],
          thumbnailSize: { width: 0, height: 0 },
        });
        const source = sources.find((item) => item.display_id === String(primary.id));
        if (stopping || !source) return callback(null);
        callback({ video: source });
      } catch {
        callback(null);
      }
    },
    { useSystemPicker: false },
  );
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', stop);
  window.on('unresponsive', stop);

  ipcMain.on('local-video-ready', (event) => {
    if (!ownsFrame(event.senderFrame)) return;
    rendererReady = true;
    write({ event: 'ready', version: 1, electron: process.versions.electron });
  });
  ipcMain.on('local-video-answer', (event, result) => {
    if (!ownsFrame(event.senderFrame)) return;
    answerWaiter?.(result === true);
    answerWaiter = undefined;
  });
  ipcMain.on('local-video-failed', (event) => {
    if (!ownsFrame(event.senderFrame)) return;
    write({ event: 'failed', code: 'helper-failed' });
    stop();
  });

  screen.on('display-removed', stop);
  screen.on('display-metrics-changed', stop);
  await window.loadFile(join(__dirname, 'renderer.html'));
});

async function command(message) {
  if (
    !message ||
    !Number.isSafeInteger(message.id) ||
    message.id < 1 ||
    typeof message.op !== 'string'
  )
    return stop();
  if (message.op === 'close') {
    write({ id: message.id, ok: true, value: null });
    return stop();
  }
  if (busy || !rendererReady) {
    write({ id: message.id, ok: false, code: busy ? 'queue-full' : 'not-ready' });
    return;
  }
  busy = true;
  try {
    let result;
    if (message.op === 'offer') {
      const width = Math.round(primary.size.width * primary.scaleFactor);
      const height = Math.round(primary.size.height * primary.scaleFactor);
      if (width < 1 || height < 1 || width > 8192 || height > 8192) throw new Error('Display size');
      result = await window.webContents.executeJavaScript(
        `window.localVideoStart(${width}, ${height})`,
        true,
      );
    } else if (message.op === 'answer') {
      if (typeof message.sdp !== 'string' || Buffer.byteLength(message.sdp) > 96 * 1024)
        throw new Error('signal');
      result = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          answerWaiter = undefined;
          reject(new Error('timeout'));
        }, 8000);
        answerWaiter = (ok) => {
          clearTimeout(timer);
          ok ? resolve(null) : reject(new Error('signal'));
        };
        window.webContents.send('local-video-answer', message.sdp);
      });
    } else if (message.op === 'stats') {
      result = await window.webContents.executeJavaScript('window.localVideoStats()');
    } else throw new Error('operation');
    write({ id: message.id, ok: true, value: result });
  } catch {
    write({
      id: message.id,
      ok: false,
      code: message.op === 'answer' ? 'signal-failed' : 'helper-failed',
    });
    stop();
  } finally {
    busy = false;
  }
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (stopping) return;
  input += chunk;
  if (Buffer.byteLength(input) > LIMIT) return stop();
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, newline);
    input = input.slice(newline + 1);
    try {
      void command(JSON.parse(line));
    } catch {
      stop();
    }
  }
});
