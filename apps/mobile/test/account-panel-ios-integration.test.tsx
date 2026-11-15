// @vitest-environment jsdom
import { act, useCallback, useSyncExternalStore, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

type Modifier = { kind: string; value?: unknown };
type NativeProps = {
  children?: ReactNode;
  icon?: ReactNode;
  label?: string;
  testID?: string;
  role?: string;
  systemName?: string;
  modifiers?: Modifier[];
  onPress?(): void;
};

vi.mock('expo-application', () => ({
  nativeApplicationVersion: '1.7.0',
  nativeBuildVersion: '18',
}));
vi.mock('expo-device', () => ({ osVersion: '27.0' }));
vi.mock('expo-clipboard', () => ({ setStringAsync: vi.fn(async () => {}) }));
vi.mock(
  '../src/ui/primitives/connection-failure-actions',
  () => import('../src/ui/primitives/connection-failure-actions.ios'),
);

vi.mock('@expo/ui', () => ({
  Host: ({ children }: NativeProps) => <div>{children}</div>,
}));
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  shapes: { rectangle: () => ({ kind: 'rectangle' }) },
  ...Object.fromEntries(
    [
      'accessibilityHidden',
      'accessibilityLabel',
      'buttonStyle',
      'contentShape',
      'disabled',
      'font',
      'foregroundStyle',
      'frame',
      'labelStyle',
      'listRowBackground',
      'offset',
      'scrollContentBackground',
      'tint',
    ].map((kind) => [kind, (value: unknown) => ({ kind, value })]),
  ),
}));
vi.mock('@expo/ui/swift-ui', () => {
  const group = ({ children, icon }: NativeProps) => (
    <div>
      {icon}
      {children}
    </div>
  );
  const modifier = (props: NativeProps, kind: string) =>
    props.modifiers?.find((value) => value.kind === kind)?.value;
  return {
    Form: group,
    HStack: group,
    ProgressView: () => <progress />,
    Section: group,
    VStack: group,
    Label: group,
    Spacer: () => null,
    Text: (props: NativeProps) => (
      <span data-foreground={JSON.stringify(modifier(props, 'foregroundStyle'))}>
        {props.children}
      </span>
    ),
    Image: (props: NativeProps) => (
      <i
        data-symbol={props.systemName}
        data-foreground={JSON.stringify(modifier(props, 'foregroundStyle'))}
        aria-hidden={props.modifiers?.some((value) => value.kind === 'accessibilityHidden')}
      />
    ),
    Button: (props: NativeProps) => (
      <button
        data-testid={props.testID}
        data-native-role={props.role}
        aria-label={String(modifier(props, 'accessibilityLabel') ?? props.label ?? '')}
        disabled={modifier(props, 'disabled') === true}
        onClick={props.onPress}
      >
        {props.children ?? props.label}
      </button>
    ),
  };
});
vi.mock('../src/ui/primitives/step-bar', () => ({
  StepBar: ({ primary }: import('../src/ui/primitives/step-bar').StepBarProps) => (
    <button
      data-testid={primary.testID}
      data-busy={primary.busy === true}
      disabled={primary.disabled === true || primary.busy === true}
      onClick={primary.onPress}
    >
      {primary.label}
    </button>
  ),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock(
  '../src/ui/primitives/account-panel',
  () => import('../src/ui/primitives/account-panel.ios'),
);
vi.mock('expo-router', () => ({
  useFocusEffect: (focus: () => void | (() => void)) => {
    useSyncExternalStore(
      useCallback(() => focus() ?? (() => {}), [focus]),
      () => true,
    );
  },
}));
const confirmations = vi.hoisted(
  () =>
    [] as Array<{
      title: string;
      message: string;
      label: string;
      confirm(): unknown;
    }>,
);
vi.mock('../src/ui/primitives/app-dialog', () => ({
  confirmDestructive: (title: string, message: string, label: string, confirm: () => unknown) => {
    confirmations.push({ title, message, label, confirm });
  },
}));

import {
  createAccountActionFixture,
  type AccountFixtureScenario,
} from '../src/host/account-action-fixture';
import { AccountHosts } from '../src/ui/account-hosts';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
  confirmations.length = 0;
});

async function render(scenario: AccountFixtureScenario = 'success') {
  const fixture = createAccountActionFixture(scenario);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const update = (busy = false) =>
    root!.render(
      <AccountHosts
        account={fixture.account}
        busy={busy}
        saved={fixture.saved()}
        results={{}}
        onPair={vi.fn()}
      />,
    );
  await act(async () => update());
  return { fixture, update };
}
const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;
const click = (id: string) => act(async () => button(id).click());

it('settles a confirmation when another device already unlinked the computer', async () => {
  const { fixture } = await render('linked-computers');
  await click('account-manage-computers');
  await click('account-computer-hoffline');
  await fixture.account.revokeHost((await fixture.account.actionKey())!, 'hoffline');
  await act(async () => {
    await expect(confirmations[0]!.confirm()).resolves.toBeUndefined();
  });
  expect(host.querySelector('[data-testid="account-computer-hoffline"]')).toBeNull();
  expect(host.textContent).toContain(t.pairAccount.alreadyUnlinked);
  expect(host.textContent).not.toContain(t.pairRefused['host-not-found']);
});

it('preserves the refresh failure and disables unlinking until a successful read', async () => {
  const { fixture } = await render('linked-computers');
  await click('account-manage-computers');
  await click('account-computer-hoffline');
  await fixture.account.revokeHost((await fixture.account.actionKey())!, 'hoffline');
  vi.spyOn(fixture.account, 'hosts').mockResolvedValueOnce({
    ok: false,
    code: 'relay-unavailable',
  });
  await act(async () => {
    await expect(confirmations[0]!.confirm()).rejects.toThrow(t.pairRefused['relay-unavailable']);
  });
  expect(button('account-computer-hoffline').disabled).toBe(true);
  expect(host.textContent).toContain(t.pairRefused['relay-unavailable']);
  expect(host.textContent).not.toContain(t.pairRefused['host-not-found']);
  await act(async () => {
    await expect(confirmations[0]!.confirm()).resolves.toBeUndefined();
  });
  expect(host.textContent).toContain(t.pairAccount.alreadyUnlinked);
});

it('discards a missing-computer refresh from the account that left the screen', async () => {
  const { fixture } = await render('linked-computers');
  await click('account-manage-computers');
  await click('account-computer-hoffline');
  await fixture.account.revokeHost((await fixture.account.actionKey())!, 'hoffline');
  let finish!: (value: Awaited<ReturnType<typeof fixture.account.hosts>>) => void;
  vi.spyOn(fixture.account, 'hosts').mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending: unknown;
  await act(async () => {
    pending = confirmations[0]!.confirm();
  });
  const replacement = createAccountActionFixture();
  await act(async () =>
    root!.render(
      <AccountHosts
        account={replacement.account}
        busy={false}
        saved={[]}
        results={{}}
        onPair={vi.fn()}
      />,
    ),
  );
  await act(async () => {
    finish({ ok: false, code: 'relay-unavailable' });
    await pending;
  });
  expect(host.textContent).not.toContain(t.pairRefused['host-not-found']);
  expect(host.textContent).not.toContain(t.pairRefused['relay-unavailable']);
  expect(host.textContent).not.toContain(t.pairAccount.alreadyUnlinked);
});

it('unlinks an offline computer through the real account owner and iOS panel without clearing phone pairings', async () => {
  const { fixture } = await render('linked-computers');
  const before = JSON.parse(fixture.getSnapshot());
  expect(button('account-computer-hoffline').disabled).toBe(false);
  await click('account-manage-computers');
  expect(button('account-computer-hoffline').disabled).toBe(false);
  await click('account-computer-hoffline');
  expect(confirmations[0]!.title).toBe(t.pairAccount.unlinkTitle('Offline laptop'));
  expect(confirmations[0]!.message).toBe(t.pairAccount.unlinkMessage);
  expect(JSON.parse(fixture.getSnapshot()).unlinked).toEqual([]);
  await act(async () => {
    await Promise.all([confirmations[0]!.confirm(), confirmations[0]!.confirm()]);
  });
  expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
    signedIn: true,
    saved: before.saved,
    unlinked: ['hoffline'],
    deletes: 0,
    pairingWrites: 0,
    disconnects: 0,
  });
  expect(host.querySelector('[data-testid="account-computer-hoffline"]')).toBeNull();
  expect(host.textContent).toContain(t.pairAccount.unlinked);
  await click('account-computer-hlegacy');
  expect(confirmations.at(-1)!.message).toBe(t.pairAccount.legacyUnlinkMessage);
  await act(async () => {
    await confirmations.at(-1)!.confirm();
  });
  expect(host.textContent).toContain(t.pairAccount.legacyUnlinked);
});

it.each(['sign-out', 'delete'] as const)(
  'keeps the iOS %s action inert until confirmation and rejects duplicate submission',
  async (action) => {
    const { fixture } = await render();
    const before = fixture.getSnapshot();
    await click(`account-${action}`);
    expect(fixture.getSnapshot()).toBe(before);
    expect(confirmations).toHaveLength(1);
    const copy =
      action === 'sign-out'
        ? [t.pairAccount.signOutTitle, t.pairAccount.signOutMessage]
        : [t.pairAccount.deleteTitle, t.pairAccount.deleteMessage];
    expect([confirmations[0]!.title, confirmations[0]!.message]).toEqual(copy);
    confirmations.pop();
    expect(fixture.getSnapshot()).toBe(before);
    await click(`account-${action}`);
    const confirmation = confirmations[0]!;
    await act(async () => {
      await Promise.all([confirmation.confirm(), confirmation.confirm()]);
    });
    expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
      signedIn: false,
      saved: ['manual', 'legacy', 'other'],
      cleared: ['owned'],
      disconnects: 1,
      deletes: action === 'delete' ? 1 : 0,
    });
    expect(host.querySelector('[data-testid="account-sign-out"]')).toBeNull();
  },
);

it.each([
  'local-write',
  'session-write',
  'delete-partial',
  'expired-retry',
  'completion-write',
] as const)(
  'keeps the styled iOS recovery action consistent with its confirmation after %s',
  async (scenario) => {
    const { fixture } = await render(scenario);
    const original = button('account-sign-out');
    expect(original.textContent).toBe(t.pairAccount.signOut);
    const iconForeground = original.querySelector('i')!.getAttribute('data-foreground');
    const textForeground = original.querySelector('span')!.getAttribute('data-foreground');
    expect(iconForeground).toBeTruthy();
    expect(textForeground).toBe(iconForeground);
    await click('account-delete');
    expect(button('account-delete').dataset['nativeRole']).toBe('destructive');
    await act(async () => {
      await expect(confirmations[0]!.confirm()).rejects.toThrow();
    });
    const recovery = button('account-sign-out');
    expect(recovery.textContent).toBe(t.pairAccount.cleanupConfirm);
    expect(recovery.getAttribute('aria-label')).toBe(t.pairAccount.cleanupConfirm);
    expect(recovery.querySelector('i')!.dataset['symbol']).toBe(
      'rectangle.portrait.and.arrow.right',
    );
    expect(recovery.querySelector('i')!.getAttribute('aria-hidden')).toBe('true');
    expect(recovery.querySelector('i')!.getAttribute('data-foreground')).toBe(iconForeground);
    expect(recovery.querySelector('span')!.getAttribute('data-foreground')).toBe(textForeground);
    const before = fixture.getSnapshot();
    await click('account-sign-out');
    const recoveryDialog = confirmations.at(-1)!;
    expect([recoveryDialog.title, recoveryDialog.message, recoveryDialog.label]).toEqual([
      t.pairAccount.cleanupTitle,
      t.pairAccount.cleanupMessage,
      t.pairAccount.cleanupConfirm,
    ]);
    expect(fixture.getSnapshot()).toBe(before);
    confirmations.pop();
    await click('account-sign-out');
    await act(async () => {
      await confirmations.at(-1)!.confirm();
    });
    expect(JSON.parse(fixture.getSnapshot())).toMatchObject({
      signedIn: false,
      saved: ['manual', 'legacy', 'other'],
      deletes: 1,
    });
  },
);

it('disables both actual iOS controls during busy and loading states and rejects a stale confirmation', async () => {
  const { fixture, update } = await render();
  await click('account-sign-out');
  const old = confirmations[0]!;
  const before = fixture.getSnapshot();
  await act(async () => update(true));
  expect(button('account-sign-out').disabled).toBe(true);
  expect(button('account-delete').disabled).toBe(true);
  await click('account-delete');
  await act(async () => {
    await old.confirm();
  });
  expect(confirmations).toHaveLength(1);
  expect(fixture.getSnapshot()).toBe(before);
  await act(async () => update(false));
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const signOut = fixture.account.signOut;
  fixture.account.signOut = async (key) => {
    await held;
    return signOut(key);
  };
  let pending: unknown;
  await act(async () => {
    pending = old.confirm();
  });
  expect(button('account-sign-out').disabled).toBe(true);
  expect(button('account-delete').disabled).toBe(true);
  await click('account-delete');
  expect(confirmations).toHaveLength(1);
  await act(async () => {
    release();
    await pending;
  });
  expect(JSON.parse(fixture.getSnapshot()).signedIn).toBe(false);
});

it('marks iOS Environment rows with one native checkmark and pins the add action', async () => {
  const { AccountPanel } = await import('../src/ui/primitives/account-panel.ios');
  const onToggle = vi.fn();
  const onAdd = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  const row = (
    id: string,
    patch: Partial<import('../src/ui/primitives/account-panel').AccountComputerRow>,
  ) => ({
    id,
    name: id,
    detail: t.pairAccount.online,
    added: false,
    selected: false,
    pairing: false,
    disabled: false,
    ...patch,
  });
  const render = (busy: boolean, pairing: string | undefined) =>
    root!.render(
      <AccountPanel
        email="alice@example.com"
        loading={false}
        busy={busy}
        rows={[
          row('studio', { selected: true, pairing: pairing === 'studio' }),
          row('laptop', {}),
          row('office', {
            added: true,
            disabled: true,
            detail: t.pairAccount.added,
          }),
        ]}
        selectedCount={1}
        onToggle={onToggle}
        onAdd={onAdd}
        onRefresh={vi.fn()}
        onSignIn={vi.fn()}
        onSignOut={vi.fn()}
        onDelete={vi.fn()}
        onManage={vi.fn()}
        onRevoke={vi.fn()}
      />,
    );
  await act(async () => render(false, undefined));
  const symbols = (id: string) =>
    [...button(`account-computer-${id}`).querySelectorAll('i')].map((i) => i.dataset['symbol']);
  expect(symbols('studio')).toEqual(['desktopcomputer', 'checkmark']);
  expect(symbols('laptop')).toEqual(['desktopcomputer']);
  expect(symbols('office')).toEqual(['desktopcomputer']);
  expect(button('account-computer-office').textContent).toContain(t.pairAccount.added);
  expect(button('account-computer-office').disabled).toBe(true);
  await click('account-computer-laptop');
  expect(onToggle).toHaveBeenCalledWith('laptop');
  expect(button('account-add-selected').textContent).toBe(t.pairAccount.addSelected(1));
  await click('account-add-selected');
  expect(onAdd).toHaveBeenCalledTimes(1);
  await act(async () => render(true, 'studio'));
  expect(button('account-computer-studio').querySelector('progress')).not.toBeNull();
  expect(button('account-computer-studio').textContent).toContain(t.pairAccount.pairing);
  expect(button('account-add-selected').dataset['busy']).toBe('true');
  expect(button('account-add-selected').disabled).toBe(true);
});

it('recovers the native QA scenario after unlink succeeds but refreshing the list fails', async () => {
  await render('linked-computers-refresh-failure');
  await click('account-manage-computers');
  await click('account-computer-hoffline');
  await act(async () => {
    await confirmations[0]?.confirm();
  });
  expect(host.textContent).toContain(t.pairRefused['relay-unavailable']);
  expect(button('account-computer-hlegacy').disabled).toBe(true);
  const refresh = host.querySelector<HTMLButtonElement>(
    `button[aria-label="${t.pairAccount.refresh}"]`,
  );
  expect(refresh).not.toBeNull();
  await act(async () => {
    refresh?.click();
  });
  expect(host.textContent).not.toContain(t.pairRefused['relay-unavailable']);
  expect(button('account-computer-hlegacy').disabled).toBe(false);
  expect(host.querySelector('[data-testid="account-computer-hoffline"]')).toBeNull();
});

it('shows a safe, copyable account-list diagnostic after refresh fails', async () => {
  const { fixture } = await render('connection-diagnostics-list');
  await click('account-refresh');
  const requestsBeforeDetails = fixture.getSnapshot();
  expect(host.textContent).toContain(t.pairRefused['relay-unavailable']);
  expect(button('account-computer-hstudio')).toBeTruthy();
  await click('connection-details-account');
  expect(host.textContent).toContain('stage: environment-list');
  expect(host.textContent).toContain('http: 503');
  expect(host.textContent).not.toContain('fixture-refresh');
  await click('connection-copy-account');
  const clipboard = await import('expo-clipboard');
  expect(clipboard.setStringAsync).toHaveBeenCalledWith(expect.stringContaining('http: 503'));
  expect(button('connection-copy-account').textContent).toBe(t.connectionDiagnostic.copied);
  expect(fixture.getSnapshot()).toBe(requestsBeforeDetails);
});
