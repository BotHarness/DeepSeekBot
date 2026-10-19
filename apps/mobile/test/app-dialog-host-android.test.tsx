// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'android' },
  Keyboard: { dismiss() {} },
}));
vi.mock('@expo/ui/jetpack-compose', () => {
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
  return {
    AlertDialog,
    Column: pass,
    HorizontalDivider: () => createElement('hr'),
    Host: pass,
    ListItem,
    ModalBottomSheet,
    Text: pass,
    TextButton,
  };
});
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({
  clickable: (onClick: () => void) => ({ onClick }),
}));

import { AppDialogHost } from '../src/ui/primitives/app-dialog-host';
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

  it('shows a menu as a Material bottom sheet list with a divider before the destructive item', () => {
    const open = vi.fn();
    const remove = vi.fn();
    const view = mount();
    act(() =>
      appDialogs.open('Ada', undefined, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: remove },
        { text: 'Open profile', onPress: open },
      ]),
    );
    expect(view.querySelector('[role="dialog"]')).toBeNull();
    const items = [...view.querySelectorAll('[role="menu"] li')];
    expect(items.map((item) => item.textContent)).toEqual(['Ada', 'Remove', 'Open profile']);
    expect(view.querySelector('[role="menu"] hr')).not.toBeNull();
    expect(items[0]?.getAttribute('data-clickable')).toBe('false');
    act(() => (items[2] as HTMLElement).click());
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
