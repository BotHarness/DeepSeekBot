import { afterEach, describe, expect, it } from 'vitest';

import {
  CallMediaFailure,
  createCallClient,
  readCallReadiness,
  type CallClientMedia,
  type CallClientState,
  type CallMediaCode,
  type CallMediaState,
  type CallPost,
} from '../src/voice/call-client.js';
import type { VoiceCallResult, VoiceCallView } from '../src/voice/call-contract.js';
import { callEndView } from '../src/voice/call-view.js';
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

function setup(options: { readyAsr?: boolean; emit?: 'visible-changes' } = {}) {
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
    listeners: new Set<(state: CallMediaState, code?: CallMediaCode) => void>(),
    offers: [] as string[],
    muted: [] as boolean[],
    stopped: 0,
  };
  let gate: Promise<void> | undefined;
  let refusal: unknown;
  const media: CallClientMedia = {
    async start({ offer }) {
      phone.offers.push(offer);
      if (gate !== undefined) await gate;
      if (refusal !== undefined) throw refusal;
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
  const periods: number[] = [];
  const beats: number[] = [];
  const counted: CallPost = async (body) => {
    if (body['kind'] === 'heartbeat') beats.push(clock);
    return post(body);
  };
  const client = createCallClient({
    post: counted,
    media,
    onChange: (state) => states.push(state),
    ...(options.emit === undefined ? {} : { emit: options.emit }),
    now: () => clock,
    setInterval: (run, ms) => {
      tick = run;
      periods.push(ms);
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
    periods,
    beats,
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
    refuseStart: (error: unknown) => {
      refusal = error;
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

  it('slows the heartbeat in the background and beats at once on return', async () => {
    const world = setup();
    await world.client.open('mira');
    expect(world.periods).toEqual([1_000]);
    world.client.background(true);
    expect(world.periods).toEqual([1_000, 3_000]);
    const before = world.beats.length;
    world.client.background(true);
    expect(world.periods).toHaveLength(2);
    world.client.background(false);
    await flush();
    expect(world.periods).toEqual([1_000, 3_000, 1_000]);
    expect(world.beats.length).toBe(before + 1);
  });

  it('keeps a background call alive within the Host loss window', async () => {
    const world = setup();
    await world.client.open('mira');
    world.client.background(true);
    for (let index = 0; index < 10; index += 1) await world.advance(3_000);
    expect(world.client.state()).toMatchObject({ status: 'live', reconnecting: false });
    expect(await world.post({ kind: 'status' })).toMatchObject({
      calls: [{ phase: 'listening' }],
    });
  });

  it('starts in the background cadence when the app is already hidden', async () => {
    const world = setup();
    world.client.background(true);
    await world.client.open('mira');
    expect(world.periods).toEqual([3_000]);
  });

  it('renders only visible changes when asked, with the sync time for local clocks', async () => {
    const world = setup({ emit: 'visible-changes' });
    await world.client.open('mira');
    await world.advance(1_000);
    const settled = world.states.length;
    await world.advance(1_000);
    await world.advance(1_000);
    expect(world.states).toHaveLength(settled);
    const quiet = world.client.state();
    if (quiet.status !== 'live') throw new Error(quiet.status);
    expect(quiet.syncedAt).toBeLessThan(2_003_000);
    world.hostSide.onPcm!(concat(silence(200), speech(1200), silence(900)));
    await world.advance(1_000);
    expect(world.states.length).toBeGreaterThan(settled);
    const heard = world.client.state();
    if (heard.status !== 'live') throw new Error(heard.status);
    expect(heard.syncedAt).toBe(2_004_000);
    world.offline();
    await world.advance(1_000);
    await world.advance(1_000);
    const reconnecting = world.states.filter(
      (state) => state.status === 'live' && state.reconnecting,
    );
    expect(reconnecting).toHaveLength(1);
  });

  it('still renders every heartbeat by default', async () => {
    const world = setup();
    await world.client.open('mira');
    const opened = world.states.length;
    await world.advance(1_000);
    await world.advance(1_000);
    expect(world.states).toHaveLength(opened + 2);
  });

  it('ends when the phone peer fails and tells the Host', async () => {
    const world = setup();
    await world.client.open('mira');
    for (const listener of world.phone.listeners) listener('failed', 'ice-failed');
    await flush();
    expect(world.client.state()).toMatchObject({
      status: 'ended',
      reason: 'media-failed',
      mediaCode: 'ice-failed',
    });
    expect(await world.post({ kind: 'status' })).toMatchObject({
      calls: [{ phase: 'ended', endReason: 'hangup' }],
    });
  });

  it('hangs up quietly when the phone closes the call in the background', async () => {
    const world = setup();
    await world.client.open('mira');
    for (const listener of world.phone.listeners) listener('closed', 'background');
    await flush();
    expect(world.client.state()).toMatchObject({
      status: 'ended',
      reason: 'hangup',
      mediaCode: 'background',
    });
    expect(callEndView(world.client.state())?.notice).toBeUndefined();
    expect(await world.post({ kind: 'status' })).toMatchObject({
      calls: [{ phase: 'ended', endReason: 'hangup' }],
    });
  });

  it.each(['microphone-denied', 'microphone-missing'] as const)(
    'ends with %s from the media code, whatever the message says',
    async (code) => {
      const world = setup();
      world.refuseStart(new CallMediaFailure(code, 'Reworded for people.'));
      await world.client.open('mira');
      expect(world.client.state()).toMatchObject({
        status: 'ended',
        reason: 'media-failed',
        mediaCode: code,
        error: 'Reworded for people.',
      });
      expect(callEndView(world.client.state())?.notice).toBe(code);
      expect(await world.post({ kind: 'status' })).toMatchObject({
        calls: [{ phase: 'ended', endReason: 'hangup' }],
      });
    },
  );

  it('reads a coded native rejection and calls anything else unknown', async () => {
    const coded = setup();
    coded.refuseStart(Object.assign(new Error('native text'), { code: 'microphone-denied' }));
    await coded.client.open('mira');
    expect(coded.client.state()).toMatchObject({ mediaCode: 'microphone-denied' });
    const plain = setup();
    plain.refuseStart(new Error('microphone-denied'));
    await plain.client.open('mira');
    expect(plain.client.state()).toMatchObject({ mediaCode: 'unknown' });
    expect(callEndView(plain.client.state())?.notice).toBe('ended.media-failed');
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

function scriptedHost() {
  const posts: Record<string, unknown>[] = [];
  let phase: VoiceCallView['phase'] = 'listening';
  let endReason: VoiceCallView['endReason'];
  let heartbeat: VoiceCallResult | undefined;
  let signalGate: Promise<void> | undefined;
  const view = (): VoiceCallView => ({
    callId: 'call-0000000000000001',
    slug: 'mira',
    channelId: 'dm-mira',
    phase,
    muted: false,
    busy: false,
    media: 'webrtc',
    startedAt: 0,
    durationMs: 1_000,
    events: [],
    lastSeq: 0,
    offer: { type: 'offer', sdp: 'v=0' },
    ...(endReason === undefined ? {} : { endReason }),
  });
  const post: CallPost = async (body) => {
    posts.push(body);
    if (body['kind'] === 'signal' && signalGate !== undefined) await signalGate;
    if (body['kind'] === 'heartbeat' && heartbeat !== undefined) return heartbeat;
    if (body['kind'] === 'hangup') phase = 'ended';
    return { ok: true, call: view() } as VoiceCallResult;
  };
  let tick: (() => void) | undefined;
  let stopped = 0;
  const states: CallClientState[] = [];
  const client = createCallClient({
    post,
    media: {
      start: async () => 'v=0',
      mute: () => undefined,
      stop: () => void (stopped += 1),
      onState: () => () => undefined,
    },
    onChange: (state) => states.push(state),
    setInterval: (run) => {
      tick = run;
      return 1;
    },
    clearInterval: () => {
      tick = undefined;
    },
  });
  return {
    client,
    posts,
    states,
    kinds: () => posts.map((body) => body['kind']),
    stopped: () => stopped,
    beat: async () => {
      tick?.();
      await flush();
    },
    end(reason: VoiceCallView['endReason']) {
      phase = 'ended';
      endReason = reason;
    },
    answerHeartbeat(result: VoiceCallResult) {
      heartbeat = result;
    },
    holdSignal(wait: Promise<void>) {
      signalGate = wait;
    },
  };
}

describe('call client edges', () => {
  it('ends with the Host reason when a heartbeat reports the call ended', async () => {
    const host = scriptedHost();
    await host.client.open('mira');
    host.end('bot-unavailable');
    await host.beat();
    expect(host.client.state()).toMatchObject({ status: 'ended', reason: 'bot-unavailable' });
    expect(host.stopped()).toBeGreaterThan(0);
  });

  it('treats a revoked device as the Host stopping the call', async () => {
    const host = scriptedHost();
    await host.client.open('mira');
    host.answerHeartbeat({
      ok: false,
      code: 'device-revoked',
      error: 'revoked',
    } as unknown as VoiceCallResult);
    await host.beat();
    expect(host.client.state()).toMatchObject({
      status: 'ended',
      reason: 'host-stopped',
      code: 'device-revoked',
    });
  });

  it('hangs up the Host call when the screen closes or the Human hangs up mid-signal', async () => {
    for (const leave of ['dispose', 'hangup'] as const) {
      const host = scriptedHost();
      let release: (() => void) | undefined;
      host.holdSignal(new Promise<void>((done) => (release = done)));
      const opening = host.client.open('mira');
      await flush();
      if (leave === 'dispose') host.client.dispose();
      else await host.client.hangup();
      release!();
      await opening;
      await flush();
      expect(host.client.state()).toMatchObject({ status: 'ended', reason: 'hangup' });
      expect(host.kinds().filter((kind) => kind === 'hangup').length).toBeGreaterThan(0);
      expect(host.kinds().at(-1)).toBe('hangup');
    }
  });

  it('sends mute, visual and frame for the live call only', async () => {
    const host = scriptedHost();
    expect(await host.client.visual('camera')).toBeUndefined();
    expect(await host.client.frame({ source: 'camera', jpeg: 'AA==', score: 1, skipped: 0 })).toBe(
      undefined,
    );
    await host.client.open('mira');
    await host.client.mute(true);
    await host.client.mute(true);
    expect(await host.client.visual('off', 'paused')).toMatchObject({ ok: true });
    expect(
      await host.client.frame({ source: 'screen', jpeg: 'AA==', score: 0.4, skipped: 3 }),
    ).toMatchObject({ ok: true });
    const sent = host.posts.filter((body) =>
      ['mute', 'visual', 'frame'].includes(`${body['kind']}`),
    );
    expect(sent).toEqual([
      expect.objectContaining({ kind: 'mute', muted: true }),
      expect.objectContaining({ kind: 'visual', source: 'off', paused: true }),
      expect.objectContaining({
        kind: 'frame',
        source: 'screen',
        score: 0.4,
        skipped: 3,
        after: 0,
      }),
    ]);
    await host.client.hangup();
    expect(await host.client.visual('camera')).toBeUndefined();
  });
});
