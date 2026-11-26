import { afterEach, describe, expect, it, vi } from 'vitest';

import { MeetingSoundMissing, openMeetingSound } from '../src/client/meeting-sound.js';

function track(kind: 'audio' | 'video') {
  const listeners: (() => void)[] = [];
  const fake = {
    kind,
    readyState: 'live' as MediaStreamTrackState,
    stopped: false,
    stop() {
      fake.stopped = true;
    },
    addEventListener(_type: string, listener: () => void) {
      listeners.push(listener);
    },
    end() {
      fake.readyState = 'ended';
      for (const listener of listeners) listener();
    },
  };
  return fake;
}

function stream(...tracks: ReturnType<typeof track>[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((item) => item.kind === 'audio'),
    getVideoTracks: () => tracks.filter((item) => item.kind === 'video'),
  } as unknown as MediaStream;
}

class FakeContext {
  static fail = false;
  closed = false;
  constructor() {
    if (FakeContext.fail) throw new Error('too many contexts');
  }
  createMediaStreamDestination = () => ({ stream: stream() });
  createMediaStreamSource = () => ({ connect: () => undefined });
  createGain = () => ({ gain: { value: 1 }, connect: () => undefined });
  resume = async () => undefined;
  close = async () => {
    this.closed = true;
  };
}

afterEach(() => {
  FakeContext.fail = false;
  vi.unstubAllGlobals();
});

describe('meeting sound', () => {
  it('releases both inputs when the share ends while the microphone prompt is open', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('MediaStream', class {});
    const sound = track('audio');
    const mic = track('audio');
    let grant: (value: MediaStream) => void = () => undefined;
    const opening = openMeetingSound({
      getDisplayMedia: async () => stream(track('video'), sound),
      getUserMedia: () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    });
    await vi.waitFor(() => expect(grant).not.toBe(undefined));
    await new Promise((resolve) => setTimeout(resolve, 0));
    sound.end();
    grant(stream(mic));
    await expect(opening).rejects.toBeInstanceOf(MeetingSoundMissing);
    expect(mic.stopped).toBe(true);
  });

  it('releases both inputs when the audio graph cannot be built', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('MediaStream', class {});
    FakeContext.fail = true;
    const sound = track('audio');
    const mic = track('audio');
    await expect(
      openMeetingSound({
        getDisplayMedia: async () => stream(sound),
        getUserMedia: async () => stream(mic),
      }),
    ).rejects.toBeInstanceOf(MeetingSoundMissing);
    expect([sound.stopped, mic.stopped]).toEqual([true, true]);
  });

  it('tells a late listener that the share already ended, and stays quiet after release', async () => {
    vi.stubGlobal('AudioContext', FakeContext);
    vi.stubGlobal('MediaStream', class {});
    const sound = track('audio');
    const opened = await openMeetingSound({
      getDisplayMedia: async () => stream(sound),
      getUserMedia: async () => stream(track('audio')),
    });
    sound.end();
    const heard: string[] = [];
    opened.onEnded(() => heard.push('ended'));
    expect(heard).toEqual(['ended']);
    opened.release();
    opened.onEnded(() => heard.push('after release'));
    expect(heard).toEqual(['ended']);
  });
});
