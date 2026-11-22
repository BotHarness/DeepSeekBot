import { parseAuthor } from '../../bridge-channel-author.js';
import { reportFailure } from '../../diagnostic-log.js';
import { parseBotSummary } from '../../bridge.js';
import { parseRemoteChannelMetadata } from '../environments/bridge.js';
import {
  asRecord,
  bridgeHost,
  stringArray,
  unwrap,
  type BridgeCall,
} from '../../bridge-transport.js';
import { humanAvatarVersionOf } from '@botharness/host-client/human-profile';
import * as channelHost from '@botharness/host-client/channel-messages';
import * as channels from '@botharness/host-client/channel-management';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { type GenuiMessageReply } from '../../bridge.js';
import { type ChannelSkillInvocationToken, type GroupMemberWakePolicy } from '../../bridge.js';
import { type AllBotPreview, type AllBotMention } from '../../bridge.js';
import { isChannelAttachmentRef } from '../../bridge.js';
import type {
  ChannelAttachmentRef,
  ChannelMessage,
  ChannelReaction,
  ChannelSummary,
  QuoteRef,
} from '../../store.js';
import { quoteRefOf } from '../../store.js';
import { parseChannelMessage, parseChannelMessages } from './message-readers.js';
import type {
  MessageSearchPage,
  RenameChannelResult,
  JournalEntry,
  JournalPage,
  TimelinePageRequest,
  TimelinePage,
} from '../../bridge.js';

export function parseChannelRecord(value: unknown): ChannelSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const type = record['type'];
  const name = record['name'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (type !== 'dm' && type !== 'group') return undefined;
  if (typeof name !== 'string') return undefined;
  const botSlug = record['botSlug'];
  const remoteChannelMetadata = parseRemoteChannelMetadata(record, type, botSlug);
  if (remoteChannelMetadata === undefined) return undefined;
  const createdAt = record['createdAt'];
  const updatedAt = record['updatedAt'];
  const latestMessage = parseChannelMessage(record['latestMessage']);
  const invitations = Array.isArray(record['invitations'])
    ? record['invitations'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['targetBotSlug'] !== 'string' ||
          !(
            (typeof item['inviterBotSlug'] === 'string' && item['inviterHuman'] === undefined) ||
            (item['inviterBotSlug'] === undefined && item['inviterHuman'] === true)
          ) ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            targetBotSlug: item['targetBotSlug'],
            ...(typeof item['inviterBotSlug'] === 'string'
              ? { inviterBotSlug: item['inviterBotSlug'] }
              : { inviterHuman: true as const }),
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['respondedAt'] === 'string'
              ? { respondedAt: item['respondedAt'] }
              : {}),
          },
        ];
      })
    : undefined;
  const joinRequests = Array.isArray(record['joinRequests'])
    ? record['joinRequests'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['requesterBotSlug'] !== 'string' ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            requesterBotSlug: item['requesterBotSlug'],
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['decidedAt'] === 'string' ? { decidedAt: item['decidedAt'] } : {}),
            ...(typeof item['decidedBy'] === 'string' ? { decidedBy: item['decidedBy'] } : {}),
          },
        ];
      })
    : undefined;
  const rawWakePolicies = asRecord(record['wakePolicies']);
  const wakePolicies =
    rawWakePolicies === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(rawWakePolicies).flatMap(([slug, raw]) => {
            const value = asRecord(raw);
            if (
              value === undefined ||
              (value['mode'] !== 'all' &&
                value['mode'] !== 'mentions' &&
                value['mode'] !== 'digest' &&
                value['mode'] !== 'silent') ||
              typeof value['count'] !== 'number' ||
              typeof value['intervalSeconds'] !== 'number' ||
              typeof value['revision'] !== 'number'
            )
              return [];
            return [
              [
                slug,
                {
                  mode: value['mode'] as 'all' | 'mentions' | 'digest' | 'silent',
                  count: value['count'],
                  intervalSeconds: value['intervalSeconds'],
                  revision: value['revision'],
                },
              ],
            ];
          }),
        );
  return {
    id,
    type,
    name,
    ...(type === 'group' && typeof record['avatar'] === 'string'
      ? { avatar: record['avatar'] }
      : {}),
    members: stringArray(record['members']),
    ...(record['humanNickname'] === null || typeof record['humanNickname'] === 'string'
      ? { humanNickname: record['humanNickname'] as string | null }
      : {}),
    ...(Array.isArray(record['humanMembers'])
      ? {
          humanMembers: record['humanMembers'].flatMap((raw: unknown) => {
            const member = asRecord(raw);
            return typeof member?.['humanId'] === 'string' &&
              typeof member['displayName'] === 'string'
              ? [
                  {
                    humanId: member['humanId'],
                    displayName: member['displayName'],
                    ...humanAvatarVersionOf(member['avatarVersion']),
                  },
                ]
              : [];
          }),
        }
      : {}),
    ...(type === 'dm' &&
    Array.isArray(record['humanParticipants']) &&
    stringArray(record['humanParticipants']).length === 2
      ? { humanParticipants: stringArray(record['humanParticipants']) }
      : {}),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    ...(typeof botSlug === 'string' ? { botSlug } : {}),
    ...remoteChannelMetadata,
    ...(typeof record['ownerBotSlug'] === 'string' ? { ownerBotSlug: record['ownerBotSlug'] } : {}),
    ...(type === 'dm' && record['readOnly'] === true ? { readOnly: true } : {}),
    ...(type === 'dm' && typeof record['proactiveOptOut'] === 'boolean'
      ? { proactiveOptOut: record['proactiveOptOut'] }
      : {}),
    ...(type === 'group' && Array.isArray(record['memberBots'])
      ? {
          memberBots: record['memberBots'].flatMap((raw: unknown) => {
            const bot = asRecord(raw);
            return typeof bot?.['slug'] === 'string' && typeof bot['displayName'] === 'string'
              ? [
                  {
                    slug: bot['slug'],
                    displayName: bot['displayName'],
                    ...(typeof bot['avatar'] === 'string' ? { avatar: bot['avatar'] } : {}),
                  },
                ]
              : [];
          }),
        }
      : {}),
    ...(invitations === undefined ? {} : { invitations }),
    ...(joinRequests === undefined ? {} : { joinRequests }),
    ...(wakePolicies === undefined ? {} : { wakePolicies }),
    ...(latestMessage === undefined ? {} : { latestMessage }),
  };
}

export async function reactToChannelMessage(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  emoji: string,
  active: boolean,
): Promise<ChannelReaction[]> {
  return channelHost.reactToMessage(bridgeHost(call), { channelId, messageId, emoji, active });
}

export async function searchChannelMessages(
  call: BridgeCall,
  channelId: string,
  text: string,
  cursor?: string,
): Promise<{ messages: ChannelMessage[]; nextCursor?: string }> {
  const value = asRecord(
    await unwrap(call, 'channelSearch', {
      channelId,
      text,
      limit: 20,
      ...(cursor === undefined ? {} : { cursor }),
    }),
  );
  const nextCursor = value?.['nextCursor'];
  if (value === undefined || (nextCursor !== undefined && typeof nextCursor !== 'string'))
    throw new Error('invalid channelSearch response');
  return {
    messages: parseChannelMessages(value),
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}

export async function searchAllMessages(
  call: BridgeCall,
  text: string,
  cursor?: string,
  limit = 8,
): Promise<MessageSearchPage> {
  return channelHost.searchMessages(bridgeHost(call), { text, limit, cursor }, parseChannelMessage);
}

export async function loadChannels(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ChannelSummary[]> {
  return (await channels.readChannels(bridgeHost(call, signal))).flatMap((entry) => {
    const channel = parseChannelRecord(entry);
    return channel === undefined ? [] : [channel];
  });
}

export async function validateComposerDraft(
  call: BridgeCall,
  channelId: string,
  attachments: ChannelAttachmentRef[],
  replyTo?: string,
  quotes?: ReadonlyArray<{ messageId: string; text?: string }>,
): Promise<{
  reply?: ChannelMessage;
  attachments: Array<ChannelAttachmentRef | null>;
  quotes?: Array<ChannelMessage | null>;
}> {
  const value = asRecord(
    await unwrap(call, 'composerValidate', {
      channelId,
      attachments,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(quotes === undefined ? {} : { quotes }),
    }),
  );
  if (
    value === undefined ||
    !Array.isArray(value['attachments']) ||
    value['attachments'].length !== attachments.length ||
    !value['attachments'].every((ref) => ref === null || isChannelAttachmentRef(ref))
  )
    throw new Error('invalid composer validation');
  const reply = value['reply'] === undefined ? undefined : parseChannelMessage(value['reply']);
  if (value['reply'] !== undefined && reply === undefined)
    throw new Error('invalid composer reply');
  const rawQuotes = value['quotes'];
  if (quotes !== undefined && (!Array.isArray(rawQuotes) || rawQuotes.length !== quotes.length))
    throw new Error('invalid composer quotes');
  const checked = Array.isArray(rawQuotes)
    ? rawQuotes.map((raw) => (raw === null ? null : parseChannelMessage(raw)))
    : undefined;
  if (checked?.some((message) => message === undefined)) throw new Error('invalid composer quotes');
  return {
    ...(reply === undefined ? {} : { reply }),
    attachments: value['attachments'] as Array<ChannelAttachmentRef | null>,
    ...(checked === undefined ? {} : { quotes: checked as Array<ChannelMessage | null> }),
  };
}

export async function openDmChannel(
  call: BridgeCall,
  slug: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<ChannelSummary> {
  return presentChannel(await channels.openBotDm(bridgeHost(call, signal), { slug, displayName }));
}

export async function createGroupChannel(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
  operationKey?: string,
): Promise<ChannelSummary> {
  const channel = await channels.createGroupChannel(bridgeHost(call, signal), {
    name,
    members: [],
    ...(operationKey === undefined ? {} : { operationKey }),
  });
  return presentChannel(channel);
}

export function presentChannel(value: unknown): ChannelSummary {
  const channel = parseChannelRecord(value);
  if (channel === undefined) throw new HostAnswerInvalid('Invalid Channel result');
  return channel;
}

export async function renameChannel(
  call: BridgeCall,
  channelId: string,
  name: string,
  signal?: AbortSignal,
): Promise<RenameChannelResult> {
  const value = asRecord(await unwrap(call, 'channelRename', { channelId, name }, signal));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelRename response');
  const bot = parseBotSummary(value?.['bot']);
  return { channel, ...(bot === undefined ? {} : { bot }) };
}

export async function inviteGroupBot(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupInvite', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInvite response');
  return channel;
}

export async function cancelGroupInvitation(
  call: BridgeCall,
  channelId: string,
  invitationId: string,
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupInviteCancel', { channelId, invitationId }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInviteCancel response');
  return channel;
}

export async function decideGroupJoin(
  call: BridgeCall,
  channelId: string,
  requestId: string,
  accept: boolean,
): Promise<ChannelSummary> {
  const channel = await channels.decideGroupJoin(bridgeHost(call), {
    channelId,
    requestId,
    accept,
  });
  return presentChannel(channel);
}

export async function removeGroupMember(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupMemberRemove', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupMemberRemove response');
  return channel;
}

export async function loadGroupWakePolicies(
  call: BridgeCall,
  channelId: string,
): Promise<GroupMemberWakePolicy[]> {
  const value = asRecord(await unwrap(call, 'channelGroupWakePolicies', { channelId }));
  const members = value?.['members'];
  if (
    !Array.isArray(members) ||
    members.some(
      (row) =>
        typeof row.botSlug !== 'string' ||
        typeof row.inherited !== 'boolean' ||
        !row.policy ||
        !['all', 'mentions', 'digest', 'silent'].includes(row.policy.mode) ||
        !Number.isSafeInteger(row.policy.count) ||
        !Number.isSafeInteger(row.policy.intervalSeconds),
    )
  )
    throw new Error('invalid channelGroupWakePolicies response');
  return members;
}

export async function setGroupWakePolicy(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
  policy: {
    mode: 'all' | 'mentions' | 'digest' | 'silent';
    count: number;
    intervalSeconds: number;
    inherit?: boolean;
  },
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupWakeSet', {
      channelId,
      botSlug,
      ...policy,
    }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupWakeSet response');
  return channel;
}

export async function deleteGroupChannel(call: BridgeCall, channelId: string): Promise<void> {
  await channels.deleteGroupChannel(bridgeHost(call), channelId);
}

export function parseJournalEntry(value: unknown): JournalEntry | undefined {
  return channelHost.parseJournalEntry(value, parseStoredChannelMessage);
}

export function parseJournalPage(value: unknown): JournalPage | undefined {
  try {
    return channelHost.parseJournalPage(value, parseStoredChannelMessage);
  } catch {
    return undefined;
  }
}

export async function loadJournalPage(
  call: BridgeCall,
  channelId: string,
  request: { through: number; before?: number; limit?: number },
  signal?: AbortSignal,
): Promise<JournalPage> {
  return channelHost.readChannelJournal(
    bridgeHost(call, signal),
    channelId,
    request,
    parseStoredChannelMessage,
  );
}

export async function loadTimelinePage(
  call: BridgeCall,
  channelId: string,
  request: TimelinePageRequest = {},
  signal?: AbortSignal,
): Promise<{ page: TimelinePage; revision: number }> {
  return channelHost.readChannelTimeline(
    bridgeHost(call, signal),
    channelId,
    request,
    parseStoredChannelMessage,
  );
}

export async function loadReadPosition(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<string | undefined> {
  const value = asRecord(await unwrap(call, 'channelReadPosition', { channelId }, signal));
  const position = value?.['position'];
  if (position === undefined) return undefined;
  const messageId = asRecord(position)?.['messageId'];
  if (typeof messageId !== 'string' || messageId.length === 0)
    throw new Error('invalid channelReadPosition response');
  return messageId;
}

export async function markReadPosition(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<void> {
  await channelHost.markChannelRead(bridgeHost(call), channelId, messageId);
}

export async function loadAllBotPreview(
  call: BridgeCall,
  channelId: string,
): Promise<AllBotPreview> {
  return channels.readAllBotPreview(bridgeHost(call), channelId);
}

export async function sendChannelMessage(
  call: BridgeCall,
  channelId: string,
  body: string,
  replyTo?: string,
  attachments?: ChannelAttachmentRef[],
  messageId?: string,
  signal?: AbortSignal,
  memorySwitchTarget?: string,
  mentions?: ChannelMessage['mentions'],
  channelRefs?: ChannelMessage['channelRefs'],
  grantRequestResolution?: ChannelMessage['grantRequestResolution'],
  assignmentReply?: ChannelMessage['assignmentReply'],
  allBotMention?: AllBotMention,
  genuiReply?: GenuiMessageReply,
  skillInvocations?: ChannelSkillInvocationToken[],
  quotes?: readonly QuoteRef[],
): Promise<ChannelMessage> {
  return channelHost.sendToChannel(
    bridgeHost(call, signal),
    {
      channelId,
      body,
      ...(skillInvocations === undefined || skillInvocations.length === 0
        ? {}
        : { skillInvocations }),
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(quotes === undefined || quotes.length === 0
        ? {}
        : {
            quotes: quotes.map(quoteRefOf),
          }),
      ...(attachments === undefined ? {} : { attachments }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
      ...(mentions === undefined ? {} : { mentions }),
      ...(channelRefs === undefined ? {} : { channelRefs }),
      ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
      ...(assignmentReply === undefined ? {} : { assignmentReply }),
      ...(allBotMention === undefined ? {} : { allBotMention }),
      ...(genuiReply === undefined ? {} : { genuiReply }),
    },
    parseChannelMessage,
  );
}

export async function markAllReadPositions(
  call: BridgeCall,
  scope: { channelId?: string | undefined; botSlug?: string | undefined } = {},
): Promise<void> {
  await channelHost.markAllChannelsRead(bridgeHost(call), scope);
}

export function parseStoredChannelMessage(value: unknown): ChannelMessage | undefined {
  const parsed = parseChannelMessage(value);
  if (parsed !== undefined) return parsed;
  const record = asRecord(value);
  const id = record?.['id'];
  const at = record?.['at'];
  const body = record?.['body'];
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    typeof at !== 'string' ||
    at.length === 0 ||
    typeof body !== 'string'
  )
    return undefined;
  const revision = record?.['channelRevision'];
  reportFailure(
    'showing-an-unreadable-channel-message-as-plain-text',
    'showing an unreadable Channel message as plain text',
    id,
  );
  return {
    id,
    at,
    author: parseAuthor(record?.['author']) ?? { kind: 'system' },
    body,
    format: 'text',
    ...(typeof revision === 'number' && Number.isSafeInteger(revision) && revision >= 1
      ? { channelRevision: revision }
      : {}),
  };
}
