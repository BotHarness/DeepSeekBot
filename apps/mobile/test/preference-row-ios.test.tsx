// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { ios: string } }) =>
    createElement('i', { 'data-symbol': name.ios }),
}));
vi.mock('@expo/ui/swift-ui', () => {
  const pass = ({ children }: { children?: ReactNode }) => children;
  return {
    Host: pass,
    RNHostView: pass,
    Menu: ({
      label,
      children,
      testID,
      modifiers,
    }: {
      label: ReactNode;
      children: ReactNode;
      testID: string;
      modifiers: { label?: string }[];
    }) => (
      <section
        data-testid={testID}
        aria-label={modifiers.find((modifier) => modifier.label)?.label}
      >
        <div data-native-label>{label}</div>
        {children}
      </section>
    ),
    Picker: ({
      selection,
      onSelectionChange,
      children,
    }: {
      selection: string;
      onSelectionChange(value: string): void;
      children: ReactNode;
    }) => (
      <select
        aria-label="Native choices"
        value={selection}
        onChange={(event) => onSelectionChange(event.target.value)}
      >
        {children}
      </select>
    ),
    Text: ({ children, modifiers }: { children: ReactNode; modifiers: { value: string }[] }) => (
      <option value={modifiers[0]!.value}>{children}</option>
    ),
  };
});
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityElement: () => ({}),
  accessibilityLabel: (label: string) => ({ label }),
  buttonStyle: () => ({}),
  frame: () => ({}),
  pickerStyle: () => ({}),
  tag: (value: string) => ({ value }),
}));

import { PreferenceRow } from '../src/ui/primitives/preference-row.ios';
import { DesignThemeProvider } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it.each(['light', 'dark'] as const)(
  'shows the icon, label and current value on the native menu trigger in %s appearance',
  async (scheme) => {
    const changed = vi.fn();
    function Screen() {
      const [value, setValue] = useState<'system' | 'dark'>('system');
      return (
        <DesignThemeProvider appearance={{ scheme }}>
          <PreferenceRow
            title="Appearance"
            icon="appearance"
            testID="settings-appearance"
            value={value}
            options={[
              { value: 'system', label: 'Follow system' },
              { value: 'dark', label: 'Dark' },
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
    try {
      await act(async () => root.render(<Screen />));
      const trigger = host.querySelector('[data-testid="settings-appearance"]')!;
      const label = host.querySelector('[data-native-label]')!;
      expect(label.querySelector('[data-symbol="circle.lefthalf.filled"]')).not.toBeNull();
      expect(label.textContent).toBe('AppearanceFollow system');
      expect(trigger.getAttribute('aria-label')).toBe('Appearance, Follow system');
      expect(label.querySelector('button')!.disabled).toBe(true);
      const picker = host.querySelector('select')!;
      await act(async () => {
        picker.value = 'dark';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(changed).toHaveBeenCalledExactlyOnceWith('dark');
      expect(host.querySelector('[data-testid="settings-appearance"]')).toBe(trigger);
      expect(trigger.getAttribute('aria-label')).toBe('Appearance, Dark');
      expect(label.textContent).toBe('AppearanceDark');
    } finally {
      await act(async () => root.unmount());
    }
  },
);
