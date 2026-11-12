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
