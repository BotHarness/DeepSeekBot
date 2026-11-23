import type { VoiceRequestTemplate } from '@botharness/host-protocol/voice-request-template';
import type { TemplateKind } from './template-draft.js';

export interface TemplateExample {
  readonly id: string;
  readonly name: string;
  readonly kind: TemplateKind;
  readonly template: VoiceRequestTemplate;
  readonly model?: string;
  readonly voice?: string;
}

export const TEMPLATE_EXAMPLES: readonly TemplateExample[] = [
  {
    id: 'google-tts',
    name: 'Google Cloud TTS',
    kind: 'tts',
    voice: 'en-US-Neural2-F',
    template: {
      version: 1,
      url: 'https://texttospeech.googleapis.com/v1/text:synthesize',
      method: 'POST',
      auth: { kind: 'query', name: 'key' },
      headers: {},
      body: {
        kind: 'json',
        value: {
          input: { text: '{text}' },
          voice: { languageCode: 'en-US', name: '{voice}' },
          audioConfig: { audioEncoding: 'MP3' },
        },
      },
      result: { kind: 'base64', path: 'audioContent' },
    },
  },
  {
    id: 'azure-ssml',
    name: 'Azure Speech (SSML)',
    kind: 'tts',
    voice: 'en-US-AvaMultilingualNeural',
    template: {
      version: 1,
      url: 'https://eastus.tts.speech.microsoft.com/cognitiveservices/v1',
      method: 'POST',
      auth: { kind: 'header', name: 'Ocp-Apim-Subscription-Key', prefix: '' },
      headers: { 'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3' },
      body: {
        kind: 'ssml',
        root: {
          tag: 'speak',
          attributes: {
            version: '1.0',
            xmlns: 'http://www.w3.org/2001/10/synthesis',
            'xml:lang': 'en-US',
          },
          children: [{ tag: 'voice', attributes: { name: '{voice}' }, children: ['{text}'] }],
        },
      },
      result: { kind: 'audio' },
    },
  },
  {
    id: 'deepgram-aura',
    name: 'Deepgram Aura',
    kind: 'tts',
    voice: 'aura-2-thalia-en',
    template: {
      version: 1,
      url: 'https://api.deepgram.com/v1/speak?model={voice}',
      method: 'POST',
      auth: { kind: 'header', name: 'Authorization', prefix: 'Token ' },
      headers: {},
      body: { kind: 'json', value: { text: '{text}' } },
      result: { kind: 'audio' },
    },
  },
  {
    id: 'minimax',
    name: 'MiniMax T2A',
    kind: 'tts',
    model: 'speech-2.8-hd',
    voice: 'English_Graceful_Lady',
    template: {
      version: 1,
      url: 'https://api.minimax.io/v1/t2a_v2',
      method: 'POST',
      auth: { kind: 'bearer' },
      headers: {},
      body: {
        kind: 'json',
        value: {
          model: '{model}',
          text: '{text}',
          stream: false,
          voice_setting: { voice_id: '{voice}' },
          audio_setting: { format: 'mp3' },
          output_format: 'hex',
        },
      },
      result: { kind: 'hex', path: 'data.audio' },
    },
  },
  {
    id: 'dashscope',
    name: 'Alibaba DashScope (Qwen TTS)',
    kind: 'tts',
    model: 'qwen3-tts-flash',
    voice: 'Cherry',
    template: {
      version: 1,
      url: 'https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      method: 'POST',
      auth: { kind: 'bearer' },
      headers: {},
      body: {
        kind: 'json',
        value: { model: '{model}', input: { text: '{text}', voice: '{voice}' } },
      },
      result: { kind: 'url', path: 'output.audio.url' },
    },
  },
  {
    id: 'whisper',
    name: 'OpenAI-compatible Whisper',
    kind: 'asr',
    model: 'whisper-1',
    template: {
      version: 1,
      url: 'https://api.openai.com/v1/audio/transcriptions',
      method: 'POST',
      auth: { kind: 'bearer' },
      headers: {},
      body: {
        kind: 'multipart',
        fields: { file: '{audio}', model: '{model}', language: '{language}' },
      },
      result: { kind: 'text', path: 'text' },
    },
  },
  {
    id: 'elevenlabs-stt',
    name: 'ElevenLabs Speech to Text',
    kind: 'asr',
    model: 'scribe_v1',
    template: {
      version: 1,
      url: 'https://api.elevenlabs.io/v1/speech-to-text',
      method: 'POST',
      auth: { kind: 'header', name: 'xi-api-key', prefix: '' },
      headers: {},
      body: { kind: 'multipart', fields: { file: '{audio}', model_id: '{model}' } },
      result: { kind: 'text', path: 'text' },
    },
  },
  {
    id: 'chat-audio',
    name: 'Chat completion with audio input',
    kind: 'asr',
    model: 'gpt-4o-audio-preview',
    template: {
      version: 1,
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      auth: { kind: 'bearer' },
      headers: {},
      body: {
        kind: 'json',
        value: {
          model: '{model}',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: 'Transcribe this audio verbatim.' },
                { type: 'input_audio', input_audio: { data: '{audioBase64}', format: '{format}' } },
              ],
            },
          ],
        },
      },
      result: { kind: 'text', path: 'choices.0.message.content' },
    },
  },
];

export function examplesFor(kind: TemplateKind): readonly TemplateExample[] {
  return TEMPLATE_EXAMPLES.filter((example) => example.kind === kind);
}
