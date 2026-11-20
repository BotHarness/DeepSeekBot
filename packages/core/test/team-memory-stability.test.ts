import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { Session } from '@deepseek-ai/dsh-session';
import { afterEach, describe, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { syncBotDescriptor } from '../src/bots/bot-descriptor-sync.js';
import { memoryOwnership } from '../src/bots/deletion.js';
import { ensureMemoryRepository } from '../src/memory/repository.js';
import { accountMemoryPath, relocateSpaceMemories } from '../src/workspaces/space-memory.js';
import { nativeFileToolDenial } from '../src/workspaces/grant-native-tools.js';
import { createTempRoot } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';

const cores = new Set<BotHarnessCore>();
async function close(core: BotHarnessCore) {
  await core.contentPurge.memberSettled();
  core.schedules.close();
  core.externalMessaging.close();
  await core.runtime.close();
  core.operationalDatabase.close();
  cores.delete(core);
}
afterEach(async () => {
  for (const core of cores) await close(core);
});
function boot(home: string) {
  const core = createCore({ dshHome: home });
  cores.add(core);
  return core;
}
function git(path: string, ...args: string[]) {
  return execFileSync('git', ['-C', path, ...args], {
    encoding: 'utf8',
    windowsHide: true,
  }).trim();
}
function proofBody(core: BotHarnessCore, slug: string) {
  return attachOperationalModule(core.operationalDatabase, 'stability-proof').read(
    (db) =>
      db.prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?').get(slug)?.body,
  );
}

describe('Team switches preserve Memory across upgrades and restarts', () => {
  it.each([147, 149])(
    'preserves populated Owner, Tob, custom and member repositories upgrading generation %s',
    async (generation) => {
      const home = realpathSync(createTempRoot('m6-memory-stability-'));
      const prior = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= generation),
        ),
      });
      const db = attachOperationalModule(prior, 'stability-seed');
      db.transaction((connection) => {
        for (const id of ['alice', 'bob']) {
          connection
            .prepare("INSERT INTO humans VALUES (?, ?, 'active', '2026-11-15')")
            .run(id, id);
          connection.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(id);
        }
      });
      const registry = createTestRegistry({
        database: prior,
        rootDir: join(home, 'botharness/bots'),
        initializeMemory: (memoryDir) => {
          const initialized = ensureMemoryRepository({ memoryDir });
          if (!initialized.ok) throw new Error(initialized.code);
          return { ok: true };
        },
        syncDescriptor: (memoryDir, record, options) => {
          syncBotDescriptor(memoryDir, record, options);
        },
      });
      const custom = realpathSync(createTempRoot('m6-owner-custom-'));
      const entries = [
        { slug: 'owner-private', humanId: owner.humanId },
        { slug: 'owner-tob', humanId: owner.humanId },
        { slug: 'owner-custom', humanId: owner.humanId, memoryLocation: custom },
        { slug: 'member-private', humanId: 'alice' },
        {
          slug: 'member-tob',
          humanId: 'alice',
          memoryLocation: join(
            home,
            'botharness',
            'tob-workspaces',
            'member-tob',
            'private-memory',
          ),
        },
      ].map((entry) => {
        if ('memoryLocation' in entry) mkdirSync(entry.memoryLocation, { recursive: true });
        expect(
          registry.create({
            slug: entry.slug,
            displayName: entry.slug,
            ownerHumanId: entry.humanId,
            ...(entry.slug === 'member-tob'
              ? { workspaces: [join(home, 'botharness', 'tob-workspaces', entry.slug)] }
              : {}),
            ...('memoryLocation' in entry ? { memoryLocation: entry.memoryLocation } : {}),
          }).ok,
        ).toBe(true);
        const source = registry.memoryDirFor(entry.slug)!;
        writeFileSync(join(source, 'kept.txt'), entry.slug);
        git(source, 'add', '.');
        git(
          source,
          '-c',
          'user.name=QA',
          '-c',
          'user.email=qa@example.test',
          'commit',
          '-qm',
          'populated Memory',
        );
        return {
          ...entry,
          source,
          proof: memoryOwnership(source),
          history: git(source, 'rev-list', 'HEAD'),
          files: git(source, 'ls-files', '-z')
            .split('\0')
            .filter(Boolean)
            .map((path) => ({ path, data: readFileSync(join(source, path)) })),
          body: db.read(
            (connection) =>
              connection.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(entry.slug)
                ?.body,
          ),
          proofBody: db.read(
            (connection) =>
              connection
                .prepare('SELECT body FROM persona_bot_memory_ownership WHERE slug = ?')
                .get(entry.slug)?.body,
          ),
        };
      });
      db.transaction((connection) => {
        connection
          .prepare('INSERT INTO tob_identity VALUES (?, ?)')
          .run(owner.humanId, 'owner-tob');
        connection.prepare("INSERT INTO tob_identity VALUES ('alice', 'member-tob')").run();
      });
      writeFileSync(
        join(home, 'botharness', 'tob-workspaces', 'member-tob', 'report.txt'),
        'former Tob file',
      );
      prior.close();
      let core = boot(home);
      expect(core.operationalDatabase.generation).toBe(BOT_HARNESS_SCHEMA_PLAN.targetGeneration);
      await core.team.setOwnerPassword(owner, 'Memory-stability-2026!');
      for (const [step, enabled] of [false, true, false, true].entries()) {
        await core.team.setMode(owner, enabled);
        await close(core);
        core = boot(home);
        expect(core.team.mode(owner).enabled).toBe(enabled);
        if (step === 1)
          expect(
            core.registry.setMemoryDir(
              'member-private',
              accountMemoryPath(home, 'alice', 'member-private'),
            ).ok,
          ).toBe(true);
        expect(core.tob.slug(owner)).toBe('owner-tob');
        expect(core.tob.slug(humanContext('alice'))).toBeUndefined();
        expect(core.tob.isTob('member-tob')).toBe(false);
        expect(readFileSync(join(home, 'spaces', 'alice', 'files', 'report.txt'), 'utf8')).toBe(
          'former Tob file',
        );
        for (const entry of entries) {
          const target =
            entry.humanId === owner.humanId
              ? entry.source
              : accountMemoryPath(home, entry.humanId, entry.slug);
          expect(core.registry.memoryDirFor(entry.slug)).toBe(target);
          expect(readFileSync(join(target, 'kept.txt'), 'utf8')).toBe(entry.slug);
          for (const file of entry.files)
            expect(readFileSync(join(target, file.path))).toEqual(file.data);
          expect(
            git(target, 'rev-list', 'HEAD'),
            entry.slug + ' step=' + step + ' ' + git(target, 'log', '--oneline', '-5'),
          ).toBe(entry.history);
          expect(proofBody(core, entry.slug)).toBe(
            JSON.stringify({ ...entry.proof, path: target }),
          );
          if (!core.tob.isTob(entry.slug))
            expect(core.deletions.preview(entry.slug).eraseAvailable).toBe(true);
          if (entry.humanId === owner.humanId) {
            expect(proofBody(core, entry.slug)).toBe(entry.proofBody);
            expect(
              attachOperationalModule(core.operationalDatabase, 'owner-unchanged').read(
                (connection) =>
                  connection.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(entry.slug)
                    ?.body,
              ),
            ).toBe(entry.body);
          } else {
            expect(existsSync(entry.source)).toBe(false);
            expect(JSON.stringify(core.registry.get(entry.slug))).not.toContain(entry.source);
          }
          const sessionId = entry.slug + '-' + step;
          core.ownership.claim({
            sessionId,
            botSlug: entry.slug,
            rootRole: 'orchestrator',
            cwdReference: target,
            at: new Date().toISOString(),
          });
          const session = { id: sessionId, header: { cwd: target } } as Session;
          const file = join(target, 'switch-' + step + '.txt');
          expect(nativeFileToolDenial(core, session, 'write', { file_path: file })).toBeUndefined();
          writeFileSync(file, 'step ' + step);
          expect(nativeFileToolDenial(core, session, 'read', { file_path: file })).toBeUndefined();
          expect(readFileSync(file, 'utf8')).toBe('step ' + step);
          for (let previous = 0; previous < step; previous++)
            expect(readFileSync(join(target, 'switch-' + previous + '.txt'), 'utf8')).toBe(
              'step ' + previous,
            );
        }
      }
      expect(core.team.transferPreview(owner, 'alice').bots.map((bot) => bot.slug)).toContain(
        'member-private',
      );
      await core.team.transfer(owner, 'alice', 'bob');
      expect(core.registry.memoryDirFor('member-private')).toBe(
        accountMemoryPath(home, 'bob', 'member-private'),
      );
      expect(
        readFileSync(join(accountMemoryPath(home, 'bob', 'member-private'), 'kept.txt'), 'utf8'),
      ).toBe('member-private');
      expect(core.registry.get('member-tob')?.ownerHumanId).toBe('bob');
      const transferredTob = accountMemoryPath(home, 'bob', 'member-tob');
      expect(core.registry.memoryDirFor('member-tob')).toBe(transferredTob);
      expect(readFileSync(join(transferredTob, 'kept.txt'), 'utf8')).toBe('member-tob');
      expect(git(transferredTob, 'rev-list', 'HEAD')).toBe(
        entries.find((entry) => entry.slug === 'member-tob')?.history,
      );
      await core.team.deactivate(owner, 'alice');
      const credentials = attachOperationalModule(core.operationalDatabase, 'purge-credential');
      credentials.transaction((connection) =>
        connection
          .prepare("INSERT INTO member_credentials VALUES ('alice', 'alice', '{}', '[]', 0)")
          .run(),
      );
      const purge = core.team.purgePreview(owner, 'alice');
      expect(purge.counts.bots).toBe(0);
      await core.team.purgeConfirm(owner, 'alice', purge.token, 'alice');
      expect(existsSync(join(home, 'spaces/alice'))).toBe(false);
      expect(existsSync(accountMemoryPath(home, 'bob', 'member-private'))).toBe(true);
      expect(readFileSync(join(transferredTob, 'kept.txt'), 'utf8')).toBe('member-tob');
      for (const entry of entries.filter((entry) => entry.humanId === owner.humanId))
        expect(readFileSync(join(entry.source, 'kept.txt'), 'utf8')).toBe(entry.slug);
      await close(core);
    },
  );

  it('keeps a new Owner Tob at its legacy default after repeated restarts', async () => {
    const home = realpathSync(createTempRoot('m6-new-owner-memory-'));
    let core = boot(home);
    const tob = await core.tob.ensure(owner);
    const before = core.registry.memoryDirFor(tob.botSlug);
    expect(before).toBe(join(home, 'botharness/bots', tob.botSlug, 'memory'));
    await core.team.setOwnerPassword(owner, 'Memory-stability-2026!');
    for (const enabled of [false, true, false, true]) {
      await core.team.setMode(owner, enabled);
      await close(core);
      core = boot(home);
      expect(core.registry.memoryDirFor(tob.botSlug)).toBe(before);
    }
  });
  it('retains implicit Owner account Memory from earlier M6 builds and ignores queued Owner relocation', async () => {
    const home = realpathSync(createTempRoot('m6-owner-retain-account-'));
    let core = boot(home);
    const path = accountMemoryPath(home, owner.humanId, 'existing-owner');
    expect(
      core.registry.create({ slug: 'existing-owner', displayName: 'Existing', memoryDir: path }).ok,
    ).toBe(true);
    writeFileSync(join(path, 'retained.txt'), 'earlier M6');
    const proof = proofBody(core, 'existing-owner');
    const db = attachOperationalModule(core.operationalDatabase, 'existing-owner');
    db.transaction((connection) => {
      connection
        .prepare(
          "UPDATE persona_bots SET body = json_remove(body, '$.memoryDir') WHERE slug = 'existing-owner'",
        )
        .run();
      connection
        .prepare("INSERT INTO workspace_memory_moves VALUES ('existing-owner', NULL, NULL, NULL)")
        .run();
    });
    await core.team.setOwnerPassword(owner, 'Memory-stability-2026!');
    for (const enabled of [false, true, false, true]) {
      await core.team.setMode(owner, enabled);
      await close(core);
      core = boot(home);
      expect(core.registry.memoryDirFor('existing-owner')).toBe(path);
      expect(proofBody(core, 'existing-owner')).toBe(proof);
      expect(readFileSync(join(path, 'retained.txt'), 'utf8')).toBe('earlier M6');
      expect(core.registry.get('existing-owner')?.memoryDir).toBeUndefined();
      expect(() => core.spaces.assertPath('existing-owner', path, true)).toThrow(
        'grant-protected-path',
      );
    }
  });
  it('restores an Owner rename interrupted by an earlier M6 build without rewriting its record or proof', async () => {
    const home = realpathSync(createTempRoot('m6-owner-rename-recovery-'));
    let core = boot(home);
    const slug = 'interrupted-owner';
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
    const source = core.registry.memoryDirFor(slug)!;
    writeFileSync(join(source, 'kept.txt'), 'recover Owner Memory');
    const history = git(source, 'rev-list', 'HEAD');
    const proof = proofBody(core, slug);
    if (typeof proof !== 'string') throw new Error('Missing Memory ownership proof');
    const target = accountMemoryPath(home, owner.humanId, slug);
    const db = attachOperationalModule(core.operationalDatabase, 'owner-rename-recovery');
    const body = db.read(
      (connection) =>
        connection.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(slug)?.body,
    );
    db.transaction((connection) =>
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?, ?, ?, ?)')
        .run(slug, source, target, proof),
    );
    await close(core);
    mkdirSync(dirname(target), { recursive: true });
    renameSync(source, target);
    core = boot(home);
    expect(core.registry.memoryDirFor(slug)).toBe(source);
    expect(readFileSync(join(source, 'kept.txt'), 'utf8')).toBe('recover Owner Memory');
    expect(git(source, 'rev-list', 'HEAD')).toBe(history);
    expect(proofBody(core, slug)).toBe(proof);
    expect(existsSync(target)).toBe(false);
    expect(
      attachOperationalModule(core.operationalDatabase, 'owner-record').read(
        (connection) =>
          connection.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(slug)?.body,
      ),
    ).toBe(body);
  });
  it('refuses a substituted Owner recovery target and preserves the original repository', () => {
    const home = realpathSync(createTempRoot('m6-owner-substitution-'));
    const core = boot(home);
    const slug = 'protected-owner';
    expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
    const source = core.registry.memoryDirFor(slug)!;
    writeFileSync(join(source, 'original.txt'), 'original Owner Memory');
    const proof = JSON.stringify(memoryOwnership(source));
    const saved = join(home, 'saved-owner-memory');
    const target = accountMemoryPath(home, owner.humanId, slug);
    const db = attachOperationalModule(core.operationalDatabase, 'owner-substitution');
    db.transaction((connection) =>
      connection
        .prepare('INSERT INTO workspace_memory_moves VALUES (?, ?, ?, ?)')
        .run(slug, source, target, proof),
    );
    renameSync(source, saved);
    expect(ensureMemoryRepository({ memoryDir: target }).ok).toBe(true);
    writeFileSync(join(target, 'untrusted.txt'), 'substituted');
    expect(() => relocateSpaceMemories(db, home)).toThrow('space-memory-ownership-invalid');
    expect(existsSync(source)).toBe(false);
    expect(readFileSync(join(saved, 'original.txt'), 'utf8')).toBe('original Owner Memory');
    expect(readFileSync(join(target, 'untrusted.txt'), 'utf8')).toBe('substituted');
    expect(proofBody(core, slug)).toBe(proof);
  });
});
