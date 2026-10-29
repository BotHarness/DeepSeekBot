// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const native = vi.hoisted(() => ({
  window: { width: 400, height: 900, scale: 3, fontScale: 1 },
  listeners: new Set<() => void>(),
}));
vi.mock('react-native', () => ({
  Platform: { OS: 'android' },
  useColorScheme: () => 'dark',
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
import { useDesignTheme } from '../src/ui/design/theme';

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
