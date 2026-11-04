export type TtsWire = 'openai' | 'fish' | 'elevenlabs';

export type TtsPresetId = 'custom' | 'openai' | 'fish-audio' | 'elevenlabs';

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

export type AsrPresetId = 'custom' | 'openai' | 'groq' | 'soniox';

export type AsrWire = 'openai' | 'soniox';

export interface AsrPreset {
  id: AsrPresetId;
  name: string;
  wire: AsrWire;
  baseUrl?: string;
  keyRequired: boolean;
  defaultModel?: string;
  capabilities: {
    streaming: boolean;
    billing: 'per-minute' | 'self-hosted';
  };
  docsUrl?: string;
}

export const ASR_PRESETS: readonly AsrPreset[] = [
  {
    id: 'custom',
    name: 'OpenAI-compatible endpoint',
    keyRequired: false,
    wire: 'openai',
    defaultModel: 'whisper-1',
    capabilities: { streaming: false, billing: 'self-hosted' },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    keyRequired: true,
    wire: 'openai',
    defaultModel: 'gpt-4o-mini-transcribe',
    capabilities: { streaming: false, billing: 'per-minute' },
    docsUrl: 'https://platform.openai.com/docs/api-reference/audio/createTranscription',
  },
  {
    id: 'groq',
    name: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    keyRequired: true,
    wire: 'openai',
    defaultModel: 'whisper-large-v3-turbo',
    capabilities: { streaming: false, billing: 'per-minute' },
    docsUrl: 'https://console.groq.com/docs/speech-to-text',
  },
  {
    id: 'soniox',
    name: 'Soniox (streaming)',
    wire: 'soniox',
    baseUrl: 'https://stt-rt.soniox.com',
    keyRequired: true,
    defaultModel: 'stt-rt-v6',
    capabilities: { streaming: true, billing: 'per-minute' },
    docsUrl: 'https://soniox.com/docs/stt/api-reference/websocket-api',
  },
];

export function asrPreset(id: string): AsrPreset | undefined {
  return ASR_PRESETS.find((preset) => preset.id === id);
}
