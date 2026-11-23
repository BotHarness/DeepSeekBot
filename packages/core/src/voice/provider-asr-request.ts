import { asrTemplate } from './builtin-templates.js';
import { templateRequest } from './template-request.js';
import type { AsrWire } from './presets.js';
import { MIMO_ASR_MAX_BASE64_BYTES } from './mimo.js';
import { audioExtension } from './provider-audio.js';
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
  const { stored, key, audio, mime, language } = input;
  if (wire === 'mimo' && stored.template === undefined) {
    if (mime !== 'audio/wav' && mime !== 'audio/mpeg')
      throw new VoiceError('invalid-input', 'Xiaomi MiMo needs WAV or MP3 audio.');
    if (Math.ceil(audio.byteLength / 3) * 4 > MIMO_ASR_MAX_BASE64_BYTES)
      throw new VoiceError('audio-too-large', 'The audio is too large for Xiaomi MiMo.');
  }
  return templateRequest(
    asrTemplate(wire, stored, language),
    {
      audio,
      mime,
      language,
      model: stored.model,
      format: audioExtension(mime),
    },
    key,
  );
}
