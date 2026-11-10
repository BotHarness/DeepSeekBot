import { createTextPlayback, playbackTiming, type TextPlayback } from './text-playback';

export type PlaybackRuntime = {
  createPlayer(initial: string): TextPlayback;
  schedule(players: TextPlayback[], callback: () => void): () => void;
};

export function createPlaybackRuntime(): PlaybackRuntime {
  return {
    createPlayer: createTextPlayback,
    schedule(_players, callback) {
      const timer = setTimeout(callback, playbackTiming.frame);
      return () => clearTimeout(timer);
    },
  };
}
