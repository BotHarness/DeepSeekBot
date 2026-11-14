import { describe, expect, it, vi } from 'vitest';

import { parseTeamMode } from '../src/client/team-bridge.js';
import {
  canManage,
  loadMemberDevices,
  loadPermissionCatalog,
  loadRoles,
  setMemberRoles,
  updateRole,
} from '../src/client/team-roles-bridge.js';

describe('Team roles bridge', () => {
  it('reads the viewer permissions and treats the Owner as holding all of them', () => {
    const view = parseTeamMode({
      enabled: true,
      viewer: {
        humanId: 'h-ann',
        kind: 'member',
        displayName: 'Ann',
        permissions: ['members.manage'],
        roleIds: ['admin'],
      },
    });
    expect(canManage(view.viewer, 'members.manage')).toBe(true);
    expect(canManage(view.viewer, 'roles.manage')).toBe(false);
    const owner = parseTeamMode({
      enabled: true,
      viewer: { humanId: 'local-human', kind: 'owner' },
    });
    expect(canManage(owner.viewer, 'roles.manage')).toBe(true);
  });

  it('keeps only known permission groups and well-formed roles', async () => {
    expect(
      await loadPermissionCatalog(async () => ({
        ok: true,
        value: [
          { id: 'roles.manage', group: 'members' },
          { id: 'x', group: 'nope' },
        ],
      })),
    ).toEqual([{ id: 'roles.manage', group: 'members' }]);
    const roles = await loadRoles(async () => ({
      ok: true,
      value: [
        {
          roleId: 'admin',
          name: 'Admin',
          builtin: 'admin',
          permissions: ['roles.manage'],
          memberCount: 2,
        },
        { roleId: '', name: 'bad' },
      ],
    }));
    expect(roles).toEqual([
      {
        roleId: 'admin',
        name: 'Admin',
        builtin: 'admin',
        permissions: ['roles.manage'],
        memberCount: 2,
      },
    ]);
  });

  it('sends the agreed payloads', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: { role: { roleId: 'r1', name: 'Finance', builtin: null, permissions: [] } },
    }));
    await updateRole(call, { roleId: 'r1', permissions: ['usage.view'] });
    expect(call).toHaveBeenLastCalledWith(
      'roleUpdate',
      { roleId: 'r1', permissions: ['usage.view'] },
      undefined,
    );
    await setMemberRoles(call, 'h-bob', ['member', 'r1']);
    expect(call).toHaveBeenLastCalledWith(
      'memberRolesSet',
      { humanId: 'h-bob', roleIds: ['member', 'r1'] },
      undefined,
    );
  });

  it('parses member devices', async () => {
    const devices = await loadMemberDevices(
      async () => ({
        ok: true,
        value: [
          {
            grantId: 'g1',
            label: '',
            kind: 'browser',
            createdAt: 'a',
            lastSeenAt: 'b',
            current: true,
          },
          { label: 'x' },
        ],
      }),
      'h-bob',
    );
    expect(devices).toEqual([
      { grantId: 'g1', label: '', kind: 'browser', createdAt: 'a', lastSeenAt: 'b', current: true },
    ]);
  });
});

describe('granting rules in the UI', () => {
  it('offers non-Owners only permissions they hold and never private-content viewing', async () => {
    const { canGrant, canGrantAll } = await import('../src/client/team-roles-bridge.js');
    const admin = {
      owner: false,
      permissions: ['roles.manage', 'usage.view', 'privateContent.view'],
    };
    expect(canGrant(admin, 'usage.view')).toBe(true);
    expect(canGrant(admin, 'audit.view')).toBe(false);
    expect(canGrant(admin, 'privateContent.view')).toBe(false);
    expect(canGrantAll({ owner: true, permissions: [] }, ['privateContent.view'])).toBe(true);
  });
});
