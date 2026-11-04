import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import { runVoiceLocalKit } from '../src/bots/cli-voice.js';
import { parseAgentManagement } from '../src/bots/cli-agent-management.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createTobVoiceOperations,
  TOB_VOICE_CAPABILITIES,
} from '../src/tob/cli-voice-operations.js';
import { TobError } from '../src/tob/service.js';
import {
  LOCAL_VOICE_BASE_URL,
  LOCAL_VOICE_SCRIPT,
  LOCAL_VOICE_SCRIPT_NAME,
} from '../src/voice/local-kit.js';
import { asrPreset, ttsPreset } from '../src/voice/presets.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { LOCAL_VOICE_SKILL_CONTENT } from '../src/voice/skill.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

function python(): string | undefined {
  for (const candidate of ['python3', 'python']) {
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0])'], {
      encoding: 'utf8',
    });
    if (probe.status === 0 && probe.stdout.trim() === '3') return candidate;
  }
  return undefined;
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

async function fixture() {
  const root = createTempRoot('voice-local-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(root, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  const owner = mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const providers = new VoiceProviders({
    database: attachOperationalModule(owner, 'voice'),
    credentials: () => ctx.credentials,
    timeoutMs: 5_000,
  });
  const registry = createTestRegistry({ rootDir: join(root, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  cleanup.push(async () => {
    owner.close();
    await fiber.dispose();
  });
  return { root, providers, registry };
}

describe('local speech service kit', () => {
  it('writes the script into an absolute folder and prints the steps for both systems', () => {
    const dir = join(createTempRoot('voice-kit-'), 'voice');
    const kit = runVoiceLocalKit([], { dir });
    expect(kit).toMatchObject({
      dir,
      script: join(dir, LOCAL_VOICE_SCRIPT_NAME),
      baseUrl: LOCAL_VOICE_BASE_URL,
    });
    expect(readFileSync(kit.script, 'utf8')).toBe(LOCAL_VOICE_SCRIPT);
    expect(LOCAL_VOICE_SCRIPT.startsWith('#!/usr/bin/env python3\n')).toBe(true);
    if (process.platform !== 'win32') expect(statSync(kit.script).mode & 0o111).not.toBe(0);
    expect(kit.steps.macos.join('\n')).toContain('.venv/bin/python botharness_voice.py start');
    expect(kit.steps.windows.join('\n')).toContain(
      '.venv\\Scripts\\python botharness_voice.py start',
    );
  });

  it('refuses a relative folder or positional arguments', () => {
    expect(() => runVoiceLocalKit([], { dir: 'voice' })).toThrow(/absolute folder/u);
    expect(() => runVoiceLocalKit(['x'], { dir: '/tmp/x' })).toThrow(/no positional/u);
  });

  it('runs as Python and reports a stopped service without the speech packages', async () => {
    const py = python();
    if (py === undefined) return;
    const dir = createTempRoot('voice-kit-run-');
    const { script } = runVoiceLocalKit([], { dir });
    execFileSync(py, ['-m', 'py_compile', script]);
    const port = String(await freePort());
    const run = (...args: string[]) =>
      spawnSync(py, ['-I', script, '--home', dir, '--port', port, ...args], {
        encoding: 'utf8',
        timeout: 20_000,
      });
    const status = run('status');
    expect(status.status).toBe(0);
    expect(JSON.parse(status.stdout)).toEqual({
      ok: true,
      running: false,
      baseUrl: `http://127.0.0.1:${port}/v1`,
    });
    expect(JSON.parse(run('stop').stdout)).toMatchObject({ running: false, stopped: false });
    const selftest = run('selftest');
    expect(selftest.status).toBe(1);
    expect(JSON.parse(selftest.stdout)).toMatchObject({ ok: false, code: 'not-running' });
    const exposed = run('serve', '--host', '0.0.0.0');
    expect(exposed.status).toBe(1);
    expect(JSON.parse(exposed.stdout)).toMatchObject({ ok: false, code: 'key-required' });
    expect(run('start', '--host', '0.0.0.0').status).toBe(2);
  });

  it('documents the measured sizes, the start and stop commands and both systems', () => {
    for (const text of ['166 MB', '365 MB', 'start', 'stop', 'Windows', 'macOS', 'voice-local-kit'])
      expect(LOCAL_VOICE_SKILL_CONTENT).toContain(text);
    expect(LOCAL_VOICE_SKILL_CONTENT).toContain('"sherpa-onnx>=1.13.8,<2"');
  });
});

describe('local preset', () => {
  it('points at the kit port without a key and names a stopped service plainly', async () => {
    const preset = ttsPreset('local');
    expect(preset).toMatchObject({ keyRequired: false, baseUrl: LOCAL_VOICE_BASE_URL });
    const { providers } = await fixture();
    const port = await freePort();
    const provider = await providers.add({
      preset: 'local',
      baseUrl: `http://127.0.0.1:${port}/v1`,
    });
    expect(provider).toMatchObject({
      preset: 'local',
      wire: 'openai',
      model: 'kokoro',
      defaultVoice: 'zf_001',
      keySet: false,
    });
    const health = await providers.test(provider.id);
    expect(health).toEqual({
      ok: false,
      providerId: provider.id,
      code: 'provider-unavailable',
      message: `The local speech service at http://127.0.0.1:${port} is not running. Start it on the Host computer (python botharness_voice.py start in its folder) and try again.`,
    });
  });
});

describe('local ASR preset', () => {
  it('registers SenseVoice without a key and names a stopped service plainly', async () => {
    expect(asrPreset('local')).toMatchObject({
      keyRequired: false,
      baseUrl: LOCAL_VOICE_BASE_URL,
      defaultModel: 'sensevoice',
    });
    const { providers } = await fixture();
    const port = await freePort();
    const provider = await providers.add({
      kind: 'asr',
      preset: 'local',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      language: 'zh',
    });
    expect(provider).toMatchObject({ kind: 'asr', preset: 'local', model: 'sensevoice' });
    expect(await providers.localServiceOff(provider.id, 'asr')).toBe(true);
    const custom = await providers.add({
      kind: 'asr',
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
    });
    expect(await providers.localServiceOff(custom.id, 'asr')).toBe(false);
    expect(await providers.test(provider.id)).toEqual({
      ok: false,
      providerId: provider.id,
      code: 'provider-unavailable',
      message: `The local speech service at http://127.0.0.1:${port} is not running. Start it on the Host computer (python botharness_voice.py start in its folder) and try again.`,
    });
  });
});

describe('unreachable custom provider on this computer', () => {
  it('keeps the generic message for a provider that is not the local kit', async () => {
    const { providers } = await fixture();
    const port = await freePort();
    const provider = await providers.add({
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${port}/v1`,
      defaultVoice: 'af_bella',
    });
    expect(await providers.test(provider.id)).toMatchObject({
      ok: false,
      code: 'provider-unavailable',
      message: `Nothing is listening at http://127.0.0.1:${port}. Check that the speech service is running.`,
    });
  });
});

describe('Tob voice operations', () => {
  it('lists, adds a keyless provider with a proposal, and binds a Bot voice', async () => {
    const { providers, registry } = await fixture();
    const prepare = createTobVoiceOperations({
      providers: () => providers,
      registry,
      isProtectedBot: (slug) => slug === 'tob',
    });
    expect(TOB_VOICE_CAPABILITIES.map((entry) => entry.command)).toEqual([
      'voice-providers',
      'voice-provider-add',
      'voice-provider-test',
      'voice-provider-remove',
      'voice-set',
      'voice-asr-set',
    ]);
    const guard = () => undefined;
    const listed = (await (await prepare('voice-providers', { slug: 'ada' }))!.run(guard)) as {
      providers: unknown[];
      bot: unknown;
    };
    expect(listed.providers).toEqual([]);
    expect(listed.bot).toEqual({ slug: 'ada', selected: null, asr: null });

    const add = (await prepare('voice-provider-add', { preset: 'local' }))!;
    expect(add.proposal).toEqual({
      command: 'voice-provider-add',
      target: 'voice-providers',
      previousValue: null,
      patch: { preset: 'local' },
    });
    let marked = 0;
    const { provider } = (await add.run(guard, () => (marked += 1))) as {
      provider: { id: string; baseUrl: string };
    };
    expect(marked).toBe(1);
    expect(provider.baseUrl).toBe(LOCAL_VOICE_BASE_URL);

    const set = (await prepare('voice-set', {
      slug: 'ada',
      providerId: provider.id,
      voiceId: 'zm_009',
    }))!;
    expect(set.proposal).toMatchObject({
      command: 'voice-set',
      target: 'ada',
      previousValue: null,
      patch: { providerId: provider.id, voiceId: 'zm_009' },
    });
    await set.run(guard);
    expect(registry.get('ada')?.voice).toEqual({ providerId: provider.id, voiceId: 'zm_009' });

    const off = (await prepare('voice-set', { slug: 'ada', providerId: null }))!;
    expect(off.proposal?.previousValue).toEqual({ providerId: provider.id, voiceId: 'zm_009' });
    await off.run(guard);
    expect(registry.get('ada')?.voice).toBeUndefined();
  });

  it('never takes a key, and refuses keyed presets, unknown ids and stale bindings', async () => {
    const { providers, registry } = await fixture();
    const prepare = createTobVoiceOperations({
      providers: () => providers,
      registry,
      isProtectedBot: (slug) => slug === 'tob',
    });
    const code = async (run: () => unknown) => {
      try {
        await run();
      } catch (error) {
        return (error as TobError).code;
      }
      return 'no-error';
    };
    expect(await code(() => prepare('voice-provider-add', { preset: 'openai' }))).toBe(
      'key-required',
    );
    expect(
      await code(() => prepare('voice-provider-add', { preset: 'local', key: 'sk-secret' })),
    ).toBe('invalid-input');
    expect(await code(() => prepare('voice-provider-add', { preset: 'custom' }))).toBe(
      'invalid-input',
    );
    expect(
      await code(() => prepare('voice-set', { slug: 'ada', providerId: 'tts-000000000000' })),
    ).toBe('unknown-provider');
    expect(await code(() => prepare('voice-set', { slug: 'nobody', providerId: null }))).toBe(
      'unknown-bot',
    );
    const { provider } = (await (await prepare('voice-provider-add', { preset: 'local' }))!.run(
      () => undefined,
    )) as { provider: { id: string } };
    const set = (await prepare('voice-set', { slug: 'ada', providerId: provider.id }))!;
    registry.setVoice('ada', { providerId: provider.id, voiceId: 'zf_002' });
    expect(await code(() => set.run(() => undefined))).toBe('stale-setting');
    const remove = (await prepare('voice-provider-remove', { id: provider.id }))!;
    await (await prepare('voice-provider-remove', { id: provider.id }))!.run(() => undefined);
    let removed = 0;
    expect(
      await code(() =>
        remove.run(
          () => undefined,
          () => (removed += 1),
        ),
      ),
    ).toBe('stale-setting');
    expect(removed).toBe(0);
    const asr = (await prepare('voice-provider-add', { kind: 'asr', preset: 'local' }))!;
    expect(asr.proposal?.patch).toEqual({ kind: 'asr', preset: 'local' });
    const { provider: heard } = (await asr.run(() => undefined)) as {
      provider: { id: string; kind: string };
    };
    expect(heard.kind).toBe('asr');
    expect(await code(() => prepare('voice-provider-add', { kind: 'asr', preset: 'groq' }))).toBe(
      'key-required',
    );
    expect(
      await code(() =>
        prepare('voice-provider-add', { kind: 'asr', preset: 'local', defaultVoice: 'zf_001' }),
      ),
    ).toBe('invalid-input');
    expect(
      await code(() => prepare('voice-asr-set', { slug: 'ada', providerId: provider.id })),
    ).toBe('unknown-provider');
    const bind = (await prepare('voice-asr-set', {
      slug: 'ada',
      providerId: heard.id,
      language: 'zh',
    }))!;
    expect(bind.proposal).toEqual({
      command: 'voice-asr-set',
      target: 'ada',
      previousValue: null,
      patch: { providerId: heard.id, language: 'zh' },
    });
    await bind.run(() => undefined);
    expect(registry.get('ada')?.asr).toEqual({ providerId: heard.id, language: 'zh' });
    const dropAsr = (await prepare('voice-provider-remove', { id: heard.id }))!;
    expect(dropAsr.proposal?.previousValue).toMatchObject({ id: heard.id, kind: 'asr' });
    await dropAsr.run(() => undefined);
    expect(registry.get('ada')?.asr).toBeUndefined();
    expect(registry.create({ slug: 'tob', displayName: 'Tob' }).ok).toBe(true);
    expect(await code(() => prepare('voice-set', { slug: 'tob', providerId: null }))).toBe(
      'protected-bot',
    );
    expect(await code(() => prepare('voice-asr-set', { slug: 'tob', providerId: null }))).toBe(
      'protected-bot',
    );
    const { provider: kept } = (await (await prepare('voice-provider-add', {
      preset: 'local',
    }))!.run(() => undefined)) as { provider: { id: string } };
    registry.setVoice('tob', { providerId: kept.id, voiceId: 'zf_001' });
    expect(await code(() => prepare('voice-provider-remove', { id: kept.id }))).toBe(
      'protected-bot',
    );
    expect(await prepare('model-catalog', {})).toBeUndefined();
  });
});

describe('scoped CLI parsing for voice', () => {
  const io = { env: {}, stdout: () => undefined, stderr: () => undefined };
  it('maps the same flags as the Host CLI and keeps keys out', async () => {
    expect(
      await parseAgentManagement(
        'voice-provider-add',
        ['local'],
        { 'base-url': 'http://127.0.0.1:8791/v1', voice: 'zf_001' },
        io,
      ),
    ).toEqual({
      command: 'voice-provider-add',
      args: { preset: 'local', baseUrl: 'http://127.0.0.1:8791/v1', defaultVoice: 'zf_001' },
      write: true,
    });
    expect(await parseAgentManagement('voice-set', ['ada', 'off'], {}, io)).toEqual({
      command: 'voice-set',
      args: { slug: 'ada', providerId: null },
      write: true,
    });
    expect(
      await parseAgentManagement(
        'voice-provider-test',
        ['tts-0123456789ab'],
        { voice: 'af_sol' },
        io,
      ),
    ).toEqual({
      command: 'voice-provider-test',
      args: { id: 'tts-0123456789ab', voiceId: 'af_sol' },
      write: false,
    });
    expect(
      await parseAgentManagement(
        'voice-provider-add',
        ['local'],
        { kind: 'asr', language: 'zh' },
        io,
      ),
    ).toEqual({
      command: 'voice-provider-add',
      args: { preset: 'local', kind: 'asr', language: 'zh' },
      write: true,
    });
    expect(
      await parseAgentManagement(
        'voice-asr-set',
        ['ada', 'asr-0123456789ab'],
        { language: 'zh' },
        io,
      ),
    ).toEqual({
      command: 'voice-asr-set',
      args: { slug: 'ada', providerId: 'asr-0123456789ab', language: 'zh' },
      write: true,
    });
    await expect(
      parseAgentManagement('voice-provider-add', ['openai'], { 'key-stdin': true }, io),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
  });
});
