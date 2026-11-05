import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { chineseScript, VoiceProviders } from '../src/voice/providers.js';
import { speakableText } from '../src/voice/speakable.js';
import { createTempRoot } from './helpers.js';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 1)]);
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

interface Seen {
  method: string;
  url: string;
  headers: IncomingMessage['headers'];
  body: Record<string, unknown>;
}

async function fakeTts(
  respond: (seen: Seen) => { status: number; type?: string; body: Buffer | string } = () => ({
    status: 200,
    type: 'audio/mpeg',
    body: MP3,
  }),
) {
  const requests: Seen[] = [];
  const server: Server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      const seen = {
        method: request.method ?? '',
        url: request.url ?? '',
        headers: request.headers,
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      };
      requests.push(seen);
      const answer = respond(seen);
      response.writeHead(answer.status, { 'Content-Type': answer.type ?? 'application/json' });
      response.end(answer.body);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests };
}

async function fixture(options: { timeoutMs?: number } = {}) {
  const root = createTempRoot('voice-providers-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const owner = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const logs: { phase: string; fields: Record<string, string | number> }[] = [];
  const providers = new VoiceProviders({
    database: attachOperationalModule(owner, 'voice'),
    credentials: () => ctx.credentials,
    ...(options.timeoutMs === undefined ? {} : { timeoutMs: options.timeoutMs }),
    log: (phase, fields) => logs.push({ phase, fields }),
  });
  cleanup.push(async () => {
    owner.close();
    await fiber.dispose();
  });
  return { providers, logs, root, owner };
}

describe('TTS Provider owner', () => {
  it('synthesizes through a custom OpenAI-compatible endpoint and reports health', async () => {
    const service = await fakeTts();
    const { providers, owner } = await fixture();
    const provider = await providers.add({
      preset: 'custom',
      name: 'Local Kokoro',
      baseUrl: `${service.url}/v1/`,
      model: 'kokoro',
      defaultVoice: 'af_bella',
    });
    expect(provider).toMatchObject({
      preset: 'custom',
      wire: 'openai',
      baseUrl: `${service.url}/v1`,
      keySet: false,
    });
    const health = await providers.test(provider.id);
    expect(health).toMatchObject({ ok: true, mime: 'audio/mpeg', bytes: MP3.length });
    expect(service.requests[0]).toMatchObject({
      method: 'POST',
      url: '/v1/audio/speech',
      body: { model: 'kokoro', voice: 'af_bella', response_format: 'mp3', input: 'Hello.' },
    });
    expect(service.requests[0]!.headers.authorization).toBeUndefined();
    const stored = attachOperationalModule(owner, 'voice').read((db) =>
      db.prepare('SELECT body FROM voice_providers').all(),
    );
    expect(JSON.stringify(stored)).not.toContain('key');
  });

  it('keeps a preset key in the credentials store and never returns it', async () => {
    const service = await fakeTts();
    const { providers, owner, logs } = await fixture();
    const secret = 'fa-secret-key-0123456789';
    const provider = await providers.add({
      preset: 'fish-audio',
      baseUrl: service.url,
      model: 's2.1-pro-free',
      key: secret,
    });
    expect(provider.keySet).toBe(true);
    expect(JSON.stringify(providers.list())).not.toContain(secret);
    const result = await providers.synthesize({
      providerId: provider.id,
      voiceId: 'ref-123',
      text: '你好',
    });
    expect(result.mime).toBe('audio/mpeg');
    expect(service.requests[0]).toMatchObject({
      url: '/v1/tts',
      body: { text: '你好', reference_id: 'ref-123', format: 'mp3' },
    });
    expect(service.requests[0]!.headers.authorization).toBe(`Bearer ${secret}`);
    expect(service.requests[0]!.headers['model']).toBe('s2.1-pro-free');
    const rows = attachOperationalModule(owner, 'voice').read((db) =>
      db.prepare('SELECT body FROM voice_providers').all(),
    );
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });

  it('requires a key for a key-only preset', async () => {
    const { providers } = await fixture();
    await expect(providers.add({ preset: 'elevenlabs' })).rejects.toMatchObject({
      code: 'key-required',
    });
    await expect(providers.add({ preset: 'custom' })).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  it('turns provider failures into clear health results without leaking the key', async () => {
    const secret = 'xi-leaky-secret-abcdef123456';
    const service = await fakeTts((seen) =>
      seen.url.includes('/v1/text-to-speech/')
        ? {
            status: 401,
            body: JSON.stringify({
              detail: { status: 'invalid_api_key', message: `bad ${secret}` },
            }),
          }
        : { status: 200, body: 'not audio', type: 'text/plain' },
    );
    const { providers } = await fixture();
    const eleven = await providers.add({ preset: 'elevenlabs', baseUrl: service.url, key: secret });
    const health = await providers.test(eleven.id);
    expect(health).toMatchObject({ ok: false, code: 'provider-unauthorized' });
    expect(JSON.stringify(health)).not.toContain(secret);
    expect(service.requests[0]!.headers['xi-api-key']).toBe(secret);
    expect(service.requests[0]!.url).toContain('/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb');

    const custom = await providers.add({
      preset: 'custom',
      baseUrl: service.url,
      defaultVoice: 'a',
    });
    expect(await providers.test(custom.id)).toMatchObject({
      ok: false,
      code: 'provider-bad-response',
    });
  });

  it('reports an unreachable endpoint and a timeout', async () => {
    const { providers } = await fixture({ timeoutMs: 200 });
    const closed = await providers.add({
      preset: 'custom',
      baseUrl: 'http://127.0.0.1:9',
      defaultVoice: 'a',
    });
    expect(await providers.test(closed.id)).toMatchObject({
      ok: false,
      code: 'provider-unavailable',
    });
    const hanging = createServer(() => undefined);
    await new Promise<void>((resolve) => hanging.listen(0, '127.0.0.1', resolve));
    cleanup.push(() => {
      hanging.closeAllConnections();
      return new Promise<void>((resolve) => hanging.close(() => resolve()));
    });
    const slow = await providers.add({
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${(hanging.address() as AddressInfo).port}`,
      defaultVoice: 'a',
    });
    expect(await providers.test(slow.id)).toMatchObject({ ok: false, code: 'provider-timeout' });
  });

  it('removes a provider and its stored key', async () => {
    const service = await fakeTts();
    const { providers } = await fixture();
    const provider = await providers.add({ preset: 'openai', baseUrl: service.url, key: 'sk-1' });
    await providers.remove(provider.id);
    expect(providers.list()).toEqual([]);
    await expect(
      providers.synthesize({ providerId: provider.id, text: 'hi' }),
    ).rejects.toMatchObject({ code: 'unknown-provider' });
  });
});

describe('speakable text', () => {
  it('does not read code blocks, paths, URLs or tables verbatim', () => {
    const spoken = speakableText(
      [
        '## Done',
        'I fixed **the bug** in `src/app/main.ts` — see /Users/ada/project/src/index.ts.',
        '```ts',
        'const secret = compute();',
        '```',
        '| a | b |',
        '| --- | --- |',
        '| 1 | 2 |',
        'Details: https://example.com/very/long/path?x=1',
        '- First item',
      ].join('\n'),
    );
    expect(spoken).not.toMatch(/compute|src\/app|\/Users\/ada|example\.com|\| a \||\*\*|##/u);
    expect(spoken).toContain('Done.');
    expect(spoken).toContain('the bug');
    expect(spoken).toContain('(code is in the text)');
    expect(spoken).toContain('(table is in the text)');
    expect(spoken).toContain('a file path');
    expect(spoken).toContain('First item');
  });

  it('replaces bare relative file paths but keeps short slash words', () => {
    expect(speakableText('The change is in src/app/main.ts, and/or docs/adr/notes.')).toBe(
      'The change is in a file path, and/or a file path.',
    );
    expect(speakableText('Speed is 5 km/h.')).toBe('Speed is 5 km/h.');
  });

  it('keeps Chinese prose natural', () => {
    expect(speakableText('好的，我**马上**处理。\n\n```\nrm -rf /\n```')).toBe(
      '好的，我马上处理。（代码见文字）',
    );
  });
});

async function fakeAsr(respond: (form: FormData, headers: Headers) => Response) {
  const requests: { url: string; form: FormData; headers: Headers }[] = [];
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', async () => {
      const headers = new Headers(request.headers as Record<string, string>);
      const form = await new Request('http://x', {
        method: 'POST',
        headers,
        body: Buffer.concat(chunks),
      }).formData();
      requests.push({ url: request.url ?? '', form, headers });
      const answer = respond(form, headers);
      response.writeHead(answer.status, { 'Content-Type': 'application/json' });
      response.end(Buffer.from(await answer.arrayBuffer()));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;
  return { url: `http://127.0.0.1:${port}`, requests };
}

describe('ASR Provider owner', () => {
  it('transcribes WAV through an OpenAI-compatible endpoint with its key and language', async () => {
    const service = await fakeAsr(() => Response.json({ text: '  帮我查一下\n天气 ' }));
    const { providers, owner, logs } = await fixture();
    const secret = 'sk-asr-secret-0123456789';
    const provider = await providers.add({
      kind: 'asr',
      preset: 'openai',
      baseUrl: `${service.url}/v1`,
      language: 'zh',
      key: secret,
    });
    expect(provider).toMatchObject({
      kind: 'asr',
      preset: 'openai',
      model: 'gpt-4o-mini-transcribe',
      language: 'zh',
      keySet: true,
    });
    expect(provider.id).toMatch(/^asr-[a-f0-9]{12}$/u);
    expect(providers.list()).toEqual([]);
    expect(providers.listAsr()).toEqual([provider]);
    const { wavFromPcm16 } = await import('../src/voice/providers.js');
    const result = await providers.transcribe({
      providerId: provider.id,
      audio: wavFromPcm16(new Int16Array(16_000), 16_000),
    });
    expect(result.text).toBe('帮我查一下 天气');
    const seen = service.requests[0]!;
    expect(seen.url).toBe('/v1/audio/transcriptions');
    expect(seen.headers.get('authorization')).toBe(`Bearer ${secret}`);
    expect(seen.form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(seen.form.get('language')).toBe('zh');
    expect(seen.form.get('response_format')).toBe('json');
    expect(seen.form.get('prompt')).toBe(chineseScript('zh'));
    const file = seen.form.get('file') as File;
    expect(file.type).toBe('audio/wav');
    expect(file.size).toBe(44 + 32_000);
    const rows = attachOperationalModule(owner, 'voice').read((db) =>
      db.prepare('SELECT body FROM voice_providers').all(),
    );
    expect(JSON.stringify(rows)).not.toContain(secret);
    expect(JSON.stringify(logs)).not.toContain(secret);
  });

  it('keeps TTS and ASR Providers apart', async () => {
    const service = await fakeAsr(() => Response.json({ text: 'ok' }));
    const { providers } = await fixture();
    const asr = await providers.add({ kind: 'asr', preset: 'custom', baseUrl: service.url });
    const tts = await providers.add({ preset: 'custom', baseUrl: service.url, defaultVoice: 'a' });
    await expect(providers.synthesize({ providerId: asr.id, text: 'hi' })).rejects.toMatchObject({
      code: 'wrong-provider-kind',
    });
    await expect(
      providers.transcribe({ providerId: tts.id, audio: new Uint8Array([1, 2]) }),
    ).rejects.toMatchObject({ code: 'wrong-provider-kind' });
    expect(providers.has(asr.id, 'asr')).toBe(true);
    expect(providers.has(asr.id)).toBe(false);
    await expect(
      providers.add({ kind: 'asr', preset: 'custom', baseUrl: service.url, defaultVoice: 'x' }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    await expect(providers.add({ kind: 'asr', preset: 'groq' })).rejects.toMatchObject({
      code: 'key-required',
    });
    const removed = await providers.remove(asr.id);
    expect(removed.kind).toBe('asr');
    expect(providers.listAsr()).toEqual([]);
  });

  it('reports provider failures with codes and health-checks with silence', async () => {
    let status = 401;
    const service = await fakeAsr(() =>
      status === 200
        ? Response.json({ text: '' })
        : Response.json({ error: { message: 'bad key sk-leakedkey0123456' } }, { status }),
    );
    const { providers } = await fixture();
    const provider = await providers.add({ kind: 'asr', preset: 'custom', baseUrl: service.url });
    const failed = await providers.test(provider.id);
    expect(failed).toMatchObject({ ok: false, code: 'provider-unauthorized' });
    expect(JSON.stringify(failed)).not.toContain('sk-leakedkey');
    status = 200;
    expect(await providers.test(provider.id)).toMatchObject({ ok: true });
    status = 503;
    await expect(
      providers.transcribe({
        providerId: provider.id,
        audio: (await import('../src/voice/providers.js')).wavFromPcm16(new Int16Array(10), 16_000),
      }),
    ).rejects.toMatchObject({ code: 'provider-unavailable' });
    await expect(
      providers.transcribe({ providerId: provider.id, audio: new Uint8Array([0, 1, 2, 3]) }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });
});

describe('Chinese script hint', () => {
  it('asks for Simplified unless the language names a Traditional region', () => {
    expect(chineseScript('zh')).toContain('简体');
    expect(chineseScript('zh-CN')).toContain('简体');
    expect(chineseScript('zh-TW')).toContain('繁體');
    expect(chineseScript('zh-Hant')).toContain('繁體');
    expect(chineseScript('en')).toBeUndefined();
    expect(chineseScript(undefined)).toBeUndefined();
  });
});
