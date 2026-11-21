import { randomBytes } from 'node:crypto';
import { encryptedCarrier, openNoiseSocket } from '@botharness/host-client/encrypted-carrier';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { z } from 'zod';
import { OWNER_HUMAN_CONTEXT as owner, humanContext } from '../src/humans/context.js';
import { cleanup, memberDeviceHost, teamFixture } from './team-mode-fixtures.js';

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
        if (frame['type'] !== 'owner-signed-in') return;
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
        type: 'owner-sign-in',
        input: { username, password: attempt, deviceName: 'Desktop', fingerprint },
      };
      socket.send(request);
      if (repeat) socket.send(request);
    }, reject);
  });
}

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
