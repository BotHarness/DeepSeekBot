import { LOCAL_VOICE_BASE_URL } from './local-kit.js';

export type TtsWire = 'openai' | 'fish' | 'elevenlabs';

export type TtsPresetId = 'custom' | 'local' | 'openai' | 'fish-audio' | 'elevenlabs';

export interface TtsVoiceOption {
  id: string;
  name: string;
}

export interface TtsPreset {
  id: TtsPresetId;
  name: string;
  wire: TtsWire;
  baseUrl?: string;
  keyRequired: boolean;
  defaultModel?: string;
  defaultVoice?: string;
  voices: TtsVoiceOption[];
  capabilities: {
    streaming: boolean;
    billing: 'per-character' | 'self-hosted';
  };
  docsUrl?: string;
}

export const TTS_PRESETS: readonly TtsPreset[] = [
  {
    id: 'custom',
    name: 'OpenAI-compatible endpoint',
    wire: 'openai',
    keyRequired: false,
    defaultModel: 'tts-1',
    voices: [],
    capabilities: { streaming: false, billing: 'self-hosted' },
  },
  {
    id: 'local',
    name: 'Local speech service (Kokoro)',
    wire: 'openai',
    baseUrl: LOCAL_VOICE_BASE_URL,
    keyRequired: false,
    defaultModel: 'kokoro',
    defaultVoice: 'zf_001',
    voices: [
      { id: 'zf_001', name: 'zf_001 (中文 女)' },
      { id: 'zf_002', name: 'zf_002 (中文 女)' },
      { id: 'zm_009', name: 'zm_009 (中文 男)' },
      { id: 'zm_010', name: 'zm_010 (中文 男)' },
      { id: 'af_maple', name: 'af_maple (English F)' },
      { id: 'af_sol', name: 'af_sol (English F)' },
      { id: 'bf_vale', name: 'bf_vale (English F)' },
    ],
    capabilities: { streaming: false, billing: 'self-hosted' },
  },
  {
    id: 'fish-audio',
    name: 'Fish Audio',
    wire: 'fish',
    baseUrl: 'https://api.fish.audio',
    keyRequired: true,
    voices: [],
    capabilities: { streaming: true, billing: 'per-character' },
    docsUrl: 'https://docs.fish.audio/api-reference/endpoint/openapi-v1/text-to-speech',
  },
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    wire: 'elevenlabs',
    baseUrl: 'https://api.elevenlabs.io',
    keyRequired: true,
    defaultModel: 'eleven_multilingual_v2',
    defaultVoice: 'JBFqnCBsd6RMkjVDRZzb',
    voices: [
      { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
    ],
    capabilities: { streaming: true, billing: 'per-character' },
    docsUrl: 'https://elevenlabs.io/docs/api-reference/text-to-speech/convert',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    wire: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    defaultModel: 'gpt-4o-mini-tts',
    defaultVoice: 'alloy',
    voices: ['alloy', 'ash', 'coral', 'echo', 'nova', 'sage', 'shimmer'].map((id) => ({
      id,
      name: id,
    })),
    capabilities: { streaming: true, billing: 'per-character' },
    docsUrl: 'https://platform.openai.com/docs/api-reference/audio/createSpeech',
  },
];

export function ttsPreset(id: string): TtsPreset | undefined {
  return TTS_PRESETS.find((preset) => preset.id === id);
}

export type AsrPresetId = 'custom' | 'openai' | 'groq';

export interface AsrPreset {
  id: AsrPresetId;
  name: string;
  baseUrl?: string;
  keyRequired: boolean;
  defaultModel?: string;
  capabilities: {
    billing: 'per-minute' | 'self-hosted';
  };
  docsUrl?: string;
}

export const ASR_PRESETS: readonly AsrPreset[] = [
  {
    id: 'custom',
    name: 'OpenAI-compatible endpoint',
    keyRequired: false,
    defaultModel: 'whisper-1',
    capabilities: { billing: 'self-hosted' },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    defaultModel: 'gpt-4o-mini-transcribe',
    capabilities: { billing: 'per-minute' },
    docsUrl: 'https://platform.openai.com/docs/api-reference/audio/createTranscription',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyRequired: true,
    defaultModel: 'whisper-large-v3-turbo',
    capabilities: { billing: 'per-minute' },
    docsUrl: 'https://console.groq.com/docs/speech-to-text',
  },
];

export function asrPreset(id: string): AsrPreset | undefined {
  return ASR_PRESETS.find((preset) => preset.id === id);
}
