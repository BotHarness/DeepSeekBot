import { describe, expect, it, vi } from 'vitest';

import { createCloudflareApi } from '../src/cloudflare.js';
import { pickVictim, pickZone, type PoolTunnel } from '../src/pool.js';
import type { RelayOptions } from '../src/relay.js';
import { setup } from './support.js';

const MINUTE = 60 * 1000;
const ZONE = 'deepseekbot.dev';
const EXTRA = 'tobs-connect.dev';

vi.spyOn(console, 'warn').mockImplementation(() => {});

async function pool(accounts = ['user_a', 'user_b', 'user_c'], extra: Partial<RelayOptions> = {}) {
  const env = await setup(accounts, extra);
  const link = async (account: string, name = 'Host') =>
    (await env.call('POST', '/v1/hosts', { as: account, body: { name } })).body.host.id as string;
  const provision = (account: string, id: string, body: Record<string, unknown> = {}) =>
    env.call('POST', `/v1/hosts/${id}/tunnel`, {
      as: account,
      body: { originPort: 41001, ...body },
    });
  const online = async (id: string) => {
    const tunnelId = (await env.row(id))?.['tunnel_id'] as string;
    env.tunnels.tunnels.get(tunnelId)!.status = 'healthy';
    delete env.tunnels.tunnels.get(tunnelId)!.inactiveSince;
    return tunnelId;
  };
  const offline = async (id: string) => {
    const tunnelId = (await env.row(id))?.['tunnel_id'] as string;
    env.tunnels.tunnels.get(tunnelId)!.status = 'down';
    env.tunnels.tunnels.get(tunnelId)!.inactiveSince = env.at();
    return tunnelId;
  };
  return { ...env, link, provision, online, offline };
}

describe('tunnel and DNS lifecycle', () => {
  it('deletes the record with the tunnel when an offline Host is reclaimed and restores both on return', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    expect((await env.provision('user_a', id)).status).toBe(200);
    await env.online(id);
    await env.relay.reclaim();
    expect(env.tunnels.records.size).toBe(1);
    await env.offline(id);
    env.advance(4 * MINUTE);
    expect((await env.relay.reclaim()).reclaimed).toEqual([]);
    env.advance(2 * MINUTE);
    expect((await env.relay.reclaim()).reclaimed).toEqual([id]);
    expect(env.tunnels.tunnels.size).toBe(0);
    expect(env.tunnels.records.size).toBe(0);
    expect(await env.row(id)).toMatchObject({ tunnel_id: null, dns_record_id: null });
    const back = await env.provision('user_a', id);
    expect(back.body.hostname).toBe(`${id}.${ZONE}`);
    expect(env.tunnels.recordFor(`${id}.${ZONE}`)?.target).toBe(
      `${(await env.row(id))?.['tunnel_id']}.cfargotunnel.com`,
    );
  });

  it('reclaims a tunnel that never connected, with its record', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    env.advance(6 * MINUTE);
    expect((await env.relay.reclaim()).reclaimed).toEqual([id]);
    expect([env.tunnels.tunnels.size, env.tunnels.records.size]).toEqual([0, 0]);
  });

  it('forgets a tunnel deleted outside the relay only after a complete listing and deletes its record', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    env.tunnels.tunnels.clear();
    expect((await env.relay.reclaim()).vanished).toEqual([]);
    env.advance(6 * MINUTE);
    env.tunnels.listComplete = false;
    expect((await env.relay.reclaim()).vanished).toEqual([]);
    expect(env.tunnels.records.size).toBe(1);
    env.tunnels.listComplete = true;
    expect((await env.relay.reclaim()).vanished).toEqual([id]);
    expect(env.tunnels.records.size).toBe(0);
    expect(await env.row(id)).toMatchObject({ tunnel_id: null, dns_record_id: null });
  });

  it('recreates the missing record of an online Host and leaves an offline one to reclamation', async () => {
    const env = await pool();
    const up = await env.link('user_a', 'Up');
    const down = await env.link('user_b', 'Down');
    await env.provision('user_a', up);
    await env.provision('user_b', down);
    await env.online(up);
    env.tunnels.records.clear();
    const report = await env.relay.reclaim();
    expect(report.repaired).toEqual([up]);
    const upTunnel = (await env.row(up))?.['tunnel_id'];
    expect(env.tunnels.recordFor(`${up}.${ZONE}`)?.target).toBe(`${upTunnel}.cfargotunnel.com`);
    expect(env.tunnels.recordFor(`${down}.${ZONE}`)).toBeUndefined();
    expect((await env.relay.reclaim()).repaired).toEqual([]);
    env.advance(6 * MINUTE);
    expect((await env.relay.reclaim()).reclaimed).toEqual([down]);
  });

  it('repoints a record that targets another tunnel and removes duplicates of the same name', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    const tunnelId = await env.online(id);
    const recordId = (await env.row(id))?.['dns_record_id'] as string;
    env.tunnels.records.get(recordId)!.target = 'stale-tunnel.cfargotunnel.com';
    env.tunnels.records.set('duplicate', {
      name: `${id}.${ZONE}`,
      target: 'other.cfargotunnel.com',
      zone: ZONE,
      createdAt: env.at(),
    });
    expect((await env.relay.reclaim()).repaired).toEqual([id]);
    expect([...env.tunnels.records.entries()]).toEqual([
      [recordId, expect.objectContaining({ target: `${tunnelId}.cfargotunnel.com` })],
    ]);
  });

  it('deletes orphan and stale records after the window and leaves other records alone', async () => {
    const env = await pool();
    const idle = await env.link('user_a', 'Legacy reclaimed');
    await env.provision('user_a', idle);
    const legacyRecord = (await env.row(idle))?.['dns_record_id'] as string;
    await env.db
      .prepare('UPDATE hosts SET tunnel_id = NULL, tunnel_created_at = NULL WHERE id = ?')
      .bind(idle)
      .run();
    env.tunnels.tunnels.clear();
    const add = (id: string, name: string) =>
      env.tunnels.records.set(id, {
        name,
        target: 'gone.cfargotunnel.com',
        zone: ZONE,
        createdAt: env.at(),
      });
    add('orphan', `hzzzzzzzzzzzz.${ZONE}`);
    add('site', `www.${ZONE}`);
    add('nested', `hzzzzzzzzzzzz.preview.${ZONE}`);
    let report = await env.relay.reclaim();
    expect([report.orphanRecords, report.staleRecords]).toEqual([0, 0]);
    env.advance(6 * MINUTE);
    report = await env.relay.reclaim();
    expect([report.orphanRecords, report.staleRecords]).toEqual([1, 1]);
    expect([...env.tunnels.records.keys()].sort()).toEqual(['nested', 'site']);
    expect(env.tunnels.records.has(legacyRecord)).toBe(false);
    expect(await env.row(idle)).toMatchObject({ dns_record_id: null });
  });

  it('forgets a row record id whose record no longer exists', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.db
      .prepare("UPDATE hosts SET dns_record_id = 'deleted-by-hand' WHERE id = ?")
      .bind(id)
      .run();
    await env.relay.reclaim();
    expect(await env.row(id)).toMatchObject({ dns_record_id: null });
  });

  it('deletes orphan dsb- tunnels after the window and never other tunnels', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    await env.online(id);
    env.tunnels.tunnels.set('orphan', {
      name: 'dsb-hzzzzzzzzzzzz',
      status: 'healthy',
      createdAt: env.at(),
    });
    env.tunnels.tunnels.set('site', {
      name: 'deepseekbot-site-dev',
      status: 'down',
      createdAt: env.at(),
    });
    expect((await env.relay.reclaim()).orphanTunnels).toBe(0);
    env.advance(6 * MINUTE);
    env.tunnels.listComplete = false;
    expect((await env.relay.reclaim()).orphanTunnels).toBe(0);
    env.tunnels.listComplete = true;
    expect((await env.relay.reclaim()).orphanTunnels).toBe(1);
    expect([...env.tunnels.tunnels.keys()].sort()).toEqual(
      [(await env.row(id))?.['tunnel_id'] as string, 'site'].sort(),
    );
  });

  it('leaves tunnels of another relay prefix alone', async () => {
    const env = await pool(undefined, { tunnelPrefix: 'dsbe2e-' });
    env.tunnels.tunnels.set('production', {
      name: 'dsb-hzzzzzzzzzzzz',
      status: 'down',
      createdAt: env.at(),
    });
    env.advance(6 * MINUTE);
    expect((await env.relay.reclaim()).orphanTunnels).toBe(0);
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    expect([...env.tunnels.tunnels.values()].map((tunnel) => tunnel.name).sort()).toEqual([
      'dsb-hzzzzzzzzzzzz',
      `dsbe2e-${id}`,
    ]);
  });

  it('keeps reclaiming other Hosts while one deletion keeps failing', async () => {
    const env = await pool(['user_a', 'user_b', 'user_c', 'user_d'], { reclaimBudget: 6 });
    const ids: string[] = [];
    for (const account of ['user_a', 'user_b', 'user_c', 'user_d']) {
      const id = await env.link(account);
      await env.provision(account, id);
      ids.push(id);
    }
    const stuck = (await env.row(ids[0]!))?.['tunnel_id'];
    const remove = env.tunnels.deleteTunnel.bind(env.tunnels);
    env.tunnels.deleteTunnel = async (tunnelId) => {
      if (tunnelId === stuck) throw new Error('upstream 500');
      await remove(tunnelId);
    };
    env.advance(6 * MINUTE);
    const reclaimed: string[] = [];
    for (let run = 0; run < 4; run += 1) reclaimed.push(...(await env.relay.reclaim()).reclaimed);
    expect(reclaimed.sort()).toEqual(ids.slice(1).sort());
    expect((await env.row(ids[0]!))?.['cleanup_at']).not.toBeNull();
  });

  it('is idempotent across missed or repeated runs', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    await env.online(id);
    await env.relay.reclaim();
    const calls = env.tunnels.apiCalls;
    const again = await env.relay.reclaim();
    expect(again).toMatchObject({ reclaimed: [], repaired: [], failures: 0 });
    expect(env.tunnels.apiCalls - calls).toBe(2);
    env.advance(3 * 60 * MINUTE);
    expect((await env.relay.reclaim()).reclaimed).toEqual([]);
  });

  it('removes Hosts left behind by a deleted account', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    await env.online(id);
    await env.db
      .prepare("INSERT INTO deleted_accounts (account, deleted_at) VALUES ('user_a', ?)")
      .bind(env.at())
      .run();
    expect((await env.relay.reclaim()).deletedAccountHosts).toEqual([id]);
    expect(await env.row(id)).toBeNull();
    expect([env.tunnels.tunnels.size, env.tunnels.records.size]).toEqual([0, 0]);
  });

  it('touches no records in a zone whose listing failed', async () => {
    const env = await pool();
    const id = await env.link('user_a');
    await env.provision('user_a', id);
    await env.online(id);
    env.tunnels.records.clear();
    env.tunnels.records.set('orphan', {
      name: `hzzzzzzzzzzzz.${ZONE}`,
      target: 'gone.cfargotunnel.com',
      zone: ZONE,
      createdAt: env.at(),
    });
    env.advance(6 * MINUTE);
    env.tunnels.failListRecords = true;
    const report = await env.relay.reclaim();
    expect(report).toMatchObject({ repaired: [], orphanRecords: 0, failures: 1 });
    expect([...env.tunnels.records.keys()]).toEqual(['orphan']);
  });

  it('continues deleting an account past one failing Host and retries the rest', async () => {
    const env = await pool(['user_a'], { deleteUser: async () => {} });
    const first = await env.link('user_a', 'One');
    const second = await env.link('user_a', 'Two');
    await env.provision('user_a', first);
    await env.provision('user_a', second);
    const stuck = (await env.row(first))?.['tunnel_id'];
    const remove = env.tunnels.deleteTunnel.bind(env.tunnels);
    let failing = true;
    env.tunnels.deleteTunnel = async (tunnelId) => {
      if (failing && tunnelId === stuck) throw new Error('upstream 500');
      await remove(tunnelId);
    };
    expect((await env.call('DELETE', '/v1/account', { as: 'user_a' })).status).toBe(502);
    expect(await env.row(second)).toBeNull();
    failing = false;
    expect((await env.call('DELETE', '/v1/account', { as: 'user_a' })).status).toBe(200);
    expect([env.tunnels.tunnels.size, env.tunnels.records.size]).toEqual([0, 0]);
  });

  it('answers relay-full on a DNS quota error without keeping the new tunnel', async () => {
    const env = await pool();
    env.tunnels.recordQuota.set(ZONE, 0);
    const id = await env.link('user_a');
    expect(await env.provision('user_a', id)).toMatchObject({
      status: 503,
      body: { error: { code: 'relay-full', reason: 'zone-full', position: 1 } },
    });
    expect(env.tunnels.tunnels.size).toBe(0);
    expect(await env.row(id)).toMatchObject({ tunnel_id: null });
  });
});

describe('eviction when the pool is full', () => {
  it('evicts the longest-offline tunnel for a new Host and marks it evicted', async () => {
    const env = await pool(undefined, { maxTunnels: 2 });
    const a = await env.link('user_a');
    const b = await env.link('user_b');
    await env.provision('user_a', a);
    await env.provision('user_b', b);
    await env.offline(a);
    env.advance(MINUTE);
    await env.offline(b);
    env.advance(3 * MINUTE);
    await env.relay.reclaim();
    const c = await env.link('user_c');
    expect((await env.provision('user_c', c)).status).toBe(200);
    expect(await env.row(a)).toMatchObject({ tunnel_id: null, dns_record_id: null });
    expect((await env.row(a))?.['evicted_at']).not.toBeNull();
    expect((await env.row(b))?.['tunnel_id']).not.toBeNull();
    expect(env.tunnels.recordFor(`${a}.${ZONE}`)).toBeUndefined();
    const listed = await env.call('GET', '/v1/hosts', { as: 'user_a' });
    expect(listed.body.hosts[0]).toMatchObject({ tunnel: false, evicted: true });
  });

  it('protects recently used online Hosts and answers relay-full', async () => {
    const env = await pool(undefined, { maxTunnels: 1 });
    const a = await env.link('user_a');
    await env.provision('user_a', a);
    await env.online(a);
    await env.relay.reclaim();
    env.advance(20 * MINUTE);
    const b = await env.link('user_b');
    expect((await env.provision('user_b', b)).body).toMatchObject({
      error: { code: 'relay-full' },
    });
    env.advance(15 * MINUTE);
    expect((await env.provision('user_b', b)).status).toBe(200);
    expect((await env.row(a))?.['evicted_at']).not.toBeNull();
  });

  it('keeps a Host whose computer reports recent use and evicts the idle one', async () => {
    const env = await pool(undefined, { maxTunnels: 2 });
    const busy = await env.link('user_a');
    const idle = await env.link('user_b');
    await env.provision('user_a', busy);
    await env.provision('user_b', idle);
    await env.online(busy);
    await env.online(idle);
    await env.relay.reclaim();
    env.advance(60 * MINUTE);
    expect((await env.call('GET', `/v1/hosts?host=${busy}&idle=30`, { as: 'user_a' })).status).toBe(
      200,
    );
    await env.call('GET', `/v1/hosts?host=${idle}&idle=0`, { as: 'user_a' });
    const fresh = await env.link('user_c');
    expect((await env.provision('user_c', fresh)).status).toBe(200);
    expect((await env.row(idle))?.['tunnel_id']).toBeNull();
    expect((await env.row(busy))?.['tunnel_id']).not.toBeNull();
  });

  it('does not let an evicted Host evict the Host that replaced it', async () => {
    const env = await pool(undefined, { maxTunnels: 1 });
    const old = await env.link('user_a');
    await env.provision('user_a', old);
    await env.online(old);
    await env.relay.reclaim();
    env.advance(60 * MINUTE);
    const fresh = await env.link('user_b');
    expect((await env.provision('user_b', fresh)).status).toBe(200);
    await env.online(fresh);
    await env.relay.reclaim();
    env.advance(60 * MINUTE);
    expect((await env.provision('user_a', old)).body).toMatchObject({
      error: { code: 'relay-full' },
    });
    expect((await env.row(fresh))?.['tunnel_id']).not.toBeNull();
  });

  it('lets a phone pairing bring an evicted Host back ahead of an idle one', async () => {
    const env = await pool(undefined, {
      maxTunnels: 1,
      hostKey: async () => 'key',
      fetchHost: async () => {
        throw new Error('offline');
      },
    });
    const old = await env.link('user_a');
    await env.provision('user_a', old);
    await env.online(old);
    await env.relay.reclaim();
    env.advance(60 * MINUTE);
    const other = await env.link('user_b');
    await env.provision('user_b', other);
    await env.online(other);
    await env.relay.reclaim();
    env.advance(60 * MINUTE);
    const offer = await env.call('POST', `/v1/hosts/${old}/offer`, {
      as: 'user_a',
      body: { verifierHash: Buffer.alloc(32, 1).toString('base64url') },
    });
    expect(offer.body.error.code).toBe('host-offline');
    expect((await env.provision('user_a', old)).status).toBe(200);
    expect((await env.row(other))?.['tunnel_id']).toBeNull();
  });

  it('evicts within a full zone and places capable Hosts in the zone with most room', async () => {
    const env = await pool(['user_a', 'user_b', 'user_c', 'user_d'], {
      zones: [ZONE, EXTRA],
      zoneRecords: 1,
    });
    const legacy = await env.link('user_a');
    expect((await env.provision('user_a', legacy)).body.hostname).toBe(`${legacy}.${ZONE}`);
    const capable = await env.link('user_b');
    expect((await env.provision('user_b', capable, { zones: [ZONE, EXTRA] })).body.hostname).toBe(
      `${capable}.${EXTRA}`,
    );
    expect(env.tunnels.recordFor(`${capable}.${EXTRA}`)).toMatchObject({ zone: EXTRA });
    const second = await env.link('user_c');
    expect((await env.provision('user_c', second)).body).toMatchObject({
      error: { code: 'relay-full' },
    });
    await env.offline(legacy);
    env.advance(3 * MINUTE);
    await env.relay.reclaim();
    expect((await env.provision('user_c', second)).body.hostname).toBe(`${second}.${ZONE}`);
    expect((await env.row(legacy))?.['tunnel_id']).toBeNull();
    expect((await env.row(capable))?.['tunnel_id']).not.toBeNull();
    env.advance(10 * MINUTE);
    await env.relay.reclaim();
    expect((await env.provision('user_b', capable, { zones: [ZONE, EXTRA] })).body.hostname).toBe(
      `${capable}.${EXTRA}`,
    );
  });

  it('reports pool use and hands a freed slot to the Host that waited longest', async () => {
    const env = await pool(undefined, { maxTunnels: 1 });
    const a = await env.link('user_a');
    await env.provision('user_a', a);
    await env.online(a);
    await env.relay.reclaim();
    const b = await env.link('user_b');
    const c = await env.link('user_c');
    expect((await env.provision('user_b', b)).body.error).toMatchObject({
      code: 'relay-full',
      reason: 'pool-full',
      position: 1,
      retryAfter: 60,
      pool: { capacity: 1, inUse: 1, free: 0, waiting: 1 },
    });
    env.advance(MINUTE);
    expect((await env.provision('user_c', c)).body.error).toMatchObject({ position: 2 });
    const listed = await env.call('GET', '/v1/hosts', { as: 'user_b' });
    expect(listed.body.pool).toEqual({ capacity: 1, inUse: 1, free: 0, waiting: 2 });
    expect(listed.body.hosts[0]).toMatchObject({ state: 'waiting', tunnel: false });
    expect((await env.call('GET', '/v1/hosts', { as: 'user_a' })).body.hosts[0].state).toBe(
      'connected',
    );
    expect((await env.call('DELETE', `/v1/hosts/${a}`, { as: 'user_a' })).status).toBe(200);
    expect((await env.provision('user_c', c)).body.error).toMatchObject({
      reason: 'queued',
      position: 2,
      pool: { free: 1 },
    });
    expect((await env.provision('user_b', b)).status).toBe(200);
    expect((await env.call('GET', '/v1/hosts', { as: 'user_b' })).body.hosts[0].state).toBe(
      'connecting',
    );
    expect((await env.provision('user_c', c)).body.error).toMatchObject({ position: 1 });
  });

  it('forgets a waiting Host that stopped retrying', async () => {
    const env = await pool(undefined, { maxTunnels: 1 });
    const a = await env.link('user_a');
    await env.provision('user_a', a);
    await env.online(a);
    await env.relay.reclaim();
    const b = await env.link('user_b');
    await env.provision('user_b', b);
    env.advance(4 * MINUTE);
    const listed = await env.call('GET', '/v1/hosts', { as: 'user_b' });
    expect(listed.body.pool.waiting).toBe(0);
    expect(listed.body.hosts[0].state).toBe('offline');
  });

  it('advertises every Connect zone in the public config', async () => {
    const env = await pool(undefined, { zones: [ZONE, EXTRA] });
    expect((await env.call('GET', '/v1/config')).body.zones).toEqual([ZONE, EXTRA]);
  });
});

describe('eviction scoring', () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const ago = (minutes: number) => new Date(now - minutes * MINUTE).toISOString();
  const policy = { offlineGraceMs: 2 * MINUTE, protectMs: 30 * MINUTE, freshMs: 10 * MINUTE };
  const tunnel = (id: string, fields: Partial<PoolTunnel>): PoolTunnel => ({
    id,
    account: id,
    zone: ZONE,
    tunnelCreatedAt: ago(600),
    lastUsedAt: ago(600),
    status: 'healthy',
    inactiveSince: null,
    ...fields,
  });

  it('orders gone, then longest offline, then least recently used', () => {
    const requester = { id: 'new', lastUsedAt: now };
    const idle = tunnel('idle', { lastUsedAt: ago(120) });
    const offline = tunnel('offline', { status: 'down', inactiveSince: ago(10) });
    const older = tunnel('older', { status: 'down', inactiveSince: ago(60) });
    const gone = tunnel('gone', { status: 'gone' });
    expect(pickVictim([idle, offline, older, gone], requester, now, policy)).toEqual({
      id: 'gone',
      tier: 'gone',
    });
    expect(pickVictim([idle, offline, older], requester, now, policy)?.id).toBe('older');
    expect(pickVictim([idle], requester, now, policy)).toEqual({ id: 'idle', tier: 'idle' });
  });

  it('skips Hosts inside the offline grace, the protection window or younger than ten minutes', () => {
    const requester = { id: 'new', lastUsedAt: now };
    expect(
      pickVictim(
        [
          tunnel('blip', { status: 'down', inactiveSince: ago(1) }),
          tunnel('used', { lastUsedAt: ago(5) }),
          tunnel('young', { tunnelCreatedAt: ago(5), lastUsedAt: null }),
        ],
        requester,
        now,
        policy,
      ),
    ).toBeUndefined();
  });

  it('never evicts a Host used more recently than the requester', () => {
    expect(
      pickVictim(
        [tunnel('recent', { lastUsedAt: ago(40) })],
        { id: 'old', lastUsedAt: now - 90 * MINUTE },
        now,
        policy,
      ),
    ).toBeUndefined();
  });

  it('breaks idle ties toward the account holding more tunnels', () => {
    const requester = { id: 'new', lastUsedAt: now };
    const solo = tunnel('solo', { account: 'one' });
    const spareA = tunnel('spare-a', { account: 'many' });
    const spareB = tunnel('spare-b', { account: 'many' });
    expect(pickVictim([solo, spareA, spareB], requester, now, policy)?.id).toBe('spare-a');
  });

  it('chooses the zone with the most free records, earlier zone on a tie', () => {
    expect(pickZone([ZONE, EXTRA], new Map([[ZONE, 3]]), 5)).toBe(EXTRA);
    expect(pickZone([ZONE, EXTRA], new Map(), 5)).toBe(ZONE);
    expect(pickZone([ZONE], new Map([[ZONE, 5]]), 5)).toBeUndefined();
  });
});

describe('Cloudflare DNS adoption', () => {
  it('adopts an existing record of the same name instead of failing, and maps quota errors', async () => {
    const requests: string[] = [];
    let quota = false;
    const api = createCloudflareApi({
      token: 't',
      accountId: 'acct',
      zones: [{ name: ZONE, id: 'zone' }],
      fetcher: async (input, init) => {
        const url = new URL(String(input));
        requests.push(`${init?.method} ${url.pathname.replace('/client/v4', '')}${url.search}`);
        if (init?.method === 'POST')
          return Response.json(
            { success: false, errors: [{ code: quota ? 81045 : 81053 }] },
            { status: 400 },
          );
        if (init?.method === 'GET')
          return Response.json({ success: true, result: [{ id: 'existing' }] });
        return Response.json({ success: true, result: { id: 'existing' } });
      },
    });
    expect(await api.pointHostname(ZONE, `hx.${ZONE}`, 'tid')).toBe('existing');
    expect(requests).toEqual([
      'POST /zones/zone/dns_records',
      `GET /zones/zone/dns_records?name=hx.${ZONE}&per_page=5`,
      'PUT /zones/zone/dns_records/existing',
    ]);
    quota = true;
    await expect(api.pointHostname(ZONE, `hy.${ZONE}`, 'tid')).rejects.toThrow(ZONE);
    await expect(api.listRecords('unknown.dev')).rejects.toThrow('unknown zone');
  });

  it('lists only tunnel CNAMEs of a zone in one request', async () => {
    const api = createCloudflareApi({
      token: 't',
      accountId: 'acct',
      zones: [{ name: ZONE, id: 'zone' }],
      fetcher: async (input) => {
        expect(new URL(String(input)).search).toBe('?type=CNAME&per_page=5000');
        return Response.json({
          success: true,
          result: [
            { id: 'r1', name: `ha.${ZONE}`, type: 'CNAME', content: 't1.cfargotunnel.com' },
            { id: 'r2', name: `www.${ZONE}`, type: 'CNAME', content: 'pages.example.com' },
          ],
        });
      },
    });
    expect(await api.listRecords(ZONE)).toEqual([{ id: 'r1', name: `ha.${ZONE}`, target: 't1' }]);
  });
});
