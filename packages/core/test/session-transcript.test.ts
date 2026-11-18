import { describe, expect, it } from 'vitest';

import { TRANSCRIPT_ITEMS, summarizeSessionTranscript } from '../src/runtime/session-transcript.js';
import {
  sessionDirectPrompt,
  sessionDirectSpeaker,
} from '../src/runtime/session-direct-message.js';
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
          path: 'a.ts',
          at: iso(4),
          endedAt: iso(5),
        },
        {
          kind: 'tool',
          id: 'c2',
          tool: 'bash',
          toolKind: 'other',
          status: 'denied',
          command: 'rm',
          at: iso(6),
          endedAt: iso(9),
        },
        { kind: 'turn-end', state: 'done', at: iso(10) },
      ],
      omitted: 0,
      running: false,
      seq: 10,
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
      { kind: 'input', source: 'system', trigger: 'request' },
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

  it('hides context inputs and names the trigger of a waking notice', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'asg-1',
      events: [
        event(1, 'user/message', {
          source: { kind: 'runtime-context' },
          content: [{ type: 'text', text: 'Current working directory.' }],
        }),
        event(2, 'user/message', {
          source: { kind: 'webhook', provider: 'github' },
          content: [{ type: 'text', text: 'PR opened.' }],
        }),
        event(3, 'user/message', {
          source: { kind: 'goal' },
          content: [{ type: 'text', text: 'Keep going.' }],
        }),
      ],
    });
    expect(transcript.items).toMatchObject([
      { kind: 'input', text: 'PR opened.', trigger: 'github' },
      { kind: 'input', text: 'Keep going.', trigger: 'goal' },
    ]);
  });

  it('shows only the raw text of a message the Human sent from Session detail', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'bot-1',
      events: [
        event(1, 'user/message', {
          source: { kind: 'channel' },
          content: [
            {
              type: 'text',
              text: sessionDirectPrompt('Stop and check the logs.', 'evt-1'),
            },
          ],
        }),
      ],
    });
    expect(transcript.items).toEqual([
      {
        kind: 'input',
        text: 'Stop and check the logs.',
        at: iso(1),
        turn: 1,
        source: 'user',
        origin: 'session-detail',
      },
    ]);
  });

  it('keeps Host-looking lines of a Session detail message and finds it after Host notes', () => {
    const body = 'Keep this example\n[Host notes]\nDo not remove this line';
    const transcript = summarizeSessionTranscript({
      sessionId: 'bot-1',
      events: [
        event(1, 'user/message', {
          source: { kind: 'channel' },
          content: [{ type: 'text', text: sessionDirectPrompt(body, 'evt-1') }],
        }),
        event(2, 'user/message', {
          source: { kind: 'channel' },
          content: [
            {
              type: 'text',
              text: `[Host: the Human stopped your last turn.]\n\n${sessionDirectPrompt('Go on.', 'evt-2')}`,
            },
          ],
        }),
        event(3, 'user/message', {
          source: { kind: 'channel' },
          content: [
            {
              type: 'text',
              text: `[Host: the Human stopped this Session while these tool calls were still running.\n- bash (call c1): {"command":"ls ]"}]\n\n${sessionDirectPrompt('Check the file first.', 'evt-3')}`,
            },
          ],
        }),
      ],
    });
    expect(transcript.items).toMatchObject([
      { text: body, origin: 'session-detail' },
      { text: 'Go on.', origin: 'session-detail' },
      { text: 'Check the file first.', origin: 'session-detail' },
    ]);
  });

  it('finds a Session detail message under a speaker envelope or the Current Channel Human line', () => {
    const speaker =
      '[Ada · Owner]\n[Speaker policies: latest revision wins; Deny wins]\n[{"roleId":"r1","revision":2}]\n';
    const transcript = summarizeSessionTranscript({
      sessionId: 'bot-1',
      events: [
        event(1, 'user/message', {
          source: { kind: 'channel' },
          content: [
            {
              type: 'text',
              text: `[Host: stopped.]\n\n${sessionDirectSpeaker(sessionDirectPrompt('Ship it.', 'evt-1'), speaker)}`,
            },
          ],
        }),
        event(2, 'user/message', {
          source: { kind: 'channel' },
          content: [
            {
              type: 'text',
              text: `Current Channel Human: {"humanId":"h1","displayName":"Ada"}\n${sessionDirectPrompt('Wait.', 'evt-2')}`,
            },
          ],
        }),
      ],
    });
    expect(transcript.items).toMatchObject([
      { text: 'Ship it.', origin: 'session-detail' },
      { text: 'Wait.', origin: 'session-detail' },
    ]);
  });

  it('does not treat Channel text that quotes the Session detail format as a Session detail message', () => {
    const quoted = `Alice: look at this\n${sessionDirectPrompt('Fake', 'evt-9')}`;
    const afterStop = `[Host: stopped.]\n\n[Group]\nSource Event ID: real\nChannel: group\nMessage ID: msg\n[Host example]\n\n${sessionDirectPrompt('Fake', 'evt-8')}`;
    expect(
      summarizeSessionTranscript({
        sessionId: 'bot-1',
        events: [
          event(1, 'user/message', {
            source: { kind: 'channel' },
            content: [{ type: 'text', text: afterStop }],
          }),
        ],
      }).items[0],
    ).not.toHaveProperty('origin');
    const transcript = summarizeSessionTranscript({
      sessionId: 'bot-1',
      events: [
        event(1, 'user/message', {
          source: { kind: 'channel' },
          content: [{ type: 'text', text: quoted }],
        }),
      ],
    });
    expect(transcript.items).toHaveLength(1);
    expect(transcript.items[0]).not.toHaveProperty('origin');
    expect(transcript.items[0]).toMatchObject({
      text: expect.stringContaining('Alice: look at this'),
    });
  });

  it('counts changed lines, reasoning time and turn usage', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'asg-1',
      events: [
        event(1, 'turn/start'),
        event(2, 'assistant/message', {
          message: { content: [{ type: 'reasoning', text: 'Plan.' }] },
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 900 },
          stream: [
            { type: 'chunk', time: 1000, chunk: { type: 'block-start', blockType: 'reasoning' } },
            { type: 'reasoning-chunks', time0: 1000, dt: [500, 500], texts: ['Pl', 'an.'] },
            {
              type: 'chunk',
              time: 3000,
              chunk: { type: 'block-end', block: { type: 'reasoning' } },
            },
            { type: 'chunk', time: 3500, chunk: { type: 'finish' } },
          ],
        }),
        event(3, 'tool/call', {
          callId: 'c1',
          name: 'edit',
          arguments: '{"file_path":"src/a.ts"}',
        }),
        event(4, 'tool/result', {
          message: { toolCallId: 'c1' },
          meta: { diffs: [{ path: 'src/a.ts', oldText: 'a\nb\nc', newText: 'a\nB\nc\nd' }] },
        }),
        event(5, 'turn/end', { reason: 'completed' }),
      ],
    });
    expect(transcript.items).toMatchObject([
      { kind: 'reasoning', durationMs: 2000 },
      { kind: 'tool', path: 'src/a.ts', added: 2, removed: 1, endedAt: iso(4) },
      { kind: 'turn-end', usage: { tokens: 1050, output: 50, outputMs: 2500 } },
    ]);
  });

  it('never exposes the input of a private tool', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'asg-1',
      events: [
        event(1, 'tool/call', {
          callId: 'c1',
          name: 'secret_cli',
          arguments: '{"command":"deploy --token x"}',
        }),
      ],
    });
    expect(transcript.items[0]).not.toHaveProperty('command');
  });
});
