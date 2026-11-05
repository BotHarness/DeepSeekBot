const { app, BrowserWindow, ipcMain, session } = require('electron');
const { join } = require('node:path');
const { createReadStream } = require('node:fs');
const commands = createReadStream(null, { fd: 0, autoClose: false });

const LIMIT = 128 * 1024;
const QUEUE = 8;
let window;
let stopping = false;
let input = '';
let rendererReady = false;
let queue = Promise.resolve();
let queued = 0;

function write(value) {
  if (stopping) return;
  const line = JSON.stringify(value) + '\n';
  if (
    Buffer.byteLength(line) > LIMIT ||
    process.stdout.writableLength + Buffer.byteLength(line) > 2 * LIMIT
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

commands.on('end', stop);
commands.on('error', stop);
process.stdout.on('error', stop);
process.on('SIGTERM', stop);
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);

app.setPath('userData', process.env.BOTHARNESS_MEDIA_USER_DATA);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns');
app.whenReady().then(async () => {
  if (!['win32', 'darwin'].includes(process.platform) || process.versions.electron !== '44.9.3')
    return stop();
  const callSession = session.fromPartition('botharness-call');
  window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: callSession,
      preload: join(__dirname, 'call-preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      webSecurity: true,
    },
  });
  const ownsFrame = (frame) => frame && frame === window?.webContents.mainFrame;
  callSession.setPermissionCheckHandler(() => false);
  callSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  callSession.setDisplayMediaRequestHandler((_request, callback) => callback(null));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.webContents.on('render-process-gone', stop);
  window.on('unresponsive', stop);
  ipcMain.on('call-ready', (event) => {
    if (!ownsFrame(event.senderFrame) || rendererReady) return;
    rendererReady = true;
    write({ event: 'ready', version: 1, electron: process.versions.electron });
  });
  ipcMain.on('call-pcm', (event, data) => {
    if (!ownsFrame(event.senderFrame)) return;
    if (typeof data !== 'string' || data.length > 16 * 1024) return stop();
    write({ event: 'pcm', data });
  });
  ipcMain.on('call-state', (event, state) => {
    if (!ownsFrame(event.senderFrame)) return;
    if (!['connected', 'failed', 'closed'].includes(state)) return stop();
    write({ event: 'state', state });
  });
  ipcMain.on('call-played', (event, playback, ok) => {
    if (!ownsFrame(event.senderFrame)) return;
    if (typeof playback !== 'string' || playback.length > 16) return stop();
    write({ event: 'played', playback, ok: ok === true });
  });
  await window.loadFile(join(__dirname, 'call-renderer.html'));
});

const OPS = {
  offer: () => 'window.callStart()',
  answer: (message) => {
    if (typeof message.sdp !== 'string' || Buffer.byteLength(message.sdp) > 96 * 1024)
      throw new Error('signal');
    return `window.callAnswer(${JSON.stringify(message.sdp)})`;
  },
  audio: (message) => {
    if (
      typeof message.playback !== 'string' ||
      !/^p[0-9]{1,8}$/.test(message.playback) ||
      typeof message.data !== 'string' ||
      message.data.length > 64 * 1024
    )
      throw new Error('audio');
    return `window.callAudio(${JSON.stringify(message.playback)}, ${JSON.stringify(message.data)})`;
  },
  play: (message) => {
    if (typeof message.playback !== 'string' || !/^p[0-9]{1,8}$/.test(message.playback))
      throw new Error('play');
    const mime = typeof message.mime === 'string' ? message.mime.slice(0, 40) : '';
    return `window.callPlay(${JSON.stringify(message.playback)}, ${JSON.stringify(mime)})`;
  },
  stop: (message) => {
    if (typeof message.playback !== 'string' || !/^p[0-9]{1,8}$/.test(message.playback))
      throw new Error('stop');
    return `window.callStop(${JSON.stringify(message.playback)})`;
  },
  stats: () => 'window.callStats()',
};

function helperCpu() {
  let total = 0;
  for (const metric of app.getAppMetrics()) total += metric.cpu?.percentCPUUsage ?? 0;
  return Math.round(total * 10) / 10;
}

function command(message) {
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
  if (!Object.hasOwn(OPS, message.op)) return stop();
  if (!rendererReady || queued >= QUEUE) {
    write({ id: message.id, ok: false, code: rendererReady ? 'queue-full' : 'not-ready' });
    return;
  }
  queued += 1;
  queue = queue.then(async () => {
    try {
      const value = await window.webContents.executeJavaScript(OPS[message.op](message), true);
      write({
        id: message.id,
        ok: true,
        value: message.op === 'stats' ? { ...value, cpuPercent: helperCpu() } : (value ?? null),
      });
    } catch {
      write({ id: message.id, ok: false, code: 'helper-failed' });
      if (message.op === 'offer' || message.op === 'answer') stop();
    } finally {
      queued -= 1;
    }
  });
}

commands.setEncoding('utf8');
commands.on('data', (chunk) => {
  if (stopping) return;
  input += chunk;
  if (Buffer.byteLength(input) > LIMIT) return stop();
  let newline;
  while ((newline = input.indexOf('\n')) >= 0) {
    const line = input.slice(0, newline);
    input = input.slice(newline + 1);
    try {
      command(JSON.parse(line));
    } catch {
      stop();
    }
  }
});
