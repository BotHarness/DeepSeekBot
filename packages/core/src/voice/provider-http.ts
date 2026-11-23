import { LOCAL_VOICE_SCRIPT_NAME } from './local-kit.js';
import { VoiceError } from './provider-types.js';

export async function readBounded(response: Response, max: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) {
    await response.body?.cancel().catch(() => undefined);
    throw new VoiceError('audio-too-large', 'The provider returned more audio than allowed.');
  }
  if (response.body === null) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    size += chunk.byteLength;
    if (size > max)
      throw new VoiceError('audio-too-large', 'The provider returned too much audio.');
    chunks.push(chunk);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function providerMessage(
  response: Response,
  _key: string | undefined,
): Promise<string> {
  await response.body?.cancel().catch(() => undefined);
  return `HTTP ${response.status}`;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '0.0.0.0']);

export function causeCode(error: unknown): string | undefined {
  for (let current = error, depth = 0; current && depth < 4; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return undefined;
}

export function unreachableMessage(baseUrl: string, error: unknown, preset?: string): string {
  const url = new URL(baseUrl);
  const code = causeCode(error);
  if (preset === 'local' && LOOPBACK_HOSTS.has(url.hostname) && code === 'ECONNREFUSED')
    return `The local speech service at ${url.origin} is not running. Start it on the Host computer (python ${LOCAL_VOICE_SCRIPT_NAME} start in its folder) and try again.`;
  if (code === 'ECONNREFUSED')
    return `Nothing is listening at ${url.origin}. Check that the speech service is running.`;
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN')
    return `The provider host ${url.hostname} cannot be found.`;
  return `The provider cannot be reached (${code ?? (error instanceof Error ? error.name : 'network error')}).`;
}

export function statusError(status: number, detail: string): VoiceError {
  if (status === 401 || status === 403)
    return new VoiceError('provider-unauthorized', `The provider refused the key: ${detail}`);
  if (status === 402 || status === 429)
    return new VoiceError(
      'provider-rate-limited',
      `The provider is out of quota or rate limited: ${detail}`,
    );
  if (status >= 500)
    return new VoiceError('provider-unavailable', `The provider failed: ${detail}`);
  if (status === 404)
    return new VoiceError(
      'provider-rejected',
      `The provider endpoint was not found: ${detail}. Check the preset and base URL.`,
    );
  return new VoiceError('provider-rejected', `The provider rejected the request: ${detail}`);
}
