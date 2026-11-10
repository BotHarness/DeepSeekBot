import { requireOptionalNativeModule } from 'expo';
import type { PlaybackRuntime } from './playback-runtime';
import { createTextPlayback, playbackTiming, type TextPlayback } from './text-playback';

type NativePlayer = TextPlayback;
type NativeClock = {
  schedule(players: NativePlayer[], token: number): void;
  cancel(): void;
  addListener(event: 'frame', listener: (token: number) => void): { remove(): void };
};
const native =
  process.env.EXPO_PUBLIC_TEXT_PLAYBACK === 'native'
    ? requireOptionalNativeModule<{
        NativeTextPlayback: new (initial: string, now: number) => NativePlayer;
        PlaybackClock: new () => NativeClock;
      }>('TextPlayback')
    : null;

export function createPlaybackRuntime(): PlaybackRuntime {
  if (native === null)
    return {
      createPlayer: createTextPlayback,
      schedule(_players, callback) {
        const timer = setTimeout(callback, playbackTiming.frame);
        return () => clearTimeout(timer);
      },
    };
  const clock = new native.PlaybackClock();
  const players = new WeakMap<TextPlayback, NativePlayer>();
  let token = 0;
  return {
    createPlayer(initial) {
      const player = new native.NativeTextPlayback(initial, Date.now());
      const wrapper: TextPlayback = {
        getSnapshot: () => player.getSnapshot(),
        receive: (text, finished, at) => player.receive(text, finished, at),
        advance: () => player.getSnapshot(),
        flush: () => player.flush(),
        resetClock: (at) => player.resetClock(at),
      };
      players.set(wrapper, player);
      return wrapper;
    },
    schedule(selected, callback) {
      const request = ++token;
      const subscription = clock.addListener('frame', (received) => {
        if (received !== request || token !== request) return;
        subscription.remove();
        callback();
      });
      clock.schedule(
        selected.map((player) => {
          const nativePlayer = players.get(player);
          if (nativePlayer === undefined) throw new Error('Unknown playback player');
          return nativePlayer;
        }),
        request,
      );
      return () => {
        subscription.remove();
        if (token === request) {
          token++;
          clock.cancel();
        }
      };
    },
  };
}
