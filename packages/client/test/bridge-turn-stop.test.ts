import { expect, it } from 'vitest';
import { parseChannelMessage } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { turnStopText } from '../src/client/turn-stop.js';

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

it('names the stopped Session or the whole Bot in the notice', () => {
  const base = {
    id: 'turn-stopped-2',
    at: '2026-11-04T00:00:00.000Z',
    body: 'Human stopped Ada.',
    author: { kind: 'system' },
  };
  const stop = { botSlug: 'ada', botName: 'Ada', humanName: 'Human', sessionId: 's-1' };
  const text = (target: unknown) => {
    const parsed = parseChannelMessage({ ...base, turnStop: { ...stop, target } });
    return turnStopText(parsed!.turnStop!, zhTranslate);
  };
  expect(text({ scope: 'bot' })).toBe('Human 停止了 Ada 的全部 Session');
  expect(text({ scope: 'session', role: 'orchestrator', sessionId: 's-1' })).toBe(
    'Human 停止了 Ada 的 Orchestrator · Assignment 继续运行',
  );
  expect(
    text({ scope: 'session', role: 'assignment', sessionId: 's-2', title: 'Crawl every page' }),
  ).toBe('Human 停止了 Ada 的 Assignment「Crawl every page」');
  expect(text({ scope: 'nope' })).toBe('Human 停止了 Ada');
});
