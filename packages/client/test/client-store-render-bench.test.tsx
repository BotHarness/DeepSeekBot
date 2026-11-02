// @vitest-environment jsdom
import { writeFileSync } from 'node:fs';
import {
  act,
  createElement,
  Profiler,
  type ComponentType,
  type ProfilerOnRenderCallback,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement: h } = await import('react');
  const passthrough = ({ children }: { children?: unknown }) => h('span', null, children as never);
  const cache = new Map<string, unknown>([
    ['relativeTime', () => ({ unit: 'now', n: 0 })],
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
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import type {
  ChannelSidebarEntryProps,
  ChannelSidebarScope,
} from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  store,
  type BotSummary,
  type ChannelMessage,
  type ChannelSummary,
} from '../src/client/store.js';

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
const message = (id: number, slug = 'ada'): ChannelMessage => ({
  id: 'm' + id,
  at: AT,
  author: { kind: 'bot', slug },
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
const GROUP: ChannelSummary = {
  id: 'g-qa',
  type: 'group',
  name: 'QA',
  members: ['ada', 'bob'],
  createdAt: AT,
  updatedAt: AT,
  latestMessage: message(0, 'bob'),
};

const actions = new Proxy({} as BridgeActions, {
  get: (_target, key) =>
    key === 'then' ? undefined : vi.fn(() => new Promise<never>(() => undefined)),
});

interface Counter {
  commits: number;
  duration: number;
}
type Phase =
  | 'stream'
  | 'revision'
  | 'unrelated-activity'
  | 'own-activity'
  | 'human-inbox'
  | 'search';
const PHASES: readonly Phase[] = [
  'stream',
  'revision',
  'unrelated-activity',
  'own-activity',
  'human-inbox',
  'search',
];
const FRAMES = 40;
const report: Record<string, Record<string, Record<Phase, Counter>>> = {};

let activityRevision = 0;
function activity(slug: string | undefined, n: number): void {
  store.applyActivity({
    generation: 'bench',
    revision: ++activityRevision,
    bots: ['ada', 'bob', 'cy'].map((bot) =>
      bot !== slug
        ? { slug: bot, state: 'idle' }
        : {
            slug: bot,
            state: 'working',
            activity: {
              effect: 'executing',
              toolKind: 'execute',
              toolName: 'shell',
              publicDetail: 'step ' + n,
              startedAt: 1,
              activeToolCount: 1,
            },
          },
    ),
  } as never);
}

const workload: Record<Phase, (n: number) => void> = {
  stream: (n) => {
    const messages = Array.from({ length: n + 1 }, (_, index) => message(index));
    store.setConversation({ messages, sending: n % 2 === 0 });
  },
  revision: (n) => store.setConversation({ revision: n + 1 }),
  'unrelated-activity': (n) => activity('cy', n),
  'own-activity': (n) => activity('ada', n),
  'human-inbox': (n) => store.setHumanInbox({ unreadCount: n + 1 }),
  search: (n) => store.setQuery('a'.repeat((n % 5) + 1)),
};

async function run(scenario: string, scope: ChannelSidebarScope, channel: ChannelSummary) {
  store.setRoster([bot('ada'), bot('bob'), bot('cy')], [DM, GROUP]);
  activity(undefined, 0);
  store.select({ kind: 'channel', channelId: channel.id });
  store.setConversation({ status: 'ready', channel, messages: [message(0)], revision: 0 });
  const props: ChannelSidebarEntryProps = {
    scope,
    channelId: channel.id,
    botSlug: channel.botSlug,
    actions,
    t: zhTranslate,
  };
  const panels: [string, ComponentType<ChannelSidebarEntryProps>][] = [];
  const sessions = { ids: [], byId: {} };
  const nativeSessions = { subscribe: () => () => undefined, getSnapshot: () => sessions };
  for (const entry of createChannelSidebarBuiltins(zhTranslate, undefined, nativeSessions)) {
    if (entry.scope !== scope && entry.scope !== 'both') continue;
    panels.push([entry.id, entry.component]);
    if (entry.headerAction) panels.push([entry.id + ':header', entry.headerAction]);
    if (entry.badge) panels.push([entry.id + ':badge', entry.badge]);
  }
  let phase: Phase | undefined;
  const counters: Record<string, Record<Phase, Counter>> = {};
  const onRender: ProfilerOnRenderCallback = (id, _kind, duration) => {
    if (phase === undefined) return;
    const counter = counters[id]![phase];
    counter.commits += 1;
    counter.duration += duration;
  };
  for (const [id] of panels)
    counters[id] = Object.fromEntries(
      PHASES.map((name) => [name, { commits: 0, duration: 0 }]),
    ) as Record<Phase, Counter>;

  const host = document.createElement('div');
  document.body.append(host);
  const root: Root = createRoot(host);
  await act(async () =>
    root.render(
      createElement(
        'div',
        null,
        ...panels.map(([id, component]) =>
          createElement(Profiler, { key: id, id, onRender }, createElement(component, props)),
        ),
      ),
    ),
  );
  for (const name of PHASES) {
    phase = name;
    for (let n = 0; n < FRAMES; n += 1) await act(async () => workload[name](n));
  }
  phase = undefined;
  await act(async () => root.unmount());
  host.remove();
  report[scenario] = counters;
  return counters;
}

function total(counters: Record<string, Record<Phase, Counter>>, name: Phase): number {
  return Object.values(counters).reduce((sum, counter) => sum + counter[name].commits, 0);
}

describe('Channel sidebar render benchmark', () => {
  beforeAll(() => {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  });
  afterAll(() => {
    const out = process.env.BH_RENDER_BENCH_OUT;
    if (out) writeFileSync(out, JSON.stringify({ frames: FRAMES, report }, null, 2));
    store.setRoster([], []);
    vi.unstubAllGlobals();
  });

  it('keeps DM panels still while the reply streams and other Bots work', async () => {
    const counters = await run('dm', 'personabot', DM);
    expect(total(counters, 'stream')).toBe(0);
    expect(total(counters, 'unrelated-activity')).toBe(0);
    expect(total(counters, 'human-inbox')).toBe(0);
    expect(total(counters, 'search')).toBe(0);
  });

  it('keeps group panels still while the reply streams and other Bots work', async () => {
    const counters = await run('group', 'channel', GROUP);
    expect(total(counters, 'stream')).toBe(0);
    expect(total(counters, 'unrelated-activity')).toBe(0);
    expect(total(counters, 'human-inbox')).toBe(0);
    expect(total(counters, 'search')).toBe(0);
  });

  it('still repaints a member avatar once its Bot settles into a new Activity', async () => {
    store.setRoster([bot('ada'), bot('bob'), bot('cy')], [DM, GROUP]);
    activity(undefined, 0);
    await new Promise((resolve) => setTimeout(resolve, 1700));
    store.select({ kind: 'channel', channelId: GROUP.id });
    store.setConversation({ status: 'ready', channel: GROUP, messages: [], revision: 0 });
    const members = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'members',
    )!;
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const props = {
      scope: 'channel' as const,
      channelId: GROUP.id,
      botSlug: undefined,
      actions,
      t: zhTranslate,
    };
    await act(async () => root.render(createElement(members.component, props)));
    const avatar = () => host.querySelector('.bh-member-row .bh-persona-avatar');
    expect(avatar()?.getAttribute('data-state')).toBe('idle');
    await act(async () => activity('ada', 1));
    await act(() => new Promise((resolve) => setTimeout(resolve, 1000)));
    expect(avatar()?.getAttribute('data-state')).toBe('working');
    await act(async () => root.unmount());
    host.remove();
  });
});
