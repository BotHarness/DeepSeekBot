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
import { createVoiceBridge } from './features/voice/bridge.js';
export type { VoiceProviderAddInput } from './features/voice/bridge.js';

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

export const {
  loadVoiceProviders,
  addVoiceProvider,
  removeVoiceProvider,
  testVoiceProvider,
  synthesizeVoice,
  setBotVoice,
  setBotAsr,
  setVoiceDefault,
  setSpeechThreshold,
} = createVoiceBridge(DEFAULT_SPEECH_DBFS, SPEECH_DBFS_RANGE);
