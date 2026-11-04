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
import { createVoiceCallHttp } from '../src/voice/call-http.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { joinAudio } from '../src/voice/speech.js';
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
    const archived = await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-reply-1',
      body: '会下雨，带伞。',
    });
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

  it('does not hear the Bot while it plays, nor in the short tail after', async () => {
    const { media, state } = fakeMedia();
    const h = harness({ media });
    const callId = await connected(h);
    let finish!: () => void;
    state.playDelay = new Promise<void>((resolve) => (finish = resolve));
    await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'm1',
      body: '好的。',
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
    await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'r1',
      body: '晴天。',
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
    h.feed(onPcm, concat(silence(300), speech(1200), silence(900)));
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
    const archived = await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-1',
      body: '明天会下雨。带上伞吧。',
    });
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
    const archived = await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-2',
      body: '换个说法。',
    });
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
    const archived = await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-3',
      body: '第一句。第二句。',
    });
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
    const archived = await h.calls.speak({
      at: h.at(),
      slug: 'mira',
      channelId: 'dm-mira',
      messageId: 'bot-4',
      body: '好的。明天晴。',
    });
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
    expect(await spoken).toEqual(
      joinAudio(
        [clipFor('第一句。'), clipFor('第二句。')].map((audio) => ({ audio, mime: 'audio/mpeg' })),
      ),
    );
    expect(state.stopped).toBe(1);
    expect(state.audio).toHaveLength(2);
  });
});
