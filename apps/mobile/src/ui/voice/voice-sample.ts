import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useCallback, useRef, useState } from 'react';

const LOAD_LIMIT_MS = 15_000;

export interface VoiceSample {
  readonly playing: string | undefined;
  readonly failed: boolean;
  toggle(id: string, url: string): void;
  stop(): void;
}

let audioMode: Promise<void> | undefined;

export function useVoiceSample(): VoiceSample {
  const [playing, setPlaying] = useState<string>();
  const [failed, setFailed] = useState(false);
  const current = useRef<{ player: AudioPlayer; timer: ReturnType<typeof setTimeout> }>(undefined);
  const release = useCallback(() => {
    const active = current.current;
    current.current = undefined;
    if (active === undefined) return;
    clearTimeout(active.timer);
    active.player.pause();
    active.player.remove();
  }, []);
  const stop = useCallback(() => {
    release();
    setPlaying(undefined);
  }, [release]);
  const toggle = useCallback(
    (id: string, url: string) => {
      const wasPlaying = playing === id;
      release();
      setFailed(false);
      if (wasPlaying) {
        setPlaying(undefined);
        return;
      }
      setPlaying(id);
      const player = createAudioPlayer(null);
      const finish = (failure: boolean) => {
        if (current.current?.player !== player) return;
        release();
        setPlaying(undefined);
        if (failure) setFailed(true);
      };
      const timer = setTimeout(() => {
        if (!player.isLoaded) finish(true);
      }, LOAD_LIMIT_MS);
      current.current = { player, timer };
      player.addListener('playbackStatusUpdate', (status) => {
        if (status.error !== undefined && status.error !== null) finish(true);
        else if (status.didJustFinish) finish(false);
      });
      audioMode ??= setAudioModeAsync({ playsInSilentMode: true }).catch(() => undefined);
      void audioMode.then(() => {
        if (current.current?.player !== player) return;
        try {
          player.replace({ uri: url });
          player.play();
        } catch {
          finish(true);
        }
      });
    },
    [playing, release],
  );
  return { playing, failed, toggle, stop };
}
