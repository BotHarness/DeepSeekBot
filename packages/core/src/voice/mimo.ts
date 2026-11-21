import { z } from 'zod';

export const MIMO_TTS_MODEL = 'mimo-v2.5-tts';
export const MIMO_TTS_VOICE = 'mimo_default';

const ttsResponse = z.object({
  choices: z.tuple(
    [z.object({ message: z.object({ audio: z.object({ data: z.string() }) }) })],
    z.unknown(),
  ),
});

export function mimoTtsRequest(options: {
  baseUrl: string;
  model: string | undefined;
  voice: string | undefined;
  key: string | undefined;
  text: string;
}): { url: string; init: RequestInit } {
  return {
    url: `${options.baseUrl}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(options.key === undefined ? {} : { 'api-key': options.key }),
      },
      body: JSON.stringify({
        model: options.model ?? MIMO_TTS_MODEL,
        messages: [{ role: 'assistant', content: options.text }],
        audio: { format: 'mp3', voice: options.voice ?? MIMO_TTS_VOICE },
      }),
    },
  };
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
