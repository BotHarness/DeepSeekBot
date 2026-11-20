import { describe, expect, it } from 'vitest';

import { PROGRESS_TODOS, summarizeSessionProgress } from '../src/runtime/session-progress.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

const at = (seq: number) => Date.UTC(2026, 10, 17, 0, 0, seq);
const event = (seq: number, type: string, data: unknown = {}): DshSessionEvent => ({
  type,
  seq,
  time: at(seq),
  data,
});
const goal = (seq: number, operation: string, fields: Record<string, unknown> = {}) =>
  event(seq, 'goal/change', {
    kind: 'goal/change',
    version: 1,
    operation,
    goal: {
      id: 'g1',
      revision: seq,
      objective: 'Ship the export fix',
      phase: 'active',
      maxGoalRounds: 256,
      ...fields,
    },
    roundsStarted: 3,
    createdAt: at(1),
    updatedAt: at(seq),
  });
const todos = (seq: number, items: [string, string][]) =>
  event(seq, 'todo/write', { todos: items.map(([content, status]) => ({ content, status })) });

describe('Session progress', () => {
  it('reports the latest goal and the current turn to-do list', () => {
    const progress = summarizeSessionProgress([
      event(1, 'turn/start', { turn: 1 }),
      goal(2, 'create'),
      todos(3, [
        ['Reproduce', 'completed'],
        ['Fix', 'in_progress'],
        ['Test', 'pending'],
      ]),
      todos(4, [
        ['Reproduce', 'completed'],
        ['Fix', 'completed'],
        ['Test', 'in_progress'],
      ]),
    ]);
    expect(progress).toEqual({
      goal: {
        objective: 'Ship the export fix',
        phase: 'active',
        roundsStarted: 3,
        maxGoalRounds: 256,
      },
      todos: [
        { content: 'Reproduce', status: 'completed' },
        { content: 'Fix', status: 'completed' },
        { content: 'Test', status: 'in_progress' },
      ],
      lastEventAt: at(4),
    });
  });

  it('keeps a finished list after the turn ends and clears it when the next turn starts', () => {
    const finished = [
      event(1, 'turn/start'),
      todos(2, [['Fix', 'completed']]),
      event(3, 'turn/end'),
    ];
    expect(summarizeSessionProgress(finished).todos).toEqual([
      { content: 'Fix', status: 'completed' },
    ]);
    expect(summarizeSessionProgress([...finished, event(4, 'turn/start')]).todos).toBeUndefined();
  });

  it('carries the blocked reason and drops a cleared goal', () => {
    const blocked = goal(2, 'block', {
      phase: 'blocked',
      blockedReason: { code: 'needs-human', message: 'Needs the Safari runner' },
    });
    expect(summarizeSessionProgress([blocked]).goal).toMatchObject({
      phase: 'blocked',
      blockedReason: 'Needs the Safari runner',
    });
    const cleared = event(3, 'goal/change', {
      kind: 'goal/change',
      version: 1,
      operation: 'clear',
      cleared: { id: 'g1', revision: 2 },
      clearedAt: at(3),
    });
    expect(summarizeSessionProgress([blocked, cleared]).goal).toBeUndefined();
  });

  it('ignores malformed payloads instead of guessing', () => {
    const progress = summarizeSessionProgress([
      todos(1, [['Fix', 'in_progress']]),
      event(2, 'todo/write', { todos: [{ content: 'Bad', status: 'done' }] }),
      event(3, 'goal/change', {
        kind: 'goal/change',
        operation: 'create',
        goal: { phase: 'active' },
      }),
    ]);
    expect(progress.todos).toEqual([{ content: 'Fix', status: 'in_progress' }]);
    expect(progress.goal).toBeUndefined();
  });

  it('bounds the list and long text', () => {
    const many = Array.from({ length: PROGRESS_TODOS + 5 }, (_, index): [string, string] => [
      `Step ${index} ${'x'.repeat(400)}`,
      'pending',
    ]);
    const progress = summarizeSessionProgress([todos(1, many)]);
    expect(progress.todos).toHaveLength(PROGRESS_TODOS);
    expect(progress.todos?.[0]?.content.length).toBeLessThanOrEqual(280);
  });

  it('returns nothing for a Session without goal or to-dos', () => {
    expect(summarizeSessionProgress([])).toEqual({});
  });
});
