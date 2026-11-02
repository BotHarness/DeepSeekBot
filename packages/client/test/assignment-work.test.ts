// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ChannelAssignmentSummary } from '../../core/src/runtime/bot-runtime.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  ...(await import('./primitive-mocks.js')).dialogPrimitives(),
  Tag: ({ children }: { children: unknown }) => createElement('span', null, children as never),
  Menu: () => null,
  IconEllipsisOutlineRegular: () => null,
  IconRefreshOutlineRegular: () => null,
  Tooltip: ({ children }: { children: unknown }) => children,
  relativeTime: () => ({ unit: 'now', n: 0 }),
}));

import type { BridgeActions } from '../src/client/actions.js';
import { groupAssignmentWork } from '../src/client/assignment-work.js';
import { loadAssignmentWork, type AssignmentWork, type BridgeCall } from '../src/client/bridge.js';
import { GroupWorkEntry } from '../src/client/group-work-entry.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelSummary } from '../src/client/store.js';
import { buttonNamed, dialog } from './primitive-mocks.js';

const AT = '2026-10-08T00:00:00Z';

const GROUP: ChannelSummary = {
  id: 'g-qa',
  type: 'group',
  name: 'QA 群',
  members: ['ada'],
  createdAt: AT,
  updatedAt: AT,
};

const ASSIGNMENT: ChannelAssignmentSummary = {
  sessionId: 's-run',
  botSlug: 'ada',
  title: 'Run the build',
  description: 'Build and report',
  activity: 'working',
  createdAt: AT,
  updatedAt: AT,
};

const step = (tool: string, round: number, status = 'done', detail?: string) => ({
  status,
  kind: 'read',
  tool,
  ...(detail === undefined ? {} : { detail }),
  at: AT,
  round,
});

const TIMELINE = {
  assignment: {
    ...ASSIGNMENT,
    latestReport: { state: 'progress', summary: 'Half way', at: AT },
  },
  rounds: [
    { index: 1, kind: 'created', at: AT, instruction: 'Build the docs site' },
    { index: 2, kind: 'continued', at: AT, instruction: 'Also run the tests' },
  ],
  lanes: [
    {
      role: 'main',
      index: 0,
      sessionId: 's-run',
      route: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
      state: 'running',
      entries: [step('read', 1, 'done', 'README.md'), step('bash', 2, 'failed')],
      omitted: 0,
    },
    {
      role: 'subagent',
      index: 1,
      sessionId: 'sub-1',
      title: 'Check links',
      route: { provider: 'deepseek', model: 'deepseek-v4-pro', reasoningEffort: 'high' },
      state: 'done',
      round: 1,
      entries: [step('grep', 1)],
      omitted: 0,
    },
    {
      role: 'subagent',
      index: 2,
      sessionId: 'sub-2',
      state: 'running',
      round: 2,
      entries: [],
      omitted: 0,
    },
    { role: 'other', index: 3, sessionId: 'bad', entries: [] },
  ],
  omittedSubagents: 0,
  omittedRounds: 0,
};

const call = (value: unknown): BridgeCall => vi.fn(async () => ({ ok: true as const, value }));

let root: Root;
let host: HTMLDivElement;
let actions: BridgeActions;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  store.setRoster(
    [
      { slug: 'ada', displayName: 'Ada', roles: [], aggregateState: 'idle', createdAt: AT },
    ] as never,
    [GROUP],
  );
  actions = {
    channelAssignments: vi.fn(async () => [ASSIGNMENT]),
    assignmentWork: vi.fn(async () => loadAssignmentWork(call(TIMELINE), 'ada', 's-run')),
    openSession: vi.fn(),
  } as unknown as BridgeActions;
});

afterEach(async () => {
  await act(async () => root.unmount());
  store.setRoster([], []);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it('reads the rounds, lanes and steps of an Assignment and drops unreadable ones', async () => {
  const read = call(TIMELINE);
  const work = await loadAssignmentWork(read, 'ada', 's-run');
  expect(read).toHaveBeenCalledWith(
    'assignmentTimeline',
    { slug: 'ada', sessionId: 's-run' },
    undefined,
  );
  expect(work.title).toBe('Run the build');
  expect(work.latestReport).toEqual({ state: 'progress', summary: 'Half way', at: AT });
  expect(work.rounds.map((round) => round.kind)).toEqual(['created', 'continued']);
  expect(work.lanes.map((lane) => lane.sessionId)).toEqual(['s-run', 'sub-1', 'sub-2']);
  await expect(loadAssignmentWork(call({ lanes: [] }), 'ada', 's-run')).rejects.toThrow(
    'invalid assignmentTimeline response',
  );
});

it('groups MAIN steps and Subagents under the Orchestrator round that started them', async () => {
  const work = await loadAssignmentWork(call(TIMELINE), 'ada', 's-run');
  const groups = groupAssignmentWork(work);
  expect(groups.map((group) => group.round?.index)).toEqual([1, 2]);
  expect(groups[0]!.main.map((entry) => entry.tool)).toEqual(['read']);
  expect(groups[0]!.subagents.map((lane) => lane.sessionId)).toEqual(['sub-1']);
  expect(groups[1]!.main.map((entry) => entry.tool)).toEqual(['bash']);
  expect(groups[1]!.subagents.map((lane) => lane.sessionId)).toEqual(['sub-2']);

  const legacy: AssignmentWork = { ...work, rounds: [] };
  const [only] = groupAssignmentWork(legacy);
  expect(groupAssignmentWork(legacy)).toHaveLength(1);
  expect(only!.round).toBeUndefined();
  expect(only!.main).toHaveLength(2);
  expect(only!.subagents).toHaveLength(2);
});

it('opens the work of a Group Assignment from its row and can open its Session', async () => {
  await act(async () =>
    root.render(
      createElement(GroupWorkEntry, {
        scope: 'channel',
        channelId: GROUP.id,
        botSlug: undefined,
        actions,
        t: zhTranslate,
      }),
    ),
  );
  expect(actions.assignmentWork).not.toHaveBeenCalled();
  await act(async () =>
    buttonNamed(zhTranslate('assignmentWork.open', { title: 'Run the build' })).click(),
  );
  expect(actions.assignmentWork).toHaveBeenCalledWith('ada', 's-run');
  const panel = dialog();
  const rounds = [...panel.querySelectorAll('[data-assignment-work-round]')];
  expect(rounds.map((round) => round.getAttribute('data-assignment-work-round'))).toEqual([
    '1',
    '2',
  ]);
  expect(rounds[0]!.textContent).toContain(zhTranslate('assignmentWork.round.created'));
  expect(rounds[0]!.textContent).toContain('Build the docs site');
  expect(rounds[0]!.textContent).toContain('README.md');
  expect(rounds[0]!.textContent).toContain('SUBAGENT 01');
  expect(rounds[0]!.textContent).toContain('Check links');
  expect(rounds[0]!.textContent).toContain('deepseek/deepseek-v4-pro · high');
  expect(rounds[0]!.textContent).not.toContain('SUBAGENT 02');
  expect(rounds[1]!.textContent).toContain(zhTranslate('assignmentWork.round.continued'));
  expect(rounds[1]!.textContent).toContain('Also run the tests');
  expect(rounds[1]!.querySelector('[data-assignment-work-step="failed"]')?.textContent).toContain(
    'bash',
  );
  expect(rounds[1]!.textContent).toContain('SUBAGENT 02');
  expect(rounds[1]!.textContent).toContain(zhTranslate('assignmentWork.noSteps'));
  expect(panel.textContent).toContain('opencode-go/deepseek-v4.1-flash');
  expect(panel.textContent).toContain('Half way');

  await act(async () => buttonNamed(zhTranslate('assignmentWork.openSession'), panel).click());
  expect(actions.openSession).toHaveBeenCalledWith('s-run');
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});
