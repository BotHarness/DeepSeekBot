import { describe, expect, it, vi } from 'vitest';
import { createAccountActionFixture } from '../src/host/account-action-fixture';
import { createConnectAccount, type ConnectRuntime } from '../src/host/connect-account';
import { removeAccountConnections } from '../src/host/account-connections';
import { parseSavedHosts, withHost, type SavedHosts } from '../src/host/hosts';
import type { AccountOwner } from '../src/host/account-owner';

const owner: AccountOwner = {
  issuer: 'https://api.workos.com',
  relay: 'https://fixture.invalid',
  clientId: 'client_fixture',
  subject: 'user_a',
};
const saved = (hostId: string, accountOwner?: AccountOwner) => ({
  hostId,
  hostName: hostId,
  routes: ['https://manual.ts.net'],
  deviceId: hostId,
  credential: 'fixture',
  ...(accountOwner ? { accountOwner } : {}),
});

function runtimeHarness() {
  let text: string | null = JSON.stringify({
    clientId: owner.clientId,
    refreshToken: 'fixture-refresh',
    subject: owner.subject,
    sessionId: 'a',
    email: 'fixture@example.invalid',
  });
  const runtime: ConnectRuntime = {
    read: vi.fn(async () => text),
    write: vi.fn(async (value) => {
      text = value;
    }),
    random: () => 'unused',
    challenge: async (value) => value,
    authorize: async () => null,
    now: () => 0,
    request: vi.fn(async (_url, init) =>
      init?.method === 'DELETE'
        ? Response.json({ deleted: true })
        : Response.json({ access_token: 'fixture-access', user: { id: owner.subject } }),
    ),
  };
  const removeConnections = vi.fn(async () => {});
  const open = () =>
    createConnectAccount({
      runtime,
      removeConnections,
      relay: owner.relay,
      redirectUri: 'fixture:/callback',
    });
  return {
    runtime,
    removeConnections,
    open,
    text: () => text,
    replace: (value: string) => {
      text = value;
    },
  };
}

describe('confirmed account action effects', () => {
  it.each(['signOut', 'deleteAccount'] as const)(
    '%s removes only proven account pairings',
    async (action) => {
      const fixture = createAccountActionFixture();
      const key = (await fixture.account.actionKey())!;
      expect(await fixture.account[action](key)).toEqual({ ok: true, value: undefined });
      expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
        signedIn: false,
        saved: ['manual', 'legacy', 'other'],
        disconnects: 1,
        cleared: ['owned'],
        deletes: action === 'signOut' ? 0 : 1,
        remoteDeleted: action === 'deleteAccount',
      });
    },
  );

  it.each(['local-write', 'session-write'] as const)(
    'recovers %s failure without repeating a completed remote delete',
    async (scenario) => {
      const fixture = createAccountActionFixture(scenario);
      const key = (await fixture.account.actionKey())!;
      expect(await fixture.account.deleteAccount(key)).toEqual({
        ok: false,
        code: 'account-cleanup-failed',
      });
      expect(JSON.parse(fixture.getSnapshot())).toMatchObject({ signedIn: true, deletes: 1 });
      expect(await fixture.account.signIn()).toEqual({ ok: false, code: 'account-action-pending' });
      expect(await fixture.account.signOut(key)).toEqual({
        ok: false,
        code: 'account-action-pending',
      });
      expect(await fixture.account.deleteAccount(key)).toEqual({ ok: true, value: undefined });
      expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
        signedIn: false,
        deletes: 1,
        saved: ['manual', 'legacy', 'other'],
      });
    },
  );

  it('reports partial remote deletion and retries only with the same account', async () => {
    const fixture = createAccountActionFixture('delete-partial');
    const key = (await fixture.account.actionKey())!;
    expect(await fixture.account.deleteAccount(key)).toEqual({
      ok: false,
      code: 'account-deletion-uncertain',
    });
    expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
      signedIn: true,
      remoteDeleted: true,
      pairingWrites: 0,
      saved: ['owned', 'manual', 'legacy', 'other'],
    });
    expect(await fixture.account.deleteAccount(key)).toEqual({ ok: true, value: undefined });
    expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
      deletes: 2,
      saved: ['manual', 'legacy', 'other'],
    });
  });

  it('retains an unfinished deletion after refresh expires rather than claiming rollback or signing in another user', async () => {
    const fixture = createAccountActionFixture('expired-retry');
    const key = (await fixture.account.actionKey())!;
    await fixture.account.deleteAccount(key);
    expect(await fixture.account.deleteAccount(key)).toEqual({
      ok: false,
      code: 'account-deletion-uncertain',
    });
    expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
      signedIn: true,
      deletes: 1,
      pairingWrites: 0,
    });
    expect(await fixture.account.signIn()).toEqual({ ok: false, code: 'account-action-pending' });
  });

  it('does not make requests or writes to prepare a confirmation; stale confirmation cannot act on a new session', async () => {
    const h = runtimeHarness(),
      account = h.open();
    const key = (await account.actionKey())!;
    expect(h.runtime.write).not.toHaveBeenCalled();
    expect(h.runtime.request).not.toHaveBeenCalled();
    h.replace(JSON.stringify({ ...JSON.parse(h.text()!), sessionId: 'b', subject: 'user_b' }));
    expect(await account.signOut(key)).toEqual({ ok: false, code: 'account-changed' });
    expect(await account.deleteAccount(key)).toEqual({ ok: false, code: 'account-changed' });
    expect(h.runtime.write).not.toHaveBeenCalled();
    expect(h.runtime.request).not.toHaveBeenCalled();
    expect(h.removeConnections).not.toHaveBeenCalled();
  });

  it('serializes duplicate actions and prevents saving an in-flight pairing after sign-out', async () => {
    const h = runtimeHarness(),
      account = h.open();
    const key = (await account.actionKey())!;
    const results = await Promise.all([account.signOut(key), account.signOut(key)]);
    expect(results).toEqual([
      { ok: true, value: undefined },
      { ok: false, code: 'account-changed' },
    ]);
    expect(h.removeConnections).toHaveBeenCalledTimes(1);
    expect(h.runtime.request).not.toHaveBeenCalled();
    const save = vi.fn();
    await expect(account.savePairing(key, save)).rejects.toThrow('account-changed');
    expect(save).not.toHaveBeenCalled();
  });

  it('resumes a persisted delete-complete marker after restart without refreshing or deleting again', async () => {
    const h = runtimeHarness(),
      first = h.open();
    const key = (await first.actionKey())!;
    h.removeConnections.mockRejectedValueOnce(new Error('storage unavailable'));
    expect(await first.deleteAccount(key)).toEqual({ ok: false, code: 'account-cleanup-failed' });
    expect(JSON.parse(h.text()!).action).toBe('delete-complete');
    vi.mocked(h.runtime.request).mockClear();
    expect(await h.open().deleteAccount(key)).toEqual({ ok: true, value: undefined });
    expect(h.runtime.request).not.toHaveBeenCalled();
  });

  it('preserves unknown-source legacy pairings on sign-out without contacting WorkOS', async () => {
    const h = runtimeHarness();
    h.replace(JSON.stringify({ clientId: owner.clientId, refreshToken: 'legacy' }));
    const account = h.open();
    expect(await account.signOut((await account.actionKey())!)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(h.removeConnections).not.toHaveBeenCalled();
    expect(h.runtime.request).not.toHaveBeenCalled();
  });

  it('does not disconnect or clear pairings if persistence rejects the removal', async () => {
    const adopt = vi.fn(),
      clearLocal = vi.fn();
    await expect(
      removeAccountConnections({
        owner,
        state: { hosts: [saved('owned', owner)] },
        persist: async () => {
          throw new Error('disk');
        },
        adopt,
        clearLocal,
      }),
    ).rejects.toThrow('disk');
    expect(adopt).not.toHaveBeenCalled();
    expect(clearLocal).not.toHaveBeenCalled();
  });

  it('journals cleanup across failure/reload and preserves other/manual/legacy connections and current selection', async () => {
    let state: SavedHosts = {
      hosts: [
        saved('a', owner),
        saved('b', { ...owner, subject: 'user_b' }),
        saved('relay', { ...owner, relay: 'https://other.invalid' }),
        saved('manual'),
      ],
      current: 'manual',
    };
    let stored = JSON.stringify(state);
    const clearLocal = vi.fn(async () => {});
    clearLocal.mockRejectedValueOnce(new Error('cache unavailable'));
    const remove = () =>
      removeAccountConnections({
        owner,
        state,
        persist: async (next) => {
          stored = JSON.stringify(next);
        },
        adopt: (next) => {
          state = next;
        },
        clearLocal,
      });
    await expect(remove()).rejects.toThrow('cache unavailable');
    state = parseSavedHosts(stored);
    expect(state.hosts.map((host) => host.hostId)).toEqual(['b', 'relay', 'manual']);
    expect(state.current).toBe('manual');
    expect(state.pendingAccountRemoval?.map((host) => host.hostId)).toEqual(['a']);
    state = withHost(state, saved('additional'));
    await remove();
    expect(parseSavedHosts(stored).pendingAccountRemoval).toBeUndefined();
    expect(clearLocal).toHaveBeenCalledTimes(2);
  });

  it('does not resurrect legacy single-host storage while an empty-state cleanup is pending', () => {
    const record = saved('owned', owner);
    expect(
      parseSavedHosts(
        JSON.stringify({ hosts: [], pendingAccountRemoval: [record] }),
        JSON.stringify(record),
      ),
    ).toEqual({ hosts: [], pendingAccountRemoval: [record] });
  });
  it('keeps the session usable after an explicit pre-deletion service refusal', async () => {
    const h = runtimeHarness(),
      account = h.open();
    vi.mocked(h.runtime.request).mockImplementation(async (_url, init) =>
      init?.method === 'DELETE'
        ? Response.json({ error: { code: 'account-deletion-unavailable' } }, { status: 503 })
        : Response.json({ access_token: 'fixture' }),
    );
    const key = (await account.actionKey())!;
    expect(await account.deleteAccount(key)).toEqual({ ok: false, code: 'relay-unavailable' });
    expect(JSON.parse(h.text()!).action).toBeUndefined();
    expect(h.removeConnections).not.toHaveBeenCalled();
    expect(await account.signOut(key)).toEqual({ ok: true, value: undefined });
  });

  it('refuses the destructive request when its recovery marker cannot be persisted', async () => {
    const h = runtimeHarness(),
      account = h.open();
    vi.mocked(h.runtime.write).mockRejectedValueOnce(new Error('disk full'));
    expect((await account.deleteAccount((await account.actionKey())!)).ok).toBe(false);
    expect(
      vi.mocked(h.runtime.request).mock.calls.some(([, init]) => init?.method === 'DELETE'),
    ).toBe(false);
    expect(h.removeConnections).not.toHaveBeenCalled();
  });

  it('remembers successful remote deletion when completion storage fails and retries without auth', async () => {
    const h = runtimeHarness(),
      account = h.open();
    const write = h.runtime.write;
    let failed = false;
    h.runtime.write = vi.fn(async (value) => {
      if (!failed && value && JSON.parse(value).action === 'delete-complete') {
        failed = true;
        throw new Error('disk full');
      }
      await write(value);
    });
    const key = (await account.actionKey())!;
    expect(await account.deleteAccount(key)).toEqual({ ok: false, code: 'account-cleanup-failed' });
    expect(JSON.parse(h.text()!).action).toBe('delete-pending');
    vi.mocked(h.runtime.request).mockClear().mockRejectedValue(new Error('expired'));
    expect(await account.deleteAccount(key)).toEqual({ ok: true, value: undefined });
    expect(h.runtime.request).not.toHaveBeenCalled();
    expect(h.removeConnections).toHaveBeenCalledTimes(1);
  });

  it('recovers only local state after restart with an uncertain deletion and expired credentials', async () => {
    const h = runtimeHarness();
    h.replace(JSON.stringify({ ...JSON.parse(h.text()!), action: 'delete-pending' }));
    h.runtime.request = vi.fn(async () => Response.json({}, { status: 400 }));
    const account = h.open(),
      key = (await account.actionKey())!;
    expect(await account.pendingDeletion()).toBe(true);
    expect(await account.deleteAccount(key)).toEqual({
      ok: false,
      code: 'account-deletion-uncertain',
    });
    vi.mocked(h.runtime.request).mockClear();
    h.removeConnections.mockRejectedValueOnce(new Error('disk'));
    expect(await account.finishLocalCleanup(key)).toEqual({
      ok: false,
      code: 'account-cleanup-failed',
    });
    expect(JSON.parse(h.text()!).action).toBe('delete-local');
    expect(await h.open().deleteAccount(key)).toEqual({
      ok: false,
      code: 'account-action-pending',
    });
    expect(await h.open().finishLocalCleanup(key)).toEqual({ ok: true, value: undefined });
    expect(h.runtime.request).not.toHaveBeenCalled();
    expect(h.text()).toBeNull();
  });

  it('migrates a stable legacy sign-in identity before rotating credentials again', async () => {
    const h = runtimeHarness();
    h.replace(JSON.stringify({ clientId: owner.clientId, refreshToken: 'legacy' }));
    let rotation = 0;
    h.runtime.request = vi.fn(async () =>
      Response.json({
        access_token: 'test',
        refresh_token: `rotated-${++rotation}`,
        user: { id: owner.subject },
        hosts: [],
      }),
    );
    const account = h.open(),
      before = await account.actionKey();
    await account.hosts();
    expect(await account.actionKey()).toBe(before);
    await account.hosts();
    expect(await account.actionKey()).toBe(before);
    const save = vi.fn();
    await account.savePairing(before!, save);
    expect(save).toHaveBeenCalledTimes(1);
    expect(JSON.parse(h.text()!).subject).toBe(owner.subject);
  });

  it('preserves an authoritative empty list and blocks re-pairing until pending cleanup finishes', () => {
    const record = saved('owned', owner);
    expect(parseSavedHosts(JSON.stringify({ hosts: [] }), JSON.stringify(record))).toEqual({
      hosts: [],
    });
    expect(() => withHost({ hosts: [], pendingAccountRemoval: [record] }, saved('owned'))).toThrow(
      'account-cleanup-pending',
    );
  });
});
