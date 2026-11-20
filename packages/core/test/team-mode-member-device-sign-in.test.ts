import { signInTeamDevice, changeTeamDevicePassword } from '@botharness/host-client/team-client';
import { createManagedTlsIngress } from '../src/devices/managed-tls-ingress.js';
import { afterEach, describe, expect, it } from 'vitest';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import {
  closes,
  enabledFixture,
  NativeSession,
  memberDeviceHost,
  cleanup,
} from './team-mode-fixtures.js';

afterEach(cleanup);

it('admits M8 device passwords through managed TLS ingress and refuses forged main-port headers', async () => {
  const f = await enabledFixture();
  const main = await memberDeviceHost(f, { tls: false });
  const ingress = createManagedTlsIngress({ port: Number(new URL(main.origin).port) });
  closes.push(() => ingress.close());
  const origin = `http://127.0.0.1:${await ingress.start()}`;
  const headers = {
    'content-type': 'application/json',
    'x-forwarded-for': '192.0.2.5',
    'x-forwarded-proto': 'https',
    'x-botharness-device-route': 'managed-tls',
  };
  const body = JSON.stringify({
    username: 'bob',
    password: f.initialPassword,
    deviceName: 'Phone',
    fingerprint: f.encryption.fingerprint,
  });
  const path = '/botharness-device/team/device-sign-in';
  for (const tag of ['managed-tls', 'connect', 'tailscale']) {
    const denied = await fetch(`${main.origin}${path}`, {
      method: 'POST',
      headers: { ...headers, 'x-botharness-device-route': tag },
      body,
    });
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({ code: 'insecure-transport' });
  }
  const allowed = await fetch(`${origin}${path}`, { method: 'POST', headers, body });
  expect(allowed.status).toBe(200);
  const signed = await allowed.json();
  expect(signed).toMatchObject({
    humanId: f.human.humanId,
    credential: expect.stringMatching(/^member\./u),
  });
  const password = await fetch(`${origin}/botharness-device/team/device-password`, {
    method: 'POST',
    headers: { ...headers, authorization: `Device ${signed.credential}` },
    body: JSON.stringify({ current: f.initialPassword, next: 'new-member-password-1' }),
  });
  expect(password.status).toBe(200);
  expect(main.mintOwner).not.toHaveBeenCalled();
});

describe('member devices', { timeout: 60_000 }, () => {
  it('refuses cleartext and spoofed proxy TLS, mode off, suspension and rate limiting', async () => {
    const f = await enabledFixture();
    const host = await memberDeviceHost(f, { tls: false, remote: true });
    let response = await host.signIn({ password: f.initialPassword });
    expect(await response.json()).toEqual({ code: 'insecure-transport' });
    const secure = await memberDeviceHost(f);
    await f.team.setMode(owner, false);
    response = await secure.signIn({ password: f.initialPassword });
    expect(await response.json()).toEqual({ code: 'team-mode-off' });
    await f.team.setMode(owner, true);
    await f.team.suspend(owner, f.human.humanId);
    response = await secure.signIn({ password: f.initialPassword });
    expect(await response.json()).toEqual({ code: 'member-suspended' });
    for (let i = 0; i < 4; i++) await secure.signIn({ password: 'wrong' });
    response = await secure.signIn({ password: f.initialPassword });
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ code: 'rate-limited', retryAfterSeconds: 60 });
  });

  it('gates every device route and mux until password change, preserves only that grant, and dispatches through the member Peer', async () => {
    let now = Date.now();
    const f = await enabledFixture({ now: () => now });
    const host = await memberDeviceHost(f);
    const other = await f.team.signIn('bob', f.initialPassword, 'other-ip');
    const response = await host.signIn({ password: f.initialPassword });
    expect(response.status).toBe(200);
    expect(response.headers.has('set-cookie')).toBe(false);
    const signed = await response.json();
    expect(signed).toMatchObject({
      humanId: f.human.humanId,
      displayName: 'Bob',
      mustChangePassword: true,
    });
    expect(
      f.database.read((db) =>
        db
          .prepare('SELECT kind, device_name, token_hash FROM member_grants WHERE grant_id = ?')
          .get(signed.deviceId),
      ),
    ).toMatchObject({ kind: 'paired-device', device_name: 'Phone' });
    for (const path of ['/api/botharness/teamMode', '/stream-ticket', '/unpair', '/push']) {
      const answer = await host.post(path, {}, signed.credential);
      expect(await answer.json()).toEqual({ code: 'password-change-required' });
    }
    let answer = await host.post(
      '/team/device-password',
      { current: 'wrong', next: 'member-password-1' },
      signed.credential,
    );
    expect(answer.status).toBe(401);
    answer = await host.post(
      '/team/device-password',
      { current: f.initialPassword, next: 'short' },
      signed.credential,
    );
    expect(answer.status).toBe(400);
    answer = await host.post(
      '/team/device-password',
      { current: f.initialPassword, next: f.initialPassword },
      signed.credential,
    );
    expect(answer.status).toBe(409);
    now += 60_001;
    answer = await host.post(
      '/team/device-password',
      { current: f.initialPassword, next: 'member-password-1' },
      signed.credential,
    );
    expect(answer.status).toBe(200);
    expect(f.team.admit(other.token)).toBeUndefined();
    const own = f.channels.createGroup(f.human, { name: 'Member group', members: [] });
    const secret = f.channels.createGroup(owner, { name: 'Secret', members: [] });
    new NativeSession(f.ctx);
    const rpc = async (namespace: string, method: string, args = {}) =>
      (
        await host.post(
          `/api/${namespace}/${method}`,
          {
            type: 'client-request',
            rpcId: 'device-test',
            method: `${namespace}/${method}`,
            payload: { args },
          },
          signed.credential,
        )
      ).json();
    expect(await rpc('botharness', 'channelMessages', { channelId: own.id })).toMatchObject({
      result: { ok: true },
    });
    expect(await rpc('botharness', 'channelMessages', { channelId: secret.id })).toMatchObject({
      result: { ok: false, error: { code: 'remote-access/denied' } },
    });
    expect(await rpc('session', 'list')).toMatchObject({
      result: { ok: false, error: { code: 'remote-access/denied' } },
    });
    expect(host.mintOwner).not.toHaveBeenCalled();
    const peer = f.team.admitDevice(`Device ${signed.credential}`);
    expect(peer?.principal).toMatchObject({
      kind: 'botharness-member',
      humanId: f.human.humanId,
      grantId: signed.deviceId,
    });
    const committed = f.db.diagnostics().metrics.transactionsCommitted;
    for (let i = 0; i < 20; i++)
      expect(f.team.admitDevice(`Device ${signed.credential}`)).toBe(peer);
    expect(f.db.diagnostics().metrics.transactionsCommitted).toBe(committed);
    await f.team.revoke(signed.deviceId);
    answer = await host.post('/api/botharness/ping', {}, signed.credential);
    expect(answer.status).toBe(401);
    expect(await answer.json()).toEqual({ code: 'sign-in-required' });
  });

  it('tells a signed-out or suspended member device why it was refused, over HTTP and Noise', async () => {
    const f = await enabledFixture();
    const host = await memberDeviceHost(f);
    const signed = await (await host.signIn({ password: f.initialPassword })).json();
    await host.post(
      '/team/device-password',
      { current: f.initialPassword, next: 'member-password-1' },
      signed.credential,
    );
    const authorization = `Device ${signed.credential}`;
    await f.team.resetPassword(owner, f.human.humanId);
    let answer = await host.post('/api/botharness/ping', {}, signed.credential);
    expect([answer.status, await answer.json()]).toEqual([401, { code: 'sign-in-required' }]);
    expect(f.pairing.admit(authorization)).toEqual({ ok: false, code: 'sign-in-required' });
    await f.team.suspend(owner, f.human.humanId);
    answer = await host.post('/api/botharness/ping', {}, signed.credential);
    expect([answer.status, await answer.json()]).toEqual([403, { code: 'member-suspended' }]);
    expect(f.pairing.admitKey(authorization, '1'.repeat(64))).toEqual({
      ok: false,
      code: 'member-suspended',
    });
    answer = await host.post('/api/botharness/ping', {}, 'member.' + 'x'.repeat(43));
    expect([answer.status, await answer.json()]).toEqual([401, { code: 'sign-in-required' }]);
  });

  it('signs in and changes the initial password through real Noise with the mobile module, pins its key and never touches Owner cookies', async () => {
    const f = await enabledFixture();
    const host = await memberDeviceHost(f);
    const invitation = {
      v: 1 as const,
      host: { ...f.pairing.host(), fingerprint: f.encryption.fingerprint },
      routes: ['https://habcdefghijkl.deepseekbot.dev'],
      username: 'bob',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    };
    const signed = await signInTeamDevice({
      carrier: host.carrier,
      invitation,
      password: f.initialPassword,
      deviceName: 'Noise phone',
    });
    expect(signed).toMatchObject({
      ok: true,
      value: { member: { humanId: f.human.humanId, mustChangePassword: true } },
    });
    if (!signed.ok) throw new Error(signed.code);
    const changed = await changeTeamDevicePassword({
      carrier: host.carrier,
      host: signed.value,
      current: f.initialPassword,
      next: 'member-password-1',
    });
    expect(changed).toMatchObject({ ok: true, value: { member: { mustChangePassword: false } } });
    expect(f.team.admitDevice(`Device ${signed.value.credential}`, '1'.repeat(64))).toBeUndefined();
    expect(host.mintOwner).not.toHaveBeenCalled();
  });
});
