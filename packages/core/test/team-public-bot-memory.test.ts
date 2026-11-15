import { reconcilePublicBotMemories } from '../src/workspaces/bot-memory-placement.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { Session, SessionId } from '@deepseek-ai/dsh-session';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import type { BotVisibility } from '../src/team/bot-contract.js';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { DUMMY_PASSWORD_HASH } from '../src/team/password.js';
import { accountMemoryPath, botMemorySpaceId } from '../src/workspaces/space-memory.js';
import { nativeFileSpaceDenial } from '../src/workspaces/grant-native-tools.js';
import { createTempRoot } from './helpers.js';

vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>();
  return {
    ...real,
    renameSync: vi.fn(real.renameSync),
    cpSync: vi.fn(real.cpSync),
    rmSync: vi.fn(real.rmSync),
  };
});
const real = await vi.importActual<typeof import('node:fs')>('node:fs');
const alice = humanContext('alice'),
  bob = humanContext('bob');
const everyone = { kind: 'public', audience: { kind: 'everyone' } } as const;
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  vi.mocked(fs.renameSync).mockImplementation(real.renameSync);
  vi.mocked(fs.cpSync).mockImplementation(real.cpSync);
  vi.mocked(fs.rmSync).mockImplementation(real.rmSync);
  for (const core of cores.splice(0)) {
    await core.runtime.close();
    core.schedules.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
});
function open(home: string, agents?: BotAgentAdapter) {
  const core = createCore({ dshHome: home, ...(agents ? { agents } : {}) });
  cores.push(core);
  return core;
}
function fixture(agents?: BotAgentAdapter) {
  const home = fs.realpathSync(createTempRoot('m7-shared-memory-'));
  const core = open(home, agents);
  const db = attachOperationalModule(core.operationalDatabase, 'm7-memory-test');
  db.transaction((sql) => {
    sql.prepare('UPDATE team_settings SET enabled=1').run();
    for (const id of ['alice', 'bob']) {
      sql.prepare("INSERT INTO humans VALUES (?,?,'active','now')").run(id, id);
      sql.prepare("INSERT INTO human_roles VALUES (?,'member')").run(id);
      sql
        .prepare('INSERT INTO member_credentials VALUES (?,?,?,?,0)')
        .run(id, id, JSON.stringify(DUMMY_PASSWORD_HASH), '[]');
    }
  });
  for (const id of ['alice', 'bob']) core.spaces.ensureAccount(id);
  expect(
    core.registry.create({ slug: 'helper', displayName: 'Helper', ownerHumanId: 'alice' }).ok,
  ).toBe(true);
  expect(
    core.registry.create({ slug: 'other', displayName: 'Other', ownerHumanId: 'bob' }).ok,
  ).toBe(true);
  const source = core.registry.memoryDirFor('helper')!;
  fs.writeFileSync(join(source, 'note.md'), 'original Memory');
  git(source, ['add', '.']);
  git(source, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '-m',
    'retained history',
  ]);
  fs.writeFileSync(join(source, 'uncommitted.md'), 'uncommitted bytes');
  const history = git(source, ['rev-parse', 'HEAD']);
  const target = join(home, botMemorySpaceId('helper'), 'bots/helper/memory');
  return { home, core, db, source, target, history };
}
function git(path: string, args: string[]) {
  return execFileSync('git', ['-C', path, ...args], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  }).trim();
}
function intact(path: string, head: string) {
  expect(fs.readFileSync(join(path, 'note.md'), 'utf8')).toBe('original Memory');
  expect(fs.readFileSync(join(path, 'uncommitted.md'), 'utf8')).toBe('uncommitted bytes');
  expect(git(path, ['rev-list', '--all'])).toContain(head);
}
function crossDevice(source: string, target: string) {
  vi.mocked(fs.renameSync).mockImplementation((from, to) => {
    if (String(from) === source && String(to) === target)
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    return real.renameSync(from, to);
  });
}

describe('M7 public Bot Memory placement', () => {
  it('previews labelled paths without moving Memory, publishes the same repository, and never lists the backing space', async () => {
    const f = fixture(),
      bridge = createBridgeMethodsForHumans(f.core)(alice);
    const folder = f.core.spaces.create(owner, botMemorySpaceId('helper'), { kind: 'everyone' });
    const preview = await createBridgeMethodsForHumans(f.core)(owner).botVisibilitySet({
      slug: 'helper',
      visibility: everyone,
      confirm: false,
    });
    expect(preview).toMatchObject({
      ok: true,
      value: {
        applied: false,
        preview: {
          memory: {
            from: 'spaces/alice/bots/helper/memory',
            to: 'shared/.bot-helper/bots/helper/memory',
          },
        },
      },
    });
    expect(fs.existsSync(f.target)).toBe(false);
    expect(f.core.registry.memoryDirFor('helper')).toBe(f.source);
    const applied = await createBridgeMethodsForHumans(f.core)(owner).botVisibilitySet({
      slug: 'helper',
      visibility: everyone,
    });
    expect(applied).toMatchObject({
      ok: true,
      value: {
        applied: true,
        preview: { memory: { to: 'shared/.bot-helper/bots/helper/memory' } },
      },
    });
    expect(f.core.registry.memoryDirFor('helper')).toBe(f.target);
    expect(f.target.startsWith(join(f.home, folder.spaceId) + '/')).toBe(false);
    expect(fs.existsSync(f.source)).toBe(false);
    intact(f.target, f.history);
    await expect(bridge.botVisibility({ slug: 'helper' })).resolves.toMatchObject({ ok: true });
    for (const human of [owner, alice, bob]) {
      expect(f.core.spaces.list(human).some((s) => s.spaceId === botMemorySpaceId('helper'))).toBe(
        false,
      );
      expect(
        f.core.spaces
          .workspaceLookup()
          .list()
          .some((s) => s.id === botMemorySpaceId('helper')),
      ).toBe(false);
    }
    expect(fs.existsSync(join(f.home, botMemorySpaceId('helper'), 'files'))).toBe(false);
    expect(() =>
      f.core.spaces.update(owner, botMemorySpaceId('helper'), {
        audience: { kind: 'members', humanIds: ['bob'] },
      }),
    ).toThrow('space-not-found');
  });
  it('relocates already-public round-one Bots before startup admission', async () => {
    const f = fixture();
    f.db.transaction((sql) =>
      sql
        .prepare('UPDATE persona_bots SET visibility_json=? WHERE slug=?')
        .run(JSON.stringify(everyone), 'helper'),
    );
    await f.core.runtime.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restored = open(f.home);
    expect(restored.registry.memoryDirFor('helper')).toBe(f.target);
    intact(f.target, f.history);
    expect(fs.existsSync(f.source)).toBe(false);
  });
  it('refuses to move a running Bot through the bridge', async () => {
    let started!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const f = fixture({
      async runOrchestrator() {
        started();
        await hold;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('unexpected');
      },
      async close() {},
    });
    const dm = f.core.channels.getOrCreateDm(alice, 'helper')!;
    await f.core.channels.appendMessage(alice, dm.id, {
      id: 'run',
      at: 'now',
      author: { kind: 'human' },
      body: 'run',
    });
    const turn = f.core.runtime.admitDmMessage(alice, {
      channelId: dm.id,
      messageId: 'run',
      body: 'run',
    });
    try {
      await ready;
      const result = await createBridgeMethodsForHumans(f.core)(owner).botVisibilitySet({
        slug: 'helper',
        visibility: everyone,
      });
      expect(result).toMatchObject({ ok: false, error: { code: 'bot-busy' } });
      expect(f.core.registry.memoryDirFor('helper')).toBe(f.source);
      expect(fs.existsSync(f.target)).toBe(false);
    } finally {
      release();
      if (turn.admitted) await turn.settled;
    }
  });
  it('does no repository or metadata writes for an already-correct startup placement', () => {
    const f = fixture();
    f.core.team.bots.setVisibility(owner, 'helper', everyone);
    const before = f.core.operationalDatabase.diagnostics().metrics;
    const renames = vi.mocked(fs.renameSync).mock.calls.length;
    reconcilePublicBotMemories(f.db, f.home);
    const after = f.core.operationalDatabase.diagnostics().metrics;
    expect(after.reads - before.reads).toBe(1);
    expect(after.transactionsCommitted).toBe(before.transactionsCommitted);
    expect(vi.mocked(fs.renameSync).mock.calls.length).toBe(renames);
    intact(f.target, f.history);
  });
  it('retargets the dedicated space for widening/shrinking and moves home when private again', () => {
    const f = fixture();
    f.core.team.bots.setVisibility(owner, 'helper', {
      kind: 'public',
      audience: { kind: 'members', humanIds: ['alice'] },
    });
    const inode = fs.statSync(f.target).ino;
    f.core.team.bots.setVisibility(owner, 'helper', everyone);
    expect(fs.statSync(f.target).ino).toBe(inode);
    const narrow: BotVisibility = {
      kind: 'public',
      audience: { kind: 'members', humanIds: ['bob'] },
    } as const;
    expect(f.core.team.bots.setVisibility(alice, 'helper', narrow).applied).toBe(false);
    f.core.team.bots.setVisibility(alice, 'helper', narrow, true);
    expect(
      f.db.read((sql) =>
        sql
          .prepare('SELECT audience_json FROM workspace_spaces WHERE space_id=?')
          .get(botMemorySpaceId('helper')),
      ),
    ).toEqual({ audience_json: JSON.stringify(narrow.audience) });
    expect(fs.statSync(f.target).ino).toBe(inode);
    const result = f.core.team.bots.setVisibility(alice, 'helper', { kind: 'private' }, true);
    expect(result.preview.memory).toEqual({
      from: 'shared/.bot-helper/bots/helper/memory',
      to: 'spaces/alice/bots/helper/memory',
    });
    intact(f.source, f.history);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(
      f.db.read((sql) =>
        sql
          .prepare('SELECT 1 FROM workspace_spaces WHERE space_id=?')
          .get(botMemorySpaceId('helper')),
      ),
    ).toBeUndefined();
  });
  it('refuses grants and another member Bot file tools even when their audience includes that member', async () => {
    const f = fixture();
    f.core.team.bots.setVisibility(owner, 'helper', everyone);
    for (const path of [f.target, dirname(f.target), join(f.home, botMemorySpaceId('helper'))]) {
      expect(() => f.core.spaces.assertGrantForHuman(owner, path)).toThrow('grant-protected-path');
      expect(() => f.core.spaces.assertPath('other', path)).toThrow('grant-protected-path');
    }
    const workspace = {
      id: 'memory-bypass',
      path: f.target,
      title: 'Memory',
      status: async () => 'ok' as const,
    };
    const lookup = f.core.spaces.workspaceLookup({
      get: (id) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    });
    expect(() => f.core.spaces.assertMemoryPath('alice', 'helper', f.source)).toThrow(
      'grant-protected-path',
    );
    expect(lookup.get(workspace.id)).toBe(workspace);
    f.core.ownership.claim({
      sessionId: 'bob-files',
      botSlug: 'other',
      rootRole: 'orchestrator',
      cwdReference: f.core.registry.memoryDirFor('other')!,
      at: 'now',
    });
    f.core.ownership.claim({
      sessionId: 'helper-files',
      botSlug: 'helper',
      rootRole: 'orchestrator',
      cwdReference: f.target,
      at: 'now',
    });
    const ownSeed = Session.create(SessionId('helper-files'));
    const ownSession = Session.create(ownSeed.id, [], { ...ownSeed.header, cwd: f.target });
    expect(
      nativeFileSpaceDenial(f.core, ownSession, 'read', { file_path: join(f.target, 'note.md') }),
    ).toBeUndefined();
    const seed = Session.create(SessionId('bob-files'));
    const session = Session.create(seed.id, [], {
      ...seed.header,
      cwd: f.core.registry.memoryDirFor('other')!,
    });
    for (const name of ['read', 'write', 'glob', 'grep'])
      expect(
        nativeFileSpaceDenial(f.core, session, name, {
          path: join(f.target, 'note.md'),
          file_path: join(f.target, 'note.md'),
        }),
      ).toBe('grant-protected-path');
  });
  it('refuses an occupied backing namespace without modifying either repository or foreign files', () => {
    const f = fixture();
    const foreign = join(f.home, botMemorySpaceId('helper'), 'files', 'foreign.txt');
    fs.mkdirSync(dirname(foreign), { recursive: true });
    fs.writeFileSync(foreign, 'kept');
    expect(() => f.core.team.bots.setVisibility(owner, 'helper', everyone)).toThrow(
      'space-name-taken',
    );
    intact(f.source, f.history);
    expect(fs.readFileSync(foreign, 'utf8')).toBe('kept');
    expect(f.core.team.bots.view(alice, 'helper').visibility.kind).toBe('private');
  });
  it('rolls the repository and visibility back together if the metadata transaction fails', () => {
    const f = fixture();
    f.db.transaction((sql) =>
      sql.exec(
        "CREATE TRIGGER reject_public BEFORE UPDATE OF visibility_json ON persona_bots BEGIN SELECT RAISE(ABORT,'rejected'); END",
      ),
    );
    expect(() => f.core.team.bots.setVisibility(owner, 'helper', everyone)).toThrow();
    expect(f.core.team.bots.view(alice, 'helper').visibility.kind).toBe('private');
    expect(f.core.registry.memoryDirFor('helper')).toBe(f.source);
    intact(f.source, f.history);
    expect(fs.existsSync(f.target)).toBe(false);
    expect(f.db.read((sql) => sql.prepare('SELECT * FROM workspace_file_transfers').all())).toEqual(
      [],
    );
  });
  it('recovers an interrupted copy before commit, then safely retries publication', async () => {
    const f = fixture();
    crossDevice(f.source, f.target);
    vi.mocked(fs.cpSync).mockImplementation((source, target, options) => {
      real.cpSync(source, target, options);
      throw new Error('process lost during copy');
    });
    vi.mocked(fs.rmSync).mockImplementation(() => {
      throw new Error('process exited before rollback');
    });
    expect(() => f.core.team.bots.setVisibility(owner, 'helper', everyone)).toThrow();
    vi.mocked(fs.cpSync).mockImplementation(real.cpSync);
    vi.mocked(fs.rmSync).mockImplementation(real.rmSync);
    await f.core.runtime.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restored = open(f.home);
    expect(restored.registry.memoryDirFor('helper')).toBe(f.source);
    intact(f.source, f.history);
    restored.team.bots.setVisibility(owner, 'helper', everyone);
    intact(f.target, f.history);
    expect(fs.existsSync(f.source)).toBe(false);
  });
  it('resumes committed retirement after a restart even if source removal was partial', async () => {
    const f = fixture();
    crossDevice(f.source, f.target);
    vi.mocked(fs.rmSync).mockImplementation((path, options) => {
      if (String(path) === f.source) {
        real.rmSync(join(f.source, 'note.md'));
        throw new Error('interrupted retirement');
      }
      real.rmSync(path, options);
    });
    expect(f.core.team.bots.setVisibility(owner, 'helper', everyone).applied).toBe(true);
    intact(f.target, f.history);
    expect(
      f.db.read((sql) => sql.prepare('SELECT * FROM workspace_file_transfers').all()),
    ).toHaveLength(1);
    vi.mocked(fs.rmSync).mockImplementation(real.rmSync);
    await f.core.runtime.close();
    f.core.operationalDatabase.close();
    cores.splice(cores.indexOf(f.core), 1);
    const restored = open(f.home);
    intact(restored.registry.memoryDirFor('helper')!, f.history);
    expect(fs.existsSync(f.source)).toBe(false);
    expect(
      attachOperationalModule(restored.operationalDatabase, 'check').read((sql) =>
        sql.prepare('SELECT * FROM workspace_file_transfers').all(),
      ),
    ).toEqual([]);
  });
  it('keeps public Memory in place across M9 transfer and moves home to the new principal', async () => {
    const f = fixture();
    f.core.team.bots.setVisibility(owner, 'helper', everyone);
    await f.core.team.transfer(owner, 'alice', 'bob');
    expect(f.core.registry.memoryDirFor('helper')).toBe(f.target);
    intact(f.target, f.history);
    f.core.team.bots.setVisibility(bob, 'helper', { kind: 'private' }, true);
    intact(accountMemoryPath(f.home, 'bob', 'helper'), f.history);
  });
  it('purges accepted public Bot Memory and its hidden space without creating a grantable folder', async () => {
    const f = fixture();
    f.core.team.bots.setVisibility(owner, 'helper', everyone);
    await f.core.team.deactivate(owner, 'alice');
    const preview = f.core.team.purgePreview(owner, 'alice');
    await f.core.team.purgeConfirm(owner, 'alice', preview.token, 'alice');
    expect(fs.existsSync(f.target)).toBe(false);
    expect(
      f.db.read((sql) =>
        sql
          .prepare('SELECT * FROM workspace_spaces WHERE space_id=?')
          .all(botMemorySpaceId('helper')),
      ),
    ).toEqual([]);
  });
});
