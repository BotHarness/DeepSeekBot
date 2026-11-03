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
const menus: Array<{ title: string; actions: Array<{ text: string; onPress?: () => unknown }> }> =
  [];
vi.mock('../src/ui/primitives/app-dialog', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  showActionMenu: (title: string, actions: Array<{ text: string; onPress?: () => unknown }>) =>
    menus.push({ title, actions }),
}));

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

it('clears every Activity item of one kind, then everything, across the visible sections', async () => {
  const host = new FakeHost('a');
  const cleared = new Set<string>();
  remotes.set('a.tailnet.ts.net', host);
  host.methods.set('channels', () => ({
    channels: [{ id: 'group', type: 'group', name: 'Group', members: ['ada'] }],
  }));
  const repair = {
    id: 'repair:e1:ada',
    category: 'action',
    kind: 'bot-message-needs-repair',
    createdAt: new Date().toISOString(),
    channelId: 'group',
    channelName: 'Group',
    botSlug: 'ada',
    summary: 'Interrupted',
    messageId: 'm1',
    sourceEventId: 'e1',
  };
  const reply = {
    id: 'reply:e2',
    category: 'replies',
    kind: 'channel-reply',
    createdAt: new Date().toISOString(),
    channelId: 'group',
    channelName: 'Group',
    botSlug: 'ada',
    summary: 'Done',
    messageId: 'm2',
    sourceEventId: 'e2',
    isUnread: true,
  };
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items: [repair, reply].filter(
      (item) => item.category === args['category'] && !cleared.has(item.kind),
    ),
  }));
  host.methods.set('humanAttentionDismissAll', (args) => {
    const kinds = [repair, reply]
      .filter((item) => item.category === args['category'])
      .filter((item) => args['kind'] === undefined || item.kind === args['kind'])
      .filter((item) => !cleared.has(item.kind))
      .map((item) => item.kind);
    for (const kind of kinds) cleared.add(kind);
    return { accepted: true, dismissed: kinds.length, more: false };
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
  const { t } = await import('../src/ui/strings');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  const rows = () =>
    [...view.querySelectorAll<HTMLElement>('[data-testid^="inbox-row-"]')].map((el) =>
      el.getAttribute('data-testid'),
    );
  const clearButton = () =>
    view.querySelector<HTMLElement>('[data-testid="activity-clear-many"]') ?? undefined;
  try {
    await act(async () => root.render(createElement(Screen)));
    await settle();
    expect(rows()).toHaveLength(2);
    await act(async () => clearButton()!.click());
    expect(menus.at(-1)!.actions.map((action) => action.text)).toEqual([
      t.activityClearAll,
      t.kind['bot-message-needs-repair'],
      t.kind['channel-reply'],
    ]);
    expect(host.calls.some((call) => call.method === 'humanAttentionDismissAll')).toBe(false);
    await act(async () => {
      await menus.at(-1)!.actions[1]!.onPress!();
    });
    await settle();
    expect(
      host.calls
        .filter((call) => call.method === 'humanAttentionDismissAll')
        .map((call) => call.args),
    ).toEqual([
      { category: 'action', kind: 'bot-message-needs-repair' },
      { category: 'replies', kind: 'bot-message-needs-repair' },
      { category: 'unread', kind: 'bot-message-needs-repair' },
    ]);
    expect(rows()).toEqual([`inbox-row-${JSON.stringify(['a', 'reply:e2'])}`]);
    expect(view.textContent).toContain(t.activityClearedCount(1));
    await act(async () => clearButton()!.click());
    await act(async () => {
      await menus.at(-1)!.actions[0]!.onPress!();
    });
    await settle();
    expect(rows()).toEqual([]);
    expect(clearButton()).toBeUndefined();
  } finally {
    await act(async () => {
      root.unmount();
      hostSession.getHost('a')?.client.stop();
    });
    view.remove();
  }
}, 60_000);
