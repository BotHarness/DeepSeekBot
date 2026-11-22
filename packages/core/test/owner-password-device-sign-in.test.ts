import { randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { encryptedCarrier, openNoiseSocket } from '@botharness/host-client/encrypted-carrier';
import { signInWithPassword } from '@botharness/host-client/password-sign-in';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { OWNER_HUMAN_CONTEXT as owner, humanContext } from '../src/humans/context.js';
import { createGatewayOrigin } from '../src/devices/connect.js';
import * as passwordHashing from '../src/team/password.js';
import { cleanup, enabledFixture, memberDeviceHost, teamFixture } from './team-mode-fixtures.js';

afterEach(cleanup);

const target = 'https://habcdefghijkl.deepseekbot.dev';
const password = 'standalone-owner-password-1';
const deviceEncryption = (f: ReturnType<typeof teamFixture>) => ({
  protocol: f.encryption.protocol,
  hostKey: f.encryption.publicKey,
  deviceKey: randomBytes(32).toString('hex'),
});

async function signIn(
  f: ReturnType<typeof teamFixture>,
  host: Awaited<ReturnType<typeof memberDeviceHost>>,
  encryption: ReturnType<typeof deviceEncryption>,
  {
    username = 'my-owner',
    attempt = password,
    fingerprint = f.encryption.fingerprint,
    repeat = false,
    type = 'owner-sign-in',
    repeatType = type,
  } = {},
) {
  return new Promise<unknown>((resolve, reject) => {
    let result: unknown;
    const socket = openNoiseSocket({
      origin: target,
      hostId: f.pairing.host().id,
      encryption,
      raw: host.carrier,
      message(frame) {
        if (repeat && frame['type'] === 'refused' && frame['code'] === 'invalid-input') {
          resolve(result);
          socket.close();
          return;
        }
        const reply = type === 'password-sign-in' ? 'password-signed-in' : 'owner-signed-in';
        if (frame['type'] !== reply) return;
        result = frame['result'];
        if (!repeat) {
          resolve(result);
          socket.close();
        }
      },
      closed: (reason) => reject(new Error(reason)),
    });
    void socket.ready.then(() => {
      const request = {
        type,
        input: { username, password: attempt, deviceName: 'Desktop', fingerprint },
      };
      socket.send(request);
      if (repeat) socket.send({ ...request, type: repeatType });
    }, reject);
  });
}

it('discovers password availability at the Host and through the Connect origin', async () => {
  const f = await enabledFixture();
  const host = await memberDeviceHost(f);
  const proxy = createGatewayOrigin(() => Number(new URL(host.origin).port));
  await new Promise<void>((resolve) => proxy.listen(0, '127.0.0.1', resolve));
  const proxyOrigin = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
  const discover = async (password: boolean) => {
    for (const origin of [host.origin, proxyOrigin]) {
      const response = await fetch(origin + '/botharness-device/channel');
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(await response.json()).toEqual({
        host: f.pairing.host(),
        encryption: f.encryption,
        signIn: { password },
      });
    }
  };
  try {
    await discover(true);
    await f.team.suspend(owner, f.human.humanId);
    await discover(false);
    await f.team.setMode(owner, false);
    await f.team.ownerPasswordSignInSet(owner, { enabled: true });
    await discover(true);
    await f.team.ownerPasswordSignInSet(owner, { enabled: false });
    await discover(false);
  } finally {
    proxy.closeAllConnections();
    await new Promise<void>((resolve) => proxy.close(() => resolve()));
  }
});

it('uses the existing Owner and member grants for unified password sign-in', async () => {
  const f = await enabledFixture();
  await f.team.ownerPasswordSignInSet(owner, { enabled: true });
  const host = await memberDeviceHost(f);
  const enroll = (username: string, password: string) =>
    signInWithPassword({
      carrier: host.carrier,
      route: target,
      username,
      password,
      deviceName: 'Phone',
    });
  const signedOwner = await enroll('owner', 'owner-password-1');
  expect(signedOwner).toMatchObject({ ok: true, value: { role: 'owner' } });
  expect(f.pairing.list()).toMatchObject([{ enrollment: 'owner-password' }]);
  const member = await enroll('bob', f.initialPassword);
  expect(member).toMatchObject({
    ok: true,
    value: { role: 'member', member: { humanId: f.human.humanId, mustChangePassword: true } },
  });
  if (!member.ok || !member.value.encryption) throw new Error('missing member grant');
  const { credential, encryption } = member.value;
  expect(f.team.admitDevice(`Device ${credential}`, f.encryption.publicKey)).toBeUndefined();
  expect(f.pairing.list()).toHaveLength(1);
  expect(credential).toMatch(/^member\./u);
  const deviceKey = Buffer.from(encryption.deviceKey, 'hex');
  const { noisePublicKey } = await import('@botharness/host-protocol/noise/xk');
  expect(
    f.team.admitDevice(
      `Device ${credential}`,
      Buffer.from(noisePublicKey(deviceKey)).toString('hex'),
    )?.principal,
  ).toMatchObject({ kind: 'botharness-member', humanId: f.human.humanId });
});

it('uses identical refusals and hash costs for wrong and unknown passwords, including a disabled Owner', async () => {
  const f = await enabledFixture();
  const host = await memberDeviceHost(f);
  const authenticate = (username: string, attempt: string) =>
    signIn(f, host, deviceEncryption(f), { type: 'password-sign-in', username, attempt });
  const verify = vi.spyOn(passwordHashing, 'verifyPassword');
  try {
    for (const username of ['owner', 'bob', 'no-such-user'])
      expect(await authenticate(username, 'wrong')).toEqual({
        ok: false,
        code: 'credentials-invalid',
      });
    expect(verify.mock.calls.map(([, hash]) => hash.params)).toEqual(
      Array.from({ length: 3 }, () => passwordHashing.ARGON2_PARAMS),
    );
    expect(verify).toHaveBeenLastCalledWith('wrong', passwordHashing.DUMMY_PASSWORD_HASH);
    expect(await authenticate('owner', 'owner-password-1')).toEqual({
      ok: false,
      code: 'owner-sign-in-disabled',
    });
    await f.team.setMode(owner, false);
    expect(await authenticate('owner', 'owner-password-1')).toEqual({
      ok: false,
      code: 'password-sign-in-unavailable',
    });
  } finally {
    verify.mockRestore();
  }
});

it.each([
  ['password-sign-in', 'password-sign-in'],
  ['password-sign-in', 'owner-sign-in'],
  ['owner-sign-in', 'password-sign-in'],
])('allows only one password attempt when %s is followed by %s', async (type, repeatType) => {
  const f = teamFixture();
  await f.team.ownerPasswordSignInSet(owner, { enabled: true, username: 'my-owner', password });
  const host = await memberDeviceHost(f);
  await expect(
    signIn(f, host, deviceEncryption(f), { type, repeatType, repeat: true }),
  ).resolves.toMatchObject({ ok: true });
  expect(f.pairing.list()).toHaveLength(1);
});

it('shares one username limit between unified and standalone Owner sign-in', async () => {
  const f = teamFixture();
  await f.team.ownerPasswordSignInSet(owner, { enabled: true, username: 'my-owner', password });
  const host = await memberDeviceHost(f);
  for (let attempt = 0; attempt < 5; attempt++) {
    const type = attempt % 2 === 0 ? 'password-sign-in' : 'owner-sign-in';
    expect(await signIn(f, host, deviceEncryption(f), { type, attempt: 'wrong' })).toEqual({
      ok: false,
      code: 'credentials-invalid',
    });
  }
  expect(await signIn(f, host, deviceEncryption(f), { type: 'password-sign-in' })).toEqual({
    ok: false,
    code: 'rate-limited',
    retryAfterSeconds: 60,
  });
});

it('enrolls an Owner device through Noise with Team mode off and revokes its admitted connection', async () => {
  const f = teamFixture();
  const host = await memberDeviceHost(f);
  const peer = new Peer(f.ctx, { principal: { kind: 'owner' } });
  const invoke = (
    method: 'ownerPasswordSignIn' | 'ownerPasswordSignInSet',
    args: Record<string, unknown> = {},
  ) => f.gateway.invoke({ namespace: 'botharness', method, args, peer });
  const encryption = deviceEncryption(f);
  expect(await invoke('ownerPasswordSignIn')).toEqual({ enabled: false });
  expect(await signIn(f, host, encryption)).toEqual({ ok: false, code: 'owner-sign-in-disabled' });
  expect(
    await invoke('ownerPasswordSignInSet', { enabled: true, username: 'my-owner', password }),
  ).toEqual({ enabled: true, username: 'my-owner' });
  expect(f.team.enabled()).toBe(false);

  const result = z
    .object({
      ok: z.literal(true),
      value: z.object({
        host: z.object({ id: z.string(), name: z.string(), fingerprint: z.string() }),
        deviceId: z.string(),
        credential: z.string(),
      }),
    })
    .parse(await signIn(f, host, encryption, { repeat: true }));
  const { credential, deviceId } = result.value;
  expect(result.value.host).toEqual({ ...f.pairing.host(), fingerprint: f.encryption.fingerprint });
  expect(credential.startsWith(deviceId + '.')).toBe(true);
  expect(f.pairing.list()).toMatchObject([{ id: deviceId, enrollment: 'owner-password' }]);
  expect((await host.post('/feed-read', {}, credential)).status).toBe(401);
  expect(f.pairing.admitKey(`Device ${credential}`, 'c'.repeat(64))).toEqual({
    ok: false,
    code: 'device-unknown',
  });

  const carrier = encryptedCarrier({
    credential,
    encryption,
    hostId: result.value.host.id,
    raw: host.carrier,
  });
  const acknowledge = () =>
    carrier.request(target + '/botharness-device/feed-read', {
      method: 'POST',
      signal: AbortSignal.timeout(5_000),
    });
  try {
    expect((await acknowledge()).status).toBe(200);
    expect(await invoke('ownerPasswordSignInSet', { enabled: false })).toEqual({
      enabled: false,
      username: 'my-owner',
    });
    expect((await acknowledge()).status).toBe(200);
    expect(await signIn(f, host, deviceEncryption(f))).toEqual({
      ok: false,
      code: 'owner-sign-in-disabled',
    });
    expect(f.pairing.revoke(deviceId)).toMatchObject({ revoked: true, closedStreams: 1 });
    await expect(acknowledge()).rejects.toThrow();
  } finally {
    carrier.close?.();
  }
});

it('revokes the new Owner device when the encrypted reply cannot be sent', async () => {
  const f = teamFixture();
  await f.methods(owner).ownerPasswordSignInSet({ enabled: true, username: 'my-owner', password });
  const host = await memberDeviceHost(f);
  const send = vi.spyOn(WebSocket.prototype, 'send');
  const signInOwner = f.devices.signInOwner.bind(f.devices);
  const enroll = vi.spyOn(f.devices, 'signInOwner').mockImplementationOnce(async (...args) => {
    const result = await signInOwner(...args);
    send.mockImplementationOnce(() => {
      throw new Error('socket send failed');
    });
    return result;
  });
  try {
    await expect(signIn(f, host, deviceEncryption(f))).rejects.toThrow();
    expect(f.pairing.list()).toMatchObject([
      { enrollment: 'owner-password', revokedAt: expect.any(String) },
    ]);
  } finally {
    enroll.mockRestore();
    send.mockRestore();
  }
});

it('commits only one credential when the Owner setup entry points race', async () => {
  const f = teamFixture();
  const [standalone, team] = await Promise.allSettled([
    f.team.ownerPasswordSignInSet(owner, { enabled: true, username: 'my-owner', password }),
    f.team.setOwnerPassword(owner, 'legacy-owner-password-1'),
  ]);
  if (standalone.status === 'fulfilled') {
    expect(team).toMatchObject({ status: 'rejected', reason: { code: 'credentials-invalid' } });
    expect(f.team.ownerPasswordSignIn(owner)).toEqual({ enabled: true, username: 'my-owner' });
  } else {
    expect(standalone.reason).toMatchObject({ code: 'invalid-input' });
    expect(team.status).toBe('fulfilled');
    expect(f.team.ownerPasswordSignIn(owner)).toEqual({ enabled: false, username: 'owner' });
  }
});

it('preserves the chosen username and standalone switch when Team settings updates the password', async () => {
  const f = teamFixture();
  await f.team.ownerPasswordSignInSet(owner, { enabled: true, username: 'my-owner', password });
  const next = 'replacement-owner-password-1';
  await f.team.setOwnerPassword(owner, next, password);
  expect(f.team.ownerPasswordSignIn(owner)).toEqual({ enabled: true, username: 'my-owner' });
  const host = await memberDeviceHost(f);
  await expect(signIn(f, host, deviceEncryption(f), { attempt: next })).resolves.toMatchObject({
    ok: true,
  });
  await expect(signIn(f, host, deviceEncryption(f))).resolves.toEqual({
    ok: false,
    code: 'credentials-invalid',
  });
});

it('reuses an existing Owner credential and keeps standalone configuration Owner-only', async () => {
  const f = teamFixture();
  await f.team.setOwnerPassword(owner, password);
  await f.team.setMode(owner, true);
  const member = await f.team.createMember(owner, 'member', 'Member');
  const memberContext = humanContext(member.member.humanId);
  await f.team.changePassword(memberContext, member.initialPassword, 'member-password-1');
  const other = f.methods(memberContext);
  expect(await other.ownerPasswordSignIn({})).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  expect(await other.ownerPasswordSignInSet({ enabled: true })).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  await f.team.setMode(owner, false);
  expect(await f.methods(owner).ownerPasswordSignInSet({ enabled: true })).toEqual({
    ok: true,
    value: { enabled: true, username: 'owner' },
  });
  const host = await memberDeviceHost(f);
  expect(await signIn(f, host, deviceEncryption(f), { username: 'owner' })).toMatchObject({
    ok: true,
  });
});

it('uses the same failure and account/source limits for missing and wrong Owner credentials', async () => {
  const f = teamFixture();
  await f.methods(owner).ownerPasswordSignInSet({ enabled: true, username: 'my-owner', password });
  const targetHost = await memberDeviceHost(f);
  const wrong = { ok: false, code: 'credentials-invalid' };
  expect(await signIn(f, targetHost, deviceEncryption(f), { fingerprint: 'different' })).toEqual({
    ok: false,
    code: 'fingerprint-mismatch',
  });
  for (const username of ['my-owner', 'no-such-user']) {
    for (let attempt = 0; attempt < 5; attempt++)
      expect(
        await signIn(f, targetHost, deviceEncryption(f), { username, attempt: 'wrong' }),
      ).toEqual(wrong);
    expect(
      await signIn(f, targetHost, deviceEncryption(f), { username, attempt: 'wrong' }),
    ).toEqual({
      ok: false,
      code: 'rate-limited',
      retryAfterSeconds: 60,
    });
  }
  for (let index = 0; index < 10; index++)
    expect(
      await signIn(f, targetHost, deviceEncryption(f), { username: `unlisted-${index}` }),
    ).toEqual(wrong);
  expect(await signIn(f, targetHost, deviceEncryption(f), { username: 'another-user' })).toEqual({
    ok: false,
    code: 'rate-limited',
    retryAfterSeconds: 60,
  });
  expect(f.pairing.list()).toEqual([]);
}, 30_000);
