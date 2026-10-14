// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));
vi.mock('react-native-reanimated', () => import('./reanimated-shim'));
vi.mock('expo-haptics', () => import('./expo-haptics-shim'));
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => undefined }) }));
vi.mock('../src/ui/bot-avatar', () => ({
  BotAvatar: ({ bot }: { bot: { slug: string } }) =>
    createElement('span', { 'data-testid': `avatar-${bot.slug}` }),
}));

import { createHostClient, type HostClient } from '../src/host/client';
import type { InboxSnapshot } from '../src/host/inbox';
import type { HumanAttentionItem } from '../src/host/wire';
import {
  ActivityFeed,
  activityBots,
  activityCounts,
  feedRows,
} from '../src/ui/shell/activity-feed';
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
  sections: { action, replies: [reply], handled: [] },
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

async function feed(fake: FakeHost, snapshot: InboxSnapshot): Promise<HTMLElement> {
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      createElement(ActivityFeed, {
        client,
        inbox: undefined,
        snapshot,
        bot: () => undefined,
        onOpen: () => undefined,
      }),
    ),
  );
  await settle();
  return container;
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
  view.querySelector(`[data-testid="inbox-post-${item.id}"]`);

describe('Activity feed rows', () => {
  it('turns decidable actions into posts and keeps other items as rows', () => {
    const rows = feedRows(ready([question, approval, privateInput]), new Set(), []);
    expect(rows.map((row) => `${row.kind}:${row.key}`)).toEqual([
      'header:header-action',
      `post:${question.id}`,
      `post:${approval.id}`,
      'row:private-1',
      'header:header-replies',
      'row:reply-1',
    ]);
  });

  it('drops an answered post at once and keeps a refused one after the Host drops it', () => {
    const answered = feedRows(ready([question, approval]), new Set([question.id]), []);
    expect(answered.some((row) => row.key === question.id)).toBe(false);
    const kept = feedRows(ready([]), new Set(), [approval]);
    expect(kept.map((row) => row.key)).toContain(approval.id);
    expect(kept.some((row) => row.kind === 'empty')).toBe(false);
  });

  it('filters to one section and keeps its header when it is empty', () => {
    const snapshot = ready([question, approval]);
    expect(
      feedRows(snapshot, new Set(), [], { section: 'replies', bot: undefined }).map(
        (row) => row.key,
      ),
    ).toEqual(['header-replies', 'reply-1']);
    expect(
      feedRows(snapshot, new Set(), [], { section: 'handled', bot: undefined }).map(
        (row) => row.key,
      ),
    ).toEqual(['header-handled', 'empty-handled']);
  });

  it('filters by Bot and counts what each section would show', () => {
    const other: HumanAttentionItem = { ...approval, id: 'other-1', botSlug: 'other-bot' };
    const snapshot = ready([question, other]);
    expect(activityBots(snapshot)).toEqual([
      ...new Set([question.botSlug, 'other-bot', reply.botSlug]),
    ]);
    const rows = feedRows(snapshot, new Set(), [], { section: 'all', bot: 'other-bot' });
    expect(rows.map((row) => row.key)).toEqual(['header-action', 'other-1']);
    expect(activityCounts(snapshot, new Set([question.id]), [], undefined)).toEqual({
      all: 2,
      action: 1,
      replies: 1,
      handled: 0,
    });
  });

  it('says nothing needs you when the action section is empty', () => {
    expect(feedRows(ready([]), new Set(), []).map((row) => row.kind)).toContain('empty');
  });
});

describe('Activity feed', () => {
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

  it('filters the feed from the chips above it', async () => {
    const view = await feed(host(), ready([question]));
    expect(post(view, question)).not.toBeNull();
    await press(button(view, t.filterChip(t.inboxSections.replies, 1)));
    expect(post(view, question)).toBeNull();
    expect(view.textContent).toContain(t.sectionCount(t.inboxSections.replies, 1));
    await press(button(view, t.filterChip(t.filterAll, 2)));
    expect(post(view, question)).not.toBeNull();
  });

  it('collapses a handled item to one line and keeps a reply to two', async () => {
    const done: HumanAttentionItem = { ...question, id: 'done-1', category: 'handled' };
    const view = await feed(host(), {
      status: 'ready',
      sections: { action: [], replies: [reply], handled: [done] },
    });
    const handled = view.querySelector('[data-testid="inbox-row-done-1"]')!;
    const replied = view.querySelector('[data-testid="inbox-row-reply-1"]')!;
    expect(handled.textContent).toContain(
      `${t.kind['user-question']} · ${done.botSlug} · ${done.summary}`,
    );
    expect(replied.textContent).toContain(`${t.kind.reply ?? t.otherKind} · ${reply.botSlug}`);
    expect(replied.textContent?.split(reply.summary).length).toBe(2);
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
});
