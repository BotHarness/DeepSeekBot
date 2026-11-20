import { describe, expect, it, afterEach, vi } from 'vitest';
import { z } from 'zod';
import * as fs from 'node:fs';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempRoot } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { accountMemoryPath, relocateSpaceMemories } from '../src/workspaces/space-memory.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { TeamService } from '../src/team/service.js';
import { PrivateAudit } from '../src/team/audit.js';
import {
  relocateTobWorkspaces,
  prepareSpaceTransfer,
  recoverSpaceTransfers,
} from '../src/workspaces/space-lifecycle.js';
import { WorkspaceSpaces } from '../src/workspaces/spaces.js';
import { defaultSpaceMemoryPath } from '../src/workspaces/space-memory.js';
import { OWNER_HUMAN_CONTEXT as owner, humanContext } from '../src/humans/context.js';
import { relocationProofSchema } from '../src/workspaces/space-memory-copy.js';

vi.mock('node:fs', async (original) => {
  const real = await original<typeof import('node:fs')>();
  return {
    ...real,
    renameSync: vi.fn(real.renameSync),
    rmSync: vi.fn(real.rmSync),
    rmdirSync: vi.fn(real.rmdirSync),
  };
});
const real = await vi.importActual<typeof import('node:fs')>('node:fs');
const owners: OperationalDatabaseOwner[] = [];
afterEach(() => {
  vi.mocked(fs.renameSync).mockImplementation(real.renameSync);
  vi.mocked(fs.rmSync).mockImplementation(real.rmSync);
  vi.mocked(fs.rmdirSync).mockImplementation(real.rmdirSync);
  for (const db of owners.splice(0)) db.close();
});
function mount(
  home: string,
  faultInjector?: Parameters<typeof mountOperationalDatabase>[0]['faultInjector'],
) {
  const db = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    ...(faultInjector ? { faultInjector } : {}),
  });
  owners.push(db);
  return db;
}
function fixture(
  faultInjector?: Parameters<typeof mountOperationalDatabase>[0]['faultInjector'],
  stopBots?: (slugs: readonly string[]) => Promise<void>,
) {
  vi.mocked(fs.renameSync).mockImplementation(real.renameSync);
  vi.mocked(fs.rmSync).mockImplementation(real.rmSync);
  vi.mocked(fs.rmdirSync).mockImplementation(real.rmdirSync);
  const home = createTempRoot('m6-space-transaction-');
  const database = mount(home, faultInjector);
  const db = attachOperationalModule(database, 'review');
  db.transaction((connection) => {
    for (const id of ['alice', 'bob'])
      connection.prepare("INSERT INTO humans VALUES (?,?,'active','2026-11-15')").run(id, id);
    connection.prepare('UPDATE team_settings SET enabled=1').run();
  });
  const registry = createTestRegistry({
    database,
    rootDir: join(home, 'botharness/bots'),
    defaultMemoryPath: (slug, human) => defaultSpaceMemoryPath(db, home, human, slug),
    initializeMemory: (memoryDir) => {
      const result = ensureMemoryRepository({ memoryDir });
      if (!result.ok) throw new Error(result.code);
      return { ok: true };
    },
  });
  const channels = createSqliteChannelStore({ database: db, rootDir: join(home, 'channels') });
  let spaces: WorkspaceSpaces;
  const team = new TeamService(db, channels, {
    spaces: () => spaces,
    ...(stopBots ? { stopBots } : {}),
  });
  spaces = new WorkspaceSpaces(db, home, team.roles);
  return { home, database, db, registry, team, spaces };
}
function legacyMemory(f: ReturnType<typeof fixture>) {
  const parent = createTempRoot('external-m6-memory-');
  const result = f.registry.create({
    slug: 'legacy',
    displayName: 'Legacy',
    ownerHumanId: 'alice',
    memoryLocation: parent,
    persona: 'preserve persona',
  });
  expect(result.ok).toBe(true);
  const source = f.registry.memoryDirFor('legacy')!;
  fs.writeFileSync(join(source, 'uncommitted.txt'), 'unsaved content');
  const history = execFileSync('git', ['-C', source, 'rev-list', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  f.db.transaction((connection) =>
    connection
      .prepare('INSERT INTO workspace_memory_moves VALUES (?,NULL,NULL,NULL)')
      .run('legacy'),
  );
  const target = accountMemoryPath(f.home, 'alice', 'legacy');
  vi.mocked(fs.renameSync).mockImplementation((from, to) => {
    if (String(from) === source && String(to) === target)
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    real.renameSync(from, to);
  });
  return { source, target, history };
}
async function formerOwnerMemory(f: ReturnType<typeof fixture>) {
  expect(
    f.registry.create({
      slug: 'former-owner',
      displayName: 'Former Owner',
      memoryLocation: createTempRoot('former-owner-external-'),
    }).ok,
  ).toBe(true);
  const source = f.registry.memoryDirFor('former-owner')!;
  fs.writeFileSync(join(source, 'uncommitted.txt'), 'retained uncommitted Memory');
  const history = execFileSync('git', ['-C', source, 'rev-list', 'HEAD'], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
  await f.team.setOwnerPassword(owner, 'old-owner-password');
  const member = await f.team.createMember(owner, 'nextowner', 'Next Owner');
  const operator = humanContext(member.member.humanId);
  await f.team.changePassword(operator, member.initialPassword, 'next-owner-password', false);
  await f.team.transferOwner(owner, operator.humanId, 'old-owner-password');
  expect(
    f.registry.create({ slug: 'audit-owner', displayName: 'Audit', ownerHumanId: operator.humanId })
      .ok,
  ).toBe(true);
  const target = accountMemoryPath(f.home, 'bob', 'former-owner');
  fs.writeFileSync(join(f.home, 'spaces', owner.humanId, 'files/report'), 'account file');
  vi.mocked(fs.renameSync).mockImplementation((from, to) => {
    if (String(from) === source && String(to) === target)
      throw Object.assign(new Error('cross-device'), { code: 'EXDEV' });
    real.renameSync(from, to);
  });
  return { source, target, history, operator };
}

describe('M6 durable filesystem transactions', () => {
  it.each(['target', 'stage', 'replacement'])(
    'resumes interrupted rollback removal of the recorded %s directory only',
    async (where) => {
      const f = fixture();
      const memory = await formerOwnerMemory(f);
      const sourceProof = memoryOwnership(memory.source);
      const transfer = prepareSpaceTransfer(f.db, f.home, owner.humanId, 'bob', ['former-owner']);
      const readCopy = (db: typeof f.db) => {
        const body = db.read(
          (connection) =>
            connection
              .prepare('SELECT moves_json FROM workspace_file_transfers WHERE human_id = ?')
              .get(owner.humanId)?.moves_json,
        );
        const state = z
          .object({
            moves: z.array(
              z.object({ source: z.string(), memory: relocationProofSchema.optional() }),
            ),
          })
          .parse(JSON.parse(String(body)));
        const copy = state.moves.find((move) => move.source === memory.source)?.memory?.copy;
        if (!copy) throw new Error('Missing Memory copy journal');
        return copy;
      };
      const copy = readCopy(f.db);
      const removal = where === 'stage' ? copy.stage : memory.target;
      if (where === 'stage') real.renameSync(memory.target, removal);
      let interrupted = false;
      vi.mocked(fs.rmSync).mockImplementation((path, options) => {
        if (String(path) === removal && !interrupted) {
          interrupted = true;
          real.rmSync(join(removal, '.git'), { recursive: true });
          throw new Error('rollback removal interrupted');
        }
        real.rmSync(path, options);
      });
      expect(() => transfer.rollback()).toThrow('rollback removal interrupted');
      expect(readCopy(f.db).phase).toBe('rolling-back');
      expect(fs.existsSync(join(removal, '.git'))).toBe(false);
      fs.writeFileSync(join(memory.source, 'after-rollback-intent'), 'new authoritative data');
      const saved = join(dirname(removal), 'saved-partial-copy');
      const unrelated = join(dirname(removal), 'unrelated-directory');
      if (where === 'replacement') {
        real.renameSync(removal, saved);
        fs.mkdirSync(removal);
        fs.writeFileSync(join(removal, 'keep'), 'unrelated data');
      }
      f.database.close();
      const reopened = mount(f.home);
      const db = attachOperationalModule(reopened, 'rollback-removal-recovery');
      if (where === 'replacement') {
        expect(() => recoverSpaceTransfers(db)).toThrow('space-memory-ownership-invalid');
        expect(fs.readFileSync(join(removal, 'keep'), 'utf8')).toBe('unrelated data');
        real.renameSync(removal, unrelated);
        real.renameSync(saved, removal);
      }
      recoverSpaceTransfers(db);
      expect(fs.existsSync(removal)).toBe(false);
      expect(fs.existsSync(memory.target)).toBe(false);
      expect(fs.readFileSync(join(memory.source, 'uncommitted.txt'), 'utf8')).toBe(
        'retained uncommitted Memory',
      );
      expect(fs.readFileSync(join(memory.source, 'after-rollback-intent'), 'utf8')).toBe(
        'new authoritative data',
      );
      expect(memoryOwnership(memory.source)).toEqual(sourceProof);
      expect(
        execFileSync('git', ['-C', memory.source, 'rev-list', 'HEAD'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(memory.history);
      expect(fs.readFileSync(join(f.home, 'spaces', owner.humanId, 'files/report'), 'utf8')).toBe(
        'account file',
      );
      if (where === 'replacement')
        expect(fs.readFileSync(join(unrelated, 'keep'), 'utf8')).toBe('unrelated data');
      expect(
        db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
      ).toEqual([]);
    },
  );

  it.each(['move', 'erase'])(
    'continues committed cleanup after the recipient chooses to %s Memory',
    async (action) => {
      let armed = false,
        commits = 0;
      const f = fixture(({ stage }) => {
        if (armed && stage === 'after-commit-before-notify' && ++commits === 4)
          throw new Error('ownership committed');
      });
      const memory = await formerOwnerMemory(f);
      armed = true;
      await expect(f.team.transfer(memory.operator, owner.humanId, 'bob')).rejects.toThrow();
      f.database.close();
      const reopened = mount(f.home),
        db = attachOperationalModule(reopened, 'recipient-choice');
      const team = new TeamService(
        db,
        createSqliteChannelStore({ database: db, rootDir: join(f.home, 'channels') }),
        { spaces: () => spaces },
      );
      const spaces = new WorkspaceSpaces(db, f.home, team.roles);
      if (action === 'move') await team.transfer(memory.operator, 'bob', 'alice');
      else {
        real.rmSync(memory.target, { recursive: true });
        db.transaction((connection) => {
          connection
            .prepare("DELETE FROM persona_bot_memory_ownership WHERE slug='former-owner'")
            .run();
          connection.prepare("DELETE FROM persona_bots WHERE slug='former-owner'").run();
        });
      }
      expect(() => spaces.assertPath('audit-owner', memory.source, true)).toThrow(
        'grant-protected-path',
      );
      recoverSpaceTransfers(db);
      expect(fs.existsSync(memory.source)).toBe(false);
      if (action === 'move') {
        const current = accountMemoryPath(f.home, 'alice', 'former-owner');
        expect(fs.readFileSync(join(current, 'uncommitted.txt'), 'utf8')).toBe(
          'retained uncommitted Memory',
        );
        expect(
          execFileSync('git', ['-C', current, 'rev-list', 'HEAD'], {
            encoding: 'utf8',
            windowsHide: true,
          }).trim(),
        ).toBe(memory.history);
      } else expect(fs.existsSync(memory.target)).toBe(false);
      expect(
        db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
      ).toEqual([]);
    },
  );

  it('rolls back a verified cross-filesystem Memory copy before ownership commits', async () => {
    const f = fixture();
    const memory = await formerOwnerMemory(f);
    for (const recover of [false, true]) {
      const transfer = prepareSpaceTransfer(f.db, f.home, owner.humanId, 'bob', ['former-owner']);
      expect(fs.existsSync(memory.source)).toBe(true);
      expect(fs.readFileSync(join(memory.target, 'uncommitted.txt'), 'utf8')).toBe(
        'retained uncommitted Memory',
      );
      if (recover) recoverSpaceTransfers(f.db);
      else transfer.rollback();
      expect(fs.existsSync(memory.target)).toBe(false);
      expect(fs.readFileSync(join(memory.source, 'uncommitted.txt'), 'utf8')).toBe(
        'retained uncommitted Memory',
      );
      expect(fs.readFileSync(join(f.home, 'spaces', owner.humanId, 'files/report'), 'utf8')).toBe(
        'account file',
      );
    }
  });

  it('resumes committed member transfer after partial cross-filesystem source retirement', async () => {
    const f = fixture();
    const memory = await formerOwnerMemory(f);
    let interrupted = false;
    vi.mocked(fs.rmSync).mockImplementation((path, options) => {
      if (String(path) === memory.source && !interrupted) {
        interrupted = true;
        real.rmSync(join(memory.source, '.git'), { recursive: true });
        throw new Error('partial transfer retirement');
      }
      real.rmSync(path, options);
    });
    await expect(f.team.transfer(memory.operator, owner.humanId, 'bob')).rejects.toThrow(
      'partial transfer retirement',
    );
    expect(() => f.spaces.assertPath('audit-owner', memory.source, true)).toThrow(
      'grant-protected-path',
    );
    f.database.close();
    const reopened = mount(f.home);
    const db = attachOperationalModule(reopened, 'partial-transfer');
    recoverSpaceTransfers(db);
    expect(fs.existsSync(memory.source)).toBe(false);
    expect(fs.readFileSync(join(memory.target, 'uncommitted.txt'), 'utf8')).toBe(
      'retained uncommitted Memory',
    );
    expect(
      execFileSync('git', ['-C', memory.target, 'rev-list', 'HEAD'], {
        encoding: 'utf8',
        windowsHide: true,
      }).trim(),
    ).toBe(memory.history);
    expect(
      db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
    ).toEqual([]);
  });
  it.each([0, 1, 2, 3, 4, 5, 6, 7, -4])(
    'recovers former-Owner Memory transfer after EXDEV and commit interruption %s',
    async (stop) => {
      let armed = false,
        commits = 0;
      const f = fixture(({ stage }) => {
        if (
          armed &&
          stop &&
          stage === (stop < 0 ? 'before-commit' : 'after-commit-before-notify') &&
          ++commits === Math.abs(stop)
        )
          throw new Error('transfer interrupted');
      });
      const memory = await formerOwnerMemory(f);
      armed = true;
      const transfer = f.team.transfer(memory.operator, owner.humanId, 'bob');
      if (stop) await expect(transfer).rejects.toThrow();
      else await expect(transfer).resolves.toBeNull();
      f.database.close();
      const reopened = mount(f.home);
      const db = attachOperationalModule(reopened, 'transfer-recovery');
      const team = new TeamService(
        db,
        createSqliteChannelStore({ database: db, rootDir: join(f.home, 'channels') }),
        { spaces: () => spaces },
      );
      const spaces = new WorkspaceSpaces(db, f.home, team.roles);
      const committed = stop === 0 || stop >= 4;
      const records = team.privateAccess.log(memory.operator, {}).records;
      expect(records).toHaveLength(committed ? 1 : 0);
      if (committed)
        expect(records[0]).toMatchObject({
          kind: 'bot',
          objectId: 'former-owner',
          action: 'transfer',
          ownerHumanIds: [owner.humanId],
          viewerHumanId: memory.operator.humanId,
        });
      expect(team.privateAccess.verify(memory.operator)).toEqual({ ok: true });
      expect(
        db.read(
          (connection) =>
            connection
              .prepare("SELECT owner_human_id FROM persona_bots WHERE slug='former-owner'")
              .get()?.owner_human_id,
        ),
      ).toBe(committed ? 'bob' : owner.humanId);
      if (stop === 4 || stop === 5) {
        expect(() => spaces.assertPath('audit-owner', memory.source, true)).toThrow(
          'grant-protected-path',
        );
        expect(() => spaces.assertPath('audit-owner', memory.source)).toThrow(
          'grant-protected-path',
        );
        fs.writeFileSync(join(memory.target, 'new-owner-write'), 'new owner content');
      }
      recoverSpaceTransfers(db);
      if (!committed) {
        expect(fs.readFileSync(join(memory.source, 'uncommitted.txt'), 'utf8')).toBe(
          'retained uncommitted Memory',
        );
        expect(fs.existsSync(memory.target)).toBe(false);
        await expect(team.transfer(memory.operator, owner.humanId, 'bob')).resolves.toBeNull();
      }
      expect(team.privateAccess.log(memory.operator, {}).records).toHaveLength(1);
      expect(team.privateAccess.verify(memory.operator)).toEqual({ ok: true });
      expect(fs.existsSync(memory.source)).toBe(false);
      expect(fs.readFileSync(join(memory.target, 'uncommitted.txt'), 'utf8')).toBe(
        'retained uncommitted Memory',
      );
      if (stop === 4 || stop === 5)
        expect(fs.readFileSync(join(memory.target, 'new-owner-write'), 'utf8')).toBe(
          'new owner content',
        );
      expect(fs.readFileSync(join(f.home, 'spaces/bob/files/report'), 'utf8')).toBe('account file');
      expect(
        execFileSync('git', ['-C', memory.target, 'rev-list', 'HEAD'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(memory.history);
      expect(
        db.read(
          (connection) =>
            connection
              .prepare("SELECT body FROM persona_bot_memory_ownership WHERE slug='former-owner'")
              .get()?.body,
        ),
      ).toBe(JSON.stringify(memoryOwnership(memory.target)));
      expect(
        db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
      ).toEqual([]);
    },
  );
  it.each(['files', 'root'])(
    'keeps a shared folder re-listable when a late write races %s removal',
    (where) => {
      const f = fixture();
      const space = f.spaces.create(owner, 'Late write', { kind: 'everyone' });
      expect(f.registry.create({ slug: 'delete-bot', displayName: 'Delete' }).ok).toBe(true);
      const root = f.spaces.path(space.spaceId);
      f.db.transaction((db) =>
        db
          .prepare(`INSERT INTO workspace_grants
      (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
      VALUES ('delete-grant','delete-bot',?,?,'Folder','2026-11-15',1,1)`)
          .run(space.spaceId, join(root, 'files')),
      );
      const target = where === 'files' ? join(root, 'files') : root;
      const late = join(target, 'late');
      let injected = false;
      vi.mocked(fs.rmdirSync).mockImplementation((path, options) => {
        if (String(path) === target && !injected) {
          injected = true;
          expect(
            f.db.read((db) =>
              db.prepare('SELECT 1 FROM workspace_spaces WHERE space_id=?').get(space.spaceId),
            ),
          ).toBeUndefined();
          expect(
            f.db.read(
              (db) =>
                db.prepare("SELECT revoked_at FROM workspace_grants WHERE id='delete-grant'").get()
                  ?.revoked_at,
            ),
          ).toEqual(expect.any(String));
          fs.writeFileSync(late, 'late data');
        }
        real.rmdirSync(path, options);
      });
      expect(() => f.spaces.delete(owner, space.spaceId, true)).toThrow('space-not-empty');
      expect(fs.readFileSync(late, 'utf8')).toBe('late data');
      expect(f.spaces.list(owner)).toContainEqual(space);
      expect(fs.existsSync(join(root, 'files'))).toBe(true);
    },
  );

  it.each(['before-commit', 'after-commit-before-notify'] as const)(
    'preserves the shared folder when deletion fails at %s',
    (stage) => {
      let armed = false;
      const f = fixture((context) => {
        if (armed && context.stage === stage) {
          armed = false;
          throw new Error('delete interrupted');
        }
      });
      const space = f.spaces.create(owner, 'Delete transaction', { kind: 'everyone' });
      const root = f.spaces.path(space.spaceId);
      expect(f.registry.create({ slug: 'delete-transaction', displayName: 'Delete' }).ok).toBe(
        true,
      );
      f.db.transaction((connection) =>
        connection
          .prepare(`INSERT INTO workspace_grants
      (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
      VALUES ('delete-transaction-grant','delete-transaction',?,?,'Folder','2026-11-15',1,1)`)
          .run(space.spaceId, join(root, 'files')),
      );
      armed = true;
      expect(() => f.spaces.delete(owner, space.spaceId, true)).toThrow();
      expect(fs.existsSync(join(root, 'files'))).toBe(true);
      f.database.close();
      const reopened = mount(f.home);
      const db = attachOperationalModule(reopened, 'delete-recovery');
      recoverSpaceTransfers(db);
      const team = new TeamService(
        db,
        createSqliteChannelStore({ database: db, rootDir: join(f.home, 'channels') }),
      );
      const spaces = new WorkspaceSpaces(db, f.home, team.roles);
      expect(spaces.list(owner)).toContainEqual(space);
      expect(
        db.read(
          (connection) =>
            connection
              .prepare(
                "SELECT revoked_at FROM workspace_grants WHERE id='delete-transaction-grant'",
              )
              .get()?.revoked_at,
        ),
      ).toEqual(stage === 'before-commit' ? null : expect.any(String));
    },
  );

  it('moves and restores symlink entries without resolving their targets during rollback and recovery', () => {
    const f = fixture();
    const source = join(f.home, 'spaces/alice/files');
    const target = join(f.home, 'spaces/bob/files');
    fs.writeFileSync(join(source, 'report.txt'), 'report');
    fs.symlinkSync('report.txt', join(source, 'report-link'));
    fs.symlinkSync('missing', join(source, 'dangling-link'));
    for (const recover of [false, true]) {
      const transfer = prepareSpaceTransfer(f.db, f.home, 'alice', 'bob', []);
      expect(fs.lstatSync(join(target, 'report-link')).isSymbolicLink()).toBe(true);
      expect(fs.lstatSync(join(target, 'dangling-link')).isSymbolicLink()).toBe(true);
      if (recover) recoverSpaceTransfers(f.db);
      else transfer.rollback();
      expect(fs.readlinkSync(join(source, 'report-link'))).toBe('report.txt');
      expect(fs.readFileSync(join(source, 'report-link'), 'utf8')).toBe('report');
      expect(fs.readlinkSync(join(source, 'dangling-link'))).toBe('missing');
    }
  });
  it('restores an interrupted Owner rename before excluding accepted erase cleanup', () => {
    const f = fixture();
    const slug = 'owner-pending';
    expect(f.registry.create({ slug, displayName: slug }).ok).toBe(true);
    const source = f.registry.memoryDirFor(slug)!;
    const proof = memoryOwnership(source);
    const target = accountMemoryPath(f.home, owner.humanId, slug);
    f.db.transaction((connection) => {
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?,?,?,?)')
        .run(slug, source, target, JSON.stringify(proof));
      connection.prepare('INSERT INTO persona_bot_deletions VALUES (?,?)').run(
        slug,
        JSON.stringify({
          slug,
          displayName: slug,
          acceptedAt: '2026-11-15',
          memoryDir: source,
          eraseMemory: true,
          phase: 'cleanup',
          memory: 'pending',
          cleanupAccepted: true,
          ownership: proof,
        }),
      );
    });
    fs.mkdirSync(join(target, '..'), { recursive: true });
    fs.renameSync(source, target);
    relocateSpaceMemories(f.db, f.home);
    expect(memoryOwnership(source)).toEqual(proof);
    expect(fs.existsSync(target)).toBe(false);
    expect(
      f.db.read((connection) => connection.prepare('SELECT * FROM workspace_memory_moves').all()),
    ).toEqual([]);
    expect(
      f.db.read(
        (connection) =>
          connection
            .prepare(
              "SELECT json_extract(body,'$.memoryDir') AS path FROM persona_bot_deletions WHERE slug=?",
            )
            .get(slug)?.path,
      ),
    ).toBe(source);
  });

  it('moves legacy Tob workspace files and grants once while preserving nested Owner Memory', () => {
    const f = fixture();
    const slug = 'owner-tob';
    const legacy = join(f.home, 'botharness/tob-workspaces', slug);
    fs.mkdirSync(legacy, { recursive: true });
    expect(
      f.registry.create({
        slug,
        displayName: 'Tob',
        ownerHumanId: owner.humanId,
        memoryLocation: legacy,
        workspaces: [legacy],
        persona: 'Owner persona',
      }).ok,
    ).toBe(true);
    const memory = f.registry.memoryDirFor(slug)!;
    const proof = memoryOwnership(memory);
    fs.writeFileSync(join(legacy, 'report'), 'workspace file');
    f.db.transaction((connection) => {
      connection.prepare('INSERT INTO tob_identity VALUES (?,?)').run(owner.humanId, slug);
      connection
        .prepare(
          `INSERT INTO workspace_grants (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision) VALUES ('old-owner-grant',?,'old-native-workspace',?,'Tob','2026-11-15',1,1)`,
        )
        .run(slug, legacy);
    });
    relocateTobWorkspaces(f.db, f.home);
    relocateTobWorkspaces(f.db, f.home);
    const target = join(f.home, 'spaces', owner.humanId, 'files');
    expect(fs.readFileSync(join(target, 'report'), 'utf8')).toBe('workspace file');
    expect(f.registry.get(slug)?.workspaces).toEqual([target]);
    expect(f.registry.memoryDirFor(slug)).toBe(memory);
    expect(memoryOwnership(memory)).toEqual(proof);
    expect(
      f.db.read(
        (connection) =>
          connection
            .prepare("SELECT revoked_at FROM workspace_grants WHERE id='old-owner-grant'")
            .get()?.revoked_at,
      ),
    ).toEqual(expect.any(String));
    expect(
      f.db.read(
        (connection) =>
          connection
            .prepare(
              'SELECT COUNT(*) AS count FROM workspace_grants WHERE bot_slug=? AND revoked_at IS NULL',
            )
            .get(slug)?.count,
      ),
    ).toBe(1);
  });

  it('keeps transferred files at the committed destination after a post-commit interruption', async () => {
    let armed = false;
    let commits = 0;
    const stopped = vi.fn(async (_slugs: readonly string[]) => {});
    const f = fixture(({ stage }) => {
      if (armed && stage === 'after-commit-before-notify' && ++commits === 2)
        throw new Error('post-commit');
    }, stopped);
    const disposed = vi.spyOn(f.team, 'disposePeers');
    const closeStreams = vi.fn(() => 0);
    f.team.bindPairing({
      revoke: () => ({ revoked: false, closedStreams: 0 }),
      clearOffers: () => 0,
      closeStreams,
    });
    expect(
      f.registry.create({ slug: 'alice-private', displayName: 'Alice', ownerHumanId: 'alice' }).ok,
    ).toBe(true);
    const source = f.registry.memoryDirFor('alice-private')!;
    fs.writeFileSync(join(source, 'kept'), 'kept');
    fs.writeFileSync(join(f.home, 'spaces/alice/files/report'), 'report');
    armed = true;
    await expect(f.team.transfer(owner, 'alice', 'bob')).rejects.toMatchObject({
      code: 'post-commit-interrupted',
    });
    expect(disposed).toHaveBeenCalled();
    expect(closeStreams).toHaveBeenCalled();
    expect(stopped).toHaveBeenCalledWith(['alice-private']);
    f.database.close();
    const next = mount(f.home);
    const db = attachOperationalModule(next, 'verify');
    const audit = new PrivateAudit(db);
    expect(audit.list({}).records).toMatchObject([
      { kind: 'bot', objectId: 'alice-private', action: 'transfer', ownerHumanIds: ['alice'] },
    ]);
    expect(audit.verify()).toEqual({ ok: true });
    const target = accountMemoryPath(f.home, 'bob', 'alice-private');
    expect(fs.readFileSync(join(target, 'kept'), 'utf8')).toBe('kept');
    expect(fs.existsSync(source)).toBe(false);
    expect(fs.readFileSync(join(f.home, 'spaces/bob/files/report'), 'utf8')).toBe('report');
    expect(
      db.read(
        (connection) =>
          connection
            .prepare("SELECT owner_human_id FROM persona_bots WHERE slug='alice-private'")
            .get()?.owner_human_id,
      ),
    ).toBe('bob');
    expect(
      db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
    ).toEqual([]);
  });

  it('rolls back ownership and filesystem moves if the transfer cannot append its audit record', async () => {
    const f = fixture();
    const created = f.registry.create({
      slug: 'alice-private',
      displayName: 'Private',
      ownerHumanId: 'alice',
    });
    if (!created.ok) throw new Error('create-refused');
    const source = f.registry.memoryDirFor('alice-private')!;
    fs.writeFileSync(join(source, 'kept'), 'private Memory');
    f.team.privateAccess.recordBotAction(owner, created.record, 'pause');
    f.db.transaction((db) => db.prepare('DELETE FROM private_access_audit').run());
    await expect(f.team.transfer(owner, 'alice', 'bob')).rejects.toMatchObject({
      code: 'audit-integrity-failed',
    });
    expect(f.registry.get('alice-private')?.ownerHumanId).toBe('alice');
    expect(f.registry.memoryDirFor('alice-private')).toBe(source);
    expect(fs.readFileSync(join(source, 'kept'), 'utf8')).toBe('private Memory');
    expect(fs.existsSync(accountMemoryPath(f.home, 'bob', 'alice-private'))).toBe(false);
    expect(f.team.privateAccess.log(owner, {}).records).toEqual([]);
    expect(f.team.privateAccess.verify(owner)).toMatchObject({ ok: false });
    expect(f.db.read((db) => db.prepare('SELECT * FROM workspace_file_transfers').all())).toEqual(
      [],
    );
  });

  it.each([0, 3, 4, 5, 6, 7])(
    'recovers a cross-filesystem Memory copy with an interruption after commit %s',
    (stop) => {
      let armed = false;
      let commits = 0;
      const f = fixture(({ stage }) => {
        if (armed && stop && stage === 'after-commit-before-notify' && ++commits === stop)
          throw new Error('copy interrupted');
      });
      const memory = legacyMemory(f);
      armed = true;
      if (stop) expect(() => relocateSpaceMemories(f.db, f.home)).toThrow();
      else relocateSpaceMemories(f.db, f.home);
      f.database.close();
      const next = mount(f.home);
      const db = attachOperationalModule(next, 'verify-copy');
      relocateSpaceMemories(db, f.home);
      expect(fs.existsSync(memory.source)).toBe(false);
      expect(fs.readFileSync(join(memory.target, 'uncommitted.txt'), 'utf8')).toBe(
        'unsaved content',
      );
      expect(
        execFileSync('git', ['-C', memory.target, 'rev-list', 'HEAD'], {
          encoding: 'utf8',
          windowsHide: true,
        }).trim(),
      ).toBe(memory.history);
      expect(
        db.read(
          (connection) =>
            connection
              .prepare("SELECT body FROM persona_bot_memory_ownership WHERE slug='legacy'")
              .get()?.body,
        ),
      ).toBe(JSON.stringify(memoryOwnership(memory.target)));
      expect(
        db.read((connection) => connection.prepare('SELECT * FROM workspace_memory_moves').all()),
      ).toEqual([]);
    },
  );

  it('resumes source retirement after .git was removed, with the destination already durably owned', () => {
    const f = fixture();
    const memory = legacyMemory(f);
    let failed = false;
    vi.mocked(fs.rmSync).mockImplementation((path, options) => {
      if (String(path) === memory.source && !failed) {
        failed = true;
        real.rmSync(join(memory.source, '.git'), { recursive: true });
        throw new Error('partial cleanup');
      }
      real.rmSync(path, options);
    });
    expect(() => relocateSpaceMemories(f.db, f.home)).toThrow('partial cleanup');
    expect(
      f.db.read(
        (connection) =>
          connection
            .prepare(
              "SELECT json_extract(body,'$.path') AS path FROM persona_bot_memory_ownership WHERE slug='legacy'",
            )
            .get()?.path,
      ),
    ).toBe(memory.target);
    relocateSpaceMemories(f.db, f.home);
    expect(fs.existsSync(memory.source)).toBe(false);
    expect(fs.readFileSync(join(memory.target, 'uncommitted.txt'), 'utf8')).toBe('unsaved content');
  });
});
