import { describe, expect, it } from 'vitest';

import { createBotStateTracker } from '../src/state/bot-state.js';
import {
  createDshActivityProjection,
  deriveSessionState,
  sessionStateForEvent,
} from '../src/state/dsh-activity.js';
import { createTestOwnership } from './helpers.js';

const event = (type: string) => ({ type, time: 1, data: {} });

describe('DSH activity projection', () => {
  it('maps state-bearing Session events and ignores the rest', () => {
    expect(sessionStateForEvent(event('tool/call'))).toBe('working');
    expect(sessionStateForEvent(event('step/start'))).toBe('thinking');
    expect(sessionStateForEvent(event('assistant/message'))).toBe('thinking');
    expect(sessionStateForEvent(event('tool/result'))).toBe('thinking');
    expect(sessionStateForEvent(event('turn/end'))).toBe('done');
    expect(sessionStateForEvent(event('request/header'))).toBeUndefined();
  });

  it('derives the last state-bearing event from a durable log', () => {
    expect(deriveSessionState([event('user/message'), event('tool/call')])).toBe('working');
    expect(deriveSessionState([event('tool/call'), event('turn/end')])).toBe('done');
    expect(deriveSessionState([event('request/header')])).toBeUndefined();
    expect(deriveSessionState([])).toBeUndefined();
  });

  it('keeps a Channel reply turn active until turn/end, without flickering idle between steps', () => {
    const states = createBotStateTracker();
    const ownership = createTestOwnership({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
    const activity = createDshActivityProjection({ ownership, states });
    const seen = (
      [
        ['turn/start', { turn: 1 }],
        ['step/start', {}],
        ['user/message', {}],
        ['assistant/message', {}],
        ['tool/call', { name: 'channel_send', callId: 'send' }],
        ['tool/result', { message: { toolCallId: 'send' } }],
        ['step/end', {}],
        ['step/start', {}],
        ['assistant/message', {}],
        ['tool/call', { name: 'write', callId: 'memory' }],
        ['tool/result', { message: { toolCallId: 'memory' } }],
        ['step/start', {}],
        ['assistant/message', {}],
        ['step/end', {}],
        ['turn/end', { turn: 1, reason: { kind: 'completed' } }],
      ] as const
    ).map(([type, data]) => {
      activity.handleSessionEvent('root', { type, time: 1, data });
      return states.snapshot('ada').state;
    });

    expect(seen.slice(0, -1)).not.toContain('idle');
    expect(seen.at(-1)).toBe('idle');
  });

  it('does not reopen activity for events DSH appends after turn/end', () => {
    const compaction = [
      event('compaction/start'),
      event('compaction/summary'),
      event('user/message'),
      event('compaction/end'),
    ];
    const log = [event('turn/start'), event('assistant/message'), event('turn/end'), ...compaction];
    expect(deriveSessionState(log)).toBe('done');
    expect(deriveSessionState([...log, event('turn/start')])).toBe('thinking');

    const states = createBotStateTracker();
    const ownership = createTestOwnership({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
    const activity = createDshActivityProjection({ ownership, states });
    for (const item of log) activity.handleSessionEvent('root', item);
    expect(states.snapshot('ada')).toMatchObject({ state: 'idle', sessions: { root: 'done' } });

    activity.rebuild([{ id: 'root', header: {}, snapshotEvents: () => log }]);
    expect(states.snapshot('ada')).toMatchObject({ state: 'idle', sessions: { root: 'done' } });

    activity.handleSessionEvent('root', event('turn/start'));
    expect(states.snapshot('ada').state).toBe('thinking');
  });

  it('keeps projecting a turn whose start it did not observe', () => {
    const states = createBotStateTracker();
    const ownership = createTestOwnership({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
    const activity = createDshActivityProjection({ ownership, states });
    activity.handleSessionEvent('root', event('tool/result'));
    expect(states.snapshot('ada').state).toBe('thinking');
  });

  it('attributes a fork and a Subagent to the owning parent through lineage', () => {
    const states = createBotStateTracker();
    const ownership = createTestOwnership({
      'root-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const activity = createDshActivityProjection({ ownership, states });

    expect(
      activity.handleAgentCreated({
        id: 'fork-1',
        header: { parentSession: 'root-1' },
        snapshotEvents: () => [],
      }),
    ).toBe(true);
    expect(ownership.resolve('fork-1')).toMatchObject({
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'root-1',
    });
    expect(
      activity.handleAgentCreated({
        id: 'subagent-1',
        header: { parentSession: 'fork-1', origin: 'subagent' },
        snapshotEvents: () => [],
      }),
    ).toBe(true);
    expect(ownership.resolve('subagent-1')).toMatchObject({
      provenance: 'subagent',
      parentSessionId: 'fork-1',
    });
    expect(ownership.descendantsOf('root-1').map((record) => record.sessionId)).toEqual([
      'fork-1',
      'subagent-1',
    ]);

    expect(
      activity.handleAgentCreated({ id: 'orphan', header: {}, snapshotEvents: () => [] }),
    ).toBe(false);
    expect(
      activity.handleAgentCreated({
        id: 'child-of-unowned',
        header: { parentSession: 'nobody' },
        snapshotEvents: () => [],
      }),
    ).toBe(false);
    expect(ownership.resolve('child-of-unowned')).toBeUndefined();
  });

  it('attributes lineage during a cold rebuild before deriving state', () => {
    const states = createBotStateTracker();
    const ownership = createTestOwnership({
      'root-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const activity = createDshActivityProjection({ ownership, states });

    const report = activity.rebuild([
      {
        id: 'subagent-1',
        header: { parentSession: 'root-1', origin: 'subagent' },
        snapshotEvents: () => [event('tool/call')],
      },
      { id: 'root-1', header: {}, snapshotEvents: () => [event('turn/end')] },
    ]);

    expect(report).toEqual({ rebuilt: 2, attributed: 1, unowned: 0 });
    expect(ownership.resolve('subagent-1')).toMatchObject({ provenance: 'subagent' });
    expect(states.snapshot('ada').sessions).toEqual({ 'root-1': 'done', 'subagent-1': 'working' });
  });
});

it('keeps each restored Session latest activity separate and updates only the matching row', () => {
  const states = createBotStateTracker();
  const ownership = createTestOwnership({
    first: { botSlug: 'ada', rootRole: 'assignment' },
    second: { botSlug: 'ada', rootRole: 'assignment' },
  });
  const projection = createDshActivityProjection({
    ownership,
    states,
    describeCall: (_id, name) => ({
      name,
      view: { card: 'generic', title: 'private title', kind: 'search' },
    }),
  });
  const call = (id: string) => ({
    type: 'tool/call',
    time: 1000,
    data: { name: 'search', callId: id, arguments: '{"query":"private query"}' },
  });
  projection.rebuild([
    { id: 'first', header: {}, snapshotEvents: () => [call('a')] },
    { id: 'second', header: {}, snapshotEvents: () => [call('b')] },
  ]);
  const before = states.sessionActivity('ada');
  expect(before).toHaveLength(2);
  expect(before.map((row) => row.role)).toEqual(['assignment', 'assignment']);
  expect(before.every((row) => row.activity?.sources?.[0]?.count === 1)).toBe(true);
  projection.handleSessionEvent('first', {
    type: 'tool/result',
    time: 2000,
    data: { message: { toolCallId: 'a', content: 'private result' } },
  });
  expect(states.sessionActivity('ada')[0]).toMatchObject({ id: before[0]?.id, state: 'thinking' });
  expect(states.sessionActivity('ada')[0]?.activity).toBeUndefined();
  expect(states.sessionActivity('ada')[1]).toEqual(before[1]);
  projection.handleSessionDisposed('first');
  projection.handleSessionDisposed('second');
  expect(states.sessionActivity('ada')).toEqual([]);
});

it('projects native Session titles on create, rename and rebuild without changing the active state or opaque identity', () => {
  const states = createBotStateTracker();
  const ownership = createTestOwnership({ task: { botSlug: 'ada', rootRole: 'assignment' } });
  const projection = createDshActivityProjection({ ownership, states });
  const title = (name: string | null) => ({
    type: 'session/title',
    time: 1,
    data: { title: name },
  });
  const session = {
    id: 'task',
    header: {},
    snapshotEvents: () => [title('Inspect layout'), event('step/start')],
  };
  projection.handleAgentCreated(session);
  projection.handleSessionEvent('task', event('step/start'));
  const first = states.sessionActivity('ada')[0];
  expect(first).toMatchObject({ name: 'Inspect layout', role: 'assignment', state: 'thinking' });
  projection.handleSessionEvent('task', title('Verify compact activity'));
  expect(states.sessionActivity('ada')[0]).toMatchObject({
    id: first?.id,
    name: 'Verify compact activity',
    state: 'thinking',
  });
  expect(states.version().revision).toBeGreaterThan(first?.revision ?? 0);
  projection.handleSessionEvent('task', title(null));
  expect(states.sessionActivity('ada')[0]?.name).toBeUndefined();
  projection.handleSessionEvent('task', title('bad\nname'));
  expect(states.sessionActivity('ada')[0]?.name).toBeUndefined();
  projection.rebuild([session]);
  expect(states.sessionActivity('ada')[0]).toMatchObject({
    id: first?.id,
    name: 'Inspect layout',
    state: 'thinking',
  });
  const cold = createBotStateTracker();
  createDshActivityProjection({ ownership, states: cold }).rebuild([session]);
  expect(cold.sessionActivity('ada')[0]).toMatchObject({
    name: 'Inspect layout',
    state: 'thinking',
  });
  projection.handleSessionDisposed('task');
  projection.handleSessionEvent('task', event('step/start'));
  expect(states.sessionActivity('ada')[0]?.name).toBeUndefined();
});
