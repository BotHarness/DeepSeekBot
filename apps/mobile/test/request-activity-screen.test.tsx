// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { channelNavigationHarness } from './channel-navigation-harness';
import { navigateChannel } from '../src/ui/shell/channel-navigation';

const source = vi.hoisted(() => {
  const client = () => {
    const listeners = new Set<() => void>();
    let snapshot: {
      connection: { status: string };
      roster?: { bots: { slug: string; dmChannelId: string }[] };
    } = { connection: { status: 'connecting' } };
    return {
      getSnapshot: () => snapshot,
      reset: () => {
        snapshot = { connection: { status: 'connecting' } };
      },
      subscribe: (fn: () => void) => {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      emit: () => {
        snapshot = {
          connection: { status: 'connected' },
          roster: { bots: [{ slug: 'ada', dmChannelId: 'dm-a' }] },
        };
        for (const fn of listeners) fn();
      },
      listeners,
    };
  };
  const a = client();
  const b = client();
  const listeners = new Set<() => void>();
  const state = { saved: { hostId: 'a' }, client: a };
  let selection = 0;
  let waitSwitch = async () => {};
  const router = { replace: vi.fn() };
  return {
    state,
    a,
    b,
    listeners,
    router,
    getState: () => state,
    getSelectionRevision: () => selection,
    switchTo: vi.fn(async (hostId: string, current: () => boolean = () => true) => {
      const intent = ++selection;
      await waitSwitch();
      if (!current() || intent !== selection) return false;
      state.saved = { hostId };
      state.client = hostId === 'a' ? a : b;
      for (const fn of listeners) fn();
      return true;
    }),
    pauseSwitch: (wait: () => Promise<void>) => {
      waitSwitch = wait;
    },
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    change: () => {
      selection++;
      state.saved = { hostId: 'b' };
      state.client = b;
      for (const fn of listeners) fn();
    },
  };
});
let history: ReturnType<typeof channelNavigationHarness>;
let navigationReady = true;
let workspaceCurrent = true;
const navigationListeners = new Set<() => void>();
const navigation = {
  isReady: () => navigationReady,
  getRootState: () => history.state,
  dispatch: (
    action: Parameters<ReturnType<typeof channelNavigationHarness>['navigation']['dispatch']>[0],
  ) => {
    history.navigation.dispatch(action);
    for (const fn of navigationListeners) fn();
  },
  addListener: (_event: string, listener: () => void) => {
    navigationListeners.add(listener);
    return () => {
      navigationListeners.delete(listener);
    };
  },
};
vi.mock('../src/host/host-session', () => ({ hostSession: source }));
vi.mock('../src/ui/shell/host-drawer', () => ({
  hostDrawer: { captureWorkspaceSelection: () => () => workspaceCurrent },
}));
vi.mock('../src/host/native-live-activity', () => ({
  requestActivitySession: {
    ready: Promise.resolve(),
    target: () => ({ hostId: 'a', botSlug: 'ada', channelId: 'dm-a', messageId: 'request' }),
  },
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'link' }),
  useRouter: () => source.router,
  useNavigationContainerRef: () => navigation,
  Stack: { Screen: () => null },
}));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
import { RequestActivityScreen } from '../src/ui/chat/request-activity-screen';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let view: HTMLDivElement;
beforeEach(() => {
  source.a.reset();
  source.b.reset();
  source.state.saved = { hostId: 'a' };
  source.state.client = source.a;
  source.router.replace.mockClear();
  source.switchTo.mockClear();
  source.pauseSwitch(async () => {});
  history = channelNavigationHarness();
  navigationReady = true;
  workspaceCurrent = true;
  navigationListeners.clear();
  history.push('request-activity', { id: 'link' });
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
});
afterEach(() => {
  act(() => root.unmount());
  view.remove();
});
it('replaces the activity entry for a new original DM and Back leaves no intermediate route', async () => {
  await act(async () => root.render(<RequestActivityScreen />));
  await act(async () => source.a.emit());
  expect(history.state.routes.at(-1)).toMatchObject({
    name: 'dm/[slug]',
    params: { slug: 'ada', hostId: 'a', focus: 'request', focusRequest: expect.any(String) },
  });
  expect(history.state.routes).toHaveLength(2);
  history.back();
  expect(history.state.routes.at(-1)?.name).toBe('(tabs)');
  expect(source.router.replace).not.toHaveBeenCalled();
  expect(source.listeners.size + source.a.listeners.size + navigationListeners.size).toBe(0);
});
it('reuses the same scoped DM and refreshes focus through the shared navigation owner', async () => {
  history.back();
  history.push('dm/[slug]', { hostId: 'a', slug: 'ada', focus: 'old', focusRequest: 'previous' });
  const key = history.state.routes.at(-1)?.key;
  history.push('request-activity', { id: 'link' });
  await act(async () => root.render(<RequestActivityScreen />));
  await act(async () => source.a.emit());
  expect(history.state.routes.at(-1)).toMatchObject({
    key,
    params: { hostId: 'a', focus: 'request', focusRequest: expect.any(String) },
  });
  expect(history.state.routes.at(-1)?.params).not.toMatchObject({ focusRequest: 'previous' });
  expect(history.state.routes).toHaveLength(2);
});
it('waits for navigation readiness after the client-only roster event', async () => {
  navigationReady = false;
  await act(async () => root.render(<RequestActivityScreen />));
  await act(async () => source.a.emit());
  expect(history.state.routes.at(-1)?.name).toBe('request-activity');
  await act(async () => {
    navigationReady = true;
    for (const fn of navigationListeners) fn();
  });
  expect(history.state.routes.at(-1)?.name).toBe('dm/[slug]');
});
it('cancels delayed Host selection when a newer workspace intent wins', async () => {
  let release!: () => void;
  source.state.saved = { hostId: 'b' };
  source.state.client = source.b;
  source.pauseSwitch(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => root.render(<RequestActivityScreen />));
  workspaceCurrent = false;
  await act(async () => {
    release();
    source.a.emit();
  });
  expect(source.state.saved.hostId).toBe('b');
  expect(history.state.routes.at(-1)?.name).toBe('request-activity');
  expect(source.router.replace).not.toHaveBeenCalled();
});
it('does not commit a delayed switch after the Human opens another page', async () => {
  let release!: () => void;
  source.state.saved = { hostId: 'b' };
  source.state.client = source.b;
  source.pauseSwitch(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  await act(async () => root.render(<RequestActivityScreen />));
  history.push('settings');
  await act(async () => {
    release();
    source.a.emit();
  });
  expect(source.state.saved.hostId).toBe('b');
  expect(history.state.routes.at(-1)?.name).toBe('settings');
});
it('keeps a newer notification selection when the old Host roster arrives before its save completes', async () => {
  await act(async () => root.render(<RequestActivityScreen />));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  source.pauseSwitch(() => gate);
  const originalPage = history.state;
  const newer = source.switchTo('b', () => history.state === originalPage);
  expect(source.state.saved.hostId).toBe('a');
  await act(async () => source.a.emit());
  const afterOldRoster = history.state;
  let selected = false;
  await act(async () => {
    release();
    selected = await newer;
    if (selected)
      navigateChannel(navigation, { pathname: '/dm/[slug]', params: { hostId: 'b', slug: 'ada' } });
  });
  expect(afterOldRoster).toBe(originalPage);
  expect(selected).toBe(true);
  expect(source.state.saved.hostId).toBe('b');
  expect(history.state.routes.at(-1)?.params).toMatchObject({ hostId: 'b' });
});
it('captures its own selection before a newer notification starts ahead of the await continuation', async () => {
  source.a.emit();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const actualSwitch = source.switchTo.getMockImplementation()!;
  let newer: Promise<boolean> | undefined;
  const originalPage = history.state;
  source.switchTo.mockImplementationOnce((id, current) =>
    actualSwitch(id, current).then((selected) => {
      queueMicrotask(() => {
        source.pauseSwitch(() => gate);
        newer = source.switchTo('b', () => history.state === originalPage);
      });
      return selected;
    }),
  );
  await act(async () => root.render(<RequestActivityScreen />));
  const afterContinuation = history.state;
  let selected = false;
  await act(async () => {
    release();
    selected = await newer!;
  });
  expect(afterContinuation).toBe(originalPage);
  expect(selected).toBe(true);
  expect(source.state.saved.hostId).toBe('b');
});
it('ignores the old client after a source change and releases subscriptions', async () => {
  await act(async () => root.render(<RequestActivityScreen />));
  await act(async () => {
    source.change();
    source.a.emit();
  });
  expect(history.state.routes.at(-1)?.name).toBe('request-activity');
  act(() => root.unmount());
  expect(
    source.listeners.size +
      source.a.listeners.size +
      source.b.listeners.size +
      navigationListeners.size,
  ).toBe(0);
});
