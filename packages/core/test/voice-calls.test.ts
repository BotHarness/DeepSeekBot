import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type {
  VoiceCallEvent,
  VoiceCallMediaStats,
  VoiceCallResult,
  VoiceCallView,
} from '../src/voice/call-contract.js';
import { VOICE_CALL_HOST_OWNER } from '../src/voice/call-contract.js';
import {
  isChannelVoiceCallRecord,
  voiceCallDuration,
  voiceCallRecordBody,
  type ChannelVoiceCallRecord,
} from '../src/channels/voice-call-record.js';
import {
  createVoiceCalls,
  type CallSpeech,
  joinTranscripts,
  type VoiceCallBot,
  type VoiceCallMedia,
  type VoiceCallsDeps,
} from '../src/voice/calls.js';
import { createVoiceCallHttp } from '../src/voice/call-http.js';
import { VoiceProviders, wavFromPcm16 } from '../src/voice/providers.js';
import { clipDurationMs, joinAudio, type AudioClip } from '../src/voice/speech.js';
import { createTempRoot } from './helpers.js';
import { chunks, concat, cough, knock, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(256, 1)]);

function clipFor(text: string): Uint8Array {
  return new Uint8Array(
    Buffer.concat([Buffer.from([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]), Buffer.from(text)]),
  );
}

async function fakeSpeechService(transcripts: string[]) {
  const heard: { bytes: number; sampleRate: number; language: string | null }[] = [];
  const server: Server = createServer((request, response) => {
    const parts: Buffer[] = [];
    request.on('data', (chunk: Buffer) => parts.push(chunk));
    request.on('end', async () => {
      if (request.url === '/v1/audio/speech') {
        response.writeHead(200, { 'Content-Type': 'audio/mpeg' });
        response.end(MP3);
        return;
      }
      const form = await new Request('http://x', {
        method: 'POST',
        headers: new Headers(request.headers as Record<string, string>),
        body: Buffer.concat(parts),
      }).formData();
      const file = new Uint8Array(await (form.get('file') as File).arrayBuffer());
      heard.push({
        bytes: file.byteLength,
        sampleRate: new DataView(file.buffer).getUint32(24, true),
        language: form.get('language') as string | null,
      });
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ text: transcripts.shift() ?? '' }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`, heard };
}

async function realProviders() {
  const root = createTempRoot('voice-calls-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const owner = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  cleanup.push(async () => {
    owner.close();
    await fiber.dispose();
  });
  return new VoiceProviders({
    database: attachOperationalModule(owner, 'voice'),
    credentials: () => ctx.credentials,
  });
}

function fakeMedia(availability: Awaited<ReturnType<VoiceCallMedia['availability']>> = 'ready') {
  const state = {
    onPcm: undefined as ((samples: Int16Array) => void) | undefined,
    onStatus: undefined as ((status: 'connected' | 'failed' | 'closed') => void) | undefined,
    answers: [] as string[],
    played: [] as { bytes: number; mime: string }[],
    audio: [] as Uint8Array[],
    stopped: 0,
    closed: 0,
    gains: [] as number[],
    failGain: undefined as number | undefined,
    playDelay: undefined as Promise<void> | undefined,
    stats: undefined as VoiceCallMediaStats | undefined,
  };
  const media: VoiceCallMedia = {
    availability: async () => availability,
    async open({ onPcm, onStatus }) {
      state.onPcm = onPcm;
      state.onStatus = onStatus;
      return {
        offer: { type: 'offer', sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n' },
        async answer(answer) {
          state.answers.push(answer.sdp);
          queueMicrotask(() => onStatus('connected'));
        },
        async play(audio, mime, signal) {
          state.played.push({ bytes: audio.byteLength, mime });
          state.audio.push(audio.slice());
          if (state.playDelay === undefined) return;
          await new Promise<void>((resolve) => {
            const stop = () => {
              state.stopped += 1;
              resolve();
            };
            if (signal.aborted) return stop();
            signal.addEventListener('abort', stop, { once: true });
            void state.playDelay!.then(() => {
              signal.removeEventListener('abort', stop);
              resolve();
            });
          });
        },
        async setGain(gain) {
          if (state.failGain === gain) {
            state.failGain = undefined;
            throw new Error('refused');
          }
          state.gains.push(gain);
        },
        async stats() {
          return state.stats;
        },
        async close() {
          state.closed += 1;
        },
      };
    },
  };
  return { media, state };
}

function harness(
  options: {
    bot?: VoiceCallBot | undefined;
    providers?: VoiceCallsDeps['providers'];
    media?: VoiceCallMedia | undefined;
    busy?: () => boolean;
    send?: VoiceCallsDeps['send'];
    transcripts?: string[];
    bargeIn?: VoiceCallsDeps['bargeIn'];
    record?: VoiceCallsDeps['record'];
  } = {},
) {
  let clock = 1_000_000;
  const sent: { body: string; callId: string; channelId: string; messageId: string }[] = [];
  const log: string[] = [];
  const records: ChannelVoiceCallRecord[] = [];
  const bot: VoiceCallBot | undefined =
    'bot' in options
      ? options.bot
      : {
          slug: 'mira',
          asr: { providerId: 'asr-000000000001', language: 'zh' },
          voice: { providerId: 'tts-000000000001' },
        };
  const transcribed: Uint8Array[] = [];
  const transcripts = options.transcripts ?? ['帮我查一下明天的天气', '第二句话'];
  const synthesized: string[] = [];
  const providers: VoiceCallsDeps['providers'] = options.providers ?? {
    has: (id, kind) => id.startsWith(kind),
    async transcribe({ audio }) {
      transcribed.push(audio);
      return { text: transcripts.shift() ?? '', latencyMs: 5 };
    },
    async synthesize({ text }) {
      synthesized.push(text);
      return { audio: clipFor(text), mime: 'audio/mpeg' };
    },
  };
  const calls = createVoiceCalls({
    bot: (slug) => (slug === bot?.slug ? bot : undefined),
    providers,
    media: () => options.media,
    send:
      options.send ??
      (async (input) => {
        sent.push(input);
        log.push(`sent:${input.body}`);
      }),
    record:
      options.record ??
      (async ({ channelId, record }) => {
        expect(channelId).toBe('dm-mira');
        records.push(record);
        log.push(`record:${record.state}`);
        return `voice-call-${record.state}-${record.callId}`;
      }),
    busy: options.busy ?? (() => false),
    now: () => clock,
    ...(options.bargeIn === undefined ? {} : { bargeIn: options.bargeIn }),
  });
  cleanup.push(() => calls.dispose());
  const phone = { deviceId: 'phone-1' };
  const ok = async (command: Record<string, unknown>, caller = phone) => {
    const result = await calls.handle(caller, command);
    if (!result.ok) throw new Error(`${result.code}: ${result.error}`);
    return result;
  };
  return {
    calls,
    sent,
    log,
    records,
    transcribed,
    synthesized,
    phone,
    ok,
    at: () => new Date(clock).toISOString(),
    advance: (ms: number) => {
      clock += ms;
    },
    feed(onPcm: (samples: Int16Array) => void, audio: Int16Array) {
      for (const chunk of chunks(audio)) {
        clock += 20;
        onPcm(chunk);
      }
    },
  };
}

async function heard(speech: Promise<CallSpeech | undefined>): Promise<AudioClip | undefined> {
  const call = await speech;
  return call === undefined ? undefined : (await call.archive).clip;
}

const types = (events: readonly VoiceCallEvent[]) => events.map((event) => event.type);

async function settled() {
  for (let index = 0; index < 20; index += 1) await new Promise((resolve) => setImmediate(resolve));
}

async function connected(h: ReturnType<typeof harness>) {
  const opened = await h.ok({ kind: 'open', slug: 'mira' });
  const call = opened.call!;
  expect(call.phase).toBe('connecting');
  expect(call.offer?.sdp).toContain('m=audio');
  await h.ok({ kind: 'signal', callId: call.callId, answer: { type: 'answer', sdp: 'v=0\r\n' } });
  await settled();
  return call.callId;
}

async function view(h: ReturnType<typeof harness>, callId: string, after = 0) {
  return (await h.ok({ kind: 'heartbeat', callId, after })).call as VoiceCallView;
}

describe('Host call owner', () => {
  it('hears one sentence, posts the transcript to the DM and plays the committed voice reply', async () => {
    const service = await fakeSpeechService(['明天上海会下雨吗？']);
    const providers = await realProviders();
    const asr = await providers.add({ kind: 'asr', preset: 'custom', baseUrl: service.url });
    const tts = await providers.add({ preset: 'custom', baseUrl: service.url, defaultVoice: 'a' });
    const { media, state } = fakeMedia();
    const h = harness({
      providers,
      media,
      bot: {
        slug: 'mira',
        asr: { providerId: asr.id, language: 'zh' },
        voice: { providerId: tts.id },
      },
    });
    const callId = await connected(h);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(state.answers).toEqual(['v=0\r\n']);
    expect((await view(h, callId)).phase).toBe('listening');

    h.feed(state.onPcm!, concat(silence(400), speech(1500), silence(1000)));
    await settled();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await settled();

    expect(service.heard).toEqual([
      { bytes: expect.any(Number), sampleRate: 16_000, language: 'zh' },
    ]);
    expect(h.sent).toEqual([
      {
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: expect.stringMatching(/^human-/u),
        body: '明天上海会下雨吗？',
        callId,
      },
    ]);
    let current = await view(h, callId);
    expect(types(current.events)).toEqual([
      'connected',
      'speech-start',
      'ack',
      'transcribing',
      'sent',
    ]);

    h.advance(1_200);
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-reply-1',
        body: '会下雨，带伞。',
      }),
    );
    await settled();
    expect(archived).toEqual({ audio: new Uint8Array(MP3), mime: 'audio/mpeg' });
    expect(state.played).toEqual([
      { bytes: MP3.length, mime: 'audio/mpeg' },
      { bytes: MP3.length, mime: 'audio/mpeg' },
    ]);
    current = await view(h, callId, current.lastSeq);
    expect(current.events).toEqual([
      expect.objectContaining({ type: 'committed', messageId: 'bot-reply-1', reused: 0 }),
      expect.objectContaining({
        type: 'playing',
        messageId: 'bot-reply-1',
        sentence: 0,
        responseMs: 1_200,
      }),
      expect.objectContaining({ type: 'played', messageId: 'bot-reply-1' }),
      expect.objectContaining({ type: 'reply-done', messageId: 'bot-reply-1', sentences: 1 }),
    ]);
    expect(current.phase).toBe('listening');
  });

  it('drops the recording as soon as it is transcribed', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1200), silence(900)));
    await settled();
    expect(h.transcribed).toHaveLength(1);
    expect(h.transcribed[0]!.byteLength).toBeGreaterThan(30_000);
    expect(h.transcribed[0]!.every((byte) => byte === 0)).toBe(true);
  });

  it('ignores coughs, knocks and short noise', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(
      state.onPcm!,
      concat(
        silence(400),
        cough(350),
        silence(800),
        knock(),
        silence(300),
        cough(300),
        silence(900),
      ),
    );
    await settled();
    expect(h.transcribed).toEqual([]);
    expect(h.sent).toEqual([]);
    const current = await view(h, callId);
    expect(types(current.events)).not.toContain('speech-start');
    expect(types(current.events)).toContain('noise-discarded');
  });

  it('shows busy while the Orchestrator runs a turn and plays only the acknowledgement', async () => {
    let busy = false;
    const { media, state } = fakeMedia();
    const h = harness({ media, busy: () => busy });
    const callId = await connected(h);
    busy = true;
    const during = await view(h, callId);
    expect(during.busy).toBe(true);
    expect(types(during.events)).toContain('busy');
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.sent).toHaveLength(1);
    expect(state.audio).toEqual([clipFor('嗯。')]);
    busy = false;
    const after = await view(h, callId, during.lastSeq);
    expect(after.busy).toBe(false);
    expect(types(after.events)).toContain('idle');
  });

  it('does not show busy for the turn the call itself started', async () => {
    let busy = false;
    const { media, state } = fakeMedia();
    const h = harness({ media, busy: () => busy });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.sent).toHaveLength(1);
    busy = true;
    const answering = await view(h, callId);
    expect(answering.busy).toBe(false);
    expect(types(answering.events)).not.toContain('busy');
    busy = false;
    expect((await view(h, callId)).busy).toBe(false);
    busy = true;
    const other = await view(h, callId, answering.lastSeq);
    expect(other.busy).toBe(true);
    expect(types(other.events)).toContain('busy');
  });

  it('shows busy again when the own turn never starts', async () => {
    let busy = false;
    const { media, state } = fakeMedia();
    const h = harness({ media, busy: () => busy });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.sent).toHaveLength(1);
    h.advance(11_000);
    busy = true;
    expect((await view(h, callId)).busy).toBe(true);
  });

  it('mute stops hearing until unmuted', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await h.ok({ kind: 'mute', callId, muted: true });
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.transcribed).toEqual([]);
    await h.ok({ kind: 'mute', callId, muted: false });
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.transcribed).toHaveLength(1);
    expect(types((await view(h, callId)).events)).toEqual(
      expect.arrayContaining(['muted', 'unmuted', 'sent']),
    );
  });

  it('keeps the call going when recognition fails', async () => {
    const { media, state } = fakeMedia();
    let fail = true;
    const h = harness({
      media,
      providers: {
        has: () => true,
        async transcribe() {
          if (fail) {
            fail = false;
            const { VoiceError } = await import('../src/voice/providers.js');
            throw new VoiceError('provider-rate-limited', 'Out of quota.');
          }
          return { text: '再试一次', latencyMs: 1 };
        },
        synthesize: async ({ text }) => ({ audio: clipFor(text), mime: 'audio/mpeg' }),
      },
    });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    h.feed(state.onPcm!, concat(speech(1000), silence(900)));
    await settled();
    const events = (await view(h, callId)).events;
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'asr-failed', code: 'provider-rate-limited' }),
        expect.objectContaining({ type: 'sent', text: '再试一次' }),
      ]),
    );
  });

  it('ends a call whose phone stops sending heartbeats, keeping what was already sent', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(h.sent).toHaveLength(1);
    h.advance(9_000);
    await new Promise((resolve) => setTimeout(resolve, 1_100));
    const ended = (await h.calls.handle(h.phone, { kind: 'status' })) as Extract<
      VoiceCallResult,
      { ok: true }
    >;
    expect(ended.calls?.[0]).toMatchObject({ phase: 'ended', endReason: 'connection-lost' });
    expect(state.closed).toBe(1);
    expect(h.sent).toHaveLength(1);
  });

  it('samples media stats every five seconds and reports per-direction rates in the call view', async () => {
    const { media, state } = fakeMedia();
    const base = {
      uplinkPackets: 100,
      uplinkBytes: 10_000,
      uplinkLost: 0,
      concealedSamples: 0,
      receivedSamples: 48_000,
      downlinkPackets: 50,
      downlinkBytes: 5_000,
      helperCpuPct: 4,
    };
    state.stats = base;
    const h = harness({ media });
    const callId = await connected(h);
    expect((await view(h, callId)).perf).toBeUndefined();
    state.stats = {
      ...base,
      uplinkPackets: 129,
      uplinkBytes: 12_500,
      uplinkLost: 1,
      receivedSamples: 288_000,
      concealedSamples: 2_400,
      downlinkPackets: 300,
      downlinkBytes: 30_000,
      rttMs: 12,
    };
    h.advance(5_000);
    await view(h, callId);
    await settled();
    const perf = (await view(h, callId)).perf!;
    expect(perf.samples).toBe(1);
    expect(perf.last).toMatchObject({
      atMs: 5_000,
      uplinkPps: 5.8,
      uplinkKbps: 4,
      uplinkLossPct: 3.3,
      concealedPct: 1,
      downlinkPps: 50,
      downlinkKbps: 40,
      rttMs: 12,
      helperCpuPct: 4,
    });
    expect(perf.uplinkPps).toEqual({ avg: 5.8, max: 5.8 });
    expect(typeof perf.hostCpuPct.avg).toBe('number');
  });

  it('ends the call when the media fails', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    state.onStatus!('failed');
    await settled();
    expect(await view(h, callId)).toMatchObject({ phase: 'ended', endReason: 'media-failed' });
  });

  it('explains what is missing before a call can start', async () => {
    const h = harness({
      bot: { slug: 'mira', voice: { providerId: 'tts-000000000001' } },
      media: fakeMedia('helper-missing').media,
    });
    const result = await h.ok({ kind: 'readiness', slug: 'mira' });
    expect(result.readiness).toMatchObject({
      ready: false,
      missing: ['asr', 'media-helper-missing'],
      ttsProviderId: 'tts-000000000001',
      asrProviderId: null,
    });
    expect(await h.calls.handle(h.phone, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'asr-not-configured',
    });
    const off = harness({
      media: fakeMedia().media,
      providers: {
        has: () => true,
        localServiceOff: async (_id, kind) => kind === 'asr',
        async transcribe() {
          return { text: '', latencyMs: 1 };
        },
        synthesize: async () => ({ audio: new Uint8Array(), mime: 'audio/mpeg' }),
      },
    });
    expect((await off.ok({ kind: 'readiness', slug: 'mira' })).readiness).toMatchObject({
      ready: false,
      missing: ['local-voice-off'],
    });
    const noMedia = harness({ media: undefined });
    expect(await noMedia.calls.handle(noMedia.phone, { kind: 'open', slug: 'mira' })).toMatchObject(
      { ok: false, code: 'media-unsupported' },
    );
  });

  it('allows one call per Host: another device is refused, the same device replaces it', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const first = await connected(h);
    expect(
      await h.calls.handle({ deviceId: 'tablet' }, { kind: 'open', slug: 'mira' }),
    ).toMatchObject({ ok: false, code: 'call-active' });
    expect(
      await h.calls.handle({ deviceId: 'tablet' }, { kind: 'heartbeat', callId: first }),
    ).toMatchObject({ ok: false, code: 'call-not-found' });
    const second = await h.ok({ kind: 'open', slug: 'mira' });
    expect(second.call!.callId).not.toBe(first);
    expect(await view(h, first)).toMatchObject({ phase: 'ended', endReason: 'replaced' });
  });

  it('treats each desktop window as its own caller and refuses the second one', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const mac = { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-mac-0001' };
    const other = { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-win-0002' };
    const opened = await h.ok({ kind: 'open', slug: 'mira' }, mac);
    const callId = opened.call!.callId;
    expect(await h.calls.handle(other, { kind: 'readiness', slug: 'mira' })).toMatchObject({
      readiness: { activeCallId: null, callElsewhere: true },
    });
    expect(await h.ok({ kind: 'readiness', slug: 'mira' }, mac)).toMatchObject({
      readiness: { activeCallId: callId, callElsewhere: false },
    });
    expect(await h.calls.handle(other, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'call-active',
    });
    expect(await h.calls.handle(h.phone, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'call-active',
    });
    expect(await h.calls.handle(other, { kind: 'mute', callId, muted: true })).toMatchObject({
      ok: false,
      code: 'call-not-found',
    });
    const kept = await h.ok({ kind: 'heartbeat', callId }, mac);
    expect(kept.call!.phase).not.toBe('ended');
    const replaced = await h.ok({ kind: 'open', slug: 'mira' }, mac);
    expect(replaced.call!.callId).not.toBe(callId);
  });

  it('a phone call refuses a desktop window', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    const mac = { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-mac-0001' };
    expect(await h.ok({ kind: 'readiness', slug: 'mira' }, mac)).toMatchObject({
      readiness: { callElsewhere: true, activeCallId: null },
    });
    expect(await h.calls.handle(mac, { kind: 'open', slug: 'mira' })).toMatchObject({
      ok: false,
      code: 'call-active',
    });
  });

  it('reads the Client window id on the Host-owner route', async () => {
    const seen: unknown[] = [];
    const route = createVoiceCallHttp(() => ({
      handle: async (caller) => {
        seen.push(caller);
        return { ok: true };
      },
      draft: () => undefined,
      speak: async () => undefined,
      zoom: ({ messageId, cell }) => ({ released: true, messageId, cell }),
      revoke: async () => undefined,
      dispose: async () => undefined,
    }));
    const post = (body: unknown) =>
      route(
        new Request('http://host/api/voice/call', { method: 'POST', body: JSON.stringify(body) }),
      );
    await post({ kind: 'status', client: 'window-mac-0001' });
    await post({ kind: 'status', client: 'bad id!' });
    await post({ kind: 'status' });
    expect(seen).toEqual([
      { deviceId: VOICE_CALL_HOST_OWNER, client: 'window-mac-0001' },
      { deviceId: VOICE_CALL_HOST_OWNER, client: undefined },
      { deviceId: VOICE_CALL_HOST_OWNER, client: undefined },
    ]);
  });

  it('lets the Host owner see and end any call, but not mute it', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    const owner = { deviceId: VOICE_CALL_HOST_OWNER };
    expect(await h.calls.handle(owner, { kind: 'status' })).toMatchObject({
      ok: true,
      calls: [{ callId }],
    });
    expect(await h.calls.handle({ deviceId: 'tablet' }, { kind: 'status' })).toMatchObject({
      calls: [],
    });
    expect(await h.calls.handle(owner, { kind: 'mute', callId, muted: true })).toMatchObject({
      ok: false,
      code: 'call-not-found',
    });
    expect(await h.calls.handle(owner, { kind: 'hangup', callId })).toMatchObject({ ok: true });
    expect(await view(h, callId)).toMatchObject({ phase: 'ended', endReason: 'hangup' });
  });

  it('recognizes each piece after a short pause while the caller keeps talking', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1200), silence(350)));
    await settled();
    expect(h.transcribed).toHaveLength(1);
    expect(h.sent).toEqual([]);
    expect((await view(h, callId)).events.at(-1)).toMatchObject({
      type: 'hearing',
      text: '帮我查一下明天的天气',
    });
    h.feed(state.onPcm!, concat(speech(1000, { seed: 5 }), silence(900)));
    await settled();
    expect(h.transcribed).toHaveLength(2);
    expect(h.sent.map((item) => item.body)).toEqual(['帮我查一下明天的天气第二句话']);
    expect((await view(h, callId)).events.at(-1)).toMatchObject({ type: 'sent', segments: 2 });
    expect(h.transcribed.every((wav) => wav.every((byte) => byte === 0))).toBe(true);
  });

  it('joins pieces with a space except next to Chinese or Japanese text', () => {
    expect(joinTranscripts(['明天上海', '会下雨吗？'])).toBe('明天上海会下雨吗？');
    expect(joinTranscripts(['今日は', 'いい天気'])).toBe('今日はいい天気');
    expect(joinTranscripts(['Hello.', 'How are you?'])).toBe('Hello. How are you?');
    expect(joinTranscripts(['저는', '학생입니다.'])).toBe('저는 학생입니다.');
    expect(joinTranscripts(['Привет,', 'как дела?'])).toBe('Привет, как дела?');
    expect(joinTranscripts(['打开', 'GitHub'])).toBe('打开GitHub');
  });

  it('joins English pieces with a space, also after punctuation', async () => {
    const { media, state } = fakeMedia();
    const texts = ['Hello.', 'What is the weather tomorrow?'];
    const h = harness({
      media,
      providers: {
        has: (id, kind) => id.startsWith(kind),
        async transcribe() {
          return { text: texts.shift() ?? '', latencyMs: 1 };
        },
        synthesize: async () => ({ audio: MP3, mime: 'audio/mpeg' }),
      },
    });
    await connected(h);
    h.feed(
      state.onPcm!,
      concat(speech(1000), silence(350), speech(1000, { seed: 6 }), silence(900)),
    );
    await settled();
    expect(h.sent.map((item) => item.body)).toEqual(['Hello. What is the weather tomorrow?']);
  });

  it('a synthetic call takes injected PCM without WebRTC', async () => {
    const h = harness({ media: undefined });
    const call = (await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' })).call!;
    expect(call.phase).toBe('listening');
    const audio = concat(silence(300), speech(1200), silence(900));
    for (let offset = 0; offset < audio.length; offset += 16_000) {
      const part = audio.slice(offset, offset + 16_000);
      h.advance(1_000);
      await h.ok({
        kind: 'inject',
        callId: call.callId,
        pcm: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'),
      });
    }
    await settled();
    expect(h.sent.map((item) => item.body)).toEqual(['帮我查一下明天的天气']);
    await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'r1',
        body: '晴天。',
      }),
    );
    await settled();
    expect(types((await view(h, call.callId)).events)).toEqual(
      expect.arrayContaining(['sent', 'playing', 'played']),
    );
    expect(
      await h.calls.handle(h.phone, { kind: 'inject', callId: 'call-0000000000000000', pcm: '' }),
    ).toMatchObject({ ok: false, code: 'call-not-found' });
    await h.ok({ kind: 'hangup', callId: call.callId });
    expect(
      await h.calls.handle(h.phone, { kind: 'inject', callId: call.callId, pcm: 'AAAA' }),
    ).toMatchObject({ ok: false, code: 'call-ended' });
  });

  it('speaks only the called Bot in its DM, and only drafts that asked for voice first', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    expect(
      await h.calls.speak({
        at: h.at(),
        slug: 'other',
        channelId: 'dm-other',
        messageId: 'x',
        body: '你好。',
      }),
    ).toBeUndefined();
    for (const draft of [
      { channelId: 'dm-other', botSlug: 'other', voice: true as const },
      { channelId: 'dm-mira', botSlug: 'mira' },
      { channelId: 'group-1', botSlug: 'mira', voice: true as const },
    ])
      h.calls.draft({
        type: 'update',
        draft: { ...draft, draftId: 'a:1', attemptId: 'a', body: '第一句。第二句。第三' },
      });
    await settled();
    expect(state.played).toEqual([]);
    expect(h.synthesized).toEqual(['嗯。']);
  });
});

describe('call records in the DM (#3483)', () => {
  it("writes a start notice when the call connects and an end notice with its length after the call's messages", async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const opened = (await h.ok({ kind: 'open', slug: 'mira' })).call!;
    h.advance(2_000);
    expect(h.records).toEqual([]);
    await h.ok({
      kind: 'signal',
      callId: opened.callId,
      answer: { type: 'answer', sdp: 'v=0\r\n' },
    });
    await settled();
    const connectedAt = new Date(1_002_000).toISOString();
    expect(h.records).toEqual([
      { callId: opened.callId, botSlug: 'mira', state: 'started', startedAt: connectedAt },
    ]);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await h.ok({ kind: 'hangup', callId: opened.callId });
    await settled();
    const end = h.records[1]!;
    expect(end).toMatchObject({
      callId: opened.callId,
      botSlug: 'mira',
      state: 'ended',
      startedAt: connectedAt,
      reason: 'hangup',
      startMessageId: `voice-call-started-${opened.callId}`,
    });
    expect(end.state === 'ended' && end.durationMs).toBe(
      Date.parse(end.state === 'ended' ? end.endedAt : '') - 1_002_000,
    );
    expect(isChannelVoiceCallRecord(end)).toBe(true);
    expect(h.log.at(0)).toBe('record:started');
    expect(h.log.at(-1)).toBe('record:ended');
  });

  it('counts the sentences the call sent to the DM', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    h.advance(65_000);
    await h.ok({ kind: 'heartbeat', callId });
    await h.ok({ kind: 'hangup', callId });
    await settled();
    expect(h.log).toEqual(['record:started', 'sent:帮我查一下明天的天气', 'record:ended']);
    expect(h.records[1]).toMatchObject({ state: 'ended', heard: 1, reason: 'hangup' });
  });

  it('keeps an earlier call end notice ahead of the next call when its last sentence is still transcribing', async () => {
    let release: (() => void) | undefined;
    const { media, state } = fakeMedia();
    const h = harness({
      media,
      providers: {
        has: (id, kind) => id.startsWith(kind),
        async transcribe() {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return { text: '最后一句', latencyMs: 5 };
        },
        async synthesize({ text }) {
          return { audio: clipFor(text), mime: 'audio/mpeg' };
        },
      },
    });
    const first = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1000), silence(900)));
    await settled();
    expect(release).toBeDefined();
    const hungUp = h.ok({ kind: 'hangup', callId: first });
    await settled();
    const second = await connected(h);
    await h.ok({ kind: 'hangup', callId: second });
    await settled();
    expect(h.records.map((record) => `${record.state}:${record.callId}`)).toEqual([
      `started:${first}`,
    ]);
    release!();
    await hungUp;
    await settled();
    expect(h.records.map((record) => `${record.state}:${record.callId}`)).toEqual([
      `started:${first}`,
      `ended:${first}`,
      `started:${second}`,
      `ended:${second}`,
    ]);
  });

  it('leaves no record for a call that never connected', async () => {
    const { media } = fakeMedia();
    const h = harness({ media });
    const opened = (await h.ok({ kind: 'open', slug: 'mira' })).call!;
    await h.ok({ kind: 'hangup', callId: opened.callId });
    await settled();
    expect(h.records).toEqual([]);
  });

  it('keeps the call going when the notice cannot be written', async () => {
    const h = harness({
      media: undefined,
      record: async () => {
        throw new Error('disk full');
      },
    });
    const call = (await h.ok({ kind: 'open', slug: 'mira', media: 'synthetic' })).call!;
    const audio = concat(silence(300), speech(1200), silence(900));
    for (let offset = 0; offset < audio.length; offset += 16_000) {
      const part = audio.slice(offset, offset + 16_000);
      h.advance(1_000);
      await h.ok({
        kind: 'inject',
        callId: call.callId,
        pcm: Buffer.from(part.buffer, part.byteOffset, part.byteLength).toString('base64'),
      });
    }
    await settled();
    expect(h.sent.map((item) => item.body)).toEqual(['帮我查一下明天的天气']);
    expect((await view(h, call.callId)).phase).not.toBe('ended');
  });

  it('formats the length and a body the Bot can search', () => {
    expect(voiceCallDuration(0)).toBe('0:00');
    expect(voiceCallDuration(65_400)).toBe('1:05');
    expect(voiceCallDuration(3_725_000)).toBe('1:02:05');
    const body = voiceCallRecordBody({
      callId: 'call-0123456789abcdef',
      botSlug: 'mira',
      state: 'ended',
      startedAt: '2026-11-04T10:00:00.000Z',
      endedAt: '2026-11-04T10:12:04.000Z',
      durationMs: 724_000,
      reason: 'hangup',
      heard: 6,
    });
    expect(body.toLowerCase()).toContain('voice call');
    expect(body).toContain('12:04');
    expect(body).toContain('2026-11-04T10:00:00.000Z');
    expect(
      isChannelVoiceCallRecord({
        callId: 'call-0123456789abcdef',
        botSlug: 'mira',
        state: 'started',
        startedAt: '2026-11-04T10:00:00.000Z',
        extra: 1,
      }),
    ).toBe(false);
  });
});

describe('streamed voice replies', () => {
  function stream(h: ReturnType<typeof harness>, draftId = 'a1:c1') {
    const attemptId = draftId.split(':')[0]!;
    return {
      update(body: string, extra: { bodyComplete?: true; voice?: false } = {}) {
        h.calls.draft({
          type: 'update',
          draft: {
            channelId: 'dm-mira',
            draftId,
            attemptId,
            botSlug: 'mira',
            body,
            ...(extra.voice === false ? {} : { voice: true }),
            ...(extra.bodyComplete === undefined ? {} : { bodyComplete: true }),
          },
        });
      },
      settled() {
        h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId, attemptId });
      },
      abandoned() {
        h.calls.draft({
          type: 'abandoned',
          channelId: 'dm-mira',
          draftId,
          attemptId,
          reason: 'interrupted',
        });
      },
    };
  }

  async function heardQuestion(h: ReturnType<typeof harness>, onPcm: (pcm: Int16Array) => void) {
    h.feed(onPcm, concat(silence(300), speech(1200), silence(800)));
    await settled();
  }

  it('says "嗯" right after the Human stops, speaks the first sentence before the commit and archives what played', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    h.advance(800);
    draft.update('明天');
    h.advance(200);
    draft.update('明天会下雨。带');
    await settled();
    h.advance(300);
    draft.update('明天会下雨。带上伞吧。');
    draft.update('明天会下雨。带上伞吧。', { bodyComplete: true });
    await settled();
    draft.settled();
    h.advance(400);
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-1',
        body: '明天会下雨。带上伞吧。',
      }),
    );
    await settled();

    const events = (await view(h, callId)).events;
    const at = (type: string, extra: Record<string, unknown> = {}) =>
      events.find(
        (event) =>
          event.type === type &&
          Object.entries(extra).every(
            ([key, value]) => (event as Record<string, unknown>)[key] === value,
          ),
      )!.at;
    expect(types(events)).toEqual([
      'connected',
      'speech-start',
      'ack',
      'transcribing',
      'sent',
      'reply-text',
      'playing',
      'played',
      'playing',
      'played',
      'committed',
      'reply-done',
    ]);
    expect((events.find((event) => event.type === 'ack') as { ms: number }).ms).toBeLessThanOrEqual(
      200,
    );
    expect(at('ack')).toBeLessThanOrEqual(at('sent'));
    expect(events.find((event) => event.type === 'reply-text')).toMatchObject({ responseMs: 800 });
    expect(events.find((event) => event.type === 'playing')).toMatchObject({
      sentence: 0,
      responseMs: 1_000,
    });
    expect(at('playing', { sentence: 0 })).toBeLessThan(at('committed'));
    expect(events.find((event) => event.type === 'committed')).toMatchObject({
      messageId: 'bot-1',
      reused: 2,
      synthesized: 0,
    });
    expect(h.synthesized).toEqual(['嗯。', '明天会下雨。', '带上伞吧。']);
    expect(state.audio).toEqual([clipFor('嗯。'), clipFor('明天会下雨。'), clipFor('带上伞吧。')]);
    expect(archived).toEqual(
      joinAudio(state.audio.slice(1).map((audio) => ({ audio, mime: 'audio/mpeg' }))),
    );
    expect(Buffer.from(archived!.audio).toString('latin1')).toContain(
      Buffer.from('明天会下雨。带上伞吧。').toString('latin1'),
    );
  });

  it('stops at once and keeps nothing when the draft is abandoned', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    state.playDelay = new Promise<void>(() => undefined);
    const draft = stream(h);
    draft.update('第一句话。第二句话。第三');
    await settled();
    expect((await view(h, callId)).phase).toBe('bot-speaking');
    draft.abandoned();
    await settled();
    const current = await view(h, callId);
    expect(state.stopped).toBe(1);
    expect(state.audio).toEqual([clipFor('嗯。'), clipFor('第一句话。')]);
    expect(current.phase).toBe('listening');
    expect(types(current.events).slice(-3)).toEqual(['reply-text', 'playing', 'reply-stopped']);
    expect(current.events.at(-1)).toMatchObject({ reason: 'abandoned' });

    state.playDelay = undefined;
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-2',
        body: '换个说法。',
      }),
    );
    await settled();
    expect(archived).toEqual({ audio: clipFor('换个说法。'), mime: 'audio/mpeg' });
    expect((await view(h, callId)).events.at(-1)).toMatchObject({
      type: 'reply-done',
      messageId: 'bot-2',
    });
  });

  it('falls back to speaking after the commit when voice came after the body', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    draft.update('第一句。第二句。', { voice: false, bodyComplete: true });
    await settled();
    expect(state.audio).toEqual([clipFor('嗯。')]);
    draft.settled();
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-3',
        body: '第一句。第二句。',
      }),
    );
    await settled();
    const events = (await view(h, callId)).events;
    expect(types(events).slice(-6)).toEqual([
      'committed',
      'playing',
      'played',
      'playing',
      'played',
      'reply-done',
    ]);
    expect(events.find((event) => event.type === 'committed')).toMatchObject({
      reused: 0,
      synthesized: 2,
    });
    expect(archived).toEqual(
      joinAudio(
        [clipFor('第一句。'), clipFor('第二句。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
  });

  it('reuses the sentences that match the committed text and speaks the rewritten rest', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    stream(h).update('好的。我来看看。然后');
    await settled();
    const archived = await heard(
      h.calls.speak({
        at: h.at(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'bot-4',
        body: '好的。明天晴。',
      }),
    );
    await settled();
    expect(
      (await view(h, callId)).events.find((event) => event.type === 'committed'),
    ).toMatchObject({
      reused: 1,
      synthesized: 1,
    });
    expect(state.audio.slice(1)).toEqual([
      clipFor('好的。'),
      clipFor('我来看看。'),
      clipFor('明天晴。'),
    ]);
    expect(archived).toEqual(
      joinAudio(
        [clipFor('好的。'), clipFor('明天晴。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
  });

  it('never restarts a draft it stopped, even when the draft keeps streaming', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    draft.update('好的。我来看看。然后');
    await settled();
    draft.update('好吧。别的说法。然后');
    await settled();
    draft.update('好吧。别的说法。然后再说。还有');
    await settled();
    expect(state.audio.slice(1)).toEqual([clipFor('好的。'), clipFor('我来看看。')]);
    const events = (await view(h, callId)).events;
    expect(events.filter((event) => event.type === 'reply-stopped')).toEqual([
      expect.objectContaining({ reason: 'revised' }),
    ]);
    expect(events.filter((event) => event.type === 'reply-text')).toHaveLength(1);
  });

  it('stops at once when the draft takes back a sentence it already queued', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    const draft = stream(h);
    draft.update('好的。马上转账。然后');
    await settled();
    draft.update('好的。');
    await settled();
    const events = (await view(h, callId)).events;
    expect(events.filter((event) => event.type === 'reply-stopped')).toEqual([
      expect.objectContaining({ reason: 'revised' }),
    ]);
  });

  it('does not speak a message written before the call started', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    await heardQuestion(h, state.onPcm!);
    const before = state.audio.length;
    expect(
      await h.calls.speak({
        at: new Date(0).toISOString(),
        slug: 'mira',
        channelId: 'dm-mira',
        messageId: 'old',
        body: '旧消息。',
      }),
    ).toBeUndefined();
    await settled();
    expect(state.audio).toHaveLength(before);
  });

  it('keeps synthesizing the archive when the call ends mid-reply', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    await heardQuestion(h, state.onPcm!);
    state.playDelay = new Promise<void>(() => undefined);
    const spoken = h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-5',
      body: '第一句。第二句。',
    });
    await settled();
    await h.ok({ kind: 'hangup', callId });
    expect(await heard(spoken)).toEqual(
      joinAudio(
        [clipFor('第一句。'), clipFor('第二句。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
    expect(state.stopped).toBe(1);
    expect(state.audio).toHaveLength(2);
  });
});

describe('barge-in while the Bot speaks', () => {
  const never = () => new Promise<void>(() => undefined);

  function draft(h: ReturnType<typeof harness>, body: string, draftId = 'b1:c1') {
    h.calls.draft({
      type: 'update',
      draft: {
        channelId: 'dm-mira',
        draftId,
        attemptId: draftId.split(':')[0]!,
        botSlug: 'mira',
        body,
        voice: true,
      },
    });
  }

  async function speaking(
    h: ReturnType<typeof harness>,
    state: ReturnType<typeof fakeMedia>['state'],
    delay: Promise<void> = never(),
  ) {
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1200), silence(900)));
    await settled();
    state.playDelay = delay;
    draft(h, '第一句话。第二句话。第三句话。');
    await settled();
    expect((await view(h, callId)).phase).toBe('bot-speaking');
    return callId;
  }

  const commit = (h: ReturnType<typeof harness>, messageId: string, body: string) =>
    h.calls.speak({ at: h.at(), slug: 'mira', channelId: 'dm-mira', messageId, body });

  it('stops after half a second of speech, sends the Human to the DM and archives only what played', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;

    h.feed(state.onPcm!, concat(silence(600), speech(1200)));
    await settled();
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(900));
    await settled();
    expect(h.sent).toHaveLength(1);
    h.feed(state.onPcm!, silence(400));
    await settled();

    const events = (await view(h, callId, before)).events;
    expect(types(events)).toEqual([
      'speech-start',
      'barge-suspected',
      'reply-stopped',
      'barge-in',
      'hearing',
      'transcribing',
      'sent',
    ]);
    expect(events.find((event) => event.type === 'barge-in')).toMatchObject({
      by: 'duration',
      replyIds: ['reply-1'],
    });
    const suspected = events.find((event) => event.type === 'barge-suspected')!.at;
    const confirmed = events.find((event) => event.type === 'barge-in')!.at;
    expect(confirmed - suspected).toBeGreaterThanOrEqual(250);
    expect(state.gains).toEqual([0.3, 1]);
    expect(state.stopped).toBe(1);
    expect(h.sent.map((item) => item.body)).toEqual(['帮我查一下明天的天气', '第二句话']);

    draft(h, '第一句话。第二句话。第三句话。第四句话。');
    await settled();
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const archived = await heard(commit(h, 'bot-1', '第一句话。第二句话。第三句话。第四句话。'));
    await settled();
    expect(state.audio).toEqual([clipFor('嗯。'), clipFor('第一句话。')]);
    expect(archived).toEqual({ audio: clipFor('第一句话。'), mime: 'audio/mpeg' });
    expect((await view(h, callId)).events.slice(-2)).toEqual([
      expect.objectContaining({ type: 'committed', reused: 1, synthesized: 0, interrupted: true }),
      expect.objectContaining({ type: 'reply-done', messageId: 'bot-1', sentences: 0 }),
    ]);
  });

  it('trims the sentence the Human cut into to the part that played', async () => {
    const { media, state } = fakeMedia();
    const transcripts = ['帮我查一下明天的天气', '停一下换个话题'];
    const h = harness({
      media,
      providers: {
        has: (id, kind) => id.startsWith(kind),
        async transcribe() {
          return { text: transcripts.shift() ?? '', latencyMs: 5 };
        },
        async synthesize({ text }) {
          const ms = text === '嗯。' ? 100 : 4_000;
          return { audio: wavFromPcm16(new Int16Array(ms * 16), 16_000), mime: 'audio/wav' };
        },
      },
    });
    const callId = await speaking(h, state);
    const playing = (await view(h, callId)).events.findLast((event) => event.type === 'playing')!;
    h.feed(state.onPcm!, concat(silence(600), speech(1200)));
    await settled();
    const stopped = (await view(h, callId)).events.find((event) => event.type === 'barge-in')!;
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(900));
    await settled();
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const archived = await heard(commit(h, 'bot-1', '第一句话。第二句话。第三句话。'));
    expect(archived?.mime).toBe('audio/wav');
    const kept = clipDurationMs(archived!);
    expect(Math.abs(kept - (stopped.at - playing.at))).toBeLessThanOrEqual(20);
    expect(kept).toBeLessThan(4_000);
  });

  it('keeps a cut-in as one sentence when the next Bot sentence starts under it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '停一下换个话题讲讲故宫吧'] });
    let finish!: () => void;
    const callId = await speaking(h, state, new Promise<void>((resolve) => (finish = resolve)));
    const before = (await view(h, callId)).lastSeq;
    const voice = (ms: number, seed: number) => speech(ms, { dbfs: -38, seed });
    h.feed(state.onPcm!, concat(silence(600), voice(300, 1)));
    await settled();
    state.playDelay = never();
    finish();
    await settled();
    h.feed(state.onPcm!, concat(voice(300, 2), silence(250), voice(700, 3), silence(1300)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toContain('barge-in');
    expect(types(events)).not.toContain('noise-discarded');
    expect(types(events)).not.toContain('barge-dismissed');
    expect(h.sent.map((item) => item.body)).toEqual([
      '帮我查一下明天的天气',
      '停一下换个话题讲讲故宫吧',
    ]);
  });

  it('waits out a longer pause after a cut-in and plays no ack over the rest of it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '停一下换个话题讲讲故宫吧'] });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(900), silence(800), speech(700)));
    await settled();
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(1300));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toContain('barge-in');
    expect(types(events)).not.toContain('ack');
    expect(types(events)).not.toContain('noise-discarded');
    expect(h.sent.map((item) => item.body)).toEqual([
      '帮我查一下明天的天气',
      '停一下换个话题讲讲故宫吧',
    ]);
  });

  it('drops a murmur that started over the reply and ended after it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '嗯嗯'] });
    let finish!: () => void;
    const callId = await speaking(h, state, new Promise<void>((resolve) => (finish = resolve)));
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    state.playDelay = undefined;
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const speech1 = commit(h, 'bot-1', '第一句话。第二句话。第三句话。');
    finish();
    await heard(speech1);
    h.feed(state.onPcm!, concat(speech(150), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(events.filter((event) => event.type === 'barge-dismissed')).toEqual([
      expect.objectContaining({ reason: 'filler' }),
    ]);
    expect(h.sent).toHaveLength(1);
    expect(state.gains).toEqual([0.3, 1]);
  });

  it('sends a cut-in that outlasts the reply even when it is short', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['帮我查一下明天的天气', '停'] });
    let finish!: () => void;
    const callId = await speaking(h, state, new Promise<void>((resolve) => (finish = resolve)));
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    expect(types((await view(h, callId, before)).events)).toContain('barge-suspected');
    state.playDelay = undefined;
    h.calls.draft({ type: 'settled', channelId: 'dm-mira', draftId: 'b1:c1', attemptId: 'b1' });
    const speech1 = commit(h, 'bot-1', '第一句话。第二句话。第三句话。');
    finish();
    await heard(speech1);
    expect(types((await view(h, callId, before)).events)).toContain('reply-done');
    h.feed(state.onPcm!, concat(speech(150), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-dismissed');
    expect(h.sent.at(-1)?.body).toBe('停');
    expect(state.gains).toEqual([0.3, 1]);
  });

  it('stops for a short command once its transcript has two real words', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['你好', '等等别说了'] });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(420), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toEqual([
      'speech-start',
      'barge-suspected',
      'transcribing',
      'reply-stopped',
      'barge-in',
      'sent',
    ]);
    expect(events.find((event) => event.type === 'barge-in')).toMatchObject({ by: 'words' });
    expect(state.stopped).toBe(1);
    expect(h.sent.at(-1)?.body).toBe('等等别说了');
  });

  it('retries the volume after the media helper refused to restore it', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    state.failGain = 1;
    h.feed(state.onPcm!, concat(silence(600), speech(700)));
    await settled();
    expect(types((await view(h, callId)).events)).toContain('barge-in');
    expect(state.gains).toEqual([0.3]);
    await h.ok({ kind: 'mute', callId, muted: true });
    expect(state.gains).toEqual([0.3, 1]);
  });

  it('restores the volume and forgets a suspected cut-in when the Human mutes', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    expect(state.gains).toEqual([0.3]);
    await h.ok({ kind: 'mute', callId, muted: true });
    expect(state.gains).toEqual([0.3, 1]);
    await h.ok({ kind: 'mute', callId, muted: false });
    h.feed(state.onPcm!, concat(silence(600), speech(300)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-in');
    expect(types(events).filter((type) => type === 'barge-suspected')).toHaveLength(2);
    expect(state.gains).toEqual([0.3, 1, 0.3]);
    expect(state.stopped).toBe(0);
  });

  it('keeps talking through coughs, knocks, short noise and a murmured "嗯嗯", and nothing reaches the DM', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, transcripts: ['你好', '嗯嗯'] });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(
      state.onPcm!,
      concat(
        silence(600),
        cough(350),
        silence(600),
        knock(),
        silence(400),
        cough(300),
        silence(600),
        speech(240),
        silence(900),
        speech(420),
        silence(900),
      ),
    );
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-in');
    expect(types(events)).not.toContain('reply-stopped');
    expect(events.filter((event) => event.type === 'barge-dismissed')).toEqual([
      expect.objectContaining({ reason: 'ended' }),
      expect.objectContaining({ reason: 'filler' }),
    ]);
    expect(state.gains).toEqual([0.3, 1, 0.3, 1]);
    expect(state.stopped).toBe(0);
    expect(h.sent).toHaveLength(1);
    expect((await view(h, callId)).phase).toBe('bot-speaking');
  });

  const echo = () =>
    concat(speech(300, { dbfs: -36, f0: 210 }), speech(2500, { dbfs: -52, f0: 210 }));

  it('does not take its own echo for the Human', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, echo());
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).toEqual([]);
    expect(h.transcribed).toHaveLength(1);
    expect(state.gains).toEqual([]);
  });

  it('needs the echo guard: the same leak without it is heard as the Human', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, bargeIn: { echoGuardDb: 0 } });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, echo());
    await settled();
    expect(types((await view(h, callId, before)).events)).toContain('barge-suspected');
  });

  it('keeps only the heard sentences of a reply that had already committed', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    h.feed(state.onPcm!, concat(silence(300), speech(1200), silence(900)));
    await settled();
    state.playDelay = never();
    const speech_ = commit(h, 'bot-2', '第一句。第二句。第三句。');
    await settled();
    h.feed(state.onPcm!, concat(silence(600), speech(1200)));
    await settled();
    state.playDelay = undefined;
    h.feed(state.onPcm!, silence(900));
    const done = await (await speech_)!.archive;
    expect(done).toEqual({
      clip: { audio: clipFor('第一句。'), mime: 'audio/mpeg' },
      interrupted: true,
    });
    expect(
      (await view(h, callId)).events.find((event) => event.type === 'reply-done'),
    ).toMatchObject({ messageId: 'bot-2', sentences: 0 });
  });

  it('reads its thresholds from the call owner options', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media, bargeIn: { confirmMs: 2_000, confirmWords: 9, duckGain: 0.5 } });
    const callId = await speaking(h, state);
    const before = (await view(h, callId)).lastSeq;
    h.feed(state.onPcm!, concat(silence(600), speech(1200), silence(900)));
    await settled();
    const events = (await view(h, callId, before)).events;
    expect(types(events)).not.toContain('barge-in');
    expect(events.find((event) => event.type === 'barge-dismissed')).toMatchObject({
      reason: 'filler',
    });
    expect(state.gains).toEqual([0.5, 1]);
    expect(h.sent).toHaveLength(1);
  });
});
