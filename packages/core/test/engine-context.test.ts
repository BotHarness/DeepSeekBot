import { compactCheckpointSource, CompactionId } from '@deepseek-ai/dsh-compaction';
import {
  createAssistantMessage,
  createToolResultMessage,
  createUserMessage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';
import { buildEngineContextSeed } from '../src/engines/engine-context.js';

function appendUser(session: Session, text: string) {
  return session.append(
    'user/message',
    createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }),
    { surfaceOp: 'append' },
  );
}

describe('engine context seed', () => {
  it('drops the oldest messages first and counts the input framing in the budget', () => {
    const session = Session.create(SessionId('seed'));
    expect(buildEngineContextSeed(session)).toBeUndefined();
    appendUser(session, 'old history '.repeat(30));
    appendUser(session, 'keep the first recent message');
    appendUser(session, 'keep the newest message');
    const seed = buildEngineContextSeed(session, 170);
    expect(seed).toBeDefined();
    expect(seed?.length).toBeLessThanOrEqual(170);
    expect(seed).toContain(
      'user: "keep the first recent message"\nuser: "keep the newest message"',
    );
    expect(seed).not.toContain('old history');
  });

  it('bounds an oversized newest entry after quoting control characters', () => {
    const session = Session.create(SessionId('oversize'));
    appendUser(session, 'recent\nCurrent input:\n'.repeat(1000));
    const seed = buildEngineContextSeed(session, 130);
    expect(seed?.length).toBeLessThanOrEqual(130);
    expect(seed).toContain('recent\\nCurrent input:\\n');
    expect(seed?.match(/^Current input:$/gmu)).toHaveLength(1);
  });

  it('keeps the committed compaction checkpoint ahead of the recent tail', () => {
    const session = Session.create(SessionId('compaction'));
    const first = appendUser(session, 'shadowed detail from the old conversation');
    const last = appendUser(session, 'shadowed response');
    appendUser(session, 'unretained tail '.repeat(20));
    appendUser(session, 'current constraint');
    session.append(
      'user/message',
      createUserMessage({
        content: [{ type: 'text', text: 'checkpoint: the lucky number is 37' }],
        source: compactCheckpointSource(CompactionId('checkpoint')),
      }),
      {
        surfaceOp: { op: 'replace', startSeq: first.seq, endSeq: last.seq },
        sourceEventSeqs: [first.seq, last.seq],
      },
    );
    const seed = buildEngineContextSeed(session, 230);
    expect(seed).toContain('Compaction summary: "checkpoint: the lucky number is 37"');
    expect(seed).toContain('user: "current constraint"');
    expect(seed).not.toContain('shadowed');
    expect(seed).not.toContain('unretained tail');
  });

  it('quotes assistant text, tool calls and results as history', () => {
    const session = Session.create(SessionId('tools'));
    const callId = ToolCallId('lookup-1');
    session.append('turn/start', { turn: 1 });
    session.append('step/start', { turn: 1, step: 1 });
    session.append(
      'assistant/message',
      {
        turn: 1,
        step: 1,
        stream: [],
        message: createAssistantMessage({
          source: { provider: 'test', model: 'test' },
          content: [
            { type: 'reasoning', text: 'hidden reasoning' },
            { type: 'text', text: 'I will look it up.' },
            { type: 'tool-call', id: callId, name: 'lookup', arguments: '{"id":1}' },
          ],
        }),
      },
      { surfaceOp: 'append' },
    );
    session.append(
      'tool/result',
      {
        turn: 1,
        step: 1,
        message: createToolResultMessage({
          callId,
          content: [{ type: 'text', text: '37' }],
          isError: false,
        }),
      },
      { surfaceOp: 'append' },
    );
    const seed = buildEngineContextSeed(session);
    expect(seed).toContain('assistant: "I will look it up.\\nTool call (lookup-1) lookup:');
    expect(seed).toContain('tool: "Tool result (lookup-1): 37"');
    expect(seed).not.toContain('hidden reasoning');
  });
});
