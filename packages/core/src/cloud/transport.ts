import { createHash } from 'node:crypto';
import {
  ClientError,
  connectionKey,
  parseInstance,
  type InstanceConfig,
} from './instance-contract.js';

export type CloudCredential = {
  version: 1;
  config: InstanceConfig;
  organizationId: string;
  channelId: string;
  actorId: string;
  ownerUserId: string;
  name: string;
  operationId: string;
  secret: string;
};
export type CloudConnection = Omit<CloudCredential, 'secret' | 'operationId'> & {
  id: string;
  fingerprint: string;
};
export function parseCloudCredential(value: unknown): CloudCredential {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ClientError('INVALID_AGENT_CREDENTIAL');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).some(
      (k) =>
        ![
          'version',
          'config',
          'organizationId',
          'channelId',
          'actorId',
          'ownerUserId',
          'name',
          'operationId',
          'secret',
        ].includes(k),
    ) ||
    v.version !== 1 ||
    typeof v.organizationId !== 'string' ||
    !/^org_[A-Za-z0-9]+$/.test(v.organizationId) ||
    typeof v.channelId !== 'string' ||
    !/^ch_[a-f0-9]{64}$/.test(v.channelId) ||
    typeof v.actorId !== 'string' ||
    !/^ag_[a-f0-9]{64}$/.test(v.actorId) ||
    typeof v.ownerUserId !== 'string' ||
    !/^user_[A-Za-z0-9]+$/.test(v.ownerUserId) ||
    typeof v.name !== 'string' ||
    !v.name.trim() ||
    v.name.length > 80 ||
    [...v.name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) ||
    typeof v.operationId !== 'string' ||
    !/^[A-Za-z0-9_-]{16,100}$/.test(v.operationId) ||
    typeof v.secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(v.secret)
  )
    throw new ClientError('INVALID_AGENT_CREDENTIAL');
  return {
    version: 1,
    config: parseInstance(v.config),
    organizationId: v.organizationId,
    channelId: v.channelId,
    actorId: v.actorId,
    ownerUserId: v.ownerUserId,
    name: v.name,
    operationId: v.operationId,
    secret: v.secret,
  };
}
export function connectionFor(value: CloudCredential): CloudConnection {
  const { secret: _secret, operationId: _operation, ...publicValue } = parseCloudCredential(value);
  const fingerprint = createHash('sha256')
    .update(
      JSON.stringify([
        connectionKey(publicValue.config),
        publicValue.organizationId,
        publicValue.channelId,
        publicValue.actorId,
        publicValue.ownerUserId,
      ]),
    )
    .digest('hex');
  return { ...publicValue, id: 'cloud-' + fingerprint, fingerprint };
}
async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  if (!response.body) throw new ClientError('INVALID_CLOUD_RESPONSE');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > 1048576) throw new ClientError('INVALID_CLOUD_RESPONSE');
      chunks.push(next.value);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new ClientError('INVALID_CLOUD_RESPONSE');
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
export class CloudTransport {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  private async request(url: string, signal: AbortSignal, init: RequestInit = {}) {
    signal.throwIfAborted();
    try {
      return await this.fetcher(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      });
    } catch {
      if (signal.aborted) throw new ClientError('CANCELLED');
      throw new ClientError('CLOUD_UNAVAILABLE');
    }
  }
  async discover(config: InstanceConfig, signal: AbortSignal) {
    const response = await this.request(config.server + '/.well-known/open-cloud-groups', signal);
    if (!response.ok) throw new ClientError('CLOUD_DISCOVERY_UNAVAILABLE');
    const current = parseInstance(await boundedJson(response));
    if (connectionKey(current) !== connectionKey(config))
      throw new ClientError('INSTANCE_CONFIG_CHANGED');
  }
  async call(
    connection: CloudConnection,
    secret: () => Promise<string>,
    path: string,
    signal: AbortSignal,
    body?: unknown,
    operationId?: string,
    beforeSend?: () => boolean,
  ) {
    if (
      !/^\/(?:identity|messages(?:\?after=(?:0|[1-9][0-9]*))?|work-requests\/wr_[a-f0-9]{64}\/(?:authorize|forward|result))$/.test(
        path,
      )
    )
      throw new ClientError('INVALID_CLOUD_PATH');
    await this.discover(connection.config, signal);
    const token = await secret();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new ClientError('CLOUD_CREDENTIAL_UNAVAILABLE');
    signal.throwIfAborted();
    if (beforeSend && !beforeSend()) throw new ClientError('CLOUD_AUTHORITY_CHANGED');
    const response = await this.request(
      connection.config.server + '/api/agent-channels/' + connection.channelId + path,
      signal,
      {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          Authorization: 'Bearer tob_agent_' + connection.actorId + '.' + token,
          'Content-Type': 'application/json',
          ...(operationId ? { 'Idempotency-Key': operationId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
    );
    const value = await boundedJson(response);
    if (!response.ok) {
      const error = value.error as { code?: unknown } | undefined;
      throw new ClientError(
        typeof error?.code === 'string' && /^[A-Z_]{1,80}$/.test(error.code)
          ? error.code
          : 'CLOUD_UNAVAILABLE',
      );
    }

    if ((await secret()) !== token || (beforeSend && !beforeSend()))
      throw new ClientError('CLOUD_AUTHORITY_CHANGED');
    signal.throwIfAborted();
    return value;
  }
}
