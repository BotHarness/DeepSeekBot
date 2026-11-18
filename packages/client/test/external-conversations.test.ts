// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).shellPrimitives(),
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
}));
import { ExternalConversations } from '../src/client/external-conversations.js';
import { zhTranslate } from '../src/client/locale.js';

const identity = {
  id: 'binding',
  botSlug: 'ada',
  providerId: 'dsh-im/feishu',
  platform: 'feishu',
  accountRef: 'app',
  fingerprint: 'a'.repeat(64),
  name: 'QA Bot',
  enabled: true,
  revision: 2,
  createdAt: '2026-10-07T00:00:00Z',
  availability: 'available' as const,
  newConversations: 'ask' as const,
  grantCount: 2,
  scopes: [],
};

const entry = (id: string, name: string, muted: boolean) =>
  ({
    id,
    bindingId: 'binding',
    targetName: name,
    revision: 3,
    preferenceRevision: muted ? 1 : undefined,
    muted,
    receiveScope: { kind: 'group', conversationId: `oc_${id}` },
  }) as unknown as MessagingSnapshot['grants'][number];

const snapshot: MessagingSnapshot = {
  accounts: [],
  identities: [identity],
  grants: [entry('g1', 'Team', false), entry('g2', 'Noisy', true)],
  intents: [],
  heldConversations: [
    {
      bindingId: 'binding',
      conversation: { kind: 'dm', id: 'oc_new' },
      name: 'Stranger',
      reason: 'hourly-limit',
      firstSeenAt: '2026-10-07T00:00:00Z',
      lastSeenAt: '2026-10-07T00:01:00Z',
      count: 3,
      revision: 1,
    },
  ],
  blockedConversations: [
    {
      botSlug: 'ada',
      fingerprint: 'a'.repeat(64),
      bindingId: 'binding',
      conversation: { kind: 'group', id: 'oc_spam' },
      name: 'Spam',
      blockedAt: '2026-10-07T00:00:00Z',
      revision: 2,
    },
  ],
};

it('opens only the selected Lark group through an explicit revision-checked control', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const change = vi.fn(async () => {});
  const grant = {
    ...snapshot.grants[0]!,
    preferenceRevision: 4,
    openGroup: false,
    groupPolicy: {
      collection: 'mentions' as const,
      wake: 'digest' as const,
      count: 5,
      intervalSeconds: 30,
      revision: 0,
      changedAt: '',
      editor: { kind: 'built-in' as const },
    },
  };
  try {
    await act(async () =>
      root.render(
        createElement(ExternalConversations, {
          identity,
          snapshot: { ...snapshot, grants: [grant] },
          busy: false,
          t: zhTranslate,
          change,
          rules: vi.fn(),
        }),
      ),
    );
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((x) => x.textContent === zhTranslate('conversation.rules'))!
        .click(),
    );
    expect(host.textContent).toContain('未配对普通消息不累计唤醒阈值');
    await act(async () => (host.querySelector('input[type=checkbox]') as HTMLInputElement).click());
    expect(change).toHaveBeenLastCalledWith({
      kind: 'open-group',
      grantId: grant.id,
      expectedRevision: 4,
      open: true,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

it('groups conversations, confirms Block before sending it, and sends revision-checked commands', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const change = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ExternalConversations, {
        identity,
        snapshot,
        busy: false,
        t: zhTranslate,
        change,
        rules: vi.fn(),
      }),
    ),
  );
  const groups = [...container.querySelectorAll('section')].map((s) => [
    s.getAttribute('aria-label'),
    [...s.querySelectorAll('.bh-card-title')].map((n) => n.textContent),
  ]);
  expect(groups).toEqual([
    ['等待处理', ['Stranger']],
    ['活跃', ['Team']],
    ['已静音', ['Noisy']],
    ['已屏蔽', ['Spam']],
  ]);
  expect(container.textContent).toContain('已达每小时 20 个新会话上限');
  const button = (section: number, label: string) =>
    [...container.querySelectorAll('section')[section]!.querySelectorAll('button')].find(
      (b) => b.textContent === label,
    )!;
  await act(async () => button(1, '屏蔽').click());
  expect(change).not.toHaveBeenCalled();
  await act(async () => button(1, '确认屏蔽').click());
  expect(change).toHaveBeenLastCalledWith({ kind: 'block', grantId: 'g1', expectedRevision: 3 });
  await act(async () => button(2, '取消静音').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'mute',
    grantId: 'g2',
    expectedRevision: 1,
    muted: false,
  });
  await act(async () => button(0, '允许').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'allow',
    bindingId: 'binding',
    conversation: { kind: 'dm', id: 'oc_new' },
    from: 'held',
    expectedRevision: 1,
  });
  await act(async () => button(3, '再次允许').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'allow',
    bindingId: 'binding',
    conversation: { kind: 'group', id: 'oc_spam' },
    from: 'blocked',
    expectedRevision: 2,
  });
  await act(async () => root.unmount());
  container.remove();
});

it('shows where an entry is synced and offers no Sync action on the row', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const routed = {
    ...entry('g1', 'Team', false),
    bridgeRoutes: [{ channelId: 'c1' }],
  } as unknown as MessagingSnapshot['grants'][number];
  await act(async () =>
    root.render(
      createElement(ExternalConversations, {
        identity,
        snapshot: { ...snapshot, grants: [routed] },
        busy: false,
        t: zhTranslate,
        change: vi.fn(),
        rules: vi.fn(),
        channels: [{ id: 'c1', name: 'Intake' }],
      }),
    ),
  );
  expect(container.textContent).toContain('已同步到 Intake');
  expect([...container.querySelectorAll('button')].map((b) => b.textContent)).not.toContain('同步');
  await act(async () => root.unmount());
  container.remove();
});

it('lets an owning QQ group choose Channel sync and stop it while retaining Inbox-only intake', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const sync = vi.fn(async () => undefined);
  const group = { ...entry('qq-group', 'QA group', false), platform: 'qq' };
  await act(async () =>
    root.render(
      createElement(ExternalConversations, {
        identity: { ...identity, platform: 'qq', providerId: 'dsh-im/qq' },
        snapshot: { ...snapshot, grants: [group], heldConversations: [], blockedConversations: [] },
        busy: false,
        t: zhTranslate,
        change: vi.fn(),
        rules: vi.fn(),
        sync,
        syncChannels: [{ id: 'c1', name: 'QQ QA room' }],
      }),
    ),
  );
  const syncButton = [...container.querySelectorAll('button')].find(
    (button) => button.textContent === '同步',
  );
  expect(syncButton).toBeDefined();
  await act(async () => syncButton!.click());
  expect(container.textContent).toContain('仅 Bot Inbox');
  const toggle = container.querySelector<HTMLButtonElement>('button[aria-label="同步到 Channel"]')!;
  await act(async () => toggle.click());
  const option =
    document.querySelector<HTMLButtonElement>('button[role="option"][data-value="c1"]') ??
    [...document.querySelectorAll<HTMLButtonElement>('button[role="option"]')].find(
      (button) => button.textContent === 'QQ QA room',
    )!;
  await act(async () => option.click());
  const apply = container.querySelector<HTMLButtonElement>('button[aria-label="同步 QQ QA room"]')!;
  await act(async () => apply.click());
  expect(sync).toHaveBeenLastCalledWith(group, 'c1', true);
  const routed = {
    ...group,
    bridgeRoutes: [
      {
        id: 'inbox',
        channelId: null,
        name: 'QQ group',
        enabled: true,
        collection: 'mentions' as const,
        collectionInheritance: 'inherit' as const,
        revision: 1,
      },
      {
        id: 'channel',
        channelId: 'c1',
        name: 'QQ group',
        enabled: true,
        collection: 'mentions' as const,
        collectionInheritance: 'inherit' as const,
        revision: 1,
      },
    ],
  };
  const render = (grant: typeof routed) =>
    root.render(
      createElement(ExternalConversations, {
        identity: { ...identity, platform: 'qq', providerId: 'dsh-im/qq' },
        snapshot: { ...snapshot, grants: [grant], heldConversations: [], blockedConversations: [] },
        busy: false,
        t: zhTranslate,
        change: vi.fn(),
        rules: vi.fn(),
        sync,
        channels: [{ id: 'c1', name: 'QQ QA room' }],
        syncChannels: [{ id: 'c1', name: 'QQ QA room' }],
      }),
    );
  await act(async () => render(routed));
  expect(container.textContent).toContain('已同步到 QQ QA room');
  const stop = container.querySelector<HTMLButtonElement>(
    'button[aria-label="停止同步 QQ QA room"]',
  )!;
  await act(async () => stop.click());
  expect(sync).toHaveBeenLastCalledWith(routed, 'c1', false);
  await act(async () =>
    render({
      ...routed,
      bridgeRoutes: routed.bridgeRoutes.map((route) =>
        route.channelId === 'c1' ? { ...route, enabled: false } : route,
      ),
    }),
  );
  expect(container.textContent).toContain('仅 Bot Inbox');
  expect(container.textContent).not.toContain('已同步到 QQ QA room');
  await act(async () => root.unmount());
  container.remove();
});

it('shows scoped reception boundaries and explains that a gap has no known missed-message count', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ExternalConversations, {
        identity: { ...identity, platform: 'qq', providerId: 'dsh-im/qq' },
        snapshot: {
          ...snapshot,
          receptionHistory: [
            {
              id: 'gap',
              providerId: 'dsh-im/qq',
              fingerprint: identity.fingerprint,
              scope: 'connection',
              name: 'QA Bot',
              reason: 'provider-unavailable',
              boundary: 'observed',
              startedAt: '2026-10-08T01:00:00Z',
              endedAt: '2026-10-08T01:02:00Z',
            },
            {
              id: 'another-app',
              providerId: 'dsh-im/qq',
              fingerprint: 'b'.repeat(64),
              scope: 'connection',
              name: 'Other app',
              reason: 'provider-unavailable',
              boundary: 'observed',
              startedAt: '2026-10-08T01:00:00Z',
            },
          ],
        },
        busy: false,
        t: zhTranslate,
        change: vi.fn(),
        rules: vi.fn(),
      }),
    ),
  );
  expect(container.querySelector('summary')?.textContent).toContain('接收区间');
  expect(container.textContent).toContain('接收不可用');
  expect(container.textContent).toContain('不能据此确认漏收数量');
  expect(container.textContent).not.toContain('Other app');
  expect(container.querySelectorAll('time')).toHaveLength(2);
  await act(async () => root.unmount());
  container.remove();
});
