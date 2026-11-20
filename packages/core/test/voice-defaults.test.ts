import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import type { PersonaBotRegistry } from '../src/bots/registry.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createVoiceBridgeMethods } from '../src/voice/bridge.js';
import { createVoiceDictations } from '../src/voice/dictation.js';
import { ASR_PRESETS, TTS_PRESETS, uniqueProviderName } from '../src/voice/presets.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { clampSpeechDbfs, createVad, DEFAULT_SPEECH_DBFS } from '../src/voice/vad.js';
import { createTempRoot } from './helpers.js';

const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function fixture() {
  const root = createTempRoot('voice-defaults-');
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
  });
  cleanup.push(async () => {
    owner.close();
    await fiber.dispose();
  });
  return providers;
}

function registry(
  bots: Record<
    string,
    { asr?: { providerId: string; language?: string }; voice?: { providerId: string } }
  >,
): PersonaBotRegistry {
  return {
    get: (slug: string) => (slug in bots ? { slug, ...bots[slug] } : undefined),
    list: () => Object.entries(bots).map(([slug, bot]) => ({ slug, ...bot })),
  } as unknown as PersonaBotRegistry;
}

describe('unique Provider names', () => {
  it('keeps a free name and numbers a taken one', () => {
    expect(uniqueProviderName('Soniox (streaming)', [])).toBe('Soniox (streaming)');
    expect(uniqueProviderName('OpenAI', ['openai'])).toBe('OpenAI 2');
    expect(uniqueProviderName('OpenAI', ['OpenAI', 'OpenAI 2'])).toBe('OpenAI 3');
  });

  it('names Providers added without a name uniquely across TTS and ASR', async () => {
    const providers = await fixture();
    const first = await providers.add({ preset: 'local' });
    const second = await providers.add({ preset: 'local' });
    const named = await providers.add({ preset: 'local', name: 'Kokoro' });
    const asr = await providers.add({ kind: 'asr', preset: 'local' });
    const asrAgain = await providers.add({ kind: 'asr', preset: 'local' });
    expect([first.name, second.name, named.name]).toEqual([
      'Local speech service (Kokoro)',
      'Local speech service (Kokoro) 2',
      'Kokoro',
    ]);
    expect([asr.name, asrAgain.name]).toEqual([
      'Local speech service (SenseVoice)',
      'Local speech service (SenseVoice) 2',
    ]);
  });
});

describe('preset model lists', () => {
  it('lists each preset default model among its models', () => {
    for (const preset of [...TTS_PRESETS, ...ASR_PRESETS]) {
      expect(preset.models.length).toBeGreaterThan(0);
      if (preset.defaultModel !== undefined) expect(preset.models).toContain(preset.defaultModel);
      expect(new Set(preset.models).size).toBe(preset.models.length);
    }
    expect(TTS_PRESETS.find((preset) => preset.id === 'fish-audio')?.models).toContain('s2.1-pro');
    expect(TTS_PRESETS.find((preset) => preset.id === 'elevenlabs')?.models).toContain(
      'eleven_flash_v2_5',
    );
  });
});

describe('Host-wide voice defaults', () => {
  it('stores, validates, clears, and drops a default when its Provider is removed', async () => {
    const providers = await fixture();
    const tts = await providers.add({ preset: 'local' });
    const asr = await providers.add({ kind: 'asr', preset: 'local' });
    expect(providers.defaults()).toEqual({
      tts: { providerId: tts.id },
      asr: { providerId: asr.id },
    });
    await providers.add({ kind: 'asr', preset: 'local' });
    expect(providers.defaults().asr).toEqual({ providerId: asr.id });
    providers.setDefault('tts', { providerId: tts.id, voiceId: 'zm_009' });
    providers.setDefault('asr', { providerId: asr.id, language: 'zh' });
    expect(providers.defaults()).toEqual({
      tts: { providerId: tts.id, voiceId: 'zm_009' },
      asr: { providerId: asr.id, language: 'zh' },
    });
    expect(() => providers.setDefault('asr', { providerId: tts.id })).toThrow(/ASR/u);
    expect(() => providers.setDefault('asr', { providerId: asr.id, language: 'Chinese' })).toThrow(
      /Language/u,
    );
    providers.setDefault('tts', null);
    expect(providers.defaults().tts).toBeNull();
    await providers.remove(asr.id);
    expect(providers.defaults()).toEqual({ tts: null, asr: null });
  });

  it('fills only the bindings a Bot does not set itself', async () => {
    const providers = await fixture();
    const tts = await providers.add({ preset: 'local' });
    const asr = await providers.add({ kind: 'asr', preset: 'local' });
    const own = await providers.add({ preset: 'local' });
    const bot = (slug: string, voice?: { providerId: string }) => ({
      slug,
      ...(voice === undefined ? {} : { voice }),
    });
    expect(providers.effective(bot('a'))).toEqual({
      slug: 'a',
      voice: { providerId: tts.id },
      asr: { providerId: asr.id },
    });
    expect(providers.effective(bot('b', { providerId: own.id }))?.voice).toEqual({
      providerId: own.id,
    });
    expect(providers.effective(undefined)).toBeUndefined();
  });

  it('lets Bot dictation and the bridge view follow the default unless overridden', async () => {
    const providers = await fixture();
    const own = await providers.add({
      kind: 'asr',
      preset: 'custom',
      baseUrl: 'http://127.0.0.1:9/v1',
    });
    const chosen = await providers.add({
      kind: 'asr',
      preset: 'custom',
      baseUrl: 'http://127.0.0.1:9/v1',
    });
    const bridge = createVoiceBridgeMethods({
      providers,
      registry: registry({ plain: {}, custom: { asr: { providerId: own.id } } }),
    });
    const readiness = async (slug: string) => {
      const result = await bridge.voiceDictation({ kind: 'readiness', slug });
      return result.ok && 'readiness' in result.value
        ? result.value.readiness.providerId
        : undefined;
    };
    expect(await readiness('plain')).toBe(own.id);
    const set = bridge.voiceDefaultSet({ kind: 'asr', providerId: chosen.id, language: 'zh' });
    expect(set).toEqual({
      ok: true,
      value: { defaults: { tts: null, asr: { providerId: chosen.id, language: 'zh' } } },
    });
    expect(await readiness('plain')).toBe(chosen.id);
    expect(await readiness('custom')).toBe(own.id);
    const anyChat = await bridge.voiceDictation({ kind: 'readiness' });
    expect(anyChat.ok && 'readiness' in anyChat.value && anyChat.value.readiness.providerId).toBe(
      chosen.id,
    );
    const view = bridge.voiceProviders({ slug: 'plain' });
    expect(view.ok && view.value.defaults.asr?.providerId).toBe(chosen.id);
    expect(view.ok && view.value.bot?.asr).toBeNull();
    expect(bridge.voiceDefaultSet({ kind: 'call', providerId: null })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(bridge.voiceDefaultSet({ kind: 'tts', providerId: chosen.id })).toMatchObject({
      ok: false,
      error: { code: 'wrong-provider-kind' },
    });
  });
});

function tone(dbfs: number, ms: number): Int16Array {
  const amplitude = Math.sqrt(2) * 10 ** (dbfs / 20) * 32767;
  return Int16Array.from({ length: (16_000 * ms) / 1000 }, (_, index) =>
    Math.round(amplitude * Math.sin((2 * Math.PI * 180 * index) / 16_000)),
  );
}

async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe('effective speech binding (#3786)', () => {
  it('resolves a bound Bot, the Host default, nothing, and a stopped local service', async () => {
    const providers = await fixture();
    const custom = await providers.add({
      kind: 'asr',
      preset: 'custom',
      baseUrl: 'http://127.0.0.1:9/v1',
      language: 'en',
    });
    expect(await providers.resolve({ bot: {}, kind: 'asr' })).toMatchObject({
      providerId: custom.id,
      source: 'default',
      state: 'ready',
    });
    providers.setDefault('asr', null);
    expect(await providers.resolve({ bot: {}, kind: 'asr' })).toMatchObject({
      providerId: null,
      source: 'none',
      state: 'missing',
    });
    expect(await providers.resolve({ bot: {}, kind: 'asr', fallback: 'any' })).toMatchObject({
      providerId: custom.id,
      source: 'fallback',
      state: 'ready',
    });
    expect(
      await providers.resolve({
        bot: { asr: { providerId: custom.id, language: 'zh' } },
        kind: 'asr',
      }),
    ).toMatchObject({ providerId: custom.id, language: 'zh', source: 'bot', state: 'ready' });
    expect(await providers.resolve({ bot: {}, kind: 'tts' })).toMatchObject({ state: 'missing' });
    const port = await closedPort();
    const local = await providers.add({
      kind: 'asr',
      preset: 'local',
      baseUrl: `http://127.0.0.1:${port}/v1`,
    });
    expect(
      await providers.resolve({ bot: { asr: { providerId: local.id } }, kind: 'asr' }),
    ).toMatchObject({ providerId: local.id, source: 'bot', state: 'off' });
    expect(await providers.resolve({ kind: 'asr', providerId: 'asr-000000000000' })).toMatchObject({
      source: 'explicit',
      state: 'missing',
    });
  });

  it('makes dictation report not ready while the Bot local speech service is stopped', async () => {
    const providers = await fixture();
    const port = await closedPort();
    const local = await providers.add({
      kind: 'asr',
      preset: 'local',
      baseUrl: `http://127.0.0.1:${port}/v1`,
    });
    await providers.add({ kind: 'asr', preset: 'custom', baseUrl: 'http://127.0.0.1:9/v1' });
    const dictations = createVoiceDictations({
      providers: () => providers,
      bot: () => ({ asr: { providerId: local.id } }),
    });
    expect(await dictations.readiness({ slug: 'mira' })).toEqual({
      ready: false,
      reason: 'local-voice-off',
      providerId: null,
      mode: null,
      sampleRate: 16_000,
    });
    await expect(dictations.open({ slug: 'mira' })).rejects.toMatchObject({
      code: 'local-voice-off',
    });
  });
});

describe('Host-wide speech threshold', () => {
  it('stores, clamps and resets the threshold', async () => {
    const providers = await fixture();
    expect(providers.speechThreshold()).toEqual({
      dbfs: DEFAULT_SPEECH_DBFS,
      custom: false,
      defaultDbfs: -50,
      min: -70,
      max: -20,
    });
    expect(providers.setSpeechThreshold(-58.4)).toMatchObject({ dbfs: -58, custom: true });
    expect(providers.setSpeechThreshold(-200).dbfs).toBe(-70);
    expect(providers.setSpeechThreshold(5).dbfs).toBe(-20);
    expect(providers.setSpeechThreshold(null)).toMatchObject({ dbfs: -50, custom: false });
    expect(() => providers.setSpeechThreshold(Number.NaN)).toThrow(/dBFS/u);
    expect(clampSpeechDbfs(-45.6)).toBe(-46);
  });

  it('lets a lower threshold hear a quiet microphone', () => {
    const quiet = [new Int16Array(16_000), tone(-56, 600)];
    const starts = (minActiveDbfs?: number) => {
      const vad = createVad(minActiveDbfs === undefined ? {} : { minActiveDbfs });
      return quiet.flatMap((pcm) => vad.push(pcm)).some((event) => event.type === 'speech-start');
    };
    expect(starts()).toBe(false);
    expect(starts(-60)).toBe(true);
  });

  it('reports the threshold through the bridge and refuses bad input', async () => {
    const providers = await fixture();
    const bridge = createVoiceBridgeMethods({ providers, registry: registry({}) });
    expect(bridge.voiceSpeechThresholdSet({ dbfs: -62 })).toMatchObject({
      ok: true,
      value: { speechThreshold: { dbfs: -62, custom: true } },
    });
    const view = bridge.voiceProviders({});
    expect(view.ok && view.value.speechThreshold.dbfs).toBe(-62);
    expect(bridge.voiceSpeechThresholdSet({ dbfs: 'loud' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });
});
