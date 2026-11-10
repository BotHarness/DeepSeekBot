import { afterEach, expect, it, vi } from 'vitest';
import { createTextPlayback } from '../src/host/text-playback';

const bridge = vi.hoisted(() => ({ module: null as unknown }));
vi.mock('expo', () => ({ requireOptionalNativeModule: () => bridge.module }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.resetModules();
  bridge.module = null;
});

it('keeps the JS clock when the native module is absent', async () => {
  vi.stubEnv('EXPO_PUBLIC_TEXT_PLAYBACK', 'native');
  vi.useFakeTimers();
  const { createPlaybackRuntime } = await import('../src/host/playback-runtime.android');
  const runtime = createPlaybackRuntime();
  const callback = vi.fn();
  const cancel = runtime.schedule([], callback);
  cancel();
  vi.advanceTimersByTime(100);
  expect(callback).not.toHaveBeenCalled();
  runtime.schedule([], callback);
  vi.advanceTimersByTime(32);
  expect(callback).toHaveBeenCalledOnce();
});

it('ignores cancelled native frames and does not advance a player twice', async () => {
  vi.stubEnv('EXPO_PUBLIC_TEXT_PLAYBACK', 'native');
  const listeners = new Set<(token: number) => void>();
  const requests: number[] = [];
  const cancel = vi.fn();
  const nativePlayer = createTextPlayback('', 0);
  const advance = vi.spyOn(nativePlayer, 'advance');
  bridge.module = {
    NativeTextPlayback: class {
      constructor() {
        return nativePlayer;
      }
    },
    PlaybackClock: class {
      schedule(_players: unknown[], token: number) {
        requests.push(token);
      }
      cancel = cancel;
      addListener(_name: string, listener: (token: number) => void) {
        listeners.add(listener);
        return { remove: () => listeners.delete(listener) };
      }
    },
  };
  const { createPlaybackRuntime } = await import('../src/host/playback-runtime.android');
  const runtime = createPlaybackRuntime();
  const player = runtime.createPlayer('');
  player.receive('a long reply', true, 0);
  const callback = vi.fn();
  runtime.schedule([player], callback)();
  expect(cancel).toHaveBeenCalledOnce();
  runtime.schedule([player], callback);
  for (const listener of listeners) listener(requests[0]!);
  expect(callback).not.toHaveBeenCalled();
  for (const listener of listeners) listener(requests[1]!);
  expect(callback).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
  player.advance(32);
  expect(advance).not.toHaveBeenCalled();
});
