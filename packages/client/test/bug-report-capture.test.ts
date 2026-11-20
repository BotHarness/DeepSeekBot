// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';

const { domToBlob } = vi.hoisted(() => ({
  domToBlob: vi.fn(async (): Promise<Blob | null> => new Blob(['page'], { type: 'image/png' })),
}));
vi.mock('modern-screenshot', () => ({ domToBlob }));

import { CAPTURE_DOCK_ATTRIBUTE, openCapture } from '../src/client/bug-report-capture.js';

afterEach(() => {
  domToBlob.mockClear();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const png = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);

it('uses native window pixels on capable Desktop and retains the screenshot filename', async () => {
  const bytes = png();
  const desktop = {
    protocolVersion: 1,
    captureWindow: vi.fn(async () => ({ bytes, mediaType: 'image/png' })),
  };
  const getDisplayMedia = vi.fn();
  const source = await openCapture({
    dshDesktop: desktop,
    navigator: { mediaDevices: { getDisplayMedia } },
  });
  expect(source.kind).toBe('window');
  const file = await source.grab(new Date(2026, 10, 13, 9, 5, 7));
  expect(file.name).toBe('screenshot-20261113-090507.png');
  expect(file.type).toBe('image/png');
  expect(file.size).toBe(bytes.length);
  expect(desktop.captureWindow).toHaveBeenCalledWith();
  expect(domToBlob).not.toHaveBeenCalled();
  expect(getDisplayMedia).not.toHaveBeenCalled();
});

it('does not rasterize the page after a native refusal or malformed PNG', async () => {
  for (const captureWindow of [
    async () => {
      throw new Error('capture-refused');
    },
    async () => ({ bytes: new Uint8Array([1, 2]), mediaType: 'image/png' }),
    async () => ({ bytes: png(), mediaType: 'image/jpeg' }),
    async () => ({ bytes: new Uint8Array(25 * 1024 * 1024 + 1), mediaType: 'image/png' }),
  ]) {
    const source = await openCapture({ dshDesktop: { protocolVersion: 1, captureWindow } });
    await expect(source.grab()).rejects.toThrow();
  }
  expect(domToBlob).not.toHaveBeenCalled();
});

it('bounds a stalled native capture and ignores pixels arriving after stop', async () => {
  vi.useFakeTimers();
  let resolve!: (value: unknown) => void;
  const captureWindow = vi.fn(
    () =>
      new Promise<unknown>((done) => {
        resolve = done;
      }),
  );
  const source = await openCapture({ dshDesktop: { protocolVersion: 1, captureWindow } });
  const stalled = expect(source.grab()).rejects.toThrow('capture-timeout');
  await vi.advanceTimersByTimeAsync(3_000);
  await stalled;
  const stopped = expect(source.grab()).rejects.toThrow('capture-stopped');
  source.stop();
  resolve({ bytes: png(), mediaType: 'image/png' });
  await stopped;
  await expect(source.grab()).rejects.toThrow('capture-stopped');
  expect(captureWindow).toHaveBeenCalledTimes(2);
  expect(vi.getTimerCount()).toBe(0);
  expect(domToBlob).not.toHaveBeenCalled();
});

function fakeStream(state: { readyState: string }) {
  const stop = vi.fn(() => {
    state.readyState = 'ended';
  });
  const track = {
    get readyState() {
      return state.readyState;
    },
    stop,
  };
  return {
    stream: { getVideoTracks: () => [track], getTracks: () => [track] } as unknown as MediaStream,
    stop,
  };
}

it('captures the page itself in the Desktop app without asking to share the screen', async () => {
  const getDisplayMedia = vi.fn();
  const source = await openCapture({
    navigator: { mediaDevices: { getDisplayMedia } },
    dshDesktop: {},
  });
  expect(source.kind).toBe('page');
  expect(getDisplayMedia).not.toHaveBeenCalled();
  const file = await source.grab(new Date(2026, 10, 11, 9, 5, 7));
  expect(file.name).toBe('screenshot-20261111-090507.png');
  const [node, options] = domToBlob.mock.calls[0] as unknown as [
    Node,
    { filter(node: Node): boolean },
  ];
  expect(node).toBe(document.body);
  const dock = document.createElement('div');
  dock.setAttribute(CAPTURE_DOCK_ATTRIBUTE, '');
  expect(options.filter(dock)).toBe(false);
  expect(options.filter(document.createElement('main'))).toBe(true);
});

it('falls back to the page when screen sharing is refused', async () => {
  const getDisplayMedia = vi.fn(async () => {
    throw new DOMException('denied', 'NotAllowedError');
  });
  const source = await openCapture({ navigator: { mediaDevices: { getDisplayMedia } } });
  expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  expect(source.kind).toBe('page');
});

it('asks to share once, keeps the stream for every capture, and releases it on stop', async () => {
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  const state = { readyState: 'live' };
  const { stream, stop } = fakeStream(state);
  const getDisplayMedia = vi.fn(async () => stream);
  const source = await openCapture({ navigator: { mediaDevices: { getDisplayMedia } } });
  expect(source.kind).toBe('screen');
  source.stop();
  expect(stop).toHaveBeenCalledTimes(1);
  expect(getDisplayMedia).toHaveBeenCalledTimes(1);
  await source.grab();
  expect(domToBlob).toHaveBeenCalledTimes(1);
});
