import { describe, expect, it } from 'vitest';
import config from '../../vitest.config.ts';
import { matchesGlob } from '../ci-plan.mjs';

const fixtures = [
  'packages/core/test/bot-group-review-rounds.test.ts',
  'packages/core/test/channel-attachment-forwarding.test.ts',
  'packages/core/test/genui-vm.test.ts',
  'packages/core/test/genui-guest.test.ts',
  'packages/core/test/genui-execution-session.test.ts',
  'packages/core/test/genui-execution-worker.test.ts',
  'packages/client/test/genui-dom-mirror.test.ts',
  'packages/client/test/genui-document-surface.test.ts',
  'packages/core/test/genui-document.test.ts',
  'packages/core/test/genui-execution-supervisor.test.ts',
  'scripts/test/genui-runtime-assets.test.mjs',
  'apps/mobile/test/action-cards.test.ts',
];

describe('GenUI real-time test resource ownership', () => {
  it.each(fixtures)('assigns %s to exactly one project', (path) => {
    const projects = config.test.projects.filter(
      ({ test }) =>
        test.include.some((glob) => matchesGlob(path, glob)) &&
        !(test.exclude ?? []).some((glob) => matchesGlob(path, glob)),
    );
    expect(projects).toHaveLength(1);
  });

  it('runs actual VM/Worker deadlines serially after other tests without raising the deadlines', () => {
    expect(config.test.projects.every((project) => project.extends === false)).toBe(true);
    const budgeted = config.test.projects.find(({ test }) => test.name === 'genui-budgeted');
    const ordinary = config.test.projects.find(({ test }) => test.name === 'default');
    expect(budgeted.test.maxWorkers).toBe(1);
    expect(budgeted.test.fileParallelism).toBe(false);
    expect(budgeted.test.sequence.groupOrder).toBeGreaterThan(ordinary.test.sequence.groupOrder);
    expect(budgeted.test.testTimeout).toBe(config.test.testTimeout);
  });
});

describe('Durable integration test resource ownership', () => {
  it('keeps disk-heavy workflows serial after other projects without changing their deadlines', () => {
    const durable = config.test.projects.find(({ test }) => test.name === 'durable-integration');
    expect(durable.test.maxWorkers).toBe(1);
    expect(durable.test.fileParallelism).toBe(false);
    expect(durable.test.testTimeout).toBe(config.test.testTimeout);
    for (const project of config.test.projects.filter((project) => project !== durable))
      expect(durable.test.sequence.groupOrder).toBeGreaterThan(project.test.sequence.groupOrder);
  });
});
