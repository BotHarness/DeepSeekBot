// @vitest-environment jsdom
import { channelNavigationHarness } from './channel-navigation-harness';
const channelHistory = channelNavigationHarness();
import { act, createElement, useLayoutEffect } from 'react';
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
  Circle: () => null,
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
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from '../../../packages/host-client/test/fake-host.js';
import { t } from '../src/ui/strings';
import { createHostLooks } from '@botharness/host-client/host-look';
import wire from './fixtures/inbox-wire.json';
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
const push = vi.fn();
const looks = createHostLooks({ read: async () => undefined, write() {} });
vi.mock('../src/host/native-host-look', () => ({ hostLooks: looks }));
vi.mock('../src/cloud/native', () => ({ useCloudSnapshot: () => ({ ready: true, rows: [] }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const approval = wire.rpc['humanAttention.action'].result.value.items[0]!;
const native = {
  id: 'native-session:event-1',
  category: 'action',
  kind: 'native-session-input',
  createdAt: '2026-11-25T10:00:00.000Z',
  botSlug: '',
  summary: 'bash',
  requestId: 'event-1',
  nativeSession: {
    sessionId: 'native-1',
    input: 'approval',
    sessionTitle: 'Ship it',
    folderName: 'landing-site',
  },
};

async function settle() {
  for (let i = 0; i < 12; i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

it('shows a native Session request in Activity, filters it by source and opens its Session', async () => {
  const host = new FakeHost('a');
  remotes.set('a.tailnet.ts.net', host);
  host.methods.set('humanAttention', (args) => {
    const wantsNative = args['source'] === 'all' || args['source'] === 'native';
    const wantsBot = args['source'] !== 'native';
    return {
      queryVersion: 1,
      ...(args['source'] === undefined ? {} : { source: args['source'] }),
      items:
        args['category'] === 'action'
          ? [...(wantsBot ? [approval] : []), ...(wantsNative ? [native] : [])]
          : [],
    };
  });
  host.answers.set('toolApprovalStatus', () =>
    structuredClone(wire.rpc['toolApprovalStatus.pending'].result),
  );
  host.answers.set('channelTimeline', () =>
    structuredClone(wire.rpc['channelTimeline.approvalPending'].result),
  );
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
  const { ActivityFilterContent } = await import('../src/ui/shell/activity-filters');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  const rowId = `inbox-row-${JSON.stringify(['a', native.id])}`;
  const row = () => view.querySelector<HTMLElement>(`[data-testid='${rowId}']`);
  try {
    await act(async () => root.render(createElement(Screen)));
    await settle();
    expect(
      host.calls
        .filter((call) => call.method === 'humanAttention' && call.args['queryVersion'] === 1)
        .every((call) => call.args['source'] === 'all'),
    ).toBe(true);
    expect(row()).not.toBeNull();
    expect(row()!.textContent).toContain('Ship it');
    expect(row()!.textContent).toContain(t.nativeSessionInput.approval);
    expect(row()!.querySelector('[data-testid="activity-native-session-mark"]')?.textContent).toBe(
      'LS',
    );
    expect(row()!.getAttribute('aria-label')).toContain(t.kind['native-session-input']);
    expect(
      view.querySelector(`[data-testid='inbox-swipe-${JSON.stringify(['a', native.id])}']`)
        ?.textContent,
    ).not.toContain(t.activitySnoozeTomorrow);
    await act(async () => row()!.click());
    expect(push).toHaveBeenCalledWith({
      pathname: '/session/[id]',
      params: { id: 'native-1', hostId: 'a', source: 'native', title: 'Ship it' },
    });

    const onFilter = vi.fn();
    const filters = document.createElement('div');
    document.body.append(filters);
    const filterRoot = createRoot(filters);
    await act(async () =>
      filterRoot.render(
        createElement(ActivityFilterContent, {
          bots: [{ slug: 'ada', name: 'Ada' }],
          channels: [],
          filter: { section: 'all', bot: 'ada' },
          sort: 'default',
          onFilter,
          onSort: () => undefined,
          onClose: () => undefined,
        }),
      ),
    );
    const sessions = [...filters.querySelectorAll<HTMLElement>('[aria-label]')].find(
      (el) => el.getAttribute('aria-label') === t.hostSessions.title,
    )!;
    await act(async () => sessions.click());
    expect(onFilter).toHaveBeenCalledWith({
      section: 'all',
      bot: undefined,
      channel: undefined,
      source: 'native',
    });
    await act(async () => filterRoot.unmount());
    filters.remove();
  } finally {
    await act(async () => {
      root.unmount();
      hostSession.getHost('a')?.client.stop();
    });
    view.remove();
  }
}, 60_000);
