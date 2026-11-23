import type { BridgeCall } from './bridge.js';
import { createVoiceDictationPort } from './composer-dictation.js';
import {
  addVoiceProvider,
  browseVoiceCatalog,
  importSharedVoice,
  loadVoiceProviders,
  removeVoiceProvider,
  setBotAsr,
  setBotVoice,
  setSpeechThreshold,
  setVoiceDefault,
  synthesizeVoice,
  testVoiceProvider,
  type BotAsrView,
  type BotVoiceView,
  type VoiceDefaultsView,
  type VoiceCatalogImportInput,
  type VoiceCatalogInput,
  type VoiceCatalogItem,
  type VoiceCatalogPage,
  type VoiceSpeechThresholdView,
  type VoiceProviderAddInput,
  type VoiceProviderHealthView,
  type VoiceProvidersView,
  type VoiceProviderView,
  type VoiceSynthesisView,
} from './voice-bridge.js';

export interface VoiceActions {
  voiceProviders?(slug?: string): Promise<VoiceProvidersView>;
  browseVoiceCatalog?(input: VoiceCatalogInput, signal?: AbortSignal): Promise<VoiceCatalogPage>;
  importSharedVoice?(input: VoiceCatalogImportInput): Promise<VoiceCatalogItem>;
  dictationPort?(slug?: string): import('./composer-dictation.js').VoiceDictationPort;
  addVoiceProvider?(input: VoiceProviderAddInput): Promise<VoiceProviderView>;
  removeVoiceProvider?(id: string): Promise<string[]>;
  testVoiceProvider?(id: string, voiceId?: string): Promise<VoiceProviderHealthView>;
  synthesizeVoice?(input: {
    text: string;
    slug?: string;
    providerId?: string;
    voiceId?: string;
  }): Promise<VoiceSynthesisView>;
  setBotVoice?(
    slug: string,
    providerId: string | null,
    voiceId?: string,
  ): Promise<BotVoiceView | null>;
  setBotAsr?(slug: string, providerId: string | null): Promise<BotAsrView | null>;
  setVoiceDefault?(
    kind: 'tts' | 'asr',
    providerId: string | null,
    voiceId?: string,
  ): Promise<VoiceDefaultsView>;
  setSpeechThreshold?(dbfs: number | null): Promise<VoiceSpeechThresholdView>;
}

export function createVoiceActions(call: BridgeCall) {
  return {
    voiceProviders: (slug) => loadVoiceProviders(call, slug),
    browseVoiceCatalog: (input, signal) => browseVoiceCatalog(call, input, signal),
    importSharedVoice: (input) => importSharedVoice(call, input),
    dictationPort: (slug) => createVoiceDictationPort(call, { slug }),
    addVoiceProvider: (input) => addVoiceProvider(call, input),
    removeVoiceProvider: (id) => removeVoiceProvider(call, id),
    testVoiceProvider: (id, voiceId) => testVoiceProvider(call, id, voiceId),
    synthesizeVoice: (input) => synthesizeVoice(call, input),
    setBotVoice: (slug, providerId, voiceId) => setBotVoice(call, slug, providerId, voiceId),
    setBotAsr: (slug, providerId) => setBotAsr(call, slug, providerId),
    setVoiceDefault: (kind, providerId, voiceId) =>
      setVoiceDefault(call, kind, providerId, voiceId),
    setSpeechThreshold: (dbfs) => setSpeechThreshold(call, dbfs),
  } satisfies VoiceActions;
}
