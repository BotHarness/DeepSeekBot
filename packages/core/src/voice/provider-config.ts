import {
  ASR_PRESETS,
  asrPreset,
  TTS_PRESETS,
  ttsPreset,
  type AsrPreset,
  type TtsPreset,
} from './presets.js';
import {
  VoiceError,
  type AsrProviderView,
  type StoredProvider,
  type TtsProviderView,
  type VoiceProviderKind,
  type VoiceProviderView,
} from './provider-types.js';

export const PROVIDER_ID = /^(?:tts|asr)-[a-f0-9]{12}$/u;

export function kindOf(stored: StoredProvider): VoiceProviderKind {
  return stored.kind === 'asr' ? 'asr' : 'tts';
}

export function asrPresetOf(id: string): AsrPreset {
  const preset = asrPreset(id);
  if (preset === undefined)
    throw new VoiceError(
      'invalid-input',
      `Unknown ASR preset ${JSON.stringify(id)}; use one of ${ASR_PRESETS.map((entry) => entry.id).join(', ')}.`,
    );
  return preset;
}

export function presetOf(id: string): TtsPreset {
  const preset = ttsPreset(id);
  if (preset === undefined)
    throw new VoiceError(
      'invalid-input',
      `Unknown TTS preset ${JSON.stringify(id)}; use one of ${TTS_PRESETS.map((entry) => entry.id).join(', ')}.`,
    );
  return preset;
}

export function cleanText(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new VoiceError('invalid-input', `${field} must be text.`);
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  if (trimmed.length > max || /[\u0000-\u001f\u007f]/u.test(trimmed))
    throw new VoiceError('invalid-input', `${field} is not valid.`);
  return trimmed;
}

export function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new VoiceError('invalid-input', 'Base URL must be an http(s) URL.');
  }
  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  )
    throw new VoiceError(
      'invalid-input',
      'Base URL must be a plain http(s) URL without credentials or query.',
    );
  return url.href.replace(/\/+$/u, '');
}

export function parseStored(body: string): StoredProvider | undefined {
  try {
    const value = JSON.parse(body) as Partial<StoredProvider>;
    if (
      typeof value.id !== 'string' ||
      !PROVIDER_ID.test(value.id) ||
      typeof value.name !== 'string' ||
      typeof value.baseUrl !== 'string' ||
      typeof value.createdAt !== 'string' ||
      (value.kind !== undefined && value.kind !== 'asr') ||
      value.id.startsWith(value.kind === 'asr' ? 'tts-' : 'asr-') ||
      (value.kind === 'asr' ? asrPreset(String(value.preset)) : ttsPreset(String(value.preset))) ===
        undefined
    )
      return undefined;
    return value as StoredProvider;
  } catch {
    return undefined;
  }
}

export function asrView(stored: StoredProvider): AsrProviderView {
  const preset = asrPresetOf(stored.preset);
  return {
    id: stored.id,
    kind: 'asr',
    name: stored.name,
    preset: preset.id,
    wire: preset.wire,
    streaming: preset.capabilities.streaming,
    baseUrl: stored.baseUrl,
    ...(stored.model === undefined ? {} : { model: stored.model }),
    ...(stored.language === undefined ? {} : { language: stored.language }),
    keySet: stored.credentialRevision !== undefined,
    createdAt: stored.createdAt,
  };
}

export function anyView(stored: StoredProvider): VoiceProviderView {
  return kindOf(stored) === 'asr' ? asrView(stored) : view(stored);
}

export function view(stored: StoredProvider): TtsProviderView {
  const preset = presetOf(stored.preset);
  return {
    id: stored.id,
    kind: 'tts',
    name: stored.name,
    preset: preset.id,
    wire: preset.wire,
    baseUrl: stored.baseUrl,
    ...(stored.model === undefined ? {} : { model: stored.model }),
    ...(stored.defaultVoice === undefined ? {} : { defaultVoice: stored.defaultVoice }),
    keySet: stored.credentialRevision !== undefined,
    createdAt: stored.createdAt,
  };
}
