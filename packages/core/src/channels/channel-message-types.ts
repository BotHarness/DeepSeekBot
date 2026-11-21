import type { SessionTurnModelSwitch, TurnTarget } from '@botharness/host-protocol/turn-target';
import type { ApprovalCard } from '../team/approval-contract.js';
import { isSkillWorkspaceId, type SkillOwner } from '../skills/entries.js';
import type { ChannelMessageAuthor } from './message-author.js';
import type { ChannelReplyPreview } from './reply-preview.js';
import type { ChannelQuote } from './quotes.js';
import { isChannelMessageVoice, type ChannelMessageVoice } from './voice.js';
import { isValidSlug } from '../bots/slug.js';
import type {
  ChannelTurnStopEngine,
  ChannelTurnStopRest,
  ChannelTurnStopTarget,
} from './turn-stop.js';
import type { ChannelModelSwitch } from './model-switch.js';
import { isCallGridLayout, type CallGridLayout } from '../voice/keyframes.js';
import type { ChannelVoiceCallRecord } from './voice-call-record.js';
import type { GenuiContent, GenuiMessageReply } from './genui.js';
import type { ChannelAttachmentRef, ChannelClearedAttachment } from '../attachments/ref.js';
import type { ToolApprovalDecision, ToolApprovalRequestCard } from '../workspaces/tool-approval.js';
import type { ChannelQuestionRequest, ChannelQuestionResolution } from './user-questions.js';
import type { PrivateInputCard, PrivateInputResolution } from '../credentials/contracts.js';
import type { TakeoverRequestCard, TakeoverResolution } from '../takeover/contracts.js';

export type { ChannelMessageAuthor };

export interface ChannelMessageExternal {
  id: string;
  thread?: string;
}

export type { ChannelReplyPreview, ChannelReplyPreviewMedia } from './reply-preview.js';
export type { ChannelQuote } from './quotes.js';

export interface SessionFailureCard {
  requestMessageId?: string;
  assignmentAnswerTo?: string;
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  code?: string;
  status?: number;
  detail: string;
  context?: string;
  progress?: SessionFailureProgress;
  autoContinue?: SessionFailureAutoContinue;
}

export interface SessionFailureProgress {
  completedSteps: number;
  lastTool?: string;
  unknownTools?: string[];
}

export interface SessionFailureAutoContinue {
  attempt: number;
  maxAttempts: number;
  at: string;
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

export interface ChannelSkillInvocation {
  name: string;
  owner: SkillOwner;
  start: number;
  end: number;
  path?: string;
  content: string;
}

export type ChannelSkillInvocationToken = Pick<
  ChannelSkillInvocation,
  'name' | 'owner' | 'start' | 'end'
>;

const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export function isSkillInvocationToken(
  item: unknown,
  body: string,
): item is ChannelSkillInvocationToken {
  if (typeof item !== 'object' || item === null) return false;
  const { name, owner, start, end } = item as Record<string, unknown>;
  if (typeof name !== 'string' || name.length > 64 || !SKILL_NAME.test(name)) return false;
  if (typeof owner !== 'object' || owner === null) return false;
  const { kind, botSlug, workspaceId, name: workspaceName } = owner as Record<string, unknown>;
  if (
    kind !== 'host' &&
    !(kind === 'bot' && typeof botSlug === 'string' && isValidSlug(botSlug)) &&
    !(kind === 'workspace' && isSkillWorkspaceId(workspaceId) && typeof workspaceName === 'string')
  )
    return false;
  return (
    typeof start === 'number' &&
    typeof end === 'number' &&
    Number.isSafeInteger(start) &&
    Number.isSafeInteger(end) &&
    start >= 0 &&
    end > start &&
    body.slice(start, end) === '/' + name
  );
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

export interface ChannelToolAutoApproval {
  botSlug: string;
  sessionId: string;
  callId: string;
  toolName: string;
  input: string;
  template: string;
  templateVersion?: string;
  outcome: 'allowed' | 'rejected' | 'ask-human';
  reason: string;
}

export interface ChannelToolAutoApprovalPause {
  botSlug: string;
  sessionId: string;
  template: string;
  state: 'paused' | 'resumed';
  reason?: 'consecutive' | 'session';
}

export interface ChannelToolAutoApprovalOverride {
  recordMessageId: string;
  botSlug: string;
  sessionId: string;
  toolName: string;
}

export interface ChannelTurnStop {
  botSlug: string;
  botName: string;
  humanName: string;
  sessionId: string;
  held?: true;
  cause?: 'human-stop' | 'failures' | 'quota';
  failures?: number;
  rests?: ChannelTurnStopRest[];
  engine?: ChannelTurnStopEngine;
  routingGroup?: true;
  target?: ChannelTurnStopTarget;
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

export interface BotCreateAction {
  botSlug: string;
  displayName: string;
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

export interface ChannelReaction {
  emoji: string;
  actors: { kind: 'human' | 'bot'; id: string }[];
}

export const MAX_REACTION_EMOJI_LENGTH = 16;
export const MAX_ACTOR_REACTIONS_PER_MESSAGE = 20;

export function isReactionEmoji(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_REACTION_EMOJI_LENGTH &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value) &&
    !/[\s\p{Cc}\p{L}\p{N}]/u.test(value)
  );
}

export type ChannelCallVisual =
  | {
      source: 'camera' | 'screen';
      frames: number;
      layout: CallGridLayout;
      fromMs: number;
      toMs: number;
      unseen?: true;
    }
  | {
      source: 'camera' | 'screen';
      sameAs: string;
    };

const callOffset = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const callRange = (from: unknown, to: unknown) => callOffset(from) && callOffset(to) && to >= from;

export function isChannelCallVisual(value: unknown): value is ChannelCallVisual {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const visual = value as Record<string, unknown>;
  if (visual['source'] !== 'camera' && visual['source'] !== 'screen') return false;
  const keys = Object.keys(visual).sort().join();
  if (keys === 'sameAs,source')
    return (
      typeof visual['sameAs'] === 'string' &&
      visual['sameAs'].length > 0 &&
      visual['sameAs'].length <= 150
    );
  return (
    ['frames,fromMs,layout,source,toMs', 'frames,fromMs,layout,source,toMs,unseen'].includes(
      keys,
    ) &&
    (visual['unseen'] === undefined || visual['unseen'] === true) &&
    isCallGridLayout(visual['frames'], visual['layout']) &&
    callRange(visual['fromMs'], visual['toMs'])
  );
}

export interface ChannelVoiceCallMessage {
  callId: string;
  speechFromMs?: number;
  speechToMs?: number;
  atMs?: number;
  visual?: ChannelCallVisual;
}

const VOICE_CALL_MESSAGE_KEYS = new Set(['callId', 'visual', 'speechFromMs', 'speechToMs', 'atMs']);

export function isChannelVoiceCallMessage(value: unknown): value is ChannelVoiceCallMessage {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const call = value as Record<string, unknown>;
  if (Object.keys(call).some((key) => !VOICE_CALL_MESSAGE_KEYS.has(key))) return false;
  if (typeof call['callId'] !== 'string' || !/^call-[a-f0-9]{16}$/u.test(call['callId']))
    return false;
  if (call['visual'] !== undefined && !isChannelCallVisual(call['visual'])) return false;
  const spoken = call['speechFromMs'] !== undefined || call['speechToMs'] !== undefined;
  if (call['atMs'] !== undefined) return !spoken && callOffset(call['atMs']);
  if (!spoken) return true;
  return callRange(call['speechFromMs'], call['speechToMs']);
}

export interface ChannelSessionLink {
  sessionId: string;
  kind: 'created' | 'sent';
  title: string;
}

export interface ChannelMessage {
  genui?: GenuiContent;
  sessionLinks?: ChannelSessionLink[];
  genuiReply?: GenuiMessageReply;
  genuiReplyContext?: string;
  id: string;
  at: string;
  author: ChannelMessageAuthor;
  body: string;

  onboardingWelcome?: { version: 1; kind?: 'tob' };

  tobCliRequestId?: string;
  memorySwitchTarget?: string;

  mentions?: ChannelMention[];
  humanMentions?: { humanId: string; label: string; start: number; end: number }[];
  channelRefs?: ChannelReference[];
  skillInvocations?: ChannelSkillInvocation[];

  channelRevision?: number;

  deliveries?: ChannelDelivery[];

  humanReceipts?: ChannelHumanReceipt[];
  reactions?: ChannelReaction[];
  botDmAction?: BotDmAction;
  botCreateAction?: BotCreateAction;
  botChannelPost?: BotChannelPost;
  botChannelPostPreview?: string | null;
  memoryCommit?: ChannelMemoryCommit;
  noticeOrigin?: { channelId: string };
  memberDeparture?: ChannelMemberDeparture;
  turnStop?: ChannelTurnStop;
  modelSwitch?: ChannelModelSwitch;
  turnTargets?: TurnTarget[];
  turnModelSwitch?: SessionTurnModelSwitch;
  toolAutoApproval?: ChannelToolAutoApproval;
  toolAutoApprovalPause?: ChannelToolAutoApprovalPause;
  toolAutoApprovalOverride?: ChannelToolAutoApprovalOverride;
  botCausation?: BotMessageCausation;

  grantRequest?: true;
  grantRequestOwner?: string;
  grantRequestResolved?: boolean;
  assignmentReply?: { sessionId: string; sourceEventId: string };

  grantRequestResolution?: { requestMessageId: string; grantId: string };

  approval?: ApprovalCard;
  toolApprovalRequest?: ToolApprovalRequestCard;

  sessionFailure?: SessionFailureCard;

  toolApprovalDecision?: ToolApprovalDecision;

  userQuestionRequest?: ChannelQuestionRequest;

  userQuestionResolution?: ChannelQuestionResolution;
  privateInputRequest?: PrivateInputCard;
  privateInputResolution?: PrivateInputResolution;
  takeoverRequest?: TakeoverRequestCard;
  takeoverResolution?: TakeoverResolution;
  attachments?: ChannelAttachmentRef[];
  clearedAttachments?: ChannelClearedAttachment[];
  voice?: ChannelMessageVoice;
  voiceCall?: ChannelVoiceCallMessage;
  voiceCallRecord?: ChannelVoiceCallRecord;
  bridgeMedia?: {
    voice?: Pick<import('../messaging/provider.js').MessagingVoice, 'transcript' | 'durationMs'>;
    video?: { attachmentId: string; durationMs?: number; posterAttachmentId?: string };
    items: {
      id: string;
      kind: 'image' | 'file' | 'audio' | 'video';
      name: string;
      sizeBytes?: number;
    }[];
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

  quotes?: ChannelQuote[];

  perf?: ChannelMessagePerf;
}

export { isChannelMessageVoice, type ChannelMessageVoice };

export interface ChannelMessagePerf {
  outputTokens: number;
  elapsedMs: number;
  estimated: boolean;
}

export function isChannelMessageAuthor(value: unknown): value is ChannelMessageAuthor {
  if (typeof value !== 'object' || value === null) return false;
  const author = value as Record<string, unknown>;
  switch (author['kind']) {
    case 'human':
      return (
        (author['deleted'] === undefined || typeof author['deleted'] === 'boolean') &&
        (author['humanId'] === undefined || typeof author['humanId'] === 'string') &&
        (author['displayName'] === undefined || typeof author['displayName'] === 'string')
      );
    case 'system':
      return true;
    case 'bot':
      return (
        typeof author['slug'] === 'string' &&
        author['slug'].length > 0 &&
        (author['displayName'] === undefined || typeof author['displayName'] === 'string')
      );
    case 'remote-bot':
      return (
        typeof author['hostId'] === 'string' &&
        /^[a-zA-Z0-9_-]{1,128}$/u.test(author['hostId']) &&
        typeof author['slug'] === 'string' &&
        isValidSlug(author['slug'])
      );
    case 'bridged':
      return typeof author['source'] === 'string' && author['source'].length > 0;
    default:
      return false;
  }
}
