import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBrowserCallMedia } from '../src/client/call-media.js';
import {
  ComputerSoundMissing,
  openComputerSound,
  type ComputerSound,
} from '../src/client/computer-sound.js';

function track(kind: 'audio' | 'video', name: string = kind) {
  const listeners: (() => void)[] = [];
  const fake = {
    kind,
    name,
    enabled: true,
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

type FakeTrack = ReturnType<typeof track>;

function stream(...tracks: FakeTrack[]) {
  return {
    getTracks: () => tracks,
    getAudioTracks: () => tracks.filter((item) => item.kind === 'audio'),
    getVideoTracks: () => tracks.filter((item) => item.kind === 'video'),
  } as unknown as MediaStream;
}

class FakeContext {
  static made: FakeContext[] = [];
  closed = false;
  sources: unknown[] = [];
  readonly mixed = track('audio', 'mixed');
  constructor() {
    FakeContext.made.push(this);
  }
  createMediaStreamDestination = () => ({ stream: stream(this.mixed) });
  createMediaStreamSource = (source: unknown) => {
    this.sources.push(source);
    return { connect: () => undefined };
  };
  createAnalyser = () => ({
    fftSize: 0,
    getFloatTimeDomainData: () => undefined,
  });
  resume = async () => undefined;
  close = async () => {
    this.closed = true;
  };
}

class FakeSender {
  static current: FakeSender | undefined;
  sent: unknown;
  constructor(initial: unknown) {
    this.sent = initial;
    FakeSender.current = this;
  }
  replaceTrack = async (next: unknown) => {
    this.sent = next;
  };
}

class FakePeer {
  iceGatheringState = 'complete';
  localDescription: { sdp: string } | null = null;
  onconnectionstatechange: unknown = null;
  ontrack: unknown = null;
  setRemoteDescription = async () => undefined;
  getTransceivers = () => [];
  addTrack = (sent: unknown) => new FakeSender(sent);
  createAnswer = async () => ({ type: 'answer', sdp: 'answer' });
  setLocalDescription = async (answer: { sdp: string }) => {
    this.localDescription = answer;
  };
  addEventListener = () => undefined;
  removeEventListener = () => undefined;
  close = () => undefined;
}

function stubBrowser() {
  FakeContext.made = [];
  FakeSender.current = undefined;
  vi.stubGlobal('AudioContext', FakeContext);
  vi.stubGlobal('RTCPeerConnection', FakePeer);
  vi.stubGlobal(
    'MediaStream',
    class {
      constructor(readonly tracks: unknown[] = []) {}
    },
  );
}

function sharedSound(sound = track('audio', 'computer')) {
  let released = 0;
  const listeners: (() => void)[] = [];
  const owned: ComputerSound = {
    track: sound as unknown as MediaStreamTrack,
    onEnded: (listener) => listeners.push(listener),
    release: () => {
      released += 1;
    },
  };
  return {
    owned,
    released: () => released,
    end: () => {
      for (const listener of listeners) listener();
    },
  };
}

async function liveCall(open: () => Promise<ComputerSound>) {
  const mic = track('audio', 'mic');
  const media = createBrowserCallMedia(
    () => ({ getUserMedia: async () => stream(mic) }) as unknown as MediaDevices,
    { computerSound: open },
  );
  const heard: boolean[] = [];
  media.onComputerSound((on) => heard.push(on));
  await media.start({ callId: 'call-1', offer: 'offer' });
  return { media, mic, heard };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('computer sound in a call', () => {
  it('sends the microphone mixed with computer sound, then only the microphone again', async () => {
    stubBrowser();
    const share = sharedSound();
    const { media, mic, heard } = await liveCall(async () => share.owned);
    expect(FakeSender.current?.sent).toBe(mic);

    await expect(media.computerSound(true)).resolves.toBe(true);
    const mix = FakeContext.made.at(-1)!;
    expect(FakeSender.current?.sent).toBe(mix.mixed);
    expect(heard).toEqual([true]);

    media.mute(true);
    expect(mic.enabled).toBe(false);

    await expect(media.computerSound(false)).resolves.toBe(false);
    expect(FakeSender.current?.sent).toBe(mic);
    expect([mix.closed, share.released()]).toEqual([true, 1]);
    expect(heard).toEqual([true, false]);
  });

  it('falls back to the microphone when the person stops sharing from the browser', async () => {
    stubBrowser();
    const share = sharedSound();
    const { media, mic, heard } = await liveCall(async () => share.owned);
    await media.computerSound(true);
    share.end();
    await vi.waitFor(() => expect(heard).toEqual([true, false]));
    expect(FakeSender.current?.sent).toBe(mic);
    expect(share.released()).toBe(1);
  });

  it('releases a share that arrives after hangup', async () => {
    stubBrowser();
    const share = sharedSound();
    let grant: (sound: ComputerSound) => void = () => undefined;
    const { media, mic, heard } = await liveCall(
      () =>
        new Promise<ComputerSound>((resolve) => {
          grant = resolve;
        }),
    );
    const sharing = media.computerSound(true);
    media.stop();
    grant(share.owned);
    await expect(sharing).resolves.toBe(false);
    expect(share.released()).toBe(1);
    expect(FakeSender.current?.sent).toBe(mic);
    expect(heard).toEqual([]);
  });

  it('stops the share on hangup', async () => {
    stubBrowser();
    const share = sharedSound();
    const { media, heard } = await liveCall(async () => share.owned);
    await media.computerSound(true);
    media.stop();
    expect(share.released()).toBe(1);
    expect(heard).toEqual([true, false]);
  });

  it('asks the browser only once when the toggle is pressed twice', async () => {
    stubBrowser();
    const share = sharedSound();
    const open = vi.fn(async () => share.owned);
    const { media } = await liveCall(open);
    await Promise.all([media.computerSound(true), media.computerSound(true)]);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reports a cancelled share picker as missing sound', async () => {
    await expect(
      openComputerSound({
        getDisplayMedia: async () => {
          throw new DOMException('cancelled', 'NotAllowedError');
        },
      }),
    ).rejects.toBeInstanceOf(ComputerSoundMissing);
  });

  it('refuses a share without audio and stops its video', async () => {
    const video = track('video');
    await expect(
      openComputerSound({ getDisplayMedia: async () => stream(video) }),
    ).rejects.toBeInstanceOf(ComputerSoundMissing);
    expect(video.stopped).toBe(true);
  });
});
