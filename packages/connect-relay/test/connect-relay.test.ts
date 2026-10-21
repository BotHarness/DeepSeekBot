import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { describe, expect, it } from 'vitest';

import { createAccessTokenVerifier, type Jwk } from '../src/auth.js';
import { createCloudflareApi, GATEWAY_PATH, type TunnelApi } from '../src/cloudflare.js';
import type { D1Database, D1PreparedStatement, D1Value } from '../src/d1.js';
import { createRelay, hmac, type RelayOptions } from '../src/relay.js';

const CLIENT_ID = 'client_01TEST';
const ISSUER = `https://api.workos.com/user_management/${CLIENT_ID}`;

function localD1(): D1Database {
  const sqlite = new DatabaseSync(':memory:');
  const migrations = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(migrations).sort())
    sqlite.exec(readFileSync(new URL(file, migrations), 'utf8'));
  const statement = (query: string, values: D1Value[]): D1PreparedStatement => ({
    bind: (...next) => statement(query, next),
    first: <T>() =>
      Promise.resolve(
        (sqlite.prepare(query).get(...(values as SQLInputValue[])) ?? null) as T | null,
      ),
    all: <T>() =>
      Promise.resolve({
        results: sqlite.prepare(query).all(...(values as SQLInputValue[])) as T[],
      }),
    run: () => Promise.resolve(sqlite.prepare(query).run(...(values as SQLInputValue[]))),
  });
  return { prepare: (query) => statement(query, []) };
}

const encode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

async function signer() {
  const pair = (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey('jwk', pair.publicKey)) as Jwk;
  const sign = async (claims: Record<string, unknown>, kid = 'key-1') => {
    const body = `${encode({ alg: 'RS256', kid })}.${encode(claims)}`;
    const signature = await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      pair.privateKey,
      new TextEncoder().encode(body),
    );
    return `${body}.${Buffer.from(signature).toString('base64url')}`;
  };
  return { keys: [{ ...jwk, kid: 'key-1', alg: 'RS256' }], sign };
}

class FakeTunnels implements TunnelApi {
  tunnels = new Map<
    string,
    { name: string; status: string; inactiveSince?: string; ingress?: unknown }
  >();
  records = new Map<string, { name: string; target: string }>();
  failCreate = false;
  listComplete = true;
  listCalls = 0;
  deleteCalls = 0;
  #next = 0;
  async createTunnel(name: string) {
    if (this.failCreate) throw new Error('cloudflare down');
    const id = `tunnel-${(this.#next += 1)}`;
    this.tunnels.set(id, { name, status: 'inactive' });
    return id;
  }
  async tunnelToken(tunnelId: string) {
    return `token-for-${tunnelId}`;
  }
  async tunnelState(tunnelId: string) {
    const tunnel = this.tunnels.get(tunnelId);
    return (
      tunnel && {
        status: tunnel.status,
        ...(tunnel.inactiveSince ? { inactiveSince: tunnel.inactiveSince } : {}),
      }
    );
  }
  async listTunnels() {
    this.listCalls += 1;
    const states = new Map<string, { status: string; inactiveSince?: string }>();
    for (const [id, tunnel] of this.tunnels)
      states.set(id, {
        status: tunnel.status,
        ...(tunnel.inactiveSince ? { inactiveSince: tunnel.inactiveSince } : {}),
      });
    return { states, complete: this.listComplete };
  }
  async configureIngress(tunnelId: string, hostname: string, originPort: number) {
    const tunnel = this.tunnels.get(tunnelId);
    if (tunnel) tunnel.ingress = { hostname, originPort };
  }
  async deleteTunnel(tunnelId: string) {
    this.deleteCalls += 1;
    this.tunnels.delete(tunnelId);
  }
  async pointHostname(hostname: string, tunnelId: string, recordId?: string) {
    const id = recordId && this.records.has(recordId) ? recordId : `record-${hostname}`;
    this.records.set(id, { name: hostname, target: `${tunnelId}.cfargotunnel.com` });
    return id;
  }
  async deleteRecord(recordId: string) {
    this.records.delete(recordId);
  }
}

const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

async function setup(
  allowedUsers: string[] = ['user_alice', 'user_bob'],
  extra: Partial<RelayOptions> = {},
) {
  const { keys, sign } = await signer();
  let clock = Date.parse('2026-10-20T12:00:00Z');
  let ids = 0;
  const tunnels = new FakeTunnels();
  const relay = createRelay({
    db: localD1(),
    verifier: createAccessTokenVerifier({
      clientId: CLIENT_ID,
      keys: async () => keys,
      now: () => clock,
    }),
    tunnels,
    clientId: CLIENT_ID,
    zone: 'deepseekbot.dev',
    allowedUsers,
    maxHosts: 5,
    reclaimAfterMs: 5 * 60 * 1000,
    now: () => new Date(clock),
    hostId: () => {
      ids += 1;
      return `haaaaaaaaaa${BASE32[Math.floor(ids / 32)]}${BASE32[ids % 32]}`;
    },
    ...extra,
  });
  const tokenFor = (sub: string, claims: Record<string, unknown> = {}) =>
    sign({ sub, iss: ISSUER, exp: clock / 1000 + 300, ...claims });
  const call = async (
    method: string,
    path: string,
    options: { as?: string; token?: string; body?: unknown } = {},
  ) => {
    const token = options.token ?? (options.as ? await tokenFor(options.as) : undefined);
    const response = await relay.fetch(
      new Request(`https://connect.botharness.ai${path}`, {
        method,
        headers: token ? { authorization: `Bearer ${token}` } : {},
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      }),
    );
    return { status: response.status, body: (await response.json()) as Record<string, any> };
  };
  return {
    relay,
    tunnels,
    sign,
    tokenFor,
    call,
    advance: (ms: number) => (clock += ms),
    at: () => new Date(clock).toISOString(),
  };
}

describe('Connect relay accounts', () => {
  it('publishes the WorkOS client the Host signs in with', async () => {
    const { call } = await setup();
    expect(await call('GET', '/v1/config')).toEqual({
      status: 200,
      body: {
        clientId: CLIENT_ID,
        deviceAuthorizationEndpoint: 'https://api.workos.com/user_management/authorize/device',
        tokenEndpoint: 'https://api.workos.com/user_management/authenticate',
        zone: 'deepseekbot.dev',
      },
    });
  });

  it('accepts only unexpired WorkOS access tokens for allowlisted accounts', async () => {
    const { call, sign, tokenFor, advance } = await setup();
    expect((await call('GET', '/v1/hosts')).status).toBe(401);
    expect((await call('GET', '/v1/hosts', { token: 'not.a.jwt' })).status).toBe(401);
    expect(
      (
        await call('GET', '/v1/hosts', {
          token: await sign({ sub: 'user_alice', iss: 'https://evil.example', exp: 9e9 }),
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call('GET', '/v1/hosts', {
          token: await sign({ sub: 'user_alice', iss: ISSUER, exp: 9e9 }, 'other'),
        })
      ).status,
    ).toBe(401);
    const forged = (await tokenFor('user_alice')).split('.');
    forged[1] = encode({ sub: 'user_bob', iss: ISSUER, exp: 9e9 });
    expect((await call('GET', '/v1/hosts', { token: forged.join('.') })).status).toBe(401);
    const short = await tokenFor('user_alice');
    advance(10 * 60 * 1000);
    expect((await call('GET', '/v1/hosts', { token: short })).status).toBe(401);
    expect(await call('GET', '/v1/hosts', { as: 'user_mallory' })).toEqual({
      status: 403,
      body: { error: { code: 'account-not-allowed' } },
    });
    expect(await call('GET', '/v1/hosts', { as: 'user_alice' })).toEqual({
      status: 200,
      body: { hosts: [] },
    });
  });

  it('links at most five Hosts per account and keeps accounts apart', async () => {
    const { call } = await setup();
    expect((await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: '' } })).status).toBe(
      400,
    );
    const first = await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: ' Studio ' } });
    expect(first).toEqual({
      status: 201,
      body: {
        host: {
          id: 'haaaaaaaaaaab',
          name: 'Studio',
          hostname: 'haaaaaaaaaaab.deepseekbot.dev',
          createdAt: '2026-10-20T12:00:00.000Z',
          tunnel: false,
        },
      },
    });
    for (let index = 0; index < 4; index += 1)
      await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: `Host ${index}` } });
    expect(await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Sixth' } })).toEqual({
      status: 409,
      body: { error: { code: 'host-limit' } },
    });
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body['hosts']).toHaveLength(5);
    expect(await call('GET', '/v1/hosts', { as: 'user_bob' })).toMatchObject({
      body: { hosts: [] },
    });
    expect(
      (
        await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
          as: 'user_bob',
          body: { originPort: 4100 },
        })
      ).status,
    ).toBe(404);
    expect((await call('DELETE', '/v1/hosts/haaaaaaaaaaab', { as: 'user_bob' })).status).toBe(404);
  });
});

describe('Connect relay tunnels', () => {
  it('provisions one gateway-only tunnel per Host and reuses it', async () => {
    const { call, tunnels } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    expect(
      (
        await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
          as: 'user_alice',
          body: { originPort: 80 },
        })
      ).status,
    ).toBe(400);
    const first = await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect(first).toEqual({
      status: 200,
      body: { hostname: 'haaaaaaaaaaab.deepseekbot.dev', token: 'token-for-tunnel-1' },
    });
    expect(tunnels.tunnels.get('tunnel-1')).toMatchObject({
      name: 'dsb-haaaaaaaaaaab',
      ingress: { hostname: 'haaaaaaaaaaab.deepseekbot.dev', originPort: 41001 },
    });
    expect([...tunnels.records.values()]).toEqual([
      { name: 'haaaaaaaaaaab.deepseekbot.dev', target: 'tunnel-1.cfargotunnel.com' },
    ]);
    const again = await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41002 },
    });
    expect(again.body['token']).toBe('token-for-tunnel-1');
    expect(tunnels.tunnels.size).toBe(1);
    expect(tunnels.tunnels.get('tunnel-1')).toMatchObject({ ingress: { originPort: 41002 } });
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body['hosts'][0]).toMatchObject({
      tunnel: true,
    });
  });

  it('reclaims tunnels left offline and recreates them on the same hostname', async () => {
    const { call, relay, tunnels, advance, at } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Laptop' } });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    await call('POST', '/v1/hosts/haaaaaaaaaaac/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    const online = tunnels.tunnels.get('tunnel-1');
    if (online) online.status = 'healthy';
    expect(await relay.reclaim()).toEqual({ reclaimed: [] });

    advance(6 * 60 * 1000);
    expect(await relay.reclaim()).toEqual({ reclaimed: ['haaaaaaaaaaac'] });
    expect([...tunnels.tunnels.keys()]).toEqual(['tunnel-1']);

    if (online) {
      online.status = 'down';
      online.inactiveSince = at();
    }
    advance(60 * 1000);
    expect(await relay.reclaim()).toEqual({ reclaimed: [] });
    advance(5 * 60 * 1000);
    expect(await relay.reclaim()).toEqual({ reclaimed: ['haaaaaaaaaaab'] });
    expect(tunnels.tunnels.size).toBe(0);

    const back = await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect(back.body).toEqual({
      hostname: 'haaaaaaaaaaab.deepseekbot.dev',
      token: 'token-for-tunnel-3',
    });
    expect(tunnels.records.get('record-haaaaaaaaaaab.deepseekbot.dev')).toEqual({
      name: 'haaaaaaaaaaab.deepseekbot.dev',
      target: 'tunnel-3.cfargotunnel.com',
    });
    expect(tunnels.records.size).toBe(2);
  });

  it('forgets a tunnel deleted outside the relay and unlinks Hosts with their DNS', async () => {
    const { call, relay, tunnels, advance } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    tunnels.tunnels.delete('tunnel-1');
    expect(await relay.reclaim()).toEqual({ reclaimed: [] });
    advance(6 * 60 * 1000);
    tunnels.listComplete = false;
    expect(await relay.reclaim()).toEqual({ reclaimed: [] });
    tunnels.listComplete = true;
    expect(await relay.reclaim()).toEqual({ reclaimed: ['haaaaaaaaaaab'] });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect(await call('DELETE', '/v1/hosts/haaaaaaaaaaab', { as: 'user_alice' })).toEqual({
      status: 200,
      body: { deleted: true },
    });
    expect(tunnels.tunnels.size).toBe(0);
    expect(tunnels.records.size).toBe(0);
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body['hosts']).toEqual([]);
  });

  it('caps reclaim attempts when the upstream deletes fail', async () => {
    const accounts = ['user_a', 'user_b', 'user_c', 'user_d'];
    const { call, relay, tunnels, advance } = await setup(accounts);
    for (const account of accounts)
      for (let index = 0; index < 5; index += 1) {
        const { body } = await call('POST', '/v1/hosts', { as: account, body: { name: 'Host' } });
        await call('POST', `/v1/hosts/${body['host'].id}/tunnel`, {
          as: account,
          body: { originPort: 41001 },
        });
      }
    let attempts = 0;
    tunnels.deleteTunnel = async () => {
      attempts += 1;
      throw new Error('upstream unavailable');
    };
    advance(6 * 60 * 1000);
    await relay.reclaim();
    expect(attempts).toBeLessThanOrEqual(15);
  });

  it('lists tunnels once per run and reclaims at most fifteen', async () => {
    const accounts = ['user_a', 'user_b', 'user_c', 'user_d'];
    const { call, relay, tunnels, advance } = await setup(accounts);
    for (const account of accounts)
      for (let index = 0; index < 5; index += 1) {
        const { body } = await call('POST', '/v1/hosts', { as: account, body: { name: 'Host' } });
        await call('POST', `/v1/hosts/${body['host'].id}/tunnel`, {
          as: account,
          body: { originPort: 41001 },
        });
      }
    expect(tunnels.tunnels.size).toBe(20);
    tunnels.listCalls = 0;
    advance(6 * 60 * 1000);
    expect((await relay.reclaim()).reclaimed).toHaveLength(15);
    expect([tunnels.listCalls, tunnels.deleteCalls, tunnels.tunnels.size]).toEqual([1, 15, 5]);
    expect((await relay.reclaim()).reclaimed).toHaveLength(5);
    expect(tunnels.tunnels.size).toBe(0);
    tunnels.listCalls = 0;
    expect(await relay.reclaim()).toEqual({ reclaimed: [] });
    expect(tunnels.listCalls).toBe(0);
  });

  it('reports Cloudflare failures without leaving a half-linked tunnel', async () => {
    const { call, tunnels } = await setup(['*']);
    await call('POST', '/v1/hosts', { as: 'user_anyone', body: { name: 'Studio' } });
    tunnels.failCreate = true;
    expect(
      await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
        as: 'user_anyone',
        body: { originPort: 41001 },
      }),
    ).toEqual({ status: 502, body: { error: { code: 'upstream-unavailable' } } });
    expect((await call('GET', '/v1/hosts', { as: 'user_anyone' })).body['hosts'][0]).toMatchObject({
      tunnel: false,
    });
  });
});

describe('Connect relay phone offers', () => {
  const VERIFIER_HASH = Buffer.alloc(32, 7).toString('base64url');
  const hostKey = (hostId: string) => hmac('relay-secret', `host:${hostId}`);

  async function linked(fetchHost: typeof fetch) {
    const relay = await setup(['user_alice', 'user_bob'], { hostKey, fetchHost });
    await relay.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    return relay;
  }

  it('asks the Host over its tunnel for an offer signed with the Host key', async () => {
    const seen: { url: string; signature: string | null; body: string }[] = [];
    const { call, at } = await linked(async (input, init) => {
      seen.push({
        url: String(input),
        signature: new Headers(init?.headers).get('x-botharness-relay-signature'),
        body: String(init?.body),
      });
      return Response.json({
        offer: 'offer-1',
        expiresAt: '2026-10-20T12:10:00.000Z',
        host: { id: 'pairing-host-1', name: 'Studio Mac' },
      });
    });
    const tunnel = await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect(tunnel.body).toMatchObject({
      account: 'user_alice',
      relayKey: await hostKey('haaaaaaaaaaab'),
    });
    expect(
      await call('POST', '/v1/hosts/haaaaaaaaaaab/offer', {
        as: 'user_alice',
        body: { verifierHash: VERIFIER_HASH, name: ' iPhone ' },
      }),
    ).toEqual({
      status: 200,
      body: {
        offer: 'offer-1',
        expiresAt: '2026-10-20T12:10:00.000Z',
        hostname: 'haaaaaaaaaaab.deepseekbot.dev',
        host: { id: 'pairing-host-1', name: 'Studio Mac' },
      },
    });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(
      'https://haaaaaaaaaaab.deepseekbot.dev/botharness-device/connect/offer',
    );
    expect(JSON.parse(seen[0]!.body)).toEqual({
      hostId: 'haaaaaaaaaaab',
      account: 'user_alice',
      verifierHash: VERIFIER_HASH,
      name: 'iPhone',
      issuedAt: at(),
    });
    expect(seen[0]!.signature).toBe(await hmac(tunnel.body['relayKey'], seen[0]!.body));
  });

  it('refuses offers for other accounts, bad verifiers and unreachable Hosts', async () => {
    let answer: () => Promise<Response> = async () => {
      throw new Error('offline');
    };
    const { call } = await linked(() => answer());
    const offer = (as: string, body: unknown) =>
      call('POST', '/v1/hosts/haaaaaaaaaaab/offer', { as, body });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-offline' },
    });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect((await offer('user_bob', { verifierHash: VERIFIER_HASH })).status).toBe(404);
    expect((await offer('user_alice', { verifierHash: 'short' })).body).toEqual({
      error: { code: 'invalid-verifier' },
    });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).status).toBe(409);
    answer = async () => Response.json({ code: 'relay-signature-invalid' }, { status: 401 });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).body).toEqual({
      error: { code: 'host-refused' },
    });
    answer = async () => Response.json({ offer: 'x', expiresAt: 'y', host: { name: 'Other' } });
    expect((await offer('user_alice', { verifierHash: VERIFIER_HASH })).status).toBe(502);
    const unsigned = await setup();
    await unsigned.call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    expect(
      (
        await unsigned.call('POST', '/v1/hosts/haaaaaaaaaaab/offer', {
          as: 'user_alice',
          body: { verifierHash: VERIFIER_HASH },
        })
      ).body,
    ).toEqual({ error: { code: 'offer-unavailable' } });
  });
});

describe('Cloudflare API client', () => {
  it('lists the tunnels in pages and reports when it stopped early', async () => {
    const urls: string[] = [];
    const pages = { total: 2 };
    const api = createCloudflareApi({
      token: 'cf-token',
      accountId: 'acct',
      zoneId: 'zone',
      fetcher: async (input) => {
        const url = new URL(String(input));
        urls.push(`${url.pathname}${url.search}`);
        const page = Number(url.searchParams.get('page'));
        return Response.json({
          success: true,
          result: [
            {
              id: `t${page}`,
              status: page === 1 ? 'healthy' : 'down',
              conns_inactive_at: page === 1 ? null : '2026-10-20T12:00:00Z',
            },
          ],
          result_info: { total_pages: pages.total },
        });
      },
    });
    expect(await api.listTunnels()).toEqual({
      states: new Map([
        ['t1', { status: 'healthy' }],
        ['t2', { status: 'down', inactiveSince: '2026-10-20T12:00:00Z' }],
      ]),
      complete: true,
    });
    expect(urls[0]).toBe(
      '/client/v4/accounts/acct/cfd_tunnel?is_deleted=false&per_page=100&page=1',
    );
    urls.length = 0;
    pages.total = 30;
    expect((await api.listTunnels()).complete).toBe(false);
    expect(urls).toHaveLength(10);
  });

  it('limits the remote ingress to the device gateway and authenticates with the token', async () => {
    const requests: { method: string; url: string; auth: string | null; body: unknown }[] = [];
    const api = createCloudflareApi({
      token: 'cf-token',
      accountId: 'acct',
      zoneId: 'zone',
      fetcher: async (input, init) => {
        requests.push({
          method: init?.method ?? 'GET',
          url: String(input),
          auth: new Headers(init?.headers).get('authorization'),
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        if (init?.method === 'PUT' && String(input).includes('dns_records'))
          return Response.json({ success: false, errors: [] }, { status: 404 });
        return Response.json({ success: true, result: { id: 'new-record' } });
      },
    });
    await api.configureIngress('tid', 'hx.deepseekbot.dev', 41001);
    expect(requests[0]).toEqual({
      method: 'PUT',
      url: 'https://api.cloudflare.com/client/v4/accounts/acct/cfd_tunnel/tid/configurations',
      auth: 'Bearer cf-token',
      body: {
        config: {
          ingress: [
            {
              hostname: 'hx.deepseekbot.dev',
              path: GATEWAY_PATH,
              service: 'http://127.0.0.1:41001',
            },
            { service: 'http_status:404' },
          ],
        },
      },
    });
    expect(new RegExp(GATEWAY_PATH).test('/botharness-device/pair')).toBe(true);
    expect(new RegExp(GATEWAY_PATH).test('/api/botharness/devices')).toBe(false);
    expect(await api.pointHostname('hx.deepseekbot.dev', 'tid', 'gone')).toBe('new-record');
    expect(requests.slice(1).map((request) => `${request.method} ${request.url}`)).toEqual([
      'PUT https://api.cloudflare.com/client/v4/zones/zone/dns_records/gone',
      'POST https://api.cloudflare.com/client/v4/zones/zone/dns_records',
    ]);
    expect(requests[2]?.body).toEqual({
      type: 'CNAME',
      name: 'hx.deepseekbot.dev',
      content: 'tid.cfargotunnel.com',
      proxied: true,
    });
  });
});
