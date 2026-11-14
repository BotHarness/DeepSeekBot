import type { BridgeCall } from './bridge.js';
import { record, strings, unwrap } from './team-bridge.js';

export type PermissionGroup = 'members' | 'channels' | 'bots' | 'compute' | 'oversight';

export interface PermissionEntry {
  readonly id: string;
  readonly group: PermissionGroup;
}

export type BuiltinRole = 'admin' | 'member';

export interface TeamRole {
  readonly roleId: string;
  readonly name: string;
  readonly builtin: BuiltinRole | null;
  readonly permissions: readonly string[];
  readonly memberCount: number;
}

export interface MemberDevice {
  readonly grantId: string;
  readonly label: string;
  readonly kind: 'browser' | 'paired-device';
  readonly createdAt: string;
  readonly lastSeenAt: string;
  readonly current: boolean;
}

const GROUPS: readonly PermissionGroup[] = ['members', 'channels', 'bots', 'compute', 'oversight'];

export const MANAGE_MEMBERS = 'members.manage';
export const MANAGE_ROLES = 'roles.manage';

function list<T>(value: unknown, parse: (row: Record<string, unknown>) => T | undefined): T[] {
  const items = Array.isArray(value) ? value : record(value)?.['items'];
  return Array.isArray(items)
    ? items.flatMap((item: unknown) => {
        const row = record(item);
        const parsed = row === undefined ? undefined : parse(row);
        return parsed === undefined ? [] : [parsed];
      })
    : [];
}

export function parseRole(row: Record<string, unknown>): TeamRole | undefined {
  const roleId = row['roleId'];
  const name = row['name'];
  if (typeof roleId !== 'string' || roleId.length === 0 || typeof name !== 'string')
    return undefined;
  const builtin = row['builtin'];
  const count = row['memberCount'];
  return {
    roleId,
    name,
    builtin: builtin === 'admin' || builtin === 'member' ? builtin : null,
    permissions: strings(row['permissions']),
    memberCount: typeof count === 'number' && count >= 0 ? count : 0,
  };
}

function parseDevice(row: Record<string, unknown>): MemberDevice | undefined {
  const grantId = row['grantId'];
  if (typeof grantId !== 'string' || grantId.length === 0) return undefined;
  const text = (key: string): string => (typeof row[key] === 'string' ? (row[key] as string) : '');
  return {
    grantId,
    label: text('label'),
    kind: row['kind'] === 'paired-device' ? 'paired-device' : 'browser',
    createdAt: text('createdAt'),
    lastSeenAt: text('lastSeenAt'),
    current: row['current'] === true,
  };
}

function roleOf(value: unknown): TeamRole {
  const row = record(record(value)?.['role'] ?? value);
  const role = row === undefined ? undefined : parseRole(row);
  if (role === undefined) throw new Error('invalid role response');
  return role;
}

export async function loadPermissionCatalog(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<PermissionEntry[]> {
  return list(await unwrap(call, 'permissionCatalog', {}, signal), (row) => {
    const id = row['id'];
    const group = row['group'];
    return typeof id === 'string' && GROUPS.includes(group as PermissionGroup)
      ? { id, group: group as PermissionGroup }
      : undefined;
  });
}

export async function loadRoles(call: BridgeCall, signal?: AbortSignal): Promise<TeamRole[]> {
  return list(await unwrap(call, 'roles', {}, signal), parseRole);
}

export async function createRole(
  call: BridgeCall,
  input: { name: string; permissions: readonly string[] },
): Promise<TeamRole> {
  return roleOf(
    await unwrap(call, 'roleCreate', { name: input.name, permissions: [...input.permissions] }),
  );
}

export async function updateRole(
  call: BridgeCall,
  input: { roleId: string; name?: string; permissions?: readonly string[] },
): Promise<TeamRole> {
  return roleOf(
    await unwrap(call, 'roleUpdate', {
      roleId: input.roleId,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.permissions === undefined ? {} : { permissions: [...input.permissions] }),
    }),
  );
}

export async function deleteRole(call: BridgeCall, roleId: string): Promise<void> {
  await unwrap(call, 'roleDelete', { roleId });
}

export async function setMemberRoles(
  call: BridgeCall,
  humanId: string,
  roleIds: readonly string[],
): Promise<void> {
  await unwrap(call, 'memberRolesSet', { humanId, roleIds: [...roleIds] });
}

export async function loadMemberDevices(
  call: BridgeCall,
  humanId: string,
  signal?: AbortSignal,
): Promise<MemberDevice[]> {
  return list(await unwrap(call, 'memberDevices', { humanId }, signal), parseDevice);
}

export async function revokeMemberDevice(
  call: BridgeCall,
  humanId: string,
  grantId: string,
): Promise<void> {
  await unwrap(call, 'memberDeviceRevoke', { humanId, grantId });
}

export async function transferOwnership(
  call: BridgeCall,
  humanId: string,
  password: string,
): Promise<void> {
  await unwrap(call, 'ownerTransfer', { humanId, password });
}

export function canManage(
  viewer: { owner: boolean; permissions: readonly string[] },
  permission: string,
): boolean {
  return viewer.owner || viewer.permissions.includes(permission);
}

export interface GrantingViewer {
  readonly owner: boolean;
  readonly permissions: readonly string[];
}

export function canGrant(viewer: GrantingViewer, permission: string): boolean {
  if (viewer.owner) return true;
  return permission !== 'privateContent.view' && viewer.permissions.includes(permission);
}

export function canGrantAll(viewer: GrantingViewer, permissions: readonly string[]): boolean {
  return permissions.every((permission) => canGrant(viewer, permission));
}
