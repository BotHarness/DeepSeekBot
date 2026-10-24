// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Keyboard: { dismiss: vi.fn() },
}));
vi.mock('../src/cloud/available', () => ({ cloudAvailable: true }));
vi.mock('../src/ui/shell/icons', () => ({ PlusIcon: () => null }));
vi.mock('../src/ui/haptics', () => ({ haptic: vi.fn() }));
vi.mock('@expo/ui/jetpack-compose/modifiers', async () => ({
  ...(await import('./compose-menu-shim')).modifiers,
  fillMaxSize: () => ({}),
  testID: () => ({}),
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const nativeMenu = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const DropdownMenu = ({
    expanded,
    onDismissRequest,
    children,
  }: {
    expanded: boolean;
    onDismissRequest(): void;
    children: ReactNode;
  }) =>
    expanded
      ? createElement(
          'section',
          null,
          createElement('button', { 'aria-label': 'dismiss', onClick: onDismissRequest }),
          children,
        )
      : null;
  DropdownMenu.Trigger = () => null;
  DropdownMenu.Items = pass;
  const DropdownMenuItem = ({
    children,
    onClick,
    enabled,
  }: {
    children: ReactNode;
    onClick(): void;
    enabled?: boolean;
  }) =>
    createElement(
      'button',
      { onClick, disabled: enabled === false, 'data-menu-item': '' },
      children,
    );
  DropdownMenuItem.Text = pass;
  return { ...nativeMenu, Box: pass, Host: pass, Text: pass, DropdownMenu, DropdownMenuItem };
});
import { PlusMenuButton } from '../src/ui/primitives/plus-menu-button.android';
import { haptic } from '../src/ui/haptics';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLElement;
const pick = vi.fn();
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  vi.clearAllMocks();
});
function render(disabled = false) {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <PlusMenuButton
        label="Attach"
        testID="composer-attach"
        size={48}
        disabled={disabled}
        items={['Photos', 'Camera', 'Files'].map((label) => ({
          id: label,
          label,
          symbol: '',
          run: () => pick(label),
        }))}
      />,
    ),
  );
}
function click(label: string) {
  const button = [...host.querySelectorAll<HTMLElement>('button, [role=button]')].find(
    (b) => b.getAttribute('aria-label') === label || b.textContent === label,
  );
  expect(button).toBeDefined();
  act(() => button!.click());
}
it('opens a three-item M3 menu once and dismisses without picking or extra feedback', () => {
  render();
  click('Attach');
  click('Attach');
  expect(haptic).toHaveBeenCalledExactlyOnceWith('menu');
  expect([...host.querySelectorAll('[data-menu-item]')].map((e) => e.textContent)).toEqual([
    'Photos',
    'Camera',
    'Files',
  ]);
  click('dismiss');
  expect(pick).not.toHaveBeenCalled();
  expect(haptic).toHaveBeenCalledOnce();
  expect(host.querySelector('section')).toBeNull();
});
it('closes and dispatches each source without a second selection haptic', () => {
  render();
  for (const label of ['Photos', 'Camera', 'Files']) {
    click('Attach');
    click(label);
    expect(host.querySelector('section')).toBeNull();
  }
  expect(pick.mock.calls).toEqual([['Photos'], ['Camera'], ['Files']]);
  expect(haptic).toHaveBeenCalledTimes(3);
});
it('does not open, select or vibrate while attachment capacity is exhausted', () => {
  render(true);
  click('Attach');
  expect(host.querySelector('section')).toBeNull();
  expect(pick).not.toHaveBeenCalled();
  expect(haptic).not.toHaveBeenCalled();
});

vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
