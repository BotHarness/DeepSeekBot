import { createTestRegistry } from './registry-fixture.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { LOCAL_HUMAN_ID } from '../src/channels/channel.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createMemoryService } from '../src/memory/service.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { toMemoryRelativePath } from '../src/memory/jail.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
}

function fixture() {
  const home = createTempRoot('botharness-memory-git-');
  const database = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({
    database,
    rootDir: join(home, 'bots'),
    initializeMemory(memoryDir) {
      const result = ensureMemoryRepository({ memoryDir });
      return result.ok ? { ok: true } : { ok: false, message: result.message };
    },
  });
  expect(registry.create({ slug: 'atlas', displayName: 'Atlas' }).ok).toBe(true);
  const ownership = createSessionOwnership(attachOperationalModule(database, 'session-ownership'));
  ownership.claim({
    sessionId: 'session-atlas',
    botSlug: 'atlas',
    rootRole: 'orchestrator',
    at: FIXED_NOW().toISOString(),
  });
  const source = attachOperationalModule(database, 'memory-test');
  const addSource = (id: string) =>
    source.transaction((db) => {
      db.prepare(`INSERT INTO source_events (
        source_event_id, source_kind, bot_slug, channel_id, message_id,
        body, created_at, attempt_state
      ) VALUES (?, 'human-message', 'atlas', 'dm-atlas', ?, 'remember', ?, 'running')`).run(
        id,
        id,
        FIXED_NOW().toISOString(),
      );
    });
  const memory = createMemoryService({ registry, ownership, database, now: FIXED_NOW });
  const root = registry.memoryDirFor('atlas');
  if (root === undefined) throw new Error('Memory root missing');
  return { home, database, registry, ownership, memory, root, addSource };
}

function makeExternalRepository(home: string) {
  const remote = join(home, 'external');
  mkdirSync(remote);
  git(remote, 'init', '-b', 'main');
  git(remote, 'config', 'user.name', 'External Author');
  git(remote, 'config', 'user.email', 'external@example.com');
  mkdirSync(join(remote, 'src'));
  mkdirSync(join(remote, '.github'));
  writeFileSync(join(remote, 'src', 'memory.ts'), 'export const memory = "remote";\n');
  writeFileSync(join(remote, '.github', 'notes.md'), 'Git metadata-style directory is data.\n');
  writeFileSync(join(remote, 'logo.bin'), Buffer.from([0, 1, 2, 255]));
  git(remote, 'add', '-A');
  git(remote, 'commit', '-m', 'External root');
  git(remote, 'switch', '-c', 'history');
  writeFileSync(join(remote, 'history.md'), 'Older branch memory\n');
  git(remote, 'add', 'history.md');
  git(remote, 'commit', '-m', 'History branch');
  const historyHead = git(remote, 'rev-parse', 'HEAD');
  git(remote, 'switch', 'main');
  writeFileSync(join(remote, 'main.md'), 'Main branch memory\n');
  git(remote, 'add', 'main.md');
  git(remote, 'commit', '-m', 'Main branch');
  git(remote, 'merge', '--no-ff', 'history', '-m', 'Merge memory histories');
  return { remote, head: git(remote, 'rev-parse', 'HEAD'), historyHead };
}

describe('current Git working tree is Memory', () => {
  it('migrates an older recorded main checkpoint to branch-scoped storage', () => {
    const home = createTempRoot('botharness-memory-migration-');
    const previousPlan = defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 14),
    );
    const sha = 'a'.repeat(40);
    let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: previousPlan });
    try {
      expect(owner.mode).toBe('ready');
      attachOperationalModule(owner, 'memory-test').transaction((db) => {
        db.prepare(
          "INSERT INTO memory_accepted_commits (bot_slug, sha, parent_sha, actor_kind, actor_id, cause_kind, cause_id, validation_result, accepted_at) VALUES (?, ?, NULL, 'system', 'test', 'repository-init', 'bootstrap', 'ok', ?)",
        ).run('atlas', sha, FIXED_NOW().toISOString());
        db.prepare(
          'INSERT INTO memory_accepted_heads (bot_slug, head_sha, updated_at) VALUES (?, ?, ?)',
        ).run('atlas', sha, FIXED_NOW().toISOString());
      });
      owner.close();

      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      expect(owner.mode).toBe('ready');
      const port = attachOperationalModule(owner, 'memory-test');
      expect(
        port.read((db) =>
          db
            .prepare('SELECT branch_name, head_sha FROM memory_accepted_heads WHERE bot_slug = ?')
            .all('atlas'),
        ),
      ).toEqual([{ branch_name: 'main', head_sha: sha }]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('shows ordinary text, code, and binary files before a commit', () => {
    const { database, memory, root } = fixture();
    try {
      const seed = git(root, 'rev-parse', 'HEAD');
      writeFileSync(join(root, 'note.md'), 'Uncommitted memory\n');
      writeFileSync(join(root, 'code.ts'), 'export const answer = 42;\n');
      writeFileSync(join(root, 'image.bin'), Buffer.from([0, 255]));
      const snapshot = memory.snapshot('atlas');
      expect(snapshot.head).toBe(seed);
      expect(snapshot.provisional).toBe(false);
      expect(snapshot.files).toEqual(expect.arrayContaining(['note.md', 'code.ts', 'image.bin']));
      expect(memory.readAccepted('atlas', 'code.ts')?.body).toBe('export const answer = 42;\n');
      expect(memory.readAccepted('atlas', 'image.bin')).toMatchObject({
        path: 'image.bin',
        head: seed,
        binary: true,
      });
      expect(git(root, 'status', '--porcelain')).toContain('code.ts');
    } finally {
      database.close();
    }
  });

  it('reads staged, unstaged, and untracked diffs without changing the repository', () => {
    const { database, memory, root } = fixture();
    try {
      const originalHead = git(root, 'rev-parse', 'HEAD');
      writeFileSync(join(root, 'note.md'), 'staged text\n');
      git(root, 'add', 'note.md');
      writeFileSync(join(root, 'note.md'), 'unstaged text\n');
      writeFileSync(join(root, 'new.ts'), 'export const memory = true;\n');
      writeFileSync(join(root, 'image.bin'), Buffer.from([0, 255]));
      const before = git(root, 'status', '--porcelain');

      expect(memory.workingChanges('atlas')).toEqual(
        expect.arrayContaining([
          { path: 'note.md', kind: 'staged', status: 'A' },
          { path: 'note.md', kind: 'unstaged', status: 'M' },
          { path: 'new.ts', kind: 'untracked', status: '?' },
        ]),
      );
      expect(memory.workingDiff('atlas', 'note.md', 'staged').diff).toContain('+staged text');
      expect(memory.workingDiff('atlas', 'note.md', 'unstaged').diff).toContain('+unstaged text');
      expect(memory.workingDiff('atlas', 'note.md', 'current').diff).toContain('+unstaged text');
      expect(memory.workingDiff('atlas', 'note.md', 'current').diff).not.toContain('+staged text');
      expect(memory.workingDiff('atlas', 'new.ts', 'untracked').diff).toContain(
        '+export const memory = true;',
      );
      expect(memory.workingDiff('atlas', 'new.ts', 'current').diff).toContain(
        '+export const memory = true;',
      );
      expect(memory.workingDiff('atlas', 'image.bin', 'untracked').binary).toBe(true);
      expect(() => memory.workingDiff('atlas', '../outside', 'untracked')).toThrow();
      expect(git(root, 'status', '--porcelain')).toBe(before);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(originalHead);
    } finally {
      database.close();
    }
  });

  it('keeps phase diffs for an indexed file removed from disk, without a current diff', () => {
    const { database, memory, root } = fixture();
    try {
      writeFileSync(join(root, 'draft.md'), 'draft\n');
      git(root, 'add', 'draft.md');
      rmSync(join(root, 'draft.md'));
      expect(memory.workingChanges('atlas')).toEqual(
        expect.arrayContaining([
          { path: 'draft.md', kind: 'staged', status: 'A' },
          { path: 'draft.md', kind: 'unstaged', status: 'D' },
        ]),
      );
      expect(memory.workingDiff('atlas', 'draft.md', 'staged').diff).toContain('+draft');
      expect(memory.workingDiff('atlas', 'draft.md', 'unstaged').diff).toContain('-draft');
      expect(() => memory.workingDiff('atlas', 'draft.md', 'current')).toThrow();
    } finally {
      database.close();
    }
  });

  it('detects Git binary markers without treating matching text content as binary', () => {
    const { database, memory, root } = fixture();
    try {
      writeFileSync(join(root, 'words.md'), 'Binary files a/x and b/x differ\n');
      writeFileSync(join(root, 'image.bin'), Buffer.from([0, 255]));
      git(root, 'add', 'words.md', 'image.bin');
      expect(memory.workingDiff('atlas', 'words.md', 'staged').binary).toBe(false);
      expect(memory.workingDiff('atlas', 'image.bin', 'staged').binary).toBe(true);
    } finally {
      database.close();
    }
  });

  it('lists only the commits that touched one file when asked for its history', () => {
    const { database, memory, root } = fixture();
    try {
      writeFileSync(join(root, 'alpha.md'), 'one\n');
      git(root, 'add', 'alpha.md');
      git(root, 'commit', '-m', 'alpha');
      writeFileSync(join(root, 'beta.md'), 'two\n');
      git(root, 'add', 'beta.md');
      git(root, 'commit', '-m', 'beta');
      expect(memory.gitGraph('atlas', 0, 'alpha.md').commits.map((c) => c.subject)).toEqual([
        'alpha',
      ]);
      expect(
        memory
          .gitGraph('atlas')
          .commits.map((c) => c.subject)
          .slice(0, 2),
      ).toEqual(['beta', 'alpha']);
      expect(() => memory.gitGraph('atlas', 0, '../outside.md')).toThrow();
    } finally {
      database.close();
    }
  });

  it('follows a native fetch and reset to an unrelated merged history without admission', () => {
    const { home, database, registry, ownership, memory, root, addSource } = fixture();
    try {
      const external = makeExternalRepository(home);
      const seed = memory.snapshot('atlas').head;
      git(root, 'remote', 'add', 'origin', external.remote);
      git(root, 'fetch', 'origin');
      git(root, 'reset', '--hard', 'origin/main');
      git(root, 'branch', 'history', 'origin/history');
      expect(git(root, 'rev-parse', 'HEAD')).toBe(external.head);
      expect(memory.snapshot('atlas')).toMatchObject({ head: external.head, provisional: false });
      expect(memory.snapshot('atlas').files).toEqual(
        expect.arrayContaining(['src/memory.ts', '.github/notes.md', 'logo.bin', 'history.md']),
      );
      expect(memory.readAccepted('atlas', 'src/memory.ts')?.body).toContain('"remote"');
      expect(memory.readAccepted('atlas', '.github/notes.md')?.body).toContain('data');
      expect(memory.readAccepted('atlas', 'logo.bin')?.binary).toBe(true);
      const graph = memory.gitGraph('atlas');
      expect(graph.currentBranch).toBe('main');
      expect(graph.head).toBe(external.head);
      expect(graph.branches).toEqual(expect.arrayContaining(['main', 'history']));
      expect(graph.commits.find((commit) => commit.sha === external.head)?.parents).toHaveLength(2);
      expect(graph.commits.some((commit) => commit.sha === seed)).toBe(false);

      addSource('observe-external');
      memory.prepareTurn('atlas', 'session-atlas');
      const checkpoints = memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'observe-external',
      });
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0]?.sha).toBe(external.head);
      expect(checkpoints[0]?.actorId).toBe('botharness-host');
      expect(memory.snapshot('atlas').head).toBe(external.head);
      const reopened = createMemoryService({ registry, ownership, database, now: FIXED_NOW });
      expect(reopened.readAccepted('atlas', 'src/memory.ts')?.body).toContain('"remote"');
    } finally {
      database.close();
    }
  });

  it('switches to an unrecorded local branch and reads its files in the same Session', () => {
    const { home, database, memory, root, addSource } = fixture();
    try {
      const external = makeExternalRepository(home);
      git(root, 'remote', 'add', 'origin', external.remote);
      git(root, 'fetch', 'origin');
      git(root, 'reset', '--hard', 'origin/main');
      git(root, 'branch', 'history', 'origin/history');
      addSource('switch-history');
      memory.prepareTurn('atlas', 'session-atlas');
      const switched = memory.switchBranch({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        branch: 'history',
      });
      expect(switched.head).toBe(external.historyHead);
      expect(readFileSync(join(root, 'history.md'), 'utf8')).toBe('Older branch memory\n');
      expect(memory.readAccepted('atlas', 'history.md')?.body).toBe('Older branch memory\n');
      expect(memory.snapshot('atlas').head).toBe(external.historyHead);
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'switch-history',
      });
      expect(memory.gitGraph('atlas').currentBranch).toBe('history');
    } finally {
      database.close();
    }
  });

  it('keeps a failed-turn edit visible and permits the next turn without changing Git', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      const seed = memory.snapshot('atlas').head;
      memory.prepareTurn('atlas', 'session-atlas');
      writeFileSync(join(root, 'unfinished.md'), 'Visible now\n');
      memory.abortTurn('atlas', 'session-atlas');
      expect(memory.readAccepted('atlas', 'unfinished.md')?.body).toBe('Visible now\n');
      expect(memory.snapshot('atlas').head).toBe(seed);
      expect(memory.gitGraph('atlas').dirty).toBe(true);
      addSource('next-turn');
      memory.prepareTurn('atlas', 'session-atlas');
      expect(
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'next-turn',
        }),
      ).toEqual([]);
      expect(git(root, 'status', '--porcelain')).toContain('unfinished.md');
    } finally {
      database.close();
    }
  });

  it('lets the Human edit a code file on a raw branch and records the resulting commit', () => {
    const { home, database, memory, root } = fixture();
    try {
      const external = makeExternalRepository(home);
      git(root, 'remote', 'add', 'origin', external.remote);
      git(root, 'fetch', 'origin');
      git(root, 'reset', '--hard', 'origin/main');
      const saved = memory.saveHuman({
        botSlug: 'atlas',
        path: 'src/memory.ts',
        body: 'export const memory = "human";\n',
        expectedHead: external.head,
        editId: 'edit-code',
      });
      expect(saved.actorKind).toBe('human');
      expect(saved.actorId).toBe(LOCAL_HUMAN_ID);
      expect(saved.parentSha).toBe(external.head);
      expect(memory.readAccepted('atlas', 'src/memory.ts')?.body).toContain('"human"');
      expect(memory.gitGraph('atlas').head).toBe(saved.sha);
    } finally {
      database.close();
    }
  });

  it('restores an older commit after committing uncommitted work and naming the version before it', () => {
    const { database, memory, root } = fixture();
    try {
      git(root, 'config', 'user.name', 'Test Author');
      git(root, 'config', 'user.email', 'test@example.com');
      writeFileSync(join(root, 'note.md'), 'first\n');
      git(root, 'add', 'note.md');
      git(root, 'commit', '-m', 'First note');
      const first = git(root, 'rev-parse', 'HEAD');
      writeFileSync(join(root, 'note.md'), 'second\n');
      writeFileSync(join(root, 'later.md'), 'later\n');
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'Second note');
      const second = git(root, 'rev-parse', 'HEAD');
      writeFileSync(join(root, 'note.md'), 'unsaved\n');
      writeFileSync(join(root, 'draft.md'), 'untracked\n');

      expect(() =>
        memory.restoreCommitHuman({
          botSlug: 'atlas',
          sha: first,
          expectedHead: first,
          restoreId: '33333333-3333-4333-8333-333333333333',
        }),
      ).toThrow('Memory changed since the Human opened it');
      expect(readFileSync(join(root, 'draft.md'), 'utf8')).toBe('untracked\n');

      const result = memory.restoreCommitHuman({
        botSlug: 'atlas',
        sha: first,
        expectedHead: second,
        restoreId: '44444444-4444-4444-8444-444444444444',
        name: '整理前 的草稿',
      });
      expect(git(root, 'rev-parse', 'HEAD')).toBe(result.head);
      expect(git(root, 'rev-parse', 'HEAD^')).toBe(result.backup);
      expect(git(root, 'rev-parse', 'HEAD^^')).toBe(second);
      expect(git(root, 'log', '-1', '--format=%s', result.backup!)).toBe(
        'Back up uncommitted Memory before restore',
      );
      expect(result.version).toEqual({ tag: '整理前-的草稿', name: '整理前 的草稿' });
      expect(git(root, 'rev-parse', '整理前-的草稿^{commit}')).toBe(result.backup);
      expect(git(root, 'show', `${result.backup}:draft.md`)).toBe('untracked');
      expect(git(root, 'show', `${result.backup}:note.md`)).toBe('unsaved');
      expect(git(root, 'rev-parse', 'HEAD^{tree}')).toBe(git(root, 'rev-parse', `${first}^{tree}`));
      expect(git(root, 'log', '-1', '--format=%s')).toBe(
        `Restore Memory to ${first.slice(0, 7)}: First note`,
      );
      expect(git(root, 'status', '--porcelain')).toBe('');
      expect(existsSync(join(root, 'later.md'))).toBe(false);
      expect(readFileSync(join(root, 'note.md'), 'utf8')).toBe('first\n');
      expect(result.saved.head).toBe(second);
      expect(git(root, 'show', `${result.saved.ref}:draft.md`)).toBe('untracked');
      expect(git(root, 'show', `${result.saved.ref}:note.md`)).toBe('unsaved');
      expect(memory.recoveryHistory('atlas').map((point) => point.id)).toContain(result.saved.id);

      const back = memory.restoreCommitHuman({
        botSlug: 'atlas',
        sha: second,
        expectedHead: result.head,
        restoreId: '55555555-5555-4555-8555-555555555555',
      });
      expect(back.backup).toBeNull();
      expect(back.version).toBeNull();
      const named = memory.nameVersionHuman({
        botSlug: 'atlas',
        sha: first,
        name: '整理前 的草稿',
      });
      expect(named).toEqual({ tag: '整理前-的草稿-2', name: '整理前 的草稿' });
      expect(memory.nameVersionHuman({ botSlug: 'atlas', sha: first, name: 'a..b' }).tag).toBe(
        `version-${first.slice(0, 7)}`,
      );
      expect(() => memory.nameVersionHuman({ botSlug: 'atlas', sha: first, name: ' ' })).toThrow(
        'Version name',
      );
      const graph = memory.gitGraph('atlas');
      expect(graph.commits.find((commit) => commit.sha === first)?.versions).toEqual([
        { tag: `version-${first.slice(0, 7)}`, name: 'a..b' },
        { tag: '整理前-的草稿-2', name: '整理前 的草稿' },
      ]);
      expect(memory.versions('atlas').map((version) => [version.tag, version.sha])).toEqual(
        expect.arrayContaining([
          ['整理前-的草稿', result.backup],
          ['整理前-的草稿-2', first],
          [`version-${first.slice(0, 7)}`, first],
        ]),
      );
      expect(
        memory.versions('atlas').find((version) => version.tag === '整理前-的草稿'),
      ).toMatchObject({
        name: '整理前 的草稿',
        subject: 'Back up uncommitted Memory before restore',
      });
      memory.removeVersionNameHuman({ botSlug: 'atlas', tag: '整理前-的草稿-2' });
      expect(
        memory.gitGraph('atlas').commits.find((commit) => commit.sha === first)?.versions,
      ).toEqual([{ tag: `version-${first.slice(0, 7)}`, name: 'a..b' }]);
      expect(git(root, 'rev-parse', `${back.head}^`)).toBe(result.head);
      expect(git(root, 'rev-parse', `${back.head}^{tree}`)).toBe(
        git(root, 'rev-parse', `${second}^{tree}`),
      );
      expect(readFileSync(join(root, 'later.md'), 'utf8')).toBe('later\n');
    } finally {
      database.close();
    }
  });

  it('keeps the Git directory and symlink escapes outside the Memory file API', () => {
    const { home, database, memory, root } = fixture();
    try {
      expect(toMemoryRelativePath('.github/notes.md')).toBe('.github/notes.md');
      expect(() => toMemoryRelativePath('.git/config')).toThrow(/reserved/);
      const outside = join(home, 'secret.txt');
      writeFileSync(outside, 'outside\n');
      symlinkSync(outside, join(root, 'escape.txt'));
      expect(memory.snapshot('atlas').files).toContain('escape.txt');
      expect(() => memory.readAccepted('atlas', 'escape.txt')).toThrow(/escapes/);
      expect(existsSync(join(dirname(root), 'secret.txt'))).toBe(false);
    } finally {
      database.close();
    }
  });

  it('requires an owning Orchestrator Session for turn observation', () => {
    const { database, memory } = fixture();
    try {
      expect(() => memory.prepareTurn('atlas', 'unowned')).toThrow(/does not own/);
    } finally {
      database.close();
    }
  });

  it.each([
    ['group-join-request', 'owner-join-request'],
    ['group-join-decision', 'requester-join-decision'],
  ] as const)('reconciles a %s Bot Inbox notice for its owning Orchestrator', (reason, id) => {
    const { database, memory } = fixture();
    try {
      attachOperationalModule(database, 'memory-test').transaction((db) => {
        db.prepare(
          "INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, attempt_state) VALUES (?, 'system-message', 'atlas', 'dm-atlas', ?, 'Join notice', ?, 'running')",
        ).run(id, id, FIXED_NOW().toISOString());
        db.prepare(
          'INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES (?, ?, ?)',
        ).run(id, 'atlas', reason);
      });
      memory.prepareTurn('atlas', 'session-atlas');
      expect(
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: id,
        }),
      ).toEqual([]);
    } finally {
      database.close();
    }
  });

  it('allows an owned Host lifecycle notice to reconcile the Orchestrator Memory turn', () => {
    const { database, memory } = fixture();
    try {
      attachOperationalModule(database, 'memory-test').transaction((db) => {
        db.prepare(`INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, body, created_at, handled_at, attempt_state
        ) VALUES (?, 'assignment-lifecycle', 'atlas', ?, ?, ?, 'handled')`).run(
          'stop-notice',
          'Assignment stopped',
          FIXED_NOW().toISOString(),
          FIXED_NOW().toISOString(),
        );
        db.prepare(`INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
                    VALUES (?, 'atlas', 'assignment-lifecycle')`).run('stop-notice');
      });
      memory.prepareTurn('atlas', 'session-atlas');
      expect(
        memory.reconcileTurn({
          botSlug: 'atlas',
          sessionId: 'session-atlas',
          sourceEventId: 'stop-notice',
        }),
      ).toEqual([]);
    } finally {
      database.close();
    }
  });
});

describe('worktree delta for out-of-band Memory changes', () => {
  function agentTurn(
    memory: ReturnType<typeof fixture>['memory'],
    addSource: (id: string) => void,
    id: string,
    edit?: () => void,
  ) {
    addSource(id);
    expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
    edit?.();
    return memory.reconcileTurn({
      botSlug: 'atlas',
      sessionId: 'session-atlas',
      sourceEventId: id,
    });
  }

  function gitIdentity(root: string) {
    git(root, 'config', 'user.name', 'Out Of Band');
    git(root, 'config', 'user.email', 'oob@example.com');
  }

  it('returns the commit subject with its diff', () => {
    const { database, memory, root } = fixture();
    try {
      gitIdentity(root);
      writeFileSync(join(root, 'launch.md'), 'Launch is Friday\n');
      git(root, 'add', 'launch.md');
      git(root, 'commit', '-m', 'Remember the launch date');
      const sha = git(root, 'rev-parse', 'HEAD');
      expect(memory.gitCommitDiff('atlas', sha)).toMatchObject({
        sha,
        subject: 'Remember the launch date',
        files: [{ path: 'launch.md', status: 'A' }],
      });
    } finally {
      database.close();
    }
  });

  it('stays silent on the first turn and for the agent’s own committed turn', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'turn-one', () => {
        writeFileSync(join(root, 'agent-note.md'), 'Agent wrote this\n');
        git(root, 'add', 'agent-note.md');
        git(root, 'commit', '-m', 'agent note');
      });
      addSource('turn-two');
      expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('annotates an out-of-band unstaged edit with its path, once', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'human-note.md'), 'Human wrote this\n');
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain('Memory changed since your last turn');
      expect(note).toContain('human-note.md');
    } finally {
      database.close();
    }
  });

  it('notices later edits to the same dirty path and changes in the Git index', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'human-note.md'), 'First edit\n');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.workingPaths).toEqual(['human-note.md']);
      memory.abortTurn('atlas', 'session-atlas');

      writeFileSync(join(root, 'human-note.md'), 'Second edit\n');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.workingPaths).toEqual(['human-note.md']);
      memory.abortTurn('atlas', 'session-atlas');

      git(root, 'add', 'human-note.md');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.workingPaths).toEqual(['human-note.md']);
      memory.abortTurn('atlas', 'session-atlas');

      writeFileSync(join(root, 'human-note.md'), 'Third edit\n');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.workingPaths).toEqual(['human-note.md']);
    } finally {
      database.close();
    }
  });

  it('does not repeatedly report a staged deletion and untracked file at the same path', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline', () => {
        writeFileSync(join(root, 'notes.md'), 'Tracked note\n');
        git(root, 'add', 'notes.md');
        git(root, 'commit', '-m', 'Track note');
      });
      git(root, 'rm', '--cached', 'notes.md');
      addSource('next');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.workingPaths).toEqual(['notes.md']);
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'next',
      });
      addSource('unchanged');
      expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('reads the exact Git index entry for a filename containing pathspec characters', () => {
    const { database, memory, root } = fixture();
    try {
      writeFileSync(join(root, 'note[1].md'), 'Literal path\n');
      writeFileSync(join(root, 'note1.md'), 'Other path\n');
      git(root, '--literal-pathspecs', 'add', '--', 'note[1].md');
      git(root, 'add', 'note1.md');
      const observation = JSON.parse(memory.scanChanges('atlas').observationJson) as {
        files: Array<{ path: string; version: string }>;
      };
      const literal = observation.files.find((file) => file.path === 'note[1].md');
      const exactIndex = git(root, 'rev-parse', ':note[1].md');
      const otherIndex = git(root, 'rev-parse', ':note1.md');
      expect(literal?.version).toContain(exactIndex);
      expect(literal?.version).not.toContain(otherIndex);
    } finally {
      database.close();
    }
  });

  it('annotates an out-of-band disk commit with their paths', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'human-note.md'), 'Human wrote this\n');
      git(root, 'add', 'human-note.md');
      git(root, 'commit', '-m', 'human note');
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain('Memory changed since your last turn');
      expect(note).toContain('human-note.md');
    } finally {
      database.close();
    }
  });

  it('notes an out-of-band branch switch', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'detour');
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain("Memory branch is now 'detour'");
    } finally {
      database.close();
    }
  });

  it('adds the frozen-persona sentence for PERSONA.md', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      writeFileSync(join(root, 'PERSONA.md'), 'You are now someone else.\n');
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain('PERSONA.md');
      expect(note).toContain('frozen');
    } finally {
      database.close();
    }
  });

  it('reports Human UI saves as out-of-band', () => {
    const { database, memory, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      const baselineHead = memory.snapshot('atlas').head;
      if (baselineHead === null) throw new Error('Memory head missing');
      const saved = memory.saveHuman({
        botSlug: 'atlas',
        path: 'ui-note.md',
        body: 'Saved in the UI\n',
        expectedHead: baselineHead,
        editId: 'edit-ui',
      });
      expect(saved.actorKind).toBe('human');
      addSource('next');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.summary).toContain('ui-note.md');
    } finally {
      database.close();
    }
  });

  it('parses staged renames without corrupting the original path', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline', () => {
        writeFileSync(join(root, 'alpha-note.md'), 'Alpha\n');
        git(root, 'add', 'alpha-note.md');
        git(root, 'commit', '-m', 'alpha note');
      });
      git(root, 'mv', 'alpha-note.md', 'beta-note.md');
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain('beta-note.md');
      expect(note).not.toContain('alpha-note.md');
    } finally {
      database.close();
    }
  });

  it('names only the branch on an out-of-band switch, even when many files differ', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'side');
      writeFileSync(join(root, 'side-file-1.md'), 'one\n');
      writeFileSync(join(root, 'side-file-2.md'), 'two\n');
      git(root, 'add', '-A');
      git(root, 'commit', '-m', 'side work');
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain("Memory branch is now 'side'");
      expect(note).not.toContain('side-file-1.md');
      expect(note).not.toContain('frozen');
    } finally {
      database.close();
    }
  });

  it('stays silent after a tool-driven branch switch', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'side');
      writeFileSync(join(root, 'side-note.md'), 'Side\n');
      git(root, 'add', 'side-note.md');
      git(root, 'commit', '-m', 'side note');
      addSource('adopt-side');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.summary).toContain(
        "Memory branch is now 'side'",
      );
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'adopt-side',
      });
      addSource('switch-back');
      expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
      const switched = memory.switchBranch({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        branch: 'main',
      });
      expect(switched.to).toBe('main');
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'switch-back',
      });
      addSource('after');
      expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('leaves no stuck turn behind when worktree observation fails', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '--detach', 'HEAD');
      addSource('broken');
      expect(() => memory.prepareTurn('atlas', 'session-atlas')).toThrow(/local branch/);
      git(root, 'switch', 'main');
      addSource('recovered');
      expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'recovered',
      });
    } finally {
      database.close();
    }
  });

  it('keeps turns available and advances the observation after an unresolved merge', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      gitIdentity(root);
      writeFileSync(join(root, 'conflict.md'), 'base\n');
      git(root, 'add', 'conflict.md');
      git(root, 'commit', '-m', 'Base note');
      agentTurn(memory, addSource, 'baseline');
      git(root, 'switch', '-c', 'side');
      writeFileSync(join(root, 'conflict.md'), 'side\n');
      git(root, 'commit', '-am', 'Side note');
      git(root, 'switch', 'main');
      writeFileSync(join(root, 'conflict.md'), 'main\n');
      git(root, 'commit', '-am', 'Main note');
      expect(() => git(root, 'merge', 'side')).toThrow();
      expect(git(root, 'ls-files', '-u')).not.toBe('');
      addSource('conflicted');
      expect(() => memory.prepareTurn('atlas', 'session-atlas')).not.toThrow();
      memory.abortTurn('atlas', 'session-atlas');
      addSource('next');
      expect(memory.prepareTurn('atlas', 'session-atlas')).toBeUndefined();
    } finally {
      database.close();
    }
  });

  it('counts overflowed paths instead of silently dropping them', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      for (let index = 0; index < 40; index += 1) {
        writeFileSync(join(root, `overflow-${String(index).padStart(2, '0')}.md`), 'x\n');
      }
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain('(+10 more)');
      expect(note?.endsWith('…(truncated)')).toBe(false);
    } finally {
      database.close();
    }
  });

  it('keeps a turn available when more than 500 working paths change', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      for (let index = 0; index < 505; index += 1) {
        writeFileSync(
          join(root, `many-${String(index).padStart(3, '0')}-${'x'.repeat(75)}.md`),
          'x\n',
        );
      }
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note).toContain('More than 500 working Memory changes');
      memory.reconcileTurn({
        botSlug: 'atlas',
        sessionId: 'session-atlas',
        sourceEventId: 'next',
      });
      writeFileSync(join(root, `many-505-${'x'.repeat(75)}.md`), 'x\n');
      addSource('after');
      expect(memory.prepareTurn('atlas', 'session-atlas')?.summary).toContain(
        'More than 500 working Memory changes',
      );
    } finally {
      database.close();
    }
  });

  it('caps annotations in UTF-8 bytes without splitting characters', () => {
    const { database, memory, root, addSource } = fixture();
    try {
      agentTurn(memory, addSource, 'baseline');
      for (let index = 0; index < 40; index += 1) {
        const name = `记忆文件-${String(index).padStart(2, '0')}-${'记'.repeat(60)}.md`;
        writeFileSync(join(root, name), 'x\n');
      }
      addSource('next');
      const note = memory.prepareTurn('atlas', 'session-atlas')?.summary;
      expect(note?.endsWith('…(truncated)')).toBe(true);
      const kept = note?.split('\n…(truncated)')[0] ?? '';
      expect(Buffer.byteLength(kept, 'utf8')).toBeLessThanOrEqual(4096);
      expect(
        /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/u.test(note ?? ''),
      ).toBe(false);
    } finally {
      database.close();
    }
  });
});
