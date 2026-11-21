import { z } from 'zod';

import {
  clientIdSchema,
  type AccountIssue,
  type ConnectClientId,
  type ConnectPool,
  type ConnectWait,
} from './connect-account-types.js';

export const CONNECT_RELAY = 'https://connect.botharness.ai';
export const DEVICE_ENDPOINT = 'https://api.workos.com/user_management/authorize/device';
export const TOKEN_ENDPOINT = 'https://api.workos.com/user_management/authenticate';
export const DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

export class AccountError extends Error {
  constructor(
    readonly issue: AccountIssue,
    readonly wait?: Omit<ConnectWait, 'since'>,
    readonly pool?: ConnectPool,
  ) {
    super(issue);
  }
}

const count = z.number().int().nonnegative();
export const poolSchema = z.object({
  capacity: count,
  inUse: count,
  free: count,
  waiting: count,
  nextFreeAt: z.iso.datetime().optional(),
  guaranteedMinutes: count.optional(),
});
const waitSchema = z.object({
  reason: z.enum(['pool-full', 'zone-full', 'queued']),
  position: count,
  retryAfter: count,
  pool: poolSchema.optional(),
});

const transportCodes = new Set([
  'ENOTFOUND',
  'EAI_AGAIN',
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENETUNREACH',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

function transportCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (current.name === 'TimeoutError') return 'timeout';
    if (current.name === 'AbortError') return 'aborted';
    if ('code' in current && typeof current.code === 'string' && transportCodes.has(current.code))
      return current.code;
    current = current.cause;
  }
  return 'unknown';
}

export type RelayOperation =
  | 'config'
  | 'register-host'
  | 'list-hosts'
  | 'revoke-host'
  | 'tunnel'
  | 'live-activity'
  | 'relationship-offer'
  | 'delete-host';
type IdentityOperation = 'device-authorization' | 'device-token' | 'refresh-token';

export function createConnectAccountRequests(
  relay: string,
  fetcher: typeof fetch,
  record: (phase: string, detail?: string) => void,
) {
  const requestError = (
    service: 'relay' | 'identity',
    operation: RelayOperation | IdentityOperation,
    failure:
      | { reason: 'transport'; error: unknown }
      | {
          reason: 'http' | 'invalid-response';
          status: number;
          validation?: 'offer' | 'payload' | 'identity' | 'route' | 'freshness';
        },
  ): AccountError => {
    const evidence =
      failure.reason === 'transport'
        ? `transport=${transportCode(failure.error)}`
        : `httpStatus=${failure.status}${failure.validation === undefined ? '' : ` validation=${failure.validation}`}`;
    record(
      'account-request-error',
      `service=${service} operation=${operation} reason=${failure.reason} ${evidence}`,
    );
    return new AccountError('relay-unavailable');
  };

  const post = async (
    operation: IdentityOperation,
    url: string,
    body: Record<string, string>,
    signal?: AbortSignal,
  ) => {
    let response: Response;
    try {
      response = await fetcher(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body).toString(),
        ...(signal === undefined ? {} : { signal }),
      });
    } catch (error) {
      throw requestError('identity', operation, { reason: 'transport', error });
    }
    if (response.status >= 500 || response.status === 429 || response.status === 408)
      requestError('identity', operation, { reason: 'http', status: response.status });
    const parsed =
      z.record(z.string(), z.unknown()).safeParse(await response.json().catch(() => undefined))
        .data ?? {};
    return { ok: response.ok, status: response.status, body: parsed };
  };

  const relayCall = async (
    operation: RelayOperation,
    method: string,
    path: string,
    accessToken?: string,
    body?: unknown,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<{ status: number; body: Record<string, unknown> }> => {
    let response: Response;
    try {
      response = await fetcher(`${relay}${path}`, {
        method,
        ...(timeoutMs === undefined
          ? signal === undefined
            ? {}
            : { signal }
          : {
              signal: signal
                ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
                : AbortSignal.timeout(timeoutMs),
            }),
        headers: {
          ...(accessToken === undefined ? {} : { authorization: `Bearer ${accessToken}` }),
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (error) {
      throw requestError('relay', operation, { reason: 'transport', error });
    }
    const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    const code = (parsed['error'] as { code?: unknown } | undefined)?.code;
    if (response.status === 401)
      throw new AccountError(code === 'session-revoked' ? 'session-revoked' : 'session-expired');
    if (code === 'account-not-allowed') throw new AccountError('account-not-allowed');
    if (code === 'host-limit') throw new AccountError('host-limit');
    if (code === 'relay-full') {
      const wait = waitSchema.safeParse(parsed['error']);
      throw wait.success
        ? new AccountError(
            'relay-full',
            {
              reason: wait.data.reason,
              position: wait.data.position,
              retryAfter: wait.data.retryAfter,
            },
            wait.data.pool,
          )
        : new AccountError('relay-full');
    }
    if (response.status >= 500 || response.status === 429)
      throw requestError('relay', operation, { reason: 'http', status: response.status });
    return { status: response.status, body: parsed };
  };

  const clientId = async (): Promise<ConnectClientId> => {
    const { status: code, body } = await relayCall('config', 'GET', '/v1/config');
    const parsed = clientIdSchema.safeParse(body['clientId']);
    if (
      code !== 200 ||
      !parsed.success ||
      body['deviceAuthorizationEndpoint'] !== DEVICE_ENDPOINT ||
      body['tokenEndpoint'] !== TOKEN_ENDPOINT
    )
      throw requestError('relay', 'config', { reason: 'invalid-response', status: code });
    return parsed.data;
  };

  return { requestError, post, relayCall, clientId };
}
