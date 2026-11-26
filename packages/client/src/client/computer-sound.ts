export class ComputerSoundMissing extends Error {
  constructor() {
    super('No computer sound was shared.');
  }
}

export interface ComputerSound {
  readonly track: MediaStreamTrack;
  onEnded(listener: () => void): void;
  release(): void;
}

const SHARE_OPTIONS = {
  video: true,
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  systemAudio: 'include',
  selfBrowserSurface: 'exclude',
  surfaceSwitching: 'include',
} as DisplayMediaStreamOptions;

export async function openComputerSound(
  media: Partial<Pick<MediaDevices, 'getDisplayMedia'>> | undefined,
): Promise<ComputerSound> {
  if (media?.getDisplayMedia === undefined) throw new ComputerSoundMissing();
  let shared: MediaStream;
  try {
    shared = await media.getDisplayMedia(SHARE_OPTIONS);
  } catch {
    throw new ComputerSoundMissing();
  }
  for (const video of shared.getVideoTracks()) video.stop();
  const track = shared.getAudioTracks()[0];
  if (track === undefined || track.readyState === 'ended') {
    for (const other of shared.getTracks()) other.stop();
    throw new ComputerSoundMissing();
  }
  let released = false;
  let ended = false;
  const listeners = new Set<() => void>();
  track.addEventListener('ended', () => {
    ended = true;
    if (!released) for (const listener of [...listeners]) listener();
  });
  return {
    track,
    onEnded(listener) {
      if (released) return;
      if (ended) listener();
      else listeners.add(listener);
    },
    release() {
      released = true;
      listeners.clear();
      for (const other of shared.getTracks()) other.stop();
    },
  };
}

export interface SoundMix {
  readonly track: MediaStreamTrack;
  close(): void;
}

export function mixSound(mic: MediaStreamTrack, sound: MediaStreamTrack): SoundMix {
  if (typeof AudioContext !== 'function') throw new ComputerSoundMissing();
  const context = new AudioContext();
  try {
    const out = context.createMediaStreamDestination();
    context.createMediaStreamSource(new MediaStream([mic])).connect(out);
    context.createMediaStreamSource(new MediaStream([sound])).connect(out);
    void context.resume().catch(() => undefined);
    const track = out.stream.getAudioTracks()[0];
    if (track === undefined) throw new ComputerSoundMissing();
    return {
      track,
      close() {
        track.stop();
        void context.close().catch(() => undefined);
      },
    };
  } catch (error) {
    void context.close().catch(() => undefined);
    throw error;
  }
}
