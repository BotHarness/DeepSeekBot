// @vitest-environment jsdom
import { writeFileSync } from 'node:fs';
import { act, createElement, Profiler, type ComponentType } from 'react';
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
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import {
  createChannelSidebarRegistry,
  type ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
} from '../src/client/store.js';
import { inertSubmissionActions } from './inert-submissions.js';

const AT = '2026-10-21T00:00:00Z';
const bot = (slug: string): BotSummary =>
  ({
    slug,
    displayName: slug.toUpperCase(),
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
const DM: ChannelSummary = {
  id: 'dm-ada',
  type: 'dm',
  name: 'ADA',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: AT,
  updatedAt: AT,
  latestMessage: message(0),
};

const pending = () => new Promise<never>(() => undefined);
const actions = new Proxy({ ...inertSubmissionActions } as unknown as BridgeActions, {
  get: (target, key) =>
    key in target ? target[key as keyof BridgeActions] : key === 'then' ? undefined : pending,
});

let revision = 0;
function activity(slug: string | undefined, n: number): void {
  store.applyActivity({
    generation: 'main-bench',
    revision: ++revision,
    bots: ['ada', 'bob', 'cy'].map((item) =>
      item !== slug
        ? { slug: item, state: 'idle' }
        : {
            slug: item,
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

type Phase = 'stream' | 'unrelated-activity' | 'human-inbox' | 'search';
const workload: Record<Phase, (n: number) => void> = {
  stream: (n) =>
    store.setConversation({
      drafts: [{ ...message(1000), id: 'draft', body: 'x'.repeat(n + 1), streaming: true }],
      draftRevision: n + 1,
    } as never),
  'unrelated-activity': (n) => activity('cy', n),
  'human-inbox': (n) => store.setHumanInbox({ unreadCount: n + 1 }),
  search: (n) => store.setQuery('a'.repeat((n % 5) + 1)),
};
const FRAMES = 20;
const report: Record<
  string,
  { panels: number; panelRenders: number; mainCommits: number; mainMs: number }
> = {};

describe('Bot main render benchmark', () => {
  beforeAll(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    window.matchMedia = ((query: string) => ({
      matches: query.includes('min-width'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => true,
    })) as typeof window.matchMedia;
  });
  afterAll(() => {
    const out = process.env.BH_MAIN_BENCH_OUT;
    if (out) writeFileSync(out, JSON.stringify({ frames: FRAMES, report }, null, 2));
    vi.unstubAllGlobals();
  });

  it('keeps the Bot main tree and its panels still on writes they do not show', async () => {
    store.setRoster([bot('ada'), bot('bob'), bot('cy')], [DM]);
    activity(undefined, 0);
    store.select({ kind: 'channel', channelId: DM.id });
    store.setConversation({ status: 'ready', channel: DM, messages: [message(0)], revision: 0 });
    let phase: Phase | undefined;
    const counts = new Map<string, number>();
    const registry = createChannelSidebarRegistry();
    const sessions = { ids: [], byId: {} };
    const nativeSessions = { subscribe: () => () => undefined, getSnapshot: () => sessions };
    for (const entry of createChannelSidebarBuiltins(zhTranslate, undefined, nativeSessions)) {
      const Inner = entry.component;
      const Counted: ComponentType<ChannelSidebarEntryProps> = (props) => {
        if (phase !== undefined) counts.set(entry.id, (counts.get(entry.id) ?? 0) + 1);
        return createElement(Inner, props);
      };
      registry.register({ ...entry, component: Counted });
    }
    let mainCommits = 0;
    let mainMs = 0;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () =>
      root.render(
        createElement(
          Profiler,
          {
            id: 'main',
            onRender: (_id, _kind, duration) => {
              if (phase === undefined) return;
              mainCommits += 1;
              mainMs += duration;
            },
          },
          createElement(BotMain, {
            actions,
            channelSidebar: registry,
            nativeSessions,
          }),
        ),
      ),
    );
    const mounted = host.querySelectorAll('[data-sidebar-entry]').length;
    for (const name of Object.keys(workload) as Phase[]) {
      counts.clear();
      mainCommits = 0;
      mainMs = 0;
      phase = name;
      for (let n = 0; n < FRAMES; n += 1) await act(async () => workload[name](n));
      phase = undefined;
      report[name] = {
        panels: mounted,
        panelRenders: [...counts.values()].reduce((sum, value) => sum + value, 0),
        mainCommits,
        mainMs: Math.round(mainMs * 10) / 10,
      };
    }
    await act(async () => root.unmount());
    host.remove();
    expect(report['stream']!.panels).toBeGreaterThan(0);
    for (const name of Object.keys(workload) as Phase[])
      expect(report[name]!.panelRenders, name).toBe(0);
    expect(report['human-inbox']!.mainCommits).toBe(0);
    expect(report['search']!.mainCommits).toBe(0);
    expect(report['unrelated-activity']!.mainCommits).toBeLessThanOrEqual(1);
  });
});
