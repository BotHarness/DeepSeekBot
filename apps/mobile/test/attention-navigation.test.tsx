// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));
import type { HostSnapshot } from '@botharness/host-client/client';

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
    params: {} as Record<string, string>,
    calls: [] as Array<{ method: string; args: Record<string, unknown> }>,
    failDismiss: false,
    dismissed: false,
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
vi.mock('../src/host/host-session', () => {
  const session = {
    saved: { hostId: 'host-a' },
    client: {
      call: async (method: string, args: Record<string, unknown>) => {
        fixture.calls.push({ method, args });
        if (method === 'humanAttentionDismiss') {
          if (fixture.failDismiss) throw new Error('Host refused the clear');
          fixture.dismissed = true;
        }
        return { accepted: true };
      },
    },
    inbox: { find: () => (fixture.dismissed ? undefined : fixture.item), refresh: async () => {} },
  };
  return {
    useHostSession: () => session,
    useHostSnapshot: () => fixture.snapshot,
    useInbox: () => ({ status: 'ready', sections: { action: [fixture.item] } }),
  };
});
vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ ...fixture.item, hostId: 'host-a', ...fixture.params }),
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
import {
  appNavigationState,
  chatsRoutes,
  reduceAppNavigation,
  visibleRoute,
} from './channel-navigation-harness';
import { t } from '../src/ui/strings';

const initialState = () => appNavigationState();
let state = initialState();
const navigation = {
  isReady: () => true,
  getRootState: () => state,
  dispatch(action: Parameters<typeof reduceAppNavigation>[1]) {
    state = reduceAppNavigation(state, action);
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
  fixture.params = {};
  fixture.calls.length = 0;
  fixture.failDismiss = false;
  fixture.dismissed = false;
});

it('clears an interruption once when Activity opens it and keeps Open chat', async () => {
  state = initialState();
  fixture.params = { clearOnOpen: '1' };
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  await act(async () => root!.render(<InboxItemScreen />));
  expect(fixture.calls).toEqual([
    {
      method: 'humanAttentionDismiss',
      args: { itemId: fixture.item.id, sourceKey: fixture.item.sourceEventId },
    },
  ]);
  expect(container.querySelector('[data-testid="repair-clear"]')).toBeNull();
  expect(container.querySelector('[data-testid="repair-open"]')).not.toBeNull();
  expect(container.textContent).toContain(t.repairCleared);
  expect(container.textContent).not.toContain(t.repairHint);
});

it('shows a failed automatic clear and keeps Clear for a retry', async () => {
  state = initialState();
  fixture.params = { clearOnOpen: '1' };
  fixture.failDismiss = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  await act(async () => root!.render(<InboxItemScreen />));
  expect(fixture.calls.filter((call) => call.method === 'humanAttentionDismiss')).toHaveLength(1);
  expect(container.textContent).toContain('Host refused the clear');
  expect(container.querySelector('[data-testid="repair-clear"]')).not.toBeNull();
});

it('leaves an interruption in place when opened without clearOnOpen', async () => {
  state = initialState();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<InboxItemScreen />));
  expect(fixture.calls).toEqual([]);
  expect(container.querySelector('[data-testid="repair-clear"]')).not.toBeNull();
});

it('opens an interrupted peer DM from its detail in Chats and Back returns to the Chats list', async () => {
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
  expect(visibleRoute(state)).toMatchObject({
    name: 'channel/[id]',
    params: { id: 'peer-channel', hostId: 'host-a', focus: 'original-message' },
  });
  expect(state.routes).toHaveLength(1);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(visibleRoute(state)).toMatchObject({ name: 'index' });
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
  expect(chatsRoutes(state)).toHaveLength(1);
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
  expect(visibleRoute(state)?.name).toBe('channel/[id]');
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
  const originalKey = visibleRoute(state)?.key;
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
  expect(chatsRoutes(state)).toHaveLength(2);
  expect(state.routes).toHaveLength(1);
  expect(visibleRoute(state)).toMatchObject({
    key: originalKey,
    params: { focus: 'original-message' },
  });
  const params = visibleRoute(state)?.params;
  const request = params && 'focusRequest' in params ? params.focusRequest : undefined;
  expect(request).toEqual(expect.any(String));
  navigation.dispatch({
    type: 'PUSH',
    payload: { name: 'inbox/[id]', params: { id: fixture.item.id } },
  });
  await act(async () =>
    container!.querySelector<HTMLButtonElement>('[data-testid="repair-open"]')!.click(),
  );
  expect(chatsRoutes(state)).toHaveLength(2);
  expect(state.routes).toHaveLength(1);
  expect(visibleRoute(state)).toMatchObject({
    key: originalKey,
    params: { focus: 'original-message' },
  });
  expect(visibleRoute(state)?.params).not.toHaveProperty('focusRequest', request);
  navigation.dispatch({ type: 'GO_BACK' });
  expect(visibleRoute(state)?.name).toBe('index');
});
