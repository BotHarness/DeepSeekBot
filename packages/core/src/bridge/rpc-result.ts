import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import type { BridgeError, BridgeResult } from './method-utils.js';

export function toRemoteError(error: BridgeError): RemoteError {
  return new RemoteError(error.code as RemoteError['code'], error.message, error.details ?? {});
}

export function unwrap<T>(result: BridgeResult<T>): T {
  if (result.ok) return result.value;
  throw toRemoteError(result.error);
}

export async function unwrapAsync<T>(result: Promise<BridgeResult<T>>): Promise<T> {
  return unwrap(await result);
}
