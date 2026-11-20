import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { HostCarrier } from '@botharness/host-protocol/carrier';
import { noiseFingerprint, noisePublicKey } from '@botharness/host-protocol/noise/xk';
import { savedHostIdentity } from '@botharness/host-client/hosts';
import {
  createRemoteHosts,
  REMOTE_HOSTS_STORAGE_KEY,
  type HostStorage,
} from '../src/client/remote-hosts';

const key = noisePublicKey(randomBytes(32));
const fingerprint = noiseFingerprint(key);
const invitation = {
  v: 1,
  host: { id: 'team', name: 'Team', fingerprint },
  routes: ['https://team.example'],
  username: 'bob',
  expiresAt: '2030-01-01',
};
const link = `deepseekbot://team?i=${Buffer.from(JSON.stringify(invitation)).toString('base64url')}`;
function setup(enabled = true) {
  const saved = new Map<string, string>();
  const storage: HostStorage = {
    getItem: (key) => saved.get(key) ?? null,
    setItem: (key, value) => {
      saved.set(key, value);
    },
    removeItem: (key) => {
      saved.delete(key);
    },
  };
  const calls: string[] = [];
  const carrier: HostCarrier = {
    randomBytes: () => randomBytes(32),
    async request(url) {
      calls.push(url);
      return {
        status: 200,
        text: async () =>
          JSON.stringify(
            url.endsWith('/channel')
              ? {
                  host: invitation.host,
                  encryption: { publicKey: Buffer.from(key).toString('hex'), fingerprint },
                }
              : {
                  host: invitation.host,
                  humanId: 'bob-id',
                  displayName: 'Bob',
                  mustChangePassword: false,
                  deviceId: 'desktop',
                  credential: `member.${'a'.repeat(43)}`,
                },
          ),
      };
    },
    openSocket() {
      throw new Error('unexpected-socket');
    },
  };
  return { hosts: createRemoteHosts({ carrier, storage, enabled }), saved, calls };
}

describe('desktop Team sign-in adapter', () => {
  it('recognizes a Team invitation as a sign-in request without redeeming a pairing offer', async () => {
    const test = setup();
    expect(await test.hosts.pair(link, 'Desktop')).toMatchObject({
      ok: false,
      code: 'team-sign-in-required',
      invitation: { username: 'bob' },
    });
    expect(test.calls).toEqual([]);
  });
  it('stores and exposes the signed-in member only after completing the flow', async () => {
    const test = setup();
    const prepared = await test.hosts.teamSignIn({ kind: 'invitation', link });
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    const flow = prepared.value;
    flow.confirmFingerprint(fingerprint);
    expect((await flow.signIn({ password: 'password', deviceName: 'Desktop' })).ok).toBe(true);
    expect(test.saved.get(REMOTE_HOSTS_STORAGE_KEY)).toBeUndefined();
    const result = await flow.complete();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(savedHostIdentity(result.value)).toEqual({
      kind: 'member',
      humanId: 'bob-id',
      username: 'bob',
    });
    expect(JSON.parse(test.saved.get(REMOTE_HOSTS_STORAGE_KEY)!)[0].member).toMatchObject({
      humanId: 'bob-id',
      username: 'bob',
    });
    expect(test.hosts.getSnapshot().hosts[0]?.host.member?.humanId).toBe('bob-id');
    expect(test.calls.some((url) => /relationship|\/pair$/u.test(url))).toBe(false);
  });
  it('refuses the local Host before password sign-in', async () => {
    const test = setup();
    expect(await test.hosts.teamSignIn({ kind: 'invitation', link }, 'team')).toEqual({
      ok: false,
      code: 'this-host',
    });
    expect(test.calls).toEqual([]);
  });
  it('refuses the adapter from a non-Owner local client', async () => {
    const test = setup(false);
    expect(await test.hosts.teamSignIn({ kind: 'invitation', link })).toEqual({
      ok: false,
      code: 'owner-required',
    });
    expect(test.calls).toEqual([]);
  });
});
