import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { PassThrough, Readable } from 'node:stream';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../native/local-video/main.cjs', import.meta.url), 'utf8');

async function main(fakeStdinEof = false, platform = 'win32', permission = 'granted') {
  const commands = new PassThrough();
  const output: string[] = [];
  const primary = {
    id: 1,
    bounds: { x: 0, y: 0, width: 1707, height: 961 },
    size: { width: 1707, height: 961 },
    scaleFactor: 1.5,
    rotation: 0,
  };
  const screen = Object.assign(new EventEmitter(), { getPrimaryDisplay: () => primary });
  const app = {
    exit: vi.fn(),
    setPath: vi.fn(),
    commandLine: { appendSwitch: vi.fn() },
    whenReady: async () => undefined,
  };
  const ipcMain = new EventEmitter();
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    setWindowOpenHandler: vi.fn(),
    executeJavaScript: vi.fn(async () => ({
      offer: { type: 'offer', sdp: 'video' },
      display: { width: 2560, height: 1440 },
    })),
  });
  class BrowserWindow extends EventEmitter {
    webContents = contents;
    isDestroyed = () => false;
    destroy = vi.fn();
    async loadFile() {
      ipcMain.emit('local-video-ready', { senderFrame: contents.mainFrame });
    }
  }
  const electron = {
    app,
    BrowserWindow,
    desktopCapturer: {},
    systemPreferences: { getMediaAccessStatus: vi.fn(() => permission) },
    ipcMain,
    screen,
    session: {
      fromPartition: () => ({
        setPermissionCheckHandler: vi.fn(),
        setPermissionRequestHandler: vi.fn(),
        setDisplayMediaRequestHandler: vi.fn(),
      }),
    },
  };
  const fakeProcess = Object.assign(new EventEmitter(), {
    stdin: fakeStdinEof ? Readable.from([]) : new PassThrough(),
    stdout: Object.assign(new EventEmitter(), {
      writableLength: 0,
      write: (line: string) => output.push(line),
    }),
    env: { BOTHARNESS_MEDIA_USER_DATA: 'test' },
    platform,
    versions: { electron: '44.9.3' },
  });
  const readPipe = vi.fn(() => commands);
  runInNewContext(source, {
    require: (name: string) => {
      if (name === 'electron') return electron;
      if (name === 'node:path') return { join: (...parts: string[]) => parts.join('/') };
      if (name === 'node:fs') return { createReadStream: readPipe };
      throw new Error('Unexpected module ' + name);
    },
    process: fakeProcess,
    Buffer,
    __dirname: 'assets',
    setTimeout,
    clearTimeout,
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  return { app, screen, primary, commands, output, readPipe, contents };
}

describe('Windows media helper startup', () => {
  it('receives an offer command from the inherited pipe despite Electron fake stdin EOF', async () => {
    const helper = await main(true);
    expect(helper.app.exit).not.toHaveBeenCalled();
    expect(helper.readPipe).toHaveBeenCalledWith(null, { fd: 0, autoClose: false });
    helper.commands.write(JSON.stringify({ id: 1, op: 'offer' }) + '\n');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(helper.output.map((line) => JSON.parse(line))).toContainEqual({
      id: 1,
      ok: true,
      value: { offer: { type: 'offer', sdp: 'video' }, display: { width: 2560, height: 1440 } },
    });
    helper.commands.end();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(helper.app.exit).toHaveBeenCalledWith(0);
  });

  it('keeps ready alive across empty and secondary-display startup metric notifications', async () => {
    const helper = await main();
    helper.screen.emit('display-metrics-changed', {}, helper.primary, []);
    helper.screen.emit('display-metrics-changed', {}, { ...helper.primary, id: 2 }, ['workArea']);
    expect(helper.app.exit).not.toHaveBeenCalled();
    expect(helper.output.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({ event: 'ready', version: 1 }),
    );
    helper.commands.destroy();
  });

  it.each(['bounds', 'scaleFactor', 'rotation'] as const)(
    'stops when actual primary %s changes',
    async (field) => {
      const helper = await main();
      if (field === 'bounds') helper.primary.bounds = { ...helper.primary.bounds, width: 1600 };
      else helper.primary[field] += 1;
      helper.screen.emit('display-metrics-changed', {}, helper.primary, [field]);
      expect(helper.app.exit).toHaveBeenCalledWith(0);
      helper.commands.destroy();
    },
  );
});

describe('Mac media permission gate', () => {
  it('refuses capture before creating a window when Screen Recording is absent', async () => {
    const helper = await main(false, 'darwin', 'denied');
    expect(helper.app.exit).toHaveBeenCalled();
    expect(helper.output.map((line) => JSON.parse(line))).toContainEqual({
      event: 'failed',
      code: 'screen-recording-required',
    });
    expect(helper.contents.executeJavaScript).not.toHaveBeenCalled();
    helper.commands.destroy();
  });
  it('uses the same bounded video protocol on an authorized Mac', async () => {
    const helper = await main(false, 'darwin');
    expect(helper.app.exit).not.toHaveBeenCalled();
    expect(helper.output.map((line) => JSON.parse(line))).toContainEqual(
      expect.objectContaining({ event: 'ready' }),
    );
    helper.commands.destroy();
  });
});
