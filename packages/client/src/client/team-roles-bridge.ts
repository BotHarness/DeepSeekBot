import type { BridgeCall } from './bridge.js';
import { record, strings, unwrap } from './team-bridge.js';

export type PermissionGroup = 'members' | 'channels' | 'bots' | 'compute' | 'oversight';

export interface PermissionEntry {
  readonly id: string;
  readonly group: PermissionGroup;
}

export type BuiltinRole = 'admin' | 'member';

export type RoleModels =
  | { readonly kind: 'all' }
  | { readonly kind: 'only'; readonly routes: readonly string[] };

export interface TeamRole {
  readonly roleId: string;
  readonly models: RoleModels;
  readonly name: string;
  readonly builtin: BuiltinRole | null;
  readonly permissions: readonly string[];
  readonly memberCount: number;
  readonly policy: readonly PolicyItem[];
  readonly policyRevision: number;
}

export interface PolicyItem {
  readonly topic: string;
  readonly text: string;
  readonly effect: 'allow' | 'deny';
}

export function parsePolicy(value: unknown): PolicyItem[] {
  return Array.isArray(value)
    ? value.flatMap((raw: unknown) => {
        const item = record(raw);
        const topic = item?.['topic'];
        const text = item?.['text'];
        const effect = item?.['effect'];
        return typeof topic === 'string' &&
          typeof text === 'string' &&
          (effect === 'allow' || effect === 'deny')
          ? [{ topic, text, effect }]
          : [];
      })
    : [];
}

function policyPayload(policy: readonly PolicyItem[] | undefined): Record<string, unknown> {
  return policy === undefined
    ? {}
    : { policy: policy.map(({ topic, text, effect }) => ({ topic, text, effect })) };
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
    models: parseRoleModels(row['models']),
    memberCount: typeof count === 'number' && count >= 0 ? count : 0,
    policy: parsePolicy(row['policy']),
    policyRevision: typeof row['policyRevision'] === 'number' ? row['policyRevision'] : 0,
  };
}

export function parseRoleModels(value: unknown): RoleModels {
  const row = record(value);
  return row?.['kind'] === 'only'
    ? { kind: 'only', routes: strings(row['routes']) }
    : { kind: 'all' };
}

export function routeKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

function modelsPayload(models: RoleModels | undefined): Record<string, unknown> {
  if (models === undefined) return {};
  return {
    models: models.kind === 'all' ? { kind: 'all' } : { kind: 'only', routes: [...models.routes] },
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
  input: {
    name: string;
    permissions: readonly string[];
    models?: RoleModels;
    policy?: readonly PolicyItem[];
  },
): Promise<TeamRole> {
  return roleOf(
    await unwrap(call, 'roleCreate', {
      name: input.name,
      permissions: [...input.permissions],
      ...modelsPayload(input.models),
      ...policyPayload(input.policy),
    }),
  );
}

export async function updateRole(
  call: BridgeCall,
  input: {
    roleId: string;
    name?: string;
    permissions?: readonly string[];
    models?: RoleModels;
    policy?: readonly PolicyItem[];
  },
): Promise<TeamRole> {
  return roleOf(
    await unwrap(call, 'roleUpdate', {
      roleId: input.roleId,
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.permissions === undefined ? {} : { permissions: [...input.permissions] }),
      ...modelsPayload(input.models),
      ...policyPayload(input.policy),
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

export function policyReady(policy: readonly PolicyItem[]): boolean {
  return policy.every((item) => item.topic.trim().length > 0 && item.text.trim().length > 0);
}

export function trimmedPolicy(policy: readonly PolicyItem[]): PolicyItem[] {
  return policy.map((item) => ({ ...item, topic: item.topic.trim(), text: item.text.trim() }));
}

export interface PolicyConflict {
  readonly topic: string;
  readonly allowRole: string;
  readonly denyRole: string;
}

export function policyConflicts(
  roles: readonly { name: string; policy: readonly PolicyItem[] }[],
): PolicyConflict[] {
  const byTopic = new Map<string, { topic: string; allow: string[]; deny: string[] }>();
  for (const role of roles)
    for (const item of role.policy) {
      const key = item.topic.trim();
      const entry = byTopic.get(key) ?? { topic: key, allow: [], deny: [] };
      const side = item.effect === 'allow' ? entry.allow : entry.deny;
      if (!side.includes(role.name)) side.push(role.name);
      byTopic.set(key, entry);
    }
  return [...byTopic.values()].flatMap(({ topic, allow, deny }) =>
    allow.flatMap((allowRole) => deny.map((denyRole) => ({ topic, allowRole, denyRole }))),
  );
}
