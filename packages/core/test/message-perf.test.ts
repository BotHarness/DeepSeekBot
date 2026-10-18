import { describe, expect, it } from 'vitest';

import { createMessagePerfTracker, estimateOutputTokens } from '../src/usage/message-perf.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

function stepStart(turn: number, step: number): DshSessionEvent {
  return { type: 'step/start', time: 0, data: { turn, step } };
}

function settlement(
  turn: number,
  step: number,
  firstTokenTime: number | undefined,
  lastTokenTime: number,
  outputTokens?: number,
): DshSessionEvent {
  return {
    type: 'assistant/message',
    time: 0,
    data: {
      turn,
      step,
      ...(firstTokenTime === undefined
        ? { stream: [] }
        : {
            stream: [
              {
                type: 'text-chunks',
                time0: firstTokenTime,
                index: 0,
                dt: [lastTokenTime - firstTokenTime],
                texts: ['你', '好'],
              },
            ],
          }),
      ...(outputTokens === undefined ? {} : { usage: { outputTokens } }),
    },
  };
}

function hiddenReasoning(
  usage: Record<string, number>,
  firstTokenTime = 1_000,
  lastTokenTime = 2_000,
) {
  const event = settlement(1, 0, firstTokenTime, lastTokenTime);
  return { ...event, data: { ...(event.data as object), usage } } as DshSessionEvent;
}

describe('message generation speed estimate', () => {
  it('excludes hidden reasoning tokens that were not streamed in the timed window', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', hiddenReasoning({ outputTokens: 1_649, reasoningTokens: 1_600 }));
    expect(perf.forSession('s', '你'.repeat(40))).toEqual({
      outputTokens: 49,
      elapsedMs: 1_000,
      estimated: false,
    });
  });

  it('treats an empty reasoning record as hidden reasoning', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    const event = hiddenReasoning({ outputTokens: 149, reasoningTokens: 100 });
    const data = event.data as { stream: unknown[] };
    data.stream.unshift({ type: 'reasoning-chunks', time0: 900, index: 0, dt: [], texts: [] });
    perf.observeSessionEvent('s', event);
    expect(perf.forSession('s', '你'.repeat(72))).toMatchObject({
      outputTokens: 49,
      estimated: false,
    });
  });

  it('attributes one model step to the first message it sends only', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', hiddenReasoning({ outputTokens: 60 }));
    expect(perf.forSession('s', '你'.repeat(40))).toMatchObject({ outputTokens: 60 });
    expect(perf.forSession('s', '你'.repeat(40))).toBeUndefined();
  });

  it('estimates from the reply when unreported hidden reasoning inflates the count', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', hiddenReasoning({ outputTokens: 1_649 }));
    expect(perf.forSession('s', '你'.repeat(72))).toEqual({
      outputTokens: 72,
      elapsedMs: 1_000,
      estimated: true,
    });
  });

  it('reports nothing for a burst shorter than the minimum window', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', hiddenReasoning({ outputTokens: 109 }, 1_000, 1_149));
    expect(perf.forSession('s', '你'.repeat(90))).toBeUndefined();
  });

  it('counts CJK per character and other text per four characters', () => {
    expect(estimateOutputTokens('你好世界')).toBe(4);
    expect(estimateOutputTokens('abcdefgh')).toBe(2);
    expect(estimateOutputTokens('你好abcd')).toBe(3);
    expect(estimateOutputTokens('   ')).toBeUndefined();
  });

  it('uses provider output tokens without the estimated flag', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', settlement(1, 0, 1_000, 3_000, 40));

    expect(perf.forSession('s', 'x'.repeat(80))).toEqual({
      outputTokens: 40,
      elapsedMs: 2_000,
      estimated: false,
    });
  });

  it('falls back to the local text estimate and flags it', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', settlement(1, 0, 1_000, 2_000));

    expect(perf.forSession('s', 'abcdefgh')).toEqual({
      outputTokens: 2,
      elapsedMs: 1_000,
      estimated: true,
    });
  });

  it('measures the Step that produced the reply, not the whole turn', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', settlement(1, 0, 1_000, 3_000, 40));

    perf.observeSessionEvent('s', stepStart(1, 1));
    perf.observeSessionEvent('s', settlement(1, 1, 8_000, 9_000, 10));
    expect(perf.forSession('s', '你'.repeat(5))).toEqual({
      outputTokens: 10,
      elapsedMs: 1_000,
      estimated: false,
    });
  });

  it('reports nothing without model output or provider usage and text', () => {
    const perf = createMessagePerfTracker();
    perf.observeSessionEvent('s', stepStart(1, 0));
    perf.observeSessionEvent('s', settlement(1, 0, undefined, 9_000, 40));
    expect(perf.forSession('s', '你')).toBeUndefined();

    perf.observeSessionEvent('s', stepStart(1, 1));
    perf.observeSessionEvent('s', settlement(1, 1, 1_000, 9_000));
    expect(perf.forSession('s', '')).toBeUndefined();

    perf.clear('s');
    expect(perf.forSession('s', '你')).toBeUndefined();
  });
});

it('keeps streamed reasoning tokens inside the measured generation window', () => {
  const tracker = createMessagePerfTracker();
  const event = hiddenReasoning({ outputTokens: 1020, reasoningTokens: 1000 }, 11000, 12000);
  const data = event.data as { stream: unknown[] };
  data.stream.unshift({
    type: 'reasoning-chunks',
    time0: 1000,
    index: 0,
    dt: [9000],
    texts: ['thinking', 'done'],
  });
  tracker.observeSessionEvent('s', event);
  expect(tracker.forSession('s', '你'.repeat(20))).toEqual({
    outputTokens: 1020,
    elapsedMs: 11000,
    estimated: false,
  });
});

it('excludes late finish events and trailing empty chunks from the generation window', () => {
  const tracker = createMessagePerfTracker();
  const event = hiddenReasoning({ outputTokens: 20 }, 1000, 2000);
  const data = event.data as { stream: unknown[] };
  data.stream.push({ type: 'text-chunks', time0: 4000, index: 0, dt: [], texts: [''] });
  data.stream.push({ type: 'chunk', time: 12000, chunk: { type: 'finish', finishReason: 'stop' } });
  tracker.observeSessionEvent('s', event);
  expect(tracker.forSession('s', '你'.repeat(20))).toEqual({
    outputTokens: 20,
    elapsedMs: 1000,
    estimated: false,
  });
});
