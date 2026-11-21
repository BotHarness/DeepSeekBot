import type { HostClient } from '@botharness/host-client/client';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

export class BridgeCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'BridgeCallError';
  }
}

export type BridgeCall = (
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ConnectionRpcResult<unknown>>;

export function bridgeHost(call: BridgeCall, signal?: AbortSignal): Pick<HostClient, 'call'> {
  return {
    call: async <T>(method: string, args: Record<string, unknown> = {}) =>
      (await unwrap(call, method, args, signal)) as T,
  };
}

export async function unwrap(
  call: BridgeCall,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await call(endpoint, payload, signal);
  if (!result.ok)
    throw new BridgeCallError(result.error.code, result.error.message, result.error.details);
  return result.value;
}

export function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}
