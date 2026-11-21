import { roleModelsSchema } from '../src/team/permissions.js';
import { DatabaseSync } from 'node:sqlite';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { Peer } from '@deepseek-ai/dsh-client-connection';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { enabledFixture, actors, cleanup } from './team-mode-fixtures.js';

afterEach(cleanup);

describe('M3 Host Roles and devices', { timeout: 60_000 }, () => {
  it('exposes fixed ids, built-ins and a self-only viewer; unions roles and keeps Owner implicit', async () => {
    const f = await actors();
    const catalog = z
      .array(z.object({ id: z.string(), group: z.string() }).strict())
      .parse(await f.invoke('permissionCatalog'));
    expect(catalog).toHaveLength(18);
    expect(catalog).toContainEqual({ id: 'models.configure', group: 'compute' });
    expect(catalog).toContainEqual({ id: 'modelSources.manage', group: 'compute' });
    expect(f.team.mode(owner).viewer).toMatchObject({
      owner: true,
      roleIds: [],
      permissions: catalog.map((p) => p.id),
    });
    expect(f.team.mode(f.human).viewer).toMatchObject({
      owner: false,
      roleIds: ['member'],
      permissions: ['dm.humans'],
    });
    const builtins = f.team.roles.list(owner);
    expect(builtins.find((r) => r.builtin === 'admin')?.permissions).toHaveLength(16);
    expect(builtins.find((r) => r.builtin === 'admin')?.permissions).toContain('models.configure');
    expect(builtins.find((r) => r.builtin === 'admin')?.permissions).not.toContain(
      'privateContent.view',
    );
    expect(builtins.find((r) => r.builtin === 'admin')?.permissions).not.toContain(
      'modelSources.manage',
    );
    expect(builtins.find((r) => r.builtin === 'member')?.memberCount).toBe(2);
    const { role } = f.team.roles.create(owner, 'Operators', ['usage.view', 'audit.view']);
    f.team.roles.set(owner, f.human.humanId, ['member', role.roleId, role.roleId]);
    expect(f.team.mode(f.human).viewer.permissions).toEqual([
      'dm.humans',
      'usage.view',
      'audit.view',
    ]);
    expect(f.team.members(owner).find((m) => m.humanId === f.human.humanId)).toMatchObject({
      roleIds: ['member', role.roleId].sort(),
      deviceCount: 1,
    });
    const before = f.db.diagnostics().metrics.reads;
    expect(f.team.roles.permissions(f.human)).toContain('audit.view');
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
  });

  it.each(['', ' ', 'a'.repeat(129), 'a\u0000b'])(
    'refuses invalid role names: %j',
    async (name) => {
      const f = await enabledFixture();
      expect(() => f.team.roles.create(owner, name, [])).toThrow('role-name-invalid');
    },
  );

  it('validates names and permissions and preserves built-ins', async () => {
    const f = await enabledFixture();
    const { role } = f.team.roles.create(owner, 'Finance', ['usage.view', 'usage.view']);
    expect(role.permissions).toEqual(['usage.view']);
    expect(() => f.team.roles.create(owner, ' finance ', [])).toThrow('role-name-taken');
    expect(() => f.team.roles.update(owner, role.roleId, { name: 'ADMIN' })).toThrow(
      'role-name-taken',
    );
    expect(() => f.team.roles.create(owner, 'Unknown', ['not-a-permission'])).toThrow(
      'permission-unknown',
    );
    expect(() => f.team.roles.update(owner, role.roleId, { permissions: ['bogus'] })).toThrow(
      'permission-unknown',
    );
    expect(() =>
      f.team.roles.update(owner, 'admin', { permissions: ['privateContent.view'] }),
    ).toThrow('permission-not-grantable');
    expect(() => f.team.roles.update(owner, 'absent', {})).toThrow('role-not-found');
    expect(() => f.team.roles.delete(owner, 'absent')).toThrow('role-not-found');
    for (const id of ['admin', 'member'])
      expect(() => f.team.roles.delete(owner, id)).toThrow('role-builtin');
    expect(
      f.team.roles.update(owner, 'admin', { name: 'Operators', permissions: ['roles.manage'] })
        .role,
    ).toMatchObject({ builtin: 'admin', name: 'Operators', permissions: ['roles.manage'] });
  });

  it('repairs the last deleted role with member and keeps other roles intact', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Temporary', []);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    f.team.roles.set(owner, f.alice.member.humanId, ['admin', role.roleId]);
    f.team.roles.delete(owner, role.roleId);
    expect(f.team.member(f.human.humanId)?.roleIds).toEqual(['member']);
    expect(f.team.member(f.alice.member.humanId)?.roleIds).toEqual(['admin']);
    f.team.roles.set(owner, f.human.humanId, []);
    expect(f.team.member(f.human.humanId)?.roleIds).toEqual(['member']);
  });

  it('admits member managers, refuses Admin grants, and reevaluates existing Peers after permission removal', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Member managers', ['members.manage']);
    f.team.roles.set(owner, f.human.humanId, ['member', role.roleId]);
    expect(await f.invoke('roles')).toBeInstanceOf(Array);
    const created = await f.invoke('memberCreate', { username: 'carol', displayName: 'Carol' });
    expect(created).toMatchObject({ member: { roleIds: ['member'] } });
    await expect(
      f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: ['admin'] }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(
      f.invoke('memberCreate', { username: 'admin2', displayName: 'Admin', roleIds: ['admin'] }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await expect(
      f.invoke('memberRolesSet', { humanId: 'absent', roleIds: ['member'] }),
    ).rejects.toMatchObject({ code: 'member-not-found' });
    await expect(
      f.invoke('memberRolesSet', { humanId: owner.humanId, roleIds: ['member'] }),
    ).rejects.toMatchObject({ code: 'owner-protected' });
    await expect(
      f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: ['absent'] }),
    ).rejects.toMatchObject({ code: 'role-not-found' });
    const before = f.invalidate.mock.calls.length;
    f.team.roles.update(owner, role.roleId, { permissions: [] });
    expect(f.invalidate.mock.calls.length).toBeGreaterThan(before);
    await expect(f.invoke('members')).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    await expect(f.invoke('roles')).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'roles.manage' },
    });
    expect(f.team.resolve(f.bobLogin.peer.principal)).toEqual(f.human);
  });

  it('authorizes role editors and Team settings independently', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Settings', [
      'roles.manage',
      'team.settings',
      'audit.view',
      'usage.view',
    ]);
    f.team.roles.set(owner, f.human.humanId, [role.roleId]);
    const result = await f.invoke('roleCreate', { name: 'Reviewers', permissions: ['audit.view'] });
    const id = z.object({ role: z.object({ roleId: z.string() }) }).parse(result).role.roleId;
    await f.invoke('roleUpdate', { roleId: id, permissions: ['usage.view'] });
    await f.invoke('roleDelete', { roleId: id });
    await f.invoke('teamInsecureHttpSet', { allowed: true });
    expect(f.team.mode(f.human).insecureHttpAllowed).toBe(true);
    const group = f.channels.createGroup(owner, { name: 'Publish', members: [] });
    await expect(
      f.invoke('channelPublicSet', { channelId: group.id, public: true }),
    ).rejects.toMatchObject({ code: 'channel-not-found' });
    f.team.roles.update(owner, role.roleId, {
      permissions: [...role.permissions, 'channels.manageAll'],
    });
    await f.invoke('channelPublicSet', { channelId: group.id, public: true });
    expect(f.team.channelAccess.visibleIds(f.human).has(group.id)).toBe(true);
    await expect(f.invoke('members')).rejects.toMatchObject({ code: 'permission-required' });
    await expect(
      f.invoke('teamOwnerPasswordSet', { password: 'replacement-password' }),
    ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    await f.invoke('teamModeSet', { enabled: false });
    expect(f.bobLogin.peer.signal.aborted).toBe(true);
  });

  it('allows covered managers to reset members across ownership transfer', async () => {
    const f = await actors();
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    expect(
      await f.invoke('memberPasswordReset', { humanId: f.alice.member.humanId }),
    ).toMatchObject({ initialPassword: expect.any(String) });
    const oldOwner = await f.team.signIn('owner', 'owner-password-1', 'owner-ip');
    await f.team.transferOwner(owner, f.human.humanId, 'owner-password-1');
    expect(
      await f.invoke('memberPasswordReset', { humanId: f.alice.member.humanId }, oldOwner.peer),
    ).toMatchObject({ initialPassword: expect.any(String) });
    await expect(
      f.invoke('memberPasswordReset', { humanId: f.human.humanId }),
    ).rejects.toMatchObject({ code: 'owner-protected' });
    expect(await f.invoke('memberPasswordReset', { humanId: owner.humanId })).toMatchObject({
      initialPassword: expect.any(String),
    });
    expect(f.team.member(owner.humanId)?.mustChangePassword).toBe(true);
    expect(oldOwner.peer.signal.aborted).toBe(true);
  });

  describe('role delegation ceiling', () => {
    it.each([
      'create-all',
      'create-default',
      'create-outside',
      'update-all',
      'update-outside',
      'assign-all',
      'assign-outside',
      'assign-default',
      'member-create',
      'delete-fallback',
    ] as const)('refuses model grants beyond a restricted manager ceiling: %s', async (path) => {
      const f = await actors();
      const base = f.team.roles.permissions(f.human);
      const manager = f.team.roles.create(
        owner,
        'Restricted managers',
        [...base, 'roles.manage', 'members.manage'],
        { kind: 'only', routes: ['provider/allowed'] },
      ).role;
      f.team.roles.set(owner, f.human.humanId, [manager.roleId]);
      const models = path.includes('outside')
        ? { kind: 'only' as const, routes: ['provider/outside'] }
        : { kind: 'all' as const };
      const unrestricted = f.team.roles.create(owner, 'Outside', [], models).role;
      const limited = f.team.roles.create(owner, 'Limited', [], {
        kind: 'only',
        routes: ['provider/allowed'],
      }).role;
      if (path === 'delete-fallback')
        f.team.roles.set(owner, f.alice.member.humanId, [limited.roleId]);
      const roles = f.team.roles.list(owner);
      const members = f.team.members(owner);
      const invalidations = f.invalidate.mock.calls.length;
      const run = () => {
        switch (path) {
          case 'create-all':
          case 'create-outside':
            return f.invoke('roleCreate', { name: 'Escalated models', permissions: [], models });
          case 'create-default':
            return f.invoke('roleCreate', { name: 'Default models', permissions: [] });
          case 'update-all':
          case 'update-outside':
            return f.invoke('roleUpdate', { roleId: limited.roleId, models });
          case 'assign-all':
          case 'assign-outside':
            return f.invoke('memberRolesSet', {
              humanId: f.alice.member.humanId,
              roleIds: [unrestricted.roleId],
            });
          case 'assign-default':
            return f.invoke('memberRolesSet', { humanId: f.alice.member.humanId, roleIds: [] });
          case 'member-create':
            return f.invoke('memberCreate', {
              username: 'model-escalation',
              displayName: 'New member',
              roleIds: [unrestricted.roleId],
            });
          case 'delete-fallback':
            return f.invoke('roleDelete', { roleId: limited.roleId });
        }
      };
      await expect(run()).rejects.toMatchObject({
        code: 'model-not-allowed',
        details: { route: path.includes('outside') ? 'provider/outside' : 'all' },
      });
      expect(f.team.roles.list(owner)).toEqual(roles);
      expect(f.team.members(owner)).toEqual(members);
      expect(f.invalidate.mock.calls).toHaveLength(invalidations);
    });

    it.each(['owner', 'all-manager', 'restricted-manager'] as const)(
      'permits model grants within the acting %s policy',
      async (actorKind) => {
        const f = await actors();
        const manager = f.team.roles.create(
          owner,
          'Model managers',
          [...f.team.roles.permissions(f.human), 'roles.manage', 'members.manage'],
          actorKind === 'restricted-manager'
            ? { kind: 'only', routes: ['provider/allowed'] }
            : { kind: 'all' },
        ).role;
        f.team.roles.set(owner, f.human.humanId, [manager.roleId]);
        const human = actorKind === 'owner' ? owner : f.human;
        const models =
          actorKind === 'restricted-manager'
            ? { kind: 'only' as const, providers: [], routes: ['provider/allowed'] }
            : { kind: 'all' as const };
        const peer =
          actorKind === 'owner'
            ? new Peer(f.ctx, { principal: { kind: 'owner' } })
            : f.bobLogin.peer;
        const created = z
          .object({ role: z.object({ roleId: z.string(), models: roleModelsSchema }) })
          .parse(
            await f.invoke(
              'roleCreate',
              { name: 'Delegated models', permissions: [], models },
              peer,
            ),
          ).role;
        expect(created.models).toEqual({ ...models, engineAccounts: [] });
        expect(f.team.roles.update(human, created.roleId, { models }).role.models).toEqual({
          ...models,
          engineAccounts: [],
        });
        f.team.roles.set(human, f.alice.member.humanId, [created.roleId]);
        expect(f.team.mode(humanContext(f.alice.member.humanId)).viewer.models).toEqual(
          models.kind === 'all'
            ? { all: true, engineAccounts: [] }
            : {
                all: false,
                providers: models.providers,
                routes: models.routes,
                engineAccounts: [],
              },
        );
        const member = await f.team.createMember(human, 'delegated-models', 'Delegated', [
          created.roleId,
        ]);
        expect(member.member.roleIds).toEqual([created.roleId]);
        const existing = f.team.roles.create(owner, 'Existing all', []).role;
        expect(
          f.team.roles.update(human, existing.roleId, { name: 'Existing renamed' }).role.models,
        ).toEqual({ kind: 'all', engineAccounts: [] });
      },
    );

    it.each(['actor-policy', 'assigned-role'] as const)(
      'rechecks model grants after member password hashing yields: %s',
      async (changed) => {
        const f = await actors();
        const manager = f.team.roles.create(
          owner,
          'Limited managers',
          [...f.team.roles.permissions(f.human), 'members.manage'],
          { kind: 'only', routes: ['provider/allowed'] },
        ).role;
        const assigned = f.team.roles.create(owner, 'Limited grant', [], {
          kind: 'only',
          routes: ['provider/allowed'],
        }).role;
        f.team.roles.set(owner, f.human.humanId, [manager.roleId]);
        const pending = f.team.createMember(f.human, 'late-models', 'Late models', [
          assigned.roleId,
        ]);
        if (changed === 'actor-policy')
          f.team.roles.update(owner, manager.roleId, { models: { kind: 'only', routes: [] } });
        else f.team.roles.update(owner, assigned.roleId, { models: { kind: 'all' } });
        await expect(pending).rejects.toMatchObject({
          code: 'model-not-allowed',
          details: { route: changed === 'actor-policy' ? 'provider/allowed' : 'all' },
        });
        expect(f.team.members(owner).some((member) => member.username === 'late-models')).toBe(
          false,
        );
      },
    );

    const paths = [
      'create',
      'update-grant',
      'rename-existing',
      'strip-existing',
      'delete-existing',
      'assign',
      'member-create',
    ] as const;
    it.each(
      paths.flatMap((path) => [
        { path, permission: 'privateContent.view', admin: true },
        { path, permission: 'audit.view', admin: false },
      ]),
    )(
      'refuses $path beyond the caller ceiling: $permission',
      async ({ path, permission, admin }) => {
        const f = await actors();
        const manager = f.team.roles.create(owner, 'Managers', [
          'roles.manage',
          'members.manage',
        ]).role;
        f.team.roles.set(owner, f.human.humanId, admin ? ['admin'] : ['member', manager.roleId]);
        const existing = ['update-grant', 'create'].includes(path) ? [] : [permission];
        const protectedRole = f.team.roles.create(owner, 'Protected', existing).role;
        const beforeRoles = f.team.roles.list(owner);
        const beforeMembers = f.team.members(owner);
        const beforeInvalidations = f.invalidate.mock.calls.length;
        const run = () => {
          switch (path) {
            case 'create':
              return f.invoke('roleCreate', { name: 'Escalated', permissions: [permission] });
            case 'update-grant':
              return f.invoke('roleUpdate', {
                roleId: protectedRole.roleId,
                permissions: [permission],
              });
            case 'rename-existing':
              return f.invoke('roleUpdate', { roleId: protectedRole.roleId, name: 'Changed' });
            case 'strip-existing':
              return f.invoke('roleUpdate', { roleId: protectedRole.roleId, permissions: [] });
            case 'delete-existing':
              return f.invoke('roleDelete', { roleId: protectedRole.roleId });
            case 'assign':
              return f.invoke('memberRolesSet', {
                humanId: f.alice.member.humanId,
                roleIds: [protectedRole.roleId],
              });
            case 'member-create':
              return f.invoke('memberCreate', {
                username: 'escalated',
                displayName: 'Escalated',
                roleIds: [protectedRole.roleId],
              });
          }
        };
        await expect(run()).rejects.toMatchObject({
          code: 'permission-not-grantable',
          details: { permission },
        });
        expect(f.team.roles.list(owner)).toEqual(beforeRoles);
        expect(f.team.members(owner)).toEqual(beforeMembers);
        expect(f.invalidate.mock.calls.length).toBe(beforeInvalidations);
      },
    );

    it.each(['member', 'admin', 'private', 'absent'])(
      'refuses Admin self-assignment of %s',
      async (requested) => {
        const f = await actors();
        const privateRole = f.team.roles.create(owner, 'Private', ['privateContent.view']).role;
        f.team.roles.set(owner, f.human.humanId, ['admin']);
        const before = f.team.mode(f.human).viewer;
        await expect(
          f.invoke('memberRolesSet', {
            humanId: f.human.humanId,
            roleIds: [requested === 'private' ? privateRole.roleId : requested],
          }),
        ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
        expect(f.team.mode(f.human).viewer).toEqual(before);
      },
    );

    it.each(['create', 'update', 'assign', 'member-create'] as const)(
      'reserves private grants to Owner even when the caller already holds private access: %s',
      async (path) => {
        const f = await actors();
        const privateRole = f.team.roles.create(owner, 'Private', ['privateContent.view']).role;
        const empty = f.team.roles.create(owner, 'Empty', []).role;
        f.team.roles.set(owner, f.human.humanId, ['admin', privateRole.roleId]);
        const run = () => {
          switch (path) {
            case 'create':
              return f.invoke('roleCreate', {
                name: 'Another private role',
                permissions: ['privateContent.view'],
              });
            case 'update':
              return f.invoke('roleUpdate', {
                roleId: empty.roleId,
                permissions: ['privateContent.view'],
              });
            case 'assign':
              return f.invoke('memberRolesSet', {
                humanId: f.alice.member.humanId,
                roleIds: [privateRole.roleId],
              });
            case 'member-create':
              return f.invoke('memberCreate', {
                username: 'private2',
                displayName: 'Private',
                roleIds: [privateRole.roleId],
              });
          }
        };
        await expect(run()).rejects.toMatchObject({
          code: 'permission-not-grantable',
          details: { permission: 'privateContent.view' },
        });
      },
    );

    it('permits the Owner to create, edit, assign and delete private roles', async () => {
      const f = await actors();
      const role = f.team.roles.create(owner, 'Private', ['privateContent.view']).role;
      f.team.roles.update(owner, role.roleId, {
        name: 'Private access',
        permissions: ['privateContent.view', 'audit.view'],
      });
      f.team.roles.set(owner, f.human.humanId, [role.roleId]);
      f.team.roles.set(owner, f.alice.member.humanId, [role.roleId]);
      const created = await f.team.createMember(owner, 'private3', 'Private', [role.roleId]);
      for (const human of [
        f.human,
        humanContext(f.alice.member.humanId),
        humanContext(created.member.humanId),
      ])
        expect(f.team.roles.permissions(human)).toContain('privateContent.view');
      f.team.roles.delete(owner, role.roleId);
      expect(f.team.member(f.human.humanId)?.roleIds).toEqual(['member']);
    });

    it('permits delegation of held permissions to another member and new members', async () => {
      const f = await actors();
      f.team.roles.set(owner, f.human.humanId, ['admin']);
      const reads = f.db.diagnostics().metrics.reads;
      const role = f.team.roles.create(f.human, 'Auditors', ['audit.view']).role;
      expect(f.db.diagnostics().metrics.reads - reads).toBe(5);
      f.team.roles.update(f.human, role.roleId, { permissions: ['usage.view'] });
      f.team.roles.set(f.human, f.alice.member.humanId, [role.roleId]);
      const created = await f.team.createMember(f.human, 'auditor2', 'Auditor', [role.roleId]);
      expect(created.member.roleIds).toEqual([role.roleId]);
      f.team.roles.delete(f.human, role.roleId);
      expect(f.team.member(f.alice.member.humanId)?.roleIds).toEqual(['member']);
    });

    it('refuses self-assignment even without member-management permission', async () => {
      const f = await actors();
      await expect(
        f.invoke('memberRolesSet', { humanId: f.human.humanId, roleIds: ['member'] }),
      ).rejects.toMatchObject({ code: 'permission-required', details: { permission: 'owner' } });
    });

    it.each(['actor-ceiling', 'assigned-role'] as const)(
      'rechecks delegation after member password hashing yields: %s',
      async (changed) => {
        const f = await actors();
        const manager = f.team.roles.create(owner, 'Managers', [
          'members.manage',
          'audit.view',
        ]).role;
        const assigned = f.team.roles.create(owner, 'Auditors', ['audit.view']).role;
        f.team.roles.set(owner, f.human.humanId, ['member', manager.roleId]);
        const pending = f.team.createMember(f.human, 'late-auditor', 'Late', [assigned.roleId]);
        if (changed === 'actor-ceiling')
          f.team.roles.update(owner, manager.roleId, { permissions: ['members.manage'] });
        else f.team.roles.update(owner, assigned.roleId, { permissions: ['privateContent.view'] });
        await expect(pending).rejects.toMatchObject({
          code: 'permission-not-grantable',
          details: {
            permission: changed === 'actor-ceiling' ? 'audit.view' : 'privateContent.view',
          },
        });
        expect(f.team.members(owner).some((member) => member.username === 'late-auditor')).toBe(
          false,
        );
      },
    );

    it('checks the automatic Member fallback against the deleting caller ceiling', async () => {
      const f = await actors();
      f.team.roles.set(owner, f.human.humanId, ['admin']);
      const role = f.team.roles.create(owner, 'Temporary', ['usage.view']).role;
      f.team.roles.set(owner, f.alice.member.humanId, [role.roleId]);
      f.team.roles.update(owner, 'member', { permissions: ['privateContent.view'] });
      const before = f.team.roles.list(owner);
      await expect(f.invoke('roleDelete', { roleId: role.roleId })).rejects.toMatchObject({
        code: 'permission-not-grantable',
        details: { permission: 'privateContent.view' },
      });
      expect(f.team.roles.list(owner)).toEqual(before);
      expect(f.team.member(f.alice.member.humanId)?.roleIds).toEqual([role.roleId]);
    });
  });

  it('retains M1 identities and credentials while assigning the built-in Member role on upgrade', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec(`PRAGMA foreign_keys = ON;
        CREATE TABLE humans(human_id TEXT PRIMARY KEY);
        CREATE TABLE team_settings(singleton INTEGER PRIMARY KEY, enabled INTEGER, insecure_http_allowed INTEGER);
        INSERT INTO team_settings VALUES (1, 1, 0);
        INSERT INTO humans VALUES ('local-human'), ('existing-member');`);
      const migration = BOT_HARNESS_SCHEMA_PLAN.migrations.find(
        (entry) => entry.generation === 142,
      );
      if (!migration) throw new Error('missing migration');
      migration.migrate(db);
      expect(db.prepare('SELECT * FROM human_roles').all()).toEqual([
        { human_id: 'existing-member', role_id: 'member' },
      ]);
      expect(db.prepare('SELECT owner_human_id FROM team_settings').get()).toEqual({
        owner_human_id: 'local-human',
      });
      expect(db.prepare('SELECT human_id FROM humans ORDER BY human_id').all()).toHaveLength(2);
    } finally {
      db.close();
    }
  });

  it('removes every effective permission from suspended Humans, including an in-flight member creator', async () => {
    const f = await actors();
    f.team.roles.set(owner, f.human.humanId, ['admin']);
    const pending = f.team.createMember(f.human, 'late-suspended', 'Late').then(
      (member) => ({ member }),
      (error: unknown) => ({ error }),
    );
    await f.team.suspend(owner, f.human.humanId);
    expect(f.team.roles.permissions(f.human)).toEqual([]);
    expect(await pending).toMatchObject({
      error: { code: 'permission-required', details: { permission: 'members.manage' } },
    });
    expect(f.team.members(owner).some((member) => member.username === 'late-suspended')).toBe(
      false,
    );
    f.database.transaction((db) =>
      db.prepare("UPDATE humans SET status = 'suspended' WHERE human_id = ?").run(owner.humanId),
    );
    expect(f.team.roles.permissions(owner)).toEqual([]);
  });

  it('rechecks member-creation authority after password hashing yields', async () => {
    const f = await actors();
    const { role } = f.team.roles.create(owner, 'Managers', ['members.manage']);
    f.team.roles.set(owner, f.human.humanId, ['member', role.roleId]);
    const pending = f.team.createMember(f.human, 'late-member', 'Late');
    f.team.roles.update(owner, role.roleId, { permissions: [] });
    await expect(pending).rejects.toMatchObject({
      code: 'permission-required',
      details: { permission: 'members.manage' },
    });
    expect(f.team.members(owner).some((m) => m.username === 'late-member')).toBe(false);
  });

  it('keeps directory and permission query counts constant as the team grows', async () => {
    const f = await actors();
    f.database.transaction((db) => {
      for (let index = 0; index < 1000; index++) {
        db.prepare("INSERT INTO humans VALUES (?, ?, 'active', '2026-11-14T00:00:00Z')").run(
          `scale-${index}`,
          `scale-${index}`,
        );
        db.prepare("INSERT INTO human_roles VALUES (?, 'member')").run(`scale-${index}`);
      }
    });
    let before = f.db.diagnostics().metrics.reads;
    expect(f.team.roles.permissions(f.human)).toEqual(['dm.humans']);
    expect(f.db.diagnostics().metrics.reads - before).toBe(1);
    before = f.db.diagnostics().metrics.reads;
    expect(f.team.members(owner)).toHaveLength(1003);
    expect(f.db.diagnostics().metrics.reads - before).toBe(2);
    before = f.db.diagnostics().metrics.reads;
    expect(f.team.roles.list(owner)).toHaveLength(2);
    expect(f.db.diagnostics().metrics.reads - before).toBe(2);
  });

  it.each([
    ['permissionCatalog', {}, null],
    ['roles', {}, 'roles.manage'],
    ['roleCreate', { name: 'Not allowed', permissions: [] }, 'roles.manage'],
    ['roleUpdate', { roleId: 'admin', permissions: [] }, 'roles.manage'],
    ['roleDelete', { roleId: 'admin' }, 'roles.manage'],
    ['members', {}, 'members.manage'],
    ['memberCreate', { username: 'not-allowed', displayName: 'No' }, 'members.manage'],
    ['memberRolesSet', { humanId: 'other-human', roleIds: [] }, 'members.manage'],
    ['memberDevices', { humanId: 'other-human' }, 'members.manage'],
    ['memberDeviceRevoke', { humanId: 'other-human', grantId: 'other-grant' }, 'members.manage'],
    ['ownerTransfer', { humanId: 'other-human', password: 'password' }, 'owner'],
    ['memberPasswordReset', { humanId: 'other-human' }, 'members.manage'],
    ['teamModeSet', { enabled: true }, 'team.settings'],
    ['teamInsecureHttpSet', { allowed: true }, 'team.settings'],
    ['teamOwnerPasswordSet', { password: 'password' }, 'owner'],
  ] as const)(
    'scopes newly allowed %s with no other Human content or counts',
    async (method, args, permission) => {
      const f = await actors();
      f.channels.createGroup(owner, { name: 'Secret owner channel', members: [] });
      const argsCopy: Record<string, unknown> = { ...args };
      let result: unknown;
      if (permission) {
        const error = await f.invoke(method, argsCopy).catch((failure: unknown) => failure);
        expect(error).toMatchObject({ code: 'permission-required', details: { permission } });
        result = error;
      } else result = await f.invoke(method, argsCopy);
      const encoded = JSON.stringify(result);
      for (const secret of [
        f.alice.member.humanId,
        'Alice',
        'Secret owner channel',
        'local-human',
        'other-human',
        'other-grant',
      ])
        expect(encoded).not.toContain(secret);
    },
  );
});
