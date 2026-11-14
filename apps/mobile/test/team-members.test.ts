import { beforeEach, describe, expect, it, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { parseTeamInvitation, type TeamInvitation } from '../src/host/team-invitation';
import {
  changeTeamDevicePassword,
  signInTeamDevice,
  memberPairingOffer,
} from '../src/host/team-client';
import {
  memberPasswordGate,
  prepareMemberIdentity,
  identitySwitchRequired,
} from '../src/host/member-identity';
import { parseSavedHosts, withHost, type SavedHost } from '../src/host/hosts';
import type { HostCarrier } from '../src/host/carrier';
import { noiseFingerprint, noisePublicKey } from '../../../packages/core/src/devices/noise/xk';

const secure = new Map<string, string>();
vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'after-first-unlock',
  getItemAsync: async (key: string) => secure.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    secure.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    secure.delete(key);
  },
}));
const { saveHosts, loadSavedHosts } = await import('../src/host/saved-host');
beforeEach(() => secure.clear());
const key = noisePublicKey(randomBytes(32));
const fingerprint = noiseFingerprint(key);
const invitation: TeamInvitation = {
  v: 1,
  host: { id: 'team-host', name: 'Team', fingerprint },
  routes: ['https://team.example'],
  username: 'bob',
  expiresAt: '2030-01-01T00:00:00.000Z',
};
const link = (input: unknown) =>
  `deepseekbot://team?i=${Buffer.from(JSON.stringify(input)).toString('base64url')}`;
const saved = (hostId = 'team-host', humanId = 'bob-id'): SavedHost => ({
  hostId,
  hostName: 'Team',
  routes: ['https://team.example'],
  deviceId: `device-${humanId}`,
  credential: `member.${'a'.repeat(43)}`,
  member: { humanId, displayName: humanId, username: 'bob', mustChangePassword: true, fingerprint },
});
function client(
  reply: { status: number; body: unknown } = {
    status: 200,
    body: {
      deviceId: 'device-bob-id',
      credential: `member.${'a'.repeat(43)}`,
      humanId: 'bob-id',
      displayName: 'Bob',
      mustChangePassword: true,
      host: invitation.host,
    },
  },
) {
  const request = vi.fn(async (url: string) => {
    if (url.endsWith('/channel'))
      return {
        status: 200,
        text: async () =>
          JSON.stringify({
            host: invitation.host,
            encryption: { publicKey: Buffer.from(key).toString('hex'), fingerprint },
          }),
      };
    return { status: reply.status, text: async () => JSON.stringify(reply.body) };
  });
  const carrier: HostCarrier = {
    request,
    randomBytes: () => randomBytes(32),
    openSocket: () => {
      throw new Error('unexpected-socket');
    },
  };
  return { carrier, request };
}

describe('Team invitation parser', () => {
  it('decodes a Unicode Host identity and normalizes the member entry URL to its origin', () => {
    const value = {
      ...invitation,
      host: { ...invitation.host, name: '团队电脑' },
      routes: ['https://team.example/botharness-device/team/'],
    };
    expect(parseTeamInvitation(link(value), 0)).toEqual({
      ok: true,
      value: { ...value, routes: ['https://team.example'] },
    });
  });
  it.each([
    '',
    'https://team.example',
    'deepseekbot://team?i=***',
    'deepseekbot://pair?i=e30',
    'deepseekbot://team?i=e30&i=e30',
    `deepseekbot://team?i=${'a'.repeat(17_000)}`,
  ])('rejects malformed input %s', (value) => {
    expect(parseTeamInvitation(value)).toMatchObject({ ok: false, code: 'invitation-invalid' });
  });
  it('distinguishes unsupported versions and expiry, including the exact deadline', () => {
    expect(parseTeamInvitation(link({ ...invitation, v: 2 }), 0)).toEqual({
      ok: false,
      code: 'invitation-version-unsupported',
    });
    expect(parseTeamInvitation(link(invitation), Date.parse(invitation.expiresAt))).toEqual({
      ok: false,
      code: 'invitation-expired',
    });
  });
  it.each([
    'http://192.168.1.2:3080',
    'https://localhost',
    'https://127.0.0.1',
    'https://[::ffff:127.0.0.1]',
    'https://user:password@team.example',
    'https://team.example?secret=1',
  ])('refuses unsafe invitation routes %s', (route) => {
    expect(parseTeamInvitation(link({ ...invitation, routes: [route] }), 0)).toEqual({
      ok: false,
      code: 'invitation-invalid',
    });
  });
});

describe('member identity persistence', () => {
  it('keeps one secure identity per Host and requires confirmation to replace another member', async () => {
    const bob = saved();
    const carol = saved('team-host', 'carol-id');
    const other = saved('other-host');
    const state = withHost(withHost({ hosts: [] }, bob), other);
    expect(() => withHost(state, carol)).toThrow('identity-switch-required');
    expect(prepareMemberIdentity(state, carol)).toEqual({
      ok: false,
      code: 'identity-switch-required',
    });
    expect(prepareMemberIdentity(state, carol, true)).toEqual({ ok: true, value: carol });
    await saveHosts(withHost(state, carol, true));
    expect(await loadSavedHosts()).toEqual({ hosts: [other, carol], current: 'team-host' });
    expect(secure.get('deepseekbot.hosts.v3')).toContain(carol.credential);
    expect(memberPasswordGate(carol)).toMatchObject({ kind: 'password-change-required' });
    expect(
      memberPasswordGate({ ...carol, member: { ...carol.member!, mustChangePassword: false } }),
    ).toMatchObject({ kind: 'ready' });
    expect(memberPasswordGate(undefined)).toEqual({ kind: 'loading' });
    expect(memberPasswordGate(null)).toEqual({ kind: 'signed-out' });
  });
  it('does not ask to replace another Host and permits a confirmed Owner switch with the same pinned Host key', () => {
    const member = saved();
    expect(identitySwitchRequired(member, saved('other-host', 'carol-id'))).toBe(false);
    const { member: _member, ...owner } = member;
    owner.credential = 'owner-device';
    const host: SavedHost = {
      ...owner,
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: Buffer.from(key).toString('hex'),
        deviceKey: 'a'.repeat(64),
      },
    };
    expect(() => withHost({ hosts: [member] }, host)).toThrow('identity-switch-required');
    expect(withHost({ hosts: [member] }, host, true).hosts).toEqual([host]);
  });
  it('pins a Host across identity replacement and drops invalid member records on hydration', () => {
    const bob = saved();
    const wrong = {
      ...saved('team-host', 'carol-id'),
      member: { ...bob.member!, fingerprint: 'b'.repeat(64) },
    };
    expect(() => withHost({ hosts: [bob] }, wrong, true)).toThrow('fingerprint-mismatch');
    expect(parseSavedHosts(JSON.stringify({ hosts: [{ ...bob, member: undefined }] }))).toEqual({
      hosts: [],
    });
    expect(
      parseSavedHosts(JSON.stringify({ hosts: [bob, { ...bob, deviceId: 'replacement' }] })).hosts,
    ).toHaveLength(1);
  });
});

describe('Team device client', () => {
  it('verifies identity before sending a password and returns a persistable forced-change identity', async () => {
    const { carrier, request } = client();
    const result = await signInTeamDevice({
      carrier,
      invitation,
      password: 'one-time-password',
      deviceName: 'Phone',
      now: 0,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        hostId: 'team-host',
        member: { humanId: 'bob-id', mustChangePassword: true, fingerprint },
      },
    });
    expect(request.mock.calls.map((call) => call[0])).toEqual([
      'https://team.example/botharness-device/channel',
      'https://team.example/botharness-device/team/device-sign-in',
    ]);
  });
  it('tries another invited route after network failure and submits the password only on a verified route', async () => {
    const { carrier, request } = client();
    const submitted: string[] = [];
    const raw = carrier.request;
    carrier.request = async (url, init) => {
      if (url.startsWith('https://unreachable.ts.net')) throw new TypeError('network');
      if (url.endsWith('/device-sign-in')) submitted.push(url);
      return raw(url, init);
    };
    const result = await signInTeamDevice({
      carrier,
      invitation: { ...invitation, routes: ['https://unreachable.ts.net', ...invitation.routes] },
      password: 'secret',
      deviceName: 'Phone',
      now: 0,
    });
    expect(result.ok).toBe(true);
    expect(submitted).toEqual(['https://team.example/botharness-device/team/device-sign-in']);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it('sends no password when discovery changes Host identity or fingerprint', async () => {
    const { carrier, request } = client();
    const result = await signInTeamDevice({
      carrier,
      invitation: { ...invitation, host: { ...invitation.host, fingerprint: 'b'.repeat(64) } },
      password: 'secret',
      deviceName: 'Phone',
      now: 0,
    });
    expect(result).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it.each([
    'credentials-invalid',
    'member-suspended',
    'team-mode-off',
    'insecure-transport',
    'fingerprint-mismatch',
  ] as const)('returns the sign-in refusal %s without copy', async (code) => {
    const { carrier } = client({
      status: 403,
      body: { code, message: 'server copy must not escape' },
    });
    expect(
      await signInTeamDevice({
        carrier,
        invitation,
        password: 'secret',
        deviceName: 'Phone',
        now: 0,
      }),
    ).toEqual({ ok: false, code });
  });
  it('preserves retry time, rejects an altered sign-in identity, and never follows a route outside the invitation', async () => {
    const limited = client({ status: 429, body: { code: 'rate-limited', retryAfterSeconds: 42 } });
    expect(
      await signInTeamDevice({
        carrier: limited.carrier,
        invitation,
        password: 'secret',
        deviceName: 'Phone',
        now: 0,
      }),
    ).toEqual({ ok: false, code: 'rate-limited', retryAfterSeconds: 42 });
    const altered = client({
      status: 200,
      body: { host: { ...invitation.host, id: 'different-host' } },
    });
    expect(
      await signInTeamDevice({
        carrier: altered.carrier,
        invitation,
        password: 'secret',
        deviceName: 'Phone',
        now: 0,
      }),
    ).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(
      await signInTeamDevice({
        carrier: limited.carrier,
        invitation,
        password: 'secret',
        deviceName: 'Phone',
        route: 'https://attacker.example',
        now: 0,
      }),
    ).toEqual({ ok: false, code: 'insecure-transport' });
  });
  it('keeps the password gate after a refusal and returns a new ready identity only on success', async () => {
    const host = saved();
    const refused = client({ status: 409, body: { code: 'password-reused' } });
    expect(
      await changeTeamDevicePassword({
        carrier: refused.carrier,
        host,
        current: 'initial',
        next: 'reused',
      }),
    ).toEqual({ ok: false, code: 'password-reused' });
    expect(host.member?.mustChangePassword).toBe(true);
    const accepted = client({ status: 200, body: {} });
    const result = await changeTeamDevicePassword({
      carrier: accepted.carrier,
      host,
      current: 'initial',
      next: 'new-password',
    });
    expect(result).toMatchObject({ ok: true, value: { member: { mustChangePassword: false } } });
  });
  it('gets a typed self-pairing offer through the Host client bridge', async () => {
    const offer = {
      link: 'deepseekbot://pair?p=abc',
      qr: { size: 9, path: 'M0 0h1v1z' },
      expiresAt: '2030-01-01T00:00:00Z',
      receipt: 'receipt',
    };
    const call = vi.fn(async () => offer);
    expect(await memberPairingOffer({ call })).toEqual({ ok: true, value: offer });
    expect(call).toHaveBeenCalledWith('memberPairingOffer');
  });
});
