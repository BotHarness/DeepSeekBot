import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_ITEMS, summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

const at = (seq: number) => Date.UTC(2026, 10, 17, 0, 0, seq);
const iso = (seq: number) => new Date(at(seq)).toISOString();
const event = (seq: number, type: string, data: unknown = {}): DshSessionEvent => ({
  type,
  seq,
  time: at(seq),
  data,
});
const say = (seq: number, content: unknown[]) =>
  event(seq, 'assistant/message', { message: { role: 'assistant', content } });

describe('Session transcript', () => {
  it('lists the instruction, reasoning, replies and public tool steps in order', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'asg-1',
      events: [
        event(1, 'turn/start'),
        event(2, 'user/message', {
          source: { kind: 'user' },
          content: [
            {
              type: 'text',
              text: 'Fix the Safari export button.\n\n[Host Assignment report transport] ## Report delivery contract\nCall report_to_orchestrator.',
            },
          ],
        }),
        say(3, [
          { type: 'reasoning', text: 'Look at the handler first.' },
          { type: 'text', text: 'Reading the button.' },
          { type: 'tool-call', id: 'c1', name: 'read_file', arguments: '{"path":"a.ts"}' },
        ]),
        event(4, 'tool/call', { callId: 'c1', name: 'read_file', arguments: '{"path":"a.ts"}' }),
        event(5, 'tool/result', { message: { toolCallId: 'c1' } }),
        event(6, 'tool/call', { callId: 'c2', name: 'bash', arguments: '{"command":"rm"}' }),
        event(7, 'approval/asked', { id: 'p1', callId: 'c2' }),
        event(8, 'approval/decided', { id: 'p1', outcome: 'rejected' }),
        event(9, 'tool/result', { message: { toolCallId: 'c2', isError: true } }),
        event(10, 'turn/end', { reason: 'completed' }),
      ],
      describe: (_session, name) =>
        name === 'read_file' ? { kind: 'read', detail: 'a.ts' } : undefined,
    });
    expect(transcript).toEqual({
      items: [
        {
          kind: 'input',
          text: 'Fix the Safari export button.',
          at: iso(2),
          turn: 1,
          source: 'user',
        },
        { kind: 'reasoning', text: 'Look at the handler first.', at: iso(3) },
        { kind: 'reply', text: 'Reading the button.', at: iso(3) },
        {
          kind: 'tool',
          id: 'c1',
          tool: 'read_file',
          toolKind: 'read',
          status: 'done',
          detail: 'a.ts',
          at: iso(4),
        },
        {
          kind: 'tool',
          id: 'c2',
          tool: 'bash',
          toolKind: 'other',
          status: 'denied',
          at: iso(6),
        },
        { kind: 'turn-end', state: 'done', at: iso(10) },
      ],
      omitted: 0,
      running: false,
    });
  });

  it('reports a running turn and keeps its open tool running', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'asg-1',
      events: [
        event(1, 'turn/start'),
        event(2, 'tool/call', { callId: 'c1', name: 'bash', arguments: '{}' }),
      ],
    });
    expect(transcript.running).toBe(true);
    expect(transcript.items).toMatchObject([{ kind: 'tool', status: 'running' }]);
  });

  it('marks a system input and cancels open tools when the turn aborts', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'asg-1',
      events: [
        event(1, 'turn/start'),
        event(2, 'user/message', {
          source: { kind: 'wake' },
          content: [{ type: 'text', text: 'Subagent finished.' }],
        }),
        event(3, 'tool/call', { callId: 'c1', name: 'bash', arguments: '{}' }),
        event(4, 'turn/end', { reason: { kind: 'aborted' } }),
      ],
    });
    expect(transcript.items).toMatchObject([
      { kind: 'input', source: 'system' },
      { kind: 'tool', status: 'cancelled' },
      { kind: 'turn-end', state: 'cancelled' },
    ]);
  });

  it('keeps the newest items and counts the rest', () => {
    const events = Array.from({ length: TRANSCRIPT_ITEMS + 3 }, (_, index) =>
      say(index + 1, [{ type: 'text', text: `Step ${index}` }]),
    );
    const transcript = summarizeSessionTranscript({ sessionId: 'asg-1', events });
    expect(transcript.items).toHaveLength(TRANSCRIPT_ITEMS);
    expect(transcript.omitted).toBe(3);
    expect(transcript.items[0]).toMatchObject({ text: 'Step 3' });
  });
});
