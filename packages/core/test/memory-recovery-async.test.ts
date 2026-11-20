import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createMemoryRecovery } from '../src/memory/recovery.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

function fixture() {
  const home = createTempRoot('memory-recovery-async-');
  const root = join(home, 'memory');
  expect(ensureMemoryRepository({ memoryDir: root }).ok).toBe(true);
  const database = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const memory = createMemoryRecovery({
    database: attachOperationalModule(database, 'memory'),
    now: FIXED_NOW,
  });
  const context = {
    origin: 'agent-session',
    originId: 'session',
    causeKind: 'source-event',
    causeId: 'event',
  } as const;
  return { root, database, memory, context };
}

it(
  'yields during real Git capture while retaining staged, working, untracked and dedup semantics',
  { timeout: 30_000 },
  async () => {
    const { root, database, memory, context } = fixture();
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8' }).trim();
    try {
      writeFileSync(join(root, 'note.md'), 'staged\n');
      git('add', 'note.md');
      writeFileSync(join(root, 'note.md'), 'working\n');
      writeFileSync(join(root, 'new.txt'), 'untracked\n');
      const index = readFileSync(join(root, '.git', 'index'));
      let timerRan = false;
      const timer = new Promise<void>((resolve) =>
        setImmediate(() => {
          timerRan = true;
          resolve();
        }),
      );
      const point = await memory.captureAsync('atlas', root, context);
      expect(timerRan).toBe(true);
      await timer;
      expect(readFileSync(join(root, '.git', 'index'))).toEqual(index);
      expect(git('show', `${point.indexTree}:note.md`)).toBe('staged');
      expect(git('show', `${point.workingTree}:note.md`)).toBe('working');
      expect(git('show', `${point.workingTree}:new.txt`)).toBe('untracked');
      expect(point.causeId).toBe('event');
      expect(memory.latest('atlas')).toEqual(point);
      expect(memory.capture('atlas', root, context).id).toBe(point.id);
      expect((await memory.captureAsync('atlas', root, context)).id).toBe(point.id);
      expect((await memory.captureAsync('atlas', root, context, true)).id).not.toBe(point.id);
    } finally {
      database.close();
    }
  },
);

it('unwinds temporary index and leaves no checkpoint when a yielded Git step fails', () => {
  const { root, database, memory, context } = fixture();
  try {
    const steps = memory.captureSteps('atlas', root, context);
    let step = steps.next();
    while (!step.done) {
      const index = step.value.options.env?.GIT_INDEX_FILE;
      if (typeof index === 'string') {
        expect(existsSync(dirname(index))).toBe(true);
        expect(() => steps.throw(new Error('injected Git failure'))).toThrow(
          'injected Git failure',
        );
        expect(existsSync(dirname(index))).toBe(false);
        expect(memory.history('atlas')).toEqual([]);
        return;
      }
      step = steps.next(execFileSync('git', step.value.args, step.value.options));
    }
    throw new Error('Expected a temporary-index Git step');
  } finally {
    database.close();
  }
});
