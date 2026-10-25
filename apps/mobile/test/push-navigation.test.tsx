// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { View } from 'react-native';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import type { HostSnapshot } from '../src/host/client';
import { channelRouteId } from '../src/ui/shell/channel-navigation';
import { t } from '../src/ui/strings';
import { createHostDrawer } from '../src/ui/shell/host-drawer-model';
import { resetWorkspaceRoot } from '../src/ui/shell/workspace-navigation';

const fixture = vi.hoisted(() => {
  const snapshot: HostSnapshot = {
    connection: { status: 'connected', route: 'https://host.test' },
    roster: {
      bots: [],
      channels: [{ id: 'group-a', name: 'Group', members: ['ada'], memberCount: 1 }],
    },
  };
  return {
    snapshot,
    hostId: 'host-a',
    tap: undefined as ((data: unknown, action?: string) => void) | undefined,
    alerts: [] as string[],
    listeners: new Set<() => void>(),
    sessionListeners: new Set<() => void>(),
    ready: true,
    navigationReady: true,
    navigationListeners: new Set<() => void>(),
    switchGate: Promise.resolve(),
    selection: 0,
    approvalGate: Promise.resolve(),
    approvals: 0,
  };
});
vi.mock('react-native', async () => ({
  ...(await import('./react-native-shim')),
  Alert: { alert: (message: string) => fixture.alerts.push(message) },
}));
vi.mock('../src/host/native-notifications', () => ({
  onNotificationTap: (handler: typeof fixture.tap) => {
    fixture.tap = handler;
    return () => {
      fixture.tap = undefined;
    };
  },
}));
vi.mock('../src/host/native-carrier', () => ({ nativeCarrier: () => ({}) }));
vi.mock('../src/host/client', () => ({
  createHostClient: () => ({
    stop() {},
    call: async () => {
      fixture.approvals++;
      await fixture.approvalGate;
    },
  }),
}));
vi.mock('../src/host/host-session', () => ({
  hostSession: {
    getSelectionRevision: () => fixture.selection,
    getState: () => ({
      saved: fixture.ready ? { hostId: fixture.hostId } : undefined,
      hosts: [
        {
          hostId: 'host-a',
          hostName: 'A',
          deviceId: 'qa',
          credential: 'qa',
          routes: ['https://host.test'],
        },
      ],
      client: {
        getSnapshot: () => fixture.snapshot,
        subscribe: (listener: () => void) => {
          fixture.listeners.add(listener);
          return () => fixture.listeners.delete(listener);
        },
      },
    }),
    switchTo: async (hostId: string, current: () => boolean = () => true) => {
      fixture.selection++;
      await fixture.switchGate;
      if (!current()) return false;
      fixture.hostId = hostId;
      for (const listener of fixture.sessionListeners) listener();
      return true;
    },
    subscribe: (listener: () => void) => {
      fixture.sessionListeners.add(listener);
      return () => fixture.sessionListeners.delete(listener);
    },
  },
}));
vi.mock('expo-router', () => ({
  useNavigationContainerRef: () => navigation,
  useRouter: () => router,
}));
import { usePushRouting } from '../src/host/push-routing';

const stack = StackRouter({ initialRouteName: '(tabs)' });
const options = {
  routeNames: ['(tabs)', 'inbox/[id]', 'channel/[id]', 'dm/[slug]'],
  routeParamList: {},
  routeGetIdList: {
    'channel/[id]': ({ params }: { params?: object }) =>
      channelRouteId('channel/[id]', { ...params }),
  },
};
function initialState(): Parameters<typeof stack.getStateForAction>[0] {
  return {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 0,
    index: 0,
    routeNames: options.routeNames,
    routes: [{ key: 'tabs', name: '(tabs)' }],
  };
}
let state = initialState();
const navigation = {
  isReady: () => fixture.navigationReady,
  addListener: (_event: string, listener: () => void) => {
    fixture.navigationListeners.add(listener);
    return () => fixture.navigationListeners.delete(listener);
  },
  getRootState: () => state,
  dispatch(action: Parameters<typeof stack.getStateForAction>[1]) {
    const next = stack.getStateForAction(state, action, options);
    if (typeof next === 'object') state = next.state;
  },
};
const router = {
  navigate: () => {},
  push: (href: { pathname: string; params?: object }) =>
    navigation.dispatch({
      type: 'PUSH',
      payload: { name: href.pathname.slice(1), ...(href.params ? { params: href.params } : {}) },
    }),
};
const workspace = createHostDrawer({
  switchTo: async () => true,
  showView: () => {
    resetWorkspaceRoot({
      ...navigation,
      dispatch(action) {
        if (action.type !== 'RESET') throw new Error('Unexpected workspace action');
        navigation.dispatch({ type: 'RESET', payload: { ...state, ...action.payload } });
      },
    });
  },
  pair() {},
  notifications() {},
});
function NotificationEntry() {
  const ref = usePushRouting(undefined, workspace.captureWorkspaceSelection);
  return <View ref={ref} />;
}
let root: Root | undefined;
let container: HTMLDivElement | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.useRealTimers();
});
const originalRoster = fixture.snapshot.roster;
if (!originalRoster) throw new Error('Missing test Roster');
beforeEach(() => {
  fixture.selection = 0;
  fixture.approvals = 0;
  fixture.approvalGate = Promise.resolve();
  vi.useFakeTimers();
  state = initialState();
  fixture.hostId = 'host-a';
  fixture.ready = true;
  fixture.navigationReady = true;
  fixture.snapshot.roster = originalRoster;
  fixture.alerts = [];
  fixture.switchGate = Promise.resolve();
});
async function mount() {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<NotificationEntry />));
}
const notification = (hostId = 'host-a') => ({
  v: 1,
  hostId,
  itemId: 'reply',
  kind: 'channel-reply',
  botSlug: 'ada',
  channelId: 'group-a',
});

it('waits for the cold navigator to mount before dispatching', async () => {
  fixture.navigationReady = false;
  await mount();
  await act(async () => fixture.tap?.(notification()));
  expect(state.routes).toHaveLength(1);
  expect(fixture.alerts).toEqual([]);
  await act(async () => {
    fixture.navigationReady = true;
    for (const listener of fixture.navigationListeners) listener();
  });
  expect(state.routes[state.index]).toMatchObject({ name: 'channel/[id]' });
  expect(fixture.navigationListeners.size).toBe(0);
});

it('opens interruption details without waiting for the conversation list', async () => {
  delete fixture.snapshot.roster;
  await mount();
  await act(async () => fixture.tap?.({ ...notification(), kind: 'repair' }));
  expect(state.routes[state.index]).toMatchObject({
    name: 'inbox/[id]',
    params: { hostId: 'host-a' },
  });
  expect(fixture.alerts).toEqual([]);
});

it('two notification taps reuse one scoped Channel and Back returns to the origin', async () => {
  vi.useFakeTimers();
  state = initialState();
  fixture.hostId = 'host-a';
  navigation.dispatch({ type: 'PUSH', payload: { name: 'inbox/[id]', params: { id: 'origin' } } });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<NotificationEntry />));
  for (const itemId of ['first', 'second']) {
    await act(async () => {
      fixture.tap?.({
        v: 1,
        hostId: 'host-a',
        itemId,
        kind: 'channel-reply',
        botSlug: 'ada',
        channelId: 'group-a',
      });
      await vi.runAllTimersAsync();
    });
  }
  expect(state.routes).toHaveLength(3);
  expect(state.routes[state.index]).toMatchObject({
    name: 'channel/[id]',
    params: { hostId: 'host-a', id: 'group-a' },
  });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]).toMatchObject({ name: 'inbox/[id]', params: { id: 'origin' } });
});

it('unwinds intervening routes when another notification targets an older Channel', async () => {
  await mount();
  await act(async () => {
    fixture.tap?.(notification());
    await vi.runAllTimersAsync();
  });
  const key = state.routes[state.index]?.key;
  navigation.dispatch({
    type: 'PUSH',
    payload: { name: 'channel/[id]', params: { id: 'other', hostId: 'host-a' } },
  });
  await act(async () => {
    fixture.tap?.(notification());
    await vi.runAllTimersAsync();
  });
  expect(state.routes).toHaveLength(2);
  expect(state.routes[state.index]?.key).toBe(key);
});

it('repeats an explicit notification focus without replacing its retained Channel', async () => {
  await mount();
  const target = { ...notification(), messageId: 'original-message' };
  await act(async () => {
    fixture.tap?.(target);
    await vi.runAllTimersAsync();
  });
  const original = state.routes[state.index]!;
  const params = original.params;
  const request = params && 'focusRequest' in params ? params.focusRequest : undefined;
  expect(request).toEqual(expect.any(String));
  navigation.dispatch({ type: 'PUSH', payload: { name: 'inbox/[id]', params: { id: 'next' } } });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]).toEqual(original);
  await act(async () => {
    fixture.tap?.(target);
    await vi.runAllTimersAsync();
  });
  expect(state.routes).toHaveLength(2);
  expect(state.routes[state.index]).toMatchObject({
    key: original.key,
    params: { hostId: 'host-a', id: 'group-a', focus: 'original-message' },
  });
  expect(state.routes[state.index]?.params).not.toHaveProperty('focusRequest', request);
});

it('waits for cold source initialization and its Roster before opening', async () => {
  fixture.ready = false;
  delete fixture.snapshot.roster;
  await mount();
  await act(async () => fixture.tap?.(notification()));
  expect(state.routes).toHaveLength(1);
  await act(async () => {
    fixture.ready = true;
    for (const listener of fixture.sessionListeners) listener();
  });
  expect(state.routes).toHaveLength(1);
  await act(async () => {
    fixture.snapshot.roster = originalRoster;
    for (const listener of fixture.listeners) listener();
  });
  expect(state.routes[state.index]).toMatchObject({
    name: 'channel/[id]',
    params: { hostId: 'host-a' },
  });
  expect(fixture.listeners.size).toBe(0);
});

it('bounds the wait and reports a failure instead of silently ignoring a tap', async () => {
  delete fixture.snapshot.roster;
  await mount();
  await act(async () => {
    fixture.tap?.(notification());
    await vi.runAllTimersAsync();
  });
  expect(fixture.alerts).toHaveLength(1);
  expect(state.routes).toHaveLength(1);
  expect(fixture.listeners.size).toBe(0);
});

it('does not navigate after the entry unmounts while waiting', async () => {
  delete fixture.snapshot.roster;
  await mount();
  await act(async () => fixture.tap?.(notification()));
  await act(async () => {
    root!.unmount();
    root = undefined;
  });
  await act(async () => {
    fixture.snapshot.roster = originalRoster;
    for (const listener of fixture.listeners) listener();
    await vi.runAllTimersAsync();
  });
  expect(state.routes).toHaveLength(1);
  expect(fixture.listeners.size).toBe(0);
  expect(fixture.alerts).toEqual([]);
});

it('a later notification wins a pending Host switch without conflating same-name Channels', async () => {
  let release = () => {};
  fixture.switchGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mount();
  await act(async () => fixture.tap?.(notification('host-a')));
  await act(async () => fixture.tap?.(notification('host-b')));
  await act(async () => {
    release();
    await vi.runAllTimersAsync();
  });
  expect(state.routes).toHaveLength(2);
  expect(fixture.hostId).toBe('host-b');
  expect(state.routes[state.index]).toMatchObject({ params: { hostId: 'host-b', id: 'group-a' } });
  await act(async () => {
    fixture.tap?.(notification('host-a'));
    await vi.runAllTimersAsync();
  });
  expect(state.routes).toHaveLength(3);
  expect(state.routes[state.index]).toMatchObject({ params: { hostId: 'host-a', id: 'group-a' } });
});

it('cancels Host adoption as well as navigation when the notification owner unmounts', async () => {
  let release = () => {};
  fixture.switchGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mount();
  await act(async () => fixture.tap?.(notification('host-b')));
  await act(async () => {
    root!.unmount();
    root = undefined;
  });
  await act(async () => {
    release();
    await vi.runAllTimersAsync();
  });
  expect(fixture.hostId).toBe('host-a');
  expect(state.routes).toHaveLength(1);
  expect(fixture.alerts).toEqual([]);
});

it('maps unexpected persistence failures to localized feedback', async () => {
  await mount();
  await act(async () => {
    fixture.switchGate = Promise.reject(new Error('native diagnostic'));
    fixture.tap?.(notification());
  });
  expect(fixture.alerts).toEqual([t.channelOpeningFailed]);
  expect(state.routes).toHaveLength(1);
});

it('finishes an authorized notification action without overriding a newer manual Host selection', async () => {
  let release = () => {};
  fixture.approvalGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mount();
  await act(async () =>
    fixture.tap?.({ ...notification(), kind: 'tool-approval', messageId: 'approval' }, 'approve'),
  );
  expect(fixture.approvals).toBe(1);
  fixture.hostId = 'host-b';
  fixture.selection++;
  await act(async () => {
    release();
    await vi.runAllTimersAsync();
  });
  expect(fixture.hostId).toBe('host-b');
  expect(state.routes).toHaveLength(1);
  expect(fixture.alerts).toEqual([]);
});

it('a newer All workspace choice prevents a delayed approval from adopting its Host or page', async () => {
  let release = () => {};
  fixture.approvalGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mount();
  await act(async () =>
    fixture.tap?.({ ...notification(), kind: 'tool-approval', messageId: 'approval' }, 'approve'),
  );
  expect(fixture.approvals).toBe(1);
  fixture.hostId = 'host-b';
  workspace.selectAll();
  const selected = state;
  await act(async () => {
    release();
    await vi.runAllTimersAsync();
  });
  expect(fixture.hostId).toBe('host-b');
  expect(state).toBe(selected);
  expect(fixture.alerts).toEqual([]);
});

it('a newer workspace choice prevents pending notification Host persistence', async () => {
  let release = () => {};
  fixture.switchGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mount();
  await act(async () => fixture.tap?.(notification('host-b')));
  workspace.selectAll();
  const selected = state;
  await act(async () => {
    release();
    await vi.runAllTimersAsync();
  });
  expect(fixture.hostId).toBe('host-a');
  expect(state).toBe(selected);
  expect(fixture.alerts).toEqual([]);
});

it('a newer ordinary page navigation wins over a pending notification approval', async () => {
  let release = () => {};
  fixture.approvalGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await mount();
  await act(async () =>
    fixture.tap?.({ ...notification(), kind: 'tool-approval', messageId: 'approval' }, 'approve'),
  );
  expect(fixture.approvals).toBe(1);
  navigation.dispatch({
    type: 'NAVIGATE',
    payload: { name: 'dm/[slug]', params: { hostId: 'host-b', slug: 'grace' } },
  });
  const selected = state;
  await act(async () => {
    release();
    await vi.runAllTimersAsync();
  });
  expect(state).toBe(selected);
  expect(state.routes[state.index]).toMatchObject({ name: 'dm/[slug]', params: { slug: 'grace' } });
  expect(fixture.alerts).toEqual([]);
});
