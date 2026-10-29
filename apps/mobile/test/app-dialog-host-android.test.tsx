// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  Keyboard: { dismiss() {} },
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const nativeMenu = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const slot =
    (name: string) =>
    ({ children }: { children?: ReactNode }) =>
      createElement('section', { 'data-slot': name }, children);
  const AlertDialog = ({
    children,
    properties,
  }: {
    children: ReactNode;
    properties: { dismissOnBackPress: boolean };
  }) =>
    createElement(
      'div',
      { role: 'dialog', 'data-back': String(properties.dismissOnBackPress) },
      children,
    );
  AlertDialog.Title = slot('title');
  AlertDialog.Text = slot('text');
  AlertDialog.ConfirmButton = slot('confirm');
  AlertDialog.DismissButton = slot('dismiss');
  const TextButton = ({
    children,
    onClick,
    enabled,
    colors,
  }: {
    children: ReactNode;
    onClick(): void;
    enabled?: boolean;
    colors?: { contentColor?: string };
  }) =>
    createElement(
      'button',
      { onClick, disabled: enabled === false, 'data-color': colors?.contentColor ?? '' },
      children,
    );
  const ModalBottomSheet = ({ children }: { children: ReactNode }) =>
    createElement('div', { role: 'menu' }, children);
  const ListItem = ({
    children,
    modifiers,
  }: {
    children: ReactNode;
    modifiers?: Array<{ onClick?: () => void }>;
  }) =>
    createElement(
      'li',
      {
        onClick: modifiers?.[0]?.onClick,
        'data-clickable': String(modifiers !== undefined),
      },
      children,
    );
  ListItem.HeadlineContent = pass;
  const DropdownMenu = ({
    children,
    expanded,
    onDismissRequest,
  }: {
    children: ReactNode;
    expanded: boolean;
    onDismissRequest(): void;
  }) =>
    createElement(
      'div',
      { role: 'listbox', 'data-expanded': String(expanded), onKeyDown: onDismissRequest },
      children,
    );
  DropdownMenu.Trigger = pass;
  DropdownMenu.Items = pass;
  return {
    ...nativeMenu,
    AlertDialog,
    Column: ({ children, modifiers }: { children?: ReactNode; modifiers?: { id?: string }[] }) =>
      createElement('section', { 'data-testid': modifiers?.find((m) => m.id)?.id }, children),
    Box: () => null,
    DropdownMenu,
    HorizontalDivider: () => createElement('hr'),
    Host: ({
      children,
      style,
    }: {
      children?: ReactNode;
      style?: { left?: number; top?: number };
    }) =>
      createElement(
        'div',
        { 'data-host': '', 'data-left': style?.left, 'data-top': style?.top },
        children,
      ),
    ListItem,
    ModalBottomSheet,
    Text: pass,
    TextButton,
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', async () => ({
  ...(await import('./compose-menu-shim')).modifiers,
  clickable: (onClick: () => void) => ({ onClick }),
}));

import { AppDialogHost } from '../src/ui/primitives/app-dialog-host.android';
import { appDialogs } from '../src/ui/primitives/dialog-state';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  appDialogs.dismiss();
});

function mount() {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(createElement(AppDialogHost)));
  return host;
}
const buttons = (view: HTMLElement, slot: string) => [
  ...view.querySelectorAll<HTMLButtonElement>(`[data-slot="${slot}"] button`),
];

describe('Android dialogs use the Material 3 AlertDialog', () => {
  it('places the conversation avatar and name in a separate header above three commands', () => {
    const view = mount();
    act(() =>
      appDialogs.open(
        'Launch team',
        undefined,
        [
          { text: 'Pin', icon: 'pin' },
          { text: 'Move to section', icon: 'folder' },
          { text: 'Mute', icon: 'mute' },
        ],
        'menu',
        createElement('img', { alt: 'Launch avatar' }),
      ),
    );
    const header = view.querySelector('[data-testid="action-menu-header"]')!;
    expect(header.textContent).toBe('Launch team');
    expect(header.querySelector('img')?.alt).toBe('Launch avatar');
    const items = [...view.querySelectorAll('[data-menu-item]')];
    expect(items.map((item) => item.textContent)).toEqual(['Pin', 'Move to section', 'Mute']);
    expect(items.every((item) => item.querySelector('i[data-symbol]'))).toBe(true);
    expect(header.contains(items[0]!)).toBe(false);
  });
  it('anchors a long-press menu at the finger as an Expressive dropdown instead of a sheet', () => {
    const pin = vi.fn();
    const view = mount();
    act(() =>
      appDialogs.open(
        'Launch team',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', icon: 'remove', style: 'destructive' },
          { text: 'Pin', icon: 'pin', onPress: pin },
        ],
        'menu',
        createElement('img', { alt: 'Launch avatar' }),
        { x: 120, y: 340 },
      ),
    );
    expect(view.querySelector('[role="menu"]')).toBeNull();
    expect(view.querySelector('[data-testid="action-menu-header"]')).toBeNull();
    const menu = view.querySelector('[role="listbox"]')!;
    expect(menu.getAttribute('data-expanded')).toBe('true');
    const anchor = menu.closest('[data-host]')!;
    expect([anchor.getAttribute('data-left'), anchor.getAttribute('data-top')]).toEqual([
      '120',
      '340',
    ]);
    const items = [...menu.querySelectorAll<HTMLElement>('[data-menu-item]')];
    expect(items.map((item) => item.textContent)).toEqual(['Pin', 'Delete']);
    act(() => items[0]!.click());
    expect(pin).toHaveBeenCalledOnce();
  });

  it('confirms with Cancel as the dismiss button and the destructive action as confirm', async () => {
    const unpair = vi.fn(async () => undefined);
    const view = mount();
    act(() =>
      appDialogs.open('Unpair Studio?', 'Phone only', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Unpair', style: 'destructive', onPress: unpair },
      ]),
    );
    expect(view.querySelector('[data-slot="title"]')?.textContent).toBe('Unpair Studio?');
    expect(view.querySelector('[data-slot="text"]')?.textContent).toBe('Phone only');
    expect(buttons(view, 'dismiss').map((button) => button.textContent)).toEqual(['Cancel']);
    const [confirm] = buttons(view, 'confirm');
    expect(confirm?.textContent).toBe('Unpair');
    expect(confirm?.dataset.color).not.toBe('');
    await act(async () => confirm?.click());
    expect(unpair).toHaveBeenCalledOnce();
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  });

  it('shows icon and label rows with destructive commands grouped last', () => {
    const open = vi.fn();
    const remove = vi.fn();
    const view = mount();
    act(() =>
      appDialogs.open(
        'Ada',
        undefined,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove', icon: 'remove', style: 'destructive', onPress: remove },
          { text: 'Open profile', icon: 'person', onPress: open },
        ],
        'menu',
      ),
    );
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    const items = [...view.querySelectorAll('[role="menu"] li')];
    expect(items.map((item) => item.textContent)).toEqual(['Ada', 'Open profile', 'Remove']);
    expect(items.slice(1).every((item) => item.querySelector('i[data-symbol]'))).toBe(true);
    expect(items[0]?.getAttribute('data-clickable')).toBe('false');
    act(() => (items[1] as HTMLElement).click());
    expect(open).toHaveBeenCalledOnce();
    expect(remove).not.toHaveBeenCalled();
  });

  it('blocks Back and both buttons while the action is pending', async () => {
    let finish: () => void = () => undefined;
    const view = mount();
    act(() =>
      appDialogs.open('Sign out?', undefined, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => new Promise<void>((resolve) => (finish = resolve)),
        },
      ]),
    );
    act(() => buttons(view, 'confirm')[0]?.click());
    expect(view.querySelector('[role="dialog"]')?.getAttribute('data-back')).toBe('false');
    expect(buttons(view, 'confirm')[0]?.disabled).toBe(true);
    expect(buttons(view, 'dismiss')[0]?.disabled).toBe(true);
    await act(async () => finish());
    expect(view.querySelector('[role="dialog"]')).toBeNull();
  });
});

vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
