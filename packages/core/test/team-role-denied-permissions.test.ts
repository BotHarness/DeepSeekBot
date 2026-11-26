import { describe, expect, it } from 'vitest';
import { createTeamBridge } from '../src/features/team/bridge.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { canManageGrants } from '../src/tob/management-grants.js';
import { alice, bob, fixture } from './team-bot-visibility-fixtures.js';

function setTeamMode(f: ReturnType<typeof fixture>, enabled: boolean) {
  f.db.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled = ?').run(enabled ? 1 : 0);
  });
}

describe('Host Role denials', () => {
  it('lets any denying role win over an allowing role for the same member', () => {
    const f = fixture();
    const leads = f.team.roles.create(owner, 'Leads', ['channels.create']).role;
    const interns = f.team.roles.create(owner, 'Interns', [], undefined, undefined, [
      'channels.create',
    ]).role;
    f.team.roles.set(owner, bob.humanId, ['member', leads.roleId]);
    expect(f.team.roles.permissions(bob)).toContain('channels.create');
    f.team.roles.set(owner, bob.humanId, ['member', leads.roleId, interns.roleId]);
    expect(f.team.roles.permissions(bob)).not.toContain('channels.create');
    expect(() => f.team.roles.require(bob, 'channels.create')).toThrow('permission-required');
  });

  it('refuses a channel the denied member tries to create through the bridge', () => {
    const f = fixture();
    const leads = f.team.roles.create(owner, 'Leads', ['channels.create']).role;
    const quiet = f.team.roles.create(owner, 'Quiet', [], undefined, undefined, [
      'channels.create',
    ]).role;
    f.team.roles.set(owner, bob.humanId, ['member', leads.roleId, quiet.roleId]);
    expect(f.bridge(bob).channelCreate({ name: 'Ops', members: [] })).toMatchObject({
      ok: false,
      error: {
        code: 'permission-required',
        details: { permission: 'channels.create' },
      },
    });
    f.team.roles.update(owner, quiet.roleId, { denied: [] });
    expect(f.bridge(bob).channelCreate({ name: 'Ops', members: [] })).toMatchObject({
      ok: true,
    });
  });

  it('reports each effective permission with the roles it comes from', async () => {
    const f = fixture();
    const leads = f.team.roles.create(owner, 'Leads', ['channels.create', 'usage.view']).role;
    const quiet = f.team.roles.create(owner, 'Quiet', [], undefined, undefined, [
      'channels.create',
    ]).role;
    f.team.roles.set(owner, bob.humanId, ['member', leads.roleId, quiet.roleId]);
    const result = await createTeamBridge(owner, f.team).memberPermissions({
      humanId: bob.humanId,
    });
    if (!result.ok) throw new Error(result.error.code);
    const byId = new Map(result.value.permissions.map((entry) => [entry.id, entry]));
    expect(byId.get('channels.create')).toEqual({
      id: 'channels.create',
      state: 'denied',
      sources: [
        { roleId: leads.roleId, name: 'Leads', builtin: null, effect: 'allow' },
        { roleId: quiet.roleId, name: 'Quiet', builtin: null, effect: 'deny' },
      ].sort((a, b) => a.roleId.localeCompare(b.roleId)),
    });
    expect(byId.get('usage.view')).toMatchObject({ state: 'granted' });
    expect(byId.get('dm.humans')).toMatchObject({
      state: 'granted',
      sources: [{ roleId: 'member', effect: 'allow' }],
    });
    expect(byId.get('audit.view')).toEqual({
      id: 'audit.view',
      state: 'unset',
      sources: [],
    });
  });

  it('lets members read only their own effective permissions', async () => {
    const f = fixture();
    expect(await createTeamBridge(bob, f.team).memberPermissions({})).toMatchObject({
      ok: true,
      value: { humanId: bob.humanId, owner: false, active: true },
    });
    expect(
      await createTeamBridge(bob, f.team).memberPermissions({
        humanId: alice.humanId,
      }),
    ).toMatchObject({
      ok: false,
      error: { code: 'permission-required' },
    });
  });

  it('refuses a role that both allows and denies the same permission', () => {
    const f = fixture();
    expect(() =>
      f.team.roles.create(owner, 'Confused', ['usage.view'], undefined, undefined, ['usage.view']),
    ).toThrow('permission-conflict');
    const role = f.team.roles.create(owner, 'Readers', [], undefined, undefined, [
      'usage.view',
    ]).role;
    expect(
      f.team.roles.update(owner, role.roleId, { permissions: ['usage.view'] }).role,
    ).toMatchObject({ permissions: ['usage.view'], denied: [] });
  });

  it('keeps a delegated role manager from denying permissions above their ceiling', () => {
    const f = fixture();
    const managers = f.team.roles.create(owner, 'Managers', ['roles.manage']).role;
    f.team.roles.set(owner, bob.humanId, ['member', managers.roleId]);
    expect(() =>
      f.team.roles.create(bob, 'Lockout', [], undefined, undefined, ['audit.view']),
    ).toThrow('permission-not-grantable');
    expect(
      f.team.roles.create(bob, 'Quiet', [], undefined, undefined, ['roles.manage']).role.denied,
    ).toEqual(['roles.manage']);
  });

  it('keeps a delegated role manager from deleting a role that denies above their ceiling', () => {
    const f = fixture();
    const managers = f.team.roles.create(owner, 'Managers', ['roles.manage']).role;
    f.team.roles.set(owner, bob.humanId, ['member', managers.roleId]);
    const lockout = f.team.roles.create(owner, 'Lockout', [], undefined, undefined, [
      'audit.view',
    ]).role;
    expect(() => f.team.roles.delete(bob, lockout.roleId)).toThrow('permission-not-grantable');
    expect(f.team.roles.delete(owner, lockout.roleId)).toBeNull();
  });

  it('withdraws management grant authority when another role denies bots.manageGrants', () => {
    const f = fixture();
    const stewards = f.team.roles.create(owner, 'Stewards', ['bots.manageGrants']).role;
    f.team.roles.set(owner, bob.humanId, ['member', stewards.roleId]);
    expect(canManageGrants(f.db, bob.humanId)).toBe(true);
    const quiet = f.team.roles.create(owner, 'Quiet', [], undefined, undefined, [
      'bots.manageGrants',
    ]).role;
    f.team.roles.set(owner, bob.humanId, ['member', stewards.roleId, quiet.roleId]);
    expect(canManageGrants(f.db, bob.humanId)).toBe(false);
    f.team.roles.set(owner, bob.humanId, ['member', stewards.roleId]);
    setTeamMode(f, false);
    expect(canManageGrants(f.db, bob.humanId)).toBe(false);
    expect(canManageGrants(f.db, owner.humanId)).toBe(true);
  });
});
