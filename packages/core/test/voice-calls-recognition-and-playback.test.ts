import {
  cleanup,
  clipFor,
  connected,
  fakeMedia,
  harness,
  heard,
  settled,
  types,
  view,
} from './voice-calls-fixtures.js';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { joinTranscripts } from '../src/voice/calls.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { createTempRoot } from './helpers.js';
import { concat, cough, knock, silence, speech } from './voice-audio-fixtures.js';
import { requestListener } from './async-listener.js';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(256, 1)]);

async function fakeSpeechService(transcripts: string[]) {
  const heard: { bytes: number; sampleRate: number; language: string | null }[] = [];
  const server: Server = createServer(
    requestListener(async (request, response) => {
      const parts: Buffer[] = [];
      for await (const chunk of request) parts.push(chunk as Buffer);
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
    }),
  );
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
        speech: { fromMs: expect.any(Number), toMs: expect.any(Number) },
      },
    ]);
    const heardRange = h.sent[0]!.speech!;
    expect(heardRange.toMs - heardRange.fromMs).toBeGreaterThan(1_000);
    let current = await view(h, callId);
    expect(types(current.events)).toEqual(['connected', 'speech-start', 'transcribing', 'sent']);

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
    expect(state.played).toEqual([{ bytes: MP3.length, mime: 'audio/mpeg' }]);
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

  it('shows busy while the Orchestrator runs a turn and plays nothing on its own', async () => {
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
    expect(state.audio).toEqual([]);
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
    expect(h.synthesized).toEqual([]);
  });
});
