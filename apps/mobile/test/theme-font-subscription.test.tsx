// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const native = vi.hoisted(() => ({
  scheme: 'dark',
  window: { width: 400, height: 900, scale: 3, fontScale: 1 },
  listeners: new Set<() => void>(),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  useColorScheme: () => native.scheme,
  Dimensions: {
    get: () => native.window,
    addEventListener: (_name: string, changed: () => void) => {
      native.listeners.add(changed);
      return { remove: () => native.listeners.delete(changed) };
    },
  },
  useWindowDimensions: () =>
    useSyncExternalStore(
      (changed) => {
        native.listeners.add(changed);
        return () => native.listeners.delete(changed);
      },
      () => native.window,
    ),
}));
vi.mock('../src/ui/interface-preferences', () => ({
  interfacePreferences: { subscribe: () => () => {}, getSnapshot: () => preferences },
}));
const preferences = { appearance: 'system' };
import {
  AccentProvider,
  DesignThemeProvider,
  useDesignTheme,
  resolveTheme,
  type Appearance,
  type DesignTheme,
} from '../src/ui/design/theme';

it('ignores keyboard viewport changes while keeping real system font scaling live', async () => {
  let renders = 0;
  function Screen() {
    const theme = useDesignTheme();
    renders++;
    return <output>{theme.fontScale}</output>;
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  await act(() => root.render(<Screen />));
  const initial = renders;
  await act(() => {
    native.window = { ...native.window, height: 480 };
    native.listeners.forEach((changed) => changed());
  });
  expect(renders).toBe(initial);
  await act(() => {
    native.window = { ...native.window, height: 900, fontScale: 2 };
    native.listeners.forEach((changed) => changed());
  });
  expect(container.textContent).toBe('2');
  expect(renders).toBe(initial + 1);
  await act(() => root.unmount());
  expect(native.listeners.size).toBe(0);
});

it('shares resolved colors across consumers while isolating nested accents and appearance changes', async () => {
  const observed = new Map<string, DesignTheme>();
  function Probe({ id }: { id: string }) {
    const theme = useDesignTheme();
    observed.set(id, theme);
    return (
      <output>
        {id}:{theme.scheme}:{theme.color.accent}:{theme.fontScale}
      </output>
    );
  }
  const container = document.createElement('div');
  const root = createRoot(container);
  const render = (appearance: Appearance, accent?: string) =>
    root.render(
      <DesignThemeProvider appearance={appearance}>
        <Probe id="parent" />
        <Probe id="sibling" />
        <AccentProvider accent={accent}>
          <Probe id="child" />
          <Probe id="child-sibling" />
        </AccentProvider>
      </DesignThemeProvider>,
    );
  try {
    await act(() => render({ scheme: 'dark' }, '#5b2ecc'));
    expect(observed.get('parent')?.color).toBe(observed.get('sibling')?.color);
    expect(observed.get('child')?.color).toBe(observed.get('child-sibling')?.color);
    expect(observed.get('child')?.color).toEqual(
      resolveTheme('dark', { accent: '#5b2ecc' }, 'android').color,
    );
    expect(observed.get('child')?.color).not.toBe(observed.get('parent')?.color);
    await act(() => render({ scheme: 'light' }, '#FFD60A'));
    expect(observed.get('parent')?.scheme).toBe('light');
    expect(observed.get('child')?.color).toEqual(
      resolveTheme('dark', { scheme: 'light', accent: '#FFD60A' }, 'android').color,
    );
    await act(() => render({ scheme: 'light' }));
    expect(observed.get('child')?.color).toBe(observed.get('parent')?.color);
    const inherited: Appearance = {};
    await act(() => render(inherited));
    expect(observed.get('parent')?.scheme).toBe('dark');
    native.scheme = 'light';
    await act(() => render(inherited));
    expect(observed.get('parent')?.scheme).toBe('light');
    expect(observed.get('parent')?.color).toEqual(resolveTheme('light', {}, 'android').color);
  } finally {
    await act(() => root.unmount());
  }
});
