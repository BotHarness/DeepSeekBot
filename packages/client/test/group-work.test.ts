// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChannelAssignmentSummary } from '../../core/src/runtime/bot-runtime.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Tag: ({ children }: { children: unknown }) => createElement('span', null, children as never),
  Menu: () => null,
  IconEllipsisOutlineRegular: () => null,
  Tooltip: ({ children }: { children: unknown }) => children,
  Modal: () => null,
  relativeTime: () => ({ unit: 'now', n: 0 }),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { GroupWorkEntry } from '../src/client/group-work-entry.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelSummary } from '../src/client/store.js';

const AT = '2026-10-08T00:00:00Z';

const GROUP: ChannelSummary = {
  id: 'g-qa',
  type: 'group',
  name: 'QA 群',
  members: ['ada', 'bob'],
  createdAt: AT,
  updatedAt: AT,
};

const assignment = (
  sessionId: string,
  botSlug: string,
  purpose: string,
  activity: ChannelAssignmentSummary['activity'],
  report?: NonNullable<ChannelAssignmentSummary['latestReport']>['state'],
): ChannelAssignmentSummary => ({
  sessionId,
  botSlug,
  purpose,
  activity,
  ...(report === undefined
    ? {}
    : { latestReport: { state: report, summary: purpose + ' report', at: AT } }),
  createdAt: AT,
  updatedAt: AT,
});

let root: Root;
let host: HTMLDivElement;
let actions: BridgeActions;
let assignments: ChannelAssignmentSummary[];

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  store.setRoster(
    [
      { slug: 'ada', displayName: 'Ada', roles: [], aggregateState: 'idle', createdAt: AT },
      { slug: 'bob', displayName: 'Bob', roles: [], aggregateState: 'idle', createdAt: AT },
    ] as never,
    [GROUP],
  );
  assignments = [];
  actions = {
    channelAssignments: vi.fn(async () => assignments),
    openSession: vi.fn(),
  } as unknown as BridgeActions;
});

afterEach(async () => {
  await act(async () => root.unmount());
  store.setRoster([], []);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const render = () =>
  act(async () =>
    root.render(
      createElement(GroupWorkEntry, {
        scope: 'channel',
        channelId: GROUP.id,
        botSlug: undefined,
        actions,
        t: zhTranslate,
        nativeSessions: (() => {
          const snapshot = {
            ids: assignments.map((a) => a.sessionId),
            byId: Object.fromEntries(
              assignments.map((a) => [
                a.sessionId,
                { displayTitle: a.purpose, updatedAt: 1, running: a.activity === 'working' },
              ]),
            ),
          };
          return { subscribe: () => () => {}, getSnapshot: () => snapshot };
        })(),
      }),
    ),
  );

it('groups the Group’s Assignments and keeps Done collapsed', async () => {
  assignments = [
    assignment('s-ask', 'bob', 'Pick a branch', 'idle', 'waiting-human'),
    assignment('s-run', 'ada', 'Run the build', 'working', 'progress'),
    assignment('s-idle', 'bob', 'Draft notes', 'idle'),
    assignment('s-done', 'ada', 'Ship docs', 'idle', 'completed'),
    assignment('s-stop', 'bob', 'Old task', 'stopped'),
  ];
  await render();
  expect(actions.channelAssignments).toHaveBeenCalledWith(GROUP.id);
  const sections = [...host.querySelectorAll('section[data-group]')];
  expect(sections.map((section) => section.getAttribute('data-group'))).toEqual([
    'waiting',
    'working',
    'idle',
    'done',
  ]);
  const titles = () =>
    [...host.querySelectorAll('.bh-card-title')].map((title) => title.textContent);
  expect(titles()).toEqual(['Pick a branch', 'Run the build', 'Draft notes', 'Ship docs']);
  expect(host.querySelector('.bh-card-row')?.textContent).toContain('Pick a branch report');
  expect(host.querySelector('.bh-card-row')?.textContent).toContain('Bob');

  const done = host.querySelector<HTMLButtonElement>('section[data-group="done"] button')!;
  expect(done.getAttribute('aria-expanded')).toBe('false');
  expect(done.textContent).toContain(zhTranslate('sessions.section.resolved'));
  await act(async () => done.click());
  expect(titles()).toEqual([
    'Pick a branch',
    'Run the build',
    'Draft notes',
    'Ship docs',
    'Old task',
  ]);

  await act(async () => host.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
  expect(actions.openSession).toHaveBeenCalledWith('s-ask');
});

it('says where Group work will appear before there is any', async () => {
  await render();
  expect(host.querySelector('[role="status"]')?.textContent).toBe(zhTranslate('groupWork.empty'));
  expect(host.querySelector('section')).toBeNull();
});
