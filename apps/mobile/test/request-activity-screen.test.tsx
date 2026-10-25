// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

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
  const router = { replace: vi.fn() };
  return {
    state,
    a,
    b,
    listeners,
    router,
    getState: () => state,
    switchTo: async () => true,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    change: () => {
      state.saved = { hostId: 'b' };
      state.client = b;
      for (const fn of listeners) fn();
    },
  };
});
vi.mock('../src/host/host-session', () => ({ hostSession: source }));
vi.mock('../src/host/native-live-activity', () => ({
  requestActivitySession: {
    ready: Promise.resolve(),
    target: () => ({ hostId: 'a', botSlug: 'ada', channelId: 'dm-a', messageId: 'request' }),
  },
}));
vi.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'link' }),
  useRouter: () => source.router,
  Stack: { Screen: () => null },
}));
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
  view = document.createElement('div');
  document.body.append(view);
  root = createRoot(view);
});
afterEach(() => {
  act(() => root.unmount());
  view.remove();
});
it('opens the original request when only the current client publishes its roster', async () => {
  await act(async () => root.render(<RequestActivityScreen />));
  await act(async () => source.a.emit());
  expect(source.router.replace).toHaveBeenCalledWith({
    pathname: '/dm/[slug]',
    params: { slug: 'ada', hostId: 'a', focus: 'request' },
  });
  expect(source.listeners.size).toBe(0);
  expect(source.a.listeners.size).toBe(0);
});
it('ignores the old client after a source change and releases both subscriptions on unmount', async () => {
  await act(async () => root.render(<RequestActivityScreen />));
  await act(async () => {
    source.change();
    source.a.emit();
  });
  expect(source.router.replace).not.toHaveBeenCalled();
  act(() => root.unmount());
  expect(source.listeners.size + source.a.listeners.size + source.b.listeners.size).toBe(0);
});
