import { describe, expect, it } from 'vitest';

import { parseFinalReply } from '../src/runtime/final-reply.js';

describe('source-bound final reply envelope', () => {
  it.each([true, false])('preserves the requested completion state %s', (complete) => {
    const reply = { action: 'reply', text: '  已核对。  ', complete };
    expect(parseFinalReply(JSON.stringify({ deepseekbot_reply: reply }))).toEqual(reply);
  });

  it('accepts an explicit silent final', () => {
    expect(parseFinalReply('{"deepseekbot_reply":{"action":"silent"}}')).toEqual({
      action: 'silent',
    });
  });

  it.each([
    'ordinary private text',
    '```json\n{"deepseekbot_reply":{"action":"silent"}}\n```',
    '{"other":"private"}',
    'null',
    '[]',
  ])('leaves unmarked output private: %s', (text) => {
    expect(parseFinalReply(text)).toBeUndefined();
  });

  it.each([
    { deepseekbot_reply: { action: 'reply', text: 'answer', complete: true, destination: 'dm' } },
    { deepseekbot_reply: { action: 'reply', text: 'answer', complete: true }, extra: true },
    { deepseekbot_reply: { action: 'reply', text: 'answer' } },
    { deepseekbot_reply: { action: 'reply', text: 'answer', complete: 'true' } },
    { deepseekbot_reply: { action: 'reply', text: '   ', complete: true } },
    { deepseekbot_reply: { action: 'silent', complete: true } },
    { deepseekbot_reply: { action: 'unknown' } },
    { deepseekbot_reply: null },
    { deepseekbot_reply: [] },
  ])('rejects malformed or destination-bearing envelopes: %j', (envelope) => {
    expect(() => parseFinalReply(JSON.stringify(envelope))).toThrow(
      'Invalid deepseekbot_reply envelope',
    );
  });

  it('rejects a truncated marked envelope', () => {
    expect(() => parseFinalReply('{"deepseekbot_reply":')).toThrow(
      'Invalid deepseekbot_reply envelope',
    );
  });
});
