import type { AsrWire, TtsWire } from './presets.js';
import type { VoiceRequestTemplate } from './request-template.js';
import type { StoredProvider } from './provider-types.js';
import { chineseScript } from './provider-audio.js';

export function ttsTemplate(wire: TtsWire, stored: StoredProvider): VoiceRequestTemplate {
  if (stored.template !== undefined) return stored.template;
  const baseUrl = stored.baseUrl.replaceAll('{', '%7B').replaceAll('}', '%7D');
  const base: VoiceRequestTemplate = {
    version: 1,
    url: `${baseUrl}/audio/speech`,
    method: 'POST',
    auth: { kind: 'bearer' },
    headers: {},
    body: {
      kind: 'json',
      value: {
        model: '{model}',
        input: '{text}',
        voice: '{voice}',
        response_format: 'mp3',
      },
    },
    result: { kind: 'audio' },
  };
  if (wire === 'fish')
    return {
      ...base,
      url: `${baseUrl}/v1/tts`,
      headers: stored.model === undefined ? {} : { model: '{model}' },
      body: { kind: 'json', value: { text: '{text}', format: 'mp3', reference_id: '{voice}' } },
    };
  if (wire === 'elevenlabs')
    return {
      ...base,
      url: `${baseUrl}/v1/text-to-speech/{voice}?output_format=mp3_44100_128`,
      auth: { kind: 'header', name: 'xi-api-key', prefix: '' },
      headers: { Accept: 'audio/mpeg' },
      body: {
        kind: 'json',
        value: {
          text: '{text}',
          ...(stored.model === undefined ? {} : { model_id: '{model}' }),
        },
      },
    };
  if (wire === 'mimo')
    return {
      ...base,
      url: `${baseUrl}/chat/completions`,
      auth: { kind: 'header', name: 'api-key', prefix: '' },
      body: {
        kind: 'json',
        value: {
          model: '{model}',
          messages: [{ role: 'assistant', content: '{text}' }],
          audio: { format: 'mp3', voice: '{voice}' },
        },
      },
      result: { kind: 'base64', path: 'choices.0.message.audio.data' },
    };
  return base;
}

export function asrTemplate(
  wire: Exclude<AsrWire, 'soniox'>,
  stored: StoredProvider,
  language: string | undefined,
): VoiceRequestTemplate {
  if (stored.template !== undefined) return stored.template;
  const baseUrl = stored.baseUrl.replaceAll('{', '%7B').replaceAll('}', '%7D');
  if (wire === 'mimo')
    return {
      version: 1,
      url: `${baseUrl}/chat/completions`,
      method: 'POST',
      auth: { kind: 'header', name: 'api-key', prefix: '' },
      headers: {},
      body: {
        kind: 'json',
        value: {
          model: '{model}',
          messages: [
            {
              role: 'user',
              content: [{ type: 'input_audio', input_audio: { data: '{audioDataUrl}' } }],
            },
          ],
          asr_options: {
            language:
              language?.split('-')[0] === 'zh' || language?.split('-')[0] === 'en'
                ? language.split('-')[0]!
                : 'auto',
          },
        },
      },
      result: { kind: 'text', path: 'choices.0.message.content' },
    };
  const script = chineseScript(language);
  return {
    version: 1,
    url: `${baseUrl}/audio/transcriptions`,
    method: 'POST',
    auth: { kind: 'bearer' },
    headers: {},
    body: {
      kind: 'multipart',
      fields: {
        file: '{audio}',
        model: '{model}',
        response_format: 'json',
        ...(language === undefined ? {} : { language: language.split('-')[0]! }),
        ...(script === undefined ? {} : { prompt: script }),
      },
    },
    result: { kind: 'text', path: 'text' },
  };
}
