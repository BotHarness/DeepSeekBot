import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { ALL_PERMISSIONS, type HostPermission } from '../team-policy/permissions.js';

export type HostPermissionState = 'granted' | 'denied' | 'unset';

export interface HostPermissionSource {
  readonly roleId: string;
  readonly name: string;
  readonly builtin: 'admin' | 'member' | null;
  readonly effect: 'allow' | 'deny';
}

export interface EffectiveHostPermission {
  readonly id: HostPermission;
  readonly state: HostPermissionState;
  readonly sources: readonly HostPermissionSource[];
}

export interface EffectiveHostPermissions {
  readonly humanId: string;
  readonly owner: boolean;
  readonly active: boolean;
  readonly permissions: readonly EffectiveHostPermission[];
}

const ids = z.string().transform((value) => z.array(z.string()).parse(JSON.parse(value)));

const roleRow = z.object({
  roleId: z.string(),
  name: z.string(),
  builtin: z.enum(['admin', 'member']).nullable(),
  allow: ids,
  deny: ids,
});

const humanRow = z.object({
  owner: z.coerce.boolean(),
  active: z.coerce.boolean(),
});

export function effectiveHostPermissions(
  database: OperationalDatabaseModulePort,
  humanId: string,
): EffectiveHostPermissions | undefined {
  return database.read((db) => {
    const human = db
      .prepare(
        `SELECT h.human_id = s.owner_human_id AS owner, h.status = 'active' AS active
        FROM humans h CROSS JOIN team_settings s WHERE h.human_id = ?`,
      )
      .get(humanId);
    if (human === undefined) return undefined;
    const { owner, active } = humanRow.parse(human);
    const roles = z.array(roleRow).parse(
      db
        .prepare(
          `SELECT r.role_id AS roleId, r.name, r.builtin, r.permissions_json AS allow,
          r.denied_permissions_json AS deny
          FROM human_roles m JOIN host_roles r USING(role_id) WHERE m.human_id = ? ORDER BY r.role_id`,
        )
        .all(humanId),
    );
    const permissions = ALL_PERMISSIONS.map((id): EffectiveHostPermission => {
      const sources = roles.flatMap((role): HostPermissionSource[] => {
        const effect = role.deny.includes(id)
          ? 'deny'
          : role.allow.includes(id)
            ? 'allow'
            : undefined;
        return effect === undefined
          ? []
          : [
              {
                roleId: role.roleId,
                name: role.name,
                builtin: role.builtin,
                effect,
              },
            ];
      });
      const state: HostPermissionState = owner
        ? 'granted'
        : !active
          ? 'unset'
          : sources.some((source) => source.effect === 'deny')
            ? 'denied'
            : sources.length
              ? 'granted'
              : 'unset';
      return { id, state, sources };
    });
    return { humanId, owner, active, permissions };
  });
}

export function channelActionRoleIds(
  database: OperationalDatabaseModulePort,
  humanId: string,
): ReadonlySet<string> {
  const roles = database.read((db) =>
    z
      .array(z.object({ role_id: z.string() }))
      .parse(db.prepare('SELECT role_id FROM human_roles WHERE human_id = ?').all(humanId)),
  );
  return new Set(roles.map((role) => role.role_id));
}
