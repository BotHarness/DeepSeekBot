// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./activity-list-test-controls.js')),
  Button: ({
    children,
    variant: _variant,
    size: _size,
    ...props
  }: {
    children?: ReactNode;
    variant?: string;
    size?: string;
  }) => createElement('button', props, children),
  MarkdownText: () => null,
  StateDot: () => null,
  Input: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
import { createActions, type BridgeActions } from '../src/client/actions.js';
import { ActivityListView, type ActivityListSource } from '../src/client/activity-list-view.js';
import { activityListSnoozeUntil } from '../src/client/activity-list-snooze.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';

const approval = (slug: string): HumanAttentionItem => ({
  id: 'approval:' + slug,
  category: 'action',
  kind: 'tool-approval',
  channelId: 'dm-' + slug,
  channelName: slug,
  botSlug: slug,
  messageId: 'request-' + slug,
  sourceEventId: 'event-' + slug,
  summary: 'Approve bash for ' + slug,
  createdAt: '2026-10-01T12:00:00Z',
});
const grant: HumanAttentionItem = {
  ...approval('grace'),
  id: 'grant:grace',
  kind: 'workspace-grant-request',
};

const previous = store.getSnapshot();
afterEach(() => {
  store.setRoster(previous.bots, previous.channels);
  store.select(previous.selection);
  store.setActivityList(previous.activityList);
  document.body.innerHTML = '';
});

async function mount(items: HumanAttentionItem[]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const actions = {
    ...createActions(async () => ({ ok: true, value: { items: [] } }), store),
    refreshActivityList: vi.fn(async () => undefined),
    dismissActivityList: vi.fn(async () => undefined),
    snoozeActivityList: vi.fn(
      async (_item: HumanAttentionItem, _until: string | null) => undefined,
    ),
    decideToolApproval: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    openAround: vi.fn(async () => undefined),
    setActivityListFilters: vi.fn(async (filters) => store.setActivityList(filters)),
  } satisfies BridgeActions;
  store.select({ kind: 'inbox' });
  store.setActivityList({
    category: 'action',
    status: 'ready',
    items,
    botSlug: undefined,
    channelId: undefined,
    sort: 'oldest',
    snoozed: false,
  });
  await act(async () => root.render(createElement(ActivityListView, { actions })));
  await act(async () =>
    [...host.querySelectorAll('button')].find((button) => button.textContent === '选择')!.click(),
  );
  const press = async (key: string, target: Element = document.activeElement ?? document.body) =>
    act(async () => {
      target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    });
  return { host, actions, press, unmount: () => act(async () => root.unmount()) };
}

const rows = (host: HTMLElement) => [...host.querySelectorAll<HTMLElement>('[role="listitem"]')];

function deferred() {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function pendingSources(kind: 'channel-unread' | 'channel-reply') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const items: HumanAttentionItem[] = [
    {
      ...approval('tob'),
      id: 'same-id',
      kind,
      category: kind === 'channel-unread' ? 'unread' : 'replies',
      isUnread: true,
    },
    {
      ...approval('tob'),
      id: 'same-id',
      kind,
      category: kind === 'channel-unread' ? 'unread' : 'replies',
      isUnread: true,
      summary: 'Other Host',
    },
  ];
  const pending = [deferred(), deferred()];
  const actions = createActions(async () => ({ ok: true, value: { items: [] } }), store);
  const sources = items.map((_, index): ActivityListSource => ({
    hostId: 'host-' + index,
    commands: {
      ...actions,
      markRead: () => pending[index]!.promise,
      dismissActivityList: () => pending[index]!.promise,
      snoozeActivityList: () => pending[index]!.promise,
    },
    detail: () =>
      createElement('p', { 'data-source-detail': String(index) }, 'Host ' + index + ' detail'),
    botName: () => 'Host ' + index,
    isDirect: () => true,
    open: async () => {},
    sourceButton: () => null,
    refresh: async () => {},
    loadMore: async () => {},
  }));
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  await act(async () =>
    root.render(
      createElement(ActivityListView, {
        actions,
        inboxOverride: {
          ...previous.activityList,
          category: kind === 'channel-unread' ? 'unread' : 'replies',
          items,
          status: 'ready',
        },
        itemSource: (item) => sources[items.indexOf(item)],
      }),
    ),
  );
  const button = (index: number, label: string) =>
    [...rows(element)[index]!.querySelectorAll('button')].find(
      (button) => button.textContent === label,
    )!;
  return {
    element,
    pending,
    button,
    close: () =>
      act(async () => {
        pending.forEach((value) => value.resolve());
        root.unmount();
        element.remove();
      }),
  };
}

it('keeps concurrent equal-ID reads on separate Hosts independently busy', async () => {
  const view = await pendingSources('channel-unread');
  try {
    await act(async () => view.button(0, '标为已读').click());
    await act(async () => view.button(1, '标为已读').click());
    expect(view.button(0, '标为已读').disabled).toBe(true);
    expect(view.button(1, '标为已读').disabled).toBe(true);
    await act(async () => view.pending[0]!.resolve());
    expect(view.button(0, '标为已读').disabled).toBe(false);
    expect(view.button(1, '标为已读').disabled).toBe(true);
    await act(async () => view.pending[1]!.resolve());
    expect(view.button(1, '标为已读').disabled).toBe(false);
  } finally {
    await view.close();
  }
});

it.each(['dismiss', 'snooze'])(
  'keeps a newly opened Host detail when an old %s finishes',
  async (operation) => {
    const view = await pendingSources('channel-reply');
    try {
      await act(async () =>
        rows(view.element)[0]!
          .querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!
          .click(),
      );
      expect(view.element.querySelector('[data-source-detail="0"]')).not.toBeNull();
      if (operation === 'dismiss') await act(async () => view.button(0, '移除').click());
      else {
        await act(async () => view.button(0, '稍后提醒').click());
        await act(async () =>
          view.element.querySelector<HTMLButtonElement>('[role="menu"] button')!.click(),
        );
      }
      await act(async () =>
        rows(view.element)[1]!
          .querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!
          .click(),
      );
      await act(async () => view.pending[0]!.resolve());
      expect(view.element.querySelector('[data-source-detail="1"]')).not.toBeNull();
      expect(view.element.querySelector('[data-source-detail="0"]')).toBeNull();
    } finally {
      await view.close();
    }
  },
);

describe('Human Inbox keyboard', () => {
  it('moves with J and K, does not handle with E and opens the source with Enter', async () => {
    const view = await mount([approval('ada'), grant]);
    await view.press('j');
    expect(document.activeElement).toBe(
      rows(view.host)[0]!.querySelector('.bh-activity-list-row-open'),
    );
    await view.press('j');
    expect(rows(view.host)[1]!.hasAttribute('data-cursor')).toBe(true);
    await view.press('k');
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(true);
    await view.press('Enter');
    expect(view.actions.openBot).toHaveBeenCalledWith('ada');
    expect(view.actions.openAround).toHaveBeenCalledWith('dm-ada', 'request-ada');
    await view.press('e');
    expect(view.actions.dismissActivityList).not.toHaveBeenCalled();
    await view.unmount();
  });

  it('leaves keys typed into fields and modified keys alone', async () => {
    const view = await mount([approval('ada')]);
    const field = document.createElement('input');
    view.host.querySelector('main')!.append(field);
    await view.press('e', field);
    await act(async () => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', ctrlKey: true, bubbles: true }),
      );
    });
    expect(view.actions.dismissActivityList).not.toHaveBeenCalled();
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(false);
    await view.unmount();
  });

  it('stays still behind the shortcut list and lets ? through', async () => {
    const view = await mount([approval('ada')]);
    const question = new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true });
    await act(async () => {
      document.body.dispatchEvent(question);
    });
    expect(question.defaultPrevented).toBe(false);
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    document.body.append(dialog);
    await view.press('j', document.body);
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(false);
    dialog.remove();
    await view.press('j', document.body);
    expect(rows(view.host)[0]!.hasAttribute('data-cursor')).toBe(true);
    await view.unmount();
  });
});

describe('Human Inbox bulk actions', () => {
  it('selects with X and allows every selected tool approval once', async () => {
    const view = await mount([approval('ada'), approval('bo')]);
    await view.press('j');
    await view.press('x');
    await view.press('j');
    await view.press('x');
    const toolbar = view.host.querySelector('[role="toolbar"]')!;
    expect(toolbar.textContent).toContain('已选 2 项');
    const allow = [...toolbar.querySelectorAll('button')].find(
      (b) => b.textContent === '批准这 2 个请求（仅一次）',
    )!;
    await act(async () => allow.click());
    expect(view.actions.decideToolApproval.mock.calls).toEqual([
      ['dm-ada', 'request-ada', 'allowed-once'],
      ['dm-bo', 'request-bo', 'allowed-once'],
    ]);
    expect(view.host.querySelector('[role="toolbar"]')!.textContent).not.toContain('已选');
    await view.unmount();
  });

  it('marks a mixed selection handled and only offers approval for approvals', async () => {
    const view = await mount([approval('ada'), grant]);
    const all = view.host.querySelector<HTMLInputElement>(
      '[role="toolbar"] input[type="checkbox"]',
    )!;
    await act(async () => all.click());
    const toolbar = view.host.querySelector('[role="toolbar"]')!;
    expect(toolbar.textContent).not.toContain('批准');
    const handle = [...toolbar.querySelectorAll('button')].find(
      (b) => b.textContent === '标为已处理',
    )!;
    await act(async () => handle.click());
    expect(view.actions.dismissActivityList).toHaveBeenCalledTimes(2);
    expect(view.actions.decideToolApproval).not.toHaveBeenCalled();
    await view.unmount();
  });
});

describe('Human Inbox snooze', () => {
  it('snoozes a selected row until the chosen time', async () => {
    const view = await mount([approval('ada')]);
    const button = [...view.host.querySelectorAll('button')].find(
      (b) => b.textContent === '稍后提醒',
    )!;
    await act(async () => button.click());
    const choice = view.host.querySelector<HTMLButtonElement>('[role="menu"] button')!;
    expect(choice.textContent).toBe('1 小时后');
    await act(async () => choice.click());
    const [item, until] = view.actions.snoozeActivityList.mock.calls[0]!;
    expect(item).toEqual(approval('ada'));
    expect(Date.parse(until as string) - Date.now()).toBeGreaterThan(59 * 60 * 1000);
    await view.unmount();
  });

  it('brings a snoozed item back', async () => {
    const view = await mount([{ ...approval('ada'), snoozedUntil: '2099-01-01T01:00:00.000Z' }]);
    expect(view.host.textContent).toContain('回来');
    const cancel = [...view.host.querySelectorAll('button')].find(
      (b) => b.textContent === '取消延后',
    )!;
    await act(async () => cancel.click());
    expect(view.actions.snoozeActivityList).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'approval:ada' }),
      null,
    );
    await view.unmount();
  });

  it('offers this evening only while it is still ahead and next week on Monday morning', () => {
    const friday = new Date(2026, 9, 16, 10, 0);
    expect(activityListSnoozeUntil('evening', friday)?.getHours()).toBe(18);
    expect(activityListSnoozeUntil('evening', new Date(2026, 9, 16, 17, 45))).toBeUndefined();
    const week = activityListSnoozeUntil('week', friday)!;
    expect([week.getDay(), week.getDate(), week.getHours()]).toEqual([1, 19, 9]);
    expect(activityListSnoozeUntil('tomorrow', friday)!.getDate()).toBe(17);
  });
});

import { remoteActivityPage } from '../src/client/remote-activity.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { ActivityCenterView } from '../src/client/activity-center-view.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { en, zhTranslate } from '../src/client/locale.js';
import type { InboxSnapshot } from '../../../apps/mobile/src/host/inbox.js';
import { bindTobPresentation } from '../src/client/tob-presentation.js';

async function remoteFixture(host: FakeHost) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
  const sources = createRemoteHosts({
    carrier: host.carrier,
    storage: {
      getItem: (key) =>
        key === REMOTE_HOSTS_STORAGE_KEY
          ? JSON.stringify([
              {
                hostId: host.hostId,
                hostName: 'Remote QA',
                routes: ['http://127.0.0.1:47001'],
                deviceId: 'device-1',
                credential: host.credential,
              },
            ])
          : null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
  const release = sources.subscribe(() => {});
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  sources.select(host.hostId);
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const registry = createDockPanelRegistry();
  return {
    sources,
    element,
    registry,
    async render(
      actions = createActions(
        async () => ({
          ok: true,
          value: { queryVersion: 1, items: [], unreadCount: 0, hasAction: false },
        }),
        store,
      ),
    ) {
      await act(async () =>
        root.render(
          createElement(ActivityCenterView, {
            sources,
            registry,
            t: zhTranslate,
            actions,
          }),
        ),
      );
    },
    async close() {
      await act(async () => root.unmount());
      release();
      element.remove();
    },
  };
}

it('isolates invalid remote items from the shared Inbox and retries the affected section', async () => {
  const host = new FakeHost();
  const valid = approval('tob');
  let invalid = true;
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items:
      args.category === 'action'
        ? [
            valid,
            ...(invalid
              ? [{ ...valid, id: 'unsupported', kind: 'future-request' }, { id: 'broken' }]
              : []),
          ]
        : [],
  }));
  host.methods.set('channelTimeline', () => ({
    revision: 1,
    page: {
      entries: [
        {
          id: valid.messageId,
          at: valid.createdAt,
          author: { kind: 'bot', slug: 'tob' },
          body: valid.summary,
          toolApprovalRequest: {
            sessionId: 'remote-session',
            callId: 'remote-call',
            toolName: 'bash',
            role: 'orchestrator',
            cwd: '',
            input: '{}',
            allowAlways: false,
          },
        },
      ],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    },
  }));
  host.methods.set('toolApprovalStatus', () => ({ status: 'pending' }));
  host.methods.set('toolApprovalDecide', () => ({ accepted: true }));
  const fixture = await remoteFixture(host);
  try {
    expect(fixture.sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
      status: 'ready',
      sections: { action: expect.arrayContaining([{ id: 'broken' }]) },
    });
    await fixture.render();
    expect(fixture.element.querySelectorAll('.bh-activity-list-row')).toHaveLength(1);
    expect(fixture.element.querySelectorAll('[role="alert"]')).toHaveLength(1);
    expect(fixture.element.querySelector('[role="alert"]')?.textContent).toContain(
      zhTranslate('activityList.failed'),
    );
    await act(async () =>
      fixture.element.querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!.click(),
    );
    const allow = () =>
      [...fixture.element.querySelectorAll('button')].find(
        (n) => n.textContent?.trim() === zhTranslate('approval.allowOnce'),
      );
    await act(async () => {
      await vi.waitFor(() => expect(allow()?.disabled).toBe(false));
    });
    await act(async () => allow()!.click());
    expect(host.calls.filter((c) => c.method === 'toolApprovalDecide')).toEqual([
      {
        method: 'toolApprovalDecide',
        args: { channelId: valid.channelId, messageId: valid.messageId, outcome: 'allowed-once' },
      },
    ]);
    invalid = false;
    await act(async () =>
      [...fixture.element.querySelectorAll('button')]
        .find((n) => n.textContent?.trim() === zhTranslate('activityInbox.retry'))!
        .click(),
    );
    expect(fixture.element.querySelector('[role="alert"]')).toBeNull();
  } finally {
    await fixture.close();
  }
});

it('retries a non-request detail open once against the same Host', async () => {
  const host = new FakeHost();
  const item = { ...approval('tob'), kind: 'workspace-grant-request' };
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items: args.category === 'action' ? [item] : [],
  }));
  const fixture = await remoteFixture(host);
  const open = vi.spyOn(fixture.sources, 'open').mockImplementationOnce(() => {
    throw new Error('Host open failed');
  });
  const openPanel = vi.fn();
  const detach = fixture.registry.attach({ open: openPanel, close: () => {} });
  try {
    await fixture.render();
    await act(async () =>
      fixture.element.querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!.click(),
    );
    await act(async () =>
      [...fixture.element.querySelectorAll('.bh-activity-list-reply button')]
        .find((n) => n.textContent?.trim() === zhTranslate('activityList.open'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(fixture.element.querySelector('[role="alert"]')?.textContent).toContain(
      zhTranslate('activityList.failed'),
    );
    expect(open).toHaveBeenCalledTimes(1);
    expect(openPanel).not.toHaveBeenCalled();
    await act(async () =>
      [...fixture.element.querySelectorAll('.bh-activity-list-reply button')]
        .find((n) => n.textContent?.trim() === zhTranslate('activityInbox.retry'))!
        .dispatchEvent(new MouseEvent('click', { bubbles: true })),
    );
    expect(fixture.element.querySelector('[role="alert"]')).toBeNull();
    expect(open).toHaveBeenCalledTimes(2);
    expect(open.mock.calls[1]?.[0]).toEqual(open.mock.calls[0]?.[0]);
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('bh:channel-body');
  } finally {
    detach();
    open.mockRestore();
    await fixture.close();
  }
});

it.each(['en', 'zh'] as const)(
  'localizes remote failures in %s without losing stale data',
  (locale) => {
    const english: Readonly<Record<string, string>> = en;
    const t = locale === 'zh' ? zhTranslate : (key: string) => english[key] ?? key;
    const raw = 'Host HTTP 502 returned non-JSON upstream response';
    const failed: InboxSnapshot = { status: 'error', error: raw };
    expect(remoteActivityPage(failed, 'action', t)).toMatchObject({
      status: 'error',
      error: t('activityList.failed'),
      items: [],
    });
    const retained: InboxSnapshot = {
      status: 'ready',
      stale: raw,
      sections: { action: [approval('tob')], replies: [], unread: [], handled: [] },
      cursors: { action: 'next-page' },
    };
    expect(remoteActivityPage(retained, 'action', t)).toMatchObject({
      status: 'ready',
      error: t('activityList.failed'),
      items: [approval('tob')],
      nextCursor: 'next-page',
    });
    expect(retained.stale).toBe(raw);
    expect(failed.error).toBe(raw);
    expect(
      remoteActivityPage({ ...retained, stale: undefined }, 'action', t).error,
    ).toBeUndefined();
  },
);

it('renders the remote identity and opens its Host even when a local Tob has the same slug', async () => {
  const host = new FakeHost();
  let unread = 2;
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items: args.category === 'action' ? [approval('tob')] : [],
  }));
  host.methods.set('channelUnreadCounts', () => ({
    channels: unread ? [{ channelId: 'dm-tob', unreadCount: unread }] : [],
  }));
  host.methods.set('channelMarkRead', () => {
    unread = 0;
    return { accepted: true };
  });
  host.methods.set('list', () => ({
    bots: [
      {
        slug: 'tob',
        displayName: 'Remote Tob',
        aggregateState: 'idle',
        avatar: '/api/botharness/avatar/tob',
      },
    ],
  }));
  const sources = createRemoteHosts({
    carrier: host.carrier,
    storage: {
      getItem: (key) =>
        key === REMOTE_HOSTS_STORAGE_KEY
          ? JSON.stringify([
              {
                hostId: host.hostId,
                hostName: 'Remote Studio',
                routes: ['http://127.0.0.1:47001'],
                deviceId: 'device-1',
                credential: host.credential,
              },
            ])
          : null,
      setItem: () => {},
      removeItem: () => {},
    },
    loadImage: async () => 'blob:remote-tob',
  });
  const release = sources.subscribe(() => {});
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  sources.select(host.hostId);
  await vi.waitFor(() => expect(sources.getSnapshot().avatars.size).toBe(1));
  const bot = {
    slug: 'tob',
    displayName: 'Local Tob',
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: '',
    tob: { defaultName: true, defaultAvatar: true },
  };
  store.setRoster([bot], []);
  const unbind = bindTobPresentation({
    bot: () => bot,
    icon: () => 'bot',
    subscribe: () => () => {},
  });
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  const call = vi.fn(async () => ({ ok: true as const, value: {} }));
  const registry = createDockPanelRegistry();
  const openPanel = vi.fn();
  const detach = registry.attach({ open: openPanel, close: () => {} });
  try {
    await act(async () =>
      root.render(
        createElement(ActivityCenterView, {
          sources,
          registry,
          t: zhTranslate,
          actions: createActions(
            async () => ({
              ok: true,
              value: { queryVersion: 1, items: [], unreadCount: 0, hasAction: false },
            }),
            store,
          ),
        }),
      ),
    );
    expect(element.textContent).toContain('Remote Studio');
    expect(element.querySelector('[data-activity-host]')?.textContent).toContain('Remote Studio');
    expect(element.textContent).toContain('Remote Tob');
    expect(element.textContent).not.toContain('Local Tob');
    expect(element.querySelector('img')?.getAttribute('src')).toBe('blob:remote-tob');
    await act(async () =>
      element.querySelector<HTMLButtonElement>('.bh-activity-list-source-link')!.click(),
    );
    expect(sources.getSnapshot().open).toEqual({
      hostId: host.hostId,
      channelId: 'dm-tob',
      title: 'Remote Tob',
    });
    expect(openPanel).toHaveBeenCalledExactlyOnceWith('bh:channel-body');
    expect(call).not.toHaveBeenCalled();
    expect(host.calls.filter(({ method }) => method === 'channelMarkRead')).toEqual([]);
    const activity = sources.activity(host.hostId)!;
    expect(activity.getSnapshot()).toMatchObject({ status: 'ready', unread: { 'dm-tob': 2 } });
    await act(async () => sources.markRead(sources.getSnapshot().open!, 'remote-last'));
    expect(host.calls.filter(({ method }) => method === 'channelMarkRead')).toEqual([
      { method: 'channelMarkRead', args: { channelId: 'dm-tob', messageId: 'remote-last' } },
    ]);
    const refreshed = activity.getSnapshot();
    expect(refreshed.status).toBe('ready');
    expect(refreshed.status === 'ready' ? refreshed.unread : undefined).toEqual({});
    expect(refreshed).toBe(sources.getSnapshot().hosts[0]?.inbox);
  } finally {
    await act(async () => root.unmount());
    detach();
    unbind();
    release();
  }
});

it.each([
  ...(['tool-approval', 'user-question'] as const).flatMap((kind) =>
    (['accepted', 'decided', 'expired', 'http', 'non-json', 'network'] as const).flatMap((result) =>
      (kind === 'tool-approval' && (result === 'decided' || result === 'expired')
        ? [false, true]
        : [false]
      ).map((batch) => ({
        kind,
        result,
        batch,
        precheck: false,
        recovery: false,
      })),
    ),
  ),
  ...(['http', 'non-json', 'network'] as const).flatMap((result) =>
    [false, true].map((recovery) => ({
      kind: 'tool-approval' as const,
      result,
      batch: false,
      precheck: true,
      recovery,
    })),
  ),
])('remote $kind $result batch=$batch pre=$precheck recover=$recovery', async (scenario) => {
  const { kind, result, batch, precheck, recovery } = scenario;
  const host = new FakeHost();
  const transportFailure = result === 'http' || result === 'non-json' || result === 'network';
  const submissions: typeof host.calls = [];
  let checking = false;
  let precheckFailures = 0;
  let pending = true;
  const item = { ...approval('tob'), kind };
  const message = {
    id: item.messageId!,
    at: item.createdAt,
    author: { kind: 'bot', slug: 'tob' },
    body: item.summary,
    ...(kind === 'tool-approval'
      ? {
          toolApprovalRequest: {
            sessionId: 'remote-session',
            callId: 'remote-call',
            toolName: 'bash',
            role: 'orchestrator',
            cwd: '/qa',
            input: '{"command":"echo QA"}',
            allowAlways: false,
          },
        }
      : {
          userQuestionRequest: {
            sessionId: 'remote-session',
            questions: [
              {
                id: 'q',
                question: 'Which marker?',
                options: [{ label: 'Blue' }, { label: 'Green' }],
              },
            ],
          },
        }),
  };
  host.methods.set('channelTimeline', () => ({
    revision: 1,
    page: {
      entries: [
        message,
        ...(!pending && result === 'decided'
          ? [
              {
                id: 'remote-decision',
                at: item.createdAt,
                author: { kind: 'human' },
                body: '',
                ...(kind === 'tool-approval'
                  ? {
                      toolApprovalDecision: {
                        requestMessageId: message.id,
                        outcome: 'rejected',
                      },
                    }
                  : {
                      userQuestionResolution: {
                        requestMessageId: message.id,
                        state: 'answered',
                        answers: [{ id: 'q', selected: ['Green'] }],
                      },
                    }),
              },
            ]
          : []),
      ],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    },
  }));
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items: (pending || result !== 'accepted') && args.category === 'action' ? [item] : [],
  }));
  host.methods.set('channelUnreadCounts', () => ({ channels: [] }));
  host.methods.set('toolApprovalStatus', () => ({ status: pending ? 'pending' : 'expired' }));
  host.methods.set('userQuestionStatus', () => ({
    status: pending ? 'pending' : result === 'expired' ? 'expired' : 'answered',
  }));
  const method = kind === 'tool-approval' ? 'toolApprovalDecide' : 'userQuestionAnswer';
  host.methods.set(method, () => {
    pending = false;
    if (result !== 'accepted') throw new Error('Request already settled');
    return { accepted: true };
  });
  const sources = createRemoteHosts({
    carrier: {
      ...host.carrier,
      async request(url, init) {
        if (
          checking &&
          url.endsWith('/toolApprovalStatus') &&
          (!recovery || precheckFailures === 0)
        ) {
          precheckFailures++;
          if (result === 'network') throw new TypeError('Network request failed');
          return {
            status: result === 'http' ? 502 : 200,
            text: async () => '<html>Bad gateway</html>',
          };
        }
        if (url.endsWith('/' + method)) {
          submissions.push({ method, args: JSON.parse(String(init.body)).payload.args });
          if (result === 'network') throw new TypeError('Network request failed');
          if (transportFailure)
            return {
              status: result === 'http' ? 502 : 200,
              text: async () => '<html>Bad gateway</html>',
            };
        }
        return host.carrier.request(url, init);
      },
    },
    storage: {
      getItem: (key) =>
        key === REMOTE_HOSTS_STORAGE_KEY
          ? JSON.stringify([
              {
                hostId: host.hostId,
                hostName: 'Remote QA',
                routes: ['http://127.0.0.1:47001'],
                deviceId: 'device-1',
                credential: host.credential,
              },
            ])
          : null,
      setItem: () => {},
      removeItem: () => {},
    },
  });
  const release = sources.subscribe(() => {});
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  sources.select(host.hostId);
  const localSelection = store.getSnapshot().selection;
  store.select({ kind: 'bot', slug: 'unrelated-local-bot' });
  const element = document.createElement('div');
  document.body.append(element);
  const root = createRoot(element);
  try {
    await act(async () =>
      root.render(
        createElement(ActivityCenterView, {
          sources,
          t: zhTranslate,
          actions: createActions(
            async () => ({
              ok: true,
              value: { queryVersion: 1, items: [], unreadCount: 0, hasAction: false },
            }),
            store,
          ),
        }),
      ),
    );
    if (batch) {
      await act(async () => {
        [...element.querySelectorAll('button')]
          .find((button) => button.textContent === zhTranslate('activityInbox.select'))!
          .click();
      });
      await act(async () =>
        element.querySelector<HTMLInputElement>('.bh-activity-list-batch input')!.click(),
      );
    } else {
      await act(async () =>
        element.querySelector<HTMLButtonElement>('.bh-activity-list-row-open')!.click(),
      );
    }
    const label = batch
      ? zhTranslate('activityList.batch.allow', { count: '1' })
      : kind === 'tool-approval'
        ? zhTranslate('approval.allowOnce')
        : 'Blue';
    const button = () =>
      [...element.querySelectorAll('button')].find(
        (button) => button.textContent?.trim() === label,
      );
    await act(async () => {
      await vi.waitFor(() => expect(button()?.disabled).toBe(false));
    });
    checking = precheck;
    await act(async () => button()!.click());
    expect(submissions).toEqual(
      precheck
        ? []
        : [
            {
              method,
              args:
                kind === 'tool-approval'
                  ? { channelId: 'dm-tob', messageId: item.messageId, outcome: 'allowed-once' }
                  : {
                      channelId: 'dm-tob',
                      messageId: item.messageId,
                      answer: { answers: [{ id: 'q', selected: ['Blue'] }] },
                    },
            },
          ],
    );
    expect(store.getSnapshot().selection).toEqual({ kind: 'bot', slug: 'unrelated-local-bot' });
    if (transportFailure) {
      await act(async () => {
        await vi.waitFor(() =>
          expect(element.querySelector('[role="alert"]')?.textContent).toBe(
            zhTranslate('activityList.failed'),
          ),
        );
      });
      if (!precheck || recovery) expect(button()?.disabled).toBe(false);
      if (precheck) expect(precheckFailures).toBeGreaterThan(0);
      expect(element.querySelector('.bh-request-done')).toBeNull();
      expect(element.textContent).not.toMatch(/502|JSON|gateway|Network request failed/);
    } else if (result !== 'accepted') {
      await act(async () => {
        await vi.waitFor(() => expect(button()?.disabled ?? true).toBe(true));
      });
      expect(element.textContent).not.toContain('Request already settled');
      if (batch)
        expect(element.querySelector('[role="alert"]')?.textContent).toContain(
          zhTranslate('activityList.batch.failed', { count: '1' }),
        );
      else if (kind === 'tool-approval')
        expect(element.querySelector('.bh-request-done')?.getAttribute('data-state')).toBe(
          'expired',
        );
      else {
        expect(element.querySelector('.bh-request-done')?.getAttribute('data-state')).toBe(
          result === 'decided' ? 'answered' : 'expired',
        );
        expect(element.querySelector('[role="alert"]')?.textContent).toContain(
          zhTranslate('activityList.failed'),
        );
      }
      expect(host.calls.filter((call) => call.method === 'humanAttention').length).toBeGreaterThan(
        3,
      );
    }
  } finally {
    await act(async () => root.unmount());
    element.remove();
    release();
    store.select(localSelection);
  }
});

it('merges equal local and remote attention identities into one category with independent selection and writes', async () => {
  const host = new FakeHost();
  const remoteItem: HumanAttentionItem = {
    ...approval('tob'),
    id: 'same-id',
    kind: 'channel-unread',
    category: 'unread',
    unreadCount: 1,
  };
  host.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items: args.category === 'unread' ? [remoteItem] : [],
  }));
  host.methods.set('channelMarkRead', () => ({}));
  const fixture = await remoteFixture(host);
  fixture.sources.select('all');
  const localItem = { ...remoteItem, summary: 'Local message' };
  const localRead = vi.fn();
  const actions = createActions(async (endpoint, payload) => {
    if (endpoint === 'channelMarkRead') {
      localRead(payload);
      return { ok: true, value: {} };
    }
    return {
      ok: true,
      value: {
        queryVersion: 1,
        items: endpoint === 'humanAttention' && payload.category === 'unread' ? [localItem] : [],
        unreadCount: 1,
        hasAction: false,
      },
    };
  }, store);
  try {
    await fixture.render(actions);
    expect(fixture.element.querySelectorAll('.bh-activity-section-toggle')).toHaveLength(3);
    expect(fixture.element.querySelectorAll('[data-attention-id="same-id"]')).toHaveLength(2);
    expect(fixture.element.querySelectorAll('[data-activity-host="host-1"]')).toHaveLength(1);
    expect(fixture.element.querySelectorAll('[data-activity-host="local"]')).toHaveLength(1);
    expect(fixture.element.querySelector('.bh-activity-sections select')).toBeNull();
    const unread = [
      ...fixture.element.querySelectorAll<HTMLElement>('.bh-activity-sections > .bh-activity-list'),
    ].find((section) => section.textContent?.includes('Local message'))!;
    const button = (label: string) =>
      [...unread.querySelectorAll('button')].find((button) => button.textContent === label)!;
    await act(async () => button(zhTranslate('activityInbox.select')).click());
    const checks = unread.querySelectorAll<HTMLInputElement>('.bh-activity-list-row-check');
    await act(async () => checks[1]!.click());
    await act(async () => checks[2]!.click());
    expect(unread.querySelector('[role="toolbar"]')?.textContent).toContain('已选 2 项');
    await act(async () => button(zhTranslate('activityList.batch.handle')).click());
    expect(localRead).toHaveBeenCalledExactlyOnceWith({
      channelId: remoteItem.channelId,
      messageId: remoteItem.messageId,
    });
    expect(host.calls.filter((call) => call.method === 'channelMarkRead')).toEqual([
      {
        method: 'channelMarkRead',
        args: { channelId: remoteItem.channelId, messageId: remoteItem.messageId },
      },
    ]);
    await act(async () => fixture.sources.select(host.hostId));
    expect(fixture.element.querySelectorAll('.bh-activity-section-toggle')).toHaveLength(3);
    expect(fixture.element.querySelectorAll('[data-attention-id="same-id"]')).toHaveLength(1);
    expect(fixture.element.querySelector('[data-activity-host="host-1"]')).not.toBeNull();
    expect(fixture.element.textContent).not.toContain('Local message');
  } finally {
    await fixture.close();
  }
});
