import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire, stripTypeScriptTypes } from 'node:module';
import { EventEmitter } from 'node:events';
import { afterAll, afterEach, expect, it, vi } from 'vitest';

// Exercise the actual source carried in the upstream patch, not a second implementation.
const patch = readFileSync(
  new URL('../../docs/research/patches/dsh-desktop-window-capture.patch', import.meta.url),
  'utf8',
).replaceAll('\r\n', '\n');
const added = patch.split('+++ b/apps/desktop/src/window-capture.ts\n')[1];
const source = added
  .split('\n')
  .filter((line) => line.startsWith('+'))
  .map((line) => line.slice(1))
  .join('\n');
const directory = mkdtempSync(join(tmpdir(), 'bh-native-capture-'));
const entry = join(directory, 'window-capture.cjs');
writeFileSync(
  entry,
  stripTypeScriptTypes(source).replace('export function', 'function') +
    '\nmodule.exports = { installDesktopWindowCapture };',
);
const { installDesktopWindowCapture } = createRequire(import.meta.url)(entry);
afterAll(() => rmSync(directory, { recursive: true, force: true }));
afterEach(() => vi.useRealTimers());

it('wires capture after the existing main-application authority has been initialized', () => {
  const mainPatch = patch.split('+++ b/apps/desktop/src/main.ts\n')[1].split('diff --git')[0];
  expect(mainPatch).toMatch(
    / installFileActions\(assertMainApplication, \(\) => hostUrl\)\n\+  const disposeWindowCapture = installDesktopWindowCapture\(ipcMain, assertMainApplication\)/u,
  );
  expect(patch).toContain(
    '+    captureWindow: () => ipcRenderer.invoke(DESKTOP_IPC.windowCapture)',
  );
});

function fixture(
  capture = async () => ({
    isEmpty: () => false,
    toPNG: () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  }),
) {
  let handler;
  const removeHandler = vi.fn();
  const frame = { url: 'dsh-app://app/' };
  const capturePage = vi.fn(capture);
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    isDestroyed: () => false,
    capturePage,
  });
  const window = {
    webContents: contents,
    isDestroyed: () => false,
    isVisible: () => true,
    isMinimized: () => false,
  };
  const event = { sender: contents, senderFrame: frame };
  const owner = (caller) => {
    if (caller !== event) throw new Error('unowned');
    return window;
  };
  const dispose = installDesktopWindowCapture(
    {
      handle: (_channel, callback) => {
        handler = callback;
      },
      removeHandler,
    },
    owner,
  );
  return {
    call: (...args) => handler(event, ...args),
    handler: (...args) => handler(...args),
    window,
    contents,
    event,
    frame,
    capturePage,
    dispose,
    removeHandler,
  };
}

it('returns only the owned window PNG through a no-argument operation', async () => {
  const f = fixture();
  const result = await f.call();
  expect(result).toEqual({
    mediaType: 'image/png',
    bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
  });
  expect(f.capturePage).toHaveBeenCalledWith();
  await expect(f.call({ windowId: 7 })).rejects.toThrow('capture-invalid-request');
  await expect(f.handler({ ...f.event })).rejects.toThrow('unowned');
  f.dispose();
  expect(f.removeHandler).toHaveBeenCalledWith('dsh-desktop:window-capture');
  await expect(f.call()).rejects.toThrow('capture-invalid-request');
});

it('rejects child frames, other origins, hidden and minimized windows before capture', async () => {
  const f = fixture();
  f.event.senderFrame = { url: 'dsh-app://app/' };
  await expect(f.call()).rejects.toThrow('capture-window-unavailable');
  f.event.senderFrame = f.frame;
  f.frame.url = 'https://example.com/';
  await expect(f.call()).rejects.toThrow('capture-window-unavailable');
  f.frame.url = 'dsh-app://app/';
  f.window.isVisible = () => false;
  await expect(f.call()).rejects.toThrow('capture-window-unavailable');
  f.window.isVisible = () => true;
  f.window.isMinimized = () => true;
  await expect(f.call()).rejects.toThrow('capture-window-unavailable');
  expect(f.capturePage).not.toHaveBeenCalled();
});

it('rejects pixels across navigation or disposal', async () => {
  let resolve;
  const f = fixture(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const pending = f.call();
  f.frame.url = 'dsh-app://app/another-document';
  resolve({ isEmpty: () => false, toPNG: () => Buffer.alloc(10) });
  await expect(pending).rejects.toThrow('capture-window-changed');
  const next = f.call();
  f.dispose();
  resolve({ isEmpty: () => false, toPNG: () => Buffer.alloc(10) });
  await expect(next).rejects.toThrow('capture-window-changed');
});

it.each([false, true])(
  'invalidates a capture across same-URL navigation (inPlace=%s)',
  async (inPlace) => {
    let resolve;
    const f = fixture(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const pending = f.call();
    f.contents.emit('did-start-navigation', {}, f.frame.url, inPlace, true);
    resolve({ isEmpty: () => false, toPNG: () => Buffer.alloc(10) });
    await expect(pending).rejects.toThrow('capture-window-changed');
    expect(f.contents.listenerCount('did-start-navigation')).toBe(0);
  },
);

it('bounds a native stall without overlapping Chromium capture jobs', async () => {
  vi.useFakeTimers();
  let resolve;
  const f = fixture(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  const stalled = expect(f.call()).rejects.toThrow('capture-timeout');
  await vi.advanceTimersByTimeAsync(2_500);
  await stalled;
  await expect(f.call()).rejects.toThrow('capture-busy');
  resolve({ isEmpty: () => false, toPNG: () => Buffer.alloc(10) });
  await Promise.resolve();
  expect(f.capturePage).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('releases the capture lease on failure and refuses empty or oversized images', async () => {
  const capture = vi
    .fn()
    .mockRejectedValueOnce(new Error('native-failed'))
    .mockResolvedValueOnce({ isEmpty: () => true })
    .mockResolvedValueOnce({
      isEmpty: () => false,
      toPNG: () => Buffer.alloc(25 * 1024 * 1024 + 1),
    });
  const f = fixture(capture);
  await expect(f.call()).rejects.toThrow('native-failed');
  await expect(f.call()).rejects.toThrow('capture-empty');
  await expect(f.call()).rejects.toThrow('capture-size-limit');
});
