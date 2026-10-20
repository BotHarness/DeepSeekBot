export interface TunnelState {
  status: string;
  inactiveSince?: string;
}

export interface TunnelApi {
  createTunnel(name: string): Promise<string>;
  tunnelToken(tunnelId: string): Promise<string>;
  tunnelState(tunnelId: string): Promise<TunnelState | undefined>;
  configureIngress(tunnelId: string, hostname: string, originPort: number): Promise<void>;
  deleteTunnel(tunnelId: string): Promise<void>;
  pointHostname(hostname: string, tunnelId: string, recordId?: string): Promise<string>;
  deleteRecord(recordId: string): Promise<void>;
}

export interface CloudflareOptions {
  token: string;
  accountId: string;
  zoneId: string;
  fetcher?: typeof fetch;
}

export const GATEWAY_PATH = '^/botharness-device(/.*)?$';

export class CloudflareError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function createCloudflareApi(options: CloudflareOptions): TunnelApi {
  const fetcher = options.fetcher ?? fetch;
  const tunnels = `/accounts/${options.accountId}/cfd_tunnel`;
  const records = `/zones/${options.zoneId}/dns_records`;

  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await fetcher(`https://api.cloudflare.com/client/v4${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const parsed = (await response.json().catch(() => ({}))) as {
      success?: boolean;
      result?: T;
    };
    if (!response.ok || parsed.success !== true)
      throw new CloudflareError(
        response.status,
        `${method} ${path.split('/').slice(0, 4).join('/')}`,
      );
    return parsed.result as T;
  };

  const missing = (error: unknown) => error instanceof CloudflareError && error.status === 404;

  return {
    async createTunnel(name) {
      const result = await call<{ id: string }>('POST', tunnels, {
        name,
        config_src: 'cloudflare',
      });
      return result.id;
    },
    tunnelToken: (tunnelId) => call<string>('GET', `${tunnels}/${tunnelId}/token`),
    async tunnelState(tunnelId) {
      try {
        const result = await call<{
          status?: string;
          conns_inactive_at?: string | null;
          deleted_at?: string | null;
        }>('GET', `${tunnels}/${tunnelId}`);
        if (result.deleted_at) return undefined;
        return {
          status: result.status ?? 'inactive',
          ...(result.conns_inactive_at ? { inactiveSince: result.conns_inactive_at } : {}),
        };
      } catch (error) {
        if (missing(error)) return undefined;
        throw error;
      }
    },
    async configureIngress(tunnelId, hostname, originPort) {
      await call('PUT', `${tunnels}/${tunnelId}/configurations`, {
        config: {
          ingress: [
            { hostname, path: GATEWAY_PATH, service: `http://127.0.0.1:${originPort}` },
            { service: 'http_status:404' },
          ],
        },
      });
    },
    async deleteTunnel(tunnelId) {
      try {
        await call('DELETE', `${tunnels}/${tunnelId}/connections`);
        await call('DELETE', `${tunnels}/${tunnelId}`);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
    async pointHostname(hostname, tunnelId, recordId) {
      const record = {
        type: 'CNAME',
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
      };
      if (recordId !== undefined) {
        try {
          return (await call<{ id: string }>('PUT', `${records}/${recordId}`, record)).id;
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      return (await call<{ id: string }>('POST', records, record)).id;
    },
    async deleteRecord(recordId) {
      try {
        await call('DELETE', `${records}/${recordId}`);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
  };
}
