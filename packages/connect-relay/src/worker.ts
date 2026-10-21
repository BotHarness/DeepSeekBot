import { createAccessTokenVerifier, workosKeys } from './auth.js';
import { createCloudflareApi } from './cloudflare.js';
import type { D1Database } from './d1.js';
import { createRelay, hmac } from './relay.js';

export interface ConnectRelayEnv {
  CONNECT_DB: D1Database;
  WORKOS_CLIENT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CONNECT_ZONE?: string;
  ALLOWED_USERS?: string;
  MAX_HOSTS?: string;
  MAX_TUNNELS?: string;
  CONNECT_LIMIT?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  RECLAIM_AFTER_MINUTES?: string;
  CONNECT_HOST_KEY?: string;
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

let cached: { env: ConnectRelayEnv; relay: ReturnType<typeof createRelay> } | undefined;

export function relayForEnv(env: ConnectRelayEnv): ReturnType<typeof createRelay> | undefined {
  if (cached?.env === env) return cached.relay;
  const clientId = env.WORKOS_CLIENT_ID;
  const token = env.CLOUDFLARE_API_TOKEN;
  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const zoneId = env.CLOUDFLARE_ZONE_ID;
  if (!clientId || !token || !accountId || !zoneId) return undefined;
  const hostSecret = env.CONNECT_HOST_KEY;
  const limiter = env.CONNECT_LIMIT;
  const relay = createRelay({
    db: env.CONNECT_DB,
    verifier: createAccessTokenVerifier({ clientId, keys: workosKeys(clientId) }),
    tunnels: createCloudflareApi({ token, accountId, zoneId }),
    clientId,
    zone: env.CONNECT_ZONE ?? 'deepseekbot.dev',
    allowedUsers: (env.ALLOWED_USERS ?? '')
      .split(',')
      .map((user) => user.trim())
      .filter(Boolean),
    maxHosts: positive(env.MAX_HOSTS, 5),
    maxTunnels: positive(env.MAX_TUNNELS, 900),
    reclaimAfterMs: positive(env.RECLAIM_AFTER_MINUTES, 5) * 60 * 1000,
    ...(limiter === undefined
      ? {}
      : { limit: async (account: string) => (await limiter.limit({ key: account })).success }),
    ...(hostSecret ? { hostKey: (hostId: string) => hmac(hostSecret, `host:${hostId}`) } : {}),
  });
  cached = { env, relay };
  return relay;
}

export default {
  async fetch(request: Request, env: ConnectRelayEnv): Promise<Response> {
    const relay = relayForEnv(env);
    if (relay === undefined)
      return new Response(JSON.stringify({ error: { code: 'relay-unconfigured' } }), {
        status: 503,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    return relay.fetch(request);
  },
  scheduled(
    _controller: { cron: string },
    env: ConnectRelayEnv,
    context: { waitUntil(promise: Promise<unknown>): void },
  ): void {
    const relay = relayForEnv(env);
    if (relay !== undefined) context.waitUntil(relay.reclaim());
  },
};
