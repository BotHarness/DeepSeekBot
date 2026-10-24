// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name, tintColor }: { name: { android: string }; tintColor: string }) =>
    createElement('i', { 'data-symbol': name.android, 'data-color': tintColor }),
}));
vi.mock('@expo/ui/jetpack-compose', async () => {
  const nativeMenu = (await import('./compose-menu-shim')).components;
  const pass = ({ children }: { children?: ReactNode }) => children ?? null;
  const DropdownMenu = ({ expanded, children }: { expanded: boolean; children: ReactNode }) =>
    createElement('section', { 'data-expanded': String(expanded) }, children);
  DropdownMenu.Trigger = pass;
  DropdownMenu.Items = ({ children }: { children: ReactNode }) =>
    createElement('ul', null, children);
  return { ...nativeMenu, Box: () => null, DropdownMenu };
});
vi.mock(
  '@expo/ui/jetpack-compose/modifiers',
  async () => (await import('./compose-menu-shim')).modifiers,
);

import { PreferenceRow } from '../src/ui/primitives/preference-row.android';
import { DesignThemeProvider, resolveTheme } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['light', 'dark'] as const)(
  'keeps option icons and one trailing check while selection follows the %s theme',
  async (scheme) => {
    const changed = vi.fn();
    function Screen() {
      const [value, setValue] = useState<'system' | 'light' | 'dark'>('light');
      return (
        <DesignThemeProvider appearance={{ scheme }}>
          <PreferenceRow
            title="Appearance"
            icon="appearance"
            testID="settings-appearance"
            value={value}
            options={[
              { value: 'system', label: 'Follow system', icon: 'system' },
              { value: 'light', label: 'Light', icon: 'light' },
              { value: 'dark', label: 'Dark', icon: 'dark' },
            ]}
            onChange={(next) => {
              changed(next);
              setValue(next);
            }}
          />
        </DesignThemeProvider>
      );
    }
    const host = document.createElement('div');
    const root = createRoot(host);
    const theme = resolveTheme(scheme, { scheme });
    const symbols = (item: Element) =>
      [...item.querySelectorAll('[data-symbol]')].map((node) => node.getAttribute('data-symbol'));
    try {
      await act(async () => root.render(<Screen />));
      await act(async () =>
        host.querySelector<HTMLButtonElement>('[data-testid="settings-appearance"]')!.click(),
      );
      const choices = [...host.querySelectorAll<HTMLElement>('[role="radio"]')];
      expect(choices.map((choice) => choice.textContent)).toEqual([
        'Follow system',
        'Light',
        'Dark',
      ]);
      expect(choices.map(symbols)).toEqual([
        ['smartphone'],
        ['light_mode', 'check'],
        ['dark_mode'],
      ]);
      expect(choices[1]!.getAttribute('data-fill')).toBe(theme.layer.sheet.chosen);
      expect(choices[1]!.querySelector('[data-symbol="check"]')!.getAttribute('data-color')).toBe(
        theme.color.accent,
      );
      await act(async () => choices[2]!.click());
      expect(changed).toHaveBeenCalledExactlyOnceWith('dark');
      expect(host.querySelector('[data-expanded]')!.getAttribute('data-expanded')).toBe('false');
      expect(host.querySelectorAll('[role="radio"] [data-symbol="check"]')).toHaveLength(1);
      expect(symbols(host.querySelector('[role="radio"][aria-checked="true"]')!)).toEqual([
        'dark_mode',
        'check',
      ]);
    } finally {
      await act(async () => root.unmount());
    }
  },
);
