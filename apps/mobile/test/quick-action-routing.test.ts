import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-quick-actions', () => ({ initial: undefined, addListener: () => ({ remove() {} }) }));
vi.mock('expo-router', () => ({ router: { navigate: vi.fn() } }));
vi.mock('../src/host/host-session', () => ({
  hostSession: { subscribe: () => () => {}, getState: () => ({ saved: undefined }) },
}));

const { quickActionHref, routeQuickActions } = await import('../src/ui/shell/quick-action-routing');

function session(ready: boolean) {
  const listeners = new Set<() => void>();
  const state = { ready };
  return {
    state,
    emit: () => listeners.forEach((listener) => listener()),
    session: {
      subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      ready: () => state.ready,
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('home-screen shortcut routing', () => {
  it('opens only in-app paths', () => {
    expect(quickActionHref({ id: 'a', title: 'A', params: { href: '/dm/writer' } })).toBe(
      '/dm/writer',
    );
    expect(
      quickActionHref({ id: 'a', title: 'A', params: { href: 'https://example.com' } }),
    ).toBeUndefined();
    expect(quickActionHref({ id: 'a', title: 'A', params: { href: '//evil' } })).toBeUndefined();
    expect(quickActionHref({ id: 'a', title: 'A' })).toBeUndefined();
    expect(quickActionHref(undefined)).toBeUndefined();
  });

  it('holds a cold-start shortcut until the saved Host has loaded', () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    const host = session(false);
    routeQuickActions({
      initial: { id: 'a', title: 'A', params: { href: '/dm/writer' } },
      listen: () => ({ remove() {} }),
      session: host.session,
      navigate,
    });
    vi.runAllTimers();
    expect(navigate).not.toHaveBeenCalled();
    host.state.ready = true;
    host.emit();
    host.emit();
    vi.runAllTimers();
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith('/dm/writer');
  });

  it('opens a warm shortcut right away', () => {
    vi.useFakeTimers();
    const navigate = vi.fn();
    let handler: ((action: { id: string; title: string; params?: object }) => void) | undefined;
    routeQuickActions({
      initial: undefined,
      listen: (next) => {
        handler = next;
        return { remove() {} };
      },
      session: session(true).session,
      navigate,
    });
    handler?.({ id: 'b', title: 'B', params: { href: '/channel/c1' } });
    vi.runAllTimers();
    expect(navigate).toHaveBeenCalledWith('/channel/c1');
  });
});
