import { VOICE_CALL_LIMITS, type VoiceCallResult } from './call-contract.js';
import type { VoiceCalls } from './calls.js';

export function createVoiceCallHttp(owner: () => VoiceCalls | undefined) {
  return async (request: Request): Promise<Response> => {
    const reply = (result: VoiceCallResult) =>
      Response.json(result, {
        status: result.ok ? 200 : 409,
        headers: { 'cache-control': 'no-store' },
      });
    const calls = owner();
    if (calls === undefined)
      return reply({ ok: false, code: 'not-ready', error: 'Calls are not ready on this Host.' });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (reader !== undefined)
      try {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          bytes += next.value.byteLength;
          if (bytes > VOICE_CALL_LIMITS.requestBytes) {
            await reader.cancel();
            return reply({
              ok: false,
              code: 'request-too-large',
              error: 'The call command is too large.',
            });
          }
          chunks.push(next.value);
        }
      } finally {
        reader.releaseLock();
      }
    let command: unknown;
    try {
      command = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return reply({ ok: false, code: 'invalid-input', error: 'The call command must be JSON.' });
    }
    return reply(await calls.handle({ deviceId: 'host-owner' }, command, request.signal));
  };
}
