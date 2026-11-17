import { describe, expect, it } from 'vitest';
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session';

import { contextSources } from '../src/runtime/context-sources.js';

function event(seq: number, type: string, data: Record<string, unknown>): SessionEvent {
  return {
    seq,
    time: seq,
    type,
    data: { id: `m${String(seq)}`, ...data },
  } as unknown as SessionEvent;
}

const text = (value: string) => ({ type: 'text', text: value });

const events = [
  event(1, 'system/message', {
    message: { role: 'system', source: { kind: 'system-prompt' }, content: [text('You are Tob.')] },
  }),
  event(2, 'user/message', {
    source: { kind: 'user' },
    content: [
      text(
        [
          'Hello there',
          '',
          '[Bot Inbox] External mentions, due Bot Schedules, actionable Memory changes, Assignment reports, and Host lifecycle notices since your last turn.',
          '- Bot Schedule "Water" [Source Event 9; schedule s1; occurrence now; created by you] is due. Scheduled task: "Remind me".',
          '- assignment-1 (key fix-export, activity idle, repeats 0) reported [Source Event 10]: Done.',
          '- Memory change (event 11): notes.md changed.',
          '- Ada mentioned you in Team: "can you check this?"',
        ].join('\n'),
      ),
      text('[Host reply transport reminder] Reply with bot_send_message.'),
    ],
  }),
  event(3, 'user/message', { source: { kind: 'skill-catalog' }, content: [text('skills')] }),
  event(4, 'assistant/message', {
    message: {
      role: 'assistant',
      source: { kind: 'model' },
      content: [
        { type: 'reasoning', text: 'thinking about it' },
        text('Sure.'),
        { type: 'tool-call', id: 'c1', name: 'channel_read', arguments: '{"channel":"dm"}' },
      ],
    },
  }),
  event(5, 'tool/result', {
    message: {
      role: 'tool',
      source: { kind: 'tool', callId: 'c1' },
      content: [text('a long channel read result')],
    },
  }),
];

function surface(tokens: number[], totalTokens: number) {
  return {
    nodes: events.map((item, index) => ({ seq: item.seq, tokens: tokens[index]! })),
    totalTokens,
    eventAt: (seq: SessionSeq) => events.find((item) => item.seq === seq),
  };
}

describe('context sources', () => {
  it('splits the surface by where each part came from and keeps the total', () => {
    const rows = contextSources(surface([1000, 600, 100, 300, 400], 3000));
    const by = Object.fromEntries(rows.map((row) => [row.source, row.tokens]));
    expect(by.system).toBe(1000);
    expect(by.tools).toBe(600);
    expect(by.skills).toBe(100);
    for (const source of [
      'human',
      'inbox-schedule',
      'inbox-assignment',
      'inbox-memory',
      'inbox-mention',
      'host',
      'thinking',
      'replies',
      'tool-use',
    ])
      expect(by[source]).toBeGreaterThan(0);
    expect(rows.reduce((sum, row) => sum + row.tokens, 0)).toBeGreaterThanOrEqual(2995);
    expect(rows.reduce((sum, row) => sum + row.tokens, 0)).toBeLessThanOrEqual(3005);
  });

  it('names the tools that used the context', () => {
    const rows = contextSources(surface([1000, 600, 100, 300, 400], 2400));
    const tools = rows.find((row) => row.source === 'tool-use')?.tools;
    expect(tools?.[0]?.name).toBe('channel_read');
    expect(tools?.[0]?.tokens).toBeGreaterThan(400);
    expect(rows.some((row) => row.source === 'tools')).toBe(false);
  });

  it('keeps unknown events visible as other instead of dropping them', () => {
    const rows = contextSources({
      nodes: [{ seq: 99 as SessionSeq, tokens: 50 }],
      totalTokens: 50,
      eventAt: () => undefined,
    });
    expect(rows).toEqual([{ source: 'other', tokens: 50 }]);
  });

  it('keeps the tokens of a message with no content as other', () => {
    const empty = event(7, 'assistant/message', {
      message: { role: 'assistant', source: { kind: 'model' }, content: [] },
    });
    const rows = contextSources({
      nodes: [{ seq: empty.seq, tokens: 50 }],
      totalTokens: 50,
      eventAt: () => empty,
    });
    expect(rows).toEqual([{ source: 'other', tokens: 50 }]);
  });
});
