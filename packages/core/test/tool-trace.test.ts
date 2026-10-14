import { describe, expect, it } from 'vitest';

import type { DshSessionEvent } from '../src/sessions/source.js';
import { summarizeToolTrace } from '../src/bots/tool-trace.js';

let seq = 0;
const event = (type: string, data: unknown): DshSessionEvent => ({
  type,
  seq: ++seq,
  time: 1_000 + seq,
  data,
});

const text = (value: string) => [{ type: 'text', text: value }];

function log(): DshSessionEvent[] {
  seq = 0;
  return [
    event('turn/start', { turn: 1 }),
    event('tool/call', {
      turn: 1,
      step: 1,
      callId: 'c1',
      name: 'browser_open',
      arguments: JSON.stringify({ url: 'https://example.com' }),
    }),
    event('tool/result', {
      turn: 1,
      step: 1,
      message: { toolCallId: 'c1', content: text('Opened https://example.com/ — Example Domain') },
    }),
    event('turn/end', { turn: 1, reason: { kind: 'completed' } }),
    event('turn/start', { turn: 2 }),
    event('tool/call', {
      turn: 2,
      step: 1,
      callId: 'c2',
      name: 'bash',
      arguments: JSON.stringify({ command: 'rm -rf /tmp/x' }),
    }),
    event('approval/asked', { id: 'a1', toolName: 'bash', callId: 'c2' }),
    event('approval/decided', { id: 'a1', outcome: 'rejected' }),
    event('tool/result', {
      turn: 2,
      step: 1,
      message: {
        toolCallId: 'c2',
        isError: true,
        content: text('Error: Human approval was rejected'),
      },
    }),
    event('tool/call', {
      turn: 2,
      step: 2,
      callId: 'c3',
      name: 'secret_cli',
      arguments: JSON.stringify({
        program: 'gh',
        args: ['auth', 'token'],
        env: { TOKEN: '{{GH}}' },
      }),
    }),
    event('tool/result', {
      turn: 2,
      step: 2,
      message: { toolCallId: 'c3', isError: true, content: text('ghp_secret-output') },
    }),
    event('tool/call', {
      turn: 2,
      step: 3,
      callId: 'c4',
      name: 'browser_observe',
      arguments: '{}',
    }),
    event('turn/end', { turn: 2, reason: { kind: 'completed' } }),
    event('turn/start', { turn: 3 }),
    event('assistant/message', { text: 'Hello' }),
    event('turn/end', { turn: 3, reason: { kind: 'completed' } }),
  ];
}

describe('Bot tool-call trace', () => {
  it('pairs calls with results and approvals per turn, newest last', () => {
    const trace = summarizeToolTrace(log(), { turns: 3 });
    expect(trace.turns.map((turn) => [turn.turn, turn.calls.length, turn.noToolCalls])).toEqual([
      [1, 1, false],
      [2, 3, false],
      [3, 0, true],
    ]);
    expect(trace.turns[0]!.calls[0]).toEqual({
      name: 'browser_open',
      callId: 'c1',
      args: { url: 'https://example.com' },
      outcome: 'ok',
      result: 'Opened https://example.com/ — Example Domain',
    });
    expect(trace.turns[1]!.calls[0]).toMatchObject({
      name: 'bash',
      outcome: 'denied',
      approval: 'rejected',
      result: 'Error: Human approval was rejected',
    });
    expect(trace.turns[1]!.calls[2]).toMatchObject({ name: 'browser_observe', outcome: 'pending' });
    expect(trace.turns[2]).toMatchObject({ endReason: 'completed' });
  });

  it('never returns secret tool arguments or output', () => {
    const trace = summarizeToolTrace(log(), { turns: 2 });
    const secret = trace.turns[0]!.calls.find((call) => call.name === 'secret_cli')!;
    expect(secret).toMatchObject({ args: '[redacted]', result: '[redacted]', outcome: 'error' });
    expect(JSON.stringify(trace)).not.toContain('ghp_secret');
    expect(JSON.stringify(trace)).not.toContain('{{GH}}');
  });

  it('keeps only the newest turns and bounds long values', () => {
    seq = 0;
    const long = 'x'.repeat(5_000);
    const events = [
      ...log(),
      event('turn/start', { turn: 4 }),
      event('tool/call', {
        turn: 4,
        step: 1,
        callId: 'c9',
        name: 'browser_type',
        arguments: JSON.stringify({ ref: 'e1', text: long }),
      }),
      event('tool/result', {
        turn: 4,
        step: 1,
        message: { toolCallId: 'c9', content: text(long) },
      }),
    ];
    const trace = summarizeToolTrace(events, { turns: 1 });
    expect(trace.turns.map((turn) => turn.turn)).toEqual([4]);
    const call = trace.turns[0]!.calls[0]!;
    expect(JSON.stringify(call.args).length).toBeLessThan(400);
    expect(call.result.length).toBeLessThanOrEqual(301);
    expect(trace.turns[0]!.endReason).toBeUndefined();
  });
});
