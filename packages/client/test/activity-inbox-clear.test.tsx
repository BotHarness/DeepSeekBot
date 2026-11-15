// @vitest-environment jsdom
import { act, createElement, type ReactElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
const menuProbe = vi.hoisted((): { select: ((id: string) => void) | undefined } => ({
  select: undefined,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./activity-list-test-controls.js')),
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
}));
type Entry = { id: string; label?: ReactNode; submenu?: Entry[]; type?: string };
vi.mock('../src/client/appearance-primitives.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Menu: ({
    open,
    anchor,
    items = [],
    onSelect,
  }: {
    open: boolean;
    anchor: ReactNode;
    items?: Entry[];
    onSelect?: (id: string) => void;
  }): ReactElement => {
    menuProbe.select = onSelect;
    const flat = items.flatMap((item) => [item, ...(item.submenu ?? [])]);
    return createElement(
      'span',
      null,
      anchor,
      open
        ? createElement(
            'div',
            { role: 'menu' },
            ...flat
              .filter((item) => item.type === undefined)
              .map((item) =>
                createElement(
                  'button',
                  { key: item.id, 'data-id': item.id, onClick: () => onSelect?.(item.id) },
                  item.label,
                ),
              ),
          )
        : null,
    );
  },
}));

import { createActions } from '../src/client/actions.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { activityFeedFor } from '../src/client/activity-feed.js';
import { ActivityInboxMenu } from '../src/client/activity-inbox-menu.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';
import * as remoteHostModule from '../src/client/remote-hosts.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';

const repair: HumanAttentionItem = {
  id: 'repair:e1:ada',
  kind: 'bot-message-needs-repair',
  category: 'action',
  createdAt: '2026-11-03T08:00:00Z',
  channelId: 'dm-ada',
  channelName: 'Ada',
  botSlug: 'ada',
  messageId: 'm1',
  sourceEventId: 'e1',
  summary: 'Interrupted',
};
const reply: HumanAttentionItem = {
  id: 'reply:e2',
  kind: 'channel-reply',
  category: 'replies',
  createdAt: '2026-11-03T08:01:00Z',
  channelId: 'group-qa',
  channelName: 'Release QA',
  botSlug: 'ada',
  messageId: 'm2',
  sourceEventId: 'e2',
  summary: 'Done',
  isUnread: true,
};

it('clears every Activity item of one kind from the menu after confirmation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  let cleared = false;
  const call: BridgeCall = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === 'humanAttention')
      return {
        ok: true,
        value: {
          queryVersion: 1,
          items:
            payload.category === 'action' && !cleared
              ? [repair]
              : payload.category === 'replies'
                ? [reply]
                : [],
        },
      };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: false } };
    if (endpoint === 'humanAttentionDismissAll') {
      if (payload.category === 'action') cleared = true;
      return {
        ok: true,
        value: { accepted: true, dismissed: payload.category === 'action' ? 1 : 0, more: false },
      };
    }
    return { ok: true, value: {} };
  };
  const actions = createActions(call, store);
  const feed = activityFeedFor(actions);
  const release = feed.acquire();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const settle = async () => {
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  };
  try {
    await settle();
    await act(async () =>
      root.render(createElement(ActivityInboxMenu, { actions, t: zhTranslate })),
    );
    await settle();
    await act(async () =>
      container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click(),
    );
    const option = (id: string) =>
      document.querySelector<HTMLButtonElement>(`[data-id="${id}"]`) ?? undefined;
    expect(option('mark-read')?.textContent).toBe('全部标为已读');
    expect(option('dismiss:')?.textContent).toBe('全部条目');
    expect(option('dismiss:bot-message-needs-repair')?.textContent).toBe('处理中断');
    expect(option('dismiss:channel-reply')?.textContent).toBe('回复');
    await act(async () => option('dismiss:bot-message-needs-repair')!.click());
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
      '不会删除消息，也不会回答或拒绝任何请求',
    );
    expect(calls.some((entry) => entry.endpoint === 'humanAttentionDismissAll')).toBe(false);
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (node) => node.textContent?.trim() === '清理',
    )!;
    await act(async () => confirm.click());
    await settle();
    expect(
      calls.filter((entry) => entry.endpoint === 'humanAttentionDismissAll').map((e) => e.payload),
    ).toEqual([
      { kind: 'bot-message-needs-repair', category: 'action' },
      { kind: 'bot-message-needs-repair', category: 'replies' },
      { kind: 'bot-message-needs-repair', category: 'unread' },
    ]);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(feed.getSnapshot().pages.action.items).toEqual([]);
    expect(feed.getSnapshot().pages.replies.items).toHaveLength(1);
  } finally {
    await act(async () => root.unmount());
    release();
    container.remove();
  }
});

it('hides local bulk actions in remote scope and refuses stale selections and confirmation', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = new FakeHost('remote-b');
  const sources = remoteHostModule.createRemoteHosts({
    carrier: host.carrier,
    storage: {
      getItem: (key) =>
        key === remoteHostModule.REMOTE_HOSTS_STORAGE_KEY
          ? JSON.stringify([
              {
                hostId: host.hostId,
                hostName: 'Remote B',
                routes: ['http://127.0.0.1:47001'],
                deviceId: 'device',
                credential: host.credential,
              },
            ])
          : null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
  const replaceSources = vi.spyOn(remoteHostModule, 'remoteHosts').mockReturnValue(sources);
  const writes: string[] = [];
  const actions = createActions(async (endpoint, payload) => {
    if (endpoint === 'humanAttention')
      return {
        ok: true,
        value: {
          queryVersion: 1,
          items:
            payload.category === 'action'
              ? [repair]
              : payload.category === 'replies'
                ? [reply]
                : [],
        },
      };
    if (endpoint === 'channelMarkAllRead' || endpoint === 'humanAttentionDismissAll')
      writes.push(endpoint);
    return { ok: true, value: { unreadCount: 1, hasAction: true, dismissed: 1, more: false } };
  }, store);
  const feed = activityFeedFor(actions);
  const release = feed.acquire();
  await feed.refresh();
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const open = () =>
    act(async () => element.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click());
  const option = (id: string) => element.querySelector<HTMLButtonElement>('[data-id="' + id + '"]');
  try {
    sources.select('local');
    await act(async () =>
      root.render(createElement(ActivityInboxMenu, { actions, t: zhTranslate })),
    );
    await open();
    expect(option('mark-read')).not.toBeNull();
    const staleSelect = menuProbe.select!;
    await act(async () => {
      sources.select('remote-b');
      staleSelect('mark-read');
      staleSelect('dismiss:');
    });
    expect(writes).toEqual([]);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    await open();
    expect(option('mark-read')).toBeNull();
    expect(option('dismiss:')).toBeNull();
    expect(option('category:unread')).not.toBeNull();
    await act(async () => sources.select('all'));
    await open();
    expect(option('mark-read')).not.toBeNull();
    await act(async () => option('dismiss:')!.click());
    const confirm = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent?.trim() === '清理',
    )!;
    expect(confirm).toBeDefined();
    await act(async () => {
      sources.select('remote-b');
      confirm.click();
    });
    expect(writes).toEqual([]);
    expect(element.querySelector('[role="dialog"]')).toBeNull();
    await act(async () => sources.select('all'));
    expect(element.querySelector('[role="dialog"]')).toBeNull();
  } finally {
    await act(async () => {
      root.unmount();
    });
    release();
    replaceSources.mockRestore();
    element.remove();
  }
});

it('marks the filtered conversation read from the menu without clearing its items', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  let read = false;
  const call: BridgeCall = async (endpoint, payload) => {
    calls.push({ endpoint, payload });
    if (endpoint === 'humanAttention')
      return {
        ok: true,
        value: {
          queryVersion: 1,
          items: payload.category === 'replies' ? [{ ...reply, isUnread: !read }] : [],
        },
      };
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: read ? 0 : 1, hasAction: false } };
    if (endpoint === 'channelMarkAllRead') {
      read = true;
      return { ok: true, value: { channels: 1 } };
    }
    return { ok: true, value: {} };
  };
  const actions = createActions(call, store);
  const feed = activityFeedFor(actions);
  const release = feed.acquire();
  feed.setQuery({ channelId: 'group-qa' });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const settle = async () => {
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 0)));
  };
  try {
    await settle();
    await act(async () =>
      root.render(createElement(ActivityInboxMenu, { actions, t: zhTranslate })),
    );
    await settle();
    const open = () =>
      act(async () =>
        container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click(),
      );
    const option = (id: string) =>
      document.querySelector<HTMLButtonElement>(`[data-id="${id}"]`) ?? undefined;
    await open();
    await act(async () => option('mark-read')!.click());
    await settle();
    expect(
      calls.filter((entry) => entry.endpoint === 'channelMarkAllRead').map((e) => e.payload),
    ).toEqual([{ channelId: 'group-qa' }]);
    expect(calls.some((entry) => entry.endpoint === 'humanAttentionDismissAll')).toBe(false);
    expect(feed.getSnapshot().pages.replies.items).toHaveLength(1);
    expect(feed.getSnapshot().pages.replies.items[0]?.isUnread).toBe(false);
    await open();
    expect(option('mark-read')).toBeUndefined();
  } finally {
    feed.setQuery({ channelId: undefined });
    await act(async () => root.unmount());
    release();
    container.remove();
  }
});
