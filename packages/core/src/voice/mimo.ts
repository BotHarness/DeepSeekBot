import { z } from 'zod';

export const MIMO_TTS_MODEL = 'mimo-v2.5-tts';
export const MIMO_TTS_VOICE = 'mimo_default';
export const MIMO_ASR_MODEL = 'mimo-v2.5-asr';
export const MIMO_ASR_MAX_BASE64_BYTES = 10_000_000;

const ttsResponse = z.object({
  choices: z.tuple(
    [z.object({ message: z.object({ audio: z.object({ data: z.string() }) }) })],
    z.unknown(),
  ),
});

const asrResponse = z.object({
  choices: z.tuple([z.object({ message: z.object({ content: z.string() }) })], z.unknown()),
});

function mimoChat(baseUrl: string, key: string | undefined, payload: object) {
  return {
    url: `${baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key === undefined ? {} : { 'api-key': key }),
      },
      body: JSON.stringify(payload),
    },
  };
}

export function mimoTtsRequest(options: {
  baseUrl: string;
  model: string | undefined;
  voice: string | undefined;
  key: string | undefined;
  text: string;
}): { url: string; init: RequestInit } {
  return mimoChat(options.baseUrl, options.key, {
    model: options.model ?? MIMO_TTS_MODEL,
    messages: [{ role: 'assistant', content: options.text }],
    audio: { format: 'mp3', voice: options.voice ?? MIMO_TTS_VOICE },
  });
}

export function mimoAsrRequest(options: {
  baseUrl: string;
  model: string | undefined;
  key: string | undefined;
  audio: Uint8Array;
  mime: 'audio/wav' | 'audio/mpeg';
  language: string | undefined;
}) {
  const { audio, mime } = options;
  const base64 = Buffer.from(audio.buffer, audio.byteOffset, audio.byteLength).toString('base64');
  const language = options.language?.split('-')[0];
  return mimoChat(options.baseUrl, options.key, {
    model: options.model ?? MIMO_ASR_MODEL,
    messages: [
      {
        role: 'user',
        content: [{ type: 'input_audio', input_audio: { data: `data:${mime};base64,${base64}` } }],
      },
    ],
    asr_options: { language: language === 'zh' || language === 'en' ? language : 'auto' },
  });
}

export function mimoTranscript(body: unknown): string | undefined {
  const result = asrResponse.safeParse(body);
  return result.success ? result.data.choices[0].message.content : undefined;
}

export const mimoTtsResponse = {
  maxBodyBytes(audioBytes: number): number {
    return Math.ceil(audioBytes / 3) * 4 + 16_384;
  },
  decode(body: Uint8Array): Uint8Array | undefined {
    let json: unknown;
    try {
      json = JSON.parse(new TextDecoder().decode(body));
    } catch {
      return undefined;
    }
    const result = ttsResponse.safeParse(json);
    if (!result.success) return undefined;
    const data = result.data.choices[0].message.audio.data;
    if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(data)) return undefined;
    return Buffer.from(data, 'base64');
  },
};
