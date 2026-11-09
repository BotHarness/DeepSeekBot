export interface TunnelState {
  status: string;
  inactiveSince?: string;
  name?: string;
  createdAt?: string;
}

export interface TunnelRecord {
  id: string;
  name: string;
  target: string;
  createdAt?: string;
}

export interface TunnelApi {
  createTunnel(name: string): Promise<string>;
  tunnelToken(tunnelId: string): Promise<string>;
  tunnelState(tunnelId: string): Promise<TunnelState | undefined>;
  listTunnels(): Promise<{ states: Map<string, TunnelState>; complete: boolean }>;
  configureIngress(tunnelId: string, hostname: string, originPort: number): Promise<void>;
  deleteTunnel(tunnelId: string): Promise<void>;
  pointHostname(
    zone: string,
    hostname: string,
    tunnelId: string,
    recordId?: string,
  ): Promise<string>;
  deleteRecord(zone: string, recordId: string): Promise<void>;
  listRecords(zone: string): Promise<TunnelRecord[]>;
}

export interface ConnectZone {
  name: string;
  id: string;
}

export interface CloudflareOptions {
  token: string;
  accountId: string;
  zones: readonly ConnectZone[];
  fetcher?: typeof fetch;
}

const LIST_PAGE_SIZE = 1000;
const LIST_MAX_PAGES = 3;
const RECORD_PAGE_SIZE = 5000;
const RECORD_EXISTS = new Set([81053, 81057, 81058]);
const RECORD_QUOTA = new Set([81045]);

export const GATEWAY_PATH = '^/botharness-device(/.*)?$';

export class CloudflareError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly codes: readonly number[] = [],
  ) {
    super(message);
  }
}

export class RecordQuotaError extends Error {}

export function parseZones(value: string | undefined): ConnectZone[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .flatMap((entry) => {
      const [name, id] = entry.split('=').map((part) => part.trim().toLowerCase());
      return name &&
        id &&
        /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(name) &&
        /^[a-f0-9]{32}$/u.test(id)
        ? [{ name, id }]
        : [];
    });
}

export function createCloudflareApi(options: CloudflareOptions): TunnelApi {
  const fetcher = options.fetcher ?? fetch;
  const tunnels = `/accounts/${options.accountId}/cfd_tunnel`;
  const zoneIds = new Map(options.zones.map((zone) => [zone.name, zone.id]));
  const records = (zone: string) => {
    const id = zoneIds.get(zone);
    if (id === undefined) throw new Error(`unknown zone ${zone}`);
    return `/zones/${id}/dns_records`;
  };

  const envelope = async <T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ result: T; pages: number }> => {
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
      result_info?: { total_pages?: number };
      errors?: unknown;
    };
    if (!response.ok || parsed.success !== true) {
      const codes = (Array.isArray(parsed.errors) ? parsed.errors : [])
        .flatMap((error: unknown) => {
          if (typeof error !== 'object' || error === null || !('code' in error)) return [];
          const code = error.code;
          return typeof code === 'number' &&
            Number.isSafeInteger(code) &&
            code >= 0 &&
            code <= 1_000_000
            ? [code]
            : [];
        })
        .slice(0, 8);
      console.warn(
        JSON.stringify({
          event: 'connect-upstream-error',
          method,
          resource: path.startsWith('/zones/') ? 'dns' : 'tunnel',
          status: response.status,
          codes,
        }),
      );
      throw new CloudflareError(
        response.status,
        `${method} ${path.split('/').slice(0, 4).join('/')}`,
        codes,
      );
    }
    return { result: parsed.result as T, pages: parsed.result_info?.total_pages ?? 1 };
  };

  const call = async <T>(method: string, path: string, body?: unknown): Promise<T> =>
    (await envelope<T>(method, path, body)).result;

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
    async listTunnels() {
      const states = new Map<string, TunnelState>();
      for (let page = 1; page <= LIST_MAX_PAGES; page += 1) {
        const { result, pages } = await envelope<
          {
            id: string;
            name?: string;
            created_at?: string;
            status?: string;
            conns_inactive_at?: string | null;
          }[]
        >('GET', `${tunnels}?is_deleted=false&per_page=${LIST_PAGE_SIZE}&page=${page}`);
        for (const tunnel of result)
          states.set(tunnel.id, {
            status: tunnel.status ?? 'inactive',
            ...(tunnel.conns_inactive_at ? { inactiveSince: tunnel.conns_inactive_at } : {}),
            ...(tunnel.name ? { name: tunnel.name } : {}),
            ...(tunnel.created_at ? { createdAt: tunnel.created_at } : {}),
          });
        if (page >= pages) return { states, complete: true };
      }
      return { states, complete: false };
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
    async pointHostname(zone, hostname, tunnelId, recordId) {
      const path = records(zone);
      const record = {
        type: 'CNAME',
        name: hostname,
        content: `${tunnelId}.cfargotunnel.com`,
        proxied: true,
      };
      const replace = async (id: string) =>
        (await call<{ id: string }>('PUT', `${path}/${id}`, record)).id;
      if (recordId !== undefined) {
        try {
          return await replace(recordId);
        } catch (error) {
          if (!missing(error)) throw error;
        }
      }
      try {
        return (await call<{ id: string }>('POST', path, record)).id;
      } catch (error) {
        if (!(error instanceof CloudflareError)) throw error;
        if (error.codes.some((code) => RECORD_EXISTS.has(code))) {
          const existing = await call<{ id: string }[]>(
            'GET',
            `${path}?name=${encodeURIComponent(hostname)}&per_page=5`,
          );
          const adopted = existing[0]?.id;
          if (adopted !== undefined) return replace(adopted);
        }
        if (error.codes.some((code) => RECORD_QUOTA.has(code))) throw new RecordQuotaError(zone);
        throw error;
      }
    },
    async deleteRecord(zone, recordId) {
      try {
        await call('DELETE', `${records(zone)}/${recordId}`);
      } catch (error) {
        if (!missing(error)) throw error;
      }
    },
    async listRecords(zone) {
      const result = await call<
        { id: string; name: string; type: string; content: string; created_on?: string }[]
      >('GET', `${records(zone)}?type=CNAME&per_page=${RECORD_PAGE_SIZE}`);
      return result
        .filter((record) => record.content.endsWith('.cfargotunnel.com'))
        .map((record) => ({
          id: record.id,
          name: record.name,
          target: record.content.slice(0, -'.cfargotunnel.com'.length),
          ...(record.created_on ? { createdAt: record.created_on } : {}),
        }));
    },
  };
}
