// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Wallpaper } from '../src/client/wallpaper.js';
import { mountWallpaper } from '../src/client/wallpaper-layer.js';
import {
  DEFAULT_CROP,
  wallpaperPlacement,
  type WallpaperCrop,
} from '../src/client/wallpaper-store.js';
import { memoryWallpaperStore } from './wallpaper-memory.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.head.innerHTML = '';
});

describe('wallpaper layout coordinate ownership', () => {
  it.each(['image', 'video', 'poster'] as const)(
    'keeps %s crop fixed in window space through zoom and resize without replacing media',
    async (kind) => {
      const frame = document.createElement('div');
      frame.className = 'bh-workspace-mount';
      frame.dataset.workspaceEnabled = '';
      document.body.append(frame);
      let width = 1470,
        height = 923,
        zoom = 1;
      let resized = () => {};
      const observe = vi.fn();
      const disconnect = vi.fn();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            resized = callback;
          }
          observe = observe;
          disconnect = disconnect;
        },
      );
      vi.stubGlobal('BroadcastChannel', undefined);
      vi.spyOn(frame, 'getBoundingClientRect').mockImplementation(
        () => new DOMRect(0, 0, width, height),
      );
      const computed = window.getComputedStyle.bind(window);
      vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        if (!element.hasAttribute('data-bh-wallpaper')) return computed(element);
        const style = document.createElement('div').style;
        style.width = `${width / zoom}px`;
        style.height = `${height / zoom}px`;
        return style;
      });
      const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
      const release = vi.fn();
      const owner = new Wallpaper(memoryWallpaperStore().store, async (blob) => ({
        kind: kind === 'image' ? 'image' : 'video',
        blob,
        url: 'blob:accepted',
        width: 2800,
        height: 1200,
        release,
        ...(kind !== 'image' ? { poster: blob, posterUrl: 'blob:poster' } : {}),
        ...(kind === 'poster' ? { fallbackReason: 'wallpaper-decode-failed' } : {}),
      }));
      await owner.save(new Blob(['accepted']), DEFAULT_CROP, 'empty');
      const off = mountWallpaper(owner);
      const image = frame.querySelector('img')!;
      const video = frame.querySelector('video');
      try {
        const crops: WallpaperCrop[] = [DEFAULT_CROP, { x: 0.7, y: 0.2, zoom: 2 }];
        for (const crop of crops) {
          await owner.crop(crop, owner.getSnapshot().revision);
          for (const viewport of [
            [1470, 923],
            [923, 1470],
            [430, 300],
          ] as const) {
            [width, height] = viewport;
            const expected = wallpaperPlacement(2800, 1200, width, height, crop);
            for (let level = -8; level <= 8; level++) {
              zoom = 1.2 ** level;
              resized();
              for (const surface of [image, video]) {
                if (!surface) continue;
                for (const key of ['left', 'top', 'width', 'height'] as const)
                  expect(parseFloat(surface.style[key]) * zoom).toBeCloseTo(expected[key], 6);
              }
              expect(frame.querySelector('img')).toBe(image);
              expect(frame.querySelector('video')).toBe(video);
            }
          }
        }
        expect(observe).toHaveBeenCalledWith(frame.querySelector('[data-bh-wallpaper]'));
        expect(play.mock.calls.length).toBeLessThanOrEqual(1);
      } finally {
        off();
      }
      expect(disconnect).toHaveBeenCalled();
      expect(frame.hasAttribute('data-wallpaper-active')).toBe(false);
      expect(frame.querySelector('[data-bh-wallpaper]')).toBeNull();
      expect(release).toHaveBeenCalledTimes(1);
    },
  );
});
