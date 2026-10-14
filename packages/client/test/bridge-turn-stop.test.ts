import { expect, it } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';

it('keeps the Human stop notice and drops a malformed one', () => {
  const stop = {
    id: 'turn-stopped-1',
    at: '2026-10-14T00:00:00.000Z',
    body: 'Human stopped Ada.',
    author: { kind: 'system' },
    turnStop: { botSlug: 'ada', botName: 'Ada', humanName: 'Human', sessionId: 's-1' },
  };
  expect(parseChannelMessage(stop)?.turnStop).toEqual({ botName: 'Ada', humanName: 'Human' });
  expect(parseChannelMessage({ ...stop, turnStop: { botName: 'Ada' } })).toBeUndefined();
  expect(
    parseChannelMessage({ ...stop, author: { kind: 'bot', slug: 'ada' } })?.turnStop,
  ).toBeUndefined();
  expect(zhTranslate('turn.stopped', { human: 'Human', name: 'Ada' })).toBe('Human 停止了 Ada');
});
