import { resolveGrants } from '../kernel/grants.js';
import { ALL_PERMISSIONS, type HostPermission } from './permissions.js';

export interface RoleGrant {
  readonly allow: readonly string[];
  readonly deny: readonly string[];
}

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
