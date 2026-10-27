// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type PanEvent = { translationX: number; velocityX: number };
type Pan = {
  enabled: boolean;
  activeX: unknown;
  failY: unknown;
  update(event: PanEvent): void;
  end(event: PanEvent): void;
  finalize(): void;
};

const state = vi.hoisted(() => ({
  pans: [] as Pan[],
  navigate: vi.fn(),
  haptic: vi.fn(),
  hosts: [{ hostId: 'h1' }, { hostId: 'h2' }],
  drawerOpen: false,
  stored: new Map<string, string>(),
}));

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', async () => ({
  ...(await import('./reanimated-shim')),
  interpolate: (value: number, input: number[], output: number[]) => {
    const [from, to] = input as [number, number];
    const [start, end] = output as [number, number];
    const share = Math.min(1, Math.max(0, (value - from) / (to - from)));
    return start + (end - start) * share;
  },
}));
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
          finalize: () => undefined,
        };
        state.pans.push(pan);
        const builder = {
          enabled: (value: boolean) => ((pan.enabled = value), builder),
          activeOffsetX: (value: unknown) => ((pan.activeX = value), builder),
          failOffsetY: (value: unknown) => ((pan.failY = value), builder),
          onUpdate: (run: Pan['update']) => ((pan.update = run), builder),
          onEnd: (run: Pan['end']) => ((pan.end = run), builder),
          onFinalize: (run: Pan['finalize']) => ((pan.finalize = run), builder),
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
vi.mock('../src/ui/shell/host-drawer', () => ({ useHostDrawerOpen: () => state.drawerOpen }));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/ui/haptics', () => ({ haptic: state.haptic }));

const { LastChatSwipe } = await import('../src/ui/shell/last-chat-swipe');
const { lastChatProgress, opensLastChat } = await import('../src/ui/shell/last-chat-swipe-model');
const { lastChat, recordRecentChat } = await import('../src/ui/shell/recent-chats');
const { lastChatSwipe } = await import('../src/ui/design/tokens');

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
    expect(lastChatProgress(0)).toBe(0);
    expect(lastChatProgress(40)).toBe(0);
    expect(lastChatProgress(-lastChatSwipe.commit / 2)).toBe(0.5);
    expect(lastChatProgress(-lastChatSwipe.commit * 2)).toBe(1);
    expect(opensLastChat(-lastChatSwipe.commit, 0)).toBe(true);
    expect(opensLastChat(-lastChatSwipe.commit / 2, 0)).toBe(false);
    expect(opensLastChat(-30, -lastChatSwipe.flick - 1)).toBe(true);
    expect(opensLastChat(-lastChatSwipe.commit, lastChatSwipe.flick + 1)).toBe(false);
    expect(opensLastChat(lastChatSwipe.commit, -lastChatSwipe.flick - 1)).toBe(false);
  });
});

describe('the Chats left swipe', () => {
  let root: Root;
  let container: HTMLDivElement;

  beforeEach(() => {
    state.pans.length = 0;
    state.navigate.mockClear();
    state.haptic.mockClear();
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
        <LastChatSwipe enabled={enabled}>
          <div data-testid="chats" />
        </LastChatSwipe>,
      ),
    );
  const pan = () => state.pans.at(-1)!;

  it('starts only leftward, gives way to vertical scrolling, and has nothing to open at first', async () => {
    await render();
    expect(pan().activeX).toBe(-lastChatSwipe.start);
    expect(pan().failY).toEqual([-lastChatSwipe.verticalFail, lastChatSwipe.verticalFail]);
    expect(container.querySelector('[data-testid="chats"]')).not.toBeNull();
    expect(pan().enabled).toBe(false);
    expect(container.textContent).toBe('');
  });

  it('slides the last chat in and opens it once the drag passes the threshold', async () => {
    await act(async () => {
      await recordRecentChat(chat('a', 'h1', 'Ada'));
      await recordRecentChat(chat('b', 'h2', 'Bea'));
    });
    await render();
    expect(pan().enabled).toBe(true);
    expect(container.textContent).toBe('Bea');

    await act(async () => pan().update({ translationX: -lastChatSwipe.commit / 2, velocityX: 0 }));
    expect(state.haptic).not.toHaveBeenCalled();
    await act(async () => pan().update({ translationX: -lastChatSwipe.commit, velocityX: 0 }));
    expect(state.haptic).toHaveBeenCalledWith('pull');
    await act(async () => {
      pan().end({ translationX: -lastChatSwipe.commit, velocityX: 0 });
      pan().finalize();
    });
    expect(state.navigate).toHaveBeenCalledWith('/dm/b?hostId=h2');
  });

  it('springs back without opening when let go early', async () => {
    await render();
    await act(async () => {
      pan().update({ translationX: -30, velocityX: 0 });
      pan().end({ translationX: -30, velocityX: 0 });
      pan().finalize();
    });
    expect(state.navigate).not.toHaveBeenCalled();
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
