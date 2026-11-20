import { ClientError } from './instance-contract';
import type { CloudRuntime } from './client';

export const fail = (code: string): never => {
  throw new ClientError(code);
};
export const cloudError = (e: unknown) => (e instanceof ClientError ? e.code : 'CLOUD_UNAVAILABLE');
export const canRetainCloudCache = (error: unknown) =>
  [
    'NETWORK_UNAVAILABLE',
    'CLOUD_UNAVAILABLE',
    'INSTANCE_UNAVAILABLE',
    'SESSION_BUSY',
    'AUTH_RETRY_REQUIRED',
  ].includes(cloudError(error));
export function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}

export async function requestJson(rt: CloudRuntime, url: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await rt.request(url, { ...init, redirect: 'error', credentials: 'omit' });
  } catch {
    return fail('NETWORK_UNAVAILABLE');
  }
  if (response.redirected || (response.status >= 300 && response.status < 400))
    return fail('REDIRECT_REFUSED');
  if (Number(response.headers.get('content-length')) > 65536) return fail('INVALID_RESPONSE');
  const reader = response.body?.getReader();
  if (!reader) return fail('INVALID_RESPONSE');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > 65536) {
        await reader.cancel();
        return fail('INVALID_RESPONSE');
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const text = new TextDecoder().decode(bytes);
  try {
    return { status: response.status, ok: response.ok, value: record(JSON.parse(text)) };
  } catch {
    return fail('INVALID_RESPONSE');
  }
}
