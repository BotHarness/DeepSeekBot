import type { CallPost, VoiceCallResult } from '../../desktop-call.js';

export function createVoiceCallBridge(VOICE_CALL_PATH: string) {
  function createCallPost(
    client: string,
    fetcher: typeof fetch = (...args) => fetch(...args),
  ): CallPost {
    const send = async (body: Parameters<CallPost>[0]) => {
      const response = await fetcher(`.${VOICE_CALL_PATH}`, {
        method: 'POST',
        credentials: 'same-origin',
        ...(body.kind === 'hangup' ? { keepalive: true } : {}),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...body, client }),
      });
      const result = (await response.json().catch(() => undefined)) as VoiceCallResult | undefined;
      if (result === undefined || typeof result.ok !== 'boolean')
        throw new Error(`The Host answered ${response.status}.`);
      return result;
    };
    return async (body) => {
      if (body.kind !== 'heartbeat') return await send(body);
      try {
        return await send(body);
      } catch {
        return await send(body);
      }
    };
  }
  return createCallPost;
}
