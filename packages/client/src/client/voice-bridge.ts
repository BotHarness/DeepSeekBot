import type { PersonaBotVoice } from '../../../core/src/bots/persona-bot.js';
import type { VoiceProvidersView, VoiceSynthesisView } from '../../../core/src/voice/bridge.js';
import type { TtsPreset } from '../../../core/src/voice/presets.js';
import type { ProviderHealth, TtsProviderView } from '../../../core/src/voice/providers.js';
import { BridgeCallError, type BridgeCall } from './bridge.js';

export type {
  PersonaBotVoice as BotVoiceView,
  ProviderHealth as VoiceProviderHealthView,
  TtsPreset as VoicePresetView,
  TtsProviderView as VoiceProviderView,
  VoiceProvidersView,
  VoiceSynthesisView,
};

export interface VoiceProviderAddInput {
  preset: string;
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
    ...(bot === undefined || typeof bot['slug'] !== 'string'
      ? {}
      : {
          bot: {
            slug: bot['slug'],
            selected: voice(bot['selected'], 'voiceProviders'),
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
