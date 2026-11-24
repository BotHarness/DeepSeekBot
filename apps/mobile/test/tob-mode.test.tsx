// @vitest-environment jsdom
import { existsSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Action = { type: string };
type Prevent = {
  prevent: boolean;
  callback(options: { data: { action: Action }; repeat(): void }): void;
};

const state = vi.hoisted(() => ({
  os: 'ios',
  reduced: false,
  springs: [] as { to: unknown; config: unknown }[],
  back: vi.fn(),
  replace: vi.fn(),
  repeat: vi.fn(),
  prevent: undefined as Prevent | undefined,
  stackRoot: [] as boolean[],
  settled: [] as (boolean | undefined)[],
  context: undefined as import('react').Context<boolean | undefined> | undefined,
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
vi.mock('expo-router', async () => {
  const { createElement, use } = await import('react');
  const { useStackRoot } = await import('../src/ui/shell/stack-root');
  function Stack() {
    state.stackRoot.push(useStackRoot());
    state.settled.push(state.context ? use(state.context) : undefined);
    return createElement('div', { 'data-testid': 'nested-stack' });
  }
  return {
    Stack,
    router: { back: state.back, replace: state.replace, canGoBack: () => true },
    useLocalSearchParams: () => ({}),
    useNavigation: () => ({ addListener: () => () => undefined }),
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

const { TobEntranceStack } = await import('../src/ui/shell/tob-entrance');
const { tobEntryOrigin } = await import('../src/ui/shell/tob-entry-origin');
state.context = (await import('../src/ui/shell/entrance-settled')).EntranceSettled;
const { useStackRoot } = await import('../src/ui/shell/stack-root');
const {
  containerTransformFade,
  containerTransformFrame,
  tobComputer,
  tobModeHostId,
  tobModeHref,
  tobEntranceScreenOptions,
} = await import('../src/ui/shell/tob-mode-model');
const { recentHostIds } = await import('../src/ui/shell/recent-chats');
const { computerEnvironmentKey, cloudEnvironmentKey } =
  await import('../src/host/conversation-environments');
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

  it("goes to that computer's Tob DM with the Composer focused, once its roster names the Tob", () => {
    expect(tobModeHref('h2', computers, 'ios')).toEqual({
      pathname: '/dm/[slug]',
      params: { slug: 'tob-2', hostId: 'h2', compose: '1' },
    });
    expect(tobModeHref('h2', computers, 'android')).toEqual({
      pathname: '/dm-tob/[slug]',
      params: { slug: 'tob-2', hostId: 'h2', compose: '1' },
    });
    expect(tobModeHref('loading', computers, 'ios')).toBeUndefined();
    expect(tobModeHref('old', computers, 'ios')).toBeUndefined();
    expect(tobModeHref(undefined, computers, 'android')).toBeUndefined();
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
  it('is the chat screen itself, under a container transform on Android, with no Tob screen of its own', async () => {
    const dm = await import('../app/dm/[slug]');
    const entry = await import('../app/dm-tob/[slug]');
    expect(entry.default).toBe(dm.default);
    const layout = await import('../app/dm-tob/_layout');
    expect(layout.default).toBe(TobEntranceStack);
    expect(existsSync(new URL('../app/tob', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../app/dm-top', import.meta.url))).toBe(false);
    expect(existsSync(new URL('../src/ui/shell/pull-to-tob.tsx', import.meta.url))).toBe(false);
  });

  it('is presented over Chats without a system animation, so the entrance transforms itself', () => {
    expect(tobEntranceScreenOptions).toMatchObject({
      presentation: 'transparentModal',
      animation: 'none',
      headerShown: false,
    });
  });
});

describe('the container transform', () => {
  const screen = { width: 390, height: 844 };
  const bar = { x: 16, y: 700, width: 280, height: 56 };

  it('grows the Tob entry bar into the full screen', () => {
    expect(containerTransformFrame(bar, screen, 0)).toEqual({ ...bar, radius: 28 });
    expect(containerTransformFrame(bar, screen, 1)).toEqual({
      x: 0,
      y: 0,
      ...screen,
      radius: 0,
    });
    const half = containerTransformFrame(bar, screen, 0.5);
    expect(half.width).toBe((bar.width + screen.width) / 2);
    expect(containerTransformFrame(bar, screen, 2)).toEqual(
      containerTransformFrame(bar, screen, 1),
    );
  });

  it('starts near full size when the bar was not measured', () => {
    expect(containerTransformFrame(undefined, screen, 0).width).toBeCloseTo(screen.width * 0.9);
  });

  it('fades the bar out before the conversation fades in', () => {
    expect(containerTransformFade(0)).toEqual({ content: 0, origin: 1 });
    expect(containerTransformFade(0.3).origin).toBe(0);
    expect(containerTransformFade(0.2).content).toBe(0);
    expect(containerTransformFade(1)).toEqual({ content: 1, origin: 0 });
  });
});

describe('the Tob entrance', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.os = 'android';
    state.reduced = false;
    state.springs.length = 0;
    state.prevent = undefined;
    state.stackRoot.length = 0;
    state.back.mockClear();
    state.replace.mockClear();
    state.repeat.mockClear();
    tobEntryOrigin.set({ x: 16, y: 700, width: 280, height: 56 });
    state.settled.length = 0;
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  const render = () => act(async () => root.render(<TobEntranceStack />));
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

  it('expands on the spatial spring, settles, and shrinks back on the release spring', async () => {
    await render();
    expect(state.springs[0]).toEqual({
      to: 1,
      config: { ...spring.spatial.default, overshootClamping: true },
    });
    expect(state.prevent!.prevent).toBe(true);
    await remove();
    expect(state.springs.at(-1)).toEqual({
      to: 0,
      config: { ...spring.release, overshootClamping: true },
    });
    expect(state.repeat).toHaveBeenCalledOnce();
    expect(state.prevent!.prevent).toBe(false);
  });

  it('tells the conversation once the entrance has settled', async () => {
    await render();
    expect(state.settled[0]).toBe(false);
    expect(state.settled.at(-1)).toBe(true);
  });

  it('does not animate with Reduce Motion', async () => {
    state.reduced = true;
    await render();
    expect(state.springs).toEqual([]);
    expect(state.prevent!.prevent).toBe(false);
    await remove();
    expect(state.springs).toEqual([]);
    expect(state.repeat).toHaveBeenCalledOnce();
  });
});
