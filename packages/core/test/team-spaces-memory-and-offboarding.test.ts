import { alice, fixture } from './team-spaces-fixtures.js';
import { describe, expect, it } from 'vitest';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { accountMemoryPath, relocateSpaceMemories } from '../src/workspaces/space-memory.js';
import {
  accountSpaceFiles,
  prepareSpaceTransfer,
  recoverSpaceTransfers,
  relocateTobWorkspaces,
} from '../src/workspaces/space-lifecycle.js';

describe('M6 Memory migration and offboarding', () => {
  it('clears a member default Memory override without losing account-space ownership', () => {
    const f = fixture();
    f.createBot(alice);
    const path = accountMemoryPath(f.home, 'alice', 'alice-bot');
    const proof = memoryOwnership(path);
    const result = f.core.registry.setMemoryDir('alice-bot', path);
    expect(result.ok).toBe(true);
    expect(f.core.registry.get('alice-bot')?.memoryDir).toBeUndefined();
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(path);
    expect(f.core.deletions.preview('alice-bot')).toMatchObject({
      memoryDir: path,
      eraseAvailable: true,
    });
    expect(memoryOwnership(path)).toEqual(proof);
  });

  it.each([147, 149, 150, 151, 152])(
    'upgrades generation %s through the required migrations, preserving Channel access and Memory ownership',
    async (generation) => {
      const home = realpathSync(createTempRoot('m6-upgrade-'));
      const prior = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter(
            (migration) => migration.generation <= Math.min(generation, 150),
          ),
        ),
      });
      expect(prior.generation).toBe(Math.min(generation, 150));
      const db = attachOperationalModule(prior, 'm6-old');
      db.transaction((connection) =>
        connection
          .prepare("INSERT INTO humans VALUES ('alice', 'Alice', 'active', '2026-11-14')")
          .run(),
      );
      db.transaction((connection) => {
        connection
          .prepare(`INSERT INTO channel_records(channel_id, record_json, visibility_json, owner_human_id)
        VALUES ('main-role-channel', ?, ?, 'alice')`)
          .run(
            JSON.stringify({
              id: 'main-role-channel',
              type: 'group',
              name: 'Main roles',
              members: [],
              ownerHumanId: 'alice',
              createdAt: '2026-11-14',
            }),
            JSON.stringify({ kind: 'roles', roleIds: ['member'] }),
          );
      });
      const registry = createTestRegistry({
        database: prior,
        rootDir: join(home, 'botharness/bots'),
        initializeMemory: (memoryDir) => {
          mkdirSync(join(memoryDir, '.git'));
          return { ok: true };
        },
      });
      expect(registry.create({ slug: 'old-owner', displayName: 'Owner' }).ok).toBe(true);
      const ownerMemory = registry.memoryDirFor('old-owner')!;
      const ownerProof = memoryOwnership(ownerMemory);
      const ownerNative = realpathSync(createTempRoot('m6-upgrade-owner-native-'));
      db.transaction((connection) =>
        connection
          .prepare(`INSERT INTO workspace_grants
        (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision)
        VALUES ('old-owner-native','old-owner','old-owner-native',?,'Native','2026-11-15',1,1)`)
          .run(ownerNative),
      );
      for (const slug of ['old-private', 'old-tob', 'old-retained', 'old-erasing'])
        expect(
          registry.create({
            slug,
            displayName: slug,
            ownerHumanId: 'alice',
            ...(slug === 'old-tob' && generation !== 150
              ? { workspaces: [join(home, 'botharness/tob-workspaces/old-tob')] }
              : {}),
          }).ok,
        ).toBe(true);
      const legacyWorkspace = join(home, 'botharness/tob-workspaces/old-tob');
      mkdirSync(join(legacyWorkspace, 'notes'), { recursive: true });
      writeFileSync(join(legacyWorkspace, 'notes/kept.txt'), 'Tob file');
      writeFileSync(join(legacyWorkspace, 'report.txt'), 'Tob report');
      symlinkSync('report.txt', join(legacyWorkspace, 'report-link'));
      symlinkSync('not-yet-created', join(legacyWorkspace, 'dangling-link'));
      symlinkSync(join(home, 'spaces/bob/files'), join(legacyWorkspace, 'foreign-link'), 'dir');
      symlinkSync(join(home, 'botharness'), join(legacyWorkspace, 'protected-link'), 'dir');
      const erasingPath = registry.memoryDirFor('old-erasing')!;
      db.transaction((connection) => {
        connection
          .prepare(
            `INSERT INTO workspace_grants (id,bot_slug,workspace_id,workspace_path,workspace_title,created_at,orchestrator_write,write_revision) VALUES ('old-tob-grant','old-tob','old-native-tob',?,'Tob','2026-11-15',1,1)`,
          )
          .run(legacyWorkspace);
        connection.prepare('INSERT INTO persona_bot_deletions VALUES (?,?)').run(
          'old-erasing',
          JSON.stringify({
            slug: 'old-erasing',
            displayName: 'Erasing',
            acceptedAt: '2026-11-15',
            memoryDir: erasingPath,
            eraseMemory: true,
            phase: 'cleanup',
            memory: 'pending',
            cleanupAccepted: true,
            ownership: memoryOwnership(erasingPath),
          }),
        );
      });
      rmSync(join(erasingPath, '.git'), { recursive: true });
      db.transaction((connection) =>
        connection.prepare("INSERT INTO tob_identity VALUES ('alice', 'old-tob')").run(),
      );
      const retainedPath = registry.memoryDirFor('old-retained')!;
      db.transaction((connection) =>
        connection.prepare('INSERT INTO persona_bot_deletions VALUES (?, ?)').run(
          'old-retained',
          JSON.stringify({
            slug: 'old-retained',
            displayName: 'Retained',
            acceptedAt: '2026-11-14',
            memoryDir: retainedPath,
            eraseMemory: false,
            phase: 'complete',
            memory: 'retained',
            ownership: memoryOwnership(retainedPath),
          }),
        ),
      );
      const before = memoryOwnership(registry.memoryDirFor('old-private')!);
      writeFileSync(join(before.path, 'kept'), 'preserved');
      prior.close();
      if (generation > 150) {
        const staged = mountOperationalDatabase({
          dshHome: home,
          schemaPlan: defineSchemaPlan(
            BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= generation),
          ),
        });
        expect(staged.generation).toBe(generation);
        staged.close();
      }
      const f = fixture(home);
      expect(f.core.operationalDatabase.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      f.workspace(ownerNative, 'old-owner-native');
      expect(f.core.grants.requireActive('old-owner', 'old-owner-native').workspacePath).toBe(
        ownerNative,
      );
      expect(f.core.registry.memoryDirFor('old-owner')).toBe(ownerMemory);
      expect(memoryOwnership(ownerMemory)).toEqual(ownerProof);
      expect(
        f.db.read((connection) =>
          connection
            .prepare(
              "SELECT owner_human_id, visibility_json FROM channel_records WHERE channel_id = 'main-role-channel'",
            )
            .get(),
        ),
      ).toEqual({
        owner_human_id: 'alice',
        visibility_json: JSON.stringify({ kind: 'roles', roleIds: ['member'] }),
      });
      const target = accountMemoryPath(home, 'alice', 'old-private');
      expect(f.core.registry.memoryDirFor('old-private')).toBe(target);
      expect(readFileSync(join(target, 'kept'), 'utf8')).toBe('preserved');
      expect(memoryOwnership(target)).toEqual({ ...before, path: target });
      expect(
        f.db.read((connection) =>
          connection
            .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
            .get('old-private'),
        ),
      ).toEqual({ body: JSON.stringify({ ...before, path: target }) });
      expect(f.core.registry.memoryDirFor('old-tob')).toBe(
        accountMemoryPath(home, 'alice', 'old-tob'),
      );
      expect(f.core.tob.slug(alice)).toBeUndefined();
      expect(f.core.tob.isTob('old-tob')).toBe(false);
      expect(await f.bridge(alice).tobHome({})).toEqual({ ok: true, value: { available: false } });
      expect(readFileSync(join(home, 'spaces/alice/files/notes/kept.txt'), 'utf8')).toBe(
        'Tob file',
      );
      const migrated = join(home, 'spaces/alice/files');
      expect(lstatSync(join(migrated, 'report-link')).isSymbolicLink()).toBe(true);
      expect(readlinkSync(join(migrated, 'report-link'))).toBe('report.txt');
      expect(readFileSync(join(migrated, 'report-link'), 'utf8')).toBe('Tob report');
      expect(lstatSync(join(migrated, 'dangling-link')).isSymbolicLink()).toBe(true);
      for (const [name, code] of [
        ['foreign-link', 'grant-foreign-space'],
        ['protected-link', 'grant-protected-path'],
      ])
        expect(() => f.core.grants.validatePath?.('old-tob', join(migrated, name!))).toThrowError(
          expect.objectContaining({ code }),
        );
      expect(f.core.registry.get('old-tob')?.workspaces).toEqual(
        generation === 150 ? [] : [join(home, 'spaces/alice/files')],
      );
      expect(f.core.grants.list('old-tob')).toContainEqual(
        expect.objectContaining({ id: 'old-tob-grant', revokedAt: expect.any(String) }),
      );
      expect(f.core.grants.list('old-tob')).toContainEqual(
        expect.objectContaining({
          workspaceId: 'spaces/alice',
          workspacePath: join(home, 'spaces/alice/files'),
          orchestratorWrite: true,
        }),
      );
      expect(existsSync(legacyWorkspace)).toBe(false);
      const reads = f.core.operationalDatabase.diagnostics().metrics.reads;
      relocateTobWorkspaces(f.db, home);
      expect(f.core.operationalDatabase.diagnostics().metrics.reads - reads).toBe(2);
      expect(f.db.read((db) => db.prepare('SELECT * FROM workspace_file_transfers').all())).toEqual(
        [],
      );
      expect(existsSync(erasingPath)).toBe(true);
      expect(await f.core.deletions.retry('old-erasing')).toMatchObject({
        memory: 'erased',
        phase: 'complete',
      });
      expect(existsSync(erasingPath)).toBe(false);

      const retained = f.core.deletions.get('old-retained');
      expect(retained).toMatchObject({
        phase: 'complete',
        memory: 'retained',
        memoryDir: accountMemoryPath(home, 'alice', 'old-retained'),
        ownership: memoryOwnership(accountMemoryPath(home, 'alice', 'old-retained')),
      });
      await f.core.team.deactivate(owner, 'alice');
      expect(f.core.deletions.memberPreview('alice', 'old-retained').eraseAvailable).toBe(true);
      await f.core.team.reactivate(owner, 'alice');
      expect(
        f.db.read((connection) => connection.prepare('PRAGMA foreign_key_check').all()),
      ).toEqual([]);
      expect(existsSync(before.path)).toBe(false);
      expect(f.createBot(alice, 'new-private').memoryDir).toBe(
        accountMemoryPath(home, 'alice', 'new-private'),
      );
    },
  );

  it('recovers a Memory rename interrupted before the ownership transaction and rejects substituted repositories', () => {
    const f = fixture();
    f.createBot();
    const source = f.core.registry.memoryDirFor('alice-bot')!;
    const target = join(f.home, 'spaces/alice/bots/moved/memory');
    const proof = memoryOwnership(source);
    mkdirSync(join(f.home, 'spaces/alice/bots/moved'), { recursive: true });
    f.db.transaction((connection) =>
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?, ?, ?, ?)')
        .run('alice-bot', source, target, JSON.stringify(proof)),
    );
    renameSync(source, target);
    relocateSpaceMemories(f.db, f.home);
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(target);
    expect(memoryOwnership(target)).toEqual({ ...proof, path: target });
    f.db.transaction((connection) =>
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?, ?, ?, ?)')
        .run('alice-bot', target, source, JSON.stringify({ ...proof, inode: -42 })),
    );
    expect(() => relocateSpaceMemories(f.db, f.home)).toThrow('space-memory-ownership-invalid');
    expect(existsSync(target)).toBe(true);
  });

  it('transfers account files and former member Tob Memory, retains Owner Tob and shared roots, then purges the empty account', async () => {
    const f = fixture();
    f.createBot();
    const formerTob = f.createBot(alice, 'former-tob');
    const tob = await f.core.tob.ensure(owner);
    const ownerMemory = f.core.registry.memoryDirFor(tob.botSlug);
    const formerMemory = f.core.registry.memoryDirFor(formerTob.slug)!;
    writeFileSync(join(formerMemory, 'kept'), 'former Tob Memory');
    expect(await f.bridge(alice).tobHome({})).toEqual({ ok: true, value: { available: false } });
    const oldMemory = f.core.registry.memoryDirFor('alice-bot')!;
    writeFileSync(join(oldMemory, 'retained'), 'bot memory');
    writeFileSync(join(f.home, 'spaces/alice/report.txt'), 'member file');
    const shared = f.core.spaces.create(owner, 'Shared', { kind: 'everyone' });
    writeFileSync(join(f.core.spaces.path(shared.spaceId), 'shared.txt'), 'shared file');
    const preview = f.core.team.transferPreview(owner, 'alice');
    expect(preview.space?.files.some((file) => file.path === 'report.txt')).toBe(true);
    expect(preview.bots.map((bot) => bot.slug)).toEqual(['alice-bot', 'former-tob']);
    await f.core.team.transfer(owner, 'alice', 'bob');
    const moved = f.core.registry.memoryDirFor('alice-bot')!;
    expect(moved).toBe(accountMemoryPath(f.home, 'bob', 'alice-bot'));
    expect(f.core.registry.get('alice-bot')?.ownerHumanId).toBe('bob');
    expect(readFileSync(join(moved, 'retained'), 'utf8')).toBe('bot memory');
    expect(readFileSync(join(f.home, 'spaces/bob/report.txt'), 'utf8')).toBe('member file');
    expect(f.core.registry.get(tob.botSlug)?.ownerHumanId).toBe(owner.humanId);
    expect(f.core.registry.memoryDirFor(tob.botSlug)).toBe(ownerMemory);
    expect(f.core.registry.get(formerTob.slug)?.ownerHumanId).toBe('bob');
    const transferredTobMemory = accountMemoryPath(f.home, 'bob', formerTob.slug);
    expect(f.core.registry.memoryDirFor(formerTob.slug)).toBe(transferredTobMemory);
    expect(readFileSync(join(transferredTobMemory, 'kept'), 'utf8')).toBe('former Tob Memory');
    await f.core.team.deactivate(owner, 'alice');
    const purge = f.core.team.purgePreview(owner, 'alice');
    f.db.transaction((connection) =>
      connection
        .prepare("INSERT INTO member_credentials VALUES ('alice', 'alice', '{}', '[]', 0)")
        .run(),
    );
    const current = f.core.team.purgePreview(owner, 'alice');
    expect(purge.counts.bots).toBe(0);
    await f.core.team.purgeConfirm(owner, 'alice', current.token, 'alice');
    expect(existsSync(join(f.home, 'spaces/alice'))).toBe(false);
    expect(existsSync(moved)).toBe(true);
    expect(readFileSync(join(transferredTobMemory, 'kept'), 'utf8')).toBe('former Tob Memory');
    expect(readFileSync(join(f.core.spaces.path(shared.spaceId), 'shared.txt'), 'utf8')).toBe(
      'shared file',
    );
    expect(f.core.spaces.list(owner).some((space) => space.spaceId === shared.spaceId)).toBe(true);
  });

  it('recovers an interrupted account transfer and refuses destination collisions without losing either file', () => {
    const f = fixture();
    f.createBot();
    writeFileSync(join(f.home, 'spaces/alice/files/report'), 'source');
    writeFileSync(join(f.home, 'spaces/bob/files/report'), 'target');
    expect(() => prepareSpaceTransfer(f.db, f.home, 'alice', 'bob', ['alice-bot'])).toThrow(
      'space-name-taken',
    );
    expect(readFileSync(join(f.home, 'spaces/alice/files/report'), 'utf8')).toBe('source');
    expect(readFileSync(join(f.home, 'spaces/bob/files/report'), 'utf8')).toBe('target');
    const pending = prepareSpaceTransfer(f.db, f.home, 'alice', 'local-human', ['alice-bot']);
    expect(existsSync(join(f.home, 'spaces/local-human/files/report'))).toBe(true);
    recoverSpaceTransfers(f.db);
    expect(readFileSync(join(f.home, 'spaces/alice/files/report'), 'utf8')).toBe('source');
    expect(f.core.registry.memoryDirFor('alice-bot')).toBe(
      accountMemoryPath(f.home, 'alice', 'alice-bot'),
    );
    expect(existsSync(accountMemoryPath(f.home, 'alice', 'alice-bot'))).toBe(true);
    expect(
      f.db.read((connection) => connection.prepare('SELECT * FROM workspace_file_transfers').all()),
    ).toEqual([]);
    expect(pending).toBeDefined();
  });

  it('plans a custom Memory under account files exactly once and recovers every move', () => {
    const f = fixture();
    f.createBot();
    const old = f.core.registry.memoryDirFor('alice-bot')!;
    const custom = join(f.home, 'spaces/alice/files/custom');
    renameSync(old, custom);
    f.db.transaction((db) => {
      db.prepare(
        "UPDATE persona_bots SET body = json_set(body, '$.memoryDir', ?) WHERE slug = 'alice-bot'",
      ).run(custom);
      db.prepare("UPDATE persona_bot_memory_ownership SET body = ? WHERE slug = 'alice-bot'").run(
        JSON.stringify(memoryOwnership(custom)),
      );
    });
    writeFileSync(join(f.home, 'spaces/alice/files/report'), 'file');
    const transfer = prepareSpaceTransfer(f.db, f.home, 'alice', 'bob', ['alice-bot']);
    expect(existsSync(accountMemoryPath(f.home, 'bob', 'alice-bot'))).toBe(true);
    expect(existsSync(join(f.home, 'spaces/bob/files/custom'))).toBe(false);
    recoverSpaceTransfers(f.db);
    expect(existsSync(custom)).toBe(true);
    expect(readFileSync(join(f.home, 'spaces/alice/files/report'), 'utf8')).toBe('file');
    expect(transfer).toBeDefined();
  });

  it('invalidates a purge preview when account files change, and deletes an account with no Bots', async () => {
    const f = fixture();
    f.db.transaction((connection) =>
      connection
        .prepare("INSERT INTO member_credentials VALUES ('alice', 'alice', '{}', '[]', 0)")
        .run(),
    );
    writeFileSync(join(f.home, 'spaces/alice/a'), 'old');
    await f.core.team.deactivate(owner, 'alice');
    const preview = f.core.team.purgePreview(owner, 'alice');
    writeFileSync(join(f.home, 'spaces/alice/b'), 'new');
    await expect(f.core.team.purgeConfirm(owner, 'alice', preview.token, 'alice')).rejects.toThrow(
      'purge-token-invalid',
    );
    const current = f.core.team.purgePreview(owner, 'alice');
    expect(current.counts.files).toBe(2);
    await f.core.team.purgeConfirm(owner, 'alice', current.token, 'alice');
    expect(accountSpaceFiles(f.home, 'alice')).toEqual([]);
    expect(existsSync(join(f.home, 'spaces/alice'))).toBe(false);
  });
});
