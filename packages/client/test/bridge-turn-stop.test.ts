import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { parseChannelMessage, parseSessionEngineQuota } from '../src/client/bridge.js';
import { en, zhTranslate } from '../src/client/locale.js';
import { engineChipLabel, sessionEngineText } from '../src/client/session-engine.js';
import { turnStopText } from '../src/client/turn-stop.js';
import { TurnStopLine } from '../src/client/turn-stop-line.js';

const enTranslate = (key: string, params?: Record<string, unknown>) =>
  Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replace(`{${name}}`, String(value)),
    (en as Record<string, string>)[key] ?? key,
  );

it('keeps the Human stop notice and drops a malformed one', () => {
  const stop = {
    id: 'turn-stopped-1',
    at: '2026-10-14T00:00:00.000Z',
    body: 'Human stopped Ada.',
    author: { kind: 'system' },
    turnStop: { botSlug: 'ada', botName: 'Ada', humanName: 'Human', sessionId: 's-1' },
  };
  expect(parseChannelMessage(stop)?.turnStop).toEqual({
    botName: 'Ada',
    humanName: 'Human',
    botSlug: 'ada',
  });
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

it('names the route that ran out of quota and when it resets (#4414)', () => {
  const parsed = parseChannelMessage({
    id: 'turn-stopped-3',
    at: '2026-11-18T00:00:00.000Z',
    body: 'Ada paused.',
    author: { kind: 'system' },
    turnStop: {
      botSlug: 'ada',
      botName: 'Ada',
      humanName: 'Human',
      sessionId: 's-1',
      held: true,
      cause: 'quota',
      rests: [
        {
          provider: 'opencode-go',
          model: 'deepseek-v4.1-flash',
          until: '2026-11-23T00:00:00.000Z',
        },
      ],
    },
  });
  expect(parsed?.turnStop).toMatchObject({ cause: 'quota', rests: [{ provider: 'opencode-go' }] });
  const text = turnStopText(parsed!.turnStop!, zhTranslate);
  expect(text).toContain('Ada 已暂停：opencode-go/deepseek-v4.1-flash 额度用完');
  expect(text).toContain('重置后给它发消息即可重试');
  const malformed = parseChannelMessage({
    id: 'turn-stopped-4',
    at: '2026-11-18T00:00:00.000Z',
    body: 'Ada paused.',
    author: { kind: 'system' },
    turnStop: {
      botSlug: 'ada',
      botName: 'Ada',
      humanName: 'Human',
      sessionId: 's-1',
      cause: 'quota',
      rests: [{}],
    },
  });
  expect(malformed?.turnStop?.rests).toBeUndefined();
});

it('shows a subscription limit card with a one-tap switch to the API model (#4493)', () => {
  const until = '2026-11-18T18:40:00.000Z';
  const parsed = parseChannelMessage({
    id: 'turn-stopped-5',
    at: '2026-11-18T14:00:00.000Z',
    body: 'Ada paused.',
    author: { kind: 'system' },
    turnStop: {
      botSlug: 'ada',
      botName: 'Ada',
      humanName: 'Human',
      sessionId: 's-1',
      held: true,
      cause: 'quota',
      rests: [{ provider: 'codex', model: 'ChatGPT pro', until }],
      engine: { engine: 'codex', account: 'ChatGPT pro', until },
    },
  });
  const stop = parsed!.turnStop!;
  expect(stop.engine).toEqual({ engine: 'codex', account: 'ChatGPT pro', until });
  expect(turnStopText(stop, zhTranslate)).toContain(
    'Ada 已暂停：Codex 订阅（ChatGPT pro）额度用完',
  );
  const html = renderToStaticMarkup(
    createElement(TurnStopLine, { messageId: 'turn-stopped-5', stop, t: enTranslate }),
  );
  expect(html).toContain('data-engine-limit="codex"');
  expect(html).toContain('Switch to API model');
  const plain = renderToStaticMarkup(
    createElement(TurnStopLine, {
      messageId: 'turn-stopped-5',
      stop: { botName: stop.botName, humanName: stop.humanName, botSlug: 'ada', cause: 'quota' },
      t: enTranslate,
    }),
  );
  expect(plain).not.toContain('Switch to API model');
  expect(
    parseChannelMessage({
      id: 'turn-stopped-6',
      at: '2026-11-18T14:00:00.000Z',
      body: 'Ada paused.',
      author: { kind: 'system' },
      turnStop: { ...stop, sessionId: 's-1', engine: { engine: 'codex', until: 'soon' } },
    })?.turnStop?.engine,
  ).toBeUndefined();
});

it('shows the group exhaustion card with the first reset and no direct engine switch', () => {
  const firstReset = '2026-11-18T16:00:00.000Z';
  const engineReset = '2026-11-18T20:00:00.000Z';
  const parsed = parseChannelMessage({
    id: 'group-stopped',
    at: '2026-11-18T14:00:00.000Z',
    body: '',
    author: { kind: 'system' },
    turnStop: {
      botSlug: 'ada',
      botName: 'Ada',
      humanName: 'Human',
      sessionId: 's-1',
      held: true,
      cause: 'quota',
      routingGroup: true,
      rests: [
        { provider: 'deepseek', model: 'flash', until: firstReset },
        { provider: 'codex', model: 'ChatGPT pro', until: engineReset },
      ],
      engine: { engine: 'codex', account: 'ChatGPT pro', until: engineReset },
    },
  });
  expect(parsed?.turnStop?.routingGroup).toBe(true);
  const stop = parsed!.turnStop!;
  const html = renderToStaticMarkup(
    createElement(TurnStopLine, { messageId: 'group-stopped', stop, t: enTranslate }),
  );
  expect(html).toContain('all Routing Group targets are resting');
  expect(html).toContain('data-engine-limit="codex"');
  expect(html).not.toContain('Switch to API model');
});

it('names the quota left, or the limit, where the engine is shown (#4493)', () => {
  const quota = parseSessionEngineQuota({
    usedPercent: 79.4,
    resetsAt: '2026-11-21T08:26:07.000Z',
    observedAt: '2026-11-18T14:00:00.000Z',
  });
  const engine = { engine: 'codex', account: 'ChatGPT pro', state: 'idle' as const };
  expect(sessionEngineText({ ...engine, quota: quota! }, enTranslate)).toMatch(
    /^Runs on Codex \(ChatGPT pro\) · 79% used, resets /,
  );
  expect(engineChipLabel('6 Astra', quota!, enTranslate)).toBe('6 Astra · 79%');
  const limited = parseSessionEngineQuota({
    usedPercent: 100,
    limitedUntil: '2026-11-18T18:40:00.000Z',
    observedAt: '2026-11-18T14:00:00.000Z',
  })!;
  expect(sessionEngineText({ ...engine, quota: limited }, zhTranslate)).toContain('订阅额度已用完');
  expect(engineChipLabel('6 Astra', limited, enTranslate)).toBe('6 Astra · limit reached');
  expect(parseSessionEngineQuota({ usedPercent: 3 })).toBeUndefined();
});
