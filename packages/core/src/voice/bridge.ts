import type { BridgeResult } from '../bridge/methods.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotAsr, PersonaBotVoice } from '../bots/persona-bot.js';
import type { AsrPreset, TtsPreset } from './presets.js';
import {
  MAX_ASR_AUDIO_BYTES,
  MAX_TTS_INPUT_CHARS,
  VoiceError,
  type AsrProviderView,
  type ProviderHealth,
  type TtsProviderView,
  type VoiceProviderView,
  type VoiceProviders,
} from './providers.js';
import { speakableText } from './speakable.js';

export interface VoiceProvidersView {
  presets: readonly TtsPreset[];
  providers: TtsProviderView[];
  asrPresets: readonly AsrPreset[];
  asrProviders: AsrProviderView[];
  bot?: { slug: string; selected: PersonaBotVoice | null; asr: PersonaBotAsr | null };
}

export interface VoiceTranscriptionView {
  providerId: string;
  language: string | null;
  text: string;
  latencyMs: number;
}

export interface VoiceSynthesisView {
  providerId: string;
  voiceId: string | null;
  mime: string;
  bytes: number;
  latencyMs: number;
  text: string;
  audio: string;
}

export interface VoiceBridgeMethods {
  voiceProviders(payload?: unknown): BridgeResult<VoiceProvidersView>;
  voiceProviderAdd(payload: unknown): Promise<BridgeResult<{ provider: VoiceProviderView }>>;
  voiceProviderRemove(
    payload: unknown,
  ): Promise<BridgeResult<{ provider: VoiceProviderView; clearedBots: string[] }>>;
  voiceProviderTest(payload: unknown): Promise<BridgeResult<ProviderHealth>>;
  voiceSynthesize(payload: unknown): Promise<BridgeResult<VoiceSynthesisView>>;
  botVoiceSet(payload: unknown): BridgeResult<{ slug: string; voice: PersonaBotVoice | null }>;
  voiceTranscribe(payload: unknown): Promise<BridgeResult<VoiceTranscriptionView>>;
  botAsrSet(payload: unknown): BridgeResult<{ slug: string; asr: PersonaBotAsr | null }>;
}

function record(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function failure(error: unknown): BridgeResult<never> {
  if (error instanceof VoiceError)
    return { ok: false, error: { code: error.code, message: error.message } };
  throw error;
}

function invalid(message: string): BridgeResult<never> {
  return { ok: false, error: { code: 'invalid-input', message } };
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function createVoiceBridgeMethods(deps: {
  providers: VoiceProviders | undefined;
  registry: PersonaBotRegistry;
}): VoiceBridgeMethods {
  const unavailable = (): BridgeResult<never> => ({
    ok: false,
    error: {
      code: 'voice-unavailable',
      message: 'Voice Providers are unavailable on this Host.',
    },
  });
  const users = (providerId: string) =>
    deps.registry
      .list()
      .filter((bot) => bot.voice?.providerId === providerId || bot.asr?.providerId === providerId)
      .map((bot) => bot.slug);
  return {
    voiceProviders(payload) {
      const providers = deps.providers;
      if (providers === undefined) return unavailable();
      const slug = optionalText(record(payload)['slug']);
      const bot = slug === undefined ? undefined : deps.registry.get(slug);
      if (slug !== undefined && bot === undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` },
        };
      return {
        ok: true,
        value: {
          presets: providers.presets(),
          providers: providers.list(),
          asrPresets: providers.asrPresets(),
          asrProviders: providers.listAsr(),
          ...(bot === undefined
            ? {}
            : { bot: { slug: bot.slug, selected: bot.voice ?? null, asr: bot.asr ?? null } }),
        },
      };
    },
    async voiceProviderAdd(payload) {
      if (deps.providers === undefined) return unavailable();
      const input = record(payload);
      if (typeof input['preset'] !== 'string') return invalid('preset is required');
      if (input['kind'] !== undefined && input['kind'] !== 'tts' && input['kind'] !== 'asr')
        return invalid('kind must be tts or asr');
      for (const field of ['name', 'baseUrl', 'model', 'defaultVoice', 'language', 'key'])
        if (input[field] !== undefined && input[field] !== null && typeof input[field] !== 'string')
          return invalid(`${field} must be text`);
      try {
        const provider = await deps.providers.add({
          ...(input['kind'] === 'asr' ? { kind: 'asr' as const } : {}),
          preset: input['preset'],
          ...(typeof input['name'] === 'string' ? { name: input['name'] } : {}),
          ...(typeof input['baseUrl'] === 'string' ? { baseUrl: input['baseUrl'] } : {}),
          ...(typeof input['model'] === 'string' ? { model: input['model'] } : {}),
          ...(typeof input['defaultVoice'] === 'string'
            ? { defaultVoice: input['defaultVoice'] }
            : {}),
          ...(typeof input['language'] === 'string' ? { language: input['language'] } : {}),
          ...(typeof input['key'] === 'string' ? { key: input['key'] } : {}),
        });
        return { ok: true, value: { provider } };
      } catch (error) {
        return failure(error);
      }
    },
    async voiceProviderRemove(payload) {
      if (deps.providers === undefined) return unavailable();
      const id = optionalText(record(payload)['id']);
      if (id === undefined) return invalid('id is required');
      try {
        const provider = await deps.providers.remove(id);
        const clearedBots = users(id);
        for (const slug of clearedBots)
          if (provider.kind === 'asr') deps.registry.setAsr(slug, undefined);
          else deps.registry.setVoice(slug, undefined);
        return { ok: true, value: { provider, clearedBots } };
      } catch (error) {
        return failure(error);
      }
    },
    async voiceProviderTest(payload) {
      if (deps.providers === undefined) return unavailable();
      const input = record(payload);
      const id = optionalText(input['id']);
      if (id === undefined) return invalid('id is required');
      try {
        return {
          ok: true,
          value: await deps.providers.test(id, optionalText(input['voiceId'])),
        };
      } catch (error) {
        return failure(error);
      }
    },
    async voiceSynthesize(payload) {
      if (deps.providers === undefined) return unavailable();
      const input = record(payload);
      const slug = optionalText(input['slug']);
      const bot = slug === undefined ? undefined : deps.registry.get(slug);
      if (slug !== undefined && bot === undefined)
        return {
          ok: false,
          error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` },
        };
      const providerId = optionalText(input['providerId']) ?? bot?.voice?.providerId;
      if (providerId === undefined)
        return {
          ok: false,
          error: {
            code: 'voice-not-configured',
            message: 'Name a TTS Provider, or bind one to the Bot first.',
          },
        };
      const voiceId =
        optionalText(input['voiceId']) ??
        (bot?.voice?.providerId === providerId ? bot.voice.voiceId : undefined);
      const raw = input['text'];
      if (typeof raw !== 'string' || raw.trim() === '' || raw.length > MAX_TTS_INPUT_CHARS)
        return invalid(`text must be 1–${MAX_TTS_INPUT_CHARS} characters`);
      const text = input['markdown'] === true ? speakableText(raw) : raw.trim();
      if (text === '') return invalid('the text has nothing that can be spoken');
      try {
        const result = await deps.providers.synthesize({
          providerId,
          voiceId,
          text,
        });
        return {
          ok: true,
          value: {
            providerId,
            voiceId: voiceId ?? deps.providers.get(providerId).defaultVoice ?? null,
            mime: result.mime,
            bytes: result.audio.byteLength,
            latencyMs: result.latencyMs,
            text,
            audio: Buffer.from(result.audio).toString('base64'),
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
    botVoiceSet(payload) {
      if (deps.providers === undefined) return unavailable();
      const input = record(payload);
      const slug = optionalText(input['slug']);
      if (slug === undefined) return invalid('slug is required');
      const providerId = input['providerId'];
      if (providerId !== null && typeof providerId !== 'string')
        return invalid('providerId (a TTS Provider id, or null for none) is required');
      if (typeof providerId === 'string' && !deps.providers.has(providerId))
        return {
          ok: false,
          error: {
            code: 'unknown-provider',
            message: 'No TTS Provider has that id.',
          },
        };
      const voiceId = optionalText(input['voiceId']);
      if (voiceId !== undefined && (voiceId.length > 200 || /[\u0000-\u001f\u007f]/u.test(voiceId)))
        return invalid('voiceId is not valid');
      const voice =
        providerId === null
          ? undefined
          : { providerId, ...(voiceId === undefined ? {} : { voiceId }) };
      const result = deps.registry.setVoice(slug, voice);
      if (!result.ok)
        return result.reason === 'not-found'
          ? {
              ok: false,
              error: {
                code: 'not-found',
                message: `unknown PersonaBot: ${slug}`,
              },
            }
          : invalid('the voice binding is not valid');
      return { ok: true, value: { slug, voice: result.record.voice ?? null } };
    },
    async voiceTranscribe(payload) {
      if (deps.providers === undefined) return unavailable();
      const input = record(payload);
      const slug = optionalText(input['slug']);
      const bot = slug === undefined ? undefined : deps.registry.get(slug);
      if (slug !== undefined && bot === undefined)
        return { ok: false, error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` } };
      const providerId = optionalText(input['providerId']) ?? bot?.asr?.providerId;
      if (providerId === undefined)
        return {
          ok: false,
          error: {
            code: 'asr-not-configured',
            message: 'Name an ASR Provider, or bind one to the Bot first.',
          },
        };
      const raw = input['audio'];
      if (
        typeof raw !== 'string' ||
        raw.length === 0 ||
        raw.length > (MAX_ASR_AUDIO_BYTES * 4) / 3 + 4
      )
        return invalid('audio must be base64 WAV, MP3, OGG or FLAC up to 8 MB');
      const audio = new Uint8Array(Buffer.from(raw, 'base64'));
      const language =
        optionalText(input['language']) ??
        (bot?.asr?.providerId === providerId ? bot.asr.language : undefined);
      try {
        const result = await deps.providers.transcribe({ providerId, audio, language });
        return {
          ok: true,
          value: {
            providerId,
            language: language ?? deps.providers.getAsr(providerId).language ?? null,
            text: result.text,
            latencyMs: result.latencyMs,
          },
        };
      } catch (error) {
        return failure(error);
      }
    },
    botAsrSet(payload) {
      if (deps.providers === undefined) return unavailable();
      const input = record(payload);
      const slug = optionalText(input['slug']);
      if (slug === undefined) return invalid('slug is required');
      const providerId = input['providerId'];
      if (providerId !== null && typeof providerId !== 'string')
        return invalid('providerId (an ASR Provider id, or null for none) is required');
      if (typeof providerId === 'string' && !deps.providers.has(providerId, 'asr'))
        return {
          ok: false,
          error: { code: 'unknown-provider', message: 'No ASR Provider has that id.' },
        };
      const language = optionalText(input['language']);
      const asr =
        providerId === null
          ? undefined
          : { providerId, ...(language === undefined ? {} : { language }) };
      const result = deps.registry.setAsr(slug, asr);
      if (!result.ok)
        return result.reason === 'not-found'
          ? { ok: false, error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` } }
          : invalid('the ASR binding is not valid (language is a code such as en or zh)');
      return { ok: true, value: { slug, asr: result.record.asr ?? null } };
    },
  };
}
