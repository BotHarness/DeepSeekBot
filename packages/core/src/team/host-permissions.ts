import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { resolveGrants } from '../authorization/grants.js';
import { ALL_PERMISSIONS, type HostPermission } from './permissions.js';

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

export interface RoleGrant {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
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

export function resolveHostPermissions(grants: readonly RoleGrant[]): HostPermission[] {
  return resolveGrants(
    grants.map((grant) => ({
      allow: grant.allow.filter(isHostPermission),
      deny: grant.deny.filter(isHostPermission),
    })),
    ALL_PERMISSIONS,
  ).granted;
}

export function isHostPermission(id: string): id is HostPermission {
  return ALL_PERMISSIONS.some((known) => known === id);
}

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

function permissionLiteral(permission: HostPermission): string {
  if (!isHostPermission(permission)) throw new Error(`unknown permission ${permission}`);
  return `'${permission}'`;
}

export function roleGrantedPermissionsSql(human: string): string {
  return `SELECT granted.value FROM human_roles granted_member
    JOIN host_roles granted_role ON granted_role.role_id = granted_member.role_id,
    json_each(granted_role.permissions_json) granted
    WHERE granted_member.human_id = ${human}
      AND granted.value NOT IN (SELECT denied.value FROM human_roles denied_member
        JOIN host_roles denied_role ON denied_role.role_id = denied_member.role_id,
        json_each(denied_role.denied_permissions_json) denied
        WHERE denied_member.human_id = ${human})`;
}

export function roleGrantsPermissionSql(human: string, permission: HostPermission): string {
  return `(${permissionLiteral(permission)} IN (${roleGrantedPermissionsSql(human)}))`;
}

export function hostPermissionHolderSql(human: string, permission: HostPermission): string {
  return `(${human} = (SELECT holder_settings.owner_human_id FROM team_settings holder_settings)
    OR ((SELECT holder_settings.enabled FROM team_settings holder_settings) = 1
      AND EXISTS (SELECT 1 FROM humans holder WHERE holder.human_id = ${human} AND holder.status = 'active')
      AND ${roleGrantsPermissionSql(human, permission)}))`;
}
