import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../native/local-video/renderer.js', import.meta.url), 'utf8');

function renderer() {
  let now = 100;
  let sourceFrame: (() => void) | undefined;
  let drawFrame: (() => void) | undefined;
  let framesEncoded: number | undefined = 1;
  let stopped = 0;
  const captureSettings = { width: 1920, height: 1080, resizeMode: 'none' };
  const capture = {
    getSettings: () => captureSettings,
    readyState: 'live',
    muted: false,
    applyConstraints: vi.fn(async () => undefined),
    addEventListener: vi.fn(),
    stop: () => {
      stopped += 1;
    },
  };
  const outputTrack = {
    requestFrame: vi.fn(),
    stop: () => {
      stopped += 1;
    },
    getSettings: () => ({ width: 1920, height: 1080 }),
  };
  const stream = { getVideoTracks: () => [capture], getTracks: () => [capture] };
  const video = {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 4,
    play: async () => undefined,
    requestVideoFrameCallback: (callback: () => void) => {
      sourceFrame = callback;
    },
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: vi.fn() }),
    captureStream: () => ({ getVideoTracks: () => [outputTrack], getTracks: () => [outputTrack] }),
  };
  const peerClosed = vi.fn();
  const peerConfig = vi.fn();
  class Peer {
    constructor(config: unknown) {
      peerConfig(config);
    }
    connectionState = 'connected';
    iceGatheringState = 'complete';
    localDescription = { type: 'offer', sdp: 'native-offer' };
    addEventListener = vi.fn();
    addTransceiver = () => ({
      setCodecPreferences: vi.fn(),
      sender: { getParameters: () => ({ encodings: [{}] }), setParameters: async () => undefined },
    });
    createOffer = async () => this.localDescription;
    setLocalDescription = async () => undefined;
    setRemoteDescription = async () => undefined;
    getStats = async () =>
      new Map([
        [
          'video',
          {
            type: 'outbound-rtp',
            kind: 'video',
            framesEncoded,
            bytesSent: framesEncoded === undefined ? undefined : framesEncoded * 100,
          },
        ],
      ]);
    close = peerClosed;
  }
  const browser: {
    localVideoBridge: { ready(): void; failed(): void; onAnswer(handler: unknown): void };
    addEventListener: ReturnType<typeof vi.fn>;
    localVideoStart?: (width: number, height: number) => Promise<unknown>;
    localVideoStats?: () => Promise<{
      captureAlive: boolean;
      status: string;
      framesEncoded: number;
    }>;
  } = {
    localVideoBridge: { ready: vi.fn(), failed: vi.fn(), onAnswer: vi.fn() },
    addEventListener: vi.fn(),
  };
  runInNewContext(source, {
    window: browser,
    performance: { now: () => now },
    navigator: { mediaDevices: { getDisplayMedia: async () => stream } },
    document: { createElement: (name: string) => (name === 'video' ? video : canvas) },
    RTCPeerConnection: Peer,
    RTCRtpSender: { getCapabilities: () => ({ codecs: [{ mimeType: 'video/VP8' }] }) },
    setInterval: (callback: () => void) => {
      drawFrame = callback;
      return 1;
    },
    clearInterval: vi.fn(),
    setTimeout,
    clearTimeout,
  });
  return {
    start: (width = 1920, height = 1080) => browser.localVideoStart!(width, height),
    stats: () => browser.localVideoStats!(),
    sourceFrame: () => sourceFrame?.(),
    duplicate: () => {
      drawFrame?.();
      if (framesEncoded !== undefined) framesEncoded += 1;
    },
    unknownCounters: () => {
      framesEncoded = undefined;
    },
    advance: (ms: number) => {
      now += ms;
    },
    capture,
    captureSettings,
    video,
    peerClosed,
    peerConfig,
    stopped: () => stopped,
  };
}

describe('Windows helper capture and video liveness', () => {
  it('uses unscaled physical capture when rounded display DIPs differ by one pixel', async () => {
    const app = renderer();
    app.captureSettings.width = 2560;
    app.captureSettings.height = 1440;
    app.video.videoWidth = 2560;
    app.video.videoHeight = 1440;
    expect(await app.start(2560, 1441)).toMatchObject({ display: { width: 2560, height: 1440 } });
    expect(app.capture.applyConstraints).toHaveBeenCalledWith({
      resizeMode: { exact: 'none' },
      frameRate: { min: 1, ideal: 30, max: 30 },
    });
  });

  it('refuses a capture track that reports resampling', async () => {
    const app = renderer();
    app.captureSettings.resizeMode = 'crop-and-scale';
    await expect(app.start()).rejects.toThrow('Display geometry mismatch');
    expect(app.peerConfig).not.toHaveBeenCalled();
  });

  it('keeps a static display live when actual source frames continue with unchanged pixels', async () => {
    const app = renderer();
    await app.start();
    for (let index = 0; index < 12; index += 1) {
      app.advance(1000);
      app.sourceFrame();
      app.duplicate();
      expect(await app.stats()).toMatchObject({ captureAlive: true, status: 'live' });
    }
    expect(app.peerConfig).toHaveBeenCalledWith({
      iceServers: [],
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
    });
  });

  it('does not let repeated canvas frames or advancing encoded counters conceal source capture loss', async () => {
    const app = renderer();
    await app.start();
    app.sourceFrame();
    app.duplicate();
    expect(await app.stats()).toMatchObject({ captureAlive: true, status: 'live' });
    app.advance(2100);
    app.duplicate();
    expect(app.capture.readyState).toBe('live');
    expect(await app.stats()).toMatchObject({ captureAlive: false, status: 'stalled' });
  });

  it('refuses scaled capture instead of sending input in a mismatched coordinate system', async () => {
    const app = renderer();
    app.video.videoWidth = 1280;
    await expect(app.start()).rejects.toThrow('Display geometry mismatch');
    expect(app.stopped()).toBe(1);
    expect(app.peerConfig).not.toHaveBeenCalled();
  });
  it('leaves unsupported counters absent and does not qualify unknown encoder progress', async () => {
    const app = renderer();
    await app.start();
    app.unknownCounters();
    app.sourceFrame();
    app.duplicate();
    const status = await app.stats();
    expect(status).not.toHaveProperty('framesEncoded');
    expect(status).not.toHaveProperty('bytesSent');
    expect(status.status).toBe('stalled');
  });
});
