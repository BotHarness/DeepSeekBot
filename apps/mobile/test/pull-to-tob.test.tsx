// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ScrollEvent = { contentOffset: { y: number }; contentInset: { top: number } };
type Handlers = Partial<
  Record<'onBeginDrag' | 'onScroll' | 'onEndDrag', (event: ScrollEvent) => void>
>;
const state = vi.hoisted(() => ({
  handlers: [] as Handlers[],
  chrome: vi.fn(),
  open: vi.fn(),
  refresh: vi.fn(),
  haptic: vi.fn(async () => {}),
  drawer: false,
  enabled: true,
  hostId: 'a' as string | undefined,
  href: true,
}));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Circle: () => null, Path: () => null }));
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Platform: { OS: 'ios' },
}));
vi.mock('react-native-reanimated', async () => {
  const { useRef } = await import('react');
  return {
    ...(await import('./reanimated-shim')),
    useSharedValue: <T,>(value: T) => useRef({ value }).current,
    useAnimatedScrollHandler: (handlers: Handlers) => {
      state.handlers.push(handlers);
      return handlers;
    },
  };
});
vi.mock('../src/ui/shell/host-drawer', () => ({ useHostDrawerOpen: () => state.drawer }));
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => false,
}));
vi.mock('../src/ui/haptic-effect', () => ({ playHaptic: state.haptic }));

import { useAnimatedScrollHandler } from 'react-native-reanimated';
import { DesignThemeProvider } from '../src/ui/design/theme';
import { setHapticsEnabled } from '../src/ui/haptics';
import { PullToTob } from '../src/ui/shell/pull-to-tob';
import { tobModeHref } from '../src/ui/shell/tob-mode-model';
import { tobPull } from '../src/ui/design/tokens';

let root: Root | undefined;
let view: HTMLDivElement;
let scroll: unknown;
function Harness() {
  const chrome = useAnimatedScrollHandler({ onScroll: state.chrome });
  return (
    <DesignThemeProvider appearance={{}}>
      <PullToTob
        enabled={state.enabled}
        scope="all:a:tob-a"
        hostId={state.hostId}
        href={state.href ? tobModeHref('a', [{ hostId: 'a', tob: 'tob-a' }]) : undefined}
        refreshing={false}
        onOpen={state.open}
        onRefresh={state.refresh}
        onScroll={chrome}
      >
        {(props): ReactElement => {
          scroll = props.onScroll;
          return <div>Chats</div>;
        }}
      </PullToTob>
    </DesignThemeProvider>
  );
}
async function mount() {
  view = document.createElement('div');
  root = createRoot(view);
  await act(async () => root?.render(<Harness />));
}
function send(phase: keyof Handlers, y: number, inset = 0) {
  act(() =>
    state.handlers.at(-1)?.[phase]?.({ contentOffset: { y }, contentInset: { top: inset } }),
  );
}
beforeEach(() => {
  state.handlers = [];
  state.drawer = false;
  state.enabled = true;
  state.hostId = 'a';
  state.href = true;
  setHapticsEnabled(true);
  vi.clearAllMocks();
});
afterEach(() => act(() => root?.unmount()));

describe('iOS pull events through the real Chats pull component', () => {
  it('opens once on release and gives one threshold haptic across recrossings', async () => {
    await mount();
    send('onBeginDrag', 0);
    send('onScroll', -tobPull.commit);
    send('onScroll', -10);
    send('onScroll', -tobPull.commit - 10);
    expect(state.open).not.toHaveBeenCalled();
    expect(state.haptic).toHaveBeenCalledTimes(1);
    send('onEndDrag', -tobPull.commit - 10);
    send('onEndDrag', -tobPull.commit - 10);
    expect(state.open).toHaveBeenCalledTimes(1);
    expect(state.open).toHaveBeenCalledWith({
      pathname: '/dm-top/[slug]',
      params: { slug: 'tob-a', hostId: 'a' },
    });
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it('does not open after retreating below threshold', async () => {
    await mount();
    send('onBeginDrag', 0);
    send('onScroll', -tobPull.commit - 10);
    send('onEndDrag', -10);
    expect(state.open).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it('a drag that starts mid-list never arms even if it reaches the top', async () => {
    await mount();
    send('onBeginDrag', 150);
    send('onScroll', -tobPull.commit - 10);
    send('onEndDrag', -tobPull.commit - 10);
    expect(state.open).not.toHaveBeenCalled();
    expect(state.haptic).not.toHaveBeenCalled();
  });
  it('normalizes top content inset before measuring a pull', async () => {
    await mount();
    send('onBeginDrag', -60, 60);
    send('onScroll', -60 - tobPull.commit, 60);
    send('onEndDrag', -60 - tobPull.commit, 60);
    expect(state.open).toHaveBeenCalledTimes(1);
  });
  it('refreshes instead when the roster has no Tob yet', async () => {
    state.href = false;
    await mount();
    send('onBeginDrag', 0);
    send('onScroll', -tobPull.commit);
    send('onEndDrag', -tobPull.commit);
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(state.open).not.toHaveBeenCalled();
  });
  it('honors the disabled haptic setting', async () => {
    setHapticsEnabled(false);
    await mount();
    send('onBeginDrag', 0);
    send('onScroll', -tobPull.commit);
    send('onEndDrag', -tobPull.commit);
    expect(state.open).toHaveBeenCalledTimes(1);
    expect(state.haptic).not.toHaveBeenCalled();
  });
  it('does not intercept search', async () => {
    state.enabled = false;
    await mount();
    send('onBeginDrag', 0);
    send('onEndDrag', -tobPull.commit);
    expect(state.open).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it('does not arm while the workspace drawer is open', async () => {
    state.drawer = true;
    await mount();
    send('onBeginDrag', 0);
    send('onScroll', -tobPull.commit);
    send('onEndDrag', -tobPull.commit);
    expect(state.open).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.haptic).not.toHaveBeenCalled();
  });
  it('cancels a drag when search opens before release', async () => {
    await mount();
    send('onBeginDrag', 0);
    send('onScroll', -tobPull.commit);
    state.enabled = false;
    await act(async () => root?.render(<Harness />));
    send('onEndDrag', -tobPull.commit);
    expect(state.open).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
  });
  it('composes the chrome handler rather than replacing it', async () => {
    await mount();
    expect(scroll).toBeDefined();
    if (scroll === null || typeof scroll !== 'object')
      throw new Error('composed shim handler missing');
    const onScroll = Reflect.get(scroll, 'onScroll');
    if (typeof onScroll !== 'function') throw new Error('composed scroll missing');
    const event = { contentOffset: { y: 20 }, contentInset: { top: 0 } };
    onScroll(event);
    expect(state.chrome).toHaveBeenCalledWith(event, {});
  });
});
