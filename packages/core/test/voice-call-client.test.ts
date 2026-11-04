import { afterEach, describe, expect, it } from 'vitest';

import {
  createCallClient,
  readCallReadiness,
  type CallClientMedia,
  type CallClientState,
  type CallMediaState,
  type CallPost,
} from '../src/voice/call-client.js';
import { createVoiceCalls, type VoiceCallMedia } from '../src/voice/calls.js';
import { speech, silence, concat } from './voice-audio-fixtures.js';

const cleanup: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanup.splice(0).reverse()) close();
});

const flush = async (times = 5) => {
  for (let index = 0; index < times; index += 1)
    await new Promise((resolve) => setImmediate(resolve));
};

function setup(options: { readyAsr?: boolean } = {}) {
  let clock = 2_000_000;
  const hostSide = {
    onPcm: undefined as ((samples: Int16Array) => void) | undefined,
    onStatus: undefined as ((status: 'connected' | 'failed' | 'closed') => void) | undefined,
    played: 0,
  };
  const hostMedia: VoiceCallMedia = {
    availability: async () => 'ready',
    async open({ onPcm, onStatus }) {
      hostSide.onPcm = onPcm;
      hostSide.onStatus = onStatus;
      return {
        offer: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
        async answer() {
          queueMicrotask(() => onStatus('connected'));
        },
        async play() {
          hostSide.played += 1;
        },
        async close() {},
      };
    },
  };
  const sent: string[] = [];
  const calls = createVoiceCalls({
    bot: (slug) =>
      slug === 'mira'
        ? {
            slug,
            ...(options.readyAsr === false ? {} : { asr: { providerId: 'asr-000000000001' } }),
            voice: { providerId: 'tts-000000000001' },
          }
        : undefined,
    providers: {
      has: () => true,
      transcribe: async () => ({ text: '明天会下雨吗', latencyMs: 4 }),
      synthesize: async () => ({
        audio: new Uint8Array([0x49, 0x44, 0x33, 1]),
        mime: 'audio/mpeg',
      }),
    },
    media: () => hostMedia,
    async send({ body }) {
      sent.push(body);
    },
    busy: () => false,
    now: () => clock,
  });
  cleanup.push(() => void calls.dispose());
  let reachable = true;
  const post: CallPost = async (body) => {
    if (!reachable) throw new Error('offline');
    return calls.handle({ deviceId: 'phone-1' }, body);
  };
  const phone = {
    listeners: new Set<(state: CallMediaState, code?: string) => void>(),
    offers: [] as string[],
    muted: [] as boolean[],
    stopped: 0,
  };
  let gate: Promise<void> | undefined;
  const media: CallClientMedia = {
    async start({ offer }) {
      phone.offers.push(offer);
      if (gate !== undefined) await gate;
      return 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=sendrecv\r\n';
    },
    mute: (muted) => phone.muted.push(muted),
    stop: () => void (phone.stopped += 1),
    onState(listener) {
      phone.listeners.add(listener);
      return () => phone.listeners.delete(listener);
    },
  };
  const states: CallClientState[] = [];
  let tick: (() => void) | undefined;
  const client = createCallClient({
    post,
    media,
    onChange: (state) => states.push(state),
    now: () => clock,
    setInterval: (run) => {
      tick = run;
      return 1;
    },
    clearInterval: () => {
      tick = undefined;
    },
  });
  cleanup.push(() => client.dispose());
  return {
    client,
    post,
    states,
    hostSide,
    phone,
    sent,
    speak: (input: Omit<Parameters<typeof calls.speak>[0], 'at'>) =>
      calls.speak({ ...input, at: new Date(clock).toISOString() }),
    advance: async (ms: number) => {
      clock += ms;
      tick?.();
      await flush();
    },
    offline: () => {
      reachable = false;
    },
    slowStart: (wait: Promise<void>) => {
      gate = wait;
    },
    get ticking() {
      return tick !== undefined;
    },
  };
}

describe('phone call client', () => {
  it('opens a WebRTC call, answers the offer and follows heard speech and the Bot reply', async () => {
    const world = setup();
    await world.client.open('mira');
    expect(world.phone.offers).toHaveLength(1);
    expect(world.client.state()).toMatchObject({ status: 'live', muted: false });
    await flush();
    world.hostSide.onPcm!(concat(silence(200), speech(1200), silence(900)));
    await world.advance(1_000);
    expect(world.sent).toEqual(['明天会下雨吗']);
    const live = world.client.state();
    if (live.status !== 'live') throw new Error(live.status);
    expect(live.call.phase).toBe('listening');
    await world.speak({
      slug: 'mira',
      channelId: live.call.channelId,
      messageId: 'reply-1',
      body: '会下雨。',
    });
    await world.advance(1_000);
    await world.advance(1_000);
    const after = world.client.state();
    if (after.status !== 'live') throw new Error(after.status);
    expect(after.events.map((event) => event.type)).toEqual(
      expect.arrayContaining(['connected', 'speech-start', 'ack', 'sent', 'playing', 'played']),
    );
    expect(world.hostSide.played).toBe(2);
  });

  it('mutes the native track and the Host, and hangs up cleanly', async () => {
    const world = setup();
    await world.client.open('mira');
    await world.client.mute(true);
    expect(world.phone.muted).toEqual([true]);
    expect(world.client.state()).toMatchObject({
      status: 'live',
      muted: true,
      call: { muted: true },
    });
    world.hostSide.onPcm!(concat(speech(1200), silence(900)));
    await world.advance(1_000);
    expect(world.sent).toEqual([]);
    await world.client.hangup();
    expect(world.client.state()).toMatchObject({ status: 'ended', reason: 'hangup' });
    expect(world.phone.stopped).toBeGreaterThan(0);
    expect(world.ticking).toBe(false);
    expect(await world.post({ kind: 'status' })).toMatchObject({
      calls: [{ phase: 'ended', endReason: 'hangup' }],
    });
  });

  it('ends clearly when the Host stays unreachable past the heartbeat window', async () => {
    const world = setup();
    await world.client.open('mira');
    world.offline();
    await world.advance(3_000);
    expect(world.client.state()).toMatchObject({ status: 'live', reconnecting: true });
    await world.advance(6_000);
    expect(world.client.state()).toMatchObject({
      status: 'ended',
      reason: 'connection-lost',
      code: 'unreachable',
    });
    expect(world.phone.stopped).toBeGreaterThan(0);
  });

  it('ends when the phone peer fails and tells the Host', async () => {
    const world = setup();
    await world.client.open('mira');
    for (const listener of world.phone.listeners) listener('failed', 'connection-lost');
    await flush();
    expect(world.client.state()).toMatchObject({ status: 'ended', reason: 'media-failed' });
    expect(await world.post({ kind: 'status' })).toMatchObject({
      calls: [{ phase: 'ended', endReason: 'hangup' }],
    });
  });

  it('hangs up the Host call when the screen closes while the microphone starts', async () => {
    const world = setup();
    const media = world.client;
    let release: (() => void) | undefined;
    world.slowStart(new Promise<void>((resolve) => (release = resolve)));
    const opening = media.open('mira');
    await flush();
    media.dispose();
    release!();
    await opening;
    await flush();
    expect(world.phone.stopped).toBeGreaterThan(1);
    expect(await world.post({ kind: 'status' })).toMatchObject({
      calls: [{ phase: 'ended', endReason: 'hangup' }],
    });
  });

  it('reports a refusal and readiness with the missing Provider', async () => {
    const world = setup({ readyAsr: false });
    expect(await readCallReadiness(world.post, 'mira')).toMatchObject({
      ready: false,
      missing: ['asr'],
    });
    await world.client.open('mira');
    expect(world.client.state()).toMatchObject({
      status: 'ended',
      reason: 'refused',
      code: 'asr-not-configured',
    });
    expect(world.phone.offers).toEqual([]);
  });
});
