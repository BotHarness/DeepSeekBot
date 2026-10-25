// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  saved: JSON.stringify({ language: 'zh', appearance: 'dark' }),
  locales: ['en-US'],
  foreground: undefined as ((state: string) => void) | undefined,
  appearance: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'document' },
  File: class {
    exists = true;
    async text() {
      return native.saved;
    }
    create() {}
    writeSync(value: string) {
      native.saved = value;
    }
  },
}));
vi.mock('expo-localization', () => ({
  getLocales: () => native.locales.map((languageTag) => ({ languageTag })),
}));
vi.mock('react-native', () => ({
  Appearance: { setColorScheme: native.appearance },
  AppState: {
    addEventListener: (_event: string, callback: (state: string) => void) => {
      native.foreground = callback;
      return { remove: native.remove };
    },
  },
}));
import { useNativeInterfacePreferences } from '../src/ui/native-interface-preferences';
import { interfacePreferences } from '../src/ui/interface-preferences';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('restores before showing content, updates native appearance and refreshes system language on foreground', async () => {
  function App() {
    const state = useNativeInterfacePreferences();
    return state.loaded ? (
      <span>
        {state.locale}:{state.appearance}
      </span>
    ) : null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<App />));
    expect(host.textContent).toBe('zh:dark');
    expect(native.appearance).toHaveBeenLastCalledWith('dark');
    await act(async () => interfacePreferences.setAppearance('light'));
    expect(native.appearance).toHaveBeenLastCalledWith('light');
    await act(async () => interfacePreferences.setAppearance('system'));
    expect(native.appearance).toHaveBeenLastCalledWith('auto');
    await act(async () => interfacePreferences.setLanguage('system'));
    expect(host.textContent).toBe('en:system');
    native.locales = ['ja-JP', 'zh-Hans-CN'];
    await act(async () => native.foreground?.('active'));
    expect(host.textContent).toBe('zh:system');
    await act(async () => interfacePreferences.setLanguage('en'));
    await act(async () => native.foreground?.('active'));
    expect(host.textContent).toBe('en:system');
    expect(JSON.parse(native.saved)).toEqual({ language: 'en', appearance: 'system' });
  } finally {
    await act(async () => root.unmount());
    expect(native.remove).toHaveBeenCalledOnce();
  }
});
