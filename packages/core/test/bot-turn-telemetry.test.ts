import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';

import { createBotTurnTelemetry } from '../src/telemetry/bot-turn.js';
import { telemetryEventProperties } from '../src/telemetry/events.js';

const at = (seq: number, type: string, data: unknown) => ({ seq, type, time: seq, data });
const text = (value: string) => ({ type: 'text', text: value });

function harness(enabled = true) {
  const captured: { event: string; properties: Record<string, unknown> }[] = [];
  const log: ReturnType<typeof at>[] = [];
  const turns = createBotTurnTelemetry({
    telemetry: {
      enabled,
      capture: (event, properties = {}) => captured.push({ event, properties }),
    },
    role: (sessionId) => (sessionId === 'orch' ? 'orchestrator' : undefined),
    measure: () => ({
      nodes: log.map((event) => ({ seq: event.seq as SessionSeq, tokens: 100 })),
      totalTokens: log.length * 100 + 500,
      eventAt: (seq) => log.find((event) => event.seq === seq) as unknown as SessionEvent,
    }),
  });
  const observe = (sessionId: string, event: ReturnType<typeof at>) => {
    log.push(event);
    turns.observe(sessionId, event);
  };
  return { captured, observe };
}

describe('Bot turn telemetry', () => {
  it('reports usage and the context breakdown of one inbox turn, with no message text', () => {
    const { captured, observe } = harness();
    observe('orch', at(1, 'system/message', { message: { content: [text('You are Ada.')] } }));
    observe('orch', at(2, 'turn/start', { turn: 1 }));
    observe(
      'orch',
      at(3, 'user/message', {
        source: { kind: 'user' },
        content: [
          text('[Bot Inbox: Group digest]\nChannel: Team (c1)\n- Message m1 from Bo: secret'),
        ],
      }),
    );
    observe('orch', at(4, 'step/start', {}));
    observe(
      'orch',
      at(5, 'assistant/message', {
        message: { content: [{ type: 'tool-call', id: 'c1', name: 'channel_read' }] },
        usage: { inputTokens: 200, outputTokens: 20, cacheReadTokens: 1800, cacheWriteTokens: 0 },
      }),
    );
    observe('orch', at(6, 'tool/call', { callId: 'c1', name: 'channel_read' }));
    observe('orch', at(7, 'turn/end', { reason: { kind: 'completed' } }));

    expect(captured).toHaveLength(1);
    const [{ event, properties }] = captured as [(typeof captured)[number]];
    expect(event).toBe('chat:bot_turn_complete');
    expect(properties).toMatchObject({
      role: 'orchestrator',
      outcome: 'completed',
      trigger: 'inbox',
      step_count: 1,
      tool_call_count: 1,
      input_token_count: 200,
      output_token_count: 20,
      cache_read_token_count: 1800,
      cache_write_token_count: 0,
      is_partial: false,
      context_token_count: 1200,
      context_system_token_count: 100,
      context_tools_token_count: 500,
      added_system_token_count: 0,
      added_tools_token_count: 0,
      added_human_token_count: 0,
    });
    expect(properties['added_inbox_mention_token_count']).toBeGreaterThanOrEqual(99);
    expect(JSON.stringify(properties)).not.toContain('secret');
    expect(telemetryEventProperties('chat:bot_turn_complete', properties)).toEqual(properties);
  });

  it('tells a Human turn from a turn that also carries the inbox', () => {
    const { captured, observe } = harness();
    observe('orch', at(1, 'turn/start', {}));
    observe(
      'orch',
      at(2, 'user/message', {
        source: { kind: 'user' },
        content: [text('hi\n\n[Bot Inbox] since your last turn.\n- Memory change (event e): x')],
      }),
    );
    observe('orch', at(3, 'turn/end', { reason: { kind: 'failed' } }));
    observe('orch', at(4, 'turn/start', {}));
    observe('orch', at(5, 'user/message', { source: { kind: 'user' }, content: [text('hi')] }));
    observe('orch', at(6, 'turn/end', { reason: { kind: 'cancelled' } }));
    expect(
      captured.map(({ properties }) => [properties['trigger'], properties['outcome']]),
    ).toEqual([
      ['mixed', 'failed'],
      ['human', 'cancelled'],
    ]);
  });

  it('marks missing usage as partial and skips sessions no Bot owns', () => {
    const { captured, observe } = harness();
    observe('loose', at(1, 'turn/start', {}));
    observe('loose', at(2, 'turn/end', { reason: { kind: 'completed' } }));
    observe('orch', at(3, 'turn/start', {}));
    observe('orch', at(4, 'assistant/message', { message: { content: [] } }));
    observe('orch', at(5, 'turn/end', { reason: { kind: 'completed' } }));
    expect(captured).toHaveLength(1);
    expect(captured[0]?.properties['is_partial']).toBe(true);
  });

  it('sends nothing while telemetry is off', () => {
    const { captured, observe } = harness(false);
    observe('orch', at(1, 'turn/start', {}));
    observe('orch', at(2, 'turn/end', { reason: { kind: 'completed' } }));
    expect(captured).toEqual([]);
  });
});
