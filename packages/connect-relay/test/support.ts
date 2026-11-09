import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';

import { createAccessTokenVerifier, type Jwk } from '../src/auth.js';
import { RecordQuotaError, type TunnelApi } from '../src/cloudflare.js';
import type { D1Database, D1PreparedStatement, D1Value } from '../src/d1.js';
import { createRelay, type RelayOptions } from '../src/relay.js';

export const CLIENT_ID = 'client_01TEST';
export const ISSUER = `https://api.workos.com/user_management/${CLIENT_ID}`;

export function localD1(): D1Database {
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

export const encode = (value: unknown) =>
  Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)).toString('base64url');

export async function signer() {
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

export class FakeTunnels implements TunnelApi {
  tunnels = new Map<
    string,
    {
      name: string;
      status: string;
      inactiveSince?: string;
      ingress?: unknown;
      createdAt?: string;
    }
  >();
  records = new Map<string, { name: string; target: string; zone?: string; createdAt?: string }>();
  failCreate = false;
  failDns = false;
  failListRecords = false;
  recordQuota = new Map<string, number>();
  listComplete = true;
  listCalls = 0;
  deleteCalls = 0;
  apiCalls = 0;
  clock: () => string = () => new Date().toISOString();
  #next = 0;
  #nextRecord = 0;
  async createTunnel(name: string) {
    this.apiCalls += 1;
    if (this.failCreate) throw new Error('cloudflare down');
    const id = `tunnel-${(this.#next += 1)}`;
    this.tunnels.set(id, { name, status: 'inactive', createdAt: this.clock() });
    return id;
  }
  async tunnelToken(tunnelId: string) {
    this.apiCalls += 1;
    return `token-for-${tunnelId}`;
  }
  async tunnelState(tunnelId: string) {
    this.apiCalls += 1;
    const tunnel = this.tunnels.get(tunnelId);
    return (
      tunnel && {
        status: tunnel.status,
        ...(tunnel.inactiveSince ? { inactiveSince: tunnel.inactiveSince } : {}),
      }
    );
  }
  async listTunnels() {
    this.apiCalls += 1;
    this.listCalls += 1;
    const states = new Map<
      string,
      { status: string; inactiveSince?: string; name?: string; createdAt?: string }
    >();
    for (const [id, tunnel] of this.tunnels)
      states.set(id, {
        status: tunnel.status,
        name: tunnel.name,
        ...(tunnel.createdAt ? { createdAt: tunnel.createdAt } : {}),
        ...(tunnel.inactiveSince ? { inactiveSince: tunnel.inactiveSince } : {}),
      });
    return { states, complete: this.listComplete };
  }
  async configureIngress(tunnelId: string, hostname: string, originPort: number) {
    this.apiCalls += 1;
    const tunnel = this.tunnels.get(tunnelId);
    if (tunnel) tunnel.ingress = { hostname, originPort };
  }
  async deleteTunnel(tunnelId: string) {
    this.apiCalls += 2;
    this.deleteCalls += 1;
    this.tunnels.delete(tunnelId);
  }
  zoneRecords(zone: string) {
    return [...this.records.values()].filter(
      (record) => (record.zone ?? 'deepseekbot.dev') === zone,
    );
  }
  async pointHostname(zone: string, hostname: string, tunnelId: string, recordId?: string) {
    this.apiCalls += 1;
    if (this.failDns) throw new Error('DNS unavailable');
    if (recordId && this.records.has(recordId)) {
      this.records.set(recordId, {
        ...this.records.get(recordId)!,
        name: hostname,
        target: `${tunnelId}.cfargotunnel.com`,
      });
      return recordId;
    }
    const existing = [...this.records.entries()].find(([, record]) => record.name === hostname);
    if (existing) {
      existing[1].target = `${tunnelId}.cfargotunnel.com`;
      return existing[0];
    }
    if (this.zoneRecords(zone).length >= (this.recordQuota.get(zone) ?? Infinity))
      throw new RecordQuotaError(zone);
    const id = `record-${(this.#nextRecord += 1)}`;
    this.records.set(id, {
      name: hostname,
      target: `${tunnelId}.cfargotunnel.com`,
      zone,
      createdAt: this.clock(),
    });
    return id;
  }
  async deleteRecord(_zone: string, recordId: string) {
    this.apiCalls += 1;
    this.records.delete(recordId);
  }
  async listRecords(zone: string) {
    this.apiCalls += 1;
    if (this.failListRecords) throw new Error('DNS list unavailable');
    return [...this.records.entries()]
      .filter(([, record]) => (record.zone ?? 'deepseekbot.dev') === zone)
      .map(([id, record]) => ({
        id,
        name: record.name,
        target: record.target.replace('.cfargotunnel.com', ''),
        ...(record.createdAt ? { createdAt: record.createdAt } : {}),
      }));
  }
  recordFor(hostname: string) {
    return [...this.records.values()].find((record) => record.name === hostname);
  }
}

export const BASE32 = 'abcdefghijklmnopqrstuvwxyz234567';

export async function setup(
  allowedUsers: string[] = ['user_alice', 'user_bob'],
  extra: Partial<RelayOptions> = {},
) {
  const { keys, sign } = await signer();
  let clock = Date.parse('2026-10-20T12:00:00Z');
  let ids = 0;
  const db = localD1();
  const tunnels = new FakeTunnels();
  tunnels.clock = () => new Date(clock).toISOString();
  const relay = createRelay({
    db,
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
    maxTunnels: 900,
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
  const row = (id: string) =>
    db.prepare('SELECT * FROM hosts WHERE id = ?').bind(id).first<Record<string, unknown>>();
  return {
    relay,
    db,
    row,
    tunnels,
    sign,
    tokenFor,
    call,
    advance: (ms: number) => (clock += ms),
    at: () => new Date(clock).toISOString(),
  };
}
