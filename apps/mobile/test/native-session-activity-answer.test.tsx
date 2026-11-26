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
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name }: { name: { android: string } }) =>
    createElement('i', { 'data-symbol': name.android }),
}));
const push = vi.fn();
const looks = createHostLooks({ read: async () => undefined, write() {} });
vi.mock('../src/host/native-host-look', () => ({ hostLooks: looks }));
vi.mock('../src/cloud/native', () => ({ useCloudSnapshot: () => ({ ready: true, rows: [] }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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

it('answers native approvals and questions inline in Activity, and shows a stale one as decided', async () => {
  const host = new FakeHost('b');
  remotes.set('b.tailnet.ts.net', host);
  const asks = {
    ...native,
    id: 'native-session:event-1',
    nativeSession: {
      ...native.nativeSession,
      request: { kind: 'approval', requestId: 'event-1', toolName: 'bash', reason: 'Deploy it' },
    },
  };
  const question = {
    ...native,
    id: 'native-session:event-2',
    requestId: 'event-2',
    nativeSession: {
      sessionId: 'native-2',
      input: 'question',
      sessionTitle: 'Pick a name',
      folderName: 'site',
      request: {
        kind: 'question',
        requestId: 'event-2',
        questions: [
          {
            id: 'name',
            question: 'Which release name?',
            options: [{ label: 'Cedar' }, { label: 'Birch' }],
          },
        ],
      },
    },
  };
  const stale = {
    ...native,
    id: 'native-session:event-3',
    requestId: 'event-3',
    nativeSession: {
      sessionId: 'native-3',
      input: 'approval',
      sessionTitle: 'Old request',
      request: { kind: 'approval', requestId: 'event-3', toolName: 'bash' },
    },
  };
  const answered = new Set<string>();
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    ...(args['source'] === undefined ? {} : { source: args['source'] }),
    items:
      args['category'] === 'action'
        ? [asks, question, stale].filter((item) => !answered.has(item.requestId))
        : [],
  }));
  const approvals = vi.fn((args: Record<string, unknown>) => {
    if (args['requestId'] === 'event-3')
      throw Object.assign(new Error('The Session request is no longer pending'), {
        code: 'session-input-not-pending',
      });
    answered.add(String(args['requestId']));
    return { sessionId: args['sessionId'], accepted: true };
  });
  const answers = vi.fn((args: Record<string, unknown>) => {
    answered.add(String(args['requestId']));
    return { sessionId: args['sessionId'], accepted: true };
  });
  host.methods.set('sessionAnswerApproval', approvals);
  host.methods.set('sessionAnswerQuestion', answers);
  secure.set(
    'deepseekbot.hosts.v3',
    JSON.stringify({
      version: 3,
      hosts: [
        {
          hostId: 'b',
          hostName: 'b',
          routes: ['https://b.tailnet.ts.net'],
          deviceId: 'device-2',
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
  const post = (id: string) =>
    view.querySelector<HTMLElement>(`[data-testid='inbox-post-${JSON.stringify(['b', id])}']`);
  const press = async (scope: HTMLElement, label: string) => {
    const button = [...scope.querySelectorAll<HTMLElement>('[aria-label]')].find(
      (el) => el.getAttribute('aria-label') === label,
    );
    expect(button, label).toBeDefined();
    await act(async () => button!.click());
    await settle();
  };
  try {
    await act(async () => root.render(createElement(Screen)));
    await settle();
    const approval = post(asks.id)!;
    expect(approval).not.toBeNull();
    expect(approval.querySelector('[data-testid="approval-always-allow"]')).toBeNull();
    expect(
      approval.querySelector('[data-testid="activity-native-session-mark"]')?.textContent,
    ).toBe('LS');
    await press(approval, t.allowOnce);
    expect(approvals).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'native-1',
        requestId: 'event-1',
        decision: 'allowed-once',
      }),
    );
    expect(post(asks.id)).toBeNull();

    const asked = post(question.id)!;
    expect(asked.textContent).toContain('Which release name?');
    await act(async () =>
      asked.querySelector<HTMLElement>('[data-testid="question-option-0"]')!.click(),
    );
    await settle();
    expect(answers).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'native-2',
        requestId: 'event-2',
        answer: { answers: [{ id: 'name', selected: ['Cedar'] }] },
      }),
    );
    expect(post(question.id)).toBeNull();

    await press(post(stale.id)!, t.reject);
    expect(post(stale.id)).not.toBeNull();
    expect(post(stale.id)!.textContent).toContain(t.cardDecided);
  } finally {
    await act(async () => {
      root.unmount();
      hostSession.getHost('b')?.client.stop();
    });
    view.remove();
  }
}, 60_000);
