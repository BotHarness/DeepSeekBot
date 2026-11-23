// @vitest-environment jsdom
import { type HumanAttentionItem } from '../src/client/store.js';
import { type InboxSnapshot } from '@botharness/host-client/inbox';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { store } from '../src/client/store.js';
import { remoteActivityPage } from '../src/client/remote-activity.js';
import { createRemoteHosts, REMOTE_HOSTS_STORAGE_KEY } from '../src/client/remote-hosts.js';
import { ActivityCenterView } from '../src/client/activity-center-view.js';
import { FakeHost } from '../../host-client/test/fake-host.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { en, zhTranslate } from '../src/client/locale.js';
import { bindTobPresentation } from '../src/client/tob-presentation.js';
import { approval } from './support/activity-list-keyboard-batch.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/activity-list-keyboard-batch.js')).mockActivityPrimitives(),
);

vi.mock('../src/client/bot-sidebar.js', async () =>
  (await import('./support/activity-list-keyboard-batch.js')).mockActivitySidebar(),
);

const previous = store.getSnapshot();

afterEach(() => {
  store.setRoster(previous.bots, previous.channels);
  store.select(previous.selection);
  store.setActivityList(previous.activityList);
  document.body.innerHTML = '';
});

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

it('retains a verified Inbox page after malformed Host data and retries the same section', async () => {
  const host = new FakeHost();
  const valid = approval('tob');
  let invalid = false;
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
    await fixture.render();
    invalid = true;
    await act(async () => {
      await fixture.sources.activity(host.hostId)!.getInbox()!.refresh();
    });
    expect(fixture.sources.getSnapshot().hosts[0]?.inbox).toMatchObject({
      status: 'ready',
      sections: { action: [valid] },
    });
    expect(fixture.element.querySelectorAll('.bh-activity-list-row')).toHaveLength(1);
    expect(
      [...fixture.element.querySelectorAll('[role="alert"]')].some((alert) =>
        alert.textContent?.includes(zhTranslate('activityList.failed')),
      ),
    ).toBe(true);
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
