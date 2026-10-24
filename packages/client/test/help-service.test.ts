import { expect, it, vi } from 'vitest';
import { createHelpService } from '../src/client/help-service.js';
import type { HelpContribution, HelpStep } from '../src/help-api.js';

const contribution = (
  guide?: HelpContribution['topics'][number]['questions'][number]['guide'],
): HelpContribution => ({
  id: 'example:help',
  topics: [
    {
      id: 'example:topic',
      title: { en: 'Messages', zh: '消息' },
      overview: { en: 'Panel help' },
      questions: [
        {
          id: 'example:model',
          title: { en: 'Change model', zh: '更换模型' },
          answer: { en: 'Use the real picker.' },
          keywords: ['llm'],
          ...(guide ? { guide } : {}),
        },
      ],
    },
  ],
});
it('refreshes availability snapshots without replacing a guide and releases notifications', () => {
  const service = createHelpService(() => () => {});
  let ready = false;
  let notify = () => {};
  const unsubscribe = vi.fn();
  const off = service.register(
    contribution({
      availability: () =>
        ready
          ? { status: 'ready', target: { id: 'a', label: 'A' } }
          : { status: 'unavailable', reason: { en: 'Wait' } },
      subscribe(listener) {
        notify = listener;
        return unsubscribe;
      },
      prepare: async () => ({ steps: [], dispose() {} }),
    }),
  );
  const before = service.topics();
  ready = true;
  notify();
  expect(service.topics()).not.toBe(before);
  expect(service.availability('example:model').status).toBe('ready');
  expect(service.state().phase).toBe('idle');
  off();
  expect(unsubscribe).toHaveBeenCalledOnce();
  const removed = service.topics();
  notify();
  expect(service.topics()).toBe(removed);
});

it('does not retain a contribution whose availability subscription throws', () => {
  const service = createHelpService(() => () => {});
  expect(() =>
    service.register(
      contribution({
        availability: () => ({ status: 'ready', target: { id: 'a', label: 'A' } }),
        subscribe() {
          throw new Error('subscribe_failed');
        },
        prepare: async () => ({ steps: [], dispose() {} }),
      }),
    ),
  ).toThrow('subscribe_failed');
  expect(service.topics()).toHaveLength(0);
  expect(() => service.register(contribution())).not.toThrow();
});
it('subscribes once when two questions share the same guide', () => {
  const service = createHelpService(() => () => {});
  const unsubscribe = vi.fn();
  let notify = () => {};
  const subscribe = vi.fn((listener: () => void) => {
    notify = listener;
    return unsubscribe;
  });
  const source = contribution({
    availability: () => ({ status: 'ready', target: { id: 'a', label: 'A' } }),
    subscribe,
    prepare: async () => ({ steps: [], dispose() {} }),
  });
  const topic = source.topics[0]!;
  const question = topic.questions[0]!;
  const off = service.register({
    ...source,
    topics: [{ ...topic, questions: [question, { ...question, id: 'example:second' }] }],
  });
  const listener = vi.fn();
  service.subscribe(listener);
  notify();
  expect(subscribe).toHaveBeenCalledOnce();
  expect(listener).toHaveBeenCalledOnce();
  off();
  expect(unsubscribe).toHaveBeenCalledOnce();
});
it('discovers a text-only independent contribution and protects replacement from a stale disposer', () => {
  const service = createHelpService(() => () => {});
  const off = service.register(contribution());
  expect(service.search('Messages llm').map((q) => q.id)).toEqual(['example:model']);
  expect(service.search('更换')).toHaveLength(1);
  expect(service.availability('example:model').status).toBe('unavailable');
  expect(() => service.register(contribution())).toThrow('help_duplicate_id');
  off();
  expect(service.search('')).toEqual([]);
  const next = service.register(contribution());
  off();
  expect(service.search('')).toHaveLength(1);
  next();
});
it('requires explicit selection and refuses targets outside the current availability', async () => {
  let prepared = '';
  const service = createHelpService(() => () => {});
  service.register(
    contribution({
      availability: () => ({
        status: 'select',
        targets: [
          { id: 'a', label: 'Same' },
          { id: 'b', label: 'Same' },
        ],
      }),
      prepare: async (id) => {
        prepared = id;
        return { steps: [], dispose() {} };
      },
    }),
  );
  await expect(service.start('example:model')).rejects.toThrow('help_target_unavailable');
  await expect(service.start('example:model', 'missing')).rejects.toThrow(
    'help_target_unavailable',
  );
  expect(prepared).toBe('');
  await service.start('example:model', 'b');
  expect(prepared).toBe('b');
  service.cancel();
});
it('cancels pending preparation on Plugin disposal and releases its late result without presenting it', async () => {
  let finish!: (value: { steps: readonly HelpStep[]; dispose(): void }) => void;
  let aborted = false,
    presented = false,
    releases = 0;
  const service = createHelpService(() => {
    presented = true;
    return () => {};
  });
  const off = service.register(
    contribution({
      availability: () => ({ status: 'ready', target: { id: 'a', label: 'A' } }),
      prepare: (_, signal) => {
        signal.addEventListener('abort', () => {
          aborted = true;
        });
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    }),
  );
  const started = service.start('example:model');
  off();
  finish({
    steps: [],
    dispose() {
      releases++;
    },
  });
  await started;
  expect(aborted).toBe(true);
  expect(presented).toBe(false);
  expect(releases).toBe(1);
  expect(service.state()).toMatchObject({ phase: 'idle', reason: 'plugin-removed' });
});
it('releases the previous guide before preparing another and cleanup is idempotent', async () => {
  const events: string[] = [];
  const service = createHelpService(() => {
    events.push('present');
    return () => {
      events.push('hide');
    };
  });
  service.register(
    contribution({
      availability: () => ({ status: 'ready', target: { id: 'a', label: 'A' } }),
      prepare: async () => {
        events.push('prepare');
        return {
          steps: [],
          dispose() {
            events.push('release');
          },
        };
      },
    }),
  );
  await service.start('example:model');
  await service.start('example:model');
  service.cancel();
  service.cancel();
  expect(events).toEqual([
    'prepare',
    'present',
    'hide',
    'release',
    'prepare',
    'present',
    'hide',
    'release',
  ]);
});
