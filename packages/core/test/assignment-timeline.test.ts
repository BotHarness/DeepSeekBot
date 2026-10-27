import { describe, expect, it } from 'vitest';

import {
  summarizeAssignmentTimeline,
  summarizeSubagentLanes,
  TIMELINE_LANE_ENTRIES,
  TIMELINE_SUBAGENTS,
} from '../src/runtime/assignment-timeline.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

function call(seq: number, callId: string, name: string, args: unknown): DshSessionEvent {
  return {
    type: 'tool/call',
    seq,
    time: Date.UTC(2026, 9, 27, 0, 0, seq),
    data: { turn: 1, callId, name, arguments: JSON.stringify(args) },
  };
}

function result(seq: number, callId: string, isError = false): DshSessionEvent {
  return {
    type: 'tool/result',
    seq,
    time: Date.UTC(2026, 9, 27, 0, 0, seq),
    data: {
      turn: 1,
      message: {
        toolCallId: callId,
        isError,
        content: [{ type: 'text', text: 'SECRET RESULT sk-123' }],
      },
    },
  };
}

describe('Assignment timeline', () => {
  it('groups the Assignment Agent as MAIN and Subagents as SUBAGENT 01, 02…', () => {
    const timeline = summarizeAssignmentTimeline({
      main: {
        sessionId: 'asg-1',
        events: [
          { type: 'turn/start', seq: 0, time: 0, data: { turn: 1 } },
          call(1, 'c1', 'read', { path: '/secret/plan.md' }),
          result(2, 'c1'),
          call(3, 'c2', 'bash', { command: 'rm -rf /tmp/x' }),
          result(4, 'c2', true),
          call(5, 'c3', 'browser_open', { url: 'https://example.com/?token=abc' }),
        ],
      },
      subagents: [
        {
          sessionId: 'sub-a',
          events: [
            { type: 'session/title', time: 1, data: { title: 'Check the docs' } },
            call(6, 'd1', 'grep', { pattern: 'password' }),
            result(7, 'd1'),
          ],
        },
        { sessionId: 'sub-b', events: [] },
      ],
      describe: (_sessionId, name) =>
        name === 'read'
          ? { kind: 'read' }
          : name === 'bash'
            ? { kind: 'execute' }
            : name === 'browser_open'
              ? { kind: 'fetch', detail: 'example.com' }
              : name === 'grep'
                ? { kind: 'search', detail: 'line\nbreak' }
                : undefined,
    });

    expect(timeline.omittedSubagents).toBe(0);
    expect(timeline.lanes.map((lane) => [lane.role, lane.index, lane.sessionId])).toEqual([
      ['main', 0, 'asg-1'],
      ['subagent', 1, 'sub-a'],
      ['subagent', 2, 'sub-b'],
    ]);
    expect(timeline.lanes[0]!.entries).toEqual([
      { status: 'done', kind: 'read', tool: 'read', at: '2026-10-27T00:00:01.000Z' },
      { status: 'failed', kind: 'execute', tool: 'bash', at: '2026-10-27T00:00:03.000Z' },
      {
        status: 'running',
        kind: 'fetch',
        tool: 'browser_open',
        detail: 'example.com',
        at: '2026-10-27T00:00:05.000Z',
      },
    ]);
    expect(timeline.lanes[1]).toMatchObject({
      title: 'Check the docs',
      entries: [{ status: 'done', kind: 'search', tool: 'grep' }],
    });
    expect(timeline.lanes[1]!.entries[0]).not.toHaveProperty('detail');
  });

  it('never carries raw tool input or output', () => {
    const timeline = summarizeAssignmentTimeline({
      main: {
        sessionId: 'asg-1',
        events: [
          call(1, 'c1', 'bash', { command: 'echo sk-123 > /root/key' }),
          result(2, 'c1'),
          call(3, 'c2', 'not a tool name!', { x: 'sk-123' }),
        ],
      },
      subagents: [],
    });
    const text = JSON.stringify(timeline);
    expect(text).not.toContain('sk-123');
    expect(text).not.toContain('/root/key');
    expect(text).not.toContain('SECRET RESULT');
    expect(timeline.lanes[0]!.entries).toEqual([
      { status: 'done', kind: 'other', tool: 'bash', at: '2026-10-27T00:00:01.000Z' },
    ]);
  });

  it('marks denied, cancelled and interrupted calls', () => {
    const timeline = summarizeAssignmentTimeline({
      main: {
        sessionId: 'asg-1',
        events: [
          call(1, 'c1', 'write', {}),
          { type: 'approval/asked', time: 2, data: { id: 'a1', callId: 'c1' } },
          { type: 'approval/decided', time: 3, data: { id: 'a1', outcome: 'rejected' } },
          result(4, 'c1', true),
          call(5, 'c2', 'write', {}),
          { type: 'approval/asked', time: 6, data: { id: 'a2', callId: 'c2' } },
          { type: 'approval/decided', time: 7, data: { id: 'a2', outcome: 'cancelled' } },
          result(8, 'c2', true),
          call(9, 'c3', 'bash', {}),
          { type: 'turn/end', time: 10, data: { turn: 1, reason: 'aborted' } },
        ],
      },
      subagents: [],
    });
    expect(timeline.lanes[0]!.entries.map((entry) => entry.status)).toEqual([
      'denied',
      'cancelled',
      'cancelled',
    ]);
  });

  it('reads each Subagent model route and run state without the request headers', () => {
    const { lanes } = summarizeSubagentLanes({
      subagents: [
        {
          sessionId: 'sub-a',
          events: [
            { type: 'turn/start', time: Date.UTC(2026, 9, 27, 0, 0, 1), data: { turn: 1 } },
            {
              type: 'request/header',
              time: Date.UTC(2026, 9, 27, 0, 0, 2),
              data: {
                header: {
                  authorization: 'Bearer sk-123',
                  config: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' },
                },
              },
            },
            {
              type: 'request/context',
              time: Date.UTC(2026, 9, 27, 0, 0, 3),
              data: { provider: 'deepseek', model: 'deepseek-v4' },
            },
          ],
        },
        {
          sessionId: 'sub-b',
          events: [
            { type: 'turn/start', time: 1, data: { turn: 1 } },
            { type: 'request/context', time: 2, data: { provider: 'openai', model: 'gpt-6' } },
            { type: 'turn/end', time: 3, data: { turn: 1, reason: { kind: 'completed' } } },
          ],
        },
        {
          sessionId: 'sub-c',
          events: [
            { type: 'turn/start', time: 1, data: { turn: 1 } },
            { type: 'turn/end', time: 2, data: { turn: 1, reason: { kind: 'error' } } },
          ],
        },
        {
          sessionId: 'sub-d',
          events: [
            { type: 'turn/start', time: 1, data: { turn: 1 } },
            { type: 'turn/end', time: 2, data: { turn: 1, reason: { kind: 'aborted' } } },
          ],
        },
        { sessionId: 'sub-e', events: [] },
      ],
    });
    expect(lanes.map((lane) => [lane.sessionId, lane.state, lane.route])).toEqual([
      ['sub-a', 'running', { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' }],
      ['sub-b', 'done', { provider: 'openai', model: 'gpt-6' }],
      ['sub-c', 'failed', undefined],
      ['sub-d', 'cancelled', undefined],
      ['sub-e', 'idle', undefined],
    ]);
    expect(lanes[0]).toMatchObject({
      role: 'subagent',
      index: 1,
      startedAt: '2026-10-27T00:00:01.000Z',
      updatedAt: '2026-10-27T00:00:03.000Z',
    });
    expect(JSON.stringify(lanes)).not.toContain('sk-123');
  });

  it('keeps the newest entries and Subagents within bounds', () => {
    const events = Array.from({ length: TIMELINE_LANE_ENTRIES + 5 }, (_, index) =>
      call(index + 1, `c${index}`, 'read', {}),
    );
    const timeline = summarizeAssignmentTimeline({
      main: { sessionId: 'asg-1', events },
      subagents: Array.from({ length: TIMELINE_SUBAGENTS + 2 }, (_, index) => ({
        sessionId: `sub-${index}`,
        events: [],
      })),
    });
    expect(timeline.lanes[0]!.entries).toHaveLength(TIMELINE_LANE_ENTRIES);
    expect(timeline.lanes[0]!.omitted).toBe(5);
    expect(timeline.lanes[0]!.entries[0]!.at).toBe('2026-10-27T00:00:06.000Z');
    expect(timeline.omittedSubagents).toBe(2);
    expect(timeline.lanes).toHaveLength(TIMELINE_SUBAGENTS + 1);
    expect(timeline.lanes[1]).toMatchObject({ index: 3, sessionId: 'sub-2' });
  });
});
