import type { PersonaBotAsr, PersonaBotVoice } from '../../../core/src/bots/persona-bot.js';
import type { VoiceProvidersView, VoiceSynthesisView } from '../../../core/src/voice/bridge.js';
import type { AsrPreset, TtsPreset } from '../../../core/src/voice/presets.js';
import type {
  AsrProviderView,
  ProviderHealth,
  TtsProviderView,
  VoiceDefaults,
  VoiceSpeechThreshold,
} from '../../../core/src/voice/providers.js';
import { DEFAULT_SPEECH_DBFS, SPEECH_DBFS_RANGE } from '../../../core/src/voice/vad.js';
import { BridgeCallError, type BridgeCall } from './bridge.js';

export type {
  AsrPreset as AsrPresetView,
  AsrProviderView,
  PersonaBotAsr as BotAsrView,
  PersonaBotVoice as BotVoiceView,
  VoiceDefaults as VoiceDefaultsView,
  VoiceSpeechThreshold as VoiceSpeechThresholdView,
  ProviderHealth as VoiceProviderHealthView,
  TtsPreset as VoicePresetView,
  TtsProviderView as VoiceProviderView,
  VoiceProvidersView,
  VoiceSynthesisView,
};

export interface VoiceProviderAddInput {
  kind?: 'tts' | 'asr';
  preset: string;
  language?: string;
  name?: string;
  baseUrl?: string;
  model?: string;
  defaultVoice?: string;
  key?: string;
}

function record(value: unknown, method: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error(`invalid ${method} response`);
  return value as Record<string, unknown>;
}

async function unwrap(
  call: BridgeCall,
  method: string,
  payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await call(method, payload);
  if (!result.ok)
    throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
  return record(result.value, method);
}

function provider(value: unknown, method: string): TtsProviderView {
  const view = record(value, method);
  if (
    typeof view['id'] !== 'string' ||
    typeof view['name'] !== 'string' ||
    typeof view['baseUrl'] !== 'string' ||
    typeof view['keySet'] !== 'boolean'
  )
    throw new Error(`invalid ${method} response`);
  return view as unknown as TtsProviderView;
}

function voice(value: unknown, method: string): PersonaBotVoice | null {
  if (value === null || value === undefined) return null;
  const view = record(value, method);
  if (typeof view['providerId'] !== 'string') throw new Error(`invalid ${method} response`);
  return {
    providerId: view['providerId'],
    ...(typeof view['voiceId'] === 'string' ? { voiceId: view['voiceId'] } : {}),
  } as PersonaBotVoice;
}

function asrBinding(value: unknown): PersonaBotAsr | null {
  if (typeof value !== 'object' || value === null) return null;
  const view = value as Record<string, unknown>;
  if (typeof view['providerId'] !== 'string') return null;
  return {
    providerId: view['providerId'],
    ...(typeof view['language'] === 'string' ? { language: view['language'] } : {}),
  };
}

function defaultsOf(value: unknown): VoiceDefaults {
  if (typeof value !== 'object' || value === null) return { tts: null, asr: null };
  const view = value as Record<string, unknown>;
  const tts = voice(view['tts'], 'voiceProviders');
  return {
    tts: tts === null ? null : { ...tts },
    asr: asrBinding(view['asr']),
  };
}

function thresholdOf(value: unknown): VoiceSpeechThreshold {
  const view =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const number = (key: string, fallback: number) =>
    typeof view[key] === 'number' && Number.isFinite(view[key]) ? (view[key] as number) : fallback;
  return {
    dbfs: number('dbfs', DEFAULT_SPEECH_DBFS),
    custom: view['custom'] === true,
    defaultDbfs: number('defaultDbfs', DEFAULT_SPEECH_DBFS),
    min: number('min', SPEECH_DBFS_RANGE.min),
    max: number('max', SPEECH_DBFS_RANGE.max),
  };
}

export async function loadVoiceProviders(
  call: BridgeCall,
  slug?: string,
): Promise<VoiceProvidersView> {
  const view = await unwrap(call, 'voiceProviders', slug === undefined ? {} : { slug });
  if (!Array.isArray(view['presets']) || !Array.isArray(view['providers']))
    throw new Error('invalid voiceProviders response');
  const bot = view['bot'] === undefined ? undefined : record(view['bot'], 'voiceProviders');
  return {
    presets: view['presets'] as TtsPreset[],
    providers: view['providers'].map((entry) => provider(entry, 'voiceProviders')),
    asrPresets: Array.isArray(view['asrPresets']) ? (view['asrPresets'] as AsrPreset[]) : [],
    asrProviders: Array.isArray(view['asrProviders'])
      ? view['asrProviders'].map(
          (entry) => provider(entry, 'voiceProviders') as unknown as AsrProviderView,
        )
      : [],
    defaults: defaultsOf(view['defaults']),
    speechThreshold: thresholdOf(view['speechThreshold']),
    ...(bot === undefined || typeof bot['slug'] !== 'string'
      ? {}
      : {
          bot: {
            slug: bot['slug'],
            selected: voice(bot['selected'], 'voiceProviders'),
            asr: asrBinding(bot['asr']),
          },
        }),
  };
}

export async function addVoiceProvider(
  call: BridgeCall,
  input: VoiceProviderAddInput,
): Promise<TtsProviderView> {
  const view = await unwrap(call, 'voiceProviderAdd', { ...input });
  return provider(view['provider'], 'voiceProviderAdd');
}

export async function removeVoiceProvider(call: BridgeCall, id: string): Promise<string[]> {
  const view = await unwrap(call, 'voiceProviderRemove', { id });
  return Array.isArray(view['clearedBots'])
    ? view['clearedBots'].filter((slug): slug is string => typeof slug === 'string')
    : [];
}

export async function testVoiceProvider(
  call: BridgeCall,
  id: string,
  voiceId?: string,
): Promise<ProviderHealth> {
  const view = await unwrap(
    call,
    'voiceProviderTest',
    voiceId === undefined ? { id } : { id, voiceId },
  );
  if (typeof view['ok'] !== 'boolean') throw new Error('invalid voiceProviderTest response');
  return view as unknown as ProviderHealth;
}

export async function synthesizeVoice(
  call: BridgeCall,
  input: { text: string; slug?: string; providerId?: string; voiceId?: string },
): Promise<VoiceSynthesisView> {
  const view = await unwrap(call, 'voiceSynthesize', {
    ...input,
    markdown: true,
  });
  if (typeof view['audio'] !== 'string' || typeof view['mime'] !== 'string')
    throw new Error('invalid voiceSynthesize response');
  return view as unknown as VoiceSynthesisView;
}

export async function setBotVoice(
  call: BridgeCall,
  slug: string,
  providerId: string | null,
  voiceId?: string,
): Promise<PersonaBotVoice | null> {
  const view = await unwrap(call, 'botVoiceSet', {
    slug,
    providerId,
    ...(voiceId === undefined ? {} : { voiceId }),
  });
  return voice(view['voice'], 'botVoiceSet');
}

export async function setBotAsr(
  call: BridgeCall,
  slug: string,
  providerId: string | null,
): Promise<PersonaBotAsr | null> {
  const view = await unwrap(call, 'botAsrSet', { slug, providerId });
  return asrBinding(view['asr']);
}

export async function setVoiceDefault(
  call: BridgeCall,
  kind: 'tts' | 'asr',
  providerId: string | null,
  voiceId?: string,
): Promise<VoiceDefaults> {
  const view = await unwrap(call, 'voiceDefaultSet', {
    kind,
    providerId,
    ...(voiceId === undefined ? {} : { voiceId }),
  });
  return defaultsOf(view['defaults']);
}

export async function setSpeechThreshold(
  call: BridgeCall,
  dbfs: number | null,
): Promise<VoiceSpeechThreshold> {
  const view = await unwrap(call, 'voiceSpeechThresholdSet', { dbfs });
  return thresholdOf(view['speechThreshold']);
}
