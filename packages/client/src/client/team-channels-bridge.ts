import { writeChannelPolicy } from '@botharness/host-client/channel-approvals';
import { readChannel } from '@botharness/host-client/channel-management';
import {
  CHANNEL_ACTIONS,
  CHANNEL_APPROVAL_ACTIONS,
  DEFAULT_CHANNEL_POLICY,
  type ChannelAction,
} from '@botharness/host-protocol/channel-policy';
import {
  openHumanDm as openHumanDmChannel,
  readTeamDirectory,
} from '@botharness/host-client/human-dm';
import { bridgeHost, type BridgeCall } from './bridge.js';
import { list, record, strings, unwrap } from './team-bridge.js';

export type ChannelVisibility =
  | { readonly kind: 'public' }
  | { readonly kind: 'roles'; readonly roleIds: readonly string[] }
  | { readonly kind: 'private' };

export type PolicyKey = ChannelAction;
export type PolicyValue = 'allow' | 'deny' | 'inherit';
export type ApprovalKey = (typeof CHANNEL_APPROVAL_ACTIONS)[number];
export interface ChannelPolicy {
  readonly version: 1;
  readonly approvalMode?: 'legacy' | 'channel' | undefined;
  readonly everyone: Readonly<Record<PolicyKey, PolicyValue>>;
  readonly overrides: readonly {
    roleId: string;
    actions: Readonly<Partial<Record<PolicyKey, PolicyValue>>>;
  }[];
}

export const POLICY_KEYS: readonly PolicyKey[] = CHANNEL_ACTIONS;
export const APPROVAL_KEYS: readonly ApprovalKey[] = CHANNEL_APPROVAL_ACTIONS;

export const DEFAULT_POLICY: ChannelPolicy = DEFAULT_CHANNEL_POLICY;

export function isApprovalKey(key: PolicyKey): key is ApprovalKey {
  return (APPROVAL_KEYS as readonly string[]).includes(key);
}

export interface ChannelAccess {
  readonly role: 'owner' | 'admin' | 'member';
  readonly visibility: ChannelVisibility;
  readonly policy: ChannelPolicy;
  readonly admins: readonly { humanId: string; displayName: string }[];
  readonly policyRevision?: string;
  readonly canPost?: boolean;
  readonly canEditDetails?: boolean;
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

function effect(value: unknown): PolicyValue {
  return value === 'allow' || value === 'deny' ? value : 'inherit';
}

export function parsePolicy(value: unknown): ChannelPolicy {
  const row = record(value);
  if (row?.version !== 1) return DEFAULT_POLICY;
  const everyone = record(row.everyone);
  const mode = row.approvalMode;
  return {
    version: 1,
    ...(mode === 'legacy' || mode === 'channel' ? { approvalMode: mode } : {}),
    everyone: {
      addMembers: effect(everyone?.addMembers),
      post: effect(everyone?.post),
      mentionAll: effect(everyone?.mentionAll),
      wakeBot: effect(everyone?.wakeBot ?? 'allow'),
      addBots: effect(everyone?.addBots),
      seeApprovals: effect(everyone?.seeApprovals ?? 'allow'),
      decideApprovals: effect(everyone?.decideApprovals ?? 'deny'),
      editDetails: effect(everyone?.editDetails),
    },
    overrides: list(row.overrides, (item) => {
      const override = record(item);
      if (typeof override?.roleId !== 'string') return undefined;
      const actions = record(override.actions);
      return {
        roleId: override.roleId,
        actions: Object.fromEntries(
          POLICY_KEYS.flatMap((key) =>
            actions?.[key] === undefined ? [] : [[key, effect(actions[key])]],
          ),
        ),
      };
    }),
  };
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
    ...(typeof row.canPost === 'boolean' ? { canPost: row.canPost } : {}),
    ...(typeof row.canEditDetails === 'boolean' ? { canEditDetails: row.canEditDetails } : {}),
    ...(typeof revision === 'string' && revision.length > 0 ? { policyRevision: revision } : {}),
  };
}

export async function loadChannelAccess(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<ChannelAccess | undefined> {
  return parseChannelAccess(await readChannel(bridgeHost(call, signal), channelId));
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
  await writeChannelPolicy(bridgeHost(call), channelId, { ...policy }, expectedRevision);
}

export async function setChannelAdmins(
  call: BridgeCall,
  channelId: string,
  humanIds: readonly string[],
): Promise<void> {
  await unwrap(call, 'channelAdminsSet', { channelId, humanIds: [...humanIds] });
}

export async function loadTeamDirectory(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<DirectoryEntry[]> {
  return readTeamDirectory(bridgeHost(call, signal));
}

export async function openHumanDm(
  call: BridgeCall,
  humanId: string,
  signal?: AbortSignal,
): Promise<string> {
  return (await openHumanDmChannel(bridgeHost(call, signal), { humanId })).channelId;
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
