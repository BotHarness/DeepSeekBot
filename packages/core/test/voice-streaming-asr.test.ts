import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocketServer } from 'ws';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import type { VoiceCallEvent, VoiceCallView } from '../src/voice/call-contract.js';
import { createVoiceCalls, type VoiceCallMedia } from '../src/voice/calls.js';
import { VoiceProviders, wavFromPcm16 } from '../src/voice/providers.js';
import { sonioxLanguageHints, sonioxUrl } from '../src/voice/soniox.js';
import { createTempRoot } from './helpers.js';
import { chunks, concat, silence, speech } from './voice-audio-fixtures.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

interface Session {
  authorization: string | undefined;
  path: string | undefined;
  config: Record<string, unknown> | undefined;
  bytes: number;
  finalized: boolean;
  ended: boolean;
}

async function fakeSoniox(options: { finals?: string[]; refuse?: number; partial?: string } = {}) {
  const finals = options.finals ?? ['明天上海会下雨吗？'];
  const sessions: Session[] = [];
  const server = new WebSocketServer({
    port: 0,
    host: '127.0.0.1',
    verifyClient: (_info, done) =>
      options.refuse === undefined ? done(true) : done(false, options.refuse, 'Invalid API key'),
  });
  server.on('connection', (socket, request) => {
    const session: Session = {
      authorization: request.headers.authorization,
      path: request.url,
      config: undefined,
      bytes: 0,
      finalized: false,
      ended: false,
    };
    sessions.push(session);
    const final = finals.shift() ?? '';
    socket.on('message', (data, binary) => {
      if (binary) {
        session.bytes += (data as Buffer).byteLength;
        if (session.bytes >= 16_000)
          socket.send(
            JSON.stringify({
              tokens: [{ text: options.partial ?? '明天', is_final: false }],
              final_audio_proc_ms: 0,
              total_audio_proc_ms: Math.round(session.bytes / 32),
            }),
          );
        return;
      }
      const text = String(data);
      if (text === '') {
        session.ended = true;
        socket.send(JSON.stringify({ tokens: [], finished: true }));
        socket.close();
        return;
      }
      const message = JSON.parse(text) as Record<string, unknown>;
      if (message['type'] === 'keepalive') return;
      if (session.config === undefined) {
        session.config = message;
        return;
      }
      if (message['type'] === 'finalize') {
        session.finalized = true;
        socket.send(
          JSON.stringify({
            tokens: [
              ...[...final].map((piece) => ({ text: piece, is_final: true })),
              { text: '<fin>', is_final: true },
            ],
          }),
        );
      }
    });
  });
  await new Promise<void>((resolve) => server.on('listening', resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    sessions,
  };
}

async function realProviders() {
  const root = createTempRoot('voice-stream-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const owner = mountOperationalDatabase({
    dshHome: root,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  cleanup.push(async () => {
    owner.close();
    await fiber.dispose();
  });
  const logs: { phase: string; fields: Record<string, string | number> }[] = [];
  const providers = new VoiceProviders({
    database: attachOperationalModule(owner, 'voice'),
    credentials: () => ctx.credentials,
    log: (phase, fields) => logs.push({ phase, fields }),
  });
  return { providers, logs };
}

async function until(check: () => boolean, ms = 2_000) {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

describe('Soniox streaming ASR Provider', () => {
  it('builds the WebSocket URL and language hints', () => {
    expect(sonioxUrl('https://stt-rt.soniox.com')).toBe(
      'wss://stt-rt.soniox.com/transcribe-websocket',
    );
    expect(sonioxUrl('http://127.0.0.1:9000')).toBe('ws://127.0.0.1:9000/transcribe-websocket');
    expect(sonioxLanguageHints('zh-CN')).toEqual(['zh', 'en']);
    expect(sonioxLanguageHints('en')).toEqual(['en']);
    expect(sonioxLanguageHints(undefined)).toEqual([]);
  });

  it('is a streaming ASR preset that needs a key', async () => {
    const { providers } = await realProviders();
    expect(providers.asrPresets().find((preset) => preset.id === 'soniox')).toMatchObject({
      wire: 'soniox',
      capabilities: { streaming: true },
    });
    await expect(providers.add({ kind: 'asr', preset: 'soniox' })).rejects.toMatchObject({
      code: 'key-required',
    });
    const asr = await providers.add({
      kind: 'asr',
      preset: 'soniox',
      key: 'soniox-test-key',
    });
    expect(asr).toMatchObject({
      preset: 'soniox',
      wire: 'soniox',
      streaming: true,
      keySet: true,
    });
    expect(JSON.stringify(asr)).not.toContain('soniox-test-key');
    expect(providers.streams(asr.id)).toBe(true);
    const batch = await providers.add({
      kind: 'asr',
      preset: 'custom',
      baseUrl: 'http://127.0.0.1:1',
    });
    expect(providers.streams(batch.id)).toBe(false);
    expect(providers.openStream({ providerId: batch.id })).toBeUndefined();
  });

  it('streams PCM while speaking, reports live text, and finalizes on demand', async () => {
    const soniox = await fakeSoniox();
    const { providers, logs } = await realProviders();
    const asr = await providers.add({
      kind: 'asr',
      preset: 'soniox',
      baseUrl: soniox.url,
      language: 'zh',
      key: 'soniox-test-key',
    });
    const live: string[] = [];
    const stream = providers.openStream({
      providerId: asr.id,
      onText: (text) => live.push(text),
    })!;
    for (const chunk of chunks(speech(1_000))) stream.push(chunk);
    await until(() => live.length > 0);
    const result = await stream.finish();

    expect(result.text).toBe('明天上海会下雨吗？');
    expect(live[0]).toBe('明天');
    expect(live.at(-1)).toBe('明天上海会下雨吗？');
    const [session] = soniox.sessions;
    expect(session).toMatchObject({
      authorization: 'Bearer soniox-test-key',
      path: '/transcribe-websocket',
      config: {
        model: 'stt-rt-v6',
        audio_format: 'pcm_s16le',
        sample_rate: 16_000,
        num_channels: 1,
        language_hints: ['zh', 'en'],
      },
      bytes: 32_000,
      finalized: true,
    });
    await until(() => session!.ended);
    expect(logs.find((entry) => entry.phase === 'transcribed')?.fields).toMatchObject({
      mode: 'stream',
      chars: result.text.length,
    });
  });

  it('opens the next socket ahead of time and uses it for the next sentence', async () => {
    const soniox = await fakeSoniox({ finals: ['第一句', '第二句'] });
    const { providers } = await realProviders();
    const asr = await providers.add({
      kind: 'asr',
      preset: 'soniox',
      baseUrl: soniox.url,
      key: 'soniox-test-key',
    });
    providers.warm(asr.id);
    await until(() => soniox.sessions.length === 1);
    expect(soniox.sessions[0]!.config).toBeUndefined();

    const first = providers.openStream({ providerId: asr.id })!;
    for (const chunk of chunks(speech(500))) first.push(chunk);
    expect((await first.finish()).text).toBe('第一句');
    expect(soniox.sessions[0]).toMatchObject({
      authorization: 'Bearer soniox-test-key',
      config: { model: 'stt-rt-v6', audio_format: 'pcm_s16le' },
      bytes: 16_000,
      finalized: true,
    });
    await until(() => soniox.sessions.length === 2);
    expect(soniox.sessions[1]!.config).toBeUndefined();

    const second = providers.openStream({ providerId: asr.id })!;
    for (const chunk of chunks(speech(500))) second.push(chunk);
    expect((await second.finish()).text).toBe('第二句');
    expect(soniox.sessions[1]!.finalized).toBe(true);
    await until(() => soniox.sessions.length === 3);

    providers.cool(asr.id);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(soniox.sessions).toHaveLength(3);
    expect(soniox.sessions[2]!.config).toBeUndefined();
  });

  it('transcribes a whole file through the same socket for tests and health checks', async () => {
    const soniox = await fakeSoniox({ finals: ['你好'] });
    const { providers } = await realProviders();
    const asr = await providers.add({
      kind: 'asr',
      preset: 'soniox',
      baseUrl: soniox.url,
      key: 'soniox-test-key',
    });
    const wav = wavFromPcm16(speech(600), 16_000);
    const result = await providers.transcribe({
      providerId: asr.id,
      audio: wav,
    });
    expect(result.text).toBe('你好');
    expect(soniox.sessions[0]).toMatchObject({
      config: { audio_format: 'auto' },
      bytes: wav.byteLength,
    });
  });

  it('turns a refused key into a provider-unauthorized error', async () => {
    const soniox = await fakeSoniox({ refuse: 401 });
    const { providers } = await realProviders();
    const asr = await providers.add({
      kind: 'asr',
      preset: 'soniox',
      baseUrl: soniox.url,
      key: 'soniox-bad-key',
    });
    const stream = providers.openStream({ providerId: asr.id })!;
    stream.push(speech(200));
    await expect(stream.finish()).rejects.toMatchObject({
      code: 'provider-unauthorized',
    });
    const health = await providers.test(asr.id);
    expect(health).toMatchObject({ ok: false, code: 'provider-unauthorized' });
    expect(JSON.stringify(health)).not.toContain('soniox-bad-key');
  });
});

function fakeMedia() {
  const state = {
    onPcm: undefined as ((samples: Int16Array) => void) | undefined,
  };
  const media: VoiceCallMedia = {
    availability: async () => 'ready',
    async open({ onPcm, onStatus }) {
      state.onPcm = onPcm;
      return {
        offer: {
          type: 'offer',
          sdp: 'v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n',
        },
        async answer() {
          queueMicrotask(() => onStatus('connected'));
        },
        async play() {},
        async close() {},
      };
    },
  };
  return { media, state };
}

async function streamingCall(soniox: Awaited<ReturnType<typeof fakeSoniox>>) {
  const { providers, logs } = await realProviders();
  const asr = await providers.add({
    kind: 'asr',
    preset: 'soniox',
    baseUrl: soniox.url,
    language: 'zh',
    key: 'soniox-test-key',
  });
  const tts = await providers.add({
    preset: 'custom',
    baseUrl: 'http://127.0.0.1:1/v1',
    defaultVoice: 'a',
  });
  const { media, state } = fakeMedia();
  let clock = 1_000_000;
  const sent: { body: string }[] = [];
  const callLogs: { phase: string; fields: Record<string, string | number> }[] = [];
  const calls = createVoiceCalls({
    bot: (slug) =>
      slug === 'mira'
        ? {
            slug,
            asr: { providerId: asr.id, language: 'zh' },
            voice: { providerId: tts.id },
          }
        : undefined,
    providers,
    media: () => media,
    send: async (input) => {
      sent.push(input);
    },
    busy: () => false,
    now: () => clock,
    log: (phase, fields) => callLogs.push({ phase, fields }),
  });
  cleanup.push(() => calls.dispose());
  const phone = { deviceId: 'phone-1' };
  const opened = await calls.handle(phone, { kind: 'open', slug: 'mira' });
  if (!opened.ok) throw new Error(opened.error);
  const callId = opened.call!.callId;
  await calls.handle(phone, {
    kind: 'signal',
    callId,
    answer: { type: 'answer', sdp: 'v=0\r\n' },
  });
  await until(() => true);
  return {
    calls,
    sent,
    logs,
    callLogs,
    async feed(audio: Int16Array) {
      for (const chunk of chunks(audio)) {
        clock += 20;
        state.onPcm!(chunk);
        await new Promise((resolve) => setImmediate(resolve));
      }
    },
    async view() {
      const result = await calls.handle(phone, { kind: 'heartbeat', callId });
      if (!result.ok) throw new Error(result.error);
      return result.call as VoiceCallView;
    },
  };
}

const types = (events: readonly VoiceCallEvent[]) => events.map((event) => event.type);

describe('Host call owner with a streaming ASR Provider', () => {
  it('streams only the spoken part, shows live text, and posts the final text to the DM', async () => {
    const soniox = await fakeSoniox();
    const call = await streamingCall(soniox);

    await call.feed(concat(silence(2_000), speech(1_500), silence(1_000)));
    await until(() => call.sent.length === 1);

    expect(call.sent[0]!.body).toBe('明天上海会下雨吗？');
    const view = await call.view();
    expect(types(view.events)).toEqual([
      'connected',
      'speech-start',
      'hearing',
      'transcribing',
      'sent',
    ]);
    expect(view.events.find((event) => event.type === 'hearing')).toMatchObject({ text: '明天' });
    expect(view.events.at(-1)).toMatchObject({ type: 'sent', streamed: true });
    const [session] = soniox.sessions;
    expect(session!.finalized).toBe(true);
    const ms = session!.bytes / 32;
    expect(ms).toBeGreaterThanOrEqual(1_500);
    expect(ms).toBeLessThanOrEqual(2_600);
    expect(call.callLogs.find((entry) => entry.phase === 'call-heard')?.fields).toMatchObject({
      mode: 'stream',
    });
  });

  it('opens a fresh stream per sentence', async () => {
    const soniox = await fakeSoniox({ finals: ['第一句', '第二句'] });
    const call = await streamingCall(soniox);
    await call.feed(
      concat(speech(1_200), silence(1_000), speech(1_200, { seed: 3 }), silence(1_000)),
    );
    await until(() => call.sent.length === 2);
    expect(call.sent.map((entry) => entry.body)).toEqual(['第一句', '第二句']);
    expect(soniox.sessions.filter((session) => session.config !== undefined)).toHaveLength(2);
    expect(soniox.sessions.filter((session) => session.config === undefined)).toHaveLength(1);
  });

  it('reports a refused key as asr-failed and keeps listening', async () => {
    const soniox = await fakeSoniox({ refuse: 401 });
    const call = await streamingCall(soniox);
    await call.feed(concat(speech(1_200), silence(1_000)));
    let view = await call.view();
    for (let tries = 0; !view.events.some((event) => event.type === 'asr-failed'); tries += 1) {
      if (tries > 200) throw new Error('no asr-failed event');
      await new Promise((resolve) => setTimeout(resolve, 5));
      view = await call.view();
    }
    expect(view.events.find((event) => event.type === 'asr-failed')).toMatchObject({
      code: 'provider-unauthorized',
    });
    expect(view.phase).toBe('listening');
    expect(call.sent).toEqual([]);
  });
});
