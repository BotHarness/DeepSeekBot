// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
vi.mock('../src/ui/primitives/row-icon', () => ({ RowIcon: () => null }));
vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null, SvgXml: () => null }));
const copied = vi.fn(async () => true);
vi.mock('expo-clipboard', () => ({ setStringAsync: (text: string) => copied(text) }));

import type { SubscriptionAccountsView } from '@botharness/host-client/subscription-accounts';
import {
  ModelProvidersSettings,
  type ModelProvidersPort,
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

it('lists providers and accounts, masks the email, expands quota and refreshes stale data', async () => {
  const now = Date.now();
  let accounts: SubscriptionAccountsView = {
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
  const view = await render(<ModelProvidersSettings port={port} />);
  expect(view.textContent).toContain('Go');
  expect(view.textContent).toContain('••••1234');
  expect(view.textContent).toContain('va•••@e•••.org');
  expect(view.textContent).not.toContain('vain.test@example.org');
  expect(view.textContent).toContain(t.modelProviders.quotaLeft(50));

  const claude = view.querySelector('[data-testid="subscription-account-claude"]')!;
  await act(async () => (claude.querySelector('[role="button"]') as HTMLElement).click());
  await act(async () => undefined);
  expect(port.refresh).toHaveBeenCalledWith('claude');
  expect(view.querySelector('[data-testid="quota-window-session"]')?.textContent).toContain('27%');
  expect(view.querySelector('[data-testid="quota-window-weekly"]')?.textContent).toContain('41%');
  expect(view.textContent).toContain(t.modelProviders.quotaLeft(27));

  await act(async () => button(view, t.modelProviders.showEmail)!.click());
  expect(view.textContent).toContain('vain.test@example.org');
  expect(button(view, t.modelProviders.emailShown('vain.test@example.org'))).toBeDefined();

  const codex = view.querySelector('[data-testid="subscription-account-codex-b"]')!;
  await act(async () => (codex.querySelector('[role="button"]') as HTMLElement).click());
  await act(async () => button(view, t.modelProviders.signIn)!.click());
  await act(async () => undefined);
  expect(port.signIn).toHaveBeenCalledWith('codex-b');
  await act(async () => button(view, t.modelProviders.copyLink)!.click());
  expect(copied).toHaveBeenCalledWith('https://example.org/sign-in');
  await act(async () => button(view, t.modelProviders.cancelSignIn)!.click());
  expect(port.cancelSignIn).toHaveBeenCalledWith('codex-b');
});
