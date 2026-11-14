import { MethodRefused } from '../../../../apps/mobile/src/host/client.js';
import { BridgeCallError, type BridgeCall } from './bridge.js';

export function hostBridgeCall(
  client: { call(method: string, payload?: Record<string, unknown>): Promise<unknown> },
  current: () => boolean,
): BridgeCall {
  return async (method, payload, signal) => {
    signal?.throwIfAborted();
    if (!current()) throw new Error('remote-conversation-unavailable');
    try {
      const value = await client.call(method, payload);
      signal?.throwIfAborted();
      if (!current()) throw new Error('remote-conversation-unavailable');
      return { ok: true, value };
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof MethodRefused) {
        if (!current()) throw new Error('remote-conversation-unavailable');
        throw new BridgeCallError(error.code, error.message, error.details);
      }
      throw error;
    }
  };
}
