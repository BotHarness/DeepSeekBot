// @vitest-environment jsdom
import { channelNavigationHarness } from './channel-navigation-harness';
const channelHistory = channelNavigationHarness();
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { secure, remotes, notificationTaps } from './host-session-fixture';
import { FakeHost } from './fake-host';
import { View } from 'react-native';
vi.mock('react-native', () => import('./react-native-shim'));
const push = vi.fn();
const router = { push, navigate: vi.fn() };
vi.mock('expo-router', () => ({
  useRouter: () => router,
  useFocusEffect: () => {},
  useNavigationContainerRef: () => ({ ...channelHistory.navigation, addListener: () => () => {} }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('a B badge notification selects B Activity with native navigation while retaining A connection', async () => {
  const a = new FakeHost('a'),
    b = new FakeHost('b');
  remotes.set('a.tailnet.ts.net', a);
  remotes.set('b.tailnet.ts.net', b);
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current: 'a',
      hosts: ['a', 'b'].map((hostId) => ({
        hostId,
        hostName: hostId,
        routes: [`https://${hostId}.tailnet.ts.net`],
        credential: a.credential,
        deviceId: 'device',
      })),
    }),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { usePushRouting } = await import('../src/host/push-routing');
  const { conversationFilter } = await import('../src/host/native-conversation-filter');
  const { computerEnvironmentKey } = await import('../src/host/conversation-environments');
  await vi.waitFor(() =>
    expect(hostSession.getHost('b')?.client.getSnapshot().connection.status).toBe('connected'),
  );
  conversationFilter.set(computerEnvironmentKey('a'));
  function Routing() {
    return createElement(View, { ref: usePushRouting() });
  }
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => root.render(createElement(Routing)));
    await act(async () => {
      for (const tap of notificationTaps) tap({ v: 1, hostId: 'b', test: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(router.navigate).toHaveBeenCalledWith('/activity');
    expect(conversationFilter.getSnapshot()).toBe(computerEnvironmentKey('b'));
    expect(hostSession.getState().saved?.hostId).toBe('b');
    expect(hostSession.getHost('a')?.client.getSnapshot().connection.status).toBe('connected');
  } finally {
    await act(async () => {
      root.unmount();
      for (const host of hostSession.getState().hosts) await hostSession.unpair(host.hostId);
    });
    view.remove();
  }
});
