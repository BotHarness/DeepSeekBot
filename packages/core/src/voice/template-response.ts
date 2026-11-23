import type { VoiceRequestTemplate } from './request-template.js';
import { withPublicAudioDownload } from './template-download.js';
import { readBounded, statusError } from './provider-http.js';
import { MAX_TTS_AUDIO_BYTES, VoiceError } from './provider-types.js';

export function templateResult(body: unknown, path: string): string {
  let value = body;
  for (const part of path.split('.')) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part))
      throw new VoiceError('provider-bad-response', 'The configured result path was not found.');
    value = Reflect.get(value, part);
  }
  if (typeof value !== 'string')
    throw new VoiceError('provider-bad-response', 'The configured result path must contain text.');
  return value;
}

async function responseAudio(
  response: Response,
): Promise<{ audio: Uint8Array; contentType: string | null }> {
  const contentType = response.headers.get('content-type');
  const audio = await readBounded(response, MAX_TTS_AUDIO_BYTES);
  const prefix = new TextDecoder().decode(audio.subarray(0, 256));
  if (
    /^text\/|^application\/(?:problem\+)?json/iu.test(contentType ?? '') ||
    /^\s*(?:<!doctype\s+html|<html|<head|<body)/iu.test(prefix)
  )
    throw new VoiceError(
      'provider-bad-response',
      'The provider returned a page or text instead of audio.',
    );
  return { audio, contentType };
}

export async function templateAudio(options: {
  response: Response;
  result: VoiceRequestTemplate['result'];
  fetch: typeof fetch;
  signal: AbortSignal;
}): Promise<{ audio: Uint8Array; contentType: string | null }> {
  const { result } = options;
  const response = options.response;
  if (result.kind === 'audio') return responseAudio(response);
  if (result.kind === 'text')
    throw new VoiceError('provider-bad-response', 'TTS requires an audio result.');
  const limit =
    result.kind === 'hex'
      ? MAX_TTS_AUDIO_BYTES * 2
      : result.kind === 'url'
        ? 256 * 1024
        : Math.ceil(MAX_TTS_AUDIO_BYTES / 3) * 4;
  const bytes = await readBounded(response, limit + 16_384);
  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof VoiceError) throw error;
    throw new VoiceError(
      'provider-bad-response',
      'The provider did not return the configured JSON audio result.',
    );
  }
  const value = templateResult(body, result.path);
  if (result.kind === 'url') {
    let url: URL;
    try {
      url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash)
        throw new Error();
    } catch {
      throw new VoiceError(
        'provider-bad-response',
        'The provider returned an invalid audio download URL.',
      );
    }
    return withPublicAudioDownload(url, options.signal, options.fetch, async (download) => {
      if (!download.ok) {
        await download.body?.cancel().catch(() => undefined);
        throw statusError(download.status, `HTTP ${download.status}`);
      }
      return responseAudio(download);
    });
  }
  if (value.length > limit)
    throw new VoiceError('audio-too-large', 'The provider returned too much audio.');
  if (
    result.kind === 'hex'
      ? value.length % 2 !== 0 || !/^[A-Fa-f0-9]+$/u.test(value)
      : value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)
  )
    throw new VoiceError('provider-bad-response', 'The provider returned invalid encoded audio.');
  const audio = Buffer.from(value, result.kind);
  if (audio.byteLength > MAX_TTS_AUDIO_BYTES)
    throw new VoiceError('audio-too-large', 'The provider returned too much audio.');
  return { audio, contentType: null };
}
