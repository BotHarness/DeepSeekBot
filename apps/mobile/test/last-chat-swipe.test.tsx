// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { SharedValue } from 'react-native-reanimated';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PanEvent = { translationX: number; velocityX: number };
type Pan = {
  enabled: boolean;
  activeX: unknown;
  failY: unknown;
  update(event: PanEvent): void;
  end(event: PanEvent): void;
  start(): void;
};

const state = vi.hoisted(() => ({
  pans: [] as Pan[],
  navigate: vi.fn(),
  hosts: [{ hostId: 'h1' }, { hostId: 'h2' }],
  drawerOpen: false,
  stored: new Map<string, string>(),
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-gesture-handler', async () => {
  const { createElement, Fragment } = await import('react');
  return {
    Gesture: {
      Pan: () => {
        const pan: Pan = {
          enabled: true,
          activeX: undefined,
          failY: undefined,
          update: () => undefined,
          end: () => undefined,
          start: () => undefined,
        };
        state.pans.push(pan);
        const builder = {
          enabled: (value: boolean) => ((pan.enabled = value), builder),
          activeOffsetX: (value: unknown) => ((pan.activeX = value), builder),
          failOffsetY: (value: unknown) => ((pan.failY = value), builder),
          onUpdate: (run: Pan['update']) => ((pan.update = run), builder),
          onEnd: (run: Pan['end']) => ((pan.end = run), builder),
          onStart: (run: Pan['start']) => ((pan.start = run), builder),
        };
        return builder;
      },
    },
    GestureDetector: ({ children }: { children: unknown }) =>
      createElement(Fragment, null, children as never),
  };
});
vi.mock('expo-router', () => ({ router: { navigate: state.navigate } }));
vi.mock('expo-secure-store', () => ({
  getItemAsync: async (key: string) => state.stored.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => void state.stored.set(key, value),
}));
vi.mock('expo-quick-actions', () => ({ setItems: async () => undefined }));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({ hosts: state.hosts }) }));
vi.mock('../src/ui/chat/native-header', () => ({ useHeaderOverlap: () => 0 }));
vi.mock('../src/ui/shell/host-drawer', () => ({ useHostDrawerOpen: () => state.drawerOpen }));

const { LastChatSwipe } = await import('../src/ui/shell/last-chat-swipe');
const { swipeOpenProgress, swipeOpenTravel, swipeOpens } =
  await import('../src/ui/shell/swipe-open-model');
const { swipeEntryListeners, swipeEntryOptions, swipeHref } =
  await import('../src/ui/shell/swipe-entry');
const { lastChat, recordRecentChat } = await import('../src/ui/shell/recent-chats');
const { swipeOpen } = await import('../src/ui/design/tokens');

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const chat = (id: string, hostId: string | undefined, title = id) => ({
  id,
  title,
  href: hostId === undefined ? `/dm/${id}` : `/dm/${id}?hostId=${hostId}`,
});

describe('the last chat', () => {
  it('is the newest recent chat on a paired Host', () => {
    const list = [chat('gone', 'h9'), chat('legacy', undefined), chat('b', 'h2'), chat('a', 'h1')];
    expect(lastChat(list, ['h1', 'h2'])?.id).toBe('b');
    expect(lastChat(list, [])).toBeUndefined();
    expect(lastChat([], ['h1'])).toBeUndefined();
  });

  it('opens after a long enough left drag or a leftward flick, never on a right drag', () => {
    expect(swipeOpenProgress(0)).toBe(0);
    expect(swipeOpenProgress(40)).toBe(0);
    expect(swipeOpenProgress(-swipeOpen.commit / 2)).toBe(0.5);
    expect(swipeOpenProgress(-swipeOpen.commit * 2)).toBe(1);
    expect(swipeOpens(-swipeOpen.commit, 0)).toBe(true);
    expect(swipeOpens(-swipeOpen.commit / 2, 0)).toBe(false);
    expect(swipeOpens(-30, -swipeOpen.flick - 1)).toBe(true);
    expect(swipeOpens(-swipeOpen.commit, swipeOpen.flick + 1)).toBe(false);
    expect(swipeOpens(swipeOpen.commit, -swipeOpen.flick - 1)).toBe(false);
  });

  it('follows the finger from the right edge, never past the screen', () => {
    expect(swipeOpenTravel(40, 390)).toBe(0);
    expect(swipeOpenTravel(-120, 390)).toBe(120);
    expect(swipeOpenTravel(-500, 390)).toBe(390);
  });

  it('pushes a swiped-in screen without a second animation, then pops it with its own', () => {
    expect(swipeHref('/dm/b?hostId=h2')).toBe('/dm/b?hostId=h2&entry=swipe');
    expect(swipeHref('/dm/b')).toBe('/dm/b?entry=swipe');
    expect(swipeEntryOptions({ params: { entry: 'swipe' } })).toEqual({ animation: 'none' });
    expect(swipeEntryOptions({ params: { slug: 'b' } })).toEqual({});
    expect(swipeEntryOptions({})).toEqual({});
    const setOptions = vi.fn();
    swipeEntryListeners('slide_from_right')({
      navigation: { setOptions },
      route: { params: { entry: 'swipe' } },
    }).transitionEnd();
    expect(setOptions).toHaveBeenCalledWith({ animation: 'slide_from_right' });
    setOptions.mockClear();
    swipeEntryListeners('default')({ navigation: { setOptions }, route: {} }).transitionEnd();
    expect(setOptions).not.toHaveBeenCalled();
  });
});

describe('the Chats left swipe', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.pans.length = 0;
    state.navigate.mockClear();
    state.drawerOpen = false;
    container = document.createElement('div');
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
  });

  const render = (enabled = true) =>
    act(async () =>
      root.render(
        <LastChatSwipe enabled={enabled} travel={travel}>
          <div data-testid="chats" />
        </LastChatSwipe>,
      ),
    );
  const pan = () => state.pans.at(-1)!;
  const travel = { value: 0 } as SharedValue<number>;

  it('starts only leftward, gives way to vertical scrolling, and has nothing to open at first', async () => {
    await render();
    expect(pan().activeX).toBe(-swipeOpen.start);
    expect(pan().failY).toEqual([-swipeOpen.verticalFail, swipeOpen.verticalFail]);
    expect(container.querySelector('[data-testid="chats"]')).not.toBeNull();
    expect(pan().enabled).toBe(false);
    expect(container.textContent).toBe('');
  });

  it('moves the chat in with the finger and opens it once on release past the threshold', async () => {
    await act(async () => {
      await recordRecentChat(chat('a', 'h1', 'Ada'));
      await recordRecentChat(chat('b', 'h2', 'Bea'));
    });
    await render();
    expect(pan().enabled).toBe(true);
    expect(container.textContent).toBe('');
    await act(async () => {
      pan().start();
      pan().update({ translationX: -swipeOpen.commit / 2, velocityX: 0 });
    });
    expect(travel.value).toBe(swipeOpen.commit / 2);
    expect(state.navigate).not.toHaveBeenCalled();
    await act(async () => {
      pan().update({ translationX: -swipeOpen.commit * 2, velocityX: 0 });
    });
    expect(travel.value).toBe(swipeOpen.commit * 2);
    expect(state.navigate).not.toHaveBeenCalled();
    vi.useFakeTimers();
    await act(async () => {
      pan().end({ translationX: -swipeOpen.commit * 2, velocityX: -swipeOpen.flick * 2 });
      pan().end({ translationX: -swipeOpen.commit * 2, velocityX: -swipeOpen.flick * 2 });
    });
    expect(state.navigate).toHaveBeenCalledTimes(1);
    expect(state.navigate).toHaveBeenCalledWith('/dm/b?hostId=h2&entry=swipe');
    expect(travel.value).toBeGreaterThan(0);
    vi.advanceTimersByTime(swipeOpen.settle);
    vi.useRealTimers();
    expect(travel.value).toBe(0);
  });

  it('opens on a short leftward flick', async () => {
    await render();
    await act(async () => {
      pan().start();
      pan().update({ translationX: -30, velocityX: 0 });
      pan().end({ translationX: -30, velocityX: -swipeOpen.flick - 1 });
    });
    expect(state.navigate).toHaveBeenCalledWith('/dm/b?hostId=h2&entry=swipe');
  });

  it('does not open when let go early', async () => {
    await render();
    await act(async () => {
      pan().start();
      pan().update({ translationX: -30, velocityX: 0 });
      pan().end({ translationX: -30, velocityX: 0 });
    });
    expect(state.navigate).not.toHaveBeenCalled();
    expect(travel.value).toBe(0);
  });

  it('stays off while the workspace drawer is open, while searching, and without a paired chat', async () => {
    state.drawerOpen = true;
    await render();
    expect(pan().enabled).toBe(false);
    state.drawerOpen = false;
    await render(false);
    expect(pan().enabled).toBe(false);
    const hosts = state.hosts;
    state.hosts = [{ hostId: 'h9' }];
    await render();
    expect(pan().enabled).toBe(false);
    expect(container.textContent).toBe('');
    state.hosts = hosts;
  });
});
