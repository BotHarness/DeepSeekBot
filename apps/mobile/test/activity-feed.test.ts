// @vitest-environment jsdom
import { act, createElement, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-router', () => ({
  useRouter: () => ({ push: () => undefined }),
  useIsFocused: () => true,
  useFocusEffect: (work: () => void) => useLayoutEffect(work, [work]),
  Stack: { Screen: () => null },
}));
vi.mock('react-native-worklets', () => ({ scheduleOnRN: (callback: () => void) => callback() }));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import { createHostClient, type HostClient } from '../src/host/client';
import { observeInbox, type InboxSnapshot } from '../src/host/inbox';
import type { HumanAttentionItem } from '../src/host/wire';
import { ActivityFeed, feedRows } from '../src/ui/shell/activity-feed';
import { t } from '../src/ui/strings';
import { FakeHost } from './fake-host';
import inboxWire from './fixtures/inbox-wire.json';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

type Recorded = keyof typeof inboxWire.rpc;
const recorded = (name: Recorded): unknown => structuredClone(inboxWire.rpc[name].result);
const items = (name: Recorded): HumanAttentionItem[] =>
  (inboxWire.rpc[name].result as { value: { items: HumanAttentionItem[] } }).value.items;

const approval = items('humanAttention.action')[0]!;
const question = items('humanAttention.actionQuestion')[0]!;
const privateInput: HumanAttentionItem = { ...question, id: 'private-1', kind: 'private-input' };
const reply: HumanAttentionItem = {
  ...question,
  id: 'reply-1',
  kind: 'reply',
  category: 'replies',
};

const ready = (action: HumanAttentionItem[]): InboxSnapshot => ({
  status: 'ready',
  sections: { action, replies: [reply], unread: [], handled: [] },
});

let client: HostClient | undefined;
let root: Root | undefined;
let container: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = undefined;
  client?.stop();
});

function host(): FakeHost {
  const fake = new FakeHost();
  fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.pending'));
  fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.accepted'));
  fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionPending'));
  return fake;
}

async function settle(): Promise<void> {
  for (let tries = 0; tries < 20; tries += 1)
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
}

async function feed(
  fake: FakeHost,
  snapshot: InboxSnapshot,
  hostId = 'host-one',
  timeoutMs = 200,
  onOpen: (item: HumanAttentionItem) => void = () => undefined,
): Promise<HTMLElement> {
  act(() => root?.unmount());
  container?.remove();
  client?.stop();
  const answer = fake.answers.get('humanAttention');
  fake.answers.set('humanAttention', (args) => {
    const result = answer
      ? answer(args)
      : {
          ok: true,
          value: {
            items:
              snapshot.status === 'ready'
                ? snapshot.sections[args.category as keyof typeof snapshot.sections]
                : [],
          },
        };
    const value = result as { ok: boolean; value?: object };
    return value.ok ? { ...value, value: { ...value.value, queryVersion: 1 } } : value;
  });
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs,
  });
  client.start();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(ActivityFeed, {
        hostId,
        client,
        inbox: undefined,
        snapshot,
        botSlugs: [question.botSlug, 'other-bot'],
        channels: [{ id: 'other-channel', name: 'Other Channel' }],
        bot: () => undefined,
        onOpen,
      }),
    ),
  );
  await settle();
  return container;
}

async function clearSearch(view: HTMLElement): Promise<void> {
  expect(view.querySelector(`button[aria-label="${t.activityClearSearch}"]`)).toBeNull();
  const field = view.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${t.activitySearch}"]`,
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, '');
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = view.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (found === null) throw new Error(`no button ${label}`);
  return found;
}

async function press(target: HTMLElement): Promise<void> {
  await act(async () => target.click());
  await settle();
}

const post = (view: HTMLElement, item: HumanAttentionItem) =>
  [...view.querySelectorAll(`[data-testid="inbox-post-${item.id}"]`)].find(
    (node) => node.closest('[hidden]') === null,
  ) ?? null;

describe('Activity feed rows', () => {
  it('defaults to pending work and keeps questions and private inputs beside tool approvals', () => {
    expect(
      feedRows(ready([question, approval, privateInput]), new Set(), []).map((row) => row.key),
    ).toEqual([question.id, approval.id, privateInput.id]);
  });
  it('keeps settlement, Bot filtering and handled state in the flat feed', () => {
    expect(
      feedRows(ready([question]), new Set([question.id]), []).some(
        (row) => row.key === question.id,
      ),
    ).toBe(false);
    expect(feedRows(ready([]), new Set(), [approval]).map((row) => row.key)).toContain(approval.id);
    const other = { ...approval, id: 'other-1', botSlug: 'other-bot' };
    expect(
      feedRows(ready([question, other]), new Set(), [], { section: 'all', bot: 'other-bot' }).map(
        (row) => row.key,
      ),
    ).toEqual(['other-1']);
    const done = { ...question, id: 'done-1', category: 'handled' as const };
    const snapshot: InboxSnapshot = {
      status: 'ready',
      sections: { action: [], replies: [], unread: [], handled: [done] },
    };
    expect(
      feedRows(snapshot, new Set([done.id]), [], { section: 'handled', bot: undefined }),
    ).toEqual([expect.objectContaining({ kind: 'row', item: done, settled: true })]);
    expect(
      feedRows(snapshot, new Set(), [], { section: 'all', bot: undefined }).some(
        (row) => row.key === done.id,
      ),
    ).toBe(false);
  });
  it('uses one empty state and keeps pagination reachable without section headers', () => {
    const snapshot: InboxSnapshot = {
      status: 'ready',
      sections: { action: [], replies: [reply], unread: [], handled: [] },
      cursors: { unread: 'next-unread' },
    };
    expect(
      feedRows(snapshot, new Set(), [], { section: 'all', bot: undefined }, 'budget').map(
        (row) => row.key,
      ),
    ).toEqual(['reply-1', 'more-unread']);
    expect(feedRows(ready([]), new Set(), []).map((row) => row.key)).toEqual(['empty-action']);
    expect(
      feedRows(
        {
          ...snapshot,
          sections: { action: [], replies: [], unread: [], handled: [] },
          cursors: {},
        },
        new Set(),
        [],
        undefined,
        'no-match',
      ),
    ).toEqual([]);
  });
});

describe('Activity feed', () => {
  it('retries through the current Inbox while a cached return is still refreshing', async () => {
    const fake = host();
    const view = await feed(fake, ready([]), 'cached-host', 5000);
    const observed = observeInbox(client!, { activity: true, section: 'action' });
    fake.answers.set('humanAttention', () => ({
      ok: false,
      error: { code: 'unavailable', message: 'temporary failure', details: {} },
    }));
    await act(async () => observed.getInbox()!.refresh());
    expect(view.textContent).toContain('temporary failure');
    act(() => root!.unmount());

    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reads = 0;
    const request = fake.carrier.request;
    fake.carrier.request = async (url, init) => {
      if (url.includes('humanAttention')) {
        reads++;
        await pending;
      }
      return request(url, init);
    };
    fake.answers.set('humanAttention', () => ({ ok: true, value: { items: [], queryVersion: 1 } }));
    root = createRoot(view);
    try {
      await act(async () =>
        root!.render(
          createElement(ActivityFeed, {
            hostId: 'cached-host',
            client,
            inbox: undefined,
            snapshot: ready([]),
            botSlugs: [],
            bot: () => undefined,
            onOpen: () => undefined,
          }),
        ),
      );
      await settle();
      expect(reads).toBe(1);
      await press(button(view, t.tryAgain));
      await act(async () => release());
      await settle();
      expect(reads).toBe(2);
      expect(view.textContent).not.toContain('temporary failure');
    } finally {
      release();
    }
  });

  it('shows navigable tabs and a skeleton while the initial Host read remains pending', async () => {
    const fake = host();
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const request = fake.carrier.request;
    fake.carrier.request = async (url, init) => {
      if (url.includes('humanAttention')) await pending;
      return request(url, init);
    };
    const view = await feed(fake, ready([]), 'slow-host', 5000);
    expect(view.querySelector('[data-testid="list-skeleton"]')).not.toBeNull();
    expect(button(view, t.inboxSections.action).getAttribute('aria-selected')).toBe('true');
    await press(button(view, t.inboxSections.unread));
    expect(button(view, t.inboxSections.unread).getAttribute('aria-selected')).toBe('true');
    expect(view.textContent).not.toContain(t.inboxEmpty);
    await act(async () => release());
    await settle();
    expect(
      [...view.querySelectorAll('[data-testid="list-skeleton"]')].filter(
        (node) => !node.closest('[hidden]'),
      ),
    ).toHaveLength(0);
  });
  it('bounds the native unread preview while opening the original full item', async () => {
    const unread: HumanAttentionItem = {
      ...reply,
      id: 'long-unread',
      category: 'unread',
      kind: 'channel-unread',
      summary: `${'正文'.repeat(10000)}FULL_END`,
    };
    const open = vi.fn();
    const view = await feed(
      host(),
      { status: 'ready', sections: { action: [], replies: [], unread: [unread], handled: [] } },
      'host-one',
      200,
      open,
    );
    await press(button(view, t.inboxSections.unread));
    const row = view.querySelector<HTMLElement>('[data-testid="inbox-row-long-unread"]')!;
    expect(row.textContent).not.toContain('FULL_END');
    expect(row.textContent!.length).toBeLessThan(700);
    expect(row.getAttribute('aria-label')!.length).toBeLessThan(700);
    await press(row);
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ id: unread.id, summary: unread.summary }),
    );
  });
  it('names a tool approval by its tool, not the Host’s stored Chinese line', async () => {
    const approval: HumanAttentionItem = {
      ...question,
      id: 'approval:e7',
      kind: 'tool-approval',
      summary: '请求批准执行 secret_cli',
    };
    const handled: HumanAttentionItem = { ...approval, id: 'handled:e7', category: 'handled' };
    const view = await feed(host(), {
      status: 'ready',
      sections: { action: [approval], replies: [], unread: [], handled: [handled] },
    });
    expect(post(view, approval)!.textContent).not.toContain('请求批准执行');
    expect(
      post(view, approval)!.querySelector('[role=button]')!.getAttribute('aria-label'),
    ).toContain('secret_cli');
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.handled));
    await press(button(view, t.cancel));
    const row = view.querySelector<HTMLElement>('[data-testid="inbox-row-handled:e7"]')!;
    expect(row.textContent).toContain('secret_cli');
    expect(row.textContent).not.toContain('请求批准执行');
    expect(row.textContent).toContain(' · secret_cli');
    expect(row.textContent).not.toContain(t.runTool('secret_cli'));
    expect(row.getAttribute('aria-label')).toContain('secret_cli');
  });
  it('preserves the search when editing ends and options reset', async () => {
    const fake = host();
    const queries: Record<string, unknown>[] = [];
    fake.answers.set('humanAttention', (args) => {
      queries.push(args);
      return { ok: true, value: { items: args.category === 'replies' ? [reply] : [] } };
    });
    const view = await feed(fake, ready([]));
    await press(button(view, t.activityOptions));
    await press(button(view, t.activitySortOldest));
    await press(button(view, t.cancel));
    expect(queries.at(-1)?.sort).toBe('oldest');
    await press(button(view, t.activitySearch));
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.activitySearch}"]`,
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        'budget',
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(queries.at(-1)?.search).toBe('budget');
    expect(view.querySelectorAll('[role=tab]')).toHaveLength(3);
    expect(queries.at(-1)?.category).toBe('action');
    expect(view.querySelector(`button[aria-label="${t.close}"]`)).toBeNull();
    await act(async () => field.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    expect(queries.at(-1)?.search).toBe('budget');
    await press(button(view, t.activityOptions));
    await press(button(view, t.activityReset));
    expect(queries.findLast((query) => query.category === 'action')?.sort).toBeUndefined();
    expect(queries.at(-1)?.search).toBe('budget');
    await press(button(view, t.cancel));
    await press(button(view, t.activitySearch));
    expect(view.querySelector('textarea')?.value).toBe('budget');
    await clearSearch(view);
    expect(view.querySelector('textarea')?.value).toBe('');
    expect(queries.at(-1)?.search).toBeUndefined();
    expect(view.textContent).toContain(t.inboxSections.action);
    expect(view.textContent).toContain(t.inboxSections.unread);
  });

  it('shows one no-results message instead of empty sections for an unmatched search', async () => {
    const fake = host();
    fake.answers.set('humanAttention', () => ({ ok: true, value: { items: [] } }));
    const view = await feed(fake, ready([]));
    await press(button(view, t.activitySearch));
    const field = view.querySelector<HTMLTextAreaElement>(
      `textarea[aria-label="${t.activitySearch}"]`,
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
        field,
        'no-match',
      );
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await settle();
    expect(view.textContent).toContain(t.activityNoResults);
    expect(view.querySelectorAll('[role=tab]')).toHaveLength(3);
    await clearSearch(view);
    expect(view.textContent).not.toContain(t.activityNoResults);
    expect(view.textContent).toContain(t.inboxSections.action);
  });

  it('applies options immediately, keeps them on dismissal and resets without confirmation', async () => {
    const fake = host();
    const queries: Record<string, unknown>[] = [];
    fake.answers.set('humanAttention', (args) => {
      queries.push(args);
      return { ok: true, value: { items: [] } };
    });
    const view = await feed(fake, ready([]));
    await press(button(view, t.activityOptions));
    expect(view.querySelector(`button[aria-label="${t.done}"]`)).toBeNull();
    await press(button(view, t.activitySortNewest));
    expect(queries.at(-1)?.sort).toBe('newest');
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();
    await press(button(view, t.inboxSections.replies));
    expect(queries.at(-1)?.category).toBe('replies');
    expect(queries.at(-1)?.sort).toBe('newest');
    await press(button(view, t.cancel));
    expect(queries.at(-1)?.sort).toBe('newest');
    await press(button(view, t.activityOptions));
    expect(button(view, t.activitySortNewest).getAttribute('aria-checked')).toBe('true');
    await press(button(view, t.activityReset));
    expect(queries.findLast((query) => query.category === 'action')?.sort).toBeUndefined();
    expect(view.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it('keeps filters behind the floating header entry instead of permanent chips', async () => {
    const view = await feed(host(), ready([question]));
    expect(view.querySelector(`button[aria-label="${t.filterChip(t.filterAll, 2)}"]`)).toBeNull();
    await press(button(view, t.activityOptions));
    expect(button(view, t.inboxSections.handled)).not.toBeNull();
  });
  it('uses the Host scoped unread summary instead of filtering its last author', async () => {
    const fake = host();
    const unread: HumanAttentionItem = {
      ...reply,
      id: 'unread:team',
      category: 'unread',
      kind: 'channel-unread',
      botSlug: 'other-bot',
      channelName: 'Team',
      summary: 'Team update',
      unreadCount: 10,
    };
    fake.answers.set('humanAttention', (args) => ({
      ok: true,
      value: {
        items:
          args.category === 'unread'
            ? [{ ...unread, unreadCount: args.botSlug === question.botSlug ? 2 : 10 }]
            : [],
      },
    }));
    fake.answers.set('channelUnreadCounts', () => ({ ok: true, value: { channels: [] } }));
    const view = await feed(fake, {
      status: 'ready',
      sections: { action: [], replies: [], unread: [unread], handled: [] },
    });
    await press(button(view, t.activityOptions));
    await press(button(view, question.botSlug));
    await press(button(view, t.cancel));
    await press(button(view, t.inboxSections.unread));
    expect(view.textContent).toContain('2');
    expect(view.querySelector('[data-testid="inbox-row-unread:team"]')).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.filterAllBots));
    await press(button(view, t.cancel));
    expect(view.textContent).toContain('10');
  });

  it('switches three tabs immediately and keeps All and handled history in filters', async () => {
    const unread: HumanAttentionItem = {
      ...reply,
      id: 'unread:team',
      category: 'unread',
      kind: 'channel-unread',
      channelName: 'Team',
      summary: 'A new conversation',
      unreadCount: 10,
    };
    const done: HumanAttentionItem = { ...question, id: 'done-1', category: 'handled' };
    const view = await feed(host(), {
      status: 'ready',
      sections: { action: [question], replies: [reply], unread: [unread], handled: [done] },
    });
    expect(view.querySelector('[data-testid="inbox-row-done-1"]')).toBeNull();
    expect(view.querySelectorAll('[role=tab]')).toHaveLength(3);
    expect(button(view, t.inboxSections.action).getAttribute('aria-selected')).toBe('true');
    expect(post(view, question)).not.toBeNull();
    expect(view.querySelector('[data-testid="inbox-row-reply-1"]')).toBeNull();
    await press(button(view, t.inboxSections.replies));
    expect(post(view, question)).toBeNull();
    expect(button(view, t.inboxSections.replies).getAttribute('aria-selected')).toBe('true');
    expect(view.querySelector('[data-testid="inbox-row-reply-1"]')).not.toBeNull();
    await press(button(view, t.inboxSections.unread));
    expect(view.querySelector('[data-testid="inbox-row-unread:team"]')).not.toBeNull();
    await press(button(view, t.inboxSections.action));
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.handled));
    await press(button(view, t.cancel));
    expect(view.querySelector('[data-testid="inbox-row-done-1"]')).not.toBeNull();
    expect(post(view, question)).toBeNull();
  });

  it('answers a question in place and the post leaves the feed', async () => {
    const fake = host();
    const sent: Array<Record<string, unknown>> = [];
    fake.answers.set('userQuestionAnswer', (args) => {
      sent.push(args);
      return recorded('userQuestionAnswer.accepted');
    });
    const view = await feed(fake, ready([question]));
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.option('A', 'Teal')));
    await press(button(view, t.option('B', 'Biscuits')));
    await press(button(view, t.submitChoice));
    expect(sent).toHaveLength(1);
    expect(post(view, question)).toBeNull();
    expect(view.textContent).toContain(t.inboxEmpty);
  });

  it('keeps the loaded question and its draft mounted when paging away and back', async () => {
    const fake = host();
    const view = await feed(fake, ready([question]));
    const initial = post(view, question);
    await press(button(view, t.option('A', 'Teal')));
    const loads = () => fake.calls.filter((call) => call.method === 'userQuestionStatus').length;
    const loaded = loads();
    await press(view.querySelector<HTMLElement>('[data-testid="pager-next"]')!);
    expect(post(view, question)).toBeNull();
    await press(view.querySelector<HTMLElement>('[data-testid="pager-previous"]')!);
    expect(post(view, question)).toBe(initial);
    expect(loads()).toBe(loaded);
    expect(button(view, t.option('A', 'Teal')).getAttribute('aria-checked')).toBe('true');
  });

  it('filters the feed through its header panel', async () => {
    const view = await feed(host(), ready([question]));
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.replies));
    await press(button(view, t.cancel));
    expect(post(view, question)).toBeNull();
    expect(button(view, t.inboxSections.replies).getAttribute('aria-selected')).toBe('true');
    await press(button(view, t.activityOptions));
    await press(button(view, t.filterAll));
    await press(button(view, t.cancel));
    expect(post(view, question)).not.toBeNull();
  });

  it('shows personal messages in For you and handled history only through filters', async () => {
    const done: HumanAttentionItem = { ...question, id: 'done-1', category: 'handled' };
    const view = await feed(host(), {
      status: 'ready',
      sections: { action: [], replies: [reply], unread: [], handled: [done] },
    });
    await press(button(view, t.inboxSections.replies));
    const replied = view.querySelector('[data-testid="inbox-row-reply-1"]')!;
    expect(replied.textContent).toContain(`${t.kind.reply ?? t.otherKind} · ${reply.botSlug}`);
    expect(replied.textContent?.split(reply.summary).length).toBe(2);
    await press(button(view, t.activityOptions));
    await press(button(view, t.inboxSections.handled));
    await press(button(view, t.cancel));
    const handled = view.querySelector('[data-testid="inbox-row-done-1"]')!;
    expect(handled.textContent).toContain(
      `${t.kind['user-question']} · ${done.botSlug} · ${done.summary}`,
    );
  });

  it.each(['search', 'channel', 'tab', 'swipe'] as const)(
    'does not restore a late refused question after the %s changes',
    async (change) => {
      const fake = host();
      fake.answers.set('humanAttention', (args) => ({
        ok: true,
        value: {
          items: args.category === 'action' && !args.search && !args.channelId ? [question] : [],
        },
      }));
      let release: () => void = () => undefined;
      const response = new Promise<void>((resolve) => {
        release = resolve;
      });
      fake.answers.delete('userQuestionAnswer');
      fake.methods.set('userQuestionAnswer', async () => {
        await response;
        throw new Error('Already answered elsewhere');
      });
      const view = await feed(fake, ready([question]), 'host-one', 5000);
      await press(button(view, t.option('A', 'Teal')));
      await press(button(view, t.option('B', 'Biscuits')));
      await press(button(view, t.submitChoice));
      expect(fake.calls.some((call) => call.method === 'userQuestionAnswer')).toBe(true);
      if (change === 'search') {
        await press(button(view, t.activitySearch));
        const field = view.querySelector<HTMLTextAreaElement>(
          `textarea[aria-label="${t.activitySearch}"]`,
        )!;
        await act(async () => {
          Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(
            field,
            'unrelated',
          );
          field.dispatchEvent(new Event('input', { bubbles: true }));
        });
      } else if (change === 'tab') {
        await press(button(view, t.inboxSections.replies));
      } else if (change === 'swipe') {
        await press(view.querySelector<HTMLElement>('[data-testid="pager-next"]')!);
      } else {
        await press(button(view, t.activityOptions));
        await press(button(view, 'Other Channel'));
        await press(button(view, t.cancel));
      }
      await settle();
      expect(post(view, question)).toBeNull();
      fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.answered'));
      fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionAnswered'));
      await act(async () => release());
      await settle();
      expect(post(view, question)).toBeNull();
      if (change === 'search') expect(view.textContent).toContain(t.activityNoResults);
    },
  );

  it('applies a pager selection to the Host query while retaining other filters in both directions', async () => {
    const fake = host();
    const queries: Record<string, unknown>[] = [];
    fake.answers.set('humanAttention', (args) => {
      queries.push(args);
      return { ok: true, value: { items: [] } };
    });
    const view = await feed(fake, ready([]));
    await press(button(view, t.activityOptions));
    await press(button(view, t.activitySortOldest));
    await press(button(view, 'Other Channel'));
    await press(button(view, t.cancel));
    await press(view.querySelector<HTMLElement>('[data-testid="pager-next"]')!);
    expect(queries.at(-1)).toMatchObject({
      category: 'replies',
      sort: 'oldest',
      channelId: 'other-channel',
    });
    await press(view.querySelector<HTMLElement>('[data-testid="pager-next"]')!);
    expect(queries.at(-1)).toMatchObject({
      category: 'unread',
      sort: 'oldest',
      channelId: 'other-channel',
    });
    const fetched = queries.length;
    await press(view.querySelector<HTMLElement>('[data-testid="pager-previous"]')!);
    expect(queries.length).toBe(fetched + 1);
    expect(queries.findLast((query) => query.category === 'replies')).toMatchObject({
      category: 'replies',
      sort: 'oldest',
      channelId: 'other-channel',
    });
    expect(button(view, t.inboxSections.replies).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps a post that lost to another device and says so', async () => {
    const fake = host();
    const view = await feed(fake, ready([question]));
    fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.refused'));
    fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.answered'));
    fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionAnswered'));
    await press(button(view, t.option('A', 'Teal')));
    await press(button(view, t.option('B', 'Biscuits')));
    await press(button(view, t.submitChoice));
    expect(post(view, question)).not.toBeNull();
    expect(view.querySelector('[data-testid="card-line"]')?.getAttribute('aria-label')).toContain(
      t.elsewhere(t.cardAnswered),
    );
  });
  it('keeps category paging but exposes no Computer items or actions in unavailable scope', async () => {
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
    await act(async () =>
      root!.render(
        createElement(ActivityFeed, {
          hostId: '',
          client: undefined,
          inbox: undefined,
          snapshot: ready([question]),
          botSlugs: [],
          bot: () => undefined,
          onOpen: vi.fn(),
          unavailable: t.activitySourceUnavailable,
        }),
      ),
    );
    await settle();
    expect(container.textContent).toContain(t.activitySourceUnavailable);
    expect(post(container, question)).toBeNull();
    expect(container.querySelector(`button[aria-label="${t.activityOptions}"]`)).toBeNull();
    await press(container.querySelector<HTMLElement>('[data-testid="pager-next"]')!);
    expect(button(container, t.inboxSections.replies).getAttribute('aria-selected')).toBe('true');
    expect(post(container, question)).toBeNull();
  });
});
