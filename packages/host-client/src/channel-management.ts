import type {
  AssignmentActivity,
  AssignmentReportState,
  ChannelAssignmentSummary,
  ChannelListItem,
  WireAllBotPreview,
  WireGroupJoinRequest,
} from '@botharness/host-protocol/wire';
import type { RosterSection } from './client';
import { answerRecord, HostAnswerInvalid, record, type HostCall } from './host-answer';

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string');
}

type ManagedChannel = ChannelListItem & Record<string, unknown>;

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

function optionalRows(
  value: unknown,
  validRow: (row: Record<string, unknown>) => boolean,
): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((entry: unknown) => {
        const row = record(entry);
        return row !== undefined && validRow(row);
      }))
  );
}

function isMessageAuthor(value: unknown): boolean {
  const author = record(value);
  switch (author?.['kind']) {
    case 'human':
      return optionalString(author['humanId']) && optionalString(author['displayName']);
    case 'bot':
      return typeof author['slug'] === 'string';
    case 'remote-bot':
      return typeof author['hostId'] === 'string' && typeof author['slug'] === 'string';
    case 'bridged':
      return typeof author['source'] === 'string';
    case 'system':
      return true;
    default:
      return false;
  }
}

function isLatestMessage(value: unknown): boolean {
  const message = record(value);
  return (
    typeof message?.['id'] === 'string' &&
    typeof message['at'] === 'string' &&
    typeof message['body'] === 'string' &&
    (message['author'] === undefined || isMessageAuthor(message['author']))
  );
}

const decisionStatuses: ReadonlySet<unknown> = new Set<WireGroupJoinRequest['status']>([
  'pending',
  'accepted',
  'declined',
  'cancelled',
]);

function isManagedChannel(channel: Record<string, unknown>): channel is ManagedChannel {
  const id = channel['id'];
  const type = channel['type'];
  return (
    typeof id === 'string' &&
    id.length > 0 &&
    (type === 'dm' || type === 'group') &&
    typeof channel['name'] === 'string' &&
    strings(channel['members']) &&
    optionalString(channel['createdAt']) &&
    optionalString(channel['updatedAt']) &&
    optionalString(channel['deletedAt']) &&
    optionalString(channel['botSlug']) &&
    optionalString(channel['avatar']) &&
    optionalString(channel['ownerBotSlug']) &&
    (channel['humanParticipants'] === undefined || strings(channel['humanParticipants'])) &&
    optionalRows(
      channel['humanMembers'],
      (member) =>
        typeof member['humanId'] === 'string' &&
        typeof member['displayName'] === 'string' &&
        optionalString(member['avatarVersion']),
    ) &&
    optionalRows(
      channel['invitations'],
      (invitation) =>
        typeof invitation['id'] === 'string' &&
        typeof invitation['targetBotSlug'] === 'string' &&
        decisionStatuses.has(invitation['status']),
    ) &&
    optionalRows(
      channel['joinRequests'],
      (request) =>
        typeof request['id'] === 'string' &&
        typeof request['requesterBotSlug'] === 'string' &&
        decisionStatuses.has(request['status']),
    ) &&
    (channel['latestMessage'] === undefined || isLatestMessage(channel['latestMessage']))
  );
}

function requiredChannel(value: unknown, method: string): ManagedChannel {
  const channel = record(value);
  if (channel === undefined || !isManagedChannel(channel))
    throw new HostAnswerInvalid(`${method} returned an invalid Channel.`);
  return channel;
}

export async function readChannels(host: HostCall): Promise<ChannelListItem[]> {
  const answer = answerRecord(await host.call('channels', {}), 'channels');
  const channels = answer['channels'];
  if (!Array.isArray(channels)) throw new HostAnswerInvalid('channels returned no Channel list.');
  return channels.map((channel: unknown) => requiredChannel(channel, 'channels'));
}

function channelNickname(channel: ManagedChannel, method: string): string | null {
  const nickname = channel['humanNickname'];
  if (nickname === undefined || nickname === null) return null;
  if (typeof nickname === 'string') return nickname;
  throw new HostAnswerInvalid(`${method} returned an invalid Channel nickname.`);
}

export async function readChannel(
  host: HostCall,
  channelId: string,
): Promise<{ channel: ChannelListItem; nickname: string | null } & Record<string, unknown>> {
  const answer = answerRecord(await host.call('channelGet', { channelId }), 'channelGet');
  const channel = requiredChannel(answer['channel'], 'channelGet');
  return { ...answer, channel, nickname: channelNickname(channel, 'channelGet') };
}

export async function openBotDm(
  host: HostCall,
  args: { slug: string; displayName?: string },
): Promise<ChannelListItem> {
  const answer = answerRecord(await host.call('channelDm', args), 'channelDm');
  return requiredChannel(answer['channel'], 'channelDm');
}

export async function createGroupChannel(
  host: HostCall,
  args: { name: string; members: readonly string[]; operationKey?: string },
): Promise<ChannelListItem> {
  const answer = answerRecord(await host.call('channelCreate', args), 'channelCreate');
  const channel = requiredChannel(answer['channel'], 'channelCreate');
  if (args.operationKey !== undefined) {
    const receipt = record(answer['receipt']);
    if (
      receipt?.['operationKey'] !== args.operationKey ||
      receipt['status'] !== 'completed' ||
      receipt['channelId'] !== channel.id
    )
      throw new HostAnswerInvalid('channelCreate returned no matching operation receipt.');
  }
  return channel;
}

export async function setChannelHumanName(
  host: HostCall,
  channelId: string,
  nickname: string | null,
) {
  const method = 'channelHumanNameSet';
  const answer = answerRecord(
    await host.call('channelHumanNameSet', { channelId, nickname }),
    method,
  );
  const channel = requiredChannel(answer['channel'], method);
  if (channel.id !== channelId)
    throw new HostAnswerInvalid('channelHumanNameSet returned a different Channel.');
  return { channel, nickname: channelNickname(channel, method) };
}

export async function decideGroupJoin(
  host: HostCall,
  args: { channelId: string; requestId: string; accept: boolean },
  options?: { confirm: true },
): Promise<ChannelListItem> {
  const answer = answerRecord(
    await host.call('channelGroupJoinDecide', args),
    'channelGroupJoinDecide',
  );
  const channel = requiredChannel(answer['channel'], 'channelGroupJoinDecide');
  if (options?.confirm) {
    const decided = channel.joinRequests?.find((request) => request.id === args.requestId);
    if (decided?.status !== (args.accept ? 'accepted' : 'declined'))
      throw new HostAnswerInvalid('The computer did not confirm the decision.');
  }
  return channel;
}

export async function deleteGroupChannel(host: HostCall, channelId: string): Promise<void> {
  const answer = answerRecord(
    await host.call('channelGroupDelete', { channelId }),
    'channelGroupDelete',
  );
  if (answer['deleted'] !== true) throw new HostAnswerInvalid('The group was not disbanded.');
}

const activities: ReadonlySet<unknown> = new Set<AssignmentActivity>([
  'working',
  'idle',
  'error',
  'stopping',
  'stopped',
]);
const reportStates: ReadonlySet<unknown> = new Set<AssignmentReportState>([
  'progress',
  'completed',
  'blocked',
  'waiting-human',
  'failed',
]);

function isAssignment(value: unknown): value is ChannelAssignmentSummary {
  const row = record(value);
  if (row === undefined) return false;
  const report = record(row['latestReport']);
  const modelRoute = record(row['modelRoute']);
  return (
    typeof row['sessionId'] === 'string' &&
    typeof row['botSlug'] === 'string' &&
    typeof row['title'] === 'string' &&
    typeof row['description'] === 'string' &&
    activities.has(row['activity']) &&
    typeof row['createdAt'] === 'string' &&
    typeof row['updatedAt'] === 'string' &&
    optionalString(row['archivedAt']) &&
    (row['subagentCount'] === undefined || typeof row['subagentCount'] === 'number') &&
    (row['modelRoute'] === undefined ||
      (modelRoute !== undefined &&
        typeof modelRoute['provider'] === 'string' &&
        typeof modelRoute['model'] === 'string' &&
        optionalString(modelRoute['reasoningEffort']))) &&
    (row['latestReport'] === undefined ||
      (report !== undefined &&
        reportStates.has(report['state']) &&
        typeof report['summary'] === 'string' &&
        typeof report['at'] === 'string' &&
        (report['expectsReply'] === undefined || typeof report['expectsReply'] === 'boolean')))
  );
}

export async function readChannelAssignments(
  host: HostCall,
  channelId: string,
): Promise<ChannelAssignmentSummary[]> {
  const answer = answerRecord(
    await host.call('channelAssignments', { channelId }),
    'channelAssignments',
  );
  const assignments = answer['assignments'];
  if (!Array.isArray(assignments) || !assignments.every(isAssignment))
    throw new HostAnswerInvalid('channelAssignments returned an invalid Assignment list.');
  return assignments;
}

export function parseAllBotPreview(value: unknown): WireAllBotPreview | undefined {
  const answer = record(value);
  const revision = answer?.['revision'];
  const rows = answer?.['recipients'];
  if (typeof revision !== 'string' || !Array.isArray(rows)) return undefined;
  const recipients: WireAllBotPreview['recipients'] = [];
  for (const row of rows) {
    const recipient = record(row);
    const botSlug = recipient?.['botSlug'];
    const label = recipient?.['label'];
    if (typeof botSlug !== 'string' || typeof label !== 'string') return undefined;
    recipients.push({ botSlug, label });
  }
  return { revision, recipients };
}

export async function readAllBotPreview(
  host: HostCall,
  channelId: string,
): Promise<WireAllBotPreview> {
  const preview = parseAllBotPreview(await host.call('channelAllBotPreview', { channelId }));
  if (preview === undefined)
    throw new HostAnswerInvalid('channelAllBotPreview returned an invalid preview.');
  return preview;
}

export async function createRosterSection(host: HostCall, name: string): Promise<RosterSection> {
  const answer = answerRecord(await host.call('sectionCreate', { name }), 'sectionCreate');
  const section = record(answer['section']);
  const id = section?.['id'];
  const label = section?.['name'];
  if (typeof id !== 'string' || id.length === 0 || typeof label !== 'string')
    throw new HostAnswerInvalid('sectionCreate returned an invalid Section.');
  const channelIds = section?.['channelIds'];
  return {
    id,
    name: label,
    channelIds: Array.isArray(channelIds)
      ? [
          ...new Set(
            channelIds.filter(
              (value): value is string => typeof value === 'string' && value.length > 0,
            ),
          ),
        ]
      : [],
  };
}

export async function assignRosterChannel(
  host: HostCall,
  args: { channelId: string; sectionId: string | null | undefined; index?: number | undefined },
): Promise<void> {
  answerRecord(await host.call('channelAssign', args), 'channelAssign');
}

export async function setChannelMuted(
  host: HostCall,
  channelId: string,
  muted: boolean,
): Promise<void> {
  const answer = answerRecord(
    await host.call('channelMuteSet', { channelId, muted }),
    'channelMuteSet',
  );
  if (!strings(answer['muted']))
    throw new HostAnswerInvalid('channelMuteSet returned no muted Channels.');
}

export async function removeRosterSection(host: HostCall, sectionId: string): Promise<boolean> {
  const answer = answerRecord(await host.call('sectionRemove', { sectionId }), 'sectionRemove');
  const removed = answer['removed'];
  if (typeof removed !== 'boolean')
    throw new HostAnswerInvalid('sectionRemove returned no removal result.');
  return removed;
}
