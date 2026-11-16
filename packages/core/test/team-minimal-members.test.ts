import { afterEach, describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { existsSync, readFileSync, rmdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCore } from '../src/plugin.js';
import { createBridgeMethodsForHumans } from '../src/bridge/methods.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { ALL_PERMISSIONS } from '../src/team/permissions.js';
import { createTempRoot, trackTestOwner } from './helpers.js';
import { createTestRosterStore } from './roster-fixture.js';

const closes: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});
function fixture(dshHome = createTempRoot('m13-minimal-member-')) {
  const core = createCore({ dshHome });
  closes.push(async () => {
    core.schedules.close();
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  });
  const db = attachOperationalModule(core.operationalDatabase, 'm13-test');
  const human = humanContext('member');
  if (!core.team.member(human.humanId))
    db.transaction((db) => {
      db.prepare("INSERT INTO humans VALUES ('member', 'Member', 'active', 'before')").run();
      db.prepare("INSERT INTO human_roles VALUES ('member', 'member')").run();
      db.prepare('UPDATE team_settings SET enabled = 1').run();
    });
  core.spaces.ensureAccount(human.humanId);
  const methods = createBridgeMethodsForHumans({
    ...core,
    modelCatalog: { list: async () => [], validate: async () => {} },
    roster: createTestRosterStore({ database: core.operationalDatabase }),
  });
  return { core, db, human, methods, dshHome };
}

describe('M13 minimal members', () => {
  it.each([false, true])(
    'retires a demoted Owner Tob identity and allocates a fresh Tob after a transfer round trip, stale target=%s',
    async (staleTarget) => {
      const f = fixture();
      const original = await f.core.tob.ensure(owner);
      const memory = f.core.registry.memoryDirFor(original.botSlug)!;
      writeFileSync(join(memory, 'kept.md'), 'Former Owner private Memory');
      await f.core.team.setOwnerPassword(owner, 'owner-password-1');
      const target = await f.core.team.createMember(owner, 'next-owner', 'Next');
      const next = humanContext(target.member.humanId);
      await f.core.team.changePassword(next, target.initialPassword, 'next-password-1', false);
      await f.core.team.transferOwner(owner, next.humanId, 'owner-password-1');
      expect(
        f.db.read((db) =>
          db.prepare('SELECT * FROM tob_identity WHERE human_id = ?').get(owner.humanId),
        ),
      ).toBeUndefined();
      expect(f.core.tob.isTob(original.botSlug)).toBe(false);
      expect(f.core.registry.get(original.botSlug)?.ownerHumanId).toBe(owner.humanId);
      expect(readFileSync(join(memory, 'kept.md'), 'utf8')).toBe('Former Owner private Memory');
      await f.core.team.transfer(next, owner.humanId, f.human.humanId);
      const transferredMemory = f.core.registry.memoryDirFor(original.botSlug)!;
      expect(readFileSync(join(transferredMemory, 'kept.md'), 'utf8')).toBe(
        'Former Owner private Memory',
      );
      if (staleTarget)
        f.db.transaction((db) =>
          db
            .prepare('INSERT INTO tob_identity (human_id,bot_slug) VALUES (?,?)')
            .run(owner.humanId, original.botSlug),
        );
      const reset = await f.core.team.resetPassword(next, owner.humanId);
      await f.core.team.changePassword(
        owner,
        reset.initialPassword,
        'returned-owner-password-1',
        false,
      );
      await f.core.team.transferOwner(next, owner.humanId, 'next-password-1');
      const returned = await f.core.tob.ensure(owner);
      expect(returned.botSlug).not.toBe(original.botSlug);
      expect(f.core.tob.slug(owner)).toBe(returned.botSlug);
      expect(f.core.tob.isTob(original.botSlug)).toBe(false);
      expect(f.core.registry.get(original.botSlug)?.ownerHumanId).toBe(f.human.humanId);
      expect(f.core.registry.get(returned.botSlug)?.ownerHumanId).toBe(owner.humanId);
      expect(readFileSync(join(transferredMemory, 'kept.md'), 'utf8')).toBe(
        'Former Owner private Memory',
      );
      expect(await f.methods(owner).tobHome({})).toMatchObject({
        ok: true,
        value: { botSlug: returned.botSlug },
      });
    },
    30_000,
  );

  it('grants exactly Human DMs and exposes the split catalog under normal M3 ceilings', () => {
    const f = fixture();
    expect(f.core.team.roles.permissions(f.human)).toEqual(['dm.humans']);
    expect(ALL_PERMISSIONS).toContain('bots.createPrivate');
    expect(ALL_PERMISSIONS).toContain('bots.createPublic');
    expect(ALL_PERMISSIONS).not.toContain('bots.create');
    const manager = f.core.team.roles.create(owner, 'Manager', [
      'roles.manage',
      'bots.createPublic',
    ]).role;
    f.core.team.roles.set(owner, f.human.humanId, [manager.roleId]);
    expect(
      f.core.team.roles.create(f.human, 'Publisher', ['bots.createPublic']).role.permissions,
    ).toEqual(['bots.createPublic']);
    expect(() =>
      f.core.team.roles.create(f.human, 'Private creator', ['bots.createPrivate']),
    ).toThrow('permission-not-grantable');
  });

  it.each([
    'create',
    'createLookup',
    'createFromGit',
    'botImportPreview',
    'botImportLookup',
    'zipUploadBegin',
    'zipUploadChunk',
    'zipUploadPreview',
    'zipImport',
    'zipImportLookup',
    'marketplaceInstallReview',
    'marketplaceInstall',
  ] as const)(
    'refuses %s before input, filesystem or import work without private creation permission',
    async (method) => {
      const f = fixture();
      const before = f.core.registry.list(f.human.humanId);
      const reads = f.core.operationalDatabase.diagnostics().metrics.reads;
      expect(
        await f.methods(f.human)[method]({
          displayName: 'Refused',
          operationKey: 'm13-denied-create',
          gitUrl: 'https://example.invalid/repo',
        }),
      ).toEqual({
        ok: false,
        error: {
          code: 'permission-required',
          message: 'permission-required',
          details: { permission: 'bots.createPrivate' },
        },
      });
      expect(f.core.operationalDatabase.diagnostics().metrics.reads - reads).toBe(2);
      expect(f.core.registry.list(f.human.humanId)).toEqual(before);
    },
  );

  it('keeps Channel/model permission checks and reports empty usage and Channels without creating a Tob', async () => {
    const f = fixture();
    const bridge = f.methods(f.human);
    const reads = f.core.operationalDatabase.diagnostics().metrics.reads;
    expect(await bridge.tobHome({})).toEqual({ ok: true, value: { available: false } });
    expect(f.core.operationalDatabase.diagnostics().metrics.reads - reads).toBe(3);
    expect(bridge.list({})).toMatchObject({ ok: true, value: { bots: [] } });
    expect(await bridge.onboarding({ action: 'start' })).toEqual({
      ok: true,
      value: {
        profileId: 'member',
        tutorial: 'skipped',
        completed: true,
        preparation: 'ready',
      },
    });
    expect(await bridge.channelCreate({ name: 'Refused', members: [] })).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'channels.create' } },
    });
    const created = f.core.registry.create({
      slug: 'existing',
      displayName: 'Existing',
      ownerHumanId: 'member',
    });
    expect(created.ok).toBe(true);
    expect(
      await bridge.modelPlanSet({
        slug: 'existing',
        expectedRevision: 0,
        assignmentModels: [],
        orchestrator: { provider: 'p', model: 'm' },
        assignmentDefault: { provider: 'p', model: 'm' },
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'models.use' } },
    });
    expect(f.core.tob.slug(f.human)).toBeUndefined();
    expect(bridge.overviewUsage({ period: 'today' })).toMatchObject({
      ok: true,
      value: { bots: [] },
    });
  });

  it('signs a fresh member in, toggles Team mode and restarts without allocating a Tob or any Bot', async () => {
    const f = fixture();
    const ctx = new Context();
    const off = f.core.team.bindRuntime({
      createPeer: (principal) => new Peer(ctx, { principal }),
      invalidate() {},
      urls: () => [],
    });
    closes.push(async () => {
      await off();
      await ctx.fiber.dispose();
    });
    await f.core.team.setOwnerPassword(owner, 'owner-password-1');
    const member = await f.core.team.createMember(owner, 'fresh', 'Fresh');
    const human = humanContext(member.member.humanId);
    const account = f.core.spaces.path('spaces/' + human.humanId);
    rmdirSync(join(account, 'files'));
    rmdirSync(account);
    expect(existsSync(account)).toBe(false);
    await f.core.team.signIn('fresh', member.initialPassword, 'm13-sign-in');
    expect(existsSync(join(account, 'files'))).toBe(true);
    await f.core.team.setMode(owner, false);
    await f.core.team.setMode(owner, true);
    expect(f.core.registry.list(human.humanId)).toEqual([]);
    expect(f.core.tob.slug(human)).toBeUndefined();
    await off();
    await ctx.fiber.dispose();
    closes.pop();
    await closes.pop()!();
    const restarted = fixture(f.dshHome);
    expect(restarted.core.registry.list(human.humanId)).toEqual([]);
    expect(await restarted.methods(human).tobHome({})).toEqual({
      ok: true,
      value: { available: false },
    });
    expect(restarted.db.read((db) => db.prepare('SELECT * FROM tob_identity').all())).toEqual([]);
  });
});

const previousMember = ['channels.create', 'dm.humans', 'bots.create', 'models.use'];
describe('M13 upgrade', () => {
  it.each(['unmodified', 'permissions', 'name', 'models'] as const)(
    'narrows only an unmodified Member role: %s',
    (changed) => {
      const home = createTempRoot('m13-upgrade-');
      const prior = mountOperationalDatabase({
        dshHome: home,
        schemaPlan: defineSchemaPlan(
          BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 149),
        ),
      });
      const old = attachOperationalModule(prior, 'm13-upgrade');
      const permissions = changed === 'permissions' ? ['dm.humans', 'bots.create'] : previousMember;
      old.transaction((db) => {
        db.prepare(
          'UPDATE host_roles SET name = ?, permissions_json = ?, models_json = ? WHERE builtin = ?',
        ).run(
          changed === 'name' ? 'Custom member' : 'member',
          JSON.stringify(permissions),
          changed === 'models' ? '{"kind":"only","routes":[]}' : '{"kind":"all"}',
          'member',
        );
        db.prepare('INSERT INTO host_roles VALUES (?, ?, NULL, ?, ?)').run(
          'custom',
          'Custom',
          JSON.stringify(['bots.create', 'usage.view']),
          '{"kind":"all"}',
        );
        db.prepare("INSERT INTO humans VALUES ('member', 'Member', 'active', 'before')").run();
        db.prepare("INSERT INTO human_roles VALUES ('member', 'member')").run();
      });
      prior.close();
      const upgraded = trackTestOwner(
        mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
      );
      expect(upgraded.mode).toBe('ready');
      attachOperationalModule(upgraded, 'm13-readback').read((db) => {
        const member = db
          .prepare("SELECT permissions_json FROM host_roles WHERE builtin = 'member'")
          .get();
        expect(member?.permissions_json).toBe(
          JSON.stringify(
            changed === 'unmodified'
              ? ['dm.humans']
              : permissions.map((p) => (p === 'bots.create' ? 'bots.createPrivate' : p)),
          ),
        );
        expect(
          db.prepare("SELECT permissions_json FROM host_roles WHERE role_id = 'custom'").get()
            ?.permissions_json,
        ).toBe('["bots.createPrivate","usage.view"]');
        expect(db.prepare('PRAGMA foreign_key_check').all()).toEqual([]);
      });
    },
  );

  it('retains former member Tob Memory and DM through upgrade/restart as an ordinary private Bot', async () => {
    const f = fixture();
    const created = f.core.registry.create({
      slug: 'legacy-tob',
      displayName: 'Tob',
      ownerHumanId: 'member',
    });
    expect(created.ok).toBe(true);
    const dm = f.core.channels.getOrCreateDm(f.human, 'legacy-tob', 'Tob')!;
    const memory = join(f.core.registry.memoryDirFor('legacy-tob')!, 'retained.md');
    writeFileSync(memory, 'retained memory');
    const ownerHome = await f.core.tob.ensure(owner);
    f.db.transaction((db) => {
      db.prepare("INSERT INTO tob_identity VALUES ('member', 'legacy-tob')").run();
      BOT_HARNESS_SCHEMA_PLAN.migrations
        .find((migration) => migration.id === 'minimal-member')!
        .migrate(db);
    });
    await closes.pop()!();
    const restarted = fixture(f.dshHome);
    expect(restarted.core.operationalDatabase.mode).toBe('ready');
    expect(restarted.core.registry.get('legacy-tob')?.ownerHumanId).toBe('member');
    expect(readFileSync(memory, 'utf8')).toBe('retained memory');
    expect(restarted.core.channels.get(dm.id)).toBeDefined();
    expect(restarted.core.tob.isTob('legacy-tob')).toBe(false);
    expect(restarted.core.tob.slug(restarted.human)).toBeUndefined();
    expect(await restarted.methods(restarted.human).tobHome({})).toEqual({
      ok: true,
      value: { available: false },
    });
    expect(restarted.core.tob.slug(owner)).toBe(ownerHome.botSlug);
    expect(() => restarted.core.deletions.preview('legacy-tob')).not.toThrow();
    expect(restarted.core.team.transferPreview(owner, 'member').bots).toEqual([
      { slug: 'legacy-tob', displayName: 'Tob' },
    ]);
  });
});
