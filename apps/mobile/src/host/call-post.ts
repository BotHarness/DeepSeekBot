import type { CallPost } from '../../../../packages/core/src/voice/call-client';
import {
  VOICE_CALL_LIMITS,
  VOICE_CALL_PATH,
} from '../../../../packages/core/src/voice/call-contract';
import type { HostClient } from './client';

export function createCallPost(api: HostClient | undefined): CallPost {
  return async (body) => {
    if (api === undefined) throw new Error('No Host connection.');
    const answer = await api.api(VOICE_CALL_PATH, {
      body,
      timeoutMs:
        body.kind === 'open'
          ? VOICE_CALL_LIMITS.connectTimeoutMs
          : VOICE_CALL_LIMITS.operationTimeoutMs,
    });
    const result = answer.body as { ok?: unknown } | null;
    if (result === null || typeof result !== 'object' || typeof result.ok !== 'boolean')
      throw new Error(`The Host answered ${answer.status}.`);
    return result as Awaited<ReturnType<CallPost>>;
  };
}
