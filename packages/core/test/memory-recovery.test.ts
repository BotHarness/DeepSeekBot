import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCAL_HUMAN_ID } from '../src/channels/channel.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createMemoryRecovery } from '../src/memory/recovery.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

describe('Memory recovery checkpoints', () => {
  it(
    'retains staged and working files across reset, merge, branch movement, restore, and restart',
    { timeout: 30_000 },
    () => {
      const home = createTempRoot('botharness-memory-recovery-');
      const root = join(home, 'memory');
      expect(ensureMemoryRepository({ memoryDir: root }).ok).toBe(true);
      const database = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
      });
      try {
        const memory = createMemoryRecovery({
          database: attachOperationalModule(database, 'memory'),
          now: FIXED_NOW,
        });
        git(root, 'config', 'user.name', 'Test Author');
        git(root, 'config', 'user.email', 'test@example.com');
        git(root, 'config', 'commit.gpgsign', 'true');
        const baseline = memory.capture('atlas', root, {
          origin: 'host-observation',
          originId: 'botharness-host',
          causeKind: 'memory-scan',
          causeId: 'atlas',
        });
        git(root, 'config', '--unset', 'commit.gpgsign');
        writeFileSync(join(root, 'note.md'), 'original\n');
        git(root, 'add', 'note.md');
        git(root, 'commit', '-m', 'Add note');
        const dirtyHead = git(root, 'rev-parse', 'HEAD');
        writeFileSync(join(root, 'note.md'), 'staged\n');
        git(root, 'add', 'note.md');
        writeFileSync(join(root, 'note.md'), 'working\n');
        writeFileSync(join(root, 'new.txt'), 'untracked\n');
        const dirty = memory.capture('atlas', root, {
          origin: 'agent-session',
          originId: 'session-atlas',
          causeKind: 'source-event',
          causeId: 'event-atlas',
        });
        expect(dirty.head).toBe(dirtyHead);
        expect(dirty.originId).toBe('session-atlas');
        expect(dirty.causeId).toBe('event-atlas');
        expect(dirty.indexTree).not.toBe(dirty.workingTree);
        expect(
          memory.capture('atlas', root, {
            origin: 'host-observation',
            originId: 'botharness-host',
            causeKind: 'memory-scan',
            causeId: 'atlas',
          }).id,
        ).toBe(dirty.id);

        git(root, 'reset', '--hard', dirtyHead);
        git(root, 'clean', '-fd');
        git(root, 'switch', '-c', 'side');
        writeFileSync(join(root, 'side.md'), 'side\n');
        git(root, 'add', 'side.md');
        git(root, 'commit', '-m', 'Side note');
        git(root, 'switch', 'main');
        writeFileSync(join(root, 'main.md'), 'main\n');
        git(root, 'add', 'main.md');
        git(root, 'commit', '-m', 'Main note');
        git(root, 'merge', '--no-ff', 'side', '-m', 'Merge notes');
        const merge = memory.capture('atlas', root, {
          origin: 'host-observation',
          originId: 'botharness-host',
          causeKind: 'memory-scan',
          causeId: 'atlas',
        });
        expect(git(root, 'rev-list', '--parents', '-n', '1', merge.head).split(' ')).toHaveLength(
          3,
        );
        git(root, 'reset', '--hard', baseline.head);
        const reset = memory.capture('atlas', root, {
          origin: 'host-observation',
          originId: 'botharness-host',
          causeKind: 'memory-scan',
          causeId: 'atlas',
        });
        expect(reset.head).toBe(baseline.head);
        expect(git(root, 'rev-parse', merge.ref)).toMatch(/^[0-9a-f]{40}$/u);

        writeFileSync(join(root, 'unobserved.txt'), 'must survive refusal\n');
        expect(() =>
          memory.restore(OWNER_HUMAN_CONTEXT, 'atlas', root, dirty.id, reset.id),
        ).toThrow('Memory changed since recovery was opened');
        expect(memory.latest('atlas')?.origin).toBe('host-observation');
        expect(memory.latest('atlas')?.causeKind).toBe('memory-scan');
        expect(readFileSync(join(root, 'unobserved.txt'), 'utf8')).toBe('must survive refusal\n');
        git(root, 'clean', '-fd');
        const current = memory.capture('atlas', root, {
          origin: 'host-observation',
          originId: 'botharness-host',
          causeKind: 'memory-scan',
          causeId: 'atlas',
        });
        writeFileSync(join(root, '.git', 'info', 'exclude'), 'private-cache.txt\n');
        writeFileSync(join(root, 'private-cache.txt'), 'ignored backup content\n');

        const result = memory.restore(OWNER_HUMAN_CONTEXT, 'atlas', root, dirty.id, current.id);
        expect(existsSync(result.archivePath)).toBe(true);
        expect(readFileSync(join(result.archivePath, 'private-cache.txt'), 'utf8')).toBe(
          'ignored backup content\n',
        );
        expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('main');
        expect(git(root, 'rev-parse', 'HEAD')).toBe(dirtyHead);
        expect(git(root, 'diff', '--cached', '--', 'note.md')).toContain('+staged');
        expect(git(root, 'diff', '--', 'note.md')).toContain('+working');
        expect(readFileSync(join(root, 'new.txt'), 'utf8')).toBe('untracked\n');
        expect(git(root, 'status', '--porcelain')).toContain('?? new.txt');
        const reopened = createMemoryRecovery({
          database: attachOperationalModule(database, 'memory'),
          now: FIXED_NOW,
        });
        expect(reopened.history('atlas').map((point) => point.id)).toContain(dirty.id);
        expect(reopened.latest('atlas')?.originId).toBe(LOCAL_HUMAN_ID);
        expect(reopened.latest('atlas')?.causeKind).toBe('human-restore');
        const firstRestoreId = reopened.latest('atlas')?.id;
        if (firstRestoreId === undefined) throw new Error('Missing restore checkpoint');
        const repeated = reopened.restore(
          OWNER_HUMAN_CONTEXT,
          'atlas',
          root,
          dirty.id,
          firstRestoreId,
        );
        expect(existsSync(repeated.archivePath)).toBe(true);
        expect(reopened.latest('atlas')?.id).not.toBe(firstRestoreId);
        expect(reopened.latest('atlas')?.causeKind).toBe('human-restore');
      } finally {
        database.close();
      }
    },
  );
});
