import { readFileSync } from 'node:fs';
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
        body: JSON.parse(raw) as Record<string, unknown>,
      });
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
});
