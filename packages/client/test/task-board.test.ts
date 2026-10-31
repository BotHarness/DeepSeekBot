import { describe, expect, it } from 'vitest';

import type { ChannelAssignmentSummary } from '../../core/src/runtime/bot-runtime.js';
import type { AssignmentWork, AssignmentWorkStep } from '../src/client/bridge.js';
import type { ConfigStorage } from '../src/client/roster-config.js';
import type { BotSummary } from '../src/client/store.js';
import {
  TASK_BOARD_MAX_CARDS,
  TASK_BOARD_MAX_STEPS,
  assignmentPlacement,
  buildTaskBoard,
  needsWork,
  taskBoardPhase,
  type TaskBoardInput,
  type TaskBoardModel,
} from '../src/client/task-board-model.js';
import {
  EMPTY_TASK_BOARD_PREFS,
  TASK_BOARD_PREFS_KEY,
  createTaskBoardPrefs,
} from '../src/client/task-board-prefs.js';

const NOW = Date.parse('2026-10-31T12:00:00.000Z');
const at = (minutes: number): string => new Date(NOW - minutes * 60_000).toISOString();

function bot(slug: string, displayName = slug, avatar?: string): BotSummary {
  return {
    slug,
    displayName,
    roles: ['bot'],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: at(600),
    ...(avatar === undefined ? {} : { avatar }),
  };
}

function assignment(
  overrides: Partial<ChannelAssignmentSummary> & { sessionId: string },
): ChannelAssignmentSummary {
  return {
    botSlug: 'ada',
    title: `work ${overrides.sessionId}`,
    description: 'do the thing',
    activity: 'working',
    createdAt: at(120),
    updatedAt: at(1),
    ...overrides,
  };
}

function step(
  tool: string,
  status: AssignmentWorkStep['status'],
  extra: Partial<AssignmentWorkStep> = {},
): AssignmentWorkStep {
  return { status, kind: 'execute', tool, at: at(1), ...extra };
}

function work(entries: AssignmentWorkStep[], omitted = 0): AssignmentWork {
  return {
    title: 'work',
    description: 'do the thing',
    activity: 'working',
    rounds: [],
    lanes: [{ role: 'main', index: 0, sessionId: 's1', state: 'running', entries, omitted }],
    omittedSubagents: 0,
    omittedRounds: 0,
  };
}

function board(overrides: Partial<TaskBoardInput> = {}): TaskBoardModel {
  return buildTaskBoard({
    channelId: 'chan-1',
    channelType: 'group',
    assignments: [],
    bots: [],
    now: NOW,
    ...overrides,
  });
}

describe('Bot grouping', () => {
  it('groups cards by bot slug and names each group from the roster', () => {
    const model = board({
      assignments: [
        assignment({ sessionId: 'a1', botSlug: 'ada' }),
        assignment({ sessionId: 'b1', botSlug: 'bob', updatedAt: at(0) }),
        assignment({ sessionId: 'a2', botSlug: 'ada', updatedAt: at(5) }),
      ],
      bots: [bot('ada', 'Ada'), bot('bob', 'Bob', 'data:image/png;base64,bob')],
    });
    expect(model.groups.map((group) => group.botSlug)).toEqual(['bob', 'ada']);
    expect(model.groups.map((group) => group.displayName)).toEqual(['Bob', 'Ada']);
    expect(model.groups[0]?.avatar).toBe('data:image/png;base64,bob');
    expect(model.groups[1]?.avatar).toBeUndefined();
    expect(model.groups[1]?.assignments.map((card) => card.sessionId)).toEqual(['a1', 'a2']);
  });

  it('falls back to the slug when the roster no longer knows the bot', () => {
    const model = board({ assignments: [assignment({ sessionId: 'a1', botSlug: 'ghost' })] });
    expect(model.groups[0]?.displayName).toBe('ghost');
  });

  it('keeps a direct message in one expanded group', () => {
    const model = board({
      channelId: 'dm-1',
      channelType: 'dm',
      assignments: [assignment({ sessionId: 'a1', activity: 'idle' })],
      bots: [bot('ada', 'Ada')],
    });
    expect(model.channelType).toBe('dm');
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0]?.collapsed).toBe(false);
  });

  it('reports an empty channel as no groups', () => {
    expect(board().groups).toEqual([]);
  });
});

describe('ordering', () => {
  it('orders groups by their most recent card and cards by updated time', () => {
    const model = board({
      assignments: [
        assignment({ sessionId: 'old', botSlug: 'ada', updatedAt: at(30) }),
        assignment({ sessionId: 'fresh', botSlug: 'ada', updatedAt: at(2) }),
        assignment({ sessionId: 'middle', botSlug: 'bob', updatedAt: at(10) }),
      ],
    });
    expect(model.groups.map((group) => group.botSlug)).toEqual(['ada', 'bob']);
    expect(model.groups[0]?.assignments.map((card) => card.sessionId)).toEqual(['fresh', 'old']);
  });

  it('breaks equal update times by session id so the order is stable', () => {
    const model = board({
      assignments: [
        assignment({ sessionId: 'beta', updatedAt: at(3) }),
        assignment({ sessionId: 'alpha', updatedAt: at(3) }),
      ],
    });
    expect(model.groups[0]?.assignments.map((card) => card.sessionId)).toEqual(['alpha', 'beta']);
  });
});

describe('step progress', () => {
  it('counts every finished status as done and reports the running count', () => {
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: {
        s1: {
          work: work([
            step('read', 'done'),
            step('edit', 'failed'),
            step('edit', 'denied'),
            step('execute', 'cancelled'),
            step('execute', 'running'),
          ]),
        },
      },
    });
    expect(model.groups[0]?.assignments[0]?.progress).toEqual({
      done: 4,
      total: 5,
      omitted: 0,
      running: 1,
    });
  });

  it('carries the omitted count of the main lane through', () => {
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: { s1: { work: work([step('read', 'done')], 9) } },
    });
    expect(model.groups[0]?.assignments[0]?.progress?.omitted).toBe(9);
  });

  it('omits progress when there is no timeline or no step at all', () => {
    const model = board({
      assignments: [assignment({ sessionId: 's1' }), assignment({ sessionId: 's2' })],
      work: { s1: {}, s2: { work: work([]) } },
    });
    expect(model.groups[0]?.assignments[0]?.progress).toBeUndefined();
    expect(model.groups[0]?.assignments[1]?.progress).toBeUndefined();
  });

  it('never reads subagents, only the main lane', () => {
    const main = work([step('read', 'done')]);
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: {
        s1: {
          work: {
            ...main,
            lanes: [
              ...main.lanes,
              {
                role: 'subagent',
                index: 0,
                sessionId: 'sub-1',
                state: 'running',
                entries: [step('read', 'done'), step('read', 'done')],
                omitted: 4,
              },
            ],
          },
        },
      },
    });
    expect(model.groups[0]?.assignments[0]?.progress).toEqual({
      done: 1,
      total: 1,
      omitted: 0,
      running: 0,
    });
  });
});

describe('current step', () => {
  it('prefers the running step even when a newer finished step exists', () => {
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: {
        s1: { work: work([step('execute', 'running'), step('read', 'done')]) },
      },
    });
    expect(model.groups[0]?.assignments[0]?.currentStep).toEqual({
      status: 'running',
      tool: 'execute',
      at: at(1),
    });
  });

  it('falls back to the last step when nothing runs', () => {
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: { s1: { work: work([step('read', 'done'), step('edit', 'failed')]) } },
    });
    expect(model.groups[0]?.assignments[0]?.currentStep?.tool).toBe('edit');
    expect(model.groups[0]?.assignments[0]?.currentStep?.status).toBe('failed');
  });

  it('keeps detail and round when present and drops them when absent', () => {
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: {
        s1: {
          work: work([
            step('read', 'done'),
            step('edit', 'running', { detail: 'src/a.ts', round: 2 }),
          ]),
        },
      },
    });
    const steps = model.groups[0]?.assignments[0]?.steps;
    expect(steps?.[0]).toEqual({ status: 'done', tool: 'read', at: at(1) });
    expect(steps?.[1]).toEqual({
      status: 'running',
      tool: 'edit',
      at: at(1),
      detail: 'src/a.ts',
      round: 2,
    });
  });

  it('hides finished steps on request but keeps current step and failures', () => {
    const hidden = board({
      assignments: [assignment({ sessionId: 's1' })],
      prefs: { showDoneSteps: false },
      work: {
        s1: {
          work: work([step('read', 'done'), step('edit', 'failed'), step('execute', 'running')]),
        },
      },
    });
    const card = hidden.groups[0]?.assignments[0];
    expect(card?.steps?.map((item) => item.tool)).toEqual(['edit', 'execute']);
    expect(card?.currentStep?.tool).toBe('execute');
  });

  it('keeps only the most recent steps of a long lane', () => {
    const entries = Array.from({ length: TASK_BOARD_MAX_STEPS + 5 }, (_, index) =>
      step(`tool-${String(index)}`, 'done'),
    );
    const model = board({
      assignments: [assignment({ sessionId: 's1' })],
      work: { s1: { work: work(entries) } },
    });
    const steps = model.groups[0]?.assignments[0]?.steps;
    expect(steps).toHaveLength(TASK_BOARD_MAX_STEPS);
    expect(steps?.[0]?.tool).toBe('tool-5');
    expect(steps?.at(-1)?.tool).toBe(`tool-${String(TASK_BOARD_MAX_STEPS + 4)}`);
  });
});

describe('collapsed groups', () => {
  it('collapses every group by default in a group channel', () => {
    const model = board({
      assignments: [assignment({ sessionId: 'a1', activity: 'idle' })],
      bots: [bot('ada', 'Ada')],
    });
    expect(model.groups[0]?.collapsed).toBe(true);
  });

  it('remembers a per-bot collapse choice', () => {
    const model = board({
      assignments: [assignment({ sessionId: 'a1', activity: 'idle' })],
      prefs: { collapsedBots: { ada: false } },
    });
    expect(model.groups[0]?.collapsed).toBe(false);
  });

  it('collapses an unknown bot the first time it appears', () => {
    const model = board({
      assignments: [assignment({ sessionId: 'a1', botSlug: 'newcomer', activity: 'idle' })],
      prefs: { collapsedBots: { ada: false } },
    });
    expect(model.groups[0]?.collapsed).toBe(true);
  });

  it('keeps a working group collapsed while the auto expand toggle is off', () => {
    const assignments = [assignment({ sessionId: 'a1', activity: 'working' })];
    const off = board({ assignments });
    expect(off.groups[0]?.collapsed).toBe(true);
    const on = board({ assignments, prefs: { autoExpandWorking: true } });
    expect(on.groups[0]?.collapsed).toBe(false);
    const remembered = board({
      assignments,
      prefs: { autoExpandWorking: true, collapsedBots: { ada: true } },
    });
    expect(remembered.groups[0]?.collapsed).toBe(false);
  });

  it('treats a waiting row as work once auto expand is on', () => {
    const model = board({
      assignments: [
        assignment({
          sessionId: 'a1',
          activity: 'idle',
          latestReport: { state: 'waiting-human', summary: 'need a token', at: at(1) },
        }),
      ],
      prefs: { autoExpandWorking: true, collapsedBots: { ada: true } },
    });
    expect(model.groups[0]?.collapsed).toBe(false);
  });
});

describe('board state', () => {
  it('maps load status and card count onto the five states', () => {
    expect(taskBoardPhase('loading', 0)).toBe('loading');
    expect(taskBoardPhase('error', 0)).toBe('error');
    expect(taskBoardPhase('ready', 0)).toBe('empty');
    expect(taskBoardPhase('ready', 3)).toBe('ready');
    expect(taskBoardPhase('error', 3)).toBe('ready');
  });

  it('marks stale data without dropping it', () => {
    const model = board({
      assignments: [assignment({ sessionId: 'a1' })],
      stale: true,
      now: NOW,
    });
    expect(model.stale).toBe(true);
    expect(model.loadedAt).toBe(NOW);
    expect(model.groups[0]?.assignments).toHaveLength(1);
  });

  it('truncates past the card limit and keeps the newest cards', () => {
    const assignments = Array.from({ length: TASK_BOARD_MAX_CARDS + 1 }, (_, index) =>
      assignment({
        sessionId: `s${String(index)}`,
        updatedAt: at(TASK_BOARD_MAX_CARDS - index),
      }),
    );
    const model = board({ assignments });
    expect(model.truncated).toBe(true);
    const kept = model.groups.flatMap((group) => group.assignments);
    expect(kept).toHaveLength(TASK_BOARD_MAX_CARDS);
    expect(kept.some((card) => card.sessionId === `s${String(TASK_BOARD_MAX_CARDS)}`)).toBe(true);
    expect(kept.some((card) => card.sessionId === 's0')).toBe(false);
  });

  it('does not report truncation at exactly the card limit', () => {
    const assignments = Array.from({ length: TASK_BOARD_MAX_CARDS }, (_, index) =>
      assignment({ sessionId: `s${String(index)}` }),
    );
    expect(board({ assignments }).truncated).toBe(false);
  });
});

describe('status mapping', () => {
  it('places every activity on the section the session list uses', () => {
    expect(assignmentPlacement('working', undefined)).toEqual({ section: 'working' });
    expect(assignmentPlacement('stopping', undefined)).toEqual({ section: 'working' });
    expect(assignmentPlacement('error', undefined)).toEqual({
      section: 'needs-input',
      needs: 'error',
    });
    expect(assignmentPlacement('stopped', undefined)).toEqual({ section: 'resolved' });
    expect(assignmentPlacement('idle', undefined)).toEqual({ section: 'idle' });
  });

  it('turns a report that waits on someone into needs-input with its reason', () => {
    expect(assignmentPlacement('idle', 'waiting-human')).toEqual({
      section: 'needs-input',
      needs: 'waiting-human',
    });
    expect(assignmentPlacement('idle', 'blocked')).toEqual({
      section: 'needs-input',
      needs: 'blocked',
    });
    expect(assignmentPlacement('idle', 'failed')).toEqual({
      section: 'needs-input',
      needs: 'failed',
    });
    expect(assignmentPlacement('idle', 'completed')).toEqual({ section: 'idle' });
    expect(assignmentPlacement('idle', 'progress')).toEqual({ section: 'idle' });
  });

  it('keeps running work out of needs-input', () => {
    expect(assignmentPlacement('working', 'completed')).toEqual({ section: 'working' });
    expect(needsWork('working')).toBe(true);
    expect(needsWork('needs-input')).toBe(true);
    expect(needsWork('idle')).toBe(false);
    expect(needsWork('resolved')).toBe(false);
  });

  it('drops settled rows when only working is asked for', () => {
    const model = board({
      assignments: [
        assignment({ sessionId: 'run', activity: 'working' }),
        assignment({ sessionId: 'wait', activity: 'error', botSlug: 'bob' }),
        assignment({ sessionId: 'stop', activity: 'stopped', botSlug: 'cy' }),
        assignment({ sessionId: 'rest', activity: 'idle', botSlug: 'cy' }),
      ],
      prefs: { onlyWorking: true },
    });
    expect(
      model.groups.flatMap((group) => group.assignments.map((card) => card.sessionId)),
    ).toEqual(['run', 'wait']);
  });

  it('flags a row whose session the client cannot reach', () => {
    const model = board({
      assignments: [
        assignment({ sessionId: 'a1' }),
        assignment({ sessionId: 'a2', botSlug: 'bob' }),
      ],
      availableSessionIds: new Set(['a1']),
    });
    const cards = model.groups.flatMap((group) => group.assignments);
    expect(cards.find((card) => card.sessionId === 'a1')?.unavailable).toBeUndefined();
    expect(cards.find((card) => card.sessionId === 'a2')?.unavailable).toBe(true);
  });

  it('carries a timeline failure next to the retained card', () => {
    const model = board({
      assignments: [assignment({ sessionId: 'a1' })],
      work: { a1: { error: 'bridge refused' } },
    });
    const card = model.groups[0]?.assignments[0];
    expect(card?.workError).toBe('bridge refused');
    expect(card?.progress).toBeUndefined();
    expect(card?.title).toBe('work a1');
  });
});

function memoryStorage(seed?: string): ConfigStorage {
  const values = new Map<string, string>();
  if (seed !== undefined) values.set(TASK_BOARD_PREFS_KEY, seed);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('prefs persistence', () => {
  it('starts from the ruled defaults and remembers nothing yet', () => {
    const prefs = createTaskBoardPrefs(memoryStorage());
    expect(prefs.getSnapshot()).toEqual(EMPTY_TASK_BOARD_PREFS);
    expect(prefs.getSnapshot().showDoneSteps).toBe(true);
    expect(prefs.getSnapshot().autoExpandWorking).toBe(false);
    expect(prefs.getSnapshot().onlyWorking).toBe(false);
    expect(prefs.isOpen('chan-1')).toBe(false);
    expect(prefs.isBotCollapsed('ada')).toBeUndefined();
  });

  it('falls back to the defaults on corrupt or foreign content', () => {
    for (const seed of ['{not json', 'null', '[]', '"text"', '5']) {
      const prefs = createTaskBoardPrefs(memoryStorage(seed));
      expect(prefs.getSnapshot()).toEqual(EMPTY_TASK_BOARD_PREFS);
      expect(prefs.isOpen('chan-1')).toBe(false);
    }
  });

  it('drops entries whose keys or values are not usable', () => {
    const seed = JSON.stringify({
      openByChannel: { good: true, bad: 'yes', '': true, ['x'.repeat(201)]: false },
      collapsedBots: { ada: false, bob: 1 },
      showDoneSteps: 'true',
      autoExpandWorking: null,
      onlyWorking: false,
    });
    const prefs = createTaskBoardPrefs(memoryStorage(seed));
    expect(prefs.isOpen('good')).toBe(true);
    expect(prefs.isOpen('bad')).toBe(false);
    expect(prefs.isBotCollapsed('ada')).toBe(false);
    expect(prefs.isBotCollapsed('bob')).toBeUndefined();
    expect(prefs.getSnapshot().showDoneSteps).toBe(true);
    expect(prefs.getSnapshot().autoExpandWorking).toBe(false);
  });

  it('reads stored booleans instead of overwriting them with defaults', () => {
    const seed = JSON.stringify({ showDoneSteps: false, autoExpandWorking: true });
    const prefs = createTaskBoardPrefs(memoryStorage(seed));
    expect(prefs.getSnapshot().showDoneSteps).toBe(false);
    expect(prefs.getSnapshot().autoExpandWorking).toBe(true);
  });

  it('round-trips per channel open state and per bot collapse', () => {
    const storage = memoryStorage();
    const first = createTaskBoardPrefs(storage);
    first.setOpen('chan-a', true);
    first.setBotCollapsed('ada', false);
    first.setOnlyWorking(true);
    const second = createTaskBoardPrefs(storage);
    expect(second.isOpen('chan-a')).toBe(true);
    expect(second.isOpen('chan-b')).toBe(false);
    expect(second.isBotCollapsed('ada')).toBe(false);
    expect(second.isBotCollapsed('bob')).toBeUndefined();
    expect(second.getSnapshot().onlyWorking).toBe(true);
    expect(second.viewPrefs()).toEqual({
      collapsedBots: { ada: false },
      showDoneSteps: true,
      autoExpandWorking: false,
      onlyWorking: true,
    });
  });

  it('keeps only the most recent 200 channels and bots', () => {
    const prefs = createTaskBoardPrefs(memoryStorage());
    for (let index = 0; index < 205; index += 1) {
      prefs.setOpen(`chan-${String(index)}`, true);
      prefs.setBotCollapsed(`bot-${String(index)}`, true);
    }
    const snapshot = prefs.getSnapshot();
    expect(Object.keys(snapshot.openByChannel)).toHaveLength(200);
    expect(snapshot.openByChannel['chan-4']).toBeUndefined();
    expect(snapshot.openByChannel['chan-204']).toBe(true);
    expect(Object.keys(snapshot.collapsedBots)).toHaveLength(200);
    expect(snapshot.collapsedBots['bot-4']).toBeUndefined();
  });

  it('notifies listeners on real changes only', () => {
    let changes = 0;
    const prefs = createTaskBoardPrefs(memoryStorage());
    const stop = prefs.subscribe(() => {
      changes += 1;
    });
    prefs.setOpen('chan-a', true);
    prefs.setOpen('chan-a', true);
    prefs.setOnlyWorking(false);
    prefs.setOnlyWorking(true);
    stop();
    prefs.setOpen('chan-a', false);
    expect(changes).toBe(2);
  });
});
