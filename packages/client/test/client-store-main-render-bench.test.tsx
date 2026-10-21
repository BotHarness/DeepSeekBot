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

const chrome = vi.hoisted(() => ({ counting: false, titleBars: 0, containers: 0 }));

vi.mock('../src/client/ds/panel-header.js', async (load) => {
  const real = await load<typeof import('../src/client/ds/panel-header.js')>();
  const { createElement: h } = await import('react');
  return {
    ...real,
    PanelHeader: (props: Parameters<typeof real.PanelHeader>[0]) => {
      if (chrome.counting) chrome.titleBars += 1;
      return h(real.PanelHeader, props);
    },
  };
});

vi.mock('../src/client/entry-part.js', async (load) => {
  const real = await load<typeof import('../src/client/entry-part.js')>();
  const { createElement: h } = await import('react');
  return {
    ...real,
    EntryPart: (props: Parameters<typeof real.EntryPart>[0]) => {
      if (chrome.counting) chrome.containers += 1;
      return h(real.EntryPart, props);
    },
  };
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
const GROUP: ChannelSummary = {
  id: 'group-ab',
  type: 'group',
  name: 'Crew',
  members: ['ada', 'bob'],
  createdAt: AT,
  updatedAt: AT,
};
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
let clock = Date.parse(AT);
function activity(slug: string | undefined, n: number): void {
  clock += 2000;
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

type Phase =
  | 'stream'
  | 'unrelated-activity'
  | 'dm-activity'
  | 'group-member-activity'
  | 'group-unrelated-activity'
  | 'human-inbox'
  | 'search';
const workload: Record<Phase, (n: number) => void> = {
  stream: (n) =>
    store.setConversation({
      drafts: [{ ...message(1000), id: 'draft', body: 'x'.repeat(n + 1), streaming: true }],
      draftRevision: n + 1,
    } as never),
  'unrelated-activity': (n) => activity('cy', n),
  'dm-activity': (n) => activity('ada', n),
  'group-member-activity': (n) => activity('bob', n),
  'group-unrelated-activity': (n) => activity('cy', n),
  'human-inbox': (n) => store.setHumanInbox({ unreadCount: n + 1 }),
  search: (n) => store.setQuery('a'.repeat((n % 5) + 1)),
};
const FRAMES = 20;
const LOAD_FRAMES = Number(process.env.BH_MAIN_BENCH_LOAD ?? 0);
const collect = (globalThis as { gc?: () => void }).gc;
const heapKb = (): number => {
  collect?.();
  return process.memoryUsage().heapUsed / 1024;
};
const load: Record<
  string,
  { frames: number; cpuMs: number; heapPeakKb: number; heapRetainedKb: number }
> = {};
const report: Record<
  string,
  {
    panels: number;
    panelRenders: number;
    titleBars: number;
    containers: number;
    mainCommits: number;
    mainMs: number;
  }
> = {};

describe('Bot main render benchmark', () => {
  beforeAll(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(Date, 'now').mockImplementation(() => clock);
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
    if (out) writeFileSync(out, JSON.stringify({ frames: FRAMES, report, load }, null, 2));
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('keeps the Bot main tree and its panels still on writes they do not show', async () => {
    store.setRoster([bot('ada'), bot('bob'), bot('cy')], [DM, GROUP]);
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
    const dmText: string[] = [];
    for (const name of Object.keys(workload) as Phase[]) {
      if (name === 'group-member-activity')
        await act(async () => {
          store.select({ kind: 'channel', channelId: GROUP.id });
          store.setConversation({
            status: 'ready',
            channel: GROUP,
            messages: [message(0)],
            drafts: [],
            revision: 0,
          } as never);
        });
      await act(async () => {
        activity(undefined, 0);
        activity(undefined, 0);
      });
      counts.clear();
      mainCommits = 0;
      mainMs = 0;
      chrome.titleBars = 0;
      chrome.containers = 0;
      phase = name;
      chrome.counting = true;
      for (let n = 0; n < FRAMES; n += 1) await act(async () => workload[name](n));
      chrome.counting = false;
      phase = undefined;
      if (name === 'dm-activity') dmText.push(host.textContent ?? '');
      if (LOAD_FRAMES > 0) {
        const heapBefore = heapKb();
        let heapPeak = heapBefore;
        const cpuBefore = process.cpuUsage();
        for (let n = FRAMES; n < FRAMES + LOAD_FRAMES; n += 1) {
          await act(async () => workload[name](n));
          heapPeak = Math.max(heapPeak, process.memoryUsage().heapUsed / 1024);
        }
        const cpu = process.cpuUsage(cpuBefore);
        load[name] = {
          frames: LOAD_FRAMES,
          cpuMs: Math.round((cpu.user + cpu.system) / 100) / 10,
          heapPeakKb: Math.round(heapPeak - heapBefore),
          heapRetainedKb: Math.round(heapKb() - heapBefore),
        };
      }
      report[name] = {
        panels: mounted,
        panelRenders: [...counts.values()].reduce((sum, value) => sum + value, 0),
        titleBars: chrome.titleBars,
        containers: chrome.containers,
        mainCommits,
        mainMs: Math.round(mainMs * 10) / 10,
      };
    }
    await act(async () => root.unmount());
    host.remove();
    expect(report['stream']!.panels).toBeGreaterThan(0);
    for (const name of Object.keys(workload) as Phase[]) {
      expect(report[name]!.panelRenders, name).toBe(0);
      expect(report[name]!.titleBars, name).toBe(0);
      expect(report[name]!.containers, name).toBe(0);
    }
    expect(report['human-inbox']!.mainCommits).toBe(0);
    expect(report['search']!.mainCommits).toBe(0);
    expect(report['unrelated-activity']!.mainCommits).toBe(0);
    expect(report['group-unrelated-activity']!.mainCommits).toBe(0);
    expect(report['dm-activity']!.mainCommits).toBeGreaterThanOrEqual(FRAMES);
    expect(report['group-member-activity']!.mainCommits).toBeGreaterThanOrEqual(FRAMES);
    expect(dmText[0]).toContain('step ' + (FRAMES - 1));
  });
});
