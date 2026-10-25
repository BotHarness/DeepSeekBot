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

vi.mock('@expo/ui', () => ({ Host: ({ children }: NativeProps) => <div>{children}</div> }));
vi.mock('@expo/ui/swift-ui/modifiers', () =>
  Object.fromEntries(
    [
      'accessibilityHidden',
      'accessibilityLabel',
      'buttonStyle',
      'disabled',
      'font',
      'foregroundStyle',
      'frame',
      'labelStyle',
      'offset',
      'tint',
    ].map((kind) => [kind, (value: unknown) => ({ kind, value })]),
  ),
);
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
