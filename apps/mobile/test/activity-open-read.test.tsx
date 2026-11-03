// @vitest-environment jsdom
import { channelNavigationHarness } from './channel-navigation-harness';
const channelHistory = channelNavigationHarness();
import { act, createElement, useLayoutEffect, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('expo-status-bar', () => ({ StatusBar: () => null }));
vi.mock('react-native-keyboard-controller', async () => import('./keyboard-controller-shim'));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({
  default: () => null,
  Path: () => null,
  Defs: () => null,
  LinearGradient: () => null,
  Rect: () => null,
  Stop: () => null,
}));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('react-native-tab-view', () => import('./tab-view-shim'));
vi.mock('react-native-gesture-handler', () => import('./gesture-handler-shim'));
vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => import('./gesture-handler-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push }),
  useIsFocused: () => true,
  useNavigationContainerRef: () => channelHistory.navigation,
  useFocusEffect: (work: () => void) => useLayoutEffect(work, [work]),
  Stack: { Screen: () => null },
}));
vi.mock('react-native-worklets', () => ({
  scheduleOnRN: (callback: () => void) => callback(),
}));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));
vi.mock('expo-symbols', () => ({ SymbolView: () => null }));

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
import { createHostLooks } from '../src/host/host-look';

const push = vi.fn();
const looks = createHostLooks({ read: async () => undefined, write() {} });
vi.mock('../src/host/native-host-look', () => ({ hostLooks: looks }));
vi.mock('../src/cloud/native', () => ({
  useCloudSnapshot: () => ({ ready: true, rows: [] }),
}));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function settle() {
  for (let i = 0; i < 12; i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

it('opening an unread reply from Activity opens its Channel and marks it read', async () => {
  const host = new FakeHost('a');
  let read = false;
  remotes.set('a.tailnet.ts.net', host);
  host.methods.set('channels', () => ({
    channels: [{ id: 'group', type: 'group', name: 'Group', members: ['ada'] }],
  }));
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items:
      args['category'] === 'replies' && !(read && args['unreadOnly'] === true)
        ? [
            {
              id: 'reply:event-1',
              category: 'replies',
              kind: 'channel-mention',
              createdAt: new Date().toISOString(),
              channelId: 'group',
              channelName: 'Group',
              botSlug: 'ada',
              summary: 'Ping',
              messageId: 'message-1',
              sourceEventId: 'event-1',
              isUnread: !read,
            },
          ]
        : [],
  }));
  host.methods.set('channelMarkRead', (args) => {
    expect(args).toEqual({ channelId: 'group', messageId: 'message-1' });
    read = true;
    return {
      position: {
        messageId: 'message-1',
        revision: 1,
        readAt: new Date().toISOString(),
      },
    };
  });
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current: 'a',
      hosts: [
        {
          hostId: 'a',
          hostName: 'a',
          routes: ['https://a.tailnet.ts.net'],
          deviceId: 'device-1',
          credential: host.credential,
        },
      ],
    }),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { default: Screen } = await import('../app/(tabs)/(activity)/activity');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  try {
    await act(async () => root.render(createElement(Screen)));
    await settle();
    const row = [...view.querySelectorAll<HTMLElement>('[data-testid^="inbox-row-"]')].find(
      (el) =>
        el.getAttribute('data-testid') === `inbox-row-${JSON.stringify(['a', 'reply:event-1'])}`,
    );
    expect(row).toBeDefined();
    await act(async () => row!.click());
    await settle();
    expect(push).not.toHaveBeenCalled();
    expect(channelHistory.state.routes.at(-1)).toMatchObject({
      name: 'channel/[id]',
      params: { hostId: 'a', id: 'group', focus: 'message-1' },
    });
    expect(host.calls.filter((call) => call.method === 'channelMarkRead')).toHaveLength(1);
    expect(read).toBe(true);
  } finally {
    await act(async () => {
      root.unmount();
      hostSession.getHost('a')?.client.stop();
    });
    view.remove();
  }
}, 60_000);
