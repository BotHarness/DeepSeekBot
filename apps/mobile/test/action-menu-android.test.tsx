// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', async () => await import('./react-native-shim'));
vi.mock('@expo/ui/jetpack-compose', () => {
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
    Box: () => null,
    DropdownMenu,
    DropdownMenuItem,
    HorizontalDivider: () => createElement('hr'),
    Host: pass,
    Text: pass,
  };
});
vi.mock('../src/ui/shell/icons', () => ({ MoreIcon: () => null }));
vi.mock('@expo/ui/jetpack-compose/modifiers', () => ({ fillMaxSize: () => ({}) }));

import { ActionMenuButton } from '../src/ui/primitives/action-menu-button.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
});

describe('Android action menu', () => {
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
    expect(items[1]?.getAttribute('data-color')).not.toBe('');
    expect(items[1]?.previousElementSibling?.tagName).toBe('HR');
    act(() => items[1]?.click());
    expect(unpair).toHaveBeenCalledOnce();
    expect(customize).not.toHaveBeenCalled();
    expect(menu()?.getAttribute('data-expanded')).toBe('false');
  });
});
