// @vitest-environment jsdom
import { act, type Context, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const safeArea = vi.hoisted(() => ({
  Insets: undefined as unknown as Context<{ bottom: number }>,
}));
vi.mock('react-native-safe-area-context', async () => {
  const react = await import('react');
  safeArea.Insets = react.createContext({ bottom: 34 });
  return {
    SafeAreaProvider: ({ children }: { children: ReactNode }) => children,
    useSafeAreaInsets: () => react.useContext(safeArea.Insets),
  };
});

import { useWindowInsets, WindowSafeAreaProvider } from '../src/ui/shell/window-insets';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root | undefined;
afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
});

function Probe() {
  return <span data-testid="bottom">{useWindowInsets().bottom}</span>;
}

function TabInsets({ children }: { children: ReactNode }) {
  return <safeArea.Insets value={{ bottom: 83 }}>{children}</safeArea.Insets>;
}

async function render(node: ReactNode) {
  const view = document.createElement('div');
  root = createRoot(view);
  await act(async () => root!.render(node));
  return view.querySelector('[data-testid="bottom"]')!.textContent;
}

it('keeps the window bottom inset inside a tab whose safe area includes the tab bar', async () => {
  expect(
    await render(
      <WindowSafeAreaProvider>
        <TabInsets>
          <Probe />
        </TabInsets>
      </WindowSafeAreaProvider>,
    ),
  ).toBe('34');
});

it('falls back to the nearest safe area outside the app stack', async () => {
  expect(
    await render(
      <TabInsets>
        <Probe />
      </TabInsets>,
    ),
  ).toBe('83');
});
