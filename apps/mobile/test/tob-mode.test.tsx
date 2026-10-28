// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PanEvent = { translationY: number; velocityY: number };
type Pan = {
  activeY: unknown;
  failX: unknown;
  slop: unknown;
  update(event: PanEvent): void;
  end(event: PanEvent): void;
};

const state = vi.hoisted(() => ({
  pans: [] as Pan[],
  back: vi.fn(),
  replace: vi.fn(),
  setParams: vi.fn(),
  canGoBack: true,
  held: [] as (() => boolean)[],
  params: {} as Record<string, string | undefined>,
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-gesture-handler', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    Gesture: {
      Pan: () => {
        const pan: Pan = {
          activeY: undefined,
          failX: undefined,
          slop: undefined,
          update: () => undefined,
          end: () => undefined,
        };
        state.pans.push(pan);
        const builder = {
          activeOffsetY: (value: unknown) => ((pan.activeY = value), builder),
          failOffsetX: (value: unknown) => ((pan.failX = value), builder),
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
vi.mock('expo-router', () => ({
  Stack: () => createElement('div', { 'data-testid': 'tob-stack' }),
  router: {
    back: state.back,
    replace: state.replace,
    setParams: state.setParams,
    canGoBack: () => state.canGoBack,
  },
  useLocalSearchParams: () => state.params,
  useFocusEffect: (effect: () => void | (() => void)) => useLayoutEffect(effect, [effect]),
}));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async () => null,
  setItemAsync: async () => undefined,
}));
vi.mock('expo-quick-actions', () => ({ setItems: async () => undefined }));
vi.mock('../src/ui/shell/back-owner', () => ({
  holdBack: (handler: () => boolean) => {
    state.held.push(handler);
    return { remove: () => state.held.splice(state.held.indexOf(handler), 1) };
  },
}));
vi.mock('../src/ui/chat/header-chrome', () => ({ useChatHeaderHeight: () => 100 }));
vi.mock('../src/ui/chat/conversation-screen', () => ({ ConversationScreen: () => null }));
vi.mock('../src/host/host-session', () => ({ useHostSessions: () => [] }));
vi.mock('../src/host/native-host-look', () => ({ hostLooks: { look: () => ({}) } }));
vi.mock('../src/ui/primitives/action-menu-button', () => ({ ActionMenuButton: () => null }));
vi.mock('../src/ui/primitives/app-dialog', () => ({ showActionMenu: () => undefined }));

const { TobModeFrame } = await import('../src/ui/shell/tob-mode-screen');
const { tobModeOpen, holdTobMode } = await import('../src/ui/shell/tob-mode');
const { closesTobMode, tobComputer, tobComputers, tobModeHostId, tobModeOffset } =
  await import('../src/ui/shell/tob-mode-model');
const { recentHostIds } = await import('../src/ui/shell/recent-chats');
const { computerEnvironmentKey, cloudEnvironmentKey } =
  await import('../src/host/conversation-environments');
const { tobMode } = await import('../src/ui/design/tokens');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const computers = [
  { hostId: 'h1', tob: 'tob' },
  { hostId: 'h2', tob: 'tob' },
  { hostId: 'old', tob: null },
  { hostId: 'loading', tob: undefined },
];

describe('the Tob Mode Environment', () => {
  it("is the selected computer Environment's Tob", () => {
    expect(tobModeHostId(computerEnvironmentKey('h2'), computers, ['h1'], 'h1')).toBe('h2');
    expect(tobModeHostId(computerEnvironmentKey('loading'), computers, [], 'h1')).toBe('loading');
  });

  it('is none for a computer without a Tob, an unknown computer, or a cloud Environment', () => {
    expect(tobModeHostId(computerEnvironmentKey('old'), computers, ['old'], 'old')).toBeUndefined();
    expect(tobModeHostId(computerEnvironmentKey('gone'), computers, [], 'h1')).toBeUndefined();
    expect(tobModeHostId(cloudEnvironmentKey('s', 'org'), computers, ['h1'], 'h1')).toBeUndefined();
  });

  it('is the most recently used computer under All environments', () => {
    expect(tobModeHostId('all', computers, ['gone', 'old', 'h2', 'h1'], 'h1')).toBe('h2');
    expect(tobModeHostId('all', computers, [], 'h2')).toBe('h2');
    expect(tobModeHostId('all', computers, [], undefined)).toBe('h1');
    expect(tobModeHostId('all', [{ hostId: 'old', tob: null }], ['old'], 'old')).toBeUndefined();
    expect(tobModeHostId('all', [], [], undefined)).toBeUndefined();
  });

  it('reads recency from the recent chats and Tob from the roster', () => {
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
    expect(tobComputers(computers).map((c) => c.hostId)).toEqual(['h1', 'h2', 'loading']);
  });
});

describe('pushing Tob Mode up', () => {
  it('follows the finger upward only and closes past the threshold or on an upward flick', () => {
    expect(tobModeOffset(40)).toBe(0);
    expect(tobModeOffset(-40)).toBe(-40);
    expect(closesTobMode(-tobMode.commit, 0)).toBe(true);
    expect(closesTobMode(-tobMode.commit / 2, 0)).toBe(false);
    expect(closesTobMode(-10, -tobMode.flick - 1)).toBe(true);
    expect(closesTobMode(-tobMode.commit * 2, tobMode.flick + 1)).toBe(false);
    expect(closesTobMode(tobMode.commit, 0)).toBe(false);
  });
});

describe('the Tob Mode frame', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.pans.length = 0;
    state.held.length = 0;
    state.back.mockClear();
    state.replace.mockClear();
    state.canGoBack = true;
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  const render = () => act(async () => root.render(<TobModeFrame />));
  const pan = () => state.pans.at(-1)!;

  it('turns the Chats gestures off while it is open', async () => {
    expect(tobModeOpen()).toBe(false);
    await render();
    expect(container.querySelector('[data-testid="tob-stack"]')).not.toBeNull();
    expect(tobModeOpen()).toBe(true);
    await act(async () => root.unmount());
    expect(tobModeOpen()).toBe(false);
    root = createRoot(container);
  });

  it('closes on system Back, once', async () => {
    await render();
    expect(state.held).toHaveLength(1);
    await act(async () => {
      expect(state.held[0]!()).toBe(true);
      state.held[0]!();
    });
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it('closes when pushed up from its header, and springs back when let go early', async () => {
    await render();
    expect(pan().activeY).toBe(-tobMode.start);
    expect(pan().failX).toEqual([-tobMode.horizontalFail, tobMode.horizontalFail]);
    expect(pan().slop).toEqual({ top: 0, height: 100 });
    await act(async () => pan().end({ translationY: -tobMode.commit / 2, velocityY: 0 }));
    expect(state.back).not.toHaveBeenCalled();
    await act(async () => pan().end({ translationY: -tobMode.commit, velocityY: 0 }));
    expect(state.back).toHaveBeenCalledTimes(1);
  });

  it('returns to Chats when there is nothing to go back to', async () => {
    state.canGoBack = false;
    await render();
    await act(async () => void state.held[0]!());
    expect(state.replace).toHaveBeenCalledWith('/');
  });

  it('counts every open presentation', () => {
    const first = holdTobMode();
    const second = holdTobMode();
    first();
    first();
    expect(tobModeOpen()).toBe(true);
    second();
    expect(tobModeOpen()).toBe(false);
  });
});
