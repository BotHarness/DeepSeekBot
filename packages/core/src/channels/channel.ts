import { parseToolApprovalActor } from '../workspaces/tool-approval-actor.js';
import { createHash } from 'node:crypto';

import { isChannelAttachmentRef, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { ToolApprovalDecision, ToolApprovalRequestCard } from '../workspaces/tool-approval.js';
import type { ChannelQuestionRequest, ChannelQuestionResolution } from './user-questions.js';
import {
  privateRequestSchema,
  type PrivateInputCard,
  type PrivateInputResolution,
} from '../credentials/contracts.js';

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
  count: 5,
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

  ownerBotSlug?: string;
  invitations?: GroupInvitation[];
  joinRequests?: GroupJoinRequest[];
  wakePolicies?: Record<string, GroupWakePolicy>;

  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
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

export type ChannelMessageAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string }
  | { kind: 'system' };

export interface ChannelMessageExternal {
  id: string;
  thread?: string;
}

export interface ChannelReplyPreview {
  author: ChannelMessageAuthor;
  body: string;
}

export interface SessionFailureCard {
  requestMessageId?: string;
  assignmentAnswerTo?: string;
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  code?: string;
  status?: number;
  detail: string;
  context?: string;
}

export interface ChannelMention {
  botSlug: string;
  label: string;
  start: number;
  end: number;
}

export interface ChannelReference {
  channelId: string;
  label: string;
  start: number;
  end: number;
}

export const LOCAL_HUMAN_ID = 'local-human';

export interface LocalHumanIdentity {
  humanId: string;
  defaultDisplayName: string | null;
  displayName: string;
}

export interface ChannelHumanReceipt {
  humanId: string;
  displayName: string;
  state: 'unread' | 'read';
}

export interface ChannelDelivery {
  botSlug: string;
  state: 'pending' | 'observed' | 'running' | 'retryable' | 'needs-repair' | 'handled' | 'ignored';
}

export interface ChannelMemberDeparture {
  memberKind: 'bot' | 'human';
  memberId: string;
  displayName: string;

  departureType?: 'left' | 'removed';
}

export interface BotDmAction {
  channelId: string;
  messageId: string;
  recipientBotSlug: string;
}

export interface BotChannelPost {
  channelId: string;
  messageId: string;
}

export interface BotMessageCausation {
  rootSourceEventId: string;
  parentSourceEventId: string;
  hop: number;
}

export interface ChannelMemoryCommit {
  botSlug: string;
  sha: string;
  subject: string;
  authorName: string;
  authoredAt: string;
  files: Array<{ path: string; added: number | null; deleted: number | null }>;
  moreFiles: number;
}

function isMemoryCommit(value: unknown): value is ChannelMemoryCommit {
  if (typeof value !== 'object' || value === null) return false;
  const commit = value as Record<string, unknown>;
  const count = (item: unknown): boolean =>
    item === null || (Number.isSafeInteger(item) && (item as number) >= 0);
  return (
    typeof commit['botSlug'] === 'string' &&
    commit['botSlug'].length > 0 &&
    typeof commit['sha'] === 'string' &&
    /^[0-9a-f]{40}$/u.test(commit['sha']) &&
    typeof commit['subject'] === 'string' &&
    typeof commit['authorName'] === 'string' &&
    typeof commit['authoredAt'] === 'string' &&
    Array.isArray(commit['files']) &&
    commit['files'].length <= 20 &&
    commit['files'].every(
      (file: unknown) =>
        typeof file === 'object' &&
        file !== null &&
        typeof (file as Record<string, unknown>)['path'] === 'string' &&
        count((file as Record<string, unknown>)['added']) &&
        count((file as Record<string, unknown>)['deleted']),
    ) &&
    Number.isSafeInteger(commit['moreFiles']) &&
    (commit['moreFiles'] as number) >= 0
  );
}

export interface ChannelReaction {
  emoji: string;
  actors: { kind: 'human' | 'bot'; id: string }[];
}

export const MAX_REACTION_EMOJI_LENGTH = 16;
export const MAX_HUMAN_REACTIONS_PER_MESSAGE = 20;

export function isReactionEmoji(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REACTION_EMOJI_LENGTH &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) &&
    !/[\s\p{Cc}\p{L}\p{N}]/u.test(value)
  );
}

export interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelMessageAuthor;
  body: string;

  onboardingWelcome?: { version: 1 };

  memorySwitchTarget?: string;

  mentions?: ChannelMention[];
  humanMentions?: { humanId: string; label: string; start: number; end: number }[];
  channelRefs?: ChannelReference[];

  channelRevision?: number;

  deliveries?: ChannelDelivery[];

  humanReceipts?: ChannelHumanReceipt[];
  reactions?: ChannelReaction[];
  botDmAction?: BotDmAction;
  botChannelPost?: BotChannelPost;
  botChannelPostPreview?: string | null;
  memoryCommit?: ChannelMemoryCommit;
  noticeOrigin?: { channelId: string };
  memberDeparture?: ChannelMemberDeparture;
  botCausation?: BotMessageCausation;

  grantRequest?: true;
  grantRequestResolved?: boolean;
  assignmentReply?: { sessionId: string; sourceEventId: string };

  grantRequestResolution?: { requestMessageId: string; grantId: string };

  toolApprovalRequest?: ToolApprovalRequestCard;

  sessionFailure?: SessionFailureCard;

  toolApprovalDecision?: ToolApprovalDecision;

  userQuestionRequest?: ChannelQuestionRequest;

  userQuestionResolution?: ChannelQuestionResolution;
  privateInputRequest?: PrivateInputCard;
  privateInputResolution?: PrivateInputResolution;
  attachments?: ChannelAttachmentRef[];
  bridgeMedia?: {
    voice?: Pick<import('../messaging/provider.js').MessagingVoice, 'transcript' | 'durationMs'>;
    items: { id: string; kind: 'image' | 'file' | 'audio'; name: string; sizeBytes?: number }[];
    parts?: import('../messaging/provider.js').MessagingContentPart[];
  };
  bridgeOrigin?: {
    sourceEventId: string;
    platform: string;
    accountRef?: string;
    accountName?: string;
    conversationId: string;
    conversationName: string;
    messageId: string;
    senderId: string;
    senderName?: string;
    mentions?: { id: string; key: string; name?: string }[];
    threadId?: string;
  };
  external?: ChannelMessageExternal;
  format?: 'markdown' | 'text';

  replyTo?: string;

  replyToPreview?: ChannelReplyPreview | null;
}

export const MAX_BOT_HOPS = 8;

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
  return channel.type === 'dm' && channel.botSlug === undefined && channel.members.length === 2;
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

export function isChannelMessageAuthor(value: unknown): value is ChannelMessageAuthor {
  if (typeof value !== 'object' || value === null) return false;
  const author = value as Record<string, unknown>;
  switch (author['kind']) {
    case 'human':
    case 'system':
      return true;
    case 'bot':
      return typeof author['slug'] === 'string' && author['slug'].length > 0;
    case 'bridged':
      return typeof author['source'] === 'string' && author['source'].length > 0;
    default:
      return false;
  }
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
  const botSlug = record['botSlug'];
  if (botSlug !== undefined && typeof botSlug !== 'string') return false;
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

export function isChannelMessage(value: unknown): value is ChannelMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  if (typeof message['id'] !== 'string' || message['id'].length === 0) return false;
  if (typeof message['at'] !== 'string' || message['at'].length === 0) return false;
  if (typeof message['body'] !== 'string') return false;
  const welcome = message['onboardingWelcome'];
  if (
    welcome !== undefined &&
    (typeof welcome !== 'object' ||
      welcome === null ||
      (welcome as { version?: unknown }).version !== 1 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system')
  )
    return false;
  const switchTarget = message['memorySwitchTarget'];
  if (
    switchTarget !== undefined &&
    (typeof switchTarget !== 'string' ||
      switchTarget.length === 0 ||
      switchTarget.length > 255 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human')
  )
    return false;
  if (
    message['grantRequest'] !== undefined &&
    (message['grantRequest'] !== true ||
      !isChannelMessageAuthor(message['author']) ||
      (message['author'] as ChannelMessageAuthor).kind !== 'bot')
  )
    return false;
  const grantResolution = message['grantRequestResolution'];
  const assignmentReply = message['assignmentReply'];
  if (assignmentReply !== undefined) {
    if (
      typeof assignmentReply !== 'object' ||
      assignmentReply === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const target = assignmentReply as Record<string, unknown>;
    if (
      typeof target['sessionId'] !== 'string' ||
      target['sessionId'].length === 0 ||
      target['sessionId'].length > 150 ||
      typeof target['sourceEventId'] !== 'string' ||
      target['sourceEventId'].length === 0 ||
      target['sourceEventId'].length > 150
    )
      return false;
  }
  if (grantResolution !== undefined) {
    if (
      typeof grantResolution !== 'object' ||
      grantResolution === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const resolution = grantResolution as Record<string, unknown>;
    if (
      typeof resolution['requestMessageId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['grantId'].length === 0 ||
      message['replyTo'] !== resolution['requestMessageId']
    )
      return false;
  }
  const toolRequest = message['toolApprovalRequest'];
  if (toolRequest !== undefined) {
    if (
      typeof toolRequest !== 'object' ||
      toolRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const request = toolRequest as Record<string, unknown>;
    if (
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return false;
  }
  const failure = message['sessionFailure'];
  if (failure !== undefined) {
    if (
      typeof failure !== 'object' ||
      failure === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const notice = failure as Record<string, unknown>;
    if (
      (notice['role'] !== 'orchestrator' && notice['role'] !== 'assignment') ||
      typeof notice['sessionId'] !== 'string' ||
      notice['sessionId'].length === 0 ||
      typeof notice['detail'] !== 'string' ||
      notice['detail'].length === 0 ||
      (notice['code'] !== undefined && typeof notice['code'] !== 'string') ||
      (notice['status'] !== undefined && typeof notice['status'] !== 'number') ||
      (notice['context'] !== undefined && typeof notice['context'] !== 'string')
    )
      return false;
  }
  const toolDecision = message['toolApprovalDecision'];
  if (toolDecision !== undefined) {
    if (
      typeof toolDecision !== 'object' ||
      toolDecision === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const decision = toolDecision as Record<string, unknown>;
    if (decision['actor'] !== undefined && !parseToolApprovalActor(decision['actor'])) return false;
    if (
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      message['replyTo'] !== decision['requestMessageId']
    )
      return false;
  }
  const mentions = message['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          typeof item.botSlug !== 'string' ||
          typeof item.label !== 'string' ||
          typeof item.start !== 'number' ||
          typeof item.end !== 'number' ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start,
      ))
  )
    return false;
  const humanMentions = message['humanMentions'];
  if (
    humanMentions !== undefined &&
    (!Array.isArray(humanMentions) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot' ||
      humanMentions.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          typeof item.humanId !== 'string' ||
          item.humanId.length === 0 ||
          typeof item.label !== 'string' ||
          item.label.length === 0 ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start ||
          (message['body'] as string).slice(item.start, item.end) !== '@' + item.label,
      ))
  )
    return false;
  const channelRefs = message['channelRefs'];
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
      channelRefs.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          !isValidChannelId(item.channelId) ||
          typeof item.label !== 'string' ||
          item.label.length === 0 ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start ||
          (message['body'] as string).slice(item.start, item.end) !== '#' + item.label,
      ))
  )
    return false;
  const questionRequest = message['userQuestionRequest'];
  if (questionRequest !== undefined) {
    if (
      typeof questionRequest !== 'object' ||
      questionRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const request = questionRequest as Record<string, unknown>;
    if (
      typeof request['sessionId'] !== 'string' ||
      request['sessionId'].length === 0 ||
      (request['callId'] !== undefined &&
        (typeof request['callId'] !== 'string' || request['callId'].length === 0)) ||
      !Array.isArray(request['questions']) ||
      request['questions'].length === 0 ||
      !request['questions'].every((value) => {
        if (typeof value !== 'object' || value === null) return false;
        const item = value as Record<string, unknown>;
        return (
          typeof item['id'] === 'string' &&
          typeof item['question'] === 'string' &&
          (item['detail'] === undefined || typeof item['detail'] === 'string') &&
          (item['header'] === undefined || typeof item['header'] === 'string') &&
          (item['multiSelect'] === undefined || typeof item['multiSelect'] === 'boolean') &&
          (item['options'] === undefined ||
            (Array.isArray(item['options']) &&
              item['options'].every((option) => {
                if (typeof option !== 'object' || option === null) return false;
                const row = option as Record<string, unknown>;
                return (
                  typeof row['label'] === 'string' &&
                  (row['description'] === undefined || typeof row['description'] === 'string')
                );
              })))
        );
      })
    )
      return false;
  }
  const questionResolution = message['userQuestionResolution'];
  if (questionResolution !== undefined) {
    if (typeof questionResolution !== 'object' || questionResolution === null) return false;
    const resolution = questionResolution as Record<string, unknown>;
    if (
      typeof resolution['requestMessageId'] !== 'string' ||
      message['replyTo'] !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled') ||
      (resolution['state'] === 'answered' &&
        ((message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
          !Array.isArray(resolution['answers']))) ||
      (resolution['state'] === 'cancelled' &&
        (message['author'] as ChannelMessageAuthor)?.kind !== 'bot')
    )
      return false;
  }
  const memberDeparture = message['memberDeparture'];
  if (memberDeparture !== undefined) {
    if (typeof memberDeparture !== 'object' || memberDeparture === null) return false;
    const departure = memberDeparture as Record<string, unknown>;
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      (departure['memberKind'] !== 'bot' && departure['memberKind'] !== 'human') ||
      typeof departure['memberId'] !== 'string' ||
      departure['memberId'].length === 0 ||
      typeof departure['displayName'] !== 'string' ||
      departure['displayName'].length === 0 ||
      (departure['departureType'] !== undefined &&
        departure['departureType'] !== 'left' &&
        departure['departureType'] !== 'removed')
    )
      return false;
  } else if (message['memoryCommit'] !== undefined) {
    if (
      (message['author'] as ChannelMessageAuthor)?.kind !== 'system' ||
      !isMemoryCommit(message['memoryCommit'])
    )
      return false;
  } else if (
    (message['author'] as ChannelMessageAuthor)?.kind === 'system' &&
    !(
      typeof message['onboardingWelcome'] === 'object' &&
      message['onboardingWelcome'] !== null &&
      (message['onboardingWelcome'] as { version?: unknown }).version === 1
    )
  ) {
    return false;
  }
  const botDmAction = message['botDmAction'];
  if (botDmAction !== undefined) {
    if (typeof botDmAction !== 'object' || botDmAction === null) return false;
    const action = botDmAction as Record<string, unknown>;
    if (
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string' ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const botChannelPost = message['botChannelPost'];
  if (botChannelPost !== undefined) {
    if (typeof botChannelPost !== 'object' || botChannelPost === null) return false;
    const post = botChannelPost as Record<string, unknown>;
    if (
      typeof post['channelId'] !== 'string' ||
      typeof post['messageId'] !== 'string' ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const botCausation = message['botCausation'];
  if (botCausation !== undefined) {
    if (typeof botCausation !== 'object' || botCausation === null) return false;
    const causal = botCausation as Record<string, unknown>;
    if (
      typeof causal['rootSourceEventId'] !== 'string' ||
      typeof causal['parentSourceEventId'] !== 'string' ||
      !Number.isSafeInteger(causal['hop']) ||
      (causal['hop'] as number) < 1 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const attachments = message['attachments'];
  if (
    attachments !== undefined &&
    (!Array.isArray(attachments) ||
      attachments.length > 10 ||
      !attachments.every(isChannelAttachmentRef))
  )
    return false;
  if (!isChannelMessageAuthor(message['author'])) return false;
  if (
    message['format'] !== undefined &&
    message['format'] !== 'markdown' &&
    message['format'] !== 'text'
  )
    return false;
  if (
    message['replyTo'] !== undefined &&
    (typeof message['replyTo'] !== 'string' || message['replyTo'].length === 0)
  )
    return false;
  const preview = message['replyToPreview'];
  if (preview !== undefined && preview !== null) {
    if (typeof preview !== 'object') return false;
    const record = preview as Record<string, unknown>;
    if (!isChannelMessageAuthor(record['author']) || typeof record['body'] !== 'string')
      return false;
  }
  const bridgeOrigin = message['bridgeOrigin'];
  if (bridgeOrigin !== undefined) {
    if (
      typeof bridgeOrigin !== 'object' ||
      bridgeOrigin === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bridged'
    )
      return false;
    const origin = bridgeOrigin as Record<string, unknown>;
    for (const key of ['accountRef', 'accountName']) {
      if (origin[key] !== undefined && (typeof origin[key] !== 'string' || !origin[key].trim()))
        return false;
    }
    for (const key of [
      'sourceEventId',
      'platform',
      'conversationId',
      'conversationName',
      'messageId',
      'senderId',
    ]) {
      if (typeof origin[key] !== 'string' || origin[key].length === 0) return false;
    }
    if (
      origin['senderName'] !== undefined &&
      (typeof origin['senderName'] !== 'string' || origin['senderName'].trim().length === 0)
    )
      return false;
    const nativeMentions = origin['mentions'];
    if (
      nativeMentions !== undefined &&
      (!Array.isArray(nativeMentions) ||
        !nativeMentions.every(
          (mention) =>
            typeof mention === 'object' &&
            mention !== null &&
            typeof mention.id === 'string' &&
            mention.id.length > 0 &&
            typeof mention.key === 'string' &&
            mention.key.length > 0 &&
            (mention.name === undefined || typeof mention.name === 'string'),
        ))
    )
      return false;
    if (
      origin['threadId'] !== undefined &&
      (typeof origin['threadId'] !== 'string' || origin['threadId'].length === 0)
    )
      return false;
  }
  const privateRequest = message['privateInputRequest'];
  if (privateRequest !== undefined) {
    if (
      typeof privateRequest !== 'object' ||
      privateRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const { sessionId, expiresAt, replacesMessageId, ...declaration } = privateRequest as Record<
      string,
      unknown
    >;
    if (
      (sessionId === undefined
        ? replacesMessageId === undefined
        : typeof sessionId !== 'string' || sessionId.length === 0) ||
      (replacesMessageId !== undefined &&
        (typeof replacesMessageId !== 'string' || !/^[0-9a-f-]{36}$/.test(replacesMessageId))) ||
      (expiresAt !== undefined &&
        (typeof expiresAt !== 'string' || !Number.isFinite(Date.parse(expiresAt)))) ||
      !privateRequestSchema.safeParse(declaration).success
    )
      return false;
  }
  const privateResolution = message['privateInputResolution'];
  if (privateResolution !== undefined) {
    if (
      typeof privateResolution !== 'object' ||
      privateResolution === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const resolution = privateResolution as Record<string, unknown>;
    if (
      Object.keys(resolution).some(
        (key) => !['requestMessageId', 'state', 'references'].includes(key),
      ) ||
      typeof resolution.requestMessageId !== 'string' ||
      message['replyTo'] !== resolution.requestMessageId ||
      !['configured', 'cancelled', 'expired'].includes(String(resolution.state)) ||
      typeof resolution.references !== 'object' ||
      resolution.references === null ||
      Array.isArray(resolution.references) ||
      (resolution.state !== 'configured' && Object.keys(resolution.references).length > 0) ||
      !Object.values(resolution.references).every(
        (ref) =>
          typeof ref === 'string' && /^private:[0-9a-f-]{36}:[a-z][a-z0-9_]{0,47}$/.test(ref),
      )
    )
      return false;
  }
  const external = message['external'];
  if (external !== undefined) {
    if (typeof external !== 'object' || external === null) return false;
    const record = external as Record<string, unknown>;
    if (typeof record['id'] !== 'string' || record['id'].length === 0) return false;
    if (record['thread'] !== undefined && typeof record['thread'] !== 'string') return false;
  }
  return true;
}
