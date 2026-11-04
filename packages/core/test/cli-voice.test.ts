import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import { runVoiceCommand, type VoiceValues } from '../src/bots/cli-voice.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createVoiceBridgeMethods } from '../src/voice/bridge.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { concat, silence, speech } from './voice-audio-fixtures.js';

const WAV = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.alloc(4),
  Buffer.from('WAVEfmt '),
  Buffer.alloc(32, 3),
]);
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function host() {
  const seen: { url: string; auth?: string; body: Record<string, unknown> }[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      seen.push({
        url: request.url ?? '',
        ...(request.headers.authorization === undefined
          ? {}
          : { auth: request.headers.authorization }),
        body: request.headers['content-type']?.startsWith('application/json')
          ? (JSON.parse(raw) as Record<string, unknown>)
          : { multipart: raw.includes('name="file"') },
      });
      if (request.url?.endsWith('/audio/transcriptions')) {
        response.writeHead(200, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ text: 'call me back tomorrow' }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'audio/wav' });
      response.end(WAV);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const root = createTempRoot('cli-voice-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  cleanup.push(() => fiber.dispose());
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({ rootDir: join(root, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const methods = createVoiceBridgeMethods({
    providers: new VoiceProviders({
      database: attachOperationalModule(owner, 'voice'),
      credentials: () => ctx.credentials,
    }),
    registry,
  }) as unknown as Record<string, (payload: unknown) => unknown>;
  const calls: [string, Record<string, unknown>][] = [];
  const connect = async () => async (method: string, payload: Record<string, unknown>) => {
    calls.push([method, payload]);
    const result = (await methods[method]!(payload)) as
      | { ok: true; value: unknown }
      | { ok: false; error: { code: string } };
    if (!result.ok) throw Object.assign(new Error(result.error.code), result.error);
    return result.value;
  };
  const run = (
    command: Parameters<typeof runVoiceCommand>[0],
    rest: string[],
    values: VoiceValues = {},
    stdin = '',
  ) => runVoiceCommand(command, rest, values, { readStdin: async () => stdin }, connect);
  return {
    run,
    calls,
    seen,
    root,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
  };
}

describe('deepseekbot voice commands', () => {
  it('adds, tests, binds, synthesizes and removes a provider without printing the key', async () => {
    const { run, calls, seen, root, url } = await host();
    const added = (await run(
      'voice-provider-add',
      ['openai'],
      { 'base-url': `${url}/v1`, voice: 'nova', 'key-stdin': true },
      'sk-test-secret-123456\n',
    )) as { provider: { id: string; keySet: boolean } };
    expect(added.provider.keySet).toBe(true);
    expect(JSON.stringify(added)).not.toContain('sk-test');
    const id = added.provider.id;

    expect(await run('voice-provider-test', [id])).toMatchObject({ ok: true, mime: 'audio/wav' });
    expect(seen[0]).toMatchObject({
      url: '/v1/audio/speech',
      auth: 'Bearer sk-test-secret-123456',
      body: { voice: 'nova' },
    });

    expect(await run('voice-set', ['ada', id], { voice: 'shimmer' })).toEqual({
      slug: 'ada',
      voice: { providerId: id, voiceId: 'shimmer' },
    });
    const listed = (await run('voice-providers', [], { bot: 'ada' })) as Record<string, unknown>;
    expect(listed).toMatchObject({ bot: { selected: { providerId: id, voiceId: 'shimmer' } } });
    expect(JSON.stringify(listed)).not.toContain('sk-test');

    const out = join(root, 'speech.wav');
    const spoken = await run('voice-synthesize', [], {
      bot: 'ada',
      text: 'See `/tmp/a/b.txt` now.',
      markdown: true,
      out,
    });
    expect(spoken).toMatchObject({ voiceId: 'shimmer', mime: 'audio/wav', out });
    expect(spoken).not.toHaveProperty('audio');
    expect(readFileSync(out)).toEqual(WAV);
    expect(seen.at(-1)!.body).toMatchObject({ voice: 'shimmer', input: 'See a file path now.' });

    expect(await run('voice-provider-remove', [id])).toMatchObject({ clearedBots: ['ada'] });
    expect(await run('voice-set', ['ada', 'off'])).toEqual({ slug: 'ada', voice: null });
    expect(JSON.stringify(calls)).toContain('"key":"sk-test-secret-123456"');
    expect(calls.map(([method]) => method)).toEqual([
      'voiceProviderAdd',
      'voiceProviderTest',
      'botVoiceSet',
      'voiceProviders',
      'voiceSynthesize',
      'voiceProviderRemove',
      'botVoiceSet',
    ]);
  });

  it('refuses malformed arguments before connecting', async () => {
    const { run, calls } = await host();
    for (const [command, rest, values] of [
      ['voice-providers', ['x'], {}],
      ['voice-provider-add', [], {}],
      ['voice-provider-add', ['openai'], { 'key-stdin': true }],
      ['voice-provider-test', [], {}],
      ['voice-set', ['ada'], {}],
      ['voice-set', ['ada', 'off'], { voice: 'x' }],
      ['voice-synthesize', [], { text: 'hi', out: '/tmp/x.mp3' }],
      ['voice-synthesize', [], { bot: 'ada', out: '/tmp/x.mp3' }],
      ['voice-synthesize', [], { bot: 'ada', text: 'hi', out: 'relative.mp3' }],
    ] as const)
      await expect(run(command, [...rest], values as VoiceValues)).rejects.toMatchObject({
        code: 'usage',
      });
    expect(calls).toEqual([]);
  });

  it('reports a clear refusal for an unknown provider', async () => {
    const { run } = await host();
    await expect(run('voice-set', ['ada', 'tts-000000000000'])).rejects.toMatchObject({
      code: 'unknown-provider',
    });
    await expect(run('voice-provider-add', ['nope'])).rejects.toMatchObject({
      code: 'invalid-input',
    });
  });

  it('adds an ASR Provider, binds it to a Bot and transcribes a test file', async () => {
    const { run, calls, seen, root, url } = await host();
    const added = (await run(
      'voice-provider-add',
      ['groq'],
      { kind: 'asr', 'base-url': `${url}/openai/v1`, language: 'en', 'key-stdin': true },
      'gsk-secret-0123456789\n',
    )) as { provider: { id: string; kind: string; keySet: boolean } };
    expect(added.provider).toMatchObject({ kind: 'asr', keySet: true });
    const id = added.provider.id;
    expect(await run('voice-provider-test', [id])).toMatchObject({ ok: true });
    expect(await run('voice-asr-set', ['ada', id], { language: 'zh' })).toEqual({
      slug: 'ada',
      asr: { providerId: id, language: 'zh' },
    });
    const file = join(root, 'question.wav');
    const { wavFromPcm16 } = await import('../src/voice/providers.js');
    (await import('node:fs')).writeFileSync(file, wavFromPcm16(new Int16Array(8_000), 16_000));
    expect(await run('voice-transcribe', [], { bot: 'ada', file })).toEqual({
      providerId: id,
      language: 'zh',
      text: 'call me back tomorrow',
      latencyMs: expect.any(Number),
    });
    expect(seen.at(-1)).toMatchObject({
      url: '/openai/v1/audio/transcriptions',
      auth: 'Bearer gsk-secret-0123456789',
      body: { multipart: true },
    });
    const listed = (await run('voice-providers', [], { bot: 'ada' })) as Record<string, unknown>;
    expect(listed).toMatchObject({
      asrProviders: [{ id, kind: 'asr' }],
      bot: { asr: { providerId: id, language: 'zh' } },
    });
    expect(await run('voice-provider-remove', [id])).toMatchObject({ clearedBots: ['ada'] });
    expect(await run('voice-asr-set', ['ada', 'off'])).toEqual({ slug: 'ada', asr: null });
    expect(calls.map(([method]) => method)).toContain('voiceTranscribe');
    for (const [command, rest, values] of [
      ['voice-provider-add', ['groq'], { kind: 'stt' }],
      ['voice-provider-add', ['custom'], { kind: 'asr', voice: 'x' }],
      ['voice-asr-set', ['ada', 'off'], { language: 'en' }],
      ['voice-transcribe', [], { bot: 'ada' }],
      ['voice-transcribe', [], { file }],
      ['voice-transcribe', [], { bot: 'ada', file: 'relative.wav' }],
    ] as const)
      await expect(run(command, [...rest], values as VoiceValues)).rejects.toMatchObject({
        code: 'usage',
      });
  });

  it('sets and shows the Host-wide default TTS and ASR Providers', async () => {
    const { run } = await host();
    expect(await run('voice-defaults', [])).toMatchObject({ defaults: { tts: null, asr: null } });
    const asr = (await run('voice-provider-add', ['local'], { kind: 'asr' })) as {
      provider: { id: string };
    };
    const tts = (await run('voice-provider-add', ['local'])) as { provider: { id: string } };
    expect(await run('voice-default-set', ['asr', asr.provider.id], { language: 'zh' })).toEqual({
      defaults: {
        tts: { providerId: tts.provider.id },
        asr: { providerId: asr.provider.id, language: 'zh' },
      },
    });
    await run('voice-default-set', ['tts', tts.provider.id], { voice: 'zm_009' });
    expect(await run('voice-defaults', [])).toMatchObject({
      defaults: {
        tts: { providerId: tts.provider.id, voiceId: 'zm_009' },
        asr: { providerId: asr.provider.id, language: 'zh' },
      },
    });
    expect(await run('voice-vad-set', ['-58'])).toMatchObject({
      speechThreshold: { dbfs: -58, custom: true },
    });
    expect(await run('voice-defaults', [])).toMatchObject({ speechThreshold: { dbfs: -58 } });
    expect(await run('voice-vad-set', ['default'])).toMatchObject({
      speechThreshold: { dbfs: -50, custom: false },
    });
    await expect(run('voice-vad-set', ['loud'])).rejects.toMatchObject({ code: 'usage' });
    await expect(run('voice-vad-set', [])).rejects.toMatchObject({ code: 'usage' });
    expect(await run('voice-default-set', ['tts', 'off'])).toMatchObject({
      defaults: { tts: null },
    });
    for (const [rest, values] of [
      [['call', 'off'], {}],
      [['tts', tts.provider.id], { language: 'zh' }],
      [['asr', asr.provider.id], { voice: 'x' }],
      [['asr', 'off'], { language: 'zh' }],
      [['asr'], {}],
    ] as const)
      await expect(
        run('voice-default-set', [...rest], values as VoiceValues),
      ).rejects.toMatchObject({ code: 'usage' });
  });

  it('dictates a WAV through the composer dictation session', async () => {
    const { run, calls, seen, root, url } = await host();
    const added = (await run(
      'voice-provider-add',
      ['groq'],
      { kind: 'asr', 'base-url': `${url}/openai/v1`, 'key-stdin': true },
      'gsk-secret-0123456789\n',
    )) as { provider: { id: string } };
    const file = join(root, 'dictate.wav');
    const { wavFromPcm16 } = await import('../src/voice/providers.js');
    (await import('node:fs')).writeFileSync(
      file,
      wavFromPcm16(concat(silence(300), speech(1_000), silence(300)), 16_000),
    );
    const result = (await run('voice-dictate', [], { file })) as Record<string, unknown>;
    expect(result).toMatchObject({
      providerId: added.provider.id,
      mode: 'segments',
      state: 'done',
      text: 'call me back tomorrow',
      audioMs: 1_600,
    });
    expect((result['heard'] as string[]).at(-1)).toBe('call me back tomorrow');
    expect(seen.filter((entry) => entry.url.endsWith('/audio/transcriptions'))).toHaveLength(1);
    expect(calls.map(([method, payload]) => `${method}:${String(payload['kind'])}`)).toEqual([
      'voiceProviderAdd:asr',
      'voiceDictation:open',
      ...Array.from({ length: 8 }, () => 'voiceDictation:push'),
      'voiceDictation:stop',
    ]);
    await expect(run('voice-dictate', [], { file: 'relative.wav' })).rejects.toMatchObject({
      code: 'usage',
    });
  });

  it('refuses a WAV over the dictation limit and reports a failed stop', async () => {
    const root = createTempRoot('cli-dictate-');
    const { wavFromPcm16 } = await import('../src/voice/providers.js');
    const long = join(root, 'long.wav');
    writeFileSync(long, wavFromPcm16(new Int16Array(16_000 * 121), 16_000));
    const short = join(root, 'short.wav');
    writeFileSync(short, wavFromPcm16(new Int16Array(6_400), 16_000));
    const kinds: string[] = [];
    const connect = async () => async (_method: string, payload: Record<string, unknown>) => {
      kinds.push(String(payload['kind']));
      if (payload['kind'] === 'open') return { dictation: { id: 'dict-0000000000000001' } };
      if (payload['kind'] === 'push') return { dictation: { state: 'listening', text: '' } };
      return {
        dictation: { state: 'failed', text: '', error: { code: 'asr-failed', message: 'down' } },
      };
    };
    const dictate = (file: string) =>
      runVoiceCommand('voice-dictate', [], { file }, {}, connect as never);
    await expect(dictate(long)).rejects.toMatchObject({ code: 'invalid-input' });
    expect(kinds).toEqual([]);
    await expect(dictate(short)).rejects.toMatchObject({ code: 'asr-failed', message: 'down' });
    expect(kinds).toEqual(['open', 'push', 'push', 'stop']);
    kinds.length = 0;
    const cancelled = async () => async (_method: string, payload: Record<string, unknown>) => {
      kinds.push(String(payload['kind']));
      if (payload['kind'] === 'open') return { dictation: { id: 'dict-0000000000000002' } };
      return { dictation: { state: 'cancelled', text: 'half' } };
    };
    await expect(
      runVoiceCommand('voice-dictate', [], { file: short }, {}, cancelled as never),
    ).rejects.toMatchObject({ code: 'dictation-cancelled' });
    expect(kinds).toEqual(['open', 'push', 'stop']);
  });
});
