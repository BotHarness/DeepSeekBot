import { describe, expect, it } from 'vitest';
import { summarizeTurnInput, systemPromptFromLog } from '../src/runtime/prompt-inspection.js';

const text = (value: string) => ({ type: 'text', text: value });

const events = [
  { type: 'turn/start', time: 1_000, data: { turn: 1 } },
  { type: 'step/start', time: 1_001, data: { turn: 1, step: 1 } },
  {
    type: 'system/message',
    time: 1_001,
    data: { turn: 1, step: 1, message: { role: 'system', content: [text('You are Ada.')] } },
  },
  {
    type: 'user/message',
    time: 1_002,
    data: {
      role: 'user',
      source: { kind: 'user' },
      content: [text('Hello'), text('[Host reply transport reminder] Assistant text is private.')],
    },
  },
  {
    type: 'user/message',
    time: 1_003,
    data: { role: 'user', source: { kind: 'runtime-context' }, content: [text('cwd: /m')] },
  },
  { type: 'assistant/message', time: 1_004, data: { turn: 1, step: 1, message: {} } },
  { type: 'turn/start', time: 2_000, data: { turn: 2 } },
  {
    type: 'user/message',
    time: 2_001,
    data: { role: 'user', content: [text('Second'), { type: 'image' }] },
  },
  { type: 'step/start', time: 2_400, data: { turn: 2, step: 3 } },
  {
    type: 'user/message',
    time: 2_500,
    data: { role: 'user', source: { kind: 'user' }, content: [text('Steered')] },
  },
  {
    type: 'system/message',
    time: 2_501,
    data: { turn: 2, step: 3, message: { role: 'system', content: [] } },
  },
];

describe('prompt inspection', () => {
  it('returns the exact input of the newest turns, with steps and sources', () => {
    expect(summarizeTurnInput(events, { turns: 1 })).toEqual({
      turns: [
        {
          turn: 2,
          startedAt: new Date(2_000).toISOString(),
          messages: [
            {
              step: 1,
              source: 'user',
              at: new Date(2_001).toISOString(),
              text: 'Second\n\n[image]',
            },
            { step: 3, source: 'user', at: new Date(2_500).toISOString(), text: 'Steered' },
          ],
        },
      ],
    });
    const both = summarizeTurnInput(events, { turns: 5 }).turns;
    expect(both.map((turn) => turn.turn)).toEqual([1, 2]);
    expect(both[0]!.messages.map((message) => message.source)).toEqual(['user', 'runtime-context']);
    expect(both[0]!.messages[0]!.text).toBe(
      'Hello\n\n[Host reply transport reminder] Assistant text is private.',
    );
  });

  it('reads the logged system prompt and ignores empty system nodes', () => {
    expect(systemPromptFromLog(events)).toBe('You are Ada.');
    expect(systemPromptFromLog([])).toBeNull();
  });
});
