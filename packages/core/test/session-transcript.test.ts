import { describe, expect, it, vi } from 'vitest';
import {
  SESSION_FORMAT_VERSION,
  SessionId,
  SessionLogOffset,
  SessionSeq,
  type SessionHeader,
} from '@deepseek-ai/dsh-session';
import type { SessionQueryEngine } from '@deepseek-ai/dsh-session-query';

import {
  TRANSCRIPT_ITEMS,
  readSessionTitles,
  sessionDisplayTitle,
  summarizeSessionTranscript,
} from '../src/runtime/session-transcript.js';
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

  it('uses the recorded assistant source when an older turn changed models', () => {
    const first = { provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
    const second = { provider: 'openrouter', model: 'deepseek-v4.1-flash' };
    const reply = (seq: number, source: typeof first, text: string) =>
      event(seq, 'assistant/message', { message: { source, content: [{ type: 'text', text }] } });
    const transcript = summarizeSessionTranscript({
      sessionId: 'existing-session',
      events: [event(1, 'turn/start'), reply(2, first, 'Started'), reply(3, second, 'Finished')],
    });
    const firstTarget = { kind: 'dsh', ...first };
    const secondTarget = { kind: 'dsh', ...second };
    expect(transcript.items).toMatchObject([
      { kind: 'reply', text: 'Started', turnTargets: [firstTarget] },
      { kind: 'reply', text: 'Finished', turnTargets: [firstTarget, secondTarget] },
    ]);
  });

  it('places one marker per changed Turn and carries the Routing Group quota reason', () => {
    const codex = { kind: 'engine', engine: 'codex', model: 'gpt-6.2-sol' } as const;
    const opus = { kind: 'engine', engine: 'claude', model: 'claude-opus-5-5' } as const;
    const flash = { kind: 'dsh', provider: 'opencode-go', model: 'deepseek-v4.1-flash' } as const;
    const events = [1, 2, 3, 4].flatMap((turn) => [
      event(turn * 3, 'turn/start', { turn }),
      say(turn * 3 + 1, [{ type: 'text', text: 'Reply' }]),
      event(turn * 3 + 2, 'turn/end', { reason: 'completed' }),
    ]);
    const result = summarizeSessionTranscript({
      sessionId: 'switches',
      events,
      segments: [
        { turn: 1, step: 0, request: 'one', target: codex },
        { turn: 2, step: 0, request: 'two', target: codex },
        { turn: 3, step: 0, request: 'three', target: opus },
        { turn: 4, step: 0, request: 'four', target: flash, switchReason: 'quota' },
      ],
    });
    expect(result.items.filter(({ kind }) => kind === 'model-switch')).toEqual([
      { kind: 'model-switch', at: iso(9), from: codex, to: opus },
      { kind: 'model-switch', at: iso(12), from: opus, to: flash, reason: 'quota' },
    ]);
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
              text: `[Host: stopped.]\n\n${sessionDirectSpeaker(sessionDirectPrompt('Ship it.', 'evt-1'), 'evt-1', speaker)}`,
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
        event(3, 'user/message', {
          source: { kind: 'channel' },
          content: [
            {
              type: 'text',
              text: `Current Channel Human: {"humanId":"h1","displayName":"Ada"}\n[Host: your earlier turn for the message below stopped before it finished.]\n\n${sessionDirectPrompt('Go on.', 'evt-3')}`,
            },
          ],
        }),
        event(4, 'user/message', {
          source: { kind: 'user' },
          content: [
            { type: 'text', text: sessionDirectPrompt('Steer now.', 'evt-4') },
            { type: 'text', text: '[Host reply transport reminder] Use bot_send_message.' },
          ],
        }),
        event(5, 'user/message', {
          source: { kind: 'user' },
          content: [
            {
              type: 'text',
              text: `${sessionDirectPrompt('With context.', 'evt-5')}\n\n[Bot Inbox: pending DM context]\nChannel: dm\n- Message m1 [Source Event e1] from Human at now: earlier`,
            },
          ],
        }),
      ],
    });
    expect(transcript.items).toMatchObject([
      { text: 'Ship it.', origin: 'session-detail' },
      { text: 'Wait.', origin: 'session-detail' },
      { text: 'Go on.', origin: 'session-detail' },
      { text: 'Steer now.', origin: 'session-detail' },
      { text: 'With context.', origin: 'session-detail' },
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

  it('shows an inbound Human DM as its body with the envelope kept as metadata', () => {
    const transcript = summarizeSessionTranscript({
      sessionId: 'orc-1',
      events: [
        event(1, 'turn/start'),
        event(2, 'user/message', {
          source: { kind: 'user' },
          content: [
            {
              type: 'text',
              text: '[Human DM]\nSource Event ID: evt-1\nChannel: dm-bot-1\nMessage ID: human-1\nWhat is 17 times 23?',
            },
          ],
        }),
      ],
    });
    expect(transcript.items[0]).toMatchObject({
      kind: 'input',
      source: 'user',
      text: 'What is 17 times 23?',
      envelope: { kind: 'human-dm', channelId: 'dm-bot-1', messageId: 'human-1' },
    });
  });

  it('projects the Human DM separately from the Inbox context and shows an Inbox-only wake as system input', () => {
    const inbox =
      '[Open Inbox] 1 item you have seen but not resolved.\n- [Source Event event-1] Channel "Release QA": Prior request. Status: Assignment "Review" done.';
    const input = (seq: number, text: string) =>
      event(seq, 'user/message', { source: { kind: 'user' }, content: [{ type: 'text', text }] });
    const events = [
      input(1, `[Host: the Human stopped this Session.]\n\n${inbox}`),
      input(
        2,
        `[Human DM]\nSource Event ID: event-2\nChannel: dm-ada\nMessage ID: message-2\nReview the release checklist.\n\n${inbox}`,
      ),
    ];
    const transcript = summarizeSessionTranscript({ sessionId: 'orc-1', events });
    expect(transcript.items).toMatchObject([
      { kind: 'input', source: 'system', envelope: { kind: 'inbox' }, text: inbox },
      {
        kind: 'input',
        source: 'user',
        envelope: { kind: 'human-dm' },
        text: 'Review the release checklist.',
      },
    ]);
    expect(sessionDisplayTitle(events.slice(0, 1))).toBeUndefined();
    expect(
      sessionDisplayTitle([
        ...events,
        event(3, 'session/title', { title: '[Open Inbox] 1 item', source: { kind: 'fallback' } }),
      ]),
    ).toBe('Review the release checklist.');
    expect(
      sessionDisplayTitle([
        ...events,
        event(3, 'session/title', { title: 'Release sign-off', source: { kind: 'user' } }),
      ]),
    ).toBe('Release sign-off');
  });
});

it('bounds fallback Session log reads and keeps snapshot titles and successful fallback titles', async () => {
  const header = (id: SessionId): SessionHeader => ({
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: at(0),
    isSeeded: false,
  });
  const title = (text: string) => ({
    title: text,
    messageSeqs: [],
    source: { kind: 'fallback' as const },
    eventSeq: SessionSeq(1),
    updatedAt: at(1),
  });
  const readTitleSnapshots: SessionQueryEngine['readTitleSnapshots'] = async (ids) =>
    ids.map((id) =>
      id === 'missing-snapshot'
        ? { status: 'rejected', sessionId: id, reason: new Error('missing') }
        : {
            status: 'fulfilled',
            sessionId: id,
            value: {
              session: header(id),
              ...(id === 'cached'
                ? { title: title('Cached title') }
                : id === 'first'
                  ? { title: title('[Bot Inbox] Internal envelope') }
                  : {}),
            },
          },
    );
  let inFlight = 0;
  let peak = 0;
  const readSession = vi.fn<SessionQueryEngine['readSession']>(async (id) => {
    peak = Math.max(peak, ++inFlight);
    await Promise.resolve();
    inFlight--;
    if (id === 'failed') throw new Error('log unavailable');
    return {
      session: header(id),
      inheritedEventCount: SessionLogOffset(0),
      events: [
        {
          type: 'session/title',
          time: at(1),
          seq: SessionSeq(1),
          data: title(`Title ${id}`),
        },
      ],
    };
  });
  const ids = ['cached', 'first', 'failed', 'third', 'fourth', 'last', 'missing-snapshot'];
  const result = await readSessionTitles({ readTitleSnapshots, readSession }, ids);
  expect(peak).toBe(4);
  expect(readSession.mock.calls.flat()).toEqual(ids.slice(1, -1));
  expect(Object.fromEntries(result)).toEqual({
    cached: 'Cached title',
    first: 'Title first',
    third: 'Title third',
    fourth: 'Title fourth',
    last: 'Title last',
  });
});
