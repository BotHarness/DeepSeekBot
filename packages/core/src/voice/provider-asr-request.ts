import type { AsrWire } from './presets.js';
import { MIMO_ASR_MAX_BASE64_BYTES, mimoAsrRequest } from './mimo.js';
import { audioExtension, chineseScript } from './provider-audio.js';
import { VoiceError, type StoredProvider } from './provider-types.js';

export interface AsrHttpInput {
  readonly stored: StoredProvider;
  readonly key: string | undefined;
  readonly audio: Uint8Array;
  readonly mime: string;
  readonly language: string | undefined;
}

export function asrHttpRequest(
  wire: Exclude<AsrWire, 'soniox'>,
  input: AsrHttpInput,
): { url: string; init: RequestInit } {
  return wire === 'mimo' ? mimoAsr(input) : openAiAsr(input);
}

function mimoAsr({ stored, key, audio, mime, language }: AsrHttpInput) {
  if (mime !== 'audio/wav' && mime !== 'audio/mpeg')
    throw new VoiceError('invalid-input', 'Xiaomi MiMo needs WAV or MP3 audio.');
  if (Math.ceil(audio.byteLength / 3) * 4 > MIMO_ASR_MAX_BASE64_BYTES)
    throw new VoiceError('audio-too-large', 'The audio is too large for Xiaomi MiMo.');
  return mimoAsrRequest({
    baseUrl: stored.baseUrl,
    model: stored.model,
    key,
    audio,
    mime,
    language,
  });
}

function openAiAsr({ stored, key, audio, mime, language }: AsrHttpInput) {
  const form = new FormData();
  form.append(
    'file',
    new Blob([audio as Uint8Array<ArrayBuffer>], { type: mime }),
    `speech.${audioExtension(mime)}`,
  );
  form.append('model', stored.model ?? 'whisper-1');
  form.append('response_format', 'json');
  if (language !== undefined) form.append('language', language.split('-')[0]!);
  const script = chineseScript(language);
  if (script !== undefined) form.append('prompt', script);
  return {
    url: `${stored.baseUrl}/audio/transcriptions`,
    init: {
      method: 'POST',
      headers: key === undefined ? {} : { Authorization: `Bearer ${key}` },
      body: form,
    },
  };
}
