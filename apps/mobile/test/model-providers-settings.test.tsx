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

it('shows a stored key without its suffix as stored, not missing', async () => {
  const port: ModelProvidersPort = {
    providers: vi.fn(async () => ({
      providers: [
        {
          id: 'opencode-go',
          name: 'Go',
          keyStored: true,
          modelCount: 1,
          availability: 'available' as const,
          canRename: true,
          canReplaceKey: true,
          canRemove: true,
          revision: 1,
        },
      ],
    })),
    accounts: vi.fn(async () => ({ accounts: [] })),
    openAccount: vi.fn(),
  };
  const view = await render(<ModelProvidersSettings port={port} />);
  expect(view.textContent).toContain(t.modelProviders.keyStored);
  expect(view.textContent).not.toContain(t.modelProviders.noKey);
});

it('reports a failed read after refresh and clears sign-in once the Host finishes it', async () => {
  vi.useFakeTimers();
  try {
    const now = Date.now();
    let accounts = accountsFixture(now);
    let readFails = false;
    let resolveSignIn: (value: { url?: string }) => void = () => undefined;
    const port: ProviderAccountPort = {
      accounts: vi.fn(async () => {
        if (readFails) throw new Error('offline');
        return accounts;
      }),
      refresh: vi.fn(async () => {
        readFails = true;
        return 'ok' as const;
      }),
      signIn: vi.fn(
        () =>
          new Promise<{ url?: string }>((resolve) => {
            resolveSignIn = resolve;
          }),
      ),
      cancelSignIn: vi.fn(async () => undefined),
    };
    const view = await render(<ProviderAccountSettings port={port} id="claude" />);
    await act(async () => undefined);
    expect(port.refresh).toHaveBeenCalledWith('claude');
    expect(view.textContent).toContain(t.modelProviders.refreshFailed.unavailable);
    act(() => root?.unmount());
    host?.remove();

    readFails = false;
    const signedOut = await render(<ProviderAccountSettings port={port} id="codex-b" />);
    await act(async () => button(signedOut, t.modelProviders.signIn)!.click());
    expect(signedOut.querySelector('[data-testid="account-sign-in"]')?.textContent).toContain(
      t.modelProviders.signingIn,
    );
    await act(async () => button(signedOut, t.modelProviders.signingIn)?.click());
    expect(port.signIn).toHaveBeenCalledTimes(1);
    await act(async () => resolveSignIn({ url: 'https://example.org/sign-in' }));
    expect(signedOut.textContent).toContain(t.modelProviders.signInOnComputer);

    accounts = {
      ...accounts,
      accounts: accounts.accounts.map((account) =>
        account.id === 'codex-b' ? { ...account, available: true } : account,
      ),
    };
    await act(async () => vi.advanceTimersByTime(15_000));
    await act(async () => undefined);
    expect(signedOut.textContent).not.toContain(t.modelProviders.signInOnComputer);
    expect(signedOut.textContent).toContain(t.modelProviders.signedIn);
    expect(port.refresh).toHaveBeenCalledWith('codex-b');
  } finally {
    vi.useRealTimers();
  }
});

it('keeps refresh busy until the account read finishes and times out an unfinished sign-in', async () => {
  vi.useFakeTimers();
  try {
    const now = Date.now();
    const accounts = accountsFixture(now);
    let finishRead: () => void = () => undefined;
    let slowReads = 0;
    const port: ProviderAccountPort = {
      accounts: vi.fn(() =>
        slowReads > 0
          ? new Promise<SubscriptionAccountsView>((resolve) => {
              slowReads -= 1;
              finishRead = () => resolve(accounts);
            })
          : Promise.resolve(accounts),
      ),
      refresh: vi.fn(async () => {
        slowReads = 1;
        return 'ok' as const;
      }),
      signIn: vi.fn(async () => ({ url: 'https://example.org/sign-in' })),
      cancelSignIn: vi.fn(async () => undefined),
    };
    const view = await render(<ProviderAccountSettings port={port} id="claude" />);
    await act(async () => undefined);
    expect(view.querySelector('[data-testid="account-refresh"]')?.textContent).toContain(
      t.modelProviders.refreshing,
    );
    await act(async () => finishRead());
    expect(view.querySelector('[data-testid="account-refresh"]')?.textContent).toContain(
      t.modelProviders.refresh,
    );
    act(() => root?.unmount());
    host?.remove();

    const signedOut = await render(<ProviderAccountSettings port={port} id="codex-b" />);
    await act(async () => button(signedOut, t.modelProviders.signIn)!.click());
    expect(signedOut.textContent).toContain(t.modelProviders.signInOnComputer);
    await act(async () => vi.advanceTimersByTime(200_000));
    await act(async () => undefined);
    expect(signedOut.textContent).not.toContain(t.modelProviders.signInOnComputer);
    expect(signedOut.textContent).toContain(t.modelProviders.signInTimedOut);
    expect(button(signedOut, t.modelProviders.signIn)).toBeDefined();
  } finally {
    vi.useRealTimers();
  }
});

it('treats a sign-in that finished while the timer was late as signed in, not timed out', async () => {
  vi.useFakeTimers();
  try {
    let accounts = accountsFixture(Date.now());
    const port: ProviderAccountPort = {
      accounts: vi.fn(async () => accounts),
      refresh: vi.fn(async () => 'ok' as const),
      signIn: vi.fn(async () => ({ url: 'https://example.org/sign-in' })),
      cancelSignIn: vi.fn(async () => undefined),
    };
    const view = await render(<ProviderAccountSettings port={port} id="codex-b" />);
    await act(async () => button(view, t.modelProviders.signIn)!.click());
    expect(view.textContent).toContain(t.modelProviders.signInOnComputer);
    accounts = {
      ...accounts,
      accounts: accounts.accounts.map((account) =>
        account.id === 'codex-b' ? { ...account, available: true } : account,
      ),
    };
    vi.setSystemTime(Date.now() + 300_000);
    await act(async () => vi.advanceTimersByTime(15_000));
    await act(async () => undefined);
    expect(view.textContent).not.toContain(t.modelProviders.signInTimedOut);
    expect(view.textContent).toContain(t.modelProviders.signedIn);
  } finally {
    vi.useRealTimers();
  }
});

it('sends one cancel for a sign-in even when Cancel is pressed twice', async () => {
  let finishCancel: () => void = () => undefined;
  const port: ProviderAccountPort = {
    accounts: vi.fn(async () => accountsFixture(Date.now())),
    refresh: vi.fn(async () => 'ok' as const),
    signIn: vi.fn(async () => ({ url: 'https://example.org/sign-in' })),
    cancelSignIn: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCancel = resolve;
        }),
    ),
  };
  const view = await render(<ProviderAccountSettings port={port} id="codex-b" />);
  await act(async () => button(view, t.modelProviders.signIn)!.click());
  await act(async () => button(view, t.modelProviders.cancelSignIn)!.click());
  await act(async () => button(view, t.modelProviders.cancelSignIn)?.click());
  expect(port.cancelSignIn).toHaveBeenCalledTimes(1);
  await act(async () => finishCancel());
  expect(button(view, t.modelProviders.signIn)).toBeDefined();
});
