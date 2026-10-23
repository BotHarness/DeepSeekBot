// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-symbols', () => ({ SymbolView: () => createElement('i') }));
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-menu-shim')).modifiers,
);
vi.mock('@expo/ui/jetpack-compose', async () => {
  const native = (await import('./compose-menu-shim')).components;
  const DropdownMenu = ({ expanded, children }: { expanded: boolean; children: ReactNode }) =>
    expanded ? children : null;
  DropdownMenu.Trigger = () => null;
  DropdownMenu.Items = ({ children }: { children: ReactNode }) => children;
  return { ...native, Box: () => null, DropdownMenu };
});

import { EnvironmentPicker } from '../src/ui/primitives/environment-picker.android';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('announces the current Host and selects another once before closing the menu', () => {
  const onChange = vi.fn();
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    act(() =>
      root.render(
        createElement(EnvironmentPicker, {
          label: 'Computer',
          placeholder: 'Choose',
          value: 'a',
          options: [
            { value: 'a', label: 'Studio' },
            { value: 'b', label: 'Laptop' },
          ],
          onChange,
        }),
      ),
    );
    act(() => host.querySelector<HTMLElement>('[aria-label="Computer: Studio"]')?.click());
    const rows = [...host.querySelectorAll<HTMLElement>('[role="radio"]')];
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual(['Studio', 'Laptop']);
    act(() => rows[1]?.click());
    expect(onChange).toHaveBeenCalledExactlyOnceWith('b');
    expect(host.querySelector('[role="radio"]')).toBeNull();
  } finally {
    act(() => root.unmount());
  }
});
