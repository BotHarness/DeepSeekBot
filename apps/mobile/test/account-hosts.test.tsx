// @vitest-environment jsdom
import { act, useCallback, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../src/ui/primitives/account-panel', () => ({
  AccountPanel: (p: import('../src/ui/primitives/account-panel').AccountPanelProps) => (
    <div>
      <span>{p.email ?? t.pairAccount.hint}</span>
      <span>{p.error}</span>
      {p.rows?.map((row) => (
        <button
          key={row.id}
          aria-label={row.name}
          disabled={row.disabled || p.loading || p.busy}
          onClick={() => p.onToggle(row.id)}
        >
          {row.name} {row.detail}
        </button>
      ))}
      <button aria-label="add" disabled={!p.selectedCount || p.busy} onClick={p.onAdd}>
        Add
      </button>
      <button aria-label={t.pairAccount.refresh} onClick={p.onRefresh}>
        Refresh
      </button>
      {p.email === null ? (
        <button aria-label={t.pairAccount.signIn} onClick={p.onSignIn}>
          Sign in
        </button>
      ) : (
        <>
          <button
            aria-label={p.pendingDeletion ? t.pairAccount.cleanupConfirm : t.pairAccount.signOut}
            onClick={p.onSignOut}
          >
            Sign out
          </button>
          <button aria-label={t.pairAccount.deleteAccount} onClick={p.onDelete}>
            Delete account
          </button>
        </>
      )}
    </div>
  ),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
const confirmed = vi.hoisted(() => [] as string[]);
const dialogs = vi.hoisted(() => ({
  auto: true,
  native: false,
  callbacks: [] as Array<() => unknown>,
}));
vi.mock('../src/ui/primitives/app-dialog', () => ({
  confirmDestructive: (
    title: string,
    _message: string,
    _action: string,
    onConfirm: () => unknown,
  ) => {
    confirmed.push(title);
    dialogs.callbacks.push(onConfirm);
    if (dialogs.native)
      appDialogs.open(title, _message, [
        { text: t.cancel, style: 'cancel' },
        { text: _action, style: 'destructive', onPress: onConfirm },
      ]);
    else if (dialogs.auto) return Promise.resolve(onConfirm()).catch(() => undefined);
  },
}));
vi.mock('expo-router', () => ({
  useFocusEffect: (focus: () => void | (() => void)) => {
    useSyncExternalStore(
      useCallback(() => focus() ?? (() => {}), [focus]),
      () => true,
    );
  },
}));

import type { ConnectHost } from '../src/host/connect-account';
import { AccountHosts } from '../src/ui/account-hosts';
import { t } from '../src/ui/strings';
import { appDialogs } from '../src/ui/primitives/dialog-state';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  confirmed.length = 0;
  dialogs.auto = true;
  dialogs.native = false;
  appDialogs.dismiss();
  dialogs.callbacks.length = 0;
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

const studio: ConnectHost = {
  id: 'hstudio',
  name: 'Studio',
  hostname: 'hstudio.deepseekbot.dev',
  online: true,
};

it('signs in, lists the account Hosts and pairs with the chosen one', async () => {
  let email: string | null = null;
  const account = {
    pendingDeletion: vi.fn(async () => false),
    finishLocalCleanup: vi.fn(),
    actionKey: vi.fn(async () => 'session-a'),
    email: vi.fn(async () => email),
    signIn: vi.fn(async () => {
      email = 'alice@example.com';
      return { ok: true as const, value: email };
    }),
    hosts: vi.fn(async () => ({
      ok: true as const,
      value: [studio, { ...studio, id: 'hlaptop', name: 'Laptop', online: false }],
    })),
    signOut: vi.fn(async () => {
      email = null;
      return { ok: true as const, value: undefined };
    }),
    deleteAccount: vi.fn(),
  };
  const onPair = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts account={account} busy={false} saved={[]} results={{}} onPair={onPair} />,
    ),
  );
  const button = (label: string) =>
    host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(host.textContent).toContain(t.pairAccount.hint);
  expect(account.hosts).not.toHaveBeenCalled();

  await act(async () => button(t.pairAccount.signIn)!.click());
  expect(host.textContent).toContain('alice@example.com');
  expect(button('Laptop')).not.toBeNull();

  await act(async () => button('Studio')!.click());
  expect(onPair).not.toHaveBeenCalled();
  await act(async () => button('add')!.click());
  expect(onPair).toHaveBeenCalledWith([studio]);

  await act(async () => button(t.pairAccount.signOut)!.click());
  expect(button(t.pairAccount.signIn)).not.toBeNull();
  expect(button('Studio')).toBeNull();
});

it('shows the account refusal and returns to sign-in when the session expired', async () => {
  const account = {
    pendingDeletion: vi.fn(async () => false),
    finishLocalCleanup: vi.fn(),
    actionKey: vi.fn(async () => 'session-a'),
    email: vi.fn(async () => 'alice@example.com' as string | null | undefined),
    signIn: vi.fn(),
    hosts: vi.fn(async () => ({ ok: false as const, code: 'sign-in-required' as const })),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts account={account} busy={false} saved={[]} results={{}} onPair={vi.fn()} />,
    ),
  );
  await act(async () => undefined);
  expect(host.textContent).toContain(t.pairRefused['sign-in-required']);
  expect(host.querySelector(`button[aria-label="${t.pairAccount.signIn}"]`)).not.toBeNull();
});

it('deletes the account after confirmation and shows a refusal when the relay fails', async () => {
  let email: string | null = 'alice@example.com';
  const results = [
    { ok: false as const, code: 'relay-unavailable' as const },
    { ok: true as const, value: undefined },
  ];
  const account = {
    pendingDeletion: vi.fn(async () => false),
    finishLocalCleanup: vi.fn(),
    actionKey: vi.fn(async () => 'session-a'),
    email: vi.fn(async () => email),
    signIn: vi.fn(),
    hosts: vi.fn(async () => ({ ok: true as const, value: [studio] })),
    signOut: vi.fn(),
    deleteAccount: vi.fn(async () => {
      const result = results.shift()!;
      if (result.ok) email = null;
      return result;
    }),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts account={account} busy={false} saved={[]} results={{}} onPair={vi.fn()} />,
    ),
  );
  await act(async () => undefined);
  const button = (label: string) =>
    host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);

  await act(async () => button(t.pairAccount.deleteAccount)!.click());
  expect(confirmed).toEqual([t.pairAccount.deleteTitle]);
  expect(host.textContent).toContain(t.pairRefused['relay-unavailable']);
  expect(button('Studio')).not.toBeNull();

  await act(async () => button(t.pairAccount.deleteAccount)!.click());
  expect(account.deleteAccount).toHaveBeenCalledTimes(2);
  expect(button(t.pairAccount.signIn)).not.toBeNull();
  expect(button('Studio')).toBeNull();
});

it('disables saved and offline computers while selecting multiple available computers', async () => {
  const other = { ...studio, id: 'hother', name: 'Other', hostname: 'hother.deepseekbot.dev' };
  const offline = {
    ...other,
    id: 'hoff',
    name: 'Offline',
    hostname: 'hoff.deepseekbot.dev',
    online: false,
  };
  const spare = { ...other, id: 'hspare', name: 'Spare', hostname: 'hspare.deepseekbot.dev' };
  const account = {
    pendingDeletion: vi.fn(async () => false),
    finishLocalCleanup: vi.fn(),
    actionKey: vi.fn(async () => 'session-a'),
    email: async () => 'alice@example.com',
    hosts: async () => ({ ok: true as const, value: [studio, other, offline, spare] }),
    signIn: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  };
  const saved = [
    {
      hostId: 'real-studio',
      hostName: 'Studio',
      routes: ['https://hstudio.deepseekbot.dev'],
      credential: 'fixture',
      deviceId: 'fixture',
    },
  ];
  const onPair = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts account={account} busy={false} saved={saved} results={{}} onPair={onPair} />,
    ),
  );
  const button = (name: string) =>
    host!.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
  expect(button('Studio').disabled).toBe(true);
  expect(button('Offline').disabled).toBe(true);
  await act(async () => {
    button('Other').click();
    button('Spare').click();
  });
  await act(async () => button('add').click());
  expect(onPair).toHaveBeenCalledWith([other, spare]);
  await act(async () =>
    root!.render(
      <AccountHosts
        account={account}
        busy={false}
        saved={saved}
        results={{ hother: 'added', hspare: 'unreachable' }}
        onPair={onPair}
      />,
    ),
  );
  expect(button('Other').disabled).toBe(true);
  expect(button('Spare').disabled).toBe(false);
});
it('ignores an old account lookup after the account owner changes', async () => {
  let resolve!: (value: string) => void;
  const oldEmail = new Promise<string>((done) => {
    resolve = done;
  });
  const account = {
    pendingDeletion: vi.fn(async () => false),
    finishLocalCleanup: vi.fn(),
    actionKey: vi.fn(async () => 'session-a'),
    email: () => oldEmail,
    hosts: vi.fn(async () => ({ ok: true as const, value: [studio] })),
    signIn: vi.fn(),
    signOut: vi.fn(),
    deleteAccount: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts account={account} busy={false} saved={[]} results={{}} onPair={vi.fn()} />,
    ),
  );
  await act(async () =>
    root!.render(
      <AccountHosts
        account={{ ...account, email: async () => null }}
        busy={false}
        saved={[]}
        results={{}}
        onPair={vi.fn()}
      />,
    ),
  );
  await act(async () => resolve('old@example.com'));
  expect(account.hosts).not.toHaveBeenCalled();
  expect(host.textContent).not.toContain('old@example.com');
});

it.each(['signOut', 'deleteAccount'] as const)(
  'keeps %s inert until confirmation and ignores duplicate confirmation',
  async (action) => {
    const { createAccountActionFixture } = await import('../src/host/account-action-fixture');
    const fixture = createAccountActionFixture();
    dialogs.auto = false;
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () =>
      root!.render(
        <AccountHosts
          account={fixture.account}
          busy={false}
          saved={fixture.saved()}
          results={{}}
          onPair={vi.fn()}
        />,
      ),
    );
    const before = fixture.getSnapshot();
    const button = host.querySelector<HTMLButtonElement>(
      `button[aria-label="${t.pairAccount[action]}"]`,
    )!;
    await act(async () => button.click());
    expect(dialogs.callbacks).toHaveLength(1);
    expect(fixture.getSnapshot()).toBe(before);
    dialogs.callbacks.pop();
    expect(fixture.getSnapshot()).toBe(before);
    await act(async () => button.click());
    const confirm = dialogs.callbacks[0]!;
    await act(async () => {
      await confirm();
      await confirm();
    });
    expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
      signedIn: false,
      saved: ['manual', 'legacy', 'other'],
      deletes: action === 'deleteAccount' ? 1 : 0,
    });
  },
);

it('ignores a confirmation opened before navigation or a busy state', async () => {
  const { createAccountActionFixture } = await import('../src/host/account-action-fixture');
  const fixture = createAccountActionFixture();
  dialogs.auto = false;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const render = (busy: boolean) =>
    root!.render(
      <AccountHosts
        account={fixture.account}
        busy={busy}
        saved={fixture.saved()}
        results={{}}
        onPair={vi.fn()}
      />,
    );
  await act(async () => render(false));
  const before = fixture.getSnapshot();
  await act(async () =>
    host!
      .querySelector<HTMLButtonElement>(`button[aria-label="${t.pairAccount.signOut}"]`)!
      .click(),
  );
  await act(async () => render(true));
  await act(async () => {
    await dialogs.callbacks[0]!();
  });
  expect(fixture.getSnapshot()).toBe(before);
  await act(async () => root!.unmount());
  root = undefined;
  await act(async () => {
    await dialogs.callbacks[0]!();
  });
  expect(fixture.getSnapshot()).toBe(before);
});

it('keeps the Android confirmation and error after failure, retries once, and offers confirmed local-only recovery', async () => {
  const { createAccountActionFixture } = await import('../src/host/account-action-fixture');
  const fixture = createAccountActionFixture('expired-retry');
  dialogs.native = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts
        account={fixture.account}
        busy={false}
        saved={fixture.saved()}
        results={{}}
        onPair={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    host!
      .querySelector<HTMLButtonElement>(`button[aria-label="${t.pairAccount.deleteAccount}"]`)!
      .click(),
  );
  const id = appDialogs.getSnapshot()!.id;
  await act(async () => appDialogs.choose(1, id));
  expect(appDialogs.getSnapshot()).toMatchObject({
    id,
    busy: undefined,
    error: t.pairRefused['account-deletion-uncertain'],
  });
  await act(async () => appDialogs.choose(1, id));
  expect(appDialogs.getSnapshot()?.error).toBe(t.pairRefused['account-deletion-uncertain']);
  const before = fixture.getSnapshot();
  await act(async () => appDialogs.choose(0, id));
  expect(fixture.getSnapshot()).toBe(before);
  const recover = () =>
    host!
      .querySelector<HTMLButtonElement>(`button[aria-label="${t.pairAccount.cleanupConfirm}"]`)!
      .click();
  await act(async () => recover());
  expect(appDialogs.getSnapshot()?.message).toBe(t.pairAccount.cleanupMessage);
  await act(async () => appDialogs.choose(0, appDialogs.getSnapshot()!.id));
  expect(fixture.getSnapshot()).toBe(before);
  await act(async () => recover());
  await act(async () => appDialogs.choose(1, appDialogs.getSnapshot()!.id));
  expect(appDialogs.getSnapshot()).toBeUndefined();
  expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
    signedIn: false,
    deletes: 1,
    saved: ['manual', 'legacy', 'other'],
  });
});

it('retries a failed cleanup in the same Android confirmation without repeating remote deletion', async () => {
  const { createAccountActionFixture } = await import('../src/host/account-action-fixture');
  const fixture = createAccountActionFixture('completion-write');
  dialogs.native = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(
      <AccountHosts
        account={fixture.account}
        busy={false}
        saved={fixture.saved()}
        results={{}}
        onPair={vi.fn()}
      />,
    ),
  );
  await act(async () =>
    host!
      .querySelector<HTMLButtonElement>(`button[aria-label="${t.pairAccount.deleteAccount}"]`)!
      .click(),
  );
  const id = appDialogs.getSnapshot()!.id;
  await act(async () => appDialogs.choose(1, id));
  expect(appDialogs.getSnapshot()?.error).toBe(t.pairRefused['account-cleanup-failed']);
  await act(async () => appDialogs.choose(1, id));
  expect(appDialogs.getSnapshot()).toBeUndefined();
  expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
    signedIn: false,
    deletes: 1,
    refreshes: 2,
  });
});
