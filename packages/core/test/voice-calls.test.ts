import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type { VoiceCallEvent, VoiceCallResult, VoiceCallView } from '../src/voice/call-contract.js';
import { VOICE_CALL_HOST_OWNER } from '../src/voice/call-contract.js';
import {
  createVoiceCalls,
  type VoiceCallBot,
  type VoiceCallMedia,
  type VoiceCallsDeps,
} from '../src/voice/calls.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { createTempRoot } from './helpers.js';
import { chunks, concat, cough, knock, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(256, 1)]);

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
    closed: 0,
    playDelay: undefined as Promise<void> | undefined,
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
        async play(audio, mime) {
          state.played.push({ bytes: audio.byteLength, mime });
          await state.playDelay;
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
  } = {},
) {
  let clock = 1_000_000;
  const sent: { body: string; callId: string; channelId: string; messageId: string }[] = [];
  const bot: VoiceCallBot | undefined =
    'bot' in options
      ? options.bot
      : {
          slug: 'mira',
          asr: { providerId: 'asr-000000000001', language: 'zh' },
          voice: { providerId: 'tts-000000000001' },
        };
  const transcribed: Uint8Array[] = [];
  const transcripts = ['帮我查一下明天的天气', '第二句话'];
  const providers: VoiceCallsDeps['providers'] = options.providers ?? {
    has: (id, kind) => id.startsWith(kind),
    async transcribe({ audio }) {
      transcribed.push(audio);
      return { text: transcripts.shift() ?? '', latencyMs: 5 };
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
      }),
    busy: options.busy ?? (() => false),
    now: () => clock,
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
    transcribed,
    phone,
    ok,
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
    expect(types(current.events)).toEqual(['connected', 'speech-start', 'transcribing', 'sent']);

    const speechAudio = await providers.synthesize({ providerId: tts.id, text: '会下雨，带伞。' });
    h.advance(1_200);
    h.calls.deliverVoice({
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-reply-1',
      at: new Date(1_000_000 + 5_000).toISOString(),
      audio: speechAudio.audio,
      mime: speechAudio.mime,
    });
    await settled();
    expect(state.played).toEqual([{ bytes: MP3.length, mime: 'audio/mpeg' }]);
    current = await view(h, callId, current.lastSeq);
    expect(current.events).toEqual([
      expect.objectContaining({
        type: 'playing',
        messageId: 'bot-reply-1',
        responseMs: 1_200,
      }),
      expect.objectContaining({ type: 'played', messageId: 'bot-reply-1' }),
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

  it('does not hear the Bot while it plays, nor in the short tail after', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    let finish!: () => void;
    state.playDelay = new Promise<void>((resolve) => (finish = resolve));
    h.calls.deliverVoice({
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'm1',
      at: new Date(1_000_500).toISOString(),
      audio: MP3,
      mime: 'audio/mpeg',
    });
    await settled();
    expect((await view(h, callId)).phase).toBe('bot-speaking');
    h.feed(state.onPcm!, concat(speech(1200), silence(900)));
    finish();
    await settled();
    h.feed(state.onPcm!, speech(200));
    await settled();
    expect(h.transcribed).toEqual([]);
    expect((await view(h, callId)).phase).not.toBe('bot-speaking');
  });

  it('shows busy while the Orchestrator runs a turn and plays nothing for it', async () => {
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
    expect(state.played).toEqual([]);
    busy = false;
    const after = await view(h, callId, during.lastSeq);
    expect(after.busy).toBe(false);
    expect(types(after.events)).toContain('idle');
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
    h.calls.deliverVoice({
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'r1',
      at: new Date().toISOString(),
      audio: MP3,
      mime: 'audio/mpeg',
    });
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

  it('plays only replies from the called Bot, committed during the call', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    await connected(h);
    h.calls.deliverVoice({
      slug: 'other',
      channelId: 'dm-other',
      messageId: 'x',
      at: new Date(1_000_100).toISOString(),
      audio: MP3,
      mime: 'audio/mpeg',
    });
    h.calls.deliverVoice({
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'old',
      at: new Date(900_000).toISOString(),
      audio: MP3,
      mime: 'audio/mpeg',
    });
    await settled();
    expect(state.played).toEqual([]);
  });
});
