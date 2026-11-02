// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-symbols', () => ({
  SymbolView: (props: { name: { android: string } }) => <i data-symbol={props.name.android} />,
}));

import {
  AccountPanel,
  type AccountComputerRow,
  type AccountPanelProps,
} from '../src/ui/primitives/account-panel';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

const row = (id: string, patch: Partial<AccountComputerRow> = {}): AccountComputerRow => ({
  id,
  name: id,
  detail: t.pairAccount.online,
  added: false,
  selected: false,
  pairing: false,
  disabled: false,
  ...patch,
});

function render(props: Partial<AccountPanelProps>) {
  host ??= document.createElement('div');
  document.body.append(host);
  root ??= createRoot(host);
  const all: AccountPanelProps = {
    email: 'alice@example.com',
    loading: false,
    busy: false,
    rows: [],
    selectedCount: 0,
    onToggle: vi.fn(),
    onAdd: vi.fn(),
    onRefresh: vi.fn(),
    onSignIn: vi.fn(),
    onSignOut: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };
  act(() => root!.render(<AccountPanel {...all} />));
  return all;
}
const find = (label: string) =>
  [...host.querySelectorAll('button')].find((node) =>
    node.getAttribute('aria-label')?.startsWith(label),
  );

it('selects whole Environment rows with a checkmark and no checkbox', () => {
  const props = render({
    rows: [
      row('studio', { selected: true }),
      row('laptop'),
      row('office', { added: true, disabled: true, detail: t.pairAccount.added }),
    ],
    selectedCount: 1,
  });
  expect(host.querySelector('input[type="checkbox"]')).toBeNull();
  expect(find('studio')!.querySelector('[data-symbol="check"]')).not.toBeNull();
  expect(find('laptop')!.querySelector('[data-symbol]')).toBeNull();
  expect(find('office')).toBeUndefined();
  expect(host.textContent).toContain(`office${t.pairAccount.added}`);
  act(() => find('laptop')!.click());
  expect(props.onToggle).toHaveBeenCalledWith('laptop');
  const add = find(t.pairAccount.addSelected(1))!;
  act(() => add.click());
  expect(props.onAdd).toHaveBeenCalledTimes(1);
});

it('shows each row pairing in place and keeps the add action busy', () => {
  render({
    rows: [row('studio', { selected: true, pairing: true })],
    selectedCount: 1,
    busy: true,
  });
  expect(host.textContent).toContain(t.pairAccount.pairing);
  expect(host.querySelectorAll('[role="progressbar"]')).toHaveLength(2);
  expect(find(t.pairAccount.addSelected(1))!.disabled).toBe(true);
  expect(find('studio')).toBeUndefined();
});

it('hides the add action until the account lists Environments', () => {
  render({ rows: undefined });
  expect(find(t.pairAccount.choose)).toBeUndefined();
  render({ rows: [row('studio')] });
  expect(find(t.pairAccount.choose)!.disabled).toBe(true);
});
