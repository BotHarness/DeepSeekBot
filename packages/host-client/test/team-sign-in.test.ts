import { randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { HostCarrier, HostRequest } from '@botharness/host-protocol/carrier';
import { noiseFingerprint, noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { prepareTeamSignIn } from '../src/team-sign-in';
import type { SavedHost } from '../src/hosts';

const publicKey = noisePublicKey(randomBytes(32));
const fingerprint = noiseFingerprint(publicKey);
const invitation = {
  v: 1,
  host: { id: 'team', name: 'Team', fingerprint },
  routes: ['https://team.example'],
  username: 'bob',
  expiresAt: '2030-01-01T00:00:00.000Z',
};
const link = (value = invitation) =>
  `deepseekbot://team?i=${Buffer.from(JSON.stringify(value)).toString('base64url')}`;
function setup(mustChangePassword = true) {
  let previous: SavedHost | undefined;
  const request = vi.fn(async (url: string, _input: HostRequest) => ({
    status: 200,
    text: async () =>
      JSON.stringify(
        url.endsWith('/channel')
          ? {
              host: invitation.host,
              encryption: { publicKey: Buffer.from(publicKey).toString('hex'), fingerprint },
            }
          : url.endsWith('/device-sign-in')
            ? {
                host: invitation.host,
                deviceId: 'device',
                credential: `member.${'a'.repeat(43)}`,
                humanId: 'bob-id',
                displayName: 'Bob',
                mustChangePassword,
              }
            : {},
      ),
  }));
  const carrier: HostCarrier = {
    request,
    randomBytes: () => randomBytes(32),
    openSocket() {
      throw new Error('unexpected-socket');
    },
  };
  const commit = vi.fn(async (host: SavedHost) => {
    previous = host;
    return { ok: true as const, value: host };
  });
  const options = { carrier, previous: () => previous, commit };
  const prepare = async () => {
    const result = await prepareTeamSignIn({
      ...options,
      target: { kind: 'invitation', link: link() },
    });
    if (!result.ok) throw new Error(result.code);
    return result.value;
  };
  return {
    prepare,
    options,
    request,
    commit,
    setPrevious(host: SavedHost) {
      previous = host;
    },
  };
}

describe('shared desktop Team sign-in flow', () => {
  it('requires fingerprint confirmation, sign-in and first password change before storing a member identity', async () => {
    const test = setup();
    const flow = await test.prepare();
    expect(flow.getSnapshot().kind).toBe('fingerprint');
    expect(await flow.signIn({ password: 'initial', deviceName: 'Desktop' })).toEqual({
      ok: false,
      code: 'flow-step-invalid',
    });
    expect(test.request).not.toHaveBeenCalled();
    expect(flow.confirmFingerprint('wrong')).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(flow.confirmFingerprint(fingerprint).ok).toBe(true);
    expect((await flow.signIn({ password: 'initial', deviceName: 'Desktop' })).ok).toBe(true);
    expect(flow.getSnapshot().kind).toBe('password-change');
    expect(await flow.complete()).toEqual({ ok: false, code: 'flow-step-invalid' });
    expect(test.commit).not.toHaveBeenCalled();
    expect(
      (await flow.changePassword({ current: 'initial', next: 'new-secure-password' })).ok,
    ).toBe(true);
    const result = await flow.complete();
    expect(result).toMatchObject({
      ok: true,
      value: { member: { humanId: 'bob-id', username: 'bob', mustChangePassword: false } },
    });
    expect(flow.getSnapshot()).toMatchObject({ kind: 'complete', member: { humanId: 'bob-id' } });
    expect(test.commit).toHaveBeenCalledTimes(1);
    expect(test.request.mock.calls.filter(([url]) => url.endsWith('/channel'))).toHaveLength(1);
    expect(JSON.stringify(flow.getSnapshot())).not.toContain('member.');
  });
  it('prepares address and username sign-in without sending a password during discovery', async () => {
    const test = setup(false);
    const result = await prepareTeamSignIn({
      ...test.options,
      target: { kind: 'address', route: invitation.routes[0]!, username: 'bob' },
    });
    expect(result.ok).toBe(true);
    expect(test.request.mock.calls).toHaveLength(1);
    expect(test.request.mock.calls[0]?.[1].method).toBe('GET');
    if (!result.ok) return;
    expect(result.value.getSnapshot()).toEqual({
      kind: 'fingerprint',
      host: invitation.host,
      username: 'bob',
    });
  });
  it('refuses a changed pinned Host before any request', async () => {
    const test = setup();
    test.setPrevious({
      hostId: 'team',
      hostName: 'Team',
      routes: invitation.routes,
      deviceId: 'old',
      credential: 'owner',
      encryption: {
        protocol: 'connect-noise-xk-v1',
        hostKey: '01'.repeat(32),
        deviceKey: '02'.repeat(32),
      },
    });
    const result = await prepareTeamSignIn({
      ...test.options,
      target: { kind: 'invitation', link: link() },
    });
    expect(result).toEqual({ ok: false, code: 'fingerprint-mismatch' });
    expect(test.request).not.toHaveBeenCalled();
  });
  it('checks identity replacement again immediately before commit', async () => {
    const test = setup(false);
    const flow = await test.prepare();
    flow.confirmFingerprint(fingerprint);
    await flow.signIn({ password: 'password', deviceName: 'Desktop' });
    test.setPrevious({
      hostId: 'team',
      hostName: 'Team',
      routes: invitation.routes,
      credential: 'owner',
      deviceId: 'old',
    });
    expect(await flow.complete()).toEqual({ ok: false, code: 'identity-switch-required' });
    expect(test.commit).not.toHaveBeenCalled();
    expect((await flow.complete(true)).ok).toBe(true);
  });
  it('keeps a failed password change gated and retryable', async () => {
    const test = setup();
    const flow = await test.prepare();
    flow.confirmFingerprint(fingerprint);
    await flow.signIn({ password: 'initial', deviceName: 'Desktop' });
    test.request.mockResolvedValueOnce({
      status: 400,
      text: async () => JSON.stringify({ code: 'password-weak' }),
    });
    expect(await flow.changePassword({ current: 'initial', next: 'weak' })).toEqual({
      ok: false,
      code: 'password-weak',
    });
    expect(flow.getSnapshot().kind).toBe('password-change');
    expect(test.commit).not.toHaveBeenCalled();
    await flow.cancel();
  });
  it('revokes an uncommitted grant on cancel and cannot resume it', async () => {
    const test = setup(false);
    const flow = await test.prepare();
    flow.confirmFingerprint(fingerprint);
    await flow.signIn({ password: 'password', deviceName: 'Desktop' });
    await flow.cancel();
    expect(flow.getSnapshot()).toEqual({ kind: 'cancelled' });
    expect(await flow.complete()).toEqual({ ok: false, code: 'request-cancelled' });
    expect(test.commit).not.toHaveBeenCalled();
    expect(test.request.mock.calls.some(([url]) => url.endsWith('/unpair'))).toBe(true);
  });
  it('waits for an in-progress save before cancelling a committed identity', async () => {
    const test = setup(false);
    let release: (() => void) | undefined;
    const waiting = new Promise<void>((resolve) => {
      release = resolve;
    });
    const prepared = await prepareTeamSignIn({
      ...test.options,
      target: { kind: 'invitation', link: link() },
      commit: async (host) => {
        await waiting;
        return { ok: true, value: host };
      },
    });
    if (!prepared.ok) throw new Error(prepared.code);
    const flow = prepared.value;
    flow.confirmFingerprint(fingerprint);
    await flow.signIn({ password: 'password', deviceName: 'Desktop' });
    const saved = flow.complete();
    const cancelled = flow.cancel();
    release?.();
    expect((await saved).ok).toBe(true);
    await cancelled;
    expect(flow.getSnapshot().kind).toBe('complete');
    expect(test.request.mock.calls.some(([url]) => url.endsWith('/unpair'))).toBe(false);
  });
  it('cancels through the supplied abort signal and revokes a pending grant', async () => {
    const test = setup(false);
    const abort = new AbortController();
    const prepared = await prepareTeamSignIn({
      ...test.options,
      target: { kind: 'invitation', link: link() },
      signal: abort.signal,
    });
    if (!prepared.ok) throw new Error(prepared.code);
    const flow = prepared.value;
    flow.confirmFingerprint(fingerprint);
    await flow.signIn({ password: 'password', deviceName: 'Desktop' });
    abort.abort();
    await flow.cancel();
    expect(flow.getSnapshot().kind).toBe('cancelled');
    expect(test.commit).not.toHaveBeenCalled();
  });
  it('retains a sign-in refusal and rate-limit delay without saving a grant', async () => {
    const test = setup();
    const flow = await test.prepare();
    flow.confirmFingerprint(fingerprint);
    test.request.mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify({
          host: invitation.host,
          encryption: { publicKey: Buffer.from(publicKey).toString('hex'), fingerprint },
        }),
    });
    test.request.mockResolvedValueOnce({
      status: 429,
      text: async () => JSON.stringify({ code: 'rate-limited', retryAfterSeconds: 30 }),
    });
    expect(await flow.signIn({ password: 'bad-password', deviceName: 'Desktop' })).toEqual({
      ok: false,
      code: 'rate-limited',
      retryAfterSeconds: 30,
    });
    expect(flow.getSnapshot().kind).toBe('sign-in');
    expect(test.commit).not.toHaveBeenCalled();
    await flow.cancel();
  });
  it('leaves an unsuccessful save retryable without repeating sign-in', async () => {
    const test = setup(false);
    test.commit.mockRejectedValueOnce(new Error('disk-full'));
    const flow = await test.prepare();
    flow.confirmFingerprint(fingerprint);
    await flow.signIn({ password: 'password', deviceName: 'Desktop' });
    expect(await flow.complete()).toEqual({ ok: false, code: 'storage-failed' });
    expect(flow.getSnapshot().kind).toBe('identity-confirmation');
    expect((await flow.complete()).ok).toBe(true);
    expect(test.request.mock.calls.filter(([url]) => url.endsWith('/device-sign-in'))).toHaveLength(
      1,
    );
  });
  it('rejects expired invitations and insecure manual addresses', async () => {
    const test = setup();
    expect(
      await prepareTeamSignIn({
        ...test.options,
        target: { kind: 'invitation', link: link({ ...invitation, expiresAt: '2000-01-01' }) },
      }),
    ).toEqual({ ok: false, code: 'invitation-expired' });
    expect(
      await prepareTeamSignIn({
        ...test.options,
        target: { kind: 'address', route: 'http://team.example', username: 'bob' },
      }),
    ).toEqual({ ok: false, code: 'insecure-transport' });
    expect(test.request).not.toHaveBeenCalled();
  });
});

describe('signInAgainInvitation', () => {
  const saved: SavedHost = {
    hostId: 'team',
    hostName: 'Team',
    routes: ['http://192.168.0.2:3080', 'https://team.example'],
    deviceId: 'grant',
    credential: `member.${'a'.repeat(43)}`,
    member: {
      humanId: 'bob',
      displayName: 'Bob',
      username: 'bob',
      fingerprint,
      mustChangePassword: false,
    },
  };
  it('rebuilds a sign-in for the saved member over its HTTPS routes only', async () => {
    const { signInAgainInvitation } = await import('../src/team-client');
    expect(signInAgainInvitation(saved, Date.parse('2030-01-01T00:00:00Z'))).toEqual({
      v: 1,
      host: { id: 'team', name: 'Team', fingerprint },
      routes: ['https://team.example'],
      username: 'bob',
      expiresAt: '2030-01-01T00:10:00.000Z',
    });
  });
  it('needs a known username and an HTTPS route', async () => {
    const { signInAgainInvitation } = await import('../src/team-client');
    expect(
      signInAgainInvitation({ ...saved, member: { ...saved.member!, username: '' } }),
    ).toBeUndefined();
    expect(
      signInAgainInvitation({ ...saved, routes: ['http://192.168.0.2:3080'] }),
    ).toBeUndefined();
    const { member: _, ...owner } = saved;
    expect(signInAgainInvitation(owner)).toBeUndefined();
  });
});
