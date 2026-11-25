import { openMicrophone } from './mic-device.js';

export class MeetingSoundMissing extends Error {
  constructor() {
    super('No meeting sound was shared.');
  }
}

export interface MeetingSound {
  readonly stream: MediaStream;
  mute(muted: boolean): void;
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
  media: Pick<MediaDevices, 'getUserMedia'> & Partial<Pick<MediaDevices, 'getDisplayMedia'>>,
  onEnded: () => void,
): Promise<MeetingSound> {
  if (media.getDisplayMedia === undefined || typeof AudioContext !== 'function')
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
  const mic = await openMicrophone(media).then(
    (opened) => opened.stream,
    () => undefined,
  );
  const context = new AudioContext();
  const out = context.createMediaStreamDestination();
  context.createMediaStreamSource(new MediaStream([sound])).connect(out);
  const micGain = context.createGain();
  if (mic !== undefined) {
    context.createMediaStreamSource(mic).connect(micGain);
    micGain.connect(out);
  }
  void context.resume().catch(() => undefined);
  let released = false;
  sound.addEventListener('ended', () => {
    if (!released) onEnded();
  });
  return {
    stream: out.stream,
    mute(muted) {
      micGain.gain.value = muted ? 0 : 1;
    },
    release() {
      released = true;
      for (const track of [...shared.getTracks(), ...(mic?.getTracks() ?? [])]) track.stop();
      void context.close().catch(() => undefined);
    },
  };
}
