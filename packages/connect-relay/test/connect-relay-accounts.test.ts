import { describe, expect, it } from 'vitest';

import { createAccessTokenVerifier } from '../src/auth.js';
import {
  marketplaceAuthorDeleter,
  workosSessionRevoker,
  workosUserDeleter,
} from '../src/worker.js';
import { CLIENT_ID, encode, ISSUER, setup, signer } from './support.js';

describe('linked computer sessions', () => {
  it('validates optional sid without accepting malformed claims or expired tokens', async () => {
    const { keys, sign } = await signer();
    const verifier = createAccessTokenVerifier({
      clientId: CLIENT_ID,
      keys: async () => keys,
      now: () => 100_000,
    });
    const claims = { sub: 'user_alice', iss: ISSUER, exp: 200 };
    expect(await verifier.verify(await sign(claims))).toEqual({ account: 'user_alice' });
    expect(await verifier.verify(await sign({ ...claims, sid: 'session_alpha' }))).toEqual({
      account: 'user_alice',
      sessionId: 'session_alpha',
    });
    for (const sid of [null, 1, '', 'bad', {}, 'session_bad value']) {
      expect(await verifier.verify(await sign({ ...claims, sid }))).toBeUndefined();
    }
    expect(
      await verifier.verify(await sign({ ...claims, exp: 99, sid: 'session_alpha' })),
    ).toBeUndefined();
  });

  it('frees a slot, rejects self and cross-account revoke, and tombstones every target route', async () => {
    const removed: string[] = [];
    const { call, tokenFor, tunnels } = await setup(undefined, {
      revokeSession: async (sessionId) => {
        removed.push(sessionId);
      },
    });
    const caller = await tokenFor('user_alice', { sid: 'session_caller' });
    const target = await tokenFor('user_alice', { sid: 'session_target' });
    const current = await call('POST', '/v1/hosts', { token: caller, body: { name: 'Current' } });
    const other = await call('POST', '/v1/hosts', { token: target, body: { name: 'Other' } });
    const otherId = other.body.host.id;
    await call('POST', `/v1/hosts/${otherId}/tunnel`, {
      token: target,
      body: { originPort: 3000 },
    });
    for (let index = 0; index < 3; index += 1)
      await call('POST', '/v1/hosts', { token: caller, body: { name: `Extra ${index}` } });
    expect(
      (await call('POST', '/v1/hosts', { token: caller, body: { name: 'Sixth' } })).body.error.code,
    ).toBe('host-limit');
    expect(
      (await call('POST', `/v1/hosts/${current.body.host.id}/revoke`, { token: caller })).body.error
        .code,
    ).toBe('current-host');
    expect((await call('POST', `/v1/hosts/${otherId}/revoke`, { as: 'user_bob' })).status).toBe(
      404,
    );
    expect(
      (await call('POST', `/v1/hosts/${otherId}/revoke`, { as: 'user_alice' })).body.error.code,
    ).toBe('session-unknown');
    expect(await call('POST', `/v1/hosts/${otherId}/revoke`, { token: caller })).toEqual({
      status: 200,
      body: { deleted: true, sessionKnown: true, sessionRevoked: true },
    });
    expect(removed).toEqual(['session_target']);
    expect(tunnels.records.size).toBe(0);
    expect(tunnels.tunnels.size).toBe(0);
    for (const [method, path] of [
      ['GET', '/v1/hosts'],
      ['POST', '/v1/hosts'],
      ['POST', `/v1/hosts/${otherId}/tunnel`],
      ['DELETE', '/v1/account'],
    ]) {
      expect(
        await call(method!, path!, {
          token: target,
          body: method === 'POST' ? { name: 'Return' } : undefined,
        }),
      ).toEqual({ status: 401, body: { error: { code: 'session-revoked' } } });
    }
    expect(
      (await call('POST', '/v1/hosts', { token: caller, body: { name: 'Sixth' } })).status,
    ).toBe(201);
    const listed = await call('GET', '/v1/hosts', { token: caller });
    expect(listed.body.hosts).toHaveLength(5);
    expect(listed.body.hosts[0].sessionKnown).toBe(true);
    expect(JSON.stringify(listed)).not.toMatch(
      /session_id|session_caller|session_target|relayKey|refresh_token/u,
    );
    expect((await call('POST', `/v1/hosts/${otherId}/revoke`, { token: caller })).status).toBe(404);
  });

  it('enforces tombstones even when WorkOS fails or is not configured', async () => {
    for (const revokeSession of [
      undefined,
      async () => {
        throw new Error('offline');
      },
    ]) {
      const { call, tokenFor } = await setup(
        undefined,
        revokeSession === undefined ? {} : { revokeSession },
      );
      const caller = await tokenFor('user_alice', { sid: 'session_caller' });
      const target = await tokenFor('user_alice', { sid: 'session_target' });
      const registered = await call('POST', '/v1/hosts', {
        token: target,
        body: { name: 'Other' },
      });
      expect(
        (await call('POST', `/v1/hosts/${registered.body.host.id}/revoke`, { token: caller })).body,
      ).toEqual({ deleted: true, sessionKnown: true, sessionRevoked: false });
      expect((await call('GET', '/v1/hosts', { token: target })).body.error.code).toBe(
        'session-revoked',
      );
    }
  });

  it('reports legacy unlink honestly and rebinds a reused registration after re-login', async () => {
    const { call, tokenFor } = await setup();
    const caller = await tokenFor('user_alice', { sid: 'session_caller' });
    const target = await tokenFor('user_alice', { sid: 'session_target' });
    const legacy = await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Legacy' } });
    expect(legacy.body.host.sessionKnown).toBe(false);
    expect(
      (await call('POST', `/v1/hosts/${legacy.body.host.id}/revoke`, { token: caller })).body,
    ).toEqual({ deleted: true, sessionKnown: false, sessionRevoked: false });
    const online = await call('POST', '/v1/hosts', {
      as: 'user_alice',
      body: { name: 'Online legacy' },
    });
    await call('POST', `/v1/hosts/${online.body.host.id}/tunnel`, {
      token: target,
      body: { originPort: 3000 },
    });
    expect(
      (await call('POST', `/v1/hosts/${online.body.host.id}/revoke`, { token: target })).body.error
        .code,
    ).toBe('current-host');
    await call('POST', `/v1/hosts/${online.body.host.id}/tunnel`, {
      token: caller,
      body: { originPort: 3000 },
    });
    expect((await call('GET', '/v1/hosts', { token: caller })).body.hosts[0].sessionKnown).toBe(
      true,
    );
    expect(
      (await call('POST', `/v1/hosts/${online.body.host.id}/revoke`, { token: caller })).body.error
        .code,
    ).toBe('current-host');
    expect(
      (await call('DELETE', `/v1/hosts/${online.body.host.id}`, { token: target })).body,
    ).toEqual({ deleted: true });
    expect((await call('GET', '/v1/hosts', { token: target })).status).toBe(200);
  });

  it('calls only the targeted WorkOS API and accepts an already-ended session', async () => {
    for (const status of [200, 404]) {
      const revoke = workosSessionRevoker('private-key', async (input, init) => {
        expect(input).toBe('https://api.workos.com/user_management/sessions/revoke');
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-key');
        expect(JSON.parse(String(init?.body))).toEqual({ session_id: 'session_target' });
        return new Response(null, { status });
      });
      await expect(revoke('session_target')).resolves.toBeUndefined();
    }
    await expect(
      workosSessionRevoker(
        'key',
        async () => new Response(null, { status: 503 }),
      )('session_target'),
    ).rejects.toThrow('workos 503');
  });
});

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
        zones: ['deepseekbot.dev'],
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
      body: {
        hosts: [],
        pool: { capacity: 195, inUse: 0, free: 195, waiting: 0, guaranteedMinutes: 30 },
      },
    });
    const open = await setup([]);
    expect(await open.call('GET', '/v1/hosts', { as: 'user_mallory' })).toMatchObject({
      status: 200,
      body: { hosts: [] },
    });
  });

  it('links at most three Hosts per account and keeps accounts apart', async () => {
    const { call } = await setup(undefined, { maxHosts: 3 });
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
          sessionKnown: false,
          state: 'offline',
        },
      },
    });
    for (let index = 0; index < 2; index += 1)
      await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: `Host ${index}` } });
    expect(await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Fourth' } })).toEqual(
      {
        status: 409,
        body: { error: { code: 'host-limit' } },
      },
    );
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body['hosts']).toHaveLength(3);
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

  it('deletes an account with its Hosts, tunnels and WorkOS user', async () => {
    const deleted: string[] = [];
    const marketplace: string[] = [];
    let failUser = true;
    let failMarketplace = true;
    const { call, tunnels } = await setup(['user_alice', 'user_bob'], {
      deleteUser: async (account) => {
        if (failUser) throw new Error('workos down');
        deleted.push(account);
      },
      deleteMarketplaceAuthor: async (token) => {
        if (failMarketplace) throw new Error('market down');
        marketplace.push(token);
      },
    });
    for (const name of ['Studio', 'Laptop'])
      await call('POST', '/v1/hosts', { as: 'user_alice', body: { name } });
    await call('POST', '/v1/hosts', { as: 'user_bob', body: { name: 'Bob' } });
    for (const [id, as] of [
      ['haaaaaaaaaaab', 'user_alice'],
      ['haaaaaaaaaaad', 'user_bob'],
    ] as const)
      await call('POST', `/v1/hosts/${id}/tunnel`, { as, body: { originPort: 41001 } });
    expect(await call('DELETE', '/v1/account')).toMatchObject({ status: 401 });
    expect(await call('GET', '/v1/account', { as: 'user_alice' })).toMatchObject({ status: 405 });
    expect(await call('DELETE', '/v1/account', { as: 'user_alice' })).toEqual({
      status: 502,
      body: { error: { code: 'upstream-unavailable' } },
    });
    expect(deleted).toEqual([]);
    failMarketplace = false;
    expect(await call('DELETE', '/v1/account', { as: 'user_alice' })).toMatchObject({
      status: 502,
    });
    failUser = false;
    expect(await call('DELETE', '/v1/account', { as: 'user_alice' })).toEqual({
      status: 200,
      body: { deleted: true },
    });
    expect(deleted).toEqual(['user_alice']);
    expect(marketplace).toHaveLength(2);
    expect(await call('GET', '/v1/hosts', { as: 'user_alice' })).toMatchObject({ status: 401 });
    expect(
      await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Again' } }),
    ).toMatchObject({ status: 401 });
    expect([...tunnels.tunnels.values()].map((tunnel) => tunnel.name)).toEqual([
      'dsb-haaaaaaaaaaad',
    ]);
    expect([...tunnels.records.values()].map((record) => record.name)).toEqual([
      'haaaaaaaaaaad.deepseekbot.dev',
    ]);
    expect((await call('GET', '/v1/hosts', { as: 'user_bob' })).body['hosts']).toHaveLength(1);
  });

  it('refuses account deletion without a WorkOS API key', async () => {
    const { call } = await setup();
    await call('POST', '/v1/hosts', { as: 'user_alice', body: { name: 'Studio' } });
    expect(await call('DELETE', '/v1/account', { as: 'user_alice' })).toEqual({
      status: 503,
      body: { error: { code: 'account-deletion-unavailable' } },
    });
    expect((await call('GET', '/v1/hosts', { as: 'user_alice' })).body['hosts']).toHaveLength(1);
  });

  it("deletes the Marketplace author with the user's own token", async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const statuses = [200, 503];
    const remove = marketplaceAuthorDeleter((async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(null, { status: statuses.shift()! });
    }) as typeof fetch);
    await remove('token-alice');
    await expect(remove('token-alice')).rejects.toThrow('marketplace 503');
    expect(calls[0]).toEqual([
      'https://market.botharness.ai/v1/me',
      { method: 'DELETE', headers: { authorization: 'Bearer token-alice' } },
    ]);
  });

  it('deletes the WorkOS user with the API key and treats a missing user as deleted', async () => {
    const calls: [string, RequestInit | undefined][] = [];
    const statuses = [200, 404, 500];
    const remove = workosUserDeleter('sk_test', (async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      return new Response(null, { status: statuses.shift()! });
    }) as typeof fetch);
    await remove('user_alice');
    await remove('user_alice');
    await expect(remove('user_alice')).rejects.toThrow('workos 500');
    expect(calls[0]).toEqual([
      'https://api.workos.com/user_management/users/user_alice',
      { method: 'DELETE', headers: { authorization: 'Bearer sk_test' } },
    ]);
  });
});
