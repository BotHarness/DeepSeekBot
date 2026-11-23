import { describe, expect, it } from 'vitest';

import { setup } from './support.js';

describe('partial tunnel provisioning recovery', () => {
  it.each([false, true])(
    'never leaves a tunnel without DNS when the record fails (repoint=%s)',
    async (repoint) => {
      const { call, tunnels } = await setup();
      const registered = await call('POST', '/v1/hosts', {
        as: 'user_alice',
        body: { name: 'Recovery QA' },
      });
      const id = registered.body.host.id;
      const provision = () =>
        call('POST', `/v1/hosts/${id}/tunnel`, {
          as: 'user_alice',
          body: { originPort: 3000 },
        });
      if (repoint) {
        expect((await provision()).status).toBe(200);
        tunnels.tunnels.clear();
      }
      tunnels.failDns = true;
      expect((await provision()).status).toBe(502);
      expect((await provision()).status).toBe(502);
      expect(tunnels.tunnels.size).toBe(0);
      expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body.hosts[0].tunnel).toBe(
        false,
      );
      tunnels.failDns = false;
      const done = await provision();
      expect(done.status).toBe(200);
      expect(tunnels.tunnels.size).toBe(1);
      const tunnelId = [...tunnels.tunnels.keys()][0]!;
      expect([...tunnels.records.values()].map(({ name, target }) => ({ name, target }))).toEqual([
        { name: `${id}.deepseekbot.dev`, target: `${tunnelId}.cfargotunnel.com` },
      ]);
      expect(tunnels.tunnels.get(tunnelId)?.ingress).toEqual({
        hostname: `${id}.deepseekbot.dev`,
        originPort: 3000,
      });
    },
  );
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
    expect([...tunnels.records.values()]).toMatchObject([
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

  it('lists a Host as connected from the cached tunnel status without calling Cloudflare', async () => {
    const { call, relay, tunnels } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Laptop' } });
    const listed = async () => (await call('GET', '/v1/hosts', { as: 'user_alice' })).body['hosts'];
    expect((await listed())[0]).not.toHaveProperty('connected');
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect((await listed())[0]).toMatchObject({ tunnel: true, connected: false });
    tunnels.tunnels.get('tunnel-1')!.status = 'healthy';
    await relay.reclaim();
    const calls = tunnels.apiCalls;
    const after = await listed();
    expect(after[0]).toMatchObject({ tunnel: true, connected: true });
    expect(after[1]).toMatchObject({ tunnel: false });
    expect(after[1]).not.toHaveProperty('connected');
    expect(tunnels.apiCalls).toBe(calls);
  });

  it('checks a not-yet-online tunnel when the account lists its Hosts', async () => {
    const { call, tunnels } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    tunnels.tunnels.get('tunnel-1')!.status = 'healthy';
    const listed = async (query = '') =>
      (await call('GET', `/v1/hosts${query}`, { as: 'user_alice' })).body['hosts'];
    expect((await listed('?host=haaaaaaaaaaab&idle=0'))[0]).toMatchObject({ connected: false });
    expect((await listed())[0]).toMatchObject({ connected: true, state: 'connected' });
    const calls = tunnels.apiCalls;
    expect((await listed())[0]).toMatchObject({ connected: true });
    expect(tunnels.apiCalls).toBe(calls);
  });

  it('reclaims tunnels left offline and recreates them on a fresh hostname', async () => {
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
    expect((await relay.reclaim()).reclaimed).toEqual([]);

    advance(6 * 60 * 1000);
    expect((await relay.reclaim()).reclaimed).toEqual(['haaaaaaaaaaac']);
    expect([...tunnels.tunnels.keys()]).toEqual(['tunnel-1']);

    if (online) {
      online.status = 'down';
      online.inactiveSince = at();
    }
    advance(60 * 1000);
    expect((await relay.reclaim()).reclaimed).toEqual([]);
    advance(5 * 60 * 1000);
    expect((await relay.reclaim()).reclaimed).toEqual(['haaaaaaaaaaab']);
    expect(tunnels.tunnels.size).toBe(0);

    const back = await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    expect(back.body.token).toBe('token-for-tunnel-3');
    expect(back.body.hostname).toMatch(/^h[a-z2-7]{12}\.deepseekbot\.dev$/u);
    expect(back.body.hostname).not.toBe('haaaaaaaaaaab.deepseekbot.dev');
    expect(tunnels.recordFor(back.body.hostname)).toMatchObject({
      target: 'tunnel-3.cfargotunnel.com',
    });
    expect(tunnels.records.size).toBe(1);
  });

  it('forgets a tunnel deleted outside the relay and unlinks Hosts with their DNS', async () => {
    const { call, relay, tunnels, advance } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    await call('POST', '/v1/hosts/haaaaaaaaaaab/tunnel', {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    tunnels.tunnels.delete('tunnel-1');
    expect((await relay.reclaim()).reclaimed).toEqual([]);
    advance(6 * 60 * 1000);
    tunnels.listComplete = false;
    expect((await relay.reclaim()).vanished).toEqual([]);
    tunnels.listComplete = true;
    const forgotten = await relay.reclaim();
    expect(forgotten.vanished).toEqual(['haaaaaaaaaaab']);
    expect(tunnels.records.size).toBe(0);
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

  it.each(['tunnel', 'dns'])(
    'retries a Host deletion after a %s failure without deleting other Hosts',
    async (stage) => {
      const { call, tunnels } = await setup();
      const target = '/v1/hosts/haaaaaaaaaaab';
      for (const { account, name, id } of [
        { account: 'user_alice', name: 'Target', id: 'haaaaaaaaaaab' },
        { account: 'user_alice', name: 'Keep same account', id: 'haaaaaaaaaaac' },
        { account: 'user_bob', name: 'Keep other account', id: 'haaaaaaaaaaad' },
      ]) {
        await call('POST', '/v1/hosts', { as: account, body: { name } });
        expect(
          (
            await call('POST', `/v1/hosts/${id}/tunnel`, {
              as: account,
              body: { originPort: 41001 },
            })
          ).status,
        ).toBe(200);
      }
      const aliceBefore = await call('GET', '/v1/hosts', { as: 'user_alice' });
      const bobBefore = await call('GET', '/v1/hosts', { as: 'user_bob' });
      const deleteTunnel = tunnels.deleteTunnel.bind(tunnels);
      const deleteRecord = tunnels.deleteRecord.bind(tunnels);
      let unavailable = true;
      tunnels.deleteTunnel = async (tunnelId) => {
        if (unavailable && stage === 'tunnel') throw new Error('synthetic tunnel failure');
        await deleteTunnel(tunnelId);
      };
      tunnels.deleteRecord = async (zone, recordId) => {
        if (unavailable && stage === 'dns') throw new Error('synthetic DNS failure');
        await deleteRecord(zone, recordId);
      };

      expect(await call('DELETE', target, { as: 'user_alice' })).toEqual({
        status: 502,
        body: { error: { code: 'upstream-unavailable' } },
      });
      expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body.hosts).toEqual(
        aliceBefore.body.hosts,
      );
      expect((await call('GET', '/v1/hosts', { as: 'user_bob' })).body.hosts).toEqual(
        bobBefore.body.hosts,
      );
      expect(tunnels.tunnels.has('tunnel-1')).toBe(stage === 'tunnel');
      expect(tunnels.records.size).toBe(3);

      unavailable = false;
      expect(await call('DELETE', target, { as: 'user_alice' })).toEqual({
        status: 200,
        body: { deleted: true },
      });
      expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body.hosts).toEqual([
        aliceBefore.body.hosts[1],
      ]);
      expect((await call('GET', '/v1/hosts', { as: 'user_bob' })).body.hosts).toEqual(
        bobBefore.body.hosts,
      );
      expect([...tunnels.tunnels.keys()]).toEqual(['tunnel-2', 'tunnel-3']);
      expect([...tunnels.records.values()].map((record) => record.target)).toEqual([
        'tunnel-2.cfargotunnel.com',
        'tunnel-3.cfargotunnel.com',
      ]);
      const deleteCalls = tunnels.deleteCalls;
      expect((await call('DELETE', target, { as: 'user_alice' })).status).toBe(404);
      expect(tunnels.deleteCalls).toBe(deleteCalls);
      expect(tunnels.tunnels.size).toBe(2);
      expect(tunnels.records.size).toBe(2);
    },
  );

  it('refuses missing, expired and other-account deletion grants without changing resources', async () => {
    const { call, tunnels, tokenFor } = await setup();
    const target = '/v1/hosts/haaaaaaaaaaab';
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Target' } });
    await call('POST', `${target}/tunnel`, {
      as: 'user_alice',
      body: { originPort: 41001 },
    });
    const before = await call('GET', '/v1/hosts', { as: 'user_alice' });
    const expired = await tokenFor('user_alice', { exp: 0 });
    expect((await call('DELETE', target)).status).toBe(401);
    expect((await call('DELETE', target, { token: expired })).status).toBe(401);
    expect((await call('DELETE', target, { as: 'user_bob' })).status).toBe(404);
    expect(await call('GET', '/v1/hosts', { as: 'user_alice' })).toEqual(before);
    expect(tunnels.deleteCalls).toBe(0);
    expect(tunnels.tunnels.size).toBe(1);
    expect(tunnels.records.size).toBe(1);
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

  it('lists tunnels once per run and stays within the call budget', async () => {
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
    const before = tunnels.apiCalls;
    const first = await relay.reclaim();
    expect(first.reclaimed).toHaveLength(10);
    expect(first.budgetExhausted).toBe(true);
    expect([tunnels.listCalls, tunnels.deleteCalls, tunnels.tunnels.size]).toEqual([1, 10, 10]);
    expect(tunnels.apiCalls - before).toBeLessThanOrEqual(2 + 30);
    expect((await relay.reclaim()).reclaimed).toHaveLength(10);
    expect(tunnels.tunnels.size).toBe(0);
    expect(tunnels.records.size).toBe(0);
    tunnels.listCalls = 0;
    expect((await relay.reclaim()).reclaimed).toEqual([]);
    expect(tunnels.listCalls).toBe(1);
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

  it('stops creating tunnels at the relay cap and rate-limits writes per account', async () => {
    let allowed = true;
    const { call, tunnels } = await setup(['*'], {
      maxTunnels: 1,
      limit: async () => allowed,
    });
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    await call('POST', '/v1/hosts', { as: 'user_bob', body: { name: 'Laptop' } });
    const tunnel = (path: string, as: string) =>
      call('POST', `/v1/hosts/${path}/tunnel`, { as, body: { originPort: 41001 } });
    expect((await tunnel('haaaaaaaaaaab', 'user_alice')).status).toBe(200);
    expect(await tunnel('haaaaaaaaaaac', 'user_bob')).toMatchObject({
      status: 503,
      body: { error: { code: 'relay-full' } },
    });
    expect((await tunnel('haaaaaaaaaaab', 'user_alice')).status).toBe(200);
    expect(tunnels.tunnels.size).toBe(1);

    allowed = false;
    expect(await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Spare' } })).toEqual({
      status: 429,
      body: { error: { code: 'rate-limited' } },
    });
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).status).toBe(200);
    expect((await call('DELETE', '/v1/hosts/haaaaaaaaaaab', { as: 'user_alice' })).status).toBe(
      200,
    );
  });
});
