// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PanEvent = { translationX: number; velocityX: number };
type Pan = {
  enabled: unknown;
  activeX: unknown;
  failY: unknown;
  slop: unknown;
  update(event: PanEvent): void;
  end(event: PanEvent): void;
};
type Action = { type: string };
type Prevent = {
  prevent: boolean;
  callback(options: { data: { action: Action }; repeat(): void }): void;
};

const state = vi.hoisted(() => ({
  os: 'ios',
  reduced: false,
  pans: [] as Pan[],
  springs: [] as { to: unknown; config: unknown }[],
  back: vi.fn(),
  replace: vi.fn(),
  repeat: vi.fn(),
  prevent: undefined as Prevent | undefined,
  stackRoot: [] as boolean[],
}));

vi.mock('react-native', async () => {
  const shim = await import('./react-native-shim');
  return {
    ...shim,
    Platform: {
      get OS() {
        return state.os;
      },
      select: shim.Platform.select,
    },
  };
});
vi.mock('react-native-reanimated', async () => {
  const shim = await import('./reanimated-shim');
  return {
    ...shim,
    useReducedMotion: () => false,
    withSpring: (to: unknown, config: unknown, done?: (finished?: boolean) => void) => {
      state.springs.push({ to, config });
      done?.(true);
      return to;
    },
  };
});
vi.mock('../src/ui/primitives/use-system-reduced-motion', () => ({
  useSystemReducedMotion: () => state.reduced,
}));
vi.mock('react-native-gesture-handler', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    Gesture: {
      Pan: () => {
        const pan: Pan = {
          enabled: undefined,
          activeX: undefined,
          failY: undefined,
          slop: undefined,
          update: () => undefined,
          end: () => undefined,
        };
        state.pans.push(pan);
        const builder = {
          enabled: (value: unknown) => ((pan.enabled = value), builder),
          activeOffsetX: (value: unknown) => ((pan.activeX = value), builder),
          failOffsetY: (value: unknown) => ((pan.failY = value), builder),
          hitSlop: (value: unknown) => ((pan.slop = value), builder),
          onUpdate: (run: Pan['update']) => ((pan.update = run), builder),
          onEnd: (run: Pan['end']) => ((pan.end = run), builder),
        };
        return builder;
      },
    },
    GestureDetector: ({ children }: { children: unknown }) =>
      createElement(Fragment, null, children as never),
  };
});
vi.mock('expo-router', async () => {
  const { createElement } = await import('react');
  const { useStackRoot } = await import('../src/ui/shell/stack-root');
  function Stack() {
    state.stackRoot.push(useStackRoot());
    return createElement('div', { 'data-testid': 'nested-stack' });
  }
  return {
    Stack,
    router: { back: state.back, replace: state.replace, canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    usePreventRemove: (
      prevent: boolean,
      callback: (options: { data: { action: Action }; repeat(): void }) => void,
    ) => {
      state.prevent = { prevent, callback };
    },
  };
});
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));
vi.mock('expo-quick-actions', () => ({ setItems: async () => undefined }));
vi.mock('../src/ui/chat/conversation-screen', () => ({ ConversationScreen: () => null }));

const { TopEntranceStack } = await import('../src/ui/shell/top-entrance');
const { useStackRoot } = await import('../src/ui/shell/stack-root');
const {
  closesTopEntrance,
  tobComputer,
  tobModeHostId,
  tobModeHref,
  topEntranceDrag,
  topEntranceScreenOptions,
} = await import('../src/ui/shell/tob-mode-model');
const { recentHostIds } = await import('../src/ui/shell/recent-chats');
const { computerEnvironmentKey, cloudEnvironmentKey } =
  await import('../src/host/conversation-environments');
const { topEntrance } = await import('../src/ui/design/tokens');
const { spring } = await import('../src/ui/design/motion');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const computers = [
  { hostId: 'h1', tob: 'tob' },
  { hostId: 'h2', tob: 'tob-2' },
  { hostId: 'old', tob: null },
  { hostId: 'loading', tob: undefined },
];

describe('the Tob that Tob Mode opens', () => {
  it("is the selected computer Environment's Tob", () => {
    expect(tobModeHostId(computerEnvironmentKey('h2'), computers, ['h1'], 'h1')).toBe('h2');
    expect(tobModeHostId(computerEnvironmentKey('old'), computers, ['h1'], 'h1')).toBe('old');
  });

  it('is the most recently used computer under All environments', () => {
    expect(tobModeHostId('all', computers, ['gone', 'h2', 'h1'], 'h1')).toBe('h2');
    expect(tobModeHostId('all', computers, [], 'h2')).toBe('h2');
    expect(tobModeHostId('all', computers, [], undefined)).toBe('h1');
  });

  it('is still the most recently used computer under a cloud Environment', () => {
    const cloud = cloudEnvironmentKey('s', 'org');
    expect(tobModeHostId(cloud, computers, ['gone', 'h2'], 'h1')).toBe('h2');
    expect(tobModeHostId(cloud, computers, [], undefined)).toBe('h1');
  });

  it('is none only when no computer Environment is paired', () => {
    expect(tobModeHostId('all', [], ['h1'], 'h1')).toBeUndefined();
    expect(tobModeHostId(cloudEnvironmentKey('s', 'org'), [], [], undefined)).toBeUndefined();
  });

  it("goes to that computer's Tob DM, once its roster names the Tob", () => {
    expect(tobModeHref('h2', computers)).toEqual({
      pathname: '/dm-top/[slug]',
      params: { slug: 'tob-2', hostId: 'h2' },
    });
    expect(tobModeHref('loading', computers)).toBeUndefined();
    expect(tobModeHref('old', computers)).toBeUndefined();
    expect(tobModeHref(undefined, computers)).toBeUndefined();
  });

  it('reads recency from the recent chats and the Tob from the roster', () => {
    expect(
      recentHostIds([
        { id: 'a', title: 'A', href: '/dm/a?hostId=h2' },
        { id: 'b', title: 'B', href: '/dm/b' },
        { id: 'c', title: 'C', href: '/channel/c?hostId=h1' },
      ]),
    ).toEqual(['h2', 'h1']);
    const host = (bots?: { slug: string; tob?: boolean }[]) => ({
      saved: { hostId: 'h' },
      snapshot: bots === undefined ? {} : { roster: { bots } },
    });
    expect(tobComputer(host()).tob).toBeUndefined();
    expect(tobComputer(host([{ slug: 'ada' }])).tob).toBeNull();
    expect(tobComputer(host([{ slug: 'ada' }, { slug: 'tob', tob: true }])).tob).toBe('tob');
  });
});

describe('the Tob DM route', () => {
  it('is the chat screen itself, under a top entrance, with no Tob screen of its own', async () => {
    const dm = await import('../app/dm/[slug]');
    const top = await import('../app/dm-top/[slug]');
    expect(top.default).toBe(dm.default);
    const layout = await import('../app/dm-top/_layout');
    expect(layout.default).toBe(TopEntranceStack);
    expect(existsSync(new URL('../app/tob', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../src/ui/shell/tob-mode-screen.tsx', import.meta.url))).toBe(false);
  });

  it('is presented over Chats without a system animation, so the entrance slides itself', () => {
    expect(topEntranceScreenOptions).toMatchObject({
      presentation: 'transparentModal',
      animation: 'none',
      headerShown: false,
    });
  });
});

describe('the top entrance', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.os = 'ios';
    state.reduced = false;
    state.pans.length = 0;
    state.springs.length = 0;
    state.prevent = undefined;
    state.stackRoot.length = 0;
    state.back.mockClear();
    state.replace.mockClear();
    state.repeat.mockClear();
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  const render = () => act(async () => root.render(<TopEntranceStack />));
  const pan = () => state.pans.at(-1)!;
  const remove = () =>
    act(async () => {
      const prevent = state.prevent!;
      if (prevent.prevent)
        prevent.callback({ data: { action: { type: 'POP' } }, repeat: state.repeat });
      else state.repeat();
    });

  it('holds a nested stack whose chat screen draws its own Back', async () => {
    await render();
    expect(container.querySelector('[data-testid="nested-stack"]')).not.toBeNull();
    expect(state.stackRoot.at(-1)).toBe(true);
    let outside: boolean | undefined;
    function Probe() {
      outside = useStackRoot();
      return null;
    }
    await act(async () => root.render(createElement(Probe)));
    expect(outside).toBe(false);
  });

  it('comes down on the spatial spring and goes back up on the release spring', async () => {
    await render();
    expect(state.springs[0]).toEqual({
      to: 0,
      config: { ...spring.spatial.default, overshootClamping: true },
    });
    expect(state.prevent!.prevent).toBe(true);
    await remove();
    expect(state.springs.at(-1)).toEqual({
      to: -844,
      config: { ...spring.release, overshootClamping: true },
    });
    expect(state.repeat).toHaveBeenCalledOnce();
    expect(state.prevent!.prevent).toBe(false);
  });

  it('does not slide with Reduce Motion', async () => {
    state.reduced = true;
    await render();
    expect(state.springs).toEqual([]);
    expect(state.prevent!.prevent).toBe(false);
    await remove();
    expect(state.springs).toEqual([]);
    expect(state.repeat).toHaveBeenCalledOnce();
  });

  it('stops sliding when Reduce Motion changes while Tob Mode is open', async () => {
    await render();
    state.springs.length = 0;
    state.reduced = true;
    await render();
    expect(state.prevent!.prevent).toBe(false);
    await remove();
    expect(state.springs).toEqual([]);
    expect(state.repeat).toHaveBeenCalledOnce();
  });

  it('goes back on an iOS swipe from the leading edge, and springs back when let go early', async () => {
    await render();
    expect(pan().enabled).toBe(true);
    expect(pan().slop).toEqual({ left: 0, width: topEntrance.edge });
    expect(pan().activeX).toBe(topEntrance.start);
    expect(pan().failY).toEqual([-topEntrance.verticalFail, topEntrance.verticalFail]);
    await act(async () => pan().end({ translationX: topEntrance.commit / 2, velocityX: 0 }));
    expect(state.back).not.toHaveBeenCalled();
    await act(async () => pan().end({ translationX: topEntrance.commit, velocityX: 0 }));
    expect(state.back).toHaveBeenCalledOnce();
  });

  it('leaves Android Back to the system', async () => {
    state.os = 'android';
    await render();
    expect(pan().enabled).toBe(false);
  });

  it('follows the finger only toward the trailing edge, and commits past the threshold or on a flick', () => {
    expect(topEntranceDrag(-40)).toBe(0);
    expect(topEntranceDrag(40)).toBe(40);
    expect(closesTopEntrance(topEntrance.commit, 0)).toBe(true);
    expect(closesTopEntrance(topEntrance.commit / 2, 0)).toBe(false);
    expect(closesTopEntrance(10, topEntrance.flick + 1)).toBe(true);
    expect(closesTopEntrance(topEntrance.commit * 2, -topEntrance.flick - 1)).toBe(false);
  });
});
