import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { humanContext, OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { ALL_PERMISSIONS } from '../src/team/permissions.js';
import { TeamRoles } from '../src/team/roles.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

const member = humanContext('member-under-test');
const permission = fc.constantFrom(...ALL_PERMISSIONS);
const permissionSet = fc.subarray(ALL_PERMISSIONS);

function fixture() {
  const database = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('team-host-permissions-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const db = attachOperationalModule(database, 'team-host-permissions-test');
  db.transaction((connection) => {
    connection
      .prepare("INSERT INTO humans VALUES (?, 'Member under test', 'active', 'before')")
      .run(member.humanId);
  });
  const roles = new TeamRoles(db, () => {});
  const first = roles.create(owner, 'First role', []).role.roleId;
  const second = roles.create(owner, 'Second role', []).role.roleId;
  roles.set(owner, member.humanId, [first, second]);
  return { db, roles, first, second };
}

describe('Team mode Host Permission ceiling', () => {
  it('admits only the union of assigned permissions for an active member', () => {
    const { db, roles, first, second } = fixture();
    fc.assert(
      fc.property(
        permissionSet,
        permissionSet,
        fc.constantFrom('active', 'suspended', 'deactivated'),
        permission,
        permission,
        (firstGrants, secondGrants, status, one, two) => {
          roles.update(owner, first, { permissions: firstGrants });
          roles.update(owner, second, { permissions: secondGrants });
          db.transaction((connection) => {
            connection
              .prepare('UPDATE humans SET status = ? WHERE human_id = ?')
              .run(status, member.humanId);
          });

          const allowed = new Set(status === 'active' ? [...firstGrants, ...secondGrants] : []);
          expect(new Set(roles.permissions(member))).toEqual(allowed);
          expect(new Set(roles.permissions(owner))).toEqual(new Set(ALL_PERMISSIONS));
          if (allowed.has(one) || allowed.has(two)) {
            expect(() => roles.require(member, one, two)).not.toThrow();
          } else {
            expect(() => roles.require(member, one, two)).toThrow(
              expect.objectContaining({ code: 'permission-required' }),
            );
          }
        },
      ),
    );
  });

  it('gives the default Admin shared model configuration and lets them delegate it', () => {
    const { roles } = fixture();
    roles.set(owner, member.humanId, ['admin']);
    expect(roles.permissions(member)).toContain('models.configure');
    expect(roles.permissions(member)).not.toContain('modelSources.manage');
    expect(
      roles.create(member, 'Model Configurator', ['models.configure']).role.permissions,
    ).toEqual(['models.configure']);
  });

  it('requires role management and permits delegating only held, delegable permissions', () => {
    const { roles, first, second } = fixture();
    fc.assert(
      fc.property(permissionSet, fc.boolean(), (held, canManageRoles) => {
        roles.update(owner, first, {
          permissions: held.filter((id) => id !== 'roles.manage'),
        });
        roles.update(owner, second, { permissions: canManageRoles ? ['roles.manage'] : [] });

        for (const requested of ALL_PERMISSIONS) {
          const create = () => roles.create(member, 'Delegated role', [requested]);
          const memberHoldsIt =
            requested === 'roles.manage' ? canManageRoles : held.includes(requested);
          if (!canManageRoles) {
            expect(create).toThrow(expect.objectContaining({ code: 'permission-required' }));
          } else if (
            !memberHoldsIt ||
            requested === 'privateContent.view' ||
            requested === 'modelSources.manage'
          ) {
            expect(create).toThrow(expect.objectContaining({ code: 'permission-not-grantable' }));
          } else {
            const { role } = create();
            expect(role.permissions).toEqual([requested]);
            roles.delete(owner, role.roleId);
          }
        }
        expect(roles.list(owner).some((role) => role.name === 'Delegated role')).toBe(false);
      }),
    );
  });
});
