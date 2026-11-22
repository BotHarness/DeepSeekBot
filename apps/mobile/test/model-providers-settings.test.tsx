// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));
const copied = vi.fn(async (_text: string) => true);
vi.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => copied(text) }));

import type { SubscriptionAccountsView } from '@botharness/host-client/subscription-accounts';
import {
  ModelProvidersSettings,
  ProviderAccountSettings,
  type ModelProvidersPort,
  type ProviderAccountPort,
} from '../src/ui/model-providers-settings';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const button = (view: HTMLElement, label: string) =>
  [...view.querySelectorAll<HTMLElement>('[role="button"], button')].find(
    (node) => node.getAttribute('aria-label') === label || node.textContent === label,
  );

const HOUR = 3_600_000;

function accountsFixture(now: number): SubscriptionAccountsView {
  return {
    revision: 1,
    accounts: [
      {
        engine: 'claude',
        id: 'claude',
        name: 'Claude Code',
        installed: true,
        available: true,
        email: 'vain.test@example.org',
        quota: {
          observedAt: new Date(now - 2 * HOUR).toISOString(),
          source: 'turn',
          windows: { session: { remainingPercent: 50 } },
        },
      },
      {
        engine: 'codex',
        id: 'codex-b',
        name: 'B',
        installed: true,
        available: false,
        reason: 'signed-out',
      },
    ],
  };
}

it('lists providers and accounts with masked email and opens an account', async () => {
  const now = Date.now();
  const port: ModelProvidersPort = {
    providers: vi.fn(async () => ({
      revision: 1,
      providers: [
        {
          id: 'opencode-go',
          name: 'Go',
          keyStored: true,
          keyLast4: '1234',
          modelCount: 3,
          availability: 'available' as const,
          canRename: true,
          canReplaceKey: true,
          canRemove: true,
          revision: 1,
        },
      ],
    })),
    accounts: vi.fn(async () => accountsFixture(now)),
    openAccount: vi.fn(),
  };
  const view = await render(<ModelProvidersSettings port={port} />);
  expect(view.textContent).toContain('Go');
  expect(view.textContent).toContain('••••1234');
  expect(view.textContent).toContain('va•••@e•••.org');
  expect(view.textContent).not.toContain('vain.test@example.org');
  expect(view.textContent).toContain(t.modelProviders.quotaLeft(50));
  const claude = view.querySelector<HTMLElement>('[data-testid="subscription-account-claude"]');
  await act(async () => (claude?.closest<HTMLElement>('[role="button"]') ?? claude)!.click());
  expect(port.openAccount).toHaveBeenCalledWith('claude');
});

it('shows one account: refreshes stale quota, reveals the email and runs sign-in', async () => {
  const now = Date.now();
  let accounts = accountsFixture(now);
  const port: ProviderAccountPort = {
    accounts: vi.fn(async () => accounts),
    refresh: vi.fn(async () => {
      accounts = {
        ...accounts,
        accounts: accounts.accounts.map((account) =>
          account.id === 'claude'
            ? {
                ...account,
                quota: {
                  observedAt: new Date(now).toISOString(),
                  source: 'live' as const,
                  windows: {
                    session: { remainingPercent: 27, resetsAt: new Date(now + HOUR).toISOString() },
                    weekly: { remainingPercent: 41 },
                  },
                },
              }
            : account,
        ),
      };
      return 'ok' as const;
    }),
    signIn: vi.fn(async () => ({ url: 'https://example.org/sign-in' })),
    cancelSignIn: vi.fn(async () => undefined),
  };
  const view = await render(<ProviderAccountSettings port={port} id="claude" />);
  await act(async () => undefined);
  expect(port.refresh).toHaveBeenCalledWith('claude');
  expect(view.querySelector('[data-testid="quota-window-session"]')?.textContent).toContain('27%');
  expect(view.querySelector('[data-testid="quota-window-weekly"]')?.textContent).toContain('41%');
  expect(view.textContent).not.toContain('vain.test@example.org');
  await act(async () => button(view, t.modelProviders.showEmail)!.click());
  expect(view.textContent).toContain('vain.test@example.org');
  expect(button(view, t.modelProviders.emailShown('vain.test@example.org'))).toBeDefined();
  act(() => root?.unmount());
  host?.remove();

  const signedOut = await render(<ProviderAccountSettings port={port} id="codex-b" />);
  await act(async () => button(signedOut, t.modelProviders.signIn)!.click());
  await act(async () => undefined);
  expect(port.signIn).toHaveBeenCalledWith('codex-b');
  expect(signedOut.textContent).toContain(t.modelProviders.signInOnComputer);
  await act(async () => button(signedOut, t.modelProviders.copyLink)!.click());
  expect(copied).toHaveBeenCalledWith('https://example.org/sign-in');
  await act(async () => button(signedOut, t.modelProviders.cancelSignIn)!.click());
  expect(port.cancelSignIn).toHaveBeenCalledWith('codex-b');
});
