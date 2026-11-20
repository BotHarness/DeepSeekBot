import { parsePairingLink, redeemPairing, pairHost } from '@botharness/host-client/pairing';
import { memberRoutes } from '../src/team/member-urls.js';
import { WebSocket } from 'ws';
import { TEAM_PATH } from '../src/team/http.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { closes, enabledFixture, memberDeviceHost, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('member devices', { timeout: 60_000 }, () => {
  it('uses the same eligible routes for status, invitations and member pairing offers', async () => {
    let trusted = false;
    const f = await enabledFixture({
      routes: async () =>
        memberRoutes('http://127.0.0.1:3080', {
          tailscale: 'running',
          serveCommand: '',
          routes: [
            {
              url: 'https://fixture.tail.ts.net',
              kind: 'tailscale',
              ready: true,
              memberSignIn: trusted ? 'managed-tls' : 'untrusted',
            },
            { url: 'https://habcdefghijkl.deepseekbot.dev', kind: 'connect', ready: true },
            { url: 'http://192.168.0.2:3080', kind: 'lan', ready: true },
          ],
        }),
    });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    for (const enabled of [false, true, false]) {
      trusted = enabled;
      const expected = [
        ...(trusted ? ['https://fixture.tail.ts.net'] : []),
        'https://habcdefghijkl.deepseekbot.dev',
      ];
      expect(await f.methods(owner).teamMode({})).toMatchObject({
        ok: true,
        value: { memberUrls: expected.map((origin) => `${origin}${TEAM_PATH}/`) },
      });
      const invitation = await f.team.invitation(owner, f.human.humanId);
      const encoded = new URL(invitation.link).searchParams.get('i');
      expect(encoded).toBeTruthy();
      expect(JSON.parse(Buffer.from(encoded ?? '', 'base64url').toString()).routes).toEqual(
        expected,
      );
      const offer = await f.devices.pairingOffer(f.human.humanId);
      expect(parsePairingLink(offer.link)).toMatchObject({
        ok: true,
        payload: { routes: expected },
      });
    }
  });
  it('issues a secret-free invitation with member-management authority and self-pairing only for the caller', async () => {
    const f = await enabledFixture();
    const invitation = await f.team.invitation(owner, f.human.humanId);
    const payload = JSON.parse(
      Buffer.from(new URL(invitation.link).searchParams.get('i')!, 'base64url').toString(),
    );
    expect(payload).toEqual({
      v: 1,
      host: { ...f.pairing.host(), fingerprint: f.encryption.fingerprint },
      routes: ['https://host.test'],
      username: 'bob',
      expiresAt: invitation.expiresAt,
    });
    expect(invitation.qr.size).toBeGreaterThan(0);
    expect(invitation.link).not.toContain(f.initialPassword);
    expect(() => f.team.invitation(f.human, f.human.humanId)).toThrow('permission-required');
    expect(() => f.team.pairingOffer(f.human)).toThrow('password-change-required');
    expect(() => f.team.pairingOffer(owner)).toThrow('credentials-invalid');
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const offer = await f.team.pairingOffer(f.human);
    const link = JSON.parse(
      Buffer.from(new URL(offer.link).searchParams.get('p')!, 'base64url').toString(),
    );
    const redeemed = f.pairing.redeem({ offer: link.offer, name: 'Second phone' });
    expect(redeemed).toMatchObject({
      ok: true,
      humanId: f.human.humanId,
      device: { humanId: f.human.humanId, name: 'Second phone' },
    });
    expect(f.pairing.redeem({ offer: link.offer })).toEqual({ ok: false, code: 'offer-invalid' });
    expect(f.pairing.offerStatus(offer.receipt)).toMatchObject({ state: 'redeemed' });
    expect(f.pairing.list()).toEqual([]);
  });

  it('lets a manager invite a covered member while preserving the Admin target ceiling', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const manager = f.team.roles.create(owner, 'Manager', ['members.manage', 'dm.humans']);
    f.team.roles.set(owner, f.human.humanId, [manager.role.roleId]);
    const alice = await f.team.createMember(owner, 'alice', 'Alice');
    const signed = await f.team.signIn('bob', 'member-password-1', 'manager-ip');
    const result = await f.gateway.invoke({
      namespace: 'botharness',
      method: 'memberInvitation',
      args: { humanId: alice.member.humanId },
      peer: signed.peer,
    });
    const invitation = z.object({ link: z.string() }).parse(result);
    const payload = JSON.parse(
      Buffer.from(new URL(invitation.link).searchParams.get('i')!, 'base64url').toString(),
    );
    expect(payload).toMatchObject({ username: 'alice', host: { id: f.pairing.host().id } });
    f.team.roles.set(owner, alice.member.humanId, ['admin']);
    expect(() => f.team.invitation(f.human, alice.member.humanId)).toThrow('permission-required');
  });

  it('lists and revokes member phone grants through the same management commands as browser sessions', async () => {
    const f = await enabledFixture();
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const browser = await f.team.signIn('bob', 'member-password-1', 'browser-ip');
    const phone = f.team.createDeviceGrant(f.human.humanId, 'Bob phone');
    const close = vi.fn();
    f.team.attachDeviceStream(phone.deviceId, close);
    expect(f.team.memberDevices(f.human, f.human.humanId, phone.deviceId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          grantId: phone.deviceId,
          kind: 'paired-device',
          label: 'Bob phone',
          current: true,
        }),
        expect.objectContaining({ kind: 'browser', current: false }),
      ]),
    );
    await f.team.memberDeviceRevoke(owner, f.human.humanId, phone.deviceId);
    expect(close).toHaveBeenCalledOnce();
    expect(f.team.admitDevice(`Device ${phone.credential}`)).toBeUndefined();
    expect(f.team.admit(browser.token)).toBeDefined();
    expect(f.team.memberDevices(f.human, f.human.humanId)).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ grantId: phone.deviceId })]),
    );
    expect(f.pairing.list()).toEqual([]);
  });

  it('keeps ordinary Owner offers pending and refuses to turn member offers into Host relationships', async () => {
    const f = await enabledFixture();
    const key = 'ab'.repeat(32);
    const ownerOffer = f.pairing.createOffer();
    f.pairing.requestKey({ offer: ownerOffer.offer, publicKey: key });
    expect(f.pairing.redeem({ offer: ownerOffer.offer, publicKey: key })).toEqual({
      ok: false,
      code: 'device-approval-required',
    });
    expect(f.pairing.approveKey(ownerOffer.receipt, key)).toBe(true);
    const ownerDevice = f.pairing.redeem({ offer: ownerOffer.offer, publicKey: key });
    expect(ownerDevice).toMatchObject({
      ok: true,
      credential: expect.not.stringContaining('member.'),
    });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const memberOffer = f.pairing.createOffer({ humanId: f.human.humanId });
    expect(f.pairing.claimRelationshipOffer(memberOffer.offer)).toBe(false);
    f.pairing.requestKey({ offer: memberOffer.offer, publicKey: key });
    expect(f.pairing.redeem({ offer: memberOffer.offer, publicKey: key })).toMatchObject({
      ok: true,
      humanId: f.human.humanId,
      credential: expect.stringContaining('member.'),
    });
  });

  it('expires self-pairing offers and rechecks suspension and forced reset at redemption', async () => {
    let now = Date.now();
    const f = await enabledFixture({ now: () => now });
    await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
    const token = async () => {
      const offer = await f.team.pairingOffer(f.human);
      return JSON.parse(
        Buffer.from(new URL(offer.link).searchParams.get('p')!, 'base64url').toString(),
      ).offer;
    };
    const expired = await token();
    now += 10 * 60_000;
    expect(f.pairing.redeem({ offer: expired })).toEqual({ ok: false, code: 'offer-expired' });
    const reset = await token();
    await f.team.resetPassword(owner, f.human.humanId);
    expect(() => f.pairing.redeem({ offer: reset })).toThrow('password-change-required');
    const current = await f.team.resetPassword(owner, f.human.humanId);
    await f.team.changePassword(f.human, current.initialPassword, 'member-password-2');
    const suspended = await token();
    await f.team.suspend(owner, f.human.humanId);
    expect(() => f.pairing.redeem({ offer: suspended })).toThrow('member-suspended');
  });

  it.each([
    [{ fingerprint: 'wrong' }, 'fingerprint-mismatch', 403],
    [{ password: 'wrong' }, 'credentials-invalid', 401],
    [{ username: 'unknown' }, 'credentials-invalid', 401],
    [{ username: 'owner' }, 'credentials-invalid', 401],
    [{ deviceName: '' }, 'invalid-input', 400],
  ] as const)('refuses device sign-in %j as %s', async (input, code, status) => {
    const f = await enabledFixture();
    const host = await memberDeviceHost(f);
    const response = await host.signIn({ password: f.initialPassword, ...input });
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ code });
    expect(host.mintOwner).not.toHaveBeenCalled();
  });
});

it('uses the member Peer for device mux, refuses native streams and closes the socket on revocation', async () => {
  const f = await enabledFixture();
  const host = await memberDeviceHost(f);
  const signed = await (await host.signIn({ password: f.initialPassword })).json();
  const refusal = await new Promise<string>((resolve) => {
    const ws = new WebSocket(
      host.origin.replace('http:', 'ws:') + '/botharness-device/api/remote.mux',
      { headers: { authorization: `Device ${signed.credential}` } },
    );
    ws.on('unexpected-response', (_request, response) => {
      let body = '';
      response.on('data', (data) => (body += String(data)));
      response.on('end', () => {
        resolve(body);
        ws.terminate();
      });
    });
    ws.on('error', () => {});
  });
  expect(JSON.parse(refusal)).toEqual({ code: 'password-change-required' });
  await host.post(
    '/team/device-password',
    { current: f.initialPassword, next: 'member-password-1' },
    signed.credential,
  );
  const crossSite = await new Promise<number | undefined>((resolve) => {
    const ws = new WebSocket(
      host.origin.replace('http:', 'ws:') + '/botharness-device/api/remote.mux',
      { headers: { authorization: `Device ${signed.credential}`, origin: 'https://evil.example' } },
    );
    ws.on('unexpected-response', (_request, response) => {
      resolve(response.statusCode);
      ws.terminate();
    });
    ws.on('open', () => {
      resolve(101);
      ws.terminate();
    });
    ws.on('error', () => {});
  });
  expect(crossSite).toBe(403);
  const own = f.channels.createGroup(f.human, { name: 'Own device Channel', members: [] });
  const secret = f.channels.createGroup(owner, { name: 'Owner Channel', members: [] });
  const ws = new WebSocket(
    host.origin.replace('http:', 'ws:') + '/botharness-device/api/remote.mux',
    { headers: { authorization: `Device ${signed.credential}` }, origin: host.origin },
  );
  closes.push(async () => {
    ws.terminate();
  });
  const frames: unknown[] = [];
  ws.on('message', (raw) => frames.push(JSON.parse(raw.toString())));
  await new Promise<void>((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(
    JSON.stringify({
      type: 'open',
      streamId: 'own',
      endpoint: 'botharness/followChannel',
      payload: { args: { channelId: own.id, limit: 10 } },
    }),
  );
  ws.send(
    JSON.stringify({
      type: 'open',
      streamId: 'secret',
      endpoint: 'botharness/followChannel',
      payload: { args: { channelId: secret.id, limit: 10 } },
    }),
  );
  ws.send(
    JSON.stringify({
      type: 'open',
      streamId: 'native',
      endpoint: 'session/list',
      payload: { args: {} },
    }),
  );
  await vi.waitFor(() => {
    expect(frames).toContainEqual(expect.objectContaining({ type: 'item', streamId: 'own' }));
    expect(frames).toContainEqual(
      expect.objectContaining({
        type: 'error',
        streamId: 'secret',
        error: expect.objectContaining({ code: 'remote-access/denied' }),
      }),
    );
    expect(frames).toContainEqual(expect.objectContaining({ type: 'error', streamId: 'native' }));
  });
  const closed = new Promise<void>((resolve) => ws.once('close', () => resolve()));
  await f.team.revoke(signed.deviceId);
  await closed;
  expect(host.mintOwner).not.toHaveBeenCalled();
}, 60_000);

it('redeems a member self-pairing QR on Host HTTPS through the existing Noise pair protocol without Owner approval', async () => {
  const f = await enabledFixture();
  await f.team.changePassword(f.human, f.initialPassword, 'member-password-1');
  const host = await memberDeviceHost(f);
  const offer = await f.team.pairingOffer(f.human);
  const parsed = parsePairingLink(offer.link);
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.code);
  const paired = await redeemPairing({
    payload: parsed.payload,
    deviceName: 'Second phone',
    carrier: host.carrier,
    confirmFingerprint: async (fingerprint) => fingerprint === f.encryption.fingerprint,
  });
  expect(paired).toMatchObject({
    ok: true,
    host: { member: { humanId: f.human.humanId, mustChangePassword: false } },
  });
  if (!paired.ok) throw new Error(paired.code);
  expect(f.team.admitDevice(`Device ${paired.host.credential}`)?.principal).toMatchObject({
    kind: 'botharness-member',
    humanId: f.human.humanId,
  });
  expect(f.pairing.offerStatus(offer.receipt)).toMatchObject({
    state: 'redeemed',
    deviceId: paired.host.deviceId,
  });
  const another = await f.team.pairingOffer(f.human);
  const save = vi.fn(async (_host: import('@botharness/host-client/hosts').SavedHost) => {});
  expect(
    await pairHost({
      text: another.link,
      method: 'qr',
      existing: () => paired.host,
      deviceName: 'Replacement identity',
      carrier: host.carrier,
      save,
      telemetry: { pairing: () => ({ finish: () => {} }) },
    }),
  ).toEqual({ ok: true });
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ member: expect.objectContaining({ humanId: f.human.humanId }) }),
  );
  expect(f.pairing.list()).toEqual([]);
  expect(host.mintOwner).not.toHaveBeenCalled();
}, 60_000);
