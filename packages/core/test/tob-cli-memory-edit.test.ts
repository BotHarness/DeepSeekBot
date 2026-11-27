import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runBotCreateCli } from '../src/cli/bot-create-cli.js';
import { parseAgentManagement } from '../src/cli/cli-agent-management.js';
import { humanContext, OWNER_HUMAN_CONTEXT, type HumanContext } from '../src/humans/context.js';
import { unifiedLineDiff } from '../src/memory/line-diff.js';
import { createCore } from '../src/plugin.js';
import { startTobCliBroker, type TobCliBroker } from '../src/features/tob/cli-broker.js';
import {
  createTobMemoryEditOperations,
  MAX_MEMORY_REVIEW_DIFF_BYTES,
} from '../src/features/tob/cli-memory-edit-operations.js';
import type { TobManagementProposal } from '../src/kernel/tob-cli-operations.js';
import { TobError } from '../src/tob/service.js';
import { createTempRoot } from './helpers.js';

const cores: ReturnType<typeof createCore>[] = [];
const brokers: TobCliBroker[] = [];
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(brokers.splice(0).map((broker) => broker.close()));
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    shell: false,
  }).trim();
}
function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function fixture() {
  const root = createTempRoot('tob-memory-edit-');
  roots.push(root);
  const core = createCore({ dshHome: root });
  cores.push(core);
  expect(core.registry.create({ slug: 'research', displayName: 'Research' }).ok).toBe(true);
  const memoryRoot = core.registry.memoryDirFor('research')!;
  git(memoryRoot, 'config', 'user.name', 'Test Author');
  git(memoryRoot, 'config', 'user.email', 'test@example.com');
  const head = () => core.memory.snapshot('research').head ?? '';
  head();
  writeFileSync(join(memoryRoot, 'SOUL.md'), '# Research\n\nCareful and curious.\n');
  git(memoryRoot, 'add', 'SOUL.md');
  git(memoryRoot, 'commit', '-m', 'Soul');
  let human: HumanContext = OWNER_HUMAN_CONTEXT;
  const protectedBots = new Set<string>();
  const saveHuman = vi.spyOn(core.memory, 'saveHuman');
  const restoreCommitHuman = vi.spyOn(core.memory, 'restoreCommitHuman');
  const prepare = createTobMemoryEditOperations({
    registry: core.registry,
    memory: () => core.memory,
    human: () => human,
    isProtectedBot: (slug) => protectedBots.has(slug),
  });
  const soul = () => readFileSync(join(memoryRoot, 'SOUL.md'), 'utf8');
  const commits = () => Number(git(memoryRoot, 'rev-list', '--count', 'HEAD'));
  const humanEdit = (path: string, body: string) => {
    writeFileSync(join(memoryRoot, path), body);
    git(memoryRoot, 'add', path);
    git(memoryRoot, 'commit', '-m', `edit ${path}`);
    return git(memoryRoot, 'rev-parse', 'HEAD');
  };
  return {
    root,
    core,
    memoryRoot,
    head,
    prepare,
    soul,
    commits,
    humanEdit,
    saveHuman,
    restoreCommitHuman,
    protectedBots,
    setHuman: (next: HumanContext) => {
      human = next;
    },
  };
}

async function proposalOf(prepared: ReturnType<ReturnType<typeof fixture>['prepare']>) {
  const value = await prepared;
  if (!value?.proposal) throw new Error('expected a reviewed proposal');
  return { prepared: value, proposal: value.proposal as TobManagementProposal };
}

async function refusal(action: () => unknown): Promise<string> {
  try {
    await action();
  } catch (error) {
    if (error instanceof TobError) return error.code;
    throw error;
  }
  throw new Error('expected a refusal');
}

describe('Tob reviewed Memory edits through the Memory owner', () => {
  it('shows the base revision and before/after diff on the card, then writes one commit and reads it back', async () => {
    const f = fixture();
    const base = f.head();
    const before = f.soul();
    const body = before + '\nPrefers short answers.\n';
    const { prepared, proposal } = await proposalOf(
      f.prepare('memory-save', {
        slug: 'research',
        path: 'SOUL.md',
        body,
        expectedHead: base,
        editId: 'soul-edit-1',
      }),
    );
    expect(proposal).toMatchObject({
      command: 'memory-save',
      target: 'research',
      previousValue: {
        path: 'SOUL.md',
        revision: base,
        exists: true,
        bytes: Buffer.byteLength(before),
        sha256: sha256(before),
      },
      patch: {
        path: 'SOUL.md',
        expectedHead: base,
        editId: 'soul-edit-1',
        bytes: Buffer.byteLength(body),
        sha256: sha256(body),
        diff: unifiedLineDiff('SOUL.md', before, body),
      },
    });
    const patch = proposal.patch as { diff: string; takesEffect: string };
    expect(patch.diff).toContain('--- a/SOUL.md\n+++ b/SOUL.md\n');
    expect(patch.diff).toContain('+Prefers short answers.\n');
    expect(patch.takesEffect).toMatch(/new Sessions.*next compaction/u);
    expect(f.saveHuman).not.toHaveBeenCalled();
    const commits = f.commits();
    const guard = vi.fn();
    const beforeEffect = vi.fn();
    const result = (await prepared.run(guard, beforeEffect)) as {
      commit: { sha: string; parentSha: string };
      file: { revision: string; sha256: string };
    };
    expect(f.commits()).toBe(commits + 1);
    expect(f.soul()).toBe(body);
    expect(result).toMatchObject({
      bot: 'research',
      commit: { sha: f.head(), parentSha: base, actorKind: 'human', causeId: 'soul-edit-1' },
      file: { path: 'SOUL.md', revision: f.head(), sha256: sha256(body) },
    });
    expect(guard).toHaveBeenCalled();
    expect(beforeEffect).toHaveBeenCalledOnce();
    expect(f.saveHuman).toHaveBeenCalledOnce();
  });

  it('refuses a stale base before any card and a concurrent edit between card and approval without writing', async () => {
    const f = fixture();
    const base = f.head();
    f.humanEdit('notes.md', 'moved on\n');
    expect(
      await refusal(() =>
        f.prepare('memory-save', {
          slug: 'research',
          path: 'notes.md',
          body: 'tob\n',
          expectedHead: base,
          editId: 'stale',
        }),
      ),
    ).toBe('memory-conflict');
    const current = f.head();
    const { prepared } = await proposalOf(
      f.prepare('memory-save', {
        slug: 'research',
        path: 'notes.md',
        body: 'tob\n',
        expectedHead: current,
        editId: 'raced',
      }),
    );
    f.humanEdit('notes.md', 'Human edited while the card was open\n');
    const commits = f.commits();
    expect(await refusal(() => prepared.run(() => {}))).toBe('memory-conflict');
    expect(f.commits()).toBe(commits);
    expect(readFileSync(join(f.memoryRoot, 'notes.md'), 'utf8')).toContain('Human edited');
    expect(f.saveHuman).not.toHaveBeenCalled();
  });

  it('writes nothing when the approval is denied or the scope is revoked after approval', async () => {
    const f = fixture();
    const base = f.head();
    const args = (editId: string) => ({
      slug: 'research',
      path: 'SOUL.md',
      body: 'A different Soul\n',
      expectedHead: base,
      editId,
    });
    const commits = f.commits();
    const denied = await proposalOf(f.prepare('memory-save', args('denied')));
    expect(
      await refusal(() =>
        denied.prepared.run(() => {
          throw new TobError('approval-denied');
        }),
      ),
    ).toBe('approval-denied');
    const revoked = await proposalOf(f.prepare('memory-save', args('revoked')));
    expect(
      await refusal(() =>
        revoked.prepared.run(() => {
          throw new TobError('tob-authority-required');
        }),
      ),
    ).toBe('tob-authority-required');
    const ownership = await proposalOf(f.prepare('memory-save', args('ownership')));
    f.setHuman(humanContext('someone-else'));
    expect(await refusal(() => ownership.prepared.run(() => {}))).toBe('permission-required');
    expect(await refusal(() => f.prepare('memory-save', args('foreign')))).toBe(
      'permission-required',
    );
    expect(f.commits()).toBe(commits);
    expect(f.saveHuman).not.toHaveBeenCalled();
  });

  it('refuses protected, archived and unknown Bots before a card', async () => {
    const f = fixture();
    const base = f.head();
    const args = (slug: string) => ({
      slug,
      path: 'SOUL.md',
      body: 'x\n',
      expectedHead: base,
      editId: 'blocked',
    });
    expect(await refusal(() => f.prepare('memory-save', args('missing')))).toBe('unknown-bot');
    f.protectedBots.add('research');
    expect(await refusal(() => f.prepare('memory-save', args('research')))).toBe('protected-bot');
    f.protectedBots.clear();
    expect(f.core.registry.setPaused('research', true).ok).toBe(true);
    expect(await refusal(() => f.prepare('memory-save', args('research')))).toBe('archived-bot');
  });

  it('reads back an exact retry without a second card or write and refuses a changed body under the same edit id', async () => {
    const f = fixture();
    const base = f.head();
    const args = {
      slug: 'research',
      path: 'MEMORY.md',
      body: '# Core Memory\n\nRetry safe.\n',
      expectedHead: base,
      editId: 'retry-edit',
    };
    const first = await proposalOf(f.prepare('memory-save', args));
    const saved = (await first.prepared.run(() => {})) as { commit: { sha: string } };
    const commits = f.commits();
    const retry = await f.prepare('memory-save', args);
    expect(retry?.proposal).toBeUndefined();
    expect(retry?.completed).toBe(true);
    expect(await retry!.run(() => {})).toMatchObject({
      replayed: true,
      commit: { sha: saved.commit.sha },
      file: { path: 'MEMORY.md', revision: saved.commit.sha, sha256: sha256(args.body) },
    });
    expect(f.commits()).toBe(commits);
    expect(f.saveHuman).toHaveBeenCalledOnce();
    expect(
      await refusal(() => f.prepare('memory-save', { ...args, body: 'Something else\n' })),
    ).toBe('memory-conflict');
  });

  it('refuses a diff too large to review and an edit that changes nothing', async () => {
    const f = fixture();
    const base = f.head();
    expect(
      await refusal(() =>
        f.prepare('memory-save', {
          slug: 'research',
          path: 'big.md',
          body: 'x'.repeat(MAX_MEMORY_REVIEW_DIFF_BYTES + 1),
          expectedHead: base,
          editId: 'big',
        }),
      ),
    ).toBe('memory-review-too-large');
    expect(
      await refusal(() =>
        f.prepare('memory-save', {
          slug: 'research',
          path: 'SOUL.md',
          body: f.soul(),
          expectedHead: base,
          editId: 'same',
        }),
      ),
    ).toBe('memory-invalid');
  });

  it('reviews a restore on its own card with its own diff and creates a new commit', async () => {
    const f = fixture();
    const first = f.humanEdit('notes.md', 'first\n');
    f.humanEdit('notes.md', 'second\n');
    const current = f.head();
    const restoreId = '3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e';
    const { prepared, proposal } = await proposalOf(
      f.prepare('memory-restore-commit', {
        slug: 'research',
        sha: first,
        expectedHead: current,
        restoreId,
      }),
    );
    expect(proposal).toMatchObject({
      command: 'memory-restore-commit',
      target: 'research',
      previousValue: { revision: current, uncommittedChanges: false },
      patch: { sha: first, expectedHead: current, restoreId, paths: ['notes.md'] },
    });
    const diff = (proposal.patch as { diff: string }).diff;
    expect(diff).toContain('-second\n+first\n');
    const result = (await prepared.run(() => {})) as { commit: { sha: string; parentSha: string } };
    expect(readFileSync(join(f.memoryRoot, 'notes.md'), 'utf8')).toBe('first\n');
    expect(result.commit).toMatchObject({ sha: f.head(), parentSha: current });
    expect(f.head()).not.toBe(first);
    expect(f.restoreCommitHuman).toHaveBeenCalledOnce();
    const retry = await f.prepare('memory-restore-commit', {
      slug: 'research',
      sha: first,
      expectedHead: current,
      restoreId,
    });
    expect(retry?.proposal).toBeUndefined();
    expect(await retry!.run(() => {})).toMatchObject({
      replayed: true,
      commit: { sha: result.commit.sha },
      takesEffect: expect.not.stringMatching(/next compaction/u),
    });
    expect(f.restoreCommitHuman).toHaveBeenCalledOnce();
  });

  it('refuses a restore when Memory moves while its card is open', async () => {
    const f = fixture();
    const first = f.humanEdit('notes.md', 'first\n');
    f.humanEdit('notes.md', 'second\n');
    const { prepared } = await proposalOf(
      f.prepare('memory-restore-commit', {
        slug: 'research',
        sha: first,
        expectedHead: f.head(),
        restoreId: '0b6c3c7e-8f1a-4e2b-9c3d-4e5f6a7b8c9d',
      }),
    );
    const moved = f.humanEdit('notes.md', 'third\n');
    expect(await refusal(() => prepared.run(() => {}))).toBe('memory-conflict');
    expect(f.head()).toBe(moved);
    expect(f.restoreCommitHuman).not.toHaveBeenCalled();
  });
});

describe('reviewed Memory line diff', () => {
  it('writes git-style hunks for new files, missing final newlines and distant changes', () => {
    expect(unifiedLineDiff('new.md', null, 'one\ntwo\n')).toBe(
      '--- /dev/null\n+++ b/new.md\n@@ -0,0 +1,2 @@\n+one\n+two\n',
    );
    expect(unifiedLineDiff('a.md', 'a\nb', 'a\nc')).toBe(
      '--- a/a.md\n+++ b/a.md\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n',
    );
    const lines = Array.from({ length: 20 }, (_, index) => `line ${index}\n`);
    const changed = [...lines];
    changed[1] = 'first\n';
    changed[18] = 'last\n';
    const diff = unifiedLineDiff('long.md', lines.join(''), changed.join(''));
    expect(diff.match(/^@@/gmu)).toHaveLength(2);
    expect(diff).toContain('@@ -1,5 +1,5 @@\n');
    expect(diff).toContain('@@ -16,5 +16,5 @@\n');
    expect(unifiedLineDiff('same.md', 'x\n', 'x\n')).toBe('');
    expect(unifiedLineDiff('end.md', 'a\nb', 'a\nb\nc\n')).toBe(
      '--- a/end.md\n+++ b/end.md\n@@ -1,2 +1,3 @@\n a\n-b\n\\ No newline at end of file\n+b\n+c\n',
    );
  });
});

describe('scoped Tob memory edit client', () => {
  const io = (stdin = '') => ({
    env: {},
    stdout: () => {},
    stderr: () => {},
    readStdin: async () => stdin,
  });
  const head = 'a'.repeat(40);

  it('parses reviewed saves and restores and requires the observed head', async () => {
    expect(
      await parseAgentManagement(
        'memory-save',
        ['research'],
        { path: 'SOUL.md', 'body-stdin': true, 'expected-head': head, 'edit-id': 'e1' },
        io('new soul\n'),
      ),
    ).toEqual({
      command: 'memory-save',
      args: {
        slug: 'research',
        path: 'SOUL.md',
        body: 'new soul\n',
        expectedHead: head,
        editId: 'e1',
      },
      write: true,
    });
    expect(
      await parseAgentManagement(
        'memory-restore-commit',
        ['research'],
        { sha: 'b'.repeat(40), 'expected-head': head, name: 'before tob' },
        io(),
      ),
    ).toMatchObject({
      command: 'memory-restore-commit',
      args: { slug: 'research', sha: 'b'.repeat(40), expectedHead: head, name: 'before tob' },
      write: true,
    });
    await expect(
      parseAgentManagement('memory-save', ['research'], { path: 'SOUL.md', body: 'x' }, io()),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parseAgentManagement(
        'memory-save',
        ['research'],
        { path: 'SOUL.md', body: 'x', 'body-stdin': true, 'expected-head': head },
        io(),
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      parseAgentManagement(
        'memory-save',
        ['research'],
        { path: 'SOUL.md', body: 'x', 'expected-head': head, as: 'someone' },
        io(),
      ),
    ).rejects.toMatchObject({ code: 'agent-scope-denied' });
    await expect(
      parseAgentManagement(
        'memory-restore-commit',
        ['research'],
        { sha: 'b'.repeat(40), 'expected-head': head, 'restore-id': 'not-a-uuid' },
        io(),
      ),
    ).rejects.toMatchObject({ code: 'usage' });
  });

  it('runs a reviewed save end to end through the scoped broker and the approval card', async () => {
    const f = fixture();
    const base = f.head();
    const approve = vi.fn(async (_proposal: unknown) => {});
    const broker = await startTobCliBroker({
      signal: new AbortController().signal,
      authorize: () => {},
      approve,
      readSetting: () => ({ scope: 'global', value: 1, revision: 0 }),
      writeSetting: async () => ({ scope: 'global', value: 1, revision: 0 }),
      prepareOperation: (command, args) => f.prepare(command, args),
      capabilities: [],
    });
    brokers.push(broker);
    const run = async (argv: string[], stdin: string) => {
      const stdout: string[] = [];
      const code = await runBotCreateCli(argv, {
        env: { DEEPSEEKBOT_AGENT_ENDPOINT: broker.endpoint, DEEPSEEKBOT_AGENT_TOKEN: broker.token },
        stdout: (text) => stdout.push(text),
        stderr: () => {},
        readStdin: async () => stdin,
      });
      return { code, json: JSON.parse(stdout.join('')) };
    };
    const argv = [
      'memory-save',
      'research',
      '--path',
      'SOUL.md',
      '--body-stdin',
      '--expected-head',
      base,
      '--edit-id',
      'broker-edit',
    ];
    const saved = await run(argv, 'Broker Soul\n');
    expect(saved.code).toBe(0);
    expect(approve).toHaveBeenCalledOnce();
    expect(approve.mock.calls[0]![0]).toMatchObject({
      command: 'memory-save',
      target: 'research',
      previousValue: { revision: base },
      patch: { diff: expect.stringContaining('+Broker Soul\n') },
    });
    expect(f.soul()).toBe('Broker Soul\n');
    const retried = await run(argv, 'Broker Soul\n');
    expect(retried.json).toMatchObject({ replayed: true });
    expect(approve).toHaveBeenCalledOnce();
    approve.mockRejectedValueOnce(new TobError('approval-denied'));
    const denied = await run(
      [
        'memory-save',
        'research',
        '--path',
        'SOUL.md',
        '--body',
        'Denied Soul',
        '--expected-head',
        f.head(),
      ],
      '',
    );
    expect(JSON.stringify(denied.json)).toContain('approval-denied');
    expect(f.soul()).toBe('Broker Soul\n');
  });
});
