import { alice, bob, fixture } from './team-spaces-fixtures.js';
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';

describe('M6 spaces and current authority', () => {
  it('creates only the caller account and audience-visible shared spaces, with manager access to shared spaces only', async () => {
    const f = fixture();
    const member = f.core.spaces.create(owner, 'Members', { kind: 'members', humanIds: ['alice'] });
    const role = f.core.spaces.create(owner, 'Role', { kind: 'roles', roleIds: ['admin'] });
    const all = f.core.spaces.create(owner, 'All', { kind: 'everyone' });
    expect(f.core.spaces.list(alice).map((space) => space.spaceId)).toEqual([
      all.spaceId,
      member.spaceId,
      'spaces/alice',
    ]);
    expect(f.core.spaces.list(bob).map((space) => space.spaceId)).toEqual([
      all.spaceId,
      'spaces/bob',
    ]);
    expect(f.core.spaces.list(owner).map((space) => space.spaceId)).toContain(role.spaceId);
    expect(f.core.spaces.list(owner).filter((space) => space.kind === 'account')).toEqual([
      {
        spaceId: 'spaces/local-human',
        name: 'Human',
        kind: 'account',
        ownerHumanId: 'local-human',
        canManage: false,
      },
    ]);
    const manager = f.core.team.roles.create(owner, 'Space manager', ['workspaces.manageShared']);
    f.core.team.roles.set(owner, 'bob', [manager.role.roleId]);
    expect(f.core.spaces.list(bob).filter((space) => space.kind === 'shared')).toHaveLength(3);
    expect(f.core.spaces.list(bob).some((space) => space.spaceId === 'spaces/alice')).toBe(false);
    const changed = await f
      .bridge(alice)
      .spaceCreate({ name: 'Refused', audience: { kind: 'everyone' } });
    expect(changed).toMatchObject({
      ok: false,
      error: { code: 'permission-required', details: { permission: 'workspaces.manageShared' } },
    });
    expect(
      f.core.spaces.update(owner, member.spaceId, {
        name: 'Renamed',
        audience: { kind: 'everyone' },
      }),
    ).toMatchObject({ name: 'Renamed' });
    expect(f.core.spaces.list(bob).some((space) => space.name === 'Renamed')).toBe(true);
  });

  it('checks every shared-space mutation and reference in the service', async () => {
    const f = fixture();
    const space = f.core.spaces.create(owner, 'Team', { kind: 'everyone' });
    expect(() => f.core.spaces.create(owner, ' team ', { kind: 'everyone' })).toThrow(
      'space-name-taken',
    );
    expect(() =>
      f.core.spaces.create(owner, 'Other', { kind: 'roles', roleIds: ['missing'] }),
    ).toThrow('role-not-found');
    expect(() =>
      f.core.spaces.create(owner, 'Other', { kind: 'members', humanIds: ['missing'] }),
    ).toThrow('member-not-found');
    for (const human of [alice, bob]) {
      expect(() => f.core.spaces.update(human, space.spaceId, { name: 'Hacked' })).toThrow(
        'permission-required',
      );
      expect(() => f.core.spaces.delete(human, space.spaceId, true)).toThrow('permission-required');
    }
    expect(() => f.core.spaces.update(owner, 'spaces/alice', { name: 'Hacked' })).toThrow(
      'space-not-found',
    );
    expect(() => f.core.spaces.delete(owner, 'spaces/alice', true)).toThrow('space-not-found');
    expect(() => f.core.spaces.delete(owner, space.spaceId, false)).toThrow('confirm-required');
    writeFileSync(join(f.core.spaces.path(space.spaceId), 'retained'), 'keep');
    expect(() => f.core.spaces.delete(owner, space.spaceId, true)).toThrow('space-not-empty');
    const empty = f.core.spaces.create(owner, 'Empty', { kind: 'everyone' });
    expect(f.core.spaces.delete(owner, empty.spaceId, true)).toBeNull();
    expect(() => f.core.spaces.delete(owner, empty.spaceId, true)).toThrow('space-not-found');
    expect(await f.bridge(owner).spaceDelete({ spaceId: space.spaceId })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

  it('uses the same Host Role ID for Channel visibility and shared spaces, refusing deletion until the space releases it', async () => {
    const f = fixture();
    const role = f.core.team.roles.create(owner, 'Finance', ['models.use']).role;
    f.core.team.roles.set(owner, alice.humanId, [role.roleId]);
    const group = f.core.channels.createGroup(owner, { name: 'Finance', members: [] });
    f.core.team.channelAccess.visibilitySet(owner, group.id, {
      kind: 'roles',
      roleIds: [role.roleId],
    });
    const shared = f.core.spaces.create(owner, 'Finance files', {
      kind: 'roles',
      roleIds: [role.roleId],
    });
    expect(f.core.team.channelAccess.canRead(alice, group.id)).toBe(true);
    expect(f.core.team.channelAccess.canRead(bob, group.id)).toBe(false);
    expect(f.core.spaces.list(alice).some((space) => space.spaceId === shared.spaceId)).toBe(true);
    expect(f.core.spaces.list(bob).some((space) => space.spaceId === shared.spaceId)).toBe(false);
    const before = f.core.team.roles.list(owner);
    expect(await f.bridge(owner).roleDelete({ roleId: role.roleId })).toMatchObject({
      ok: false,
      error: { code: 'role-in-use' },
    });
    expect(f.core.team.roles.list(owner)).toEqual(before);
    expect(f.core.team.channelAccess.canRead(alice, group.id)).toBe(true);
    f.core.spaces.update(owner, shared.spaceId, { audience: { kind: 'everyone' } });
    expect(f.core.team.roles.delete(owner, role.roleId)).toBeNull();
    expect(f.core.team.channelAccess.canRead(alice, group.id)).toBe(false);
    expect(f.core.spaces.list(bob).some((space) => space.spaceId === shared.spaceId)).toBe(true);
    const unused = f.core.team.roles.create(owner, 'Unused', []).role;
    expect(f.core.team.roles.delete(owner, unused.roleId)).toBeNull();
  });
});

describe('M6 Memory migration and offboarding', () => {
  it('keeps space listing and ordinary path checks at a fixed query count as the member directory grows', () => {
    const f = fixture();
    f.createBot();
    f.core.spaces.create(owner, 'Role', { kind: 'roles', roleIds: ['member'] });
    const sample = () => {
      let before = f.core.operationalDatabase.diagnostics().metrics.reads;
      f.core.spaces.list(alice);
      const listing = f.core.operationalDatabase.diagnostics().metrics.reads - before;
      before = f.core.operationalDatabase.diagnostics().metrics.reads;
      f.core.spaces.assertPath('alice-bot', join(f.home, 'spaces/alice/files'));
      return { listing, path: f.core.operationalDatabase.diagnostics().metrics.reads - before };
    };
    const before = sample();
    f.db.transaction((connection) => {
      for (let i = 0; i < 1000; i++)
        connection
          .prepare("INSERT INTO humans VALUES (?, 'Member', 'active', '2026-11-14')")
          .run('member-' + i);
    });
    for (let i = 0; i < 20; i++)
      f.core.spaces.create(owner, 'Role ' + i, { kind: 'roles', roleIds: ['member'] });
    expect(sample()).toEqual(before);
    expect(before.listing).toBeLessThanOrEqual(4);
    expect(before.path).toBeLessThanOrEqual(4);
  });
});
