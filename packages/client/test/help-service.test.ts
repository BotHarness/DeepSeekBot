import { expect, it } from 'vitest';
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
