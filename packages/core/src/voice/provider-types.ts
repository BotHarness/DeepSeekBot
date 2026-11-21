import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { AsrPreset, AsrWire, TtsPreset, TtsWire } from './presets.js';
import type { SonioxSocketFactory } from './soniox.js';

export type Credentials = Pick<CredentialProvider, 'readRecord' | 'modifyRecord' | 'deleteRecord'>;

export const MAX_TTS_INPUT_CHARS = 4_000;
export const MAX_TTS_AUDIO_BYTES = 10 * 1024 * 1024;
export const MAX_ASR_AUDIO_BYTES = 8 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 4_000;

export type VoiceProviderKind = 'tts' | 'asr';

export interface VoiceSpeechThreshold {
  dbfs: number;
  custom: boolean;
  defaultDbfs: number;
  min: number;
  max: number;
}

export type VoiceErrorCode =
  | 'invalid-input'
  | 'unknown-provider'
  | 'provider-limit'
  | 'credential-unavailable'
  | 'key-required'
  | 'voice-required'
  | 'provider-unauthorized'
  | 'provider-rate-limited'
  | 'provider-rejected'
  | 'provider-unavailable'
  | 'provider-timeout'
  | 'provider-bad-response'
  | 'audio-too-large'
  | 'wrong-provider-kind';

export class VoiceError extends Error {
  constructor(
    readonly code: VoiceErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'VoiceError';
  }
}

export interface TtsProviderView {
  id: string;
  kind: 'tts';
  name: string;
  preset: TtsPreset['id'];
  wire: TtsWire;
  baseUrl: string;
  model?: string;
  defaultVoice?: string;
  keySet: boolean;
  createdAt: string;
}

export interface AsrProviderView {
  id: string;
  kind: 'asr';
  name: string;
  preset: AsrPreset['id'];
  wire: AsrWire;
  streaming: boolean;
  baseUrl: string;
  model?: string;
  language?: string;
  keySet: boolean;
  createdAt: string;
}

export type VoiceProviderView = TtsProviderView | AsrProviderView;

export interface TtsProviderInput {
  kind?: VoiceProviderKind;
  preset: string;
  name?: string;
  baseUrl?: string;
  model?: string;
  defaultVoice?: string;
  language?: string;
  key?: string;
}

export interface TranscriptionResult {
  text: string;
  latencyMs: number;
}

export interface SynthesisResult {
  audio: Uint8Array;
  mime: string;
  latencyMs: number;
}

export type ProviderHealth =
  | {
      ok: true;
      providerId: string;
      latencyMs: number;
      bytes: number;
      mime: string;
    }
  | { ok: false; providerId: string; code: VoiceErrorCode; message: string };

export interface StoredProvider {
  id: string;
  kind?: 'asr';
  name: string;
  preset: string;
  baseUrl: string;
  model?: string;
  defaultVoice?: string;
  language?: string;
  credentialRevision?: string;
  createdAt: string;
}

export interface VoiceProvidersOptions {
  database: OperationalDatabaseModulePort;
  credentials: () => Credentials | undefined;
  fetch?: typeof fetch;
  now?: () => Date;
  timeoutMs?: number;
  log?: (phase: string, fields: Record<string, string | number>) => void;
  socket?: SonioxSocketFactory;
}
