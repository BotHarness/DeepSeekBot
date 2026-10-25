// @vitest-environment jsdom
import { act, useSyncExternalStore } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { NavigationAction } from 'expo-router/react-navigation';
import { StackRouter } from '../node_modules/expo-router/build/react-navigation/routers/StackRouter.js';
import { ClientError, publicInstance, MOBILE_REDIRECT_URI } from '../src/cloud/instance-contract';
import { cloudViewScope } from '../src/cloud/workspace-directory';

const fixture = vi.hoisted(() => ({
  userId: 'user-a',
  open: vi.fn(),
  messages: vi.fn(),
  list: vi.fn(),
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-keyboard-controller', () => import('./keyboard-controller-shim'));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (fn: () => void) => fn() }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'test' },
  File: class {
    exists = false;
    async text() {
      return '{}';
    }
    writeSync() {}
  },
}));
vi.mock('expo-router', async () => {
  const { useEffect } = await import('react');
  return {
    router: { push: () => {} },
    useNavigationContainerRef: () => navigation,
    useFocusEffect: (callback: () => void) => useEffect(callback, [callback]),
    useLocalSearchParams: () => state.routes[state.index]?.params ?? {},
  };
});
vi.mock('../src/cloud/native-message-cache', () => ({
  readCloudMessages: async () => null,
  removeCloudMessages: async () => {},
  cacheCloudMessages: async () => {},
}));
vi.mock('../src/cloud/native', () => ({
  cloudClient: {
    openChannel: fixture.open,
    readMessages: fixture.messages,
    listChannels: fixture.list,
    whoami: async () => {},
  },
  useCloudSnapshot: () => ({ ready: true, busy: false, rows: [row()] }),
}));
import { CloudChannelsScreen } from '../src/ui/cloud/channels-screen';
import { interfacePreferences } from '../src/ui/interface-preferences';
import {
  cloudChannelRouteId,
  navigateCloudChannel,
  ensureCloudChannelParent,
} from '../src/ui/shell/cloud-channel-navigation';
import { sourceDrafts } from '../src/host/native-source-drafts';
import { cloudDraftKey } from '../src/host/source-drafts';

const config = publicInstance({
  instanceId: 'uat',
  environment: 'uat',
  server: 'https://uat.example.test',
  clientId: 'client_test',
  issuer: 'https://api.workos.com/user_management/client_test',
  authkitDomain: 'test-staging.authkit.app',
  mobileRedirectUri: MOBILE_REDIRECT_URI,
});
function row() {
  return {
    config,
    hasSession: true,
    sessionUserId: fixture.userId,
    organization: {
      organizationId: 'org-a',
      role: 'member' as const,
      name: 'A',
      description: '',
      version: 1,
    },
  };
}
function scope() {
  return { instanceId: 'uat', organizationId: 'org-a', accountScope: cloudViewScope(row()) };
}
const stack = StackRouter({ initialRouteName: '(tabs)' });
const options = {
  routeNames: ['(tabs)', 'cloud-channels'],
  routeParamList: {},
  routeGetIdList: {
    'cloud-channels': ({ params }: { params?: object }) =>
      cloudChannelRouteId('cloud-channels', { ...params }),
  },
};
type State = Parameters<typeof stack.getStateForAction>[0];
let state: State;
const listeners = new Set<() => void>();
const navigation = {
  isReady: () => true,
  getRootState: () => state,
  dispatch(action: NavigationAction) {
    const next = stack.getStateForAction(
      state,
      action as Parameters<typeof stack.getStateForAction>[1],
      options,
    );
    if (typeof next === 'object') {
      state = next.state;
      for (const listener of listeners) listener();
    }
  },
};
function Harness() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
  );
  const route = current.routes[current.index];
  return route?.name === 'cloud-channels' ? (
    <CloudChannelsScreen key={route.key} />
  ) : (
    <div>Chats root</div>
  );
}
let root: Root;
let node: HTMLDivElement;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => {
  interfacePreferences.setLanguage('en');
  fixture.userId = 'user-a';
  fixture.list
    .mockReset()
    .mockResolvedValue({ channels: [{ channelId: 'channel-a', name: 'Alpha' }], nextCursor: null });
  fixture.open.mockReset().mockResolvedValue({ channelId: 'channel-a', name: 'Alpha' });
  fixture.messages.mockReset().mockResolvedValue({
    messages: [{ sequence: 1, authorType: 'human', authorId: 'qa', text: 'Cloud history' }],
    hasMore: false,
    nextCursor: 1,
  });
  state = {
    stale: false,
    type: 'stack',
    key: 'root',
    routeKeySeq: 0,
    index: 1,
    routeNames: options.routeNames,
    routes: [
      { name: '(tabs)', key: 'tabs' },
      { name: 'cloud-channels', key: 'list', params: scope() },
    ],
  };
  node = document.createElement('div');
  document.body.append(node);
  root = createRoot(node);
});
afterEach(() => {
  act(() => root.unmount());
  node.remove();
  interfacePreferences.setLanguage('system');
});
async function render() {
  await act(async () => root.render(<Harness />));
}
async function press(label: string) {
  const button = [...node.querySelectorAll('button')].find((entry) => entry.textContent === label);
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}

it('list selection creates a real detail step and native Back returns to that list', async () => {
  await render();
  await press('Open channel: Alpha');
  expect(state.routes).toHaveLength(3);
  expect(state.routes[state.index]).toMatchObject({
    name: 'cloud-channels',
    params: { ...scope(), channelId: 'channel-a' },
  });
  expect(node.textContent).toContain('Cloud history');
  await act(async () => navigation.dispatch({ type: 'GO_BACK' }));
  expect(state.routes[state.index]?.key).toBe('list');
  expect(node.textContent).toContain('Open channel: Alpha');
});

it('the in-page return uses the same history as native Back', async () => {
  await render();
  await press('Open channel: Alpha');
  await press('Back');
  expect(state.routes[state.index]?.key).toBe('list');
  expect(node.textContent).toContain('Open channel: Alpha');
});

it('direct channel entry establishes a scoped list parent before native Back', async () => {
  state = {
    ...state,
    routes: [
      state.routes[0]!,
      { name: 'cloud-channels', key: 'direct', params: { ...scope(), channelId: 'channel-a' } },
    ],
  };
  await render();
  expect(state.routes).toHaveLength(3);
  expect(state.routes[state.index]?.key).toBe('direct');
  expect(node.textContent).toContain('Cloud history');
  await act(async () => navigation.dispatch({ type: 'GO_BACK' }));
  expect(state.routes[state.index]?.params).toMatchObject(scope());
  expect(state.routes[state.index]?.params).not.toHaveProperty('channelId');
  expect(node.textContent).toContain('Open channel: Alpha');
});

it('a repeated scoped deep entry unwinds to the retained detail route', async () => {
  await render();
  await press('Open channel: Alpha');
  const key = state.routes[state.index]?.key;
  await act(async () =>
    navigateCloudChannel(navigation, { ...scope(), guest: false, channelId: 'channel-b' }),
  );
  await act(async () =>
    navigateCloudChannel(navigation, { ...scope(), guest: false, channelId: 'channel-a' }),
  );
  expect(state.routes).toHaveLength(3);
  expect(state.routes[state.index]?.key).toBe(key);
  await act(async () => navigation.dispatch({ type: 'GO_BACK' }));
  expect(state.routes[state.index]?.key).toBe('list');
});

it('keeps an unsent draft under the existing scoped owner after Back and reopen', async () => {
  await render();
  await press('Open channel: Alpha');
  const input = node.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]');
  expect(input).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
      input,
      'unsent draft',
    );
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(sourceDrafts.get(cloudDraftKey(scope().accountScope, 'org-a', 'channel-a'))).toBe(
    'unsent draft',
  );
  await press('Back');
  await press('Open channel: Alpha');
  expect(node.querySelector<HTMLTextAreaElement>('textarea[aria-label="Message"]')?.value).toBe(
    'unsent draft',
  );
});

it('refuses a stale account link and cannot synthesize a parent after a scope reset', async () => {
  const oldScope = scope();
  state = {
    ...state,
    routes: [
      state.routes[0]!,
      { name: 'cloud-channels', key: 'direct', params: { ...oldScope, channelId: 'channel-a' } },
    ],
  };
  fixture.userId = 'user-b';
  await render();
  expect(node.textContent).not.toContain('Cloud history');
  expect(fixture.open).not.toHaveBeenCalled();
  await act(async () =>
    navigation.dispatch({
      type: 'RESET',
      payload: { ...state, index: 0, routes: [state.routes[0]!] },
    }),
  );
  await act(async () =>
    ensureCloudChannelParent(navigation, { ...oldScope, guest: false, channelId: 'channel-a' }),
  );
  expect(state.routes).toHaveLength(1);
  expect(node.textContent).toBe('Chats root');
});

it('does not conflate the same channel ID under replacement accounts', async () => {
  await render();
  await press('Open channel: Alpha');
  const oldScope = scope();
  const oldKey = state.routes[state.index]?.key;
  fixture.userId = 'user-b';
  await act(async () =>
    navigateCloudChannel(navigation, { ...scope(), guest: false, channelId: 'channel-a' }),
  );
  const newKey = state.routes[state.index]?.key;
  expect(newKey).not.toBe(oldKey);
  expect(state.routes[state.index]?.params).toMatchObject({ accountScope: scope().accountScope });
  const routeCount = state.routes.length;
  await act(async () =>
    ensureCloudChannelParent(navigation, { ...oldScope, guest: false, channelId: 'channel-a' }),
  );
  expect(state.routes).toHaveLength(routeCount);
  expect(state.routes[state.index]?.key).toBe(newKey);
  await press('Back');
  expect(state.routes[state.index]?.params).toMatchObject({ accountScope: scope().accountScope });
  expect(state.routes[state.index]?.params).not.toHaveProperty('channelId');
});

it('keeps unavailable detail as a navigable page and revalidates its list on return', async () => {
  await render();
  fixture.open.mockRejectedValueOnce(new ClientError('ORGANIZATION_ACCESS_DENIED'));
  await press('Open channel: Alpha');
  expect(node.textContent).toContain('ORGANIZATION_ACCESS_DENIED');
  expect(state.routes[state.index]?.params).toHaveProperty('channelId', 'channel-a');
  fixture.list.mockRejectedValueOnce(new ClientError('ORGANIZATION_ACCESS_DENIED'));
  await press('Back');
  expect(state.routes[state.index]?.key).toBe('list');
  expect(node.textContent).not.toContain('Open channel: Alpha');
  expect(node.textContent).toContain('ORGANIZATION_ACCESS_DENIED');
});
