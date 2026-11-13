// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  focused: true,
  canBack: true,
  index: 1,
  held: false,
  reduced: false,
  goBack: vi.fn(),
  watchers: new Set<() => void>(),
  native: {} as { active: boolean; reducedMotion: boolean; onBack(): void },
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-router', () => ({
  useIsFocused: () => state.focused,
  useNavigation: () => ({ canGoBack: () => state.canBack, goBack: state.goBack }),
}));
vi.mock('expo-router/react-navigation', () => ({
  useNavigationState: (select: (value: { index: number }) => unknown) =>
    select({ index: state.index }),
}));
vi.mock('expo', async () => {
  const { View } = await import('./react-native-shim');
  return {
    requireNativeView: () => (props: typeof state.native) => {
      state.native = props;
      return View(props);
    },
  };
});
vi.mock('../src/ui/shell/back-owner', () => ({
  backHeld: () => state.held,
  watchBackHeld: (listener: () => void) => {
    state.watchers.add(listener);
    return () => state.watchers.delete(listener);
  },
}));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => state.reduced,
}));
const { PredictivePage } = await import('../src/ui/shell/predictive-page.android');
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let container: HTMLDivElement;
const render = async () =>
  act(async () =>
    root.render(
      <PredictivePage>
        <input defaultValue="retained draft" />
      </PredictivePage>,
    ),
  );
beforeEach(() => {
  state.focused = true;
  state.canBack = true;
  state.index = 1;
  state.held = false;
  state.reduced = false;
  state.goBack.mockClear();
  container = document.createElement('div');
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
});
it('keeps the same editable child when a local Back owner takes priority', async () => {
  await render();
  const input = container.querySelector('input');
  expect(state.native.active).toBe(true);
  await act(async () => {
    state.held = true;
    for (const notify of state.watchers) notify();
  });
  expect(state.native.active).toBe(false);
  expect(container.querySelector('input')).toBe(input);
  await act(async () => {
    state.held = false;
    for (const notify of state.watchers) notify();
  });
  expect(state.native.active).toBe(true);
  expect(input?.value).toBe('retained draft');
});
it('does not intercept an unfocused page or the root', async () => {
  state.focused = false;
  await render();
  expect(state.native.active).toBe(false);
  state.focused = true;
  state.index = 0;
  state.canBack = false;
  await render();
  expect(state.native.active).toBe(false);
});
it('only commits through the existing navigation and rechecks whether it can go back', async () => {
  await render();
  expect(state.goBack).not.toHaveBeenCalled();
  state.native.onBack();
  expect(state.goBack).toHaveBeenCalledTimes(1);
  state.canBack = false;
  state.native.onBack();
  expect(state.goBack).toHaveBeenCalledTimes(1);
});
it('updates the native reduced-motion preference without remounting the page', async () => {
  await render();
  const input = container.querySelector('input');
  state.reduced = true;
  await render();
  expect(state.native.reducedMotion).toBe(true);
  expect(container.querySelector('input')).toBe(input);
});

it('activates from the rendered stack even while the imperative accessor sees the previous render', async () => {
  state.canBack = false;
  state.index = 1;
  await render();
  expect(state.native.active).toBe(true);
  state.canBack = true;
  state.native.onBack();
  expect(state.goBack).toHaveBeenCalledTimes(1);
});
