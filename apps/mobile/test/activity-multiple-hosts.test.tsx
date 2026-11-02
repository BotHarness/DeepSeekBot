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
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import { secure, remotes } from './host-session-fixture';
import { FakeHost } from './fake-host';
import { t } from '../src/ui/strings';
import { createHostLooks } from '../src/host/host-look';
import wire from './fixtures/inbox-wire.json';
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name, tintColor }: { name: { android: string }; tintColor: string }) =>
    createElement('i', { 'data-symbol': name.android, 'data-color': tintColor }),
}));
const push = vi.fn();
const looks = createHostLooks({ read: async () => undefined, write() {} });
vi.mock('../src/host/native-host-look', () => ({ hostLooks: looks }));
vi.mock('../src/cloud/native', () => ({ useCloudSnapshot: () => ({ ready: true, rows: [] }) }));
vi.mock('../src/ui/shell/host-drawer', () => ({
  HostDrawerEdge: ({ children }: { children: ReactNode }) => children,
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const question = wire.rpc['humanAttention.actionQuestion'].result.value.items[0]!;
const approval = wire.rpc['humanAttention.action'].result.value.items[0]!;
async function settle() {
  for (let i = 0; i < 12; i++)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}
it('real Activity screen combines both Hosts and resolves a colliding approval only at its source', async () => {
  const a = new FakeHost('a'),
    b = new FakeHost('b');
  const resolved = new Set<string>();
  const answered = new Set<string>();
  for (const [id, remote] of [
    ['a', a],
    ['b', b],
  ] as const) {
    remotes.set(id + '.tailnet.ts.net', remote);
    remote.methods.set('humanAttention', (args) => ({
      queryVersion: 1,
      items:
        args['category'] === 'action'
          ? [...(answered.has(id) ? [] : [question]), ...(resolved.has(id) ? [] : [approval])]
          : [],
    }));
    remote.answers.set('toolApprovalStatus', () =>
      structuredClone(wire.rpc['toolApprovalStatus.pending'].result),
    );
    remote.answers.set('toolApprovalDecide', () => {
      resolved.add(id);
      return structuredClone(wire.rpc['toolApprovalDecide.accepted'].result);
    });
    remote.answers.set('userQuestionStatus', () =>
      structuredClone(wire.rpc['userQuestionStatus.pending'].result),
    );
    remote.answers.set('userQuestionAnswer', () => {
      answered.add(id);
      return structuredClone(wire.rpc['userQuestionAnswer.accepted'].result);
    });
    remote.answers.set('channelTimeline', (args) =>
      structuredClone(
        wire.rpc[
          args['around'] === approval.messageId
            ? 'channelTimeline.approvalPending'
            : 'channelTimeline.questionPending'
        ].result,
      ),
    );
  }
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      current: 'a',
      hosts: ['a', 'b'].map((hostId) => ({
        hostId,
        hostName: hostId,
        routes: [`https://${hostId}.tailnet.ts.net`],
        deviceId: 'device-1',
        credential: a.credential,
      })),
    }),
  );
  const { hostSession } = await import('../src/host/host-session');
  const { default: Screen } = await import('../app/(tabs)/(activity)/activity');
  const { conversationFilter } = await import('../src/host/native-conversation-filter');
  const { computerEnvironmentKey } = await import('../src/host/conversation-environments');
  const view = document.createElement('div');
  document.body.append(view);
  const root = createRoot(view);
  const posts = () =>
    [...view.querySelectorAll('[data-testid^="inbox-post-"]')].filter(
      (el) => !el.closest('[hidden]'),
    );
  try {
    await act(async () => root.render(createElement(Screen)));
    await settle();
    expect(posts()).toHaveLength(4);
    expect(posts()[0]!.textContent).toContain('a');
    expect(posts().every((post) => post.querySelector('[data-symbol="computer"]'))).toBe(true);
    await act(async () => looks.set('b', { icon: { kind: 'symbol', id: 'lab' }, color: 'purple' }));
    await settle();
    const bPosts = posts().filter((post) => post.getAttribute('data-testid')?.includes('["b",'));
    expect(bPosts).toHaveLength(2);
    expect(bPosts.every((post) => post.querySelector('[data-symbol="science"]'))).toBe(true);
    const aColor = posts()
      .find((post) => post.getAttribute('data-testid')?.includes('["a",'))!
      .querySelector('[data-symbol]')!
      .getAttribute('data-color');
    expect(bPosts[0]!.querySelector('[data-symbol]')!.getAttribute('data-color')).not.toBe(aColor);
    const aQuestion = posts().find(
      (el) => el.getAttribute('data-testid') === `inbox-post-${JSON.stringify(['a', question.id])}`,
    )!;
    const option = [...aQuestion.querySelectorAll<HTMLButtonElement>('button')].find(
      (el) => el.getAttribute('aria-label') === t.option('A', 'Teal'),
    )!;
    await act(async () => option.click());
    const roster = hostSession.getHost('b')!.client.getSnapshot().roster!;
    await act(async () => b.push('botharness/followRoster', { type: 'latest', ...roster }));
    await settle();
    expect(
      posts().find(
        (el) => el.getAttribute('data-testid') === aQuestion.getAttribute('data-testid'),
      ),
    ).toBe(aQuestion);
    expect(option.getAttribute('aria-checked')).toBe('true');

    const sourcePost = posts().find(
      (el) => el.getAttribute('data-testid') === `inbox-post-${JSON.stringify(['b', approval.id])}`,
    )!;
    const allow = sourcePost.querySelector<HTMLButtonElement>(
      '[data-testid="approval-allow-once"]',
    );
    expect(allow).not.toBeNull();
    await act(async () => allow!.click());
    await settle();
    expect(resolved).toEqual(new Set(['b']));
    expect(a.calls.some((call) => call.method === 'toolApprovalDecide')).toBe(false);
    expect(hostSession.getState().saved?.hostId).toBe('a');
    await act(async () => conversationFilter.set(computerEnvironmentKey('a')));
    await settle();
    expect(posts()).toHaveLength(2);
    expect(hostSession.getHost('b')?.client.getSnapshot().connection.status).toBe('connected');
    await act(async () => conversationFilter.set('all'));
    await settle();
    expect(posts()).toHaveLength(3);
    const bQuestion = posts().find(
      (el) => el.getAttribute('data-testid') === `inbox-post-${JSON.stringify(['b', question.id])}`,
    )!;
    for (const label of [t.option('A', 'Teal'), t.option('B', 'Biscuits'), t.submitChoice]) {
      const button = [...bQuestion.querySelectorAll<HTMLButtonElement>('button')].find(
        (el) => el.getAttribute('aria-label') === label,
      )!;
      await act(async () => button.click());
      await settle();
    }
    expect(answered).toEqual(new Set(['b']));
    expect(a.calls.some((call) => call.method === 'userQuestionAnswer')).toBe(false);
    expect(posts()).toHaveLength(2);
    await act(async () => b.revoke());
    await settle();
    expect(posts()).toHaveLength(2);
    expect(hostSession.getHost('a')?.client.getSnapshot().connection.status).toBe('connected');
  } finally {
    await act(async () => {
      root.unmount();
      hostSession.getHost('a')?.client.stop();
      hostSession.getHost('b')?.client.stop();
    });
    view.remove();
  }
}, 60_000);
