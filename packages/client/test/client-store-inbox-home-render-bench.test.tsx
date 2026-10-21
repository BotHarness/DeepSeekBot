// @vitest-environment jsdom
import { writeFileSync } from 'node:fs';
import { act, createElement, Profiler, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h, forwardRef } = await import('react');
  const passthrough = forwardRef(({ children }: { children?: unknown }, _ref) =>
    h('span', null, children as never),
  );
  const cache = new Map<string, unknown>([
    ['relativeTime', () => ({ unit: 'now', n: 0 })],
    ['fileSizeText', (size: number) => `${size} B`],
    ['useAnchoredPosition', () => ({ top: 0, left: 0 })],
  ]);
  return new Proxy(
    {},
    {
      has: () => true,
      get: (_target, key) => {
        if (typeof key !== 'string' || key === 'then' || key === '__esModule') return undefined;
        if (!cache.has(key)) cache.set(key, key.startsWith('use') ? () => undefined : passthrough);
        return cache.get(key);
      },
    },
  );
});

import type { BridgeActions } from '../src/client/actions.js';
import { ActivityInboxMenu } from '../src/client/activity-inbox-menu.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { HomeOverview } from '../src/client/home-overview.js';
import { HomeWelcome } from '../src/client/home-welcome.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { ImAppsSection } from '../src/client/im-apps-section.js';
import { zhTranslate as t } from '../src/client/locale.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
  type HumanAttentionItem,
} from '../src/client/store.js';
import { inertSubmissionActions } from './inert-submissions.js';

const AT = '2026-10-21T00:00:00Z';
const bot = (slug: string, displayName = slug.toUpperCase()): BotSummary =>
  ({
    slug,
    displayName,
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: AT,
  }) as BotSummary;
const message = (id: number): ChannelMessage => ({
  id: 'm' + id,
  at: AT,
  author: { kind: 'bot', slug: 'ada' },
  body: 'reply '.repeat((id % 7) + 1),
});
const channel = (id: string, slug?: string): ChannelSummary => ({
  id,
  type: slug === undefined ? 'group' : 'dm',
  name: id.toUpperCase(),
  members: slug === undefined ? ['ada', 'bob'] : [slug],
  ...(slug === undefined ? {} : { botSlug: slug }),
  createdAt: AT,
  updatedAt: AT,
  latestMessage: message(0),
});
const DM = channel('dm-ada', 'ada');
const item = (n: number): HumanAttentionItem => ({
  id: 'mention:' + n,
  category: 'replies',
  kind: 'channel-mention',
  createdAt: AT,
  channelId: 'team',
  channelName: 'TEAM',
  botSlug: 'bob',
  summary: 'mention ' + n,
  messageId: 'm' + n,
  isUnread: true,
});

const pending = () => new Promise<never>(() => undefined);
const actions = new Proxy({ ...inertSubmissionActions } as unknown as BridgeActions, {
  get: (target, key) =>
    key in target ? target[key as keyof BridgeActions] : key === 'then' ? undefined : pending,
});
const imApps = {
  load: pending,
  manage: () => undefined,
  takeNotice: () => undefined,
  bind: pending,
  unbind: pending,
  bindCreated: pending,
};

let revision = 0;
let clock = Date.parse(AT);
function activity(slug: string | undefined, n: number): void {
  clock += 10_000;
  vi.setSystemTime(clock);
  store.applyActivity({
    generation: 'inbox-home-bench',
    revision: ++revision,
    bots: ['ada', 'bob', 'cy'].map((value) =>
      value !== slug
        ? { slug: value, state: 'idle' }
        : {
            slug: value,
            state: 'working',
            activity: {
              effect: 'executing',
              toolKind: 'execute',
              publicDetail: 'step ' + n,
              startedAt: 1,
              activeToolCount: 1,
            },
          },
    ),
  } as never);
}

const quiet = {
  stream: (n: number) =>
    store.setConversation({
      drafts: [{ ...message(1000), id: 'draft', body: 'x'.repeat(n + 1), streaming: true }],
      draftRevision: n + 1,
    } as never),
  'conversation-revision': (n: number) => store.setConversation({ revision: n + 1 }),
  search: (n: number) => store.setQuery('a'.repeat((n % 5) + 1)),
  'inbox-count': (n: number) => store.setHumanInbox({ unreadCount: n + 2 }),
  'unrelated-activity': (n: number) => activity('cy', n),
};
type Phase = keyof typeof quiet;
type Part = 'humanInbox' | 'activityMenu' | 'homeOverview' | 'homeWelcome' | 'imApps';
const PARTS: Part[] = ['humanInbox', 'activityMenu', 'homeOverview', 'homeWelcome', 'imApps'];
const quietFor: Record<Part, Phase[]> = {
  humanInbox: ['stream', 'conversation-revision', 'search', 'unrelated-activity'],
  activityMenu: ['stream', 'conversation-revision', 'search', 'inbox-count', 'unrelated-activity'],
  homeOverview: ['stream', 'conversation-revision', 'search', 'inbox-count'],
  homeWelcome: ['stream', 'conversation-revision', 'search', 'inbox-count', 'unrelated-activity'],
  imApps: ['stream', 'conversation-revision', 'search', 'inbox-count', 'unrelated-activity'],
};
const FRAMES = 200;
const report: Record<
  string,
  {
    renders: Record<Part, number>;
    ms: Record<Part, number>;
    cpuMs: number;
    heapKb: number;
  }
> = {};
const updates: Record<string, Record<Part, number>> = {};
const gc = (globalThis as { gc?: () => void }).gc;

describe('Inbox and home render benchmark', () => {
  beforeAll(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterAll(() => {
    const out = process.env.BH_INBOX_BENCH_OUT;
    if (out)
      writeFileSync(out, JSON.stringify({ frames: FRAMES, gc: !!gc, report, updates }, null, 2));
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('keeps Inbox and home surfaces still on writes they do not show', async () => {
    store.setRoster([bot('ada'), bot('bob'), bot('cy')], [DM, channel('team')]);
    activity(undefined, 0);
    store.select({ kind: 'inbox' });
    store.setConversation({ status: 'ready', channel: DM, messages: [message(0)], revision: 0 });
    store.setHumanInbox({
      status: 'ready',
      category: 'replies',
      items: [item(1), item(2), item(3)],
      unreadCount: 1,
    });
    const renders = new Map<Part, number>();
    const ms = new Map<Part, number>();
    let counting = false;
    const profiled = (id: Part, element: ReactElement) =>
      createElement(
        Profiler,
        {
          id,
          onRender: (_id: string, _kind: string, duration: number) => {
            if (!counting) return;
            renders.set(id, (renders.get(id) ?? 0) + 1);
            ms.set(id, (ms.get(id) ?? 0) + duration);
          },
        },
        element,
      );
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          'div',
          null,
          profiled('humanInbox', createElement(HumanInboxView, { actions, t })),
          profiled('activityMenu', createElement(ActivityInboxMenu, { actions, t })),
          profiled(
            'homeOverview',
            createElement(HomeOverview, { actions, registry: createDockPanelRegistry(), t }),
          ),
          profiled(
            'homeWelcome',
            createElement(HomeWelcome, {
              actions,
              botSlug: 'ada',
              t,
              onEditHumanName: () => undefined,
            }),
          ),
          profiled('imApps', createElement(ImAppsSection, { imApps, store, t } as never)),
        ),
      ),
    );
    const snapshot = (): Record<Part, number> =>
      Object.fromEntries(PARTS.map((part) => [part, renders.get(part) ?? 0])) as Record<
        Part,
        number
      >;
    const measure = async (write: () => void): Promise<Record<Part, number>> => {
      renders.clear();
      counting = true;
      await act(async () => write());
      counting = false;
      return snapshot();
    };
    for (const name of Object.keys(quiet) as Phase[]) {
      for (let n = 0; n < 5; n += 1) await act(async () => quiet[name](n));
      renders.clear();
      ms.clear();
      gc?.();
      const heap = process.memoryUsage().heapUsed;
      const cpu = process.cpuUsage();
      counting = true;
      for (let n = 0; n < FRAMES; n += 1) await act(async () => quiet[name](n + 5));
      counting = false;
      const used = process.cpuUsage(cpu);
      gc?.();
      report[name] = {
        renders: snapshot(),
        ms: Object.fromEntries(
          PARTS.map((part) => [part, Math.round((ms.get(part) ?? 0) * 10) / 10]),
        ) as Record<Part, number>,
        cpuMs: Math.round((used.user + used.system) / 100) / 10,
        heapKb: Math.round((process.memoryUsage().heapUsed - heap) / 1024),
      };
    }
    updates['inbox-items'] = await measure(() =>
      store.setHumanInbox({ items: [item(1), item(2), item(3), item(4)] }),
    );
    updates['channel-added'] = await measure(() => store.upsertChannel(channel('ops')));
    updates['bot-renamed'] = await measure(() => store.upsertBot(bot('ada', 'Ada Lovelace')));
    updates['bot-added'] = await measure(() => store.upsertBot(bot('dee')));
    updates['activity-sync'] = await measure(() => store.setActivitySync('stale'));
    updates['own-avatar'] = await measure(() =>
      store.upsertBot({ ...bot('ada', 'Ada Lovelace'), avatar: 'ada.png' } as BotSummary),
    );
    await act(async () => root.unmount());
    host.remove();

    for (const part of PARTS)
      for (const phase of quietFor[part])
        expect(report[phase]!.renders[part], `${part} on ${phase}`).toBe(0);
    expect(updates['inbox-items']!.humanInbox).toBeGreaterThan(0);
    for (const part of ['humanInbox', 'activityMenu', 'homeOverview'] as const)
      expect(updates['channel-added']![part], part).toBeGreaterThan(0);
    for (const part of PARTS) expect(updates['bot-renamed']![part], part).toBeGreaterThan(0);
    for (const part of PARTS.filter((value) => value !== 'homeWelcome'))
      expect(updates['bot-added']![part], part).toBeGreaterThan(0);
    expect(updates['activity-sync']!.homeOverview).toBeGreaterThan(0);
    expect(updates['own-avatar']!.homeWelcome).toBeGreaterThan(0);
    expect(updates['own-avatar']!.humanInbox).toBeGreaterThan(0);
  });
});
