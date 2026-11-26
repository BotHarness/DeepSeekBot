import { openMicrophone } from './mic-device.js';

export class MeetingSoundMissing extends Error {
  constructor() {
    super('No meeting sound was shared.');
  }
}

export interface MeetingSound {
  readonly stream: MediaStream;
  mute(muted: boolean): void;
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

export async function openMeetingSound(
  media:
    | (Pick<MediaDevices, 'getUserMedia'> & Partial<Pick<MediaDevices, 'getDisplayMedia'>>)
    | undefined,
): Promise<MeetingSound> {
  if (
    media?.getDisplayMedia === undefined ||
    media.getUserMedia === undefined ||
    typeof AudioContext !== 'function'
  )
    throw new MeetingSoundMissing();
  let shared: MediaStream;
  try {
    shared = await media.getDisplayMedia(SHARE_OPTIONS);
  } catch {
    throw new MeetingSoundMissing();
  }
  for (const video of shared.getVideoTracks()) video.stop();
  const sound = shared.getAudioTracks()[0];
  if (sound === undefined) {
    for (const track of shared.getTracks()) track.stop();
    throw new MeetingSoundMissing();
  }
  let released = false;
  let ended = false;
  const listeners = new Set<() => void>();
  sound.addEventListener('ended', () => {
    ended = true;
    if (!released) for (const listener of [...listeners]) listener();
  });
  const mic = await openMicrophone(media).then(
    (opened) => opened.stream,
    () => undefined,
  );
  let context: AudioContext | undefined;
  const release = () => {
    released = true;
    listeners.clear();
    for (const track of [...shared.getTracks(), ...(mic?.getTracks() ?? [])]) track.stop();
    void context?.close().catch(() => undefined);
  };
  if (ended || sound.readyState === 'ended') {
    release();
    throw new MeetingSoundMissing();
  }
  try {
    context = new AudioContext();
    const out = context.createMediaStreamDestination();
    context.createMediaStreamSource(new MediaStream([sound])).connect(out);
    const micGain = context.createGain();
    if (mic !== undefined) {
      context.createMediaStreamSource(mic).connect(micGain);
      micGain.connect(out);
    }
    void context.resume().catch(() => undefined);
    return {
      stream: out.stream,
      mute(muted) {
        micGain.gain.value = muted ? 0 : 1;
      },
      onEnded(listener) {
        if (released) return;
        if (ended) listener();
        else listeners.add(listener);
      },
      release,
    };
  } catch {
    release();
    throw new MeetingSoundMissing();
  }
}
