import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => {
  const listeners = new Map<string, (event: never) => void>();
  return {
    listeners,
    started: [] as unknown[][],
    stops: 0,
    keyframes: 0,
    module: {
      async callCameraStart(...args: unknown[]) {
        native.started.push(args);
        if (args[0] === 'back' && args[1] === 'deny')
          throw Object.assign(new Error('no'), { code: 'camera-denied' });
        return { position: args[0] };
      },
      async callCameraKeyframe(maxBytes: number) {
        native.keyframes += 1;
        return {
          jpeg: '/9j/',
          bytes: Math.min(maxBytes, 4_000),
          width: 720,
          height: 1280,
          prepareMs: 12,
        };
      },
      async callCameraStop() {
        native.stops += 1;
      },
      addListener(event: string, listener: (event: never) => void) {
        listeners.set(event, listener);
        return { remove: () => listeners.delete(event) };
      },
    },
  };
});

vi.mock('expo', () => ({ requireOptionalNativeModule: () => native.module }));

import { createPhoneCallCamera, PhoneCallCameraFailure } from '../src/host/call-camera';

const grey = (value: number) => btoa(String.fromCharCode(...new Array(64 * 36).fill(value)));
const thumb = async (value: number, atMs: number) => {
  native.listeners.get('onCallCameraThumb')?.({
    grey: grey(value),
    width: 64,
    height: 36,
    atMs,
  } as never);
  await new Promise((resolve) => setTimeout(resolve, 0));
};

it('runs the shared camera picker on native thumbnails and sends only keyframes', async () => {
  const frames: { score: number; skipped: number; bytes: number }[] = [];
  const pauses: boolean[] = [];
  const camera = createPhoneCallCamera({
    onKeyframe: (frame) => void frames.push(frame),
    onPause: (paused) => void pauses.push(paused),
  })!;
  await camera.start('front');
  expect(native.started.at(-1)).toEqual(['front', null, 64, 2]);
  await thumb(20, 0);
  await thumb(20, 500);
  await thumb(20, 1_000);
  await thumb(200, 1_500);
  await thumb(200, 2_000);
  expect(frames.map((frame) => frame.skipped)).toEqual([0, 3]);
  expect(frames[0]).toMatchObject({ source: 'camera', score: 1, bytes: 4_000, prepareMs: 12 });
  native.listeners.get('onCallCameraState')?.({ state: 'paused' } as never);
  native.listeners.get('onCallCameraState')?.({ state: 'resumed' } as never);
  expect(pauses).toEqual([true, false]);
  await thumb(200, 9_000);
  expect(frames).toHaveLength(3);
  camera.stop();
  await thumb(10, 9_500);
  expect(frames).toHaveLength(3);
  expect(native.stops).toBe(1);
});

it('names a refused camera and plays a test video in place of the camera', async () => {
  const camera = createPhoneCallCamera({ onKeyframe: () => undefined, onPause: () => undefined })!;
  await expect(camera.start('back', 'deny')).rejects.toEqual(
    new PhoneCallCameraFailure('camera-denied'),
  );
  await camera.start('front', 'file:///cache/story.mp4');
  expect(native.started.at(-1)?.[1]).toBe('file:///cache/story.mp4');
});
