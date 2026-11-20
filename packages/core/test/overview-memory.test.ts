import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createTestRosterStore } from './roster-fixture.js';
import { createTestRegistry } from './registry-fixture.js';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { createMemoryService } from '../src/memory/service.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

function setup() {
  const root = createTempRoot();
  const registry = createTestRegistry({
    rootDir: join(root, 'bots'),
    initializeMemory: (memoryDir) => {
      const result = ensureMemoryRepository({ memoryDir });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });
  registry.create({ slug: 'ada', displayName: 'Ada' });
  const ownership = createTestOwnership();
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const memory = createMemoryService({
    database,
    registry,
    ownership,
    now: () => new Date(2026, 9, 2, 12),
  });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
    registry,
    ownership,
    memory,
    channels: createChannelStore({ rootDir: join(root, 'channels') }),
    roster: createTestRosterStore(),
    states: createBotStateTracker(),
  });
  const dir = registry.memoryDirFor('ada')!;
  const git = (args: string[], at?: string, authorAt?: string) =>
    execFileSync('git', args, {
      cwd: dir,
      encoding: 'utf8',
      windowsHide: true,
      env: {
        ...process.env,
        ...(at ? { GIT_COMMITTER_DATE: at, GIT_AUTHOR_DATE: authorAt ?? at } : {}),
      },
    });
  git(['commit', '--amend', '--no-edit', '--no-gpg-sign'], '2026-09-20T12:00:00+09:00');
  const commit = (name: string, at: string, authorAt?: string) => {
    writeFileSync(join(dir, name), name);
    git(['add', name]);
    git(['commit', '--no-gpg-sign', '-m', name], at, authorAt);
  };
  return { registry, memory, methods, dir, git, commit };
}

it('shows ordinary Memory commits by committer day once across refs, separately from current uncommitted work', async () => {
  const { methods, memory, dir, git, commit } = setup();
  commit('old.md', '2026-09-25T12:00:00+09:00');
  commit('first.md', '2026-09-26T12:00:00+09:00');
  git(['branch', 'shared-history']);
  commit('second.md', '2026-10-01T12:00:00+09:00', '2020-01-01T12:00:00+09:00');
  commit('third.md', '2026-10-02T12:00:00+09:00');
  commit('backdated.md', '2020-01-01T12:00:00+09:00');
  writeFileSync(join(dir, 'draft.md'), 'Current uncommitted memory');
  memory.scanChanges('ada');
  git(['config', 'status.showUntrackedFiles', 'no']);
  const indexBefore = readFileSync(join(dir, '.git', 'index'));
  const before = [
    git(['rev-parse', 'HEAD']),
    git(['status', '--porcelain']),
    git(['diff', '--cached']),
  ];
  expect(
    (await memory.activity?.('ada', '2026-09-26T00:00:00+09:00'))
      ?.map(({ at }) => new Date(at).toISOString())
      .sort(),
  ).toEqual(['2026-09-26T03:00:00.000Z', '2026-10-01T03:00:00.000Z', '2026-10-02T03:00:00.000Z']);
  const result = await methods.overviewMemory({});
  if (!result.ok) throw new Error(result.error.message);
  expect(readFileSync(join(dir, '.git', 'index'))).toEqual(indexBefore);
  expect(result.value.start).toBe('2026-09-26');
  expect(result.value.end).toBe('2026-10-02');
  expect(result.value.days).toEqual([
    '2026-09-26',
    '2026-09-27',
    '2026-09-28',
    '2026-09-29',
    '2026-09-30',
    '2026-10-01',
    '2026-10-02',
  ]);
  expect(result.value.bots).toEqual([
    {
      slug: 'ada',
      displayName: 'Ada',
      state: 'ready',
      total: 3,
      counts: [1, 0, 0, 0, 0, 1, 1],
      dirty: true,
    },
  ]);
  expect([
    git(['rev-parse', 'HEAD']),
    git(['status', '--porcelain']),
    git(['diff', '--cached']),
  ]).toEqual(before);
});

it('does not present missing or invalid repositories as zero or clean and bounds Bot pages', async () => {
  const { methods, registry, dir } = setup();
  for (let i = 1; i <= 11; i++)
    registry.create({ slug: 'bot-' + String(i).padStart(2, '0'), displayName: 'Bot ' + i });
  writeFileSync(join(dir, '.git', 'HEAD'), 'invalid');
  const first = await methods.overviewMemory({});
  if (!first.ok) throw new Error(first.error.message);
  expect(first.value.bots).toHaveLength(10);
  expect(first.value.bots[0]).toEqual({ slug: 'ada', displayName: 'Ada', state: 'unavailable' });
  expect(first.value.nextCursor).toBe('bot-09');
  const second = await methods.overviewMemory({ after: first.value.nextCursor });
  if (!second.ok) throw new Error(second.error.message);
  expect(second.value.bots.map((bot) => bot.slug)).toEqual(['bot-10', 'bot-11']);
  expect(second.value.nextCursor).toBeUndefined();
  expect((await methods.overviewMemory({ after: 42 })).ok).toBe(false);
}, 45000);
