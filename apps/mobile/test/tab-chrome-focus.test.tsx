// @vitest-environment jsdom
import { act, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

type Scroll = { onScroll(event: unknown): void };

const state = vi.hoisted(() => ({
  focus: undefined as (() => void | (() => void)) | undefined,
  handler: undefined as Scroll | undefined,
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => true,
}));
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  return {
    ...shim,
    useSharedValue: <T,>(initial: T) => useRef({ value: initial }).current,
    useAnimatedScrollHandler: (handlers: Scroll) => {
      state.handler = handlers;
      return handlers;
    },
  };
});
vi.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    state.focus = effect;
  },
}));

const { TabChromeContext, useHideChromeOnScroll } = await import('../src/ui/shell/tab-chrome');
const { interfacePreferences } = await import('../src/ui/interface-preferences');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const at = (y: number) => ({
  contentOffset: { y },
  contentInset: { top: 0, bottom: 0 },
  contentSize: { height: 4000 },
  layoutMeasurement: { height: 800 },
});

function Probe({ enabled }: { enabled: boolean }) {
  useHideChromeOnScroll(enabled);
  return null;
}

describe('hiding the chrome on scroll', () => {
  const mount = async (enabled: boolean, optedIn = true) => {
    interfacePreferences.setHideBarsOnScroll(optedIn);
    const hidden = { value: 0 };
    const root = createRoot(document.createElement('div'));
    await act(async () =>
      root.render(
        <TabChromeContext value={{ hidden: hidden as never, islandTop: 100 }}>
          <Probe enabled={enabled} />
        </TabChromeContext>,
      ),
    );
    return { hidden, root };
  };

  it('hides while Chats is focused and scrolls down', async () => {
    const { hidden, root } = await mount(true);
    const blur = state.focus!();
    state.handler!.onScroll(at(100));
    state.handler!.onScroll(at(300));
    expect(hidden.value).toBe(1);
    if (typeof blur === 'function') blur();
    expect(hidden.value).toBe(0);
    await act(async () => root.unmount());
  });

  it('ignores a scroll event that arrives after Chats lost focus', async () => {
    const { hidden, root } = await mount(true);
    const blur = state.focus!();
    state.handler!.onScroll(at(100));
    if (typeof blur === 'function') blur();
    state.handler!.onScroll(at(300));
    state.handler!.onScroll(at(600));
    expect(hidden.value).toBe(0);
    await act(async () => root.unmount());
  });

  it('keeps the bars on screen by default', async () => {
    const { hidden, root } = await mount(true, false);
    state.focus!();
    state.handler!.onScroll(at(100));
    state.handler!.onScroll(at(600));
    expect(hidden.value).toBe(0);
    await act(async () => root.unmount());
  });

  it('never hides while browsing is off, such as during search', async () => {
    const { hidden, root } = await mount(false);
    state.focus!();
    state.handler!.onScroll(at(100));
    state.handler!.onScroll(at(600));
    expect(hidden.value).toBe(0);
    await act(async () => root.unmount());
  });
});
