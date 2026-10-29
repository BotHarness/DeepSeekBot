// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const nativeMenu = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const DropdownMenu = ({ expanded, children }: { expanded: boolean; children: ReactNode }) =>
    createElement('div', { 'data-expanded': String(expanded) }, children);
  DropdownMenu.Trigger = pass;
  DropdownMenu.Items = ({ children }: { children: ReactNode }) =>
    createElement('ul', null, children);
  const DropdownMenuItem = ({
    children,
    onClick,
    elementColors,
  }: {
    children: ReactNode;
    onClick(): void;
    elementColors?: { textColor?: string };
  }) => createElement('li', { onClick, 'data-color': elementColors?.textColor ?? '' }, children);
  DropdownMenuItem.Text = pass;
  return {
    ...nativeMenu,
    Box: () => null,
    DropdownMenu,
    DropdownMenuItem,
    HorizontalDivider: () => createElement('hr'),
    Host: ({ children }: { children?: ReactNode }) =>
      createElement('section', { 'data-compose-host': '' }, children),
    Text: pass,
  };
});
vi.mock('../src/ui/shell/icons', async () => ({
  ...(await import('./shell-icons-shim')),
  MoreIcon: () => null,
}));
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-menu-shim')).modifiers,
);

import { ActionMenuButton } from '../src/ui/primitives/action-menu-button.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('Android action menu', () => {
  it('exposes a stable file-menu identifier and disables its anchored trigger while stale', () => {
    const share = vi.fn();
    host = document.createElement('div');
    root = createRoot(host);
    const props = {
      label: 'Actions for report.pdf',
      testID: 'channel-file-actions-original',
      onOpen: () => undefined,
      actions: [
        { label: 'Share', icon: 'share' as const, run: share },
        { label: 'View message', icon: 'chat' as const, run: () => {} },
      ],
    };
    act(() => root!.render(createElement(ActionMenuButton, { ...props, disabled: true })));
    const trigger = () =>
      host!.querySelector<HTMLButtonElement>('[data-testid="channel-file-actions-original"]')!;
    expect(trigger().disabled).toBe(true);
    act(() => trigger().click());
    expect(host.querySelector('[data-expanded]')?.getAttribute('data-expanded')).toBe('false');
    act(() => root!.render(createElement(ActionMenuButton, props)));
    act(() => trigger().click());
    expect(host.querySelector('[data-expanded]')?.getAttribute('data-expanded')).toBe('true');
    act(() => root!.render(createElement(ActionMenuButton, { ...props, disabled: true })));
    act(() => root!.render(createElement(ActionMenuButton, props)));
    expect(host.querySelector('[data-expanded]')?.getAttribute('data-expanded')).toBe('false');
    act(() => trigger().click());
    expect(
      [...host.querySelectorAll('[data-symbol]')].map((icon) => icon.getAttribute('data-symbol')),
    ).toEqual(['share', 'chat']);
    act(() => host!.querySelector<HTMLElement>('li')!.click());
    expect(share).toHaveBeenCalledOnce();
  });
  it('opens a native dropdown from ⋯ and runs the chosen action', () => {
    const customize = vi.fn();
    const unpair = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        createElement(ActionMenuButton, {
          label: 'More for Studio',
          onOpen: () => undefined,
          actions: [
            { label: 'Customize', icon: 'settings', run: customize },
            { label: 'Unpair', icon: 'close', run: unpair, destructive: true },
          ],
        }),
      ),
    );
    const menu = () => host?.querySelector('[data-expanded]');
    expect(menu()?.getAttribute('data-expanded')).toBe('false');
    act(() => host?.querySelector<HTMLElement>('[aria-label="More for Studio"]')?.click());
    expect(menu()?.getAttribute('data-expanded')).toBe('true');
    const items = [...(host?.querySelectorAll('li') ?? [])];
    expect(items.map((item) => item.textContent)).toEqual(['Customize', 'Unpair']);
    expect(items.every((item) => item.querySelector('i[data-symbol]'))).toBe(true);
    act(() => items[1]?.click());
    expect(unpair).toHaveBeenCalledOnce();
    expect(customize).not.toHaveBeenCalled();
    expect(menu()?.getAttribute('data-expanded')).toBe('false');
  });

  it('stacks ⋯ above the Compose host so the host never takes its taps', () => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() =>
      root?.render(
        createElement(ActionMenuButton, {
          label: 'More for Studio',
          onOpen: () => undefined,
          actions: [{ label: 'Customize', icon: 'settings', run: () => undefined }],
        }),
      ),
    );
    const compose = host.querySelector('[data-compose-host]');
    const trigger = host.querySelector('[aria-label="More for Studio"]');
    expect(compose?.parentElement).toBe(trigger?.parentElement);
    expect(compose?.nextElementSibling).toBe(trigger);
  });
});

vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
