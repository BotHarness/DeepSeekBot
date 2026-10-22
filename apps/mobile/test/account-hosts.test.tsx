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
          <button aria-label={t.pairAccount.signOut} onClick={p.onSignOut}>
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
vi.mock('../src/ui/primitives/app-dialog', () => ({
  confirmDestructive: (
    title: string,
    _message: string,
    _action: string,
    onConfirm: () => unknown,
  ) => {
    confirmed.push(title);
    return onConfirm();
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

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
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
