import type { BridgeCall } from './bridge.js';
import { list, record, strings, unwrap } from './team-bridge.js';

export type ChannelVisibility =
  | { readonly kind: 'public' }
  | { readonly kind: 'roles'; readonly roleIds: readonly string[] }
  | { readonly kind: 'private' };

export type PolicyKey = 'addMembers' | 'post' | 'mentionAll' | 'addBots' | 'editDetails';
export type PolicyValue = 'everyone' | 'admins';
export type ChannelPolicy = Readonly<Record<PolicyKey, PolicyValue>>;

export const POLICY_KEYS: readonly PolicyKey[] = [
  'addMembers',
  'post',
  'mentionAll',
  'addBots',
  'editDetails',
];

export const DEFAULT_POLICY: ChannelPolicy = {
  addMembers: 'everyone',
  post: 'everyone',
  mentionAll: 'everyone',
  addBots: 'admins',
  editDetails: 'admins',
};

export interface ChannelAccess {
  readonly role: 'owner' | 'admin' | 'member';
  readonly visibility: ChannelVisibility;
  readonly policy: ChannelPolicy;
  readonly admins: readonly { humanId: string; displayName: string }[];
  readonly policyRevision?: string;
}

export interface BrowsableChannel {
  readonly channelId: string;
  readonly name: string;
  readonly description?: string;
  readonly memberCount: number;
  readonly joined: boolean;
  readonly visibility: 'public' | 'roles';
}

export interface DirectoryEntry {
  readonly humanId: string;
  readonly displayName: string;
}

export function parseVisibility(value: unknown): ChannelVisibility {
  const row = record(value);
  if (row?.['kind'] === 'public') return { kind: 'public' };
  if (row?.['kind'] === 'roles') return { kind: 'roles', roleIds: strings(row['roleIds']) };
  return { kind: 'private' };
}

export function parsePolicy(value: unknown): ChannelPolicy {
  const row = record(value) ?? {};
  return Object.fromEntries(
    POLICY_KEYS.map((key) => [
      key,
      row[key] === 'admins' || row[key] === 'everyone' ? row[key] : DEFAULT_POLICY[key],
    ]),
  ) as unknown as ChannelPolicy;
}

export function parseChannelAccess(value: unknown): ChannelAccess | undefined {
  const row = record(value);
  if (row === undefined) return undefined;
  const role = row['role'];
  if (role !== 'owner' && role !== 'admin' && role !== 'member') return undefined;
  const admins = Array.isArray(row['admins'])
    ? row['admins'].flatMap((item: unknown) => {
        const admin = record(item);
        const humanId = admin?.['humanId'];
        return typeof humanId === 'string' && humanId.length > 0
          ? [
              {
                humanId,
                displayName:
                  typeof admin?.['displayName'] === 'string'
                    ? (admin['displayName'] as string)
                    : humanId,
              },
            ]
          : [];
      })
    : [];
  const revision = row['policyRevision'];
  return {
    role,
    visibility: parseVisibility(row['visibility']),
    policy: parsePolicy(row['policy']),
    admins,
    ...(typeof revision === 'string' && revision.length > 0 ? { policyRevision: revision } : {}),
  };
}

export async function loadChannelAccess(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<ChannelAccess | undefined> {
  return parseChannelAccess(await unwrap(call, 'channelGet', { channelId }, signal));
}

export async function setChannelVisibility(
  call: BridgeCall,
  channelId: string,
  visibility: ChannelVisibility,
): Promise<void> {
  await unwrap(call, 'channelVisibilitySet', {
    channelId,
    visibility:
      visibility.kind === 'roles'
        ? { kind: 'roles', roleIds: [...visibility.roleIds] }
        : visibility,
  });
}

export async function setChannelPolicy(
  call: BridgeCall,
  channelId: string,
  policy: ChannelPolicy,
  expectedRevision?: string,
): Promise<void> {
  await unwrap(call, 'channelPolicySet', {
    channelId,
    policy: { ...policy },
    ...(expectedRevision === undefined ? {} : { expectedRevision }),
  });
}

export async function setChannelAdmins(
  call: BridgeCall,
  channelId: string,
  humanIds: readonly string[],
): Promise<void> {
  await unwrap(call, 'channelAdminsSet', { channelId, humanIds: [...humanIds] });
}

export function parseBrowsableChannel(value: unknown): BrowsableChannel | undefined {
  const row = record(value);
  const channelId = row?.['channelId'];
  const name = row?.['name'];
  if (row === undefined || typeof channelId !== 'string' || typeof name !== 'string')
    return undefined;
  const count = row['memberCount'];
  const description = row['description'];
  return {
    channelId,
    name,
    ...(typeof description === 'string' && description.length > 0 ? { description } : {}),
    memberCount: typeof count === 'number' && Number.isFinite(count) && count >= 0 ? count : 0,
    joined: row['joined'] === true,
    visibility: row['visibility'] === 'roles' ? 'roles' : 'public',
  };
}

export async function loadBrowsableChannels(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<BrowsableChannel[]> {
  return list(await unwrap(call, 'browsableChannels', {}, signal), parseBrowsableChannel);
}

export async function joinChannel(call: BridgeCall, channelId: string): Promise<void> {
  await unwrap(call, 'channelJoin', { channelId });
}

export function parseDirectoryEntry(value: unknown): DirectoryEntry | undefined {
  const row = record(value);
  const humanId = row?.['humanId'];
  const displayName = row?.['displayName'];
  return typeof humanId === 'string' && humanId.length > 0 && typeof displayName === 'string'
    ? { humanId, displayName }
    : undefined;
}

export async function loadTeamDirectory(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<DirectoryEntry[]> {
  return list(await unwrap(call, 'teamDirectory', {}, signal), parseDirectoryEntry);
}

export async function openHumanDm(
  call: BridgeCall,
  humanId: string,
  signal?: AbortSignal,
): Promise<string> {
  const value = record(await unwrap(call, 'humanDm', { humanId }, signal));
  const channel = record(value?.['channel']);
  const channelId = channel?.['id'] ?? value?.['channelId'];
  if (typeof channelId !== 'string') throw new Error('invalid humanDm response');
  return channelId;
}

export interface RoleChoice {
  readonly roleId: string;
  readonly name: string;
}

export async function loadChannelRoles(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<RoleChoice[]> {
  return list(await unwrap(call, 'channelRoleDirectory', { channelId }, signal), (item) => {
    const row = record(item);
    const roleId = row?.['roleId'];
    const name = row?.['name'];
    return typeof roleId === 'string' && typeof name === 'string' ? { roleId, name } : undefined;
  });
}
