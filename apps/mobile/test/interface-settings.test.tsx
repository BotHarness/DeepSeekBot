// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
import { InterfaceSettings } from '../src/ui/interface-settings';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { useStrings } from '../src/ui/strings';
import { DesignThemeProvider, useDesignTheme } from '../src/ui/design/theme';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('updates mounted settings and theme immediately and preserves unrelated state', async () => {
  let saved: unknown;
  await interfacePreferences.restore({
    read: async () => undefined,
    write(value) {
      saved = structuredClone(value);
    },
  });
  interfacePreferences.setLanguage('en');
  interfacePreferences.setAppearance('system');
  function Screen() {
    const t = useStrings();
    const theme = useDesignTheme();
    return (
      <>
        <h1>{t.settings}</h1>
        <output>{theme.scheme}</output>
        <InterfaceSettings />
        <input defaultValue="unsent draft" />
        <div data-testid="chat-history" />
      </>
    );
  }
  function Preview() {
    const theme = useDesignTheme();
    return <span data-testid="preview">{theme.scheme}</span>;
  }
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <>
          <Screen />
          <DesignThemeProvider appearance={{ scheme: 'light' }}>
            <Preview />
          </DesignThemeProvider>
        </>,
      ),
    );
    const field = host.querySelector('input')!;
    const history = host.querySelector<HTMLElement>('[data-testid="chat-history"]')!;
    field.setSelectionRange(3, 6);
    history.scrollTop = 180;
    const press = async (id: string) => {
      await act(async () =>
        host.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!.click(),
      );
    };
    await press('settings-language');
    await press('settings-language-zh');
    expect(host.querySelector('h1')!.textContent).toBe('设置');
    expect(host.textContent).toContain('外观');
    await press('settings-appearance');
    await press('settings-appearance-dark');
    expect(host.querySelector('output')!.textContent).toBe('dark');
    expect(host.querySelector('[data-testid="preview"]')!.textContent).toBe('light');
    expect(saved).toEqual({ language: 'zh', appearance: 'dark' });
    expect(host.querySelector('input')).toBe(field);
    expect(field.value).toBe('unsent draft');
    expect(field.selectionStart).toBe(3);
    expect(host.querySelector('[data-testid="chat-history"]')).toBe(history);
    expect(history.scrollTop).toBe(180);
    await press('settings-language');
    await press('settings-language-en');
    expect(host.querySelector('h1')!.textContent).toBe('Settings');
  } finally {
    await act(async () => root.unmount());
    interfacePreferences.setLanguage('system');
    interfacePreferences.setAppearance('system');
    host.remove();
  }
});
