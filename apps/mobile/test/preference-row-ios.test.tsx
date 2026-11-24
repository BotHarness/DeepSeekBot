// @vitest-environment jsdom
import { act, createElement, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: string | { ios: string } }) =>
    createElement('i', { 'data-symbol': typeof name === 'string' ? name : name.ios }),
}));
vi.mock('@expo/ui/swift-ui', () => {
  const pass = ({ children }: { children?: ReactNode }) => children;
  return {
    Host: pass,
    RNHostView: pass,
    Spacer: () => <span data-spacer />,
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
    Text: ({ children, modifiers }: { children: string; modifiers: { value: string }[] }) => (
      <option value={modifiers[0]!.value}>{children}</option>
    ),
  };
});
vi.mock('@expo/ui/swift-ui/modifiers', () => ({
  accessibilityElement: () => ({}),
  accessibilityLabel: (label: string) => ({ label }),
  buttonStyle: () => ({}),
  contentShape: () => ({}),
  frame: () => ({}),
  pickerStyle: () => ({}),
  shapes: { rectangle: () => ({}) },
  tag: (value: string) => ({ value }),
}));

import { Dimensions } from 'react-native';
import { PreferenceRow } from '../src/ui/primitives/preference-row.ios';
import { DesignThemeProvider } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

afterEach(() => {
  vi.restoreAllMocks();
});

it.each(['light', 'dark'] as const)(
  'shows the icon, label, current value and pop-up chevrons on the native menu trigger in %s appearance',
  async (scheme) => {
    const changed = vi.fn();
    function Screen() {
      const [value, setValue] = useState<'system' | 'light' | 'dark'>('system');
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
    try {
      await act(async () => root.render(<Screen />));
      const trigger = host.querySelector('[data-testid="settings-appearance"]')!;
      const label = host.querySelector('[data-native-label]')!;
      expect(label.querySelector('[data-symbol="circle.lefthalf.filled"]')).not.toBeNull();
      expect(label.querySelector('[data-symbol="chevron.up.chevron.down"]')).not.toBeNull();
      expect(label.textContent).toBe('AppearanceFollow system');
      expect(trigger.getAttribute('aria-label')).toBe('Appearance, Follow system');
      expect(label.querySelector('button')!.disabled).toBe(true);
      const picker = host.querySelector('select')!;
      expect([...picker.options].map((option) => [option.value, option.textContent])).toEqual([
        ['system', 'Follow system'],
        ['light', 'Light'],
        ['dark', 'Dark'],
      ]);
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

it.each(['light', 'dark'] as const)(
  'keeps language tags as plain text choices and the selected language in %s appearance',
  async (scheme) => {
    const changed = vi.fn();
    function Screen() {
      const [value, setValue] = useState<'system' | 'zh' | 'en'>('system');
      return (
        <DesignThemeProvider appearance={{ scheme }}>
          <PreferenceRow
            title="Language"
            icon="language"
            testID="settings-language"
            value={value}
            options={[
              { value: 'system', label: 'Follow system', icon: 'system' },
              { value: 'zh', label: '简体中文', icon: 'language' },
              { value: 'en', label: 'English', icon: 'language' },
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
      const trigger = host.querySelector('[data-testid="settings-language"]')!;
      const picker = host.querySelector('select')!;
      expect([...picker.options].map((option) => [option.value, option.textContent])).toEqual([
        ['system', 'Follow system'],
        ['zh', '简体中文'],
        ['en', 'English'],
      ]);
      for (const [value, label] of [
        ['zh', '简体中文'],
        ['en', 'English'],
        ['system', 'Follow system'],
      ]) {
        await act(async () => {
          picker.value = value!;
          picker.dispatchEvent(new Event('change', { bubbles: true }));
        });
        expect(changed).toHaveBeenLastCalledWith(value);
        expect(picker.value).toBe(value);
        expect(host.querySelector('[data-testid="settings-language"]')).toBe(trigger);
        expect(trigger.getAttribute('aria-label')).toBe(`Language, ${label}`);
      }
    } finally {
      await act(async () => root.unmount());
    }
  },
);

it.each(['light', 'dark'] as const)(
  'puts the current value under the title as wrapping row text at accessibility sizes in %s appearance',
  async (scheme) => {
    vi.spyOn(Dimensions, 'get').mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 3.1,
    });
    const changed = vi.fn();
    function Screen() {
      const [value, setValue] = useState<'bearer' | 'query'>('bearer');
      return (
        <DesignThemeProvider appearance={{ scheme }}>
          <PreferenceRow
            title="Authentication"
            testID="voice-template-auth"
            value={value}
            options={[
              { value: 'bearer', label: 'Authorization: Bearer', icon: 'access' },
              { value: 'query', label: 'Query parameter', icon: 'access' },
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
      const trigger = host.querySelector('[data-testid="voice-template-auth"]')!;
      const label = trigger.querySelector('[data-native-label]')!;
      expect(label.textContent).toBe('');
      expect(label.querySelector('[data-spacer]')).not.toBeNull();
      expect(trigger.getAttribute('aria-label')).toBe('Authentication, Authorization: Bearer');
      const row = host.firstElementChild!.firstElementChild!;
      expect(trigger.contains(row)).toBe(false);
      expect(row.textContent).toBe('AuthenticationAuthorization: Bearer');
      expect(row.querySelector('[data-symbol="chevron.up.chevron.down"]')).not.toBeNull();
      const picker = host.querySelector('select')!;
      await act(async () => {
        picker.value = 'query';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(changed).toHaveBeenCalledExactlyOnceWith('query');
      expect(trigger.getAttribute('aria-label')).toBe('Authentication, Query parameter');
      expect(host.firstElementChild!.firstElementChild!.textContent).toBe(
        'AuthenticationQuery parameter',
      );
    } finally {
      await act(async () => root.unmount());
    }
  },
);
