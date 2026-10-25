// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import type { HostSnapshot } from '../src/host/client';

const fixture = vi.hoisted(() => {
  const snapshot: HostSnapshot = {
    connection: { status: 'connected', route: 'https://host.test' },
    roster: {
      bots: [],
      channels: [],
      activityChannels: [
        { id: 'peer-channel', type: 'dm', name: 'Peer DM', members: ['ada', 'bob'] },
      ],
    },
  };
  return {
    item: {
      id: 'repair:e1:ada',
      category: 'action',
      kind: 'bot-message-needs-repair',
      createdAt: '2026-10-26',
      botSlug: 'ada',
      channelId: 'peer-channel',
      messageId: 'original-message',
      sourceEventId: 'e1',
      summary: 'Interrupted work',
    },
    snapshot,
  };
});
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/primitives/keyboard-form', () => ({
  KeyboardFormScroll: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock('../src/host/host-session', () => ({
  useHostSession: () => ({
    saved: { hostId: 'host-a' },
    client: {},
    inbox: { find: () => fixture.item },
  }),
  useHostSnapshot: () => fixture.snapshot,
  useInbox: () => ({ status: 'ready', sections: { action: [fixture.item] } }),
}));
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ ...fixture.item, hostId: 'host-a' }),
  useRouter: () => ({
    push: (href: { pathname: string; params: object }) =>
      navigation.dispatch({
        type: 'PUSH',
        payload: { name: href.pathname.slice(1), params: href.params },
      }),
  }),
  useNavigationContainerRef: () => navigation,
}));

import InboxItemScreen from '../app/inbox/[id]';
import { channelRouteId } from '../src/ui/shell/channel-navigation';
import { t } from '../src/ui/strings';

const stack = StackRouter({ initialRouteName: '(tabs)' });
const options = {
  routeNames: ['(tabs)', 'inbox/[id]', 'dm/[slug]', 'channel/[id]'],
  routeParamList: {},
  routeGetIdList: {
    'channel/[id]': ({ params }: { params?: object }) =>
      channelRouteId('channel/[id]', { ...params }),
    'dm/[slug]': ({ params }: { params?: object }) => channelRouteId('dm/[slug]', { ...params }),
  },
};
const initialState = (): Parameters<typeof stack.getStateForAction>[0] => ({
  stale: false,
  type: 'stack',
  key: 'root',
  routeKeySeq: 1,
  index: 0,
  routeNames: options.routeNames,
  routes: [{ key: 'tabs', name: '(tabs)', params: {} }],
});
let state = initialState();
const navigation = {
  isReady: () => true,
  getRootState: () => state,
  dispatch(action: Parameters<typeof stack.getStateForAction>[1]) {
    const result = stack.getStateForAction(state, action, options);
    if (typeof result === 'object') state = result.state;
  },
};
let root: Root | undefined;
let container: HTMLDivElement | undefined;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const originalRoster = fixture.snapshot.roster;
if (!originalRoster) throw new Error('Missing test Roster');
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  fixture.snapshot.roster = originalRoster;
  fixture.item.channelId = 'peer-channel';
});

it('opens an interrupted peer DM from its detail and Back returns to that detail', async () => {
  state = initialState();
  navigation.dispatch({
    type: 'PUSH',
    payload: { name: 'inbox/[id]', params: { id: fixture.item.id } },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  const open = container.querySelector<HTMLButtonElement>('[data-testid="repair-open"]');
  expect(open).not.toBeNull();
  await act(async () => open!.click());
  expect(state.routes[state.index]).toMatchObject({
    name: 'channel/[id]',
    params: { id: 'peer-channel', hostId: 'host-a', focus: 'original-message' },
  });
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]).toMatchObject({
    name: 'inbox/[id]',
    params: { id: fixture.item.id },
  });
});

it('shows unavailable feedback instead of silently ignoring an unknown Channel', async () => {
  fixture.item.channelId = 'gone';
  state = initialState();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('[data-testid="repair-open"]')!.click(),
  );
  expect(container.textContent).toContain(t.noChannel);
  expect(state.routes).toHaveLength(1);
});

it('can retry after the Roster finishes loading', async () => {
  delete fixture.snapshot.roster;
  state = initialState();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('[data-testid="repair-open"]')!.click(),
  );
  expect(container.textContent).toContain(t.channelOpeningNotReady);
  fixture.snapshot.roster = originalRoster;
  await act(async () => root!.render(<InboxItemScreen />));
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('[data-testid="repair-open"]')!.click(),
  );
  expect(state.routes[state.index]?.name).toBe('channel/[id]');
});

it('unwinds to the original Channel and updates focus instead of duplicating it', async () => {
  state = initialState();
  navigation.dispatch({
    type: 'PUSH',
    payload: {
      name: 'channel/[id]',
      params: { id: 'peer-channel', hostId: 'host-a', focus: 'old' },
    },
  });
  const originalKey = state.routes[state.index]?.key;
  navigation.dispatch({
    type: 'PUSH',
    payload: { name: 'channel/[id]', params: { id: 'another', hostId: 'host-a' } },
  });
  navigation.dispatch({
    type: 'PUSH',
    payload: { name: 'inbox/[id]', params: { id: fixture.item.id } },
  });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('[data-testid="repair-open"]')!.click(),
  );
  expect(state.routes).toHaveLength(2);
  expect(state.routes[state.index]).toMatchObject({
    key: originalKey,
    params: { focus: 'original-message' },
  });
  const params = state.routes[state.index]?.params;
  const request = params && 'focusRequest' in params ? params.focusRequest : undefined;
  expect(request).toEqual(expect.any(String));
  navigation.dispatch({
    type: 'PUSH',
    payload: { name: 'inbox/[id]', params: { id: fixture.item.id } },
  });
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('[data-testid="repair-open"]')!.click(),
  );
  expect(state.routes).toHaveLength(2);
  expect(state.routes[state.index]).toMatchObject({
    key: originalKey,
    params: { focus: 'original-message' },
  });
  expect(state.routes[state.index]?.params).not.toHaveProperty('focusRequest', request);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(state.routes[state.index]?.name).toBe('(tabs)');
});
