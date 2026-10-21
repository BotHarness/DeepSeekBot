// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-router', () => ({
  useFocusEffect: (focus: () => void) => {
    useState(focus);
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
  };
  const onPair = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<AccountHosts account={account} busy={false} onPair={onPair} />),
  );
  const button = (label: string) =>
    host!.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  expect(host.textContent).toContain(t.pairAccount.hint);
  expect(account.hosts).not.toHaveBeenCalled();

  await act(async () => button(t.pairAccount.signIn)!.click());
  expect(host.textContent).toContain(t.pairAccount.signedIn('alice@example.com'));
  expect(button(`${t.pairAccount.pairWith('Laptop')} · ${t.pairAccount.offline}`)).not.toBeNull();

  await act(async () => button(t.pairAccount.pairWith('Studio'))!.click());
  expect(onPair).toHaveBeenCalledWith(studio);

  await act(async () => button(t.pairAccount.signOut)!.click());
  expect(button(t.pairAccount.signIn)).not.toBeNull();
  expect(button(t.pairAccount.pairWith('Studio'))).toBeNull();
});

it('shows the account refusal and returns to sign-in when the session expired', async () => {
  const account = {
    email: vi.fn(async () => 'alice@example.com' as string | null | undefined),
    signIn: vi.fn(),
    hosts: vi.fn(async () => ({ ok: false as const, code: 'sign-in-required' as const })),
    signOut: vi.fn(),
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root!.render(<AccountHosts account={account} busy={false} onPair={vi.fn()} />),
  );
  await act(async () => undefined);
  expect(host.textContent).toContain(t.pairRefused['sign-in-required']);
  expect(host.querySelector(`button[aria-label="${t.pairAccount.signIn}"]`)).not.toBeNull();
});
