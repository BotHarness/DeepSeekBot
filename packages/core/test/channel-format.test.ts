import { describe, expect, it } from 'vitest';

import { isChannelMessage } from '../src/channels/channel.js';

const base = {
  id: 'm1',
  at: '2026-09-22T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: '**hello**',
};

describe('Channel message format', () => {
  it('accepts old rows and either explicit content format', () => {
    expect(isChannelMessage(base)).toBe(true);
    expect(isChannelMessage({ ...base, format: 'markdown' })).toBe(true);
    expect(isChannelMessage({ ...base, format: 'text' })).toBe(true);
  });

  it('rejects unknown formats at the durable boundary', () => {
    expect(isChannelMessage({ ...base, format: 'html' })).toBe(false);
    expect(isChannelMessage({ ...base, format: null })).toBe(false);
  });
});

it('validates a Steward transfer marker even beside another system notice', () => {
  const base = {
    id: 'notice',
    at: '2026-11-25T00:00:00.000Z',
    author: { kind: 'system' },
    body: 'x',
  };
  const turnStop = {
    botSlug: 'ada',
    botName: 'Ada',
    humanName: 'Owner',
    sessionId: 'session',
  };
  expect(isChannelMessage({ ...base, stewardTransfer: { botSlug: 'ada', botName: 'Ada' } })).toBe(
    true,
  );
  expect(isChannelMessage({ ...base, turnStop })).toBe(true);
  expect(
    isChannelMessage({ ...base, turnStop, stewardTransfer: { botSlug: 7, botName: 42 } }),
  ).toBe(false);
  expect(
    isChannelMessage({
      ...base,
      stewardTransfer: { botSlug: 'ada', botName: 'Ada' },
      modelSwitch: 7,
    }),
  ).toBe(false);
});
