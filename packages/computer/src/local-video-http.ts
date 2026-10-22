import {
  LOCAL_VIDEO_LIMITS,
  LocalVideoError,
  type LocalVideoCaller,
  type LocalVideoCommand,
  type LocalVideoOwner,
  type LocalVideoResult,
} from './local-video-contract.js';

/** Transport adapter only. The Computer owner validates every binding and execution fence. */
export async function localVideoCommand(
  owner: LocalVideoOwner | undefined,
  caller: LocalVideoCaller,
  value: unknown,
  signal?: AbortSignal,
): Promise<LocalVideoResult> {
  if (owner === undefined)
    return { ok: false, code: 'not-ready', error: 'Local Computer video is not ready.' };
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return { ok: false, code: 'invalid-input', error: 'A video command is required.' };
  try {
    return { ok: true, state: await owner.handle(caller, value as LocalVideoCommand, signal) };
  } catch (error) {
    if (error instanceof LocalVideoError)
      return { ok: false, code: error.code, error: error.message };
    // Native errors can contain paths, SDP or input contents. Keep those out of the wire result.
    return { ok: false, code: 'operation-timeout', error: 'The Computer operation did not complete.' };
  }
}

export async function readLocalVideoCommand(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (reader === undefined) throw new LocalVideoError('invalid-input', 'A video command is required.');
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > LOCAL_VIDEO_LIMITS.requestBytes) {
        await reader.cancel();
        throw new LocalVideoError('request-too-large', 'The video command is too large.');
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(data)) as unknown;
  } catch {
    throw new LocalVideoError('invalid-input', 'The video command must be JSON.');
  }
}

/** The caller is supplied by the authenticated native Connection route, never a header/body. */
export function createLocalVideoHttp(owner: () => LocalVideoOwner | undefined) {
  return async (request: Request): Promise<Response> => {
    let result: LocalVideoResult;
    try {
      result = await localVideoCommand(
        owner(),
        { deviceId: 'host-owner' },
        await readLocalVideoCommand(request),
        request.signal,
      );
    } catch (error) {
      result = error instanceof LocalVideoError
        ? { ok: false, code: error.code, error: error.message }
        : { ok: false, code: 'invalid-input', error: 'The video command could not be read.' };
    }
    return Response.json(result, {
      status: result.ok ? 200 : 409,
      headers: { 'cache-control': 'no-store' },
    });
  };
}
