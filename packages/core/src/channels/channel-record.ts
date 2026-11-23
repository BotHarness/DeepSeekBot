import { createHash } from 'node:crypto';
import { isValidSlug } from '../bots/slug.js';

export type ChannelType = 'dm' | 'group';

export interface GroupWakePolicy {
  mode: 'all' | 'mentions' | 'digest' | 'silent';
  count: number;
  intervalSeconds: number;
  revision: number;
}

export type GroupWakePolicyActor = { kind: 'human' } | { kind: 'bot'; botSlug: string };

export interface GroupWakePolicyView extends GroupWakePolicy {
  lastActor: GroupWakePolicyActor | null;
  changedAt: string | null;
}

export interface GroupMemberWakePolicy {
  botSlug: string;
  inherited: boolean;
  policy: GroupWakePolicyView;
  external?: {
    platform: 'feishu' | 'slack' | 'discord';
    policy: GroupWakePolicy;
    origin: 'channel' | 'bot' | 'platform';
    defaultRevision: number;
  };
  externals?: NonNullable<GroupMemberWakePolicy['external']>[];
}

export const DEFAULT_GROUP_WAKE_POLICY: GroupWakePolicy = {
  mode: 'digest',
  count: 10,
  intervalSeconds: 30,
  revision: 0,
};

export interface ChannelRecord {
  id: string;
  type: ChannelType;
  name: string;

  avatar?: string;
  members: string[];
  botSlug?: string;
  humanParticipants?: string[];
  dmHumanId?: string;
  description?: string;
  remoteBot?: RemoteBotParticipant;

  ownerBotSlug?: string;
  ownerHumanId?: string;
  invitations?: GroupInvitation[];
  joinRequests?: GroupJoinRequest[];
  wakePolicies?: Record<string, GroupWakePolicy>;

  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TailnetBotMembership {
  kind: 'tailnet';
  localNodeId: string;
  remoteNodeId: string;
}

export interface ConnectBotMembership {
  kind: 'connect';
  accountId: string;
  localHostId: string;
  remoteHostId: string;
}

export interface LanBotMembership {
  kind: 'lan';
  localAdmissionId: string;
  remoteAdmissionId: string;
}

export type BotNetworkScope = TailnetBotMembership | ConnectBotMembership | LanBotMembership;
export type BotNetworkMembership = BotNetworkScope | { kind: 'scopes'; scopes: BotNetworkScope[] };

function isBotNetworkScope(value: unknown): value is BotNetworkScope {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const id = (field: string) =>
    typeof record[field] === 'string' && /^[a-zA-Z0-9_-]{1,128}$/u.test(record[field]);
  return record['kind'] === 'tailnet'
    ? id('localNodeId') && id('remoteNodeId')
    : record['kind'] === 'connect'
      ? id('accountId') && id('localHostId') && id('remoteHostId')
      : record['kind'] === 'lan' && id('localAdmissionId') && id('remoteAdmissionId');
}

export function isBotNetworkMembership(value: unknown): value is BotNetworkMembership {
  if (isBotNetworkScope(value)) return true;
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const scopes = record['scopes'];
  return (
    record['kind'] === 'scopes' &&
    Array.isArray(scopes) &&
    scopes.length >= 2 &&
    scopes.length <= 3 &&
    scopes.every(isBotNetworkScope) &&
    new Set(scopes.map((scope) => scope.kind)).size === scopes.length
  );
}

export function botNetworkScopes(membership: BotNetworkMembership): readonly BotNetworkScope[] {
  return membership.kind === 'scopes' ? membership.scopes : [membership];
}

export function mergeBotNetworkMembership(
  previous: BotNetworkMembership | undefined,
  next: BotNetworkMembership,
): BotNetworkMembership {
  const scopes = new Map<BotNetworkScope['kind'], BotNetworkScope>();
  for (const scope of previous === undefined ? [] : botNetworkScopes(previous))
    scopes.set(scope.kind, scope);
  for (const scope of botNetworkScopes(next)) scopes.set(scope.kind, scope);
  return scopes.size === 1
    ? [...scopes.values()][0]!
    : { kind: 'scopes', scopes: [...scopes.values()] };
}

export interface RemoteBotParticipant {
  membership?: BotNetworkMembership;
  hostKey?: string;
  hostId: string;
  botSlug: string;
  displayName: string;
}

export function remoteBotDmRecord(
  localBotSlug: string,
  remoteBot: RemoteBotParticipant,
  at: string,
): ChannelRecord {
  if (
    !isValidSlug(localBotSlug) ||
    !isValidSlug(remoteBot.botSlug) ||
    !/^[a-zA-Z0-9_-]{1,128}$/u.test(remoteBot.hostId) ||
    remoteBot.displayName.length > 128 ||
    (remoteBot.membership !== undefined &&
      (!isBotNetworkMembership(remoteBot.membership) || remoteBot.hostKey === undefined)) ||
    (remoteBot.hostKey !== undefined && !/^[0-9a-f]{64}$/u.test(remoteBot.hostKey))
  )
    throw new Error('Invalid remote Bot participant');
  return {
    id: `dm-remote-${createHash('sha256')
      .update(JSON.stringify([localBotSlug, remoteBot.hostId, remoteBot.botSlug]))
      .digest('hex')
      .slice(0, 32)}`,
    type: 'dm',
    name: remoteBot.displayName,
    members: [localBotSlug],
    remoteBot: {
      hostId: remoteBot.hostId,
      botSlug: remoteBot.botSlug,
      displayName: remoteBot.displayName,
      ...(remoteBot.hostKey === undefined ? {} : { hostKey: remoteBot.hostKey }),
      ...(remoteBot.membership === undefined ? {} : { membership: { ...remoteBot.membership } }),
    },
    createdAt: at,
    updatedAt: at,
  };
}

export interface GroupInvitation {
  id: string;
  targetBotSlug: string;

  targetBotCreatedAt: string;

  inviterBotSlug?: string;

  inviterHuman?: true;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  respondedAt?: string;
  respondedBy?: 'bot' | 'profile-policy';
}

export function isGroupAvatar(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 131_072) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (match === null) return false;
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length === 0 || bytes.length > 98_304) return false;
  return match[1] === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

export interface GroupJoinRequest {
  id: string;
  requesterBotSlug: string;
  requesterBotCreatedAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: 'human' | string;
}

export const LOCAL_HUMAN_ID = 'local-human';

export interface LocalHumanIdentity {
  humanId: string;
  defaultDisplayName: string | null;
  displayName: string;
  avatarVersion?: string;
  profileSetup?: 'pending';
}

export interface HumanAvatar {
  humanId: string;
  version: string;
  avatar: string;
}

export const HUMAN_AVATAR_BATCH = 64;

export const isHumanAvatar = (value: unknown): value is string => isGroupAvatar(value);

export function humanAvatarVersion(avatar: string): string {
  return createHash('sha256').update(avatar).digest('hex').slice(0, 16);
}

export const DEFAULT_BOT_HOP_LIMIT = 128;
export const MAX_BOT_HOP_LIMIT = 1000;

export function isBotHopLimit(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= MAX_BOT_HOP_LIMIT
  );
}

export const CHANNEL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_CHANNEL_SLUG_LENGTH = 64;

export function isValidChannelId(id: string): boolean {
  return id.length > 0 && CHANNEL_ID_PATTERN.test(id);
}

export function dmChannelId(botSlug: string): string {
  return `dm-${botSlug}`;
}

export function botDmChannelId(firstBotSlug: string, secondBotSlug: string): string {
  const pair = [firstBotSlug, secondBotSlug].sort();
  return `dm-bots-${createHash('sha256').update(JSON.stringify(pair)).digest('hex').slice(0, 32)}`;
}

export function isBotDmChannel(channel: ChannelRecord): boolean {
  return (
    channel.type === 'dm' &&
    channel.botSlug === undefined &&
    (channel.remoteBot === undefined ? channel.members.length === 2 : channel.members.length === 1)
  );
}

export function slugifyChannelName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return slug.slice(0, MAX_CHANNEL_SLUG_LENGTH).replace(/-+$/gu, '');
}

export function groupChannelIdBase(name: string): string {
  const slug = slugifyChannelName(name);
  return `group-${slug.length > 0 ? slug : 'room'}`;
}

export function isDisbandedGroup(record: ChannelRecord | undefined): boolean {
  return record?.type === 'group' && record.deletedAt !== undefined && record.name === '';
}

export function isChannelRecord(value: unknown, id: string): value is ChannelRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['id'] !== id) return false;
  if (record['type'] !== 'dm' && record['type'] !== 'group') return false;
  if (typeof record['name'] !== 'string') return false;
  if (
    record['avatar'] !== undefined &&
    (record['type'] !== 'group' || !isGroupAvatar(record['avatar']))
  )
    return false;
  if (typeof record['createdAt'] !== 'string') return false;
  if (typeof record['updatedAt'] !== 'string') return false;
  const members = record['members'];
  if (!Array.isArray(members) || !members.every((entry) => typeof entry === 'string')) return false;
  const participants = record['humanParticipants'];
  if (
    participants !== undefined &&
    (record['type'] !== 'dm' ||
      members.length !== 0 ||
      !Array.isArray(participants) ||
      participants.length !== 2 ||
      participants[0] === participants[1] ||
      !participants.every((id) => typeof id === 'string' && id.length > 0) ||
      record['botSlug'] !== undefined)
  )
    return false;
  if (
    record['dmHumanId'] !== undefined &&
    (record['type'] !== 'dm' || typeof record['dmHumanId'] !== 'string' || !record['dmHumanId'])
  )
    return false;
  const botSlug = record['botSlug'];
  if (botSlug !== undefined && typeof botSlug !== 'string') return false;
  const remote = record['remoteBot'];
  if (remote !== undefined) {
    if (
      record['type'] !== 'dm' ||
      botSlug !== undefined ||
      members.length !== 1 ||
      typeof remote !== 'object' ||
      remote === null
    )
      return false;
    const peer = remote as Record<string, unknown>;
    if (
      typeof peer['hostId'] !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(peer['hostId']) ||
      typeof peer['botSlug'] !== 'string' ||
      !isValidSlug(peer['botSlug']) ||
      typeof peer['displayName'] !== 'string' ||
      peer['displayName'].length > 128 ||
      (peer['membership'] !== undefined &&
        (!isBotNetworkMembership(peer['membership']) || peer['hostKey'] === undefined)) ||
      (peer['hostKey'] !== undefined &&
        (typeof peer['hostKey'] !== 'string' || !/^[0-9a-f]{64}$/u.test(peer['hostKey'])))
    )
      return false;
  }
  const ownerHumanId = record['ownerHumanId'];
  if (ownerHumanId !== undefined && (typeof ownerHumanId !== 'string' || !ownerHumanId))
    return false;
  const ownerBotSlug = record['ownerBotSlug'];
  if (ownerBotSlug !== undefined) {
    if (
      record['type'] !== 'group' ||
      typeof ownerBotSlug !== 'string' ||
      !members.includes(ownerBotSlug)
    )
      return false;
  }
  if (record['deletedAt'] !== undefined && typeof record['deletedAt'] !== 'string') return false;
  const wakePolicies = record['wakePolicies'];
  if (wakePolicies !== undefined) {
    if (record['type'] !== 'group' || typeof wakePolicies !== 'object' || wakePolicies === null)
      return false;
    for (const [slug, value] of Object.entries(wakePolicies)) {
      if (!members.includes(slug) || typeof value !== 'object' || value === null) return false;
      const policy = value as Record<string, unknown>;
      if (
        (policy['mode'] !== 'all' &&
          policy['mode'] !== 'mentions' &&
          policy['mode'] !== 'digest' &&
          policy['mode'] !== 'silent') ||
        !Number.isSafeInteger(policy['count']) ||
        (policy['count'] as number) < 1 ||
        (policy['count'] as number) > 100 ||
        !Number.isSafeInteger(policy['intervalSeconds']) ||
        (policy['intervalSeconds'] as number) < 1 ||
        (policy['intervalSeconds'] as number) > 3600 ||
        !Number.isSafeInteger(policy['revision']) ||
        (policy['revision'] as number) < 1
      )
        return false;
    }
  }
  const invitations = record['invitations'];
  if (invitations !== undefined) {
    if (
      record['type'] !== 'group' ||
      !Array.isArray(invitations) ||
      !invitations.every((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const invite = item as Record<string, unknown>;
        return (
          typeof invite['id'] === 'string' &&
          typeof invite['targetBotSlug'] === 'string' &&
          typeof invite['targetBotCreatedAt'] === 'string' &&
          ((typeof invite['inviterBotSlug'] === 'string' && invite['inviterHuman'] === undefined) ||
            (invite['inviterBotSlug'] === undefined && invite['inviterHuman'] === true)) &&
          ['pending', 'accepted', 'declined', 'cancelled'].includes(String(invite['status'])) &&
          typeof invite['createdAt'] === 'string' &&
          (invite['respondedAt'] === undefined || typeof invite['respondedAt'] === 'string')
        );
      })
    )
      return false;
  }
  const joinRequests = record['joinRequests'];
  if (joinRequests !== undefined) {
    if (
      record['type'] !== 'group' ||
      !Array.isArray(joinRequests) ||
      !joinRequests.every((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const request = item as Record<string, unknown>;
        return (
          typeof request['id'] === 'string' &&
          typeof request['requesterBotSlug'] === 'string' &&
          typeof request['requesterBotCreatedAt'] === 'string' &&
          ['pending', 'accepted', 'declined', 'cancelled'].includes(String(request['status'])) &&
          typeof request['createdAt'] === 'string' &&
          (request['decidedAt'] === undefined || typeof request['decidedAt'] === 'string') &&
          (request['decidedBy'] === undefined || typeof request['decidedBy'] === 'string')
        );
      })
    )
      return false;
  }
  return true;
}
