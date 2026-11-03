import { describe, expect, it } from 'vitest';
import { createBotStateTracker, personaBotActivitySnapshot } from '../src/state/bot-state.js';
import { aggregateToolActivity, type PersonaBotToolActivity } from '../src/state/tool-activity.js';

const orders = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const tools: PersonaBotToolActivity[] = [
  {
    effect: 'executing',
    toolKind: 'execute',
    toolName: 'bash',
    startedAt: 30,
    activeToolCount: 1,
    detailRefs: ['tool-detail-c', 'tool-detail-a'],
    sources: [{ role: 'assignment', count: 1 }],
  },
  {
    effect: 'searching',
    toolKind: 'search',
    toolName: 'search',
    startedAt: 10,
    activeToolCount: 1,
    detailRefs: ['tool-detail-b'],
    sources: [{ role: 'assignment', count: 1 }],
  },
  {
    effect: 'executing',
    toolKind: 'execute',
    toolName: 'bash',
    startedAt: 20,
    activeToolCount: 1,
    detailRefs: ['tool-detail-a'],
    sources: [{ role: 'assignment', count: 1 }],
  },
];

describe('event-order-independent concurrent Activity', () => {
  it.each([false, true])(
    'same-kind=%s has identical safe aggregate for every arrival order',
    (sameKind) => {
      const items = tools.map((tool) =>
        sameKind
          ? {
              ...tool,
              effect: 'executing' as const,
              toolKind: 'execute' as const,
              toolName: 'bash',
            }
          : tool,
      );
      const expected = {
        effect: sameKind ? 'executing' : 'generic-working',
        toolKind: sameKind ? 'execute' : 'other',
        ...(sameKind ? { toolName: 'bash' } : {}),
        startedAt: 10,
        activeToolCount: 3,
        sources: [{ role: 'assignment', count: 3 }],
        detailRefs: ['tool-detail-a', 'tool-detail-b', 'tool-detail-c'],
      };
      for (const order of orders)
        expect(aggregateToolActivity(order.map((index) => items[index]!))).toEqual(expected);
    },
  );

  it('deduplicates and bounds the same reference set before any truncation, without mutating callers', () => {
    const refs = Array.from(
      { length: 260 },
      (_, index) => `tool-detail-${index.toString().padStart(3, '0')}`,
    );
    const inputs = [
      { ...tools[0]!, detailRefs: refs.slice(0, 130) },
      { ...tools[1]!, detailRefs: [...refs.slice(130), refs[0]!] },
    ];
    const original = structuredClone(inputs);
    const first = aggregateToolActivity(inputs);
    const reversed = aggregateToolActivity([...inputs].reverse());
    expect(first).toEqual(reversed);
    expect(first?.detailRefs).toEqual(refs.slice(0, 256));
    expect(inputs).toEqual(original);
  });

  it.each(orders)(
    'publishes deterministic concurrent selection and clears completion order %i/%i/%i',
    (...order) => {
      const states = createBotStateTracker();
      const wait = {
        ...tools[0]!,
        toolName: 'wait_for_assignment',
        detailRefs: ['tool-detail-wait'],
        sources: [{ role: 'orchestrator' as const, count: 1 }],
      };
      states.onActivity((event) => {
        const snapshot = personaBotActivitySnapshot(['ada'], states);
        expect(event).toMatchObject({
          generation: snapshot.generation,
          revision: snapshot.revision,
          ...snapshot.bots[0],
        });
      });
      states.setSessionState('ada', 'orch', 'working', wait, 'orchestrator');
      const release = states.beginAssignmentWait('ada', 'orch');
      for (const index of order)
        states.setSessionState(
          'ada',
          `assignment-${index}`,
          'working',
          tools[index]!,
          'assignment',
        );
      expect(states.activity('ada')?.detailRefs).toEqual([
        'tool-detail-a',
        'tool-detail-b',
        'tool-detail-c',
      ]);
      expect(states.activity('ada')).toMatchObject({
        effect: 'generic-working',
        activeToolCount: 3,
      });
      for (const [position, index] of order.entries()) {
        states.setSessionState('ada', `assignment-${index}`, 'done', undefined, 'assignment');
        expect(
          states.sessionActivity('ada').filter((session) => session.role === 'assignment'),
        ).toHaveLength(2 - position);
        if (position < 2) expect(states.activity('ada')?.activeToolCount).toBe(2 - position);
      }
      expect(states.activity('ada')?.toolName).toBe('wait_for_assignment');
      release();
      states.setSessionState('ada', 'orch', 'done', undefined, 'orchestrator');
      expect(personaBotActivitySnapshot(['ada'], states).bots[0]).toEqual({
        slug: 'ada',
        state: 'idle',
        active: false,
      });
    },
  );
});
