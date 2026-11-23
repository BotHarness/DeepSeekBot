import { describe, expect, it, vi } from 'vitest';

import { MethodRefused } from '../src/client-errors';
import { mergeCatalogItems } from '../src/shared/voice-options';
import {
  addVoiceService,
  browseVoiceCatalog,
  importSharedVoice,
  loadVoiceServices,
  setVoiceDefault,
  testVoiceService,
  voiceAccessDenied,
} from '../src/voice-providers';

function host(answer: unknown) {
  const call = vi.fn(async (_method: string, _args?: Record<string, unknown>) => answer);
  return { call };
}

describe('voice providers reader', () => {
  it('reads services, presets with catalogs and defaults', async () => {
    const view = await loadVoiceServices(
      host({
        presets: [
          {
            id: 'fish-audio',
            name: 'Fish Audio',
            keyRequired: true,
            baseUrl: 'https://api.fish.audio',
            models: ['s1'],
            defaultModel: 's1',
            voices: [{ id: 'v1', name: 'Voice one' }, { id: 7 }],
            catalogs: ['models', 'account', 'unknown'],
          },
        ],
        providers: [{ id: 'tts-1', name: 'Fish', preset: 'fish-audio', baseUrl: '', keySet: true }],
        asrPresets: [{ id: 'openai', name: 'OpenAI', keyRequired: true }],
        asrProviders: [],
        defaults: { tts: { providerId: 'tts-1', voiceId: 'v1' }, asr: null },
      }),
    );
    expect(view.presets[0]).toMatchObject({
      id: 'fish-audio',
      keyRequired: true,
      models: ['s1'],
      voices: [{ id: 'v1', name: 'Voice one' }],
      catalogs: ['models', 'account'],
    });
    expect(view.providers).toEqual([
      { id: 'tts-1', name: 'Fish', preset: 'fish-audio', baseUrl: '', keySet: true },
    ]);
    expect(view.defaults).toEqual({ tts: { providerId: 'tts-1', voiceId: 'v1' }, asr: null });
  });

  it('rejects a malformed service row', async () => {
    await expect(
      loadVoiceServices(host({ presets: [], providers: [{ name: 'no id' }] })),
    ).rejects.toThrow('invalid voiceProviders response');
  });

  it('sends kind only for speech recognition services', async () => {
    const tts = host({
      provider: { id: 'a', name: 'A', preset: 'openai', baseUrl: '', keySet: true },
    });
    await addVoiceService(tts, { kind: 'tts', preset: 'openai', key: 'k' });
    expect(tts.call).toHaveBeenCalledWith('voiceProviderAdd', { preset: 'openai', key: 'k' });
    const asr = host({
      provider: { id: 'b', name: 'B', preset: 'openai', baseUrl: '', keySet: true },
    });
    await addVoiceService(asr, { kind: 'asr', preset: 'openai' });
    expect(asr.call).toHaveBeenCalledWith('voiceProviderAdd', { kind: 'asr', preset: 'openai' });
  });

  it('keeps only https sample links in catalog pages', async () => {
    const call = host({
      items: [
        { id: 'a', name: 'A', previewUrl: 'https://cdn.example.org/a.mp3' },
        { id: 'b', name: 'B', previewUrl: 'http://cdn.example.org/b.mp3' },
        { id: 'c', name: 'C', previewUrl: 'javascript:alert(1)' },
        { id: 'd', name: 'D', importFrom: 'owner-1' },
        { name: 'missing id' },
      ],
      nextCursor: 'next',
    });
    const page = await browseVoiceCatalog(call, {
      kind: 'tts',
      preset: 'elevenlabs',
      collection: 'public',
      key: 'k',
      query: '',
    });
    expect(call.call).toHaveBeenCalledWith('voiceCatalog', {
      kind: 'tts',
      preset: 'elevenlabs',
      collection: 'public',
      key: 'k',
    });
    expect(page).toEqual({
      items: [
        { id: 'a', name: 'A', previewUrl: 'https://cdn.example.org/a.mp3' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
        { id: 'd', name: 'D', importFrom: 'owner-1' },
      ],
      nextCursor: 'next',
    });
  });

  it('reads imports, health and defaults answers', async () => {
    await expect(
      importSharedVoice(host({ voice: { id: 'v', name: 'V' } }), {
        preset: 'elevenlabs',
        key: 'k',
        ownerId: 'o',
        voiceId: 'v',
        name: 'V',
        confirmed: true,
      }),
    ).resolves.toEqual({ id: 'v', name: 'V' });
    await expect(testVoiceService(host({ ok: true, latencyMs: 41.6 }), 'a')).resolves.toEqual({
      ok: true,
      latencyMs: 42,
    });
    await expect(testVoiceService(host({ ok: false, message: 'bad key' }), 'a')).resolves.toEqual({
      ok: false,
      message: 'bad key',
    });
    const defaults = host({ defaults: { tts: null, asr: { providerId: 'asr-1' } } });
    await expect(setVoiceDefault(defaults, 'asr', 'asr-1')).resolves.toEqual({
      tts: null,
      asr: { providerId: 'asr-1' },
    });
    expect(defaults.call).toHaveBeenCalledWith('voiceDefaultSet', {
      kind: 'asr',
      providerId: 'asr-1',
    });
  });

  it('recognizes the member refusal', () => {
    expect(voiceAccessDenied(new MethodRefused('remote-access/denied', 'no'))).toBe(true);
    expect(voiceAccessDenied(new MethodRefused('other', 'no'))).toBe(false);
    expect(voiceAccessDenied(new Error('remote-access/denied'))).toBe(false);
  });

  it('merges catalog pages without duplicates and caps searches', () => {
    const a = { id: 'a', name: 'A' };
    const many = Array.from({ length: 250 }, (_, index) => ({
      id: `v${index}`,
      name: `V${index}`,
    }));
    expect(mergeCatalogItems([a], [a, { id: 'b', name: 'B' }], 'models')).toEqual([
      a,
      { id: 'b', name: 'B' },
    ]);
    expect(mergeCatalogItems([], many, 'public')).toHaveLength(200);
    expect(mergeCatalogItems([], many, 'models')).toHaveLength(250);
  });
});
