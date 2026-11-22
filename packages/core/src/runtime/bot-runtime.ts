export { markSkillTokens, skillInvocationPrompt } from './channel-prompts.js';
import { createGroupDigest, type DigestRow, type GroupContext } from './group-digest.js';
export type { GroupContext } from './group-digest.js';
import { createChannelAdmission } from '../channels/runtime-admission.js';
import { createCausalSending } from '../channels/causal-sending.js';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import { engineAccountKey } from '@botharness/host-protocol/subscription-engine';
import { routingTargetRestKey } from '../models/group-fallback.js';
import { directSessionTarget, sessionModelChoices } from './session-model-choices.js';
import { createOrchestratorScheduling } from './orchestrator-scheduling.js';
import {
  createOrchestratorCancellation,
  interruptedToolsNote,
} from './orchestrator-cancellation.js';
import {
  createOrchestratorContinuation,
  MAX_MIXED_GROUP_ATTEMPTS,
  routingTargetKey,
  type PendingAutoContinue,
  type DmContinuation,
  continuationNote,
  RouteRestingError,
  RoutingGroupUnavailableError,
} from './orchestrator-continuation.js';
import type { AssignmentRow } from '../features/assignments/events-types.js';
import { requireNonBlank } from './require-non-blank.js';
import { createMessagingEvents } from '../features/messaging/events.js';
import { createActivityEvents } from '../features/activity/events.js';
import { createAssignmentDelivery } from '../features/assignments/delivery.js';
import { createAssignmentReporting } from '../features/assignments/reporting.js';
import { createAssignmentEvents } from '../features/assignments/events.js';
import type { TurnTarget, TurnTargetSwitchReason } from '@botharness/host-protocol/turn-target';
import {
  lastTurnTarget,
  readTurnTargets,
  readTurnModelSwitch,
  recordTurnTarget,
  type TurnTargetSegment,
} from './turn-targets.js';
import type {
  AssignmentActivity,
  AssignmentReport,
  AssignmentReportInput,
  AssignmentReportState,
  ChannelAssignmentSummary,
} from '@botharness/host-protocol/wire';

import { HarnessError } from '@deepseek-ai/dsh-llm';
import {
  assertQuoteTargets,
  ChannelQuoteError,
  quotePromptBlock,
  type ChannelQuote,
} from '../channels/quotes.js';
import { hasIrreversibleExternalEffect, toolEffects } from '../workspaces/tool-effects.js';

import type { TobCliRequest, TobCliStatus, TobCliTurn } from '../tob/cli-request.js';
import type { TeamService } from '../team/service.js';
import { TeamError } from '../team/error.js';
import { botOwner } from '../team/bot-access.js';
import { humanContext } from '../humans/context.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import { BotNetworkDeliveryError } from './bot-network.js';
import type { SessionRecoveryAction } from './session-recovery.js';
import type { AssignmentReportContent } from './assignment-report.js';
import type {
  AssignmentReportRead,
  AcceptedAssignmentReportPage,
} from './assignment-report-reader.js';
import {
  GroupReplySourceRevoked,
  GroupSendReview,
  SendReviewRequired,
} from '../channels/send-review.js';
import { TobError, type TobService } from '../tob/service.js';
import { AssignmentInboxAcceptanceUncertainError } from './assignment-delivery.js';
import { OrchestratorWorkingDirectoryError } from './orchestrator-working-directory.js';
import {
  AssignmentApprovalCapacity,
  type AssignmentApprovalWaitLease,
  type AssignmentExecutionWait,
} from './assignment-approval-capacity.js';
import type { AssignmentWaitOutcome } from './assignment-wait.js';
import { externalMemberWake } from '../messaging/defaults.js';
import { sourceSenderAllowed, type SenderPermissions } from '../messaging/sender-access.js';
import type { MessagingDirectoryQuery, MessagingDirectoryPage } from '../messaging/directory.js';
import type {
  ThreadReceptionInput,
  ThreadReceptionPolicy,
  ThreadReceptionView,
} from '../messaging/thread-policy.js';
import type { GroupReceptionInput, GroupReceptionPolicy } from '../messaging/group-policy.js';
import {
  requireAssignmentSource,
  requireSourceContent,
  requireSourceEffects,
} from '../purge/fence.js';
import { saveAttachmentFile } from '../attachments/file-operations.js';
import { OriginalAttachmentAccess } from '../attachments/original-access.js';
import {
  createChannelFileAccess,
  type ChannelFileAccess,
} from '../features/channel-files/events.js';
import { createMemoryEvents } from '../features/memory/events.js';
import {
  bindScheduleCommands,
  linkScheduleFiringsToSession,
  scheduleInboxFacts,
} from '../features/schedules/events.js';
import {
  callTimelineNote,
  callVisualNote,
  createVoiceAccess,
  queryCallWindow,
  type CallFrameAccess,
  type VoiceChannelAccess,
} from '../features/voice/events.js';
import { authorizedPathRoot } from '../workspaces/grant-native-tools.js';
import { renderInbox, type InboxUnit } from './inbox-render.js';
import type { OutboxIntent, OutboundMessaging } from '../messaging/outbound.js';
import { PrivateInputRefusal, type PrivateInputOrigin } from '../credentials/im-origin.js';
import { PRIVATE_INPUT_TOOLS } from '../credentials/tool-contract.js';
import type { MessagingProcessing } from '../messaging/typing.js';
import type {
  ExternalSource,
  ExternalContextQuery,
  ExternalContextResult,
} from '../messaging/inbound.js';
import { createHash, randomUUID } from 'node:crypto';
import {
  createInboxHistoryQuery,
  type InboxHistoryInput,
  type InboxHistoryPage,
  type InboxHistoryQuery,
} from './inbox-history.js';
import { channelSql } from './attention.js';
import {
  createInboxTriage,
  type InboxTriage,
  type OrchestratorInboxTriage,
} from './inbox-triage.js';
import { isAbsolute, join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';

import {
  MAX_PERSONA_BOT_AVATAR_BYTES,
  personaBotAvatarFromBytes,
  type PersonaBotRecord,
} from '../bots/persona-bot.js';
import { readFileSync, statSync } from 'node:fs';
import {
  isAssignmentModelChoice,
  isModelRoute,
  assignmentGroupOptionOf,
  resolveBotModelPlan,
  selectAssignmentGroup,
  type PersonaBotModelPlan,
  selectAssignmentRoute,
  AssignmentChoiceError,
  type ModelRoute,
} from '../models/presets.js';
import {
  isPresetSubEngineSelection,
  matchesPresetSubChoice,
  presetSubEngineTarget,
  type PresetSubEngineSelection,
} from '../models/preset-sub.js';
import type { RouteRests } from '../models/route-rest.js';
import {
  type GroupFallback,
  type ModelSwitch,
  unavailableRoutingEngine,
} from '../models/group-fallback.js';
import type { RoutingTarget } from '../models/routing-groups.js';
import { EngineLimitError, EngineRefusal, isEngineId } from '../engines/engine-session.js';
import type { AssignmentAccessStore } from '../workspaces/assignment-access.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type {
  BotCreatePreview,
  ToolApprovalOrigin,
  ToolApprovalOriginQuery,
} from '../workspaces/tool-approval.js';
import { MemoryAcceptError, type MemoryChangeDelta } from '../memory/accepted.js';
import type { MemoryService } from '../memory/service.js';
import {
  isBotDmChannel,
  DEFAULT_BOT_HOP_LIMIT,
  dmChannelId,
  type GroupInvitation,
  type GroupJoinRequest,
  type GroupWakePolicyView,
  type ChannelMessage,
  type ChannelReaction,
  type ChannelRecord,
  type ChannelTurnStop,
  type SessionFailureProgress,
} from '../channels/channel.js';
import { hasChannelCallWindow, type ChannelCallWindow } from '../channels/call-window.js';
import { ChannelReplyTargetError, MAX_MESSAGE_PAGE } from '../channels/store.js';
import type { MessagePerfTracker } from '../usage/message-perf.js';
import { attachmentIdentity, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelMessageQueryOptions, ChannelStore } from '../channels/store.js';
import {
  boundModelPage,
  readModelContent,
  CHANNEL_READ_OUTPUT_LIMIT,
} from './channel-model-read.js';
import {
  discoverBotContacts,
  networkBotId,
  BOT_CONTACT_OUTPUT_LIMIT,
  type BotContactQuery,
  type BotContactPage,
} from './bot-contact-discovery.js';
import type { AttachmentStore } from '../attachments/store.js';
import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import { createSessionOwnership, type SessionOwnership } from '../sessions/ownership.js';
import { sessionMentionText } from './session-mentions.js';
import { SESSION_DIRECT_MESSAGE_PREFIX, sessionDirectSpeaker } from './session-direct-message.js';
import {
  createBotSourcePolicyStore,
  type BotSourcePolicy,
  type BotSourcePolicyStore,
} from './source-policy.js';
import {
  ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
  ASSIGNMENT_TITLE_MAX_LENGTH,
} from './assignment-title.js';
import type { AssignmentReportPage } from './assignment-tail.js';
import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleInput,
  BotScheduleStore,
} from '../schedules/bot-schedules.js';
import type {
  AssignmentPermissionSnapshot,
  WorkspaceGrant,
  WorkspaceGrantStore,
} from '../workspaces/grants.js';
import { DEFAULT_PROMPT_TEXT, type PromptText } from '../prompts/prompt-parts.js';
import { DEFAULT_PROMPT_LIMITS, type PromptLimits } from '../prompts/prompt-limits.js';
import { isBotSubagentModelTool } from './subagent-model-tools.js';

export type {
  AssignmentActivity,
  AssignmentReport,
  AssignmentReportInput,
  AssignmentReportState,
  ChannelAssignmentSummary,
} from '@botharness/host-protocol/wire';

export type AssignmentRequestMode = 'next-step' | 'next-turn';

export interface AssignmentOpenAsk {
  sourceEventId: string;
  summary: string;
  at: string;
}

export interface AssignmentSummary {
  sessionId: string;
  title: string;
  description: string;
  activity: AssignmentActivity;
  executionWait?: AssignmentExecutionWait;
  latestReport?: AssignmentReport;
  continuityKey?: string;
  openAsk?: AssignmentOpenAsk;
  permission?: AssignmentPermissionSnapshot;
  modelRoute?: ModelRoute;
  modelGroupId?: string;
  modelGroupEffort?: string;
  agentPreset?: string;
  archivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AssignmentDirectoryQuery {
  query?: string;
  activity?: AssignmentActivity[];
  includeArchived?: boolean;
  limit?: number;
  cursor?: string;
}

export interface AssignmentDirectoryPage {
  assignments: AssignmentSummary[];
  nextCursor?: string;
}

export type AssignmentArchiveOutcome =
  | { outcome: 'archived'; assignment: AssignmentSummary }
  | {
      outcome: 'refused';
      code: 'assignment-active';
      assignment: AssignmentSummary;
      message: string;
    };

export type OrchestratorReplacement<T> =
  | { outcome: 'replaced'; value: T }
  | { outcome: 'refused'; code: 'bot-busy'; message: string };

const BOT_BUSY = {
  outcome: 'refused',
  code: 'bot-busy',
  message: 'This Bot is working right now; wait for it to finish, then try again.',
} as const;

export interface NativeSessionArchive {
  archiveSession(sessionId: string): Promise<void>;
  unarchiveSession(sessionId: string): Promise<void>;
}

export interface AssignmentDetail extends AssignmentSummary {
  botSlug: string;
  sourceEventId: string;
}

export interface AssignmentEventTail {
  events: Array<{
    seq: number;
    type: string;
    text: string;
    truncated: boolean;
  }>;
  indexedEvents: number;
  readCount: number;
  sourceEventBytes: number;
  returnedCharacters: number;
  estimatedTokens: number;
}

export interface AssignmentCapacityRefusal {
  outcome: 'capacity';
  code: 'assignment-capacity';
  activeCount: number;
  limit: number;
  retryable: true;
  message: string;
}

export type AssignmentCreateOutcome =
  | { outcome: 'created'; assignment: AssignmentSummary }
  | { outcome: 'reused'; assignment: AssignmentSummary }
  | { outcome: 'key-busy'; message: string }
  | AssignmentCapacityRefusal;

export type AssignmentRequestOutcome =
  | {
      assignment: AssignmentSummary;
      delivery: 'steer' | 'followup';
      acceptance?: 'accepted' | 'pending';
    }
  | (AssignmentCapacityRefusal & {
      assignment: AssignmentSummary;
      delivery: 'capacity';
    })
  | AssignmentEndedRefusal;

export interface AssignmentEndedRefusal {
  outcome: 'refused';
  code: 'assignment-ended';
  assignment: AssignmentSummary;
  delivery: 'refused';
  message: string;
}

export interface OrchestratorAssignmentAccess {
  wait?(sessionId: string, signal: AbortSignal, timeoutMs?: number): Promise<AssignmentWaitOutcome>;
  create(input: {
    title: string;
    description: string;
    instructions?: string;
    key?: string;
    grantId: string;
    model?: ModelRoute;
    engine?: PresetSubEngineSelection;
    engineEffort?: string;
    modelGroupId?: string;
    routingTarget?: RoutingTarget;
    modelGroupEffort?: string;
    mode?: string;
  }): AssignmentCreateOutcome;
  refreshRoute?(sessionId: string): Promise<unknown>;
  grants(): WorkspaceGrant[];
  list(): AssignmentSummary[];
  inspect(sessionId: string): AssignmentDetail | undefined;
  tail?(sessionId: string): Promise<AssignmentEventTail>;
  reportPage?(request: AssignmentReportRead): Promise<AcceptedAssignmentReportPage>;
  request(input: {
    sessionId: string;
    mode: AssignmentRequestMode;
    text: string;
    answerTo?: string;
    model?: ModelRoute;
  }): AssignmentRequestOutcome;
  stop(sessionId: string): Promise<AssignmentSummary>;
  query?(input: AssignmentDirectoryQuery): AssignmentDirectoryPage;
  archive?(sessionId: string): Promise<AssignmentArchiveOutcome>;
  unarchive?(sessionId: string): Promise<{ outcome: 'unarchived'; assignment: AssignmentSummary }>;
}

export interface OrchestratorAgentRun {
  routingTarget?: RoutingTarget;
  observeTurnTarget?(
    turn: number,
    step: number,
    target: TurnTarget,
    reason?: TurnTargetSwitchReason,
  ): void;
  switchReason?: TurnTargetSwitchReason;
  groupEffort?: string | null;
  continuingFromNativeRoute?: true;
  inputAccepted?(): void;
  canUseEngineChannel?(channelId: string): boolean;
  priorEngineReplies?(): ReadonlySet<string>;
  speakerPolicy?(
    humanId?: string,
    topic?: string,
  ): ReturnType<TeamService['speakerPolicy']['forHuman']>;
  replyDestination?(
    sourceEventId: string,
  ):
    | { kind: 'external'; source: ExternalSource }
    | { kind: 'channel'; channelId: string; messageId: string };
  tobCli?: boolean;
  tobCliTurn?: TobCliTurn;
  inboxHistory?(input?: InboxHistoryInput): InboxHistoryPage;
  triage?: OrchestratorInboxTriage;
  acceptNativeInput?: () => boolean;
  setExecutionReady?(ready: boolean): void;
  requireContent?(): void;
  toolsInterrupted?(calls: InterruptedToolCall[]): void;
  sessionId: string;
  resume: boolean;
  bot: PersonaBotRecord;
  message: string;

  inbox: string;
  inboundChannelId: string | undefined;
  externalMessaging?: {
    connected(): boolean;
    senderPermissions?(sourceEventId: string): SenderPermissions;
    directory?(query: MessagingDirectoryQuery): MessagingDirectoryPage;
    targets?(): Promise<
      Array<{
        grantId: string;
        bindingId: string;
        accountRef: string;
        platform: string;
        accountName: string;
        targetName: string;
        conversationId: string;
        canPost: true;
      }>
    >;
    post?(grantId: string, requestId: string, text: string): ReturnType<OutboundMessaging['post']>;
    reachable?(
      bindingId?: string,
      cursor?: string,
    ): Promise<
      Array<{
        bindingId: string;
        platform: string;
        accountName: string;
        page?: import('../messaging/provider.js').MessagingReachablePage;
        reason?: string;
      }>
    >;
    postConversation?(
      bindingId: string,
      conversationId: string,
      requestId: string,
      text: string,
    ): ReturnType<OutboundMessaging['postConversation']>;
    outbox?(
      intentId?: string,
    ): OutboxIntent | Array<Omit<OutboxIntent, 'text'> & { preview: string }>;
    policies(): Promise<
      Array<{
        grantId: string;
        group: string;
        policy: GroupReceptionPolicy;
        ordinaryDelivery: 'verified' | 'unverified';
        memberWake?: ReturnType<typeof externalMemberWake>;
      }>
    >;
    setPolicy(grantId: string, input: GroupReceptionInput): Promise<GroupReceptionPolicy>;
    threads(): Promise<Array<ThreadReceptionView & { grantId: string; group: string }>>;
    setThread(sourceEventId: string, input: ThreadReceptionInput): Promise<ThreadReceptionPolicy>;
    read(sourceEventId: string): ExternalSource;
    replyCapability?(
      source: ExternalSource,
      signal?: AbortSignal,
    ): ReturnType<OutboundMessaging['replyCapability']>;
    share(
      sourceEventId: string,
      channelId: string,
    ): ReturnType<OutboundMessaging['inbound']['share']>;
    context(
      sourceEventId: string,
      query: ExternalContextQuery,
      signal?: AbortSignal,
    ): Promise<ExternalContextResult>;
    reply(
      sourceEventId: string,
      text: string,
      messageKey?: string,
    ): ReturnType<OutboundMessaging['reply']>;
    saveFile(input: {
      sourceEventId: string;
      attachmentId: string;
      grantId: string;
      destinationPath: string;
      representation?: 'playback';
    }): ReturnType<typeof saveAttachmentFile>;
    replyFile(
      sourceEventId: string,
      fileId: string,
      messageKey?: string,
    ): ReturnType<OutboundMessaging['replyFile']>;
  };
  channels: OrchestratorChannelAccess;
  sourcePolicy?: {
    list(): BotSourcePolicy[];
    setAssignmentReport(wake: 'conditional' | 'immediate'): BotSourcePolicy;
    resetAssignmentReport(): BotSourcePolicy;
    setGroupOrdinary(
      wake: 'immediate' | 'digest' | 'mentions' | 'silent',
      digestCount: number,
      digestIntervalSeconds: number,
    ): BotSourcePolicy;
    resetGroupOrdinary(): BotSourcePolicy;
    setImmediateDelivery(
      sourceClass: 'human-dm' | 'bot-dm' | 'group-mention',
      delivery: 'steer' | 'turn',
    ): BotSourcePolicy;
    resetImmediateDelivery(sourceClass: 'human-dm' | 'bot-dm' | 'group-mention'): BotSourcePolicy;
  };
  assignments: OrchestratorAssignmentAccess;
  schedules?: {
    list(): BotSchedule[];
    create(input: BotScheduleInput): BotSchedule;
    update(id: string, change: BotScheduleChange): BotSchedule;
    remove(id: string): boolean;
  };
  memory?: {
    switchBranch(branch: string): { from: string; to: string; head: string };
    continueFromCommit(sha: string, branch: string): { from: string; to: string; head: string };
  };
}

export interface InterruptedToolCall {
  callId: string;
  name: string;
  arguments: string;
}

export interface AssignmentAgentRun {
  observeTurnTarget?: OrchestratorAgentRun['observeTurnTarget'];
  switchReason?: TurnTargetSwitchReason;
  groupSwitchReason?(): TurnTargetSwitchReason | undefined;
  sessionModel?(): {
    choice: SessionModelChoice | null;
    apply(run: AssignmentAgentRun): AssignmentAgentRun;
    finish(): void;
  };
  beginTurn?(): void;
  acceptNativeInput?: () => boolean;
  setExecutionReady?(ready: boolean): void;
  requireContent?(): void;
  accepted?(): void;
  toolsInterrupted?(calls: InterruptedToolCall[]): void;
  sessionId: string;
  bot: PersonaBotRecord;
  text: string;

  resume?: boolean;
  permission: AssignmentPermissionSnapshot;
  recoveryEntry?(): Pick<AssignmentDetail, 'title' | 'description'> | undefined;
  failEngineRecovery?(summary: string): Promise<AssignmentReport>;
  modelRoute?: ModelRoute;
  routingTarget?: RoutingTarget;
  groupEffort?: string;
  continueInitialGroupTurn?: true;
  continuingFromNativeRoute?: true;
  selectGroupTarget?(
    attempted: ReadonlySet<string>,
    error?: unknown,
  ): Promise<RoutingTarget | undefined>;
  agentPreset?: string;
  report(input: AssignmentReportInput, execution?: { turn: number }): Promise<AssignmentReport>;
  completedTurn?(execution: { turn: number; endSeq: number }): void;
  cancelledTurn?(execution: { turn: number; endSeq: number }): void;
  failedTurn?(execution: { turn: number; endSeq: number }): void;
}

export type AssignmentRequestDelivery =
  | { delivery: 'steer' }
  | { delivery: 'followup'; accepted: Promise<void>; done: Promise<void> };

export interface ChannelMessageView {
  actorNames?: { humans: Record<string, string>; bots: Record<string, string> };
  channelId: string;
  channelName: string;
  message: ChannelMessage;
}

export interface ChannelListInput {
  channelId?: string;
  name?: string;
  type?: 'group' | 'dm';
  memberBotIds?: string[];
  cursor?: string;
  limit?: number;
}

export interface ChannelListEntry {
  id: string;
  name: string;
  type: 'group' | 'dm';
  kind: 'group' | 'human-dm' | 'bot-dm';
  members: Array<{ botId: string; displayName: string; active: boolean }>;
  humanMembers: Array<{ humanId: string; displayName: string }>;
  ownerBotId?: string;
  pendingJoinRequests?: Array<{
    requestId: string;
    requesterBotId: string;
    createdAt: string;
  }>;
}

export interface ChannelListPage {
  channels: ChannelListEntry[];
  nextCursor?: string;
}

export type ChannelQueryInput = ChannelMessageQueryOptions & {
  channelId?: string;
  scope?: 'channel' | 'joined';
  call?: string;
  fromMs?: number;
  toMs?: number;
};

export interface ChannelQueryPage {
  messages: ChannelMessageView[];
  nextCursor?: string;
  call?: ChannelCallWindow;
}

export interface BotCreateInput {
  displayName: string;
  description?: string;
  tags?: string[];
  avatarPath?: string;
  soul?: string;
  coreMemory?: string;
  memoryLocation?: string;
}

export interface BotCreateOutcome {
  botId: string;
  displayName: string;
  dmChannelId: string;
  memoryDir: string;
  model: 'host-default' | 'set';
}

export const NEW_BOT_ID_PLACEHOLDER = '<new-bot-id>';
export const MAX_CREATED_BOT_NAME_LENGTH = 60;
export const MAX_CREATED_BOT_TAGS = 8;
export const MAX_CREATED_BOT_TAG_LENGTH = 32;
export const MAX_CREATED_BOT_BIO_LENGTH = 160;

export interface OrchestratorChannelAccess extends ChannelFileAccess, VoiceChannelAccess {
  startHumanDm?(humanId: string): ChannelRecord;
  replySource?(sourceEventId: string): { channelId: string; messageId: string };
  list(input?: ChannelListInput): ChannelListPage;
  read(input?: {
    channelId?: string;
    before?: string;
    limit?: number;
    observe?: false;
  }): ChannelMessageView[];

  ignore(input: { channelId?: string; messageId: string }): {
    sourceEventId: string;
    ignoredAt: string;
    alreadyIgnored: boolean;
  };
  query(input?: ChannelQueryInput): ChannelQueryPage;
  readModel(input?: ChannelQueryInput & { messageId?: string; contentCursor?: string }): string;
  requestGrant(reason: string, channelId?: string): Promise<ChannelMessage>;
  contacts(input?: BotContactQuery): Promise<BotContactPage>;
  createGroup(name: string): ChannelRecord;
  inviteGroup(input: { channelId: string; targetBotSlug: string }): GroupInvitation;
  requestGroupJoin?(input: { channelId: string }): GroupJoinRequest;
  decideGroupJoin?(input: { channelId: string; requestId: string; accept: boolean }): {
    channel: ChannelRecord;
    request: GroupJoinRequest;
  };
  respondToGroupInvite(input: { invitationId: string; accept: boolean }): {
    channel: ChannelRecord;
    invitation: GroupInvitation;
  };
  renameGroup(input: { channelId: string; name: string }): ChannelRecord;
  removeGroupMember(input: { channelId: string; botSlug: string }): ChannelRecord;
  readGroupWakePolicy(channelId: string): GroupWakePolicyView;
  setGroupWakePolicy(input: {
    channelId: string;
    mode: 'all' | 'digest' | 'mentions' | 'silent';
    count: number;
    intervalSeconds: number;
  }): GroupWakePolicyView;
  leaveGroup(input: { channelId: string }): {
    channelId: string;
    left: boolean;
  };
  react?(input: BotReactionInput & { channelId?: string }): BotReactionResult;
  sendToBot(input: {
    botSlug: string;
    body: string;
    replyTo?: string;
    deliveryKey?: string;
  }): Promise<{ channelId: string; message: ChannelMessage }>;
  createBot?(input: BotCreateInput): BotCreateOutcome;
  inspectDrafts?(input: {
    channelId: string;
    draftId?: string;
  }):
    | import('../channels/send-review.js').DraftInspection
    | import('../channels/send-review.js').SendReviewOutcome;
  dropDraft?(input: {
    channelId: string;
    draftId: string;
    observationId?: string;
    yieldToMessageIds?: string[];
  }): import('../channels/send-review.js').SendReviewOutcome;
  send(input: {
    genui?: import('../channels/genui.js').GenuiContent;
    sessionLinks?: import('../channels/channel.js').ChannelSessionLink[];
    replySourceEventId?: string;
    observationId?: string;
    draftId?: string;
    freshnessOverride?: import('../channels/send-review.js').FreshnessOverride;
    recover?: boolean;
    body: string;
    channelId?: string;
    replyTo?: string;
    quotes?: ChannelQuote[];
    attachments?: ChannelAttachmentRef[];
    mentionBotIds?: string[];
    mentionHumanIds?: string[];
    deliveryKey?: string;
  }): Promise<ChannelMessage>;
  linkSessions?(input: {
    messageId: string;
    links: Array<import('../channels/channel.js').ChannelSessionLink & { createdAt?: string }>;
  }): ChannelMessage;
}

export interface BotReactionInput {
  messageId: string;
  emoji: string;
  active: boolean;
}

export interface BotReactionResult {
  channelId: string;
  messageId: string;
  reactions: ChannelReaction[];
}

export interface OrchestratorServiceTurn {
  replyTargets?: () => readonly TurnTargetSegment[];
  modelContent?: string;
  sessionId: string;
  channelId: string | undefined;
  sourceEventId: string | undefined;
  markSideEffect: () => void;
  readAdmissions: Set<string>;
  importedFiles: Map<string, ChannelAttachmentRef>;
  turnSources: ReadonlySet<string>;
  observeMemory: boolean;
  observeReads: boolean;
}

export interface DirectBotToolSpec {
  name: string;
  description: string;
  inputSchema: unknown;
}

export interface DirectBotToolCall {
  callId: string;
  tool: string;
  args: Record<string, unknown>;
  at: string;
  durationMs: number;
  outcome: 'ok' | 'error';
  result: string;
}

const DIRECT_TOOL_CALL_LIMIT = 50;

export class DirectBotToolError extends HarnessError {
  constructor(code: string, message: string) {
    super(message, code);
    this.name = 'DirectBotToolError';
  }
}

export interface BotAgentAdapter {
  runsOnEngine?(botSlug: string): boolean;
  captureNativeOrchestratorModel?(sessionId: string, bot: PersonaBotRecord): void;
  runOrchestrator(run: OrchestratorAgentRun): Promise<void>;
  loadOrchestrator?(run: OrchestratorAgentRun): Promise<void>;

  steerOrchestrator?(
    botSlug: string,
    text: string,
    requireAccess?: () => void,
  ): boolean | Promise<boolean>;
  stopOrchestratorTurn?(botSlug: string): string | undefined;
  runAssignment(run: AssignmentAgentRun): Promise<void>;
  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery;
  stopAssignment?(sessionId: string): Promise<void>;
  stopBot?(botSlug: string, sessionIds: string[]): Promise<void>;
  abandonSession?(sessionId: string): Promise<void>;
  releaseSession?(sessionId: string): Promise<void>;
  directTools?(): DirectBotToolSpec[];
  runDirectTool?(
    run: OrchestratorAgentRun,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    parentSessionId?: string,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export interface HandleDmMessageInput {
  channelId: string;
  messageId: string;
  body: string;
}

export type DmAdmissionFailure =
  | 'runtime-closed'
  | 'unknown-channel'
  | 'not-dm'
  | 'unknown-bot'
  | 'archived-bot'
  | 'blank-body'
  | 'cli-request-expired';

export type OrchestratorMessageOutcome =
  | { delivered: true; sourceEventId: string; settled: Promise<void> }
  | {
      delivered: false;
      reason: DmAdmissionFailure | 'not-current-orchestrator';
    };

export type DmMessageAdmission =
  | { admitted: true; settled: Promise<void> }
  | { admitted: false; reason: DmAdmissionFailure };

export interface TobCliRequestLease {
  humanId: string;
  botSlug: string;
  controller: AbortController;
  status: TobCliStatus;
  finishedAt: number | undefined;
}

export interface TobCliAuthority {
  (): void;

  markSideEffect(): void;
}

type NativeOrchestratorRefusal =
  | 'runtime-closed'
  | 'aborted'
  | 'bot-missing'
  | 'bot-paused'
  | 'no-current-orchestrator'
  | 'not-current-orchestrator'
  | 'no-native-sender'
  | 'foreign-sender'
  | 'run-not-ready';

export interface BotRuntime {
  networkBotAvailability?(
    hostId: string,
    botSlug: string,
  ): import('./bot-network.js').NetworkBotAvailability;
  refreshBotContacts?(): Promise<void>;
  botContacts?(botSlug: string, query?: BotContactQuery): BotContactPage;
  groupSendReview?: GroupSendReview;
  botCreatePreview?(botSlug: string, args: unknown): BotCreatePreview | undefined;
  captureTobCliAuthority?(sessionId: string): TobCliAuthority;
  canRequestPrivateInput?(sessionId: string, sourceEventId?: string): boolean;
  askChannel?(sessionId: string): string | undefined;
  toolApprovalOrigin?(query: ToolApprovalOriginQuery): ToolApprovalOrigin | undefined;
  hasDirectToolInvocation?(query: ToolApprovalOriginQuery): boolean;
  bindPrivateInputOrigin?(
    sessionId: string,
    sourceEventId?: string,
  ): PrivateInputOrigin | undefined;
  beginAssignmentApprovalWait?(
    sessionId: string,
    callId: string,
    signal: AbortSignal,
  ): AssignmentApprovalWaitLease | undefined;
  assignmentApprovalWait?(sessionId: string, callId: string): AssignmentExecutionWait | undefined;
  ensureAssignmentCapacity?(sessionId: string, signal: AbortSignal): Promise<void>;
  runAssignmentTool?<T>(
    sessionId: string,
    callId: string,
    token: symbol,
    signal: AbortSignal,
    body: () => Promise<T>,
  ): Promise<T>;
  settleAssignmentTool?(sessionId: string, callId: string): void;
  bindNativeQuestionInput?(
    sessionId: string,
    channelId: string,
    question?: { messageId: string; callId: string },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined;
  recoverNativeQuestionInput?(
    sessionId: string,
    channelId: string,
    requestMessageId: string,
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined;
  nativeQuestionAvailable?(sessionId: string, channelId: string): boolean;
  captureNativeOrchestratorModel?(sessionId: string): void;
  prepareNativeOrchestratorStep?(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean>;
  originalAttachmentRoot?(
    sessionId: string,
    path: string,
    kind: 'read' | 'write',
    shell?: boolean,
  ): string | undefined;
  reconcileMemoryChangesOnStartup?(): void;
  retryDmMessage?(channelId: string, messageId: string, human?: HumanContext): Promise<void>;
  recoverDmMessage?(
    input: {
      channelId: string;
      failureMessageId: string;
      action: SessionRecoveryAction;
      compact(sessionId: string): Promise<boolean>;
    },
    human?: HumanContext,
  ): Promise<void>;
  compactOrchestrator?<T>(botSlug: string, compact: (sessionId: string) => Promise<T>): Promise<T>;
  admitDmMessage(human: HumanContext, input: HandleDmMessageInput): DmMessageAdmission;
  sendOrchestratorMessage?(
    human: HumanContext,
    input: { botSlug: string; sessionId: string; text: string },
  ): OrchestratorMessageOutcome;

  admitGroupMessage(channelId: string, messageId: string): void;

  retryGroupMessageAdmission?(channelId: string, messageId: string): void;

  admitBotDmMessage(channelId: string, messageId: string): void;
  withdrawNetworkMembership(hostId: string): Promise<void>;

  admitGroupInvitation(targetDmChannelId: string, invitationId: string): void;
  admitGroupJoinRequest?(ownerDmChannelId: string, requestId: string): void;
  admitGroupJoinDecision?(requesterDmChannelId: string, requestId: string): void;
  listAssignments(botSlug: string): AssignmentSummary[];
  latestAssignmentActivity?(): ReadonlyMap<string, number>;
  assignmentEngineAccountUses?(accountId: string): string[];
  currentOrchestratorSessionId?(botSlug: string): string | undefined;
  currentTurnTarget?(botSlug: string): TurnTarget | undefined;
  activeSessionModel?(sessionId: string): SessionModelChoice | null | undefined;
  sessionTurnTarget?(sessionId: string): TurnTarget | undefined;
  sessionTurnTargets?(sessionId: string): TurnTargetSegment[];
  replaceOrchestrator?<T>(botSlug: string, body: () => T): Promise<OrchestratorReplacement<T>>;
  startFreshOrchestrator?(botSlug: string, assertCurrent?: () => void): Promise<'started' | 'busy'>;
  turnRunning?(botSlug: string): boolean;
  hasPendingInbox?(botSlug: string): boolean;
  tobCli?(human: HumanContext, input: TobCliRequest): Promise<TobCliStatus>;
  directBotTools?(): DirectBotToolSpec[];
  directBotToolCalls?(botSlug: string): readonly DirectBotToolCall[];
  runDirectBotTool?(
    botSlug: string,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    parentSessionId?: string,
    sourceEventId?: string,
    human?: HumanContext,
  ): Promise<{ tool: string; sessionId: 'direct'; result: unknown }>;
  triageOpenCount?(botSlug: string): number | undefined;
  listChannelAssignments?(channelId: string): ChannelAssignmentSummary[];
  getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined;
  setAssignmentArchived?(
    botSlug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<AssignmentArchiveOutcome | { outcome: 'unarchived'; assignment: AssignmentSummary }>;

  admitExternalSource?(botSlug: string, sourceEventId: string): void;
  admitScheduleFiring?(botSlug: string): void;
  resumePendingDigests?(botSlug: string): void;

  stopBot?(botSlug: string): Promise<void>;
  stopSession?(botSlug: string, sessionId: string): Promise<SessionStopOutcome>;
  stopAllSessions?(botSlug: string): Promise<BotStopOutcome>;
  stopTurn?(
    botSlug: string,
    scope?: { autoContinueFor: string; channelId: string },
  ): Promise<{ sessionId: string } | undefined>;
  heldCause?(botSlug: string): BotHoldCause | undefined;
  releaseQuotaHold?(botSlug: string): boolean;
  endGroup?(channelId: string): Promise<void>;
  whenIdle(): Promise<void>;
  close(): Promise<void>;
}

export interface BotRuntimeOptions {
  team?: TeamService;
  readTurnProgress?: (sessionId: string) => Promise<SessionFailureProgress | undefined>;
  autoContinueDelaysMs?: readonly number[];
  stopSettleTimeoutMs?: number;
  closeSessionApprovals?: (sessionIds: readonly string[]) => void;
  botNetwork?: import('./bot-network.js').BotNetworkPort;
  onTobDelegation?: () => void;
  promptText?: (botSlug: string) => PromptText;
  promptLimits?: (botSlug: string) => PromptLimits;
  tob?: TobService;
  inboxHistory?: InboxHistoryQuery;
  triageContinuation?: boolean;
  messagePerf?: MessagePerfTracker;
  requireModelRoute?: (botSlug: string, route: ModelRoute) => void;
  requireAssignmentEngine?: (
    botSlug: string,
    target: Extract<RoutingTarget, { kind: 'engine' }>,
  ) => void;
  requireExecution?: (botSlug: string) => void;
  routeRests?: Pick<RouteRests, 'restingUntil'>;
  inheritedModelPlan?: () => PersonaBotModelPlan | undefined;
  groupFallback?: Pick<
    GroupFallback,
    'choose' | 'start' | 'pick' | 'inherited' | 'inheritedEffort'
  > &
    Partial<Pick<GroupFallback, 'pickMixedOrchestrator' | 'pickMixedAssignment' | 'isMixed'>>;
  sessionRoute?: (botSlug: string, sessionId: string) => ModelRoute | undefined;
  engineFallback?: (botSlug: string, limit: EngineLimitError) => ModelSwitch | undefined;
  beginAssignmentWait?: (botSlug: string, orchestratorSessionId: string) => () => void;
  externalMessaging?: OutboundMessaging;
  database: OperationalDatabaseOwner;
  sourcePolicy?: BotSourcePolicyStore;
  schedules?: Pick<BotScheduleStore, 'list' | 'create' | 'update' | 'remove'>;
  registry: PersonaBotRegistry;
  channels: ChannelStore;
  agents: BotAgentAdapter;
  memory?: Pick<
    MemoryService,
    'prepareTurn' | 'reconcileTurn' | 'abortTurn' | 'switchBranch' | 'continueFromCommit'
  > &
    Partial<
      Pick<
        MemoryService,
        | 'scanChanges'
        | 'scanChangesAsync'
        | 'preparedObservation'
        | 'pendingCommits'
        | 'advanceCommitCursor'
        | 'prepareTurnAsync'
        | 'reconcileTurnAsync'
        | 'abortTurnAsync'
        | 'pendingCommitsAsync'
      >
    >;
  attachments?: AttachmentStore;
  voiceMessages?: import('../voice/messages.js').VoiceMessages;
  callFrames?: CallFrameAccess;

  ownership?: SessionOwnership;

  grants?: WorkspaceGrantStore;
  assignmentAccess?: AssignmentAccessStore;

  saveReportSpill?: (input: {
    sessionId: string;
    content: string;
  }) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;

  readAssignmentTail?: (sessionId: string) => Promise<AssignmentEventTail>;
  readAssignmentReportPage?: (
    sessionId: string,
    acceptedSummary: string,
    offset: number,
    content?: AssignmentReportContent,
  ) => Promise<AssignmentReportPage>;

  workspaceRoot?: string;

  orchestratorCwd?: (bot: PersonaBotRecord) => string | undefined;

  sessionArchived?: (sessionId: string) => boolean;

  assignmentConcurrencyLimit?: number | (() => number);

  botHopLimit?: () => number;

  sessionArchive?: () => NativeSessionArchive | undefined;

  warn?: (message: string) => void;
  now?: () => Date;
  createSessionId?: () => string;
  createEventId?: () => string;
  createMessageId?: () => string;
  createBotId?: () => string;
}

export interface InboxReportRow {
  source_event_id: string;
  source_kind:
    | 'assignment-report'
    | 'assignment-lifecycle'
    | 'memory-change'
    | 'bridge-message'
    | 'schedule';
  external?: ExternalSource;
  schedule_json?: string | null;
  assignment_session_id: string | null;
  body: string;
  created_at: string;
  expects_reply: number;
  open_ask_id?: string | null;
  open_ask_summary?: string | null;
  continuity_key: string | null;
  activity: AssignmentActivity | null;
  paired_report_id?: string | null;
  lifecycle_cause?: string | null;
}

export interface GroupPromptBudget {
  remainingCharacters: number;
  includedByChannel: Map<string, number>;
}

const GROUP_PROMPT_CHANNEL_LIMIT = 100;

export type SourceEventAttemptState =
  | 'pending'
  | 'running'
  | 'retryable'
  | 'needs-repair'
  | 'handled';

interface SourceEventRow {
  source_event_id: string;
  bot_slug: string;
  body: string;
  handled_at: string | null;
  attempt_state: SourceEventAttemptState;
}

export interface SourceEventClaim {
  sourceEventId: string;
  shouldRun: boolean;
  reconciliationRequired?: true;
}

function permissionFromRow(row: AssignmentRow): AssignmentPermissionSnapshot | undefined {
  if (
    row.grant_id === null ||
    row.workspace_id === null ||
    row.primary_cwd === null ||
    (row.permission_mode !== 'workspace-write' && row.permission_mode !== 'danger-full-access') ||
    row.approval_policy !== 'ask' ||
    row.preset_revision === null
  )
    return undefined;
  return {
    grantId: row.grant_id,
    workspaceId: row.workspace_id,
    primaryCwd: row.primary_cwd,
    mode: row.permission_mode,
    approval: row.approval_policy,
    presetRevision: row.preset_revision,
  };
}

function storedAssignmentTarget(row: AssignmentRow): RoutingTarget | ModelRoute | undefined {
  if (row.model_route_json === null) return undefined;
  const target: unknown = JSON.parse(row.model_route_json);
  if (isModelRoute(target)) return target;
  if (
    typeof target === 'object' &&
    target !== null &&
    'kind' in target &&
    target.kind === 'route' &&
    'route' in target &&
    isModelRoute(target.route)
  )
    return { kind: 'route', route: target.route };
  if (isPresetSubEngineSelection(target)) {
    const effort = 'reasoningEffort' in target ? target.reasoningEffort : undefined;
    if (effort === undefined) return presetSubEngineTarget(target);
    if (typeof effort === 'string' && effort.trim() !== '')
      return presetSubEngineTarget({ ...target, effort });
  }
  throw new Error(`Invalid Assignment model route: ${row.session_id}`);
}

function assignmentTargetFromRow(row: AssignmentRow): RoutingTarget | undefined {
  const target = storedAssignmentTarget(row);
  return target === undefined || 'kind' in target ? target : { kind: 'route', route: target };
}

function modelRouteFromRow(row: AssignmentRow): ModelRoute | undefined {
  const target = assignmentTargetFromRow(row);
  return target?.kind === 'route' ? target.route : undefined;
}

function saveAssignmentTarget(target: RoutingTarget): string {
  return JSON.stringify(target.kind === 'route' ? target.route : target);
}

function assignmentFromRow(row: AssignmentRow): AssignmentDetail {
  const latestReport =
    row.latest_report_state === null ||
    row.latest_report_summary === null ||
    row.latest_report_at === null
      ? undefined
      : {
          state: row.latest_report_state,
          summary: row.latest_report_summary,
          at: row.latest_report_at,
        };
  const openAsk =
    row.open_ask_source_event_id === null || row.open_ask_at === null
      ? undefined
      : {
          sourceEventId: row.open_ask_source_event_id,
          summary: row.open_ask_summary ?? row.latest_report_summary ?? '',
          at: row.open_ask_at,
        };
  return {
    sessionId: row.session_id,
    sourceEventId: row.source_event_id,
    botSlug: row.bot_slug,
    title: row.title,
    description: row.description,
    activity:
      row.stop_state === 'requested'
        ? 'stopping'
        : row.stop_state === 'stopped'
          ? 'stopped'
          : row.activity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(latestReport === undefined ? {} : { latestReport }),
    ...(row.continuity_key === null ? {} : { continuityKey: row.continuity_key }),
    ...(openAsk === undefined ? {} : { openAsk }),
    ...(permissionFromRow(row) === undefined ? {} : { permission: permissionFromRow(row)! }),
    ...(modelRouteFromRow(row) === undefined ? {} : { modelRoute: modelRouteFromRow(row)! }),
    ...(typeof row.model_group_id === 'string' ? { modelGroupId: row.model_group_id } : {}),
    ...(typeof row.model_effort === 'string' ? { modelGroupEffort: row.model_effort } : {}),
    ...(typeof row.agent_preset === 'string' ? { agentPreset: row.agent_preset } : {}),
    ...(isArchivedRow(row) ? { archivedAt: row.archived_at } : {}),
  };
}

function isArchivedRow(row: AssignmentRow): row is AssignmentRow & { archived_at: string } {
  return typeof row.archived_at === 'string';
}

export const DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT = 8;
const ASSIGNMENT_DIRECTORY_DEFAULT_LIMIT = 20;
const ASSIGNMENT_DIRECTORY_MAX_LIMIT = 50;
const ASSIGNMENT_ACTIVITIES: readonly AssignmentActivity[] = [
  'working',
  'idle',
  'error',
  'stopping',
  'stopped',
];

function encodeDirectoryCursor(assignment: AssignmentSummary): string {
  return Buffer.from(
    JSON.stringify({ u: assignment.updatedAt, s: assignment.sessionId }),
    'utf8',
  ).toString('base64url');
}

function decodeDirectoryCursor(cursor: string): {
  updatedAt: string;
  sessionId: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    parsed = undefined;
  }
  const fields = parsed as { u?: unknown; s?: unknown } | null | undefined;
  if (typeof fields?.u !== 'string' || typeof fields.s !== 'string')
    throw new Error('Invalid Assignment Directory cursor; restart from the first page');
  return { updatedAt: fields.u, sessionId: fields.s };
}

export function queryAssignmentDirectory(
  assignments: readonly AssignmentSummary[],
  input: AssignmentDirectoryQuery,
): AssignmentDirectoryPage {
  const limit = input.limit ?? ASSIGNMENT_DIRECTORY_DEFAULT_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > ASSIGNMENT_DIRECTORY_MAX_LIMIT)
    throw new Error(
      `Assignment Directory limit must be an integer from 1 to ${ASSIGNMENT_DIRECTORY_MAX_LIMIT}`,
    );
  const activity = input.activity === undefined ? undefined : new Set(input.activity);
  for (const value of activity ?? [])
    if (!ASSIGNMENT_ACTIVITIES.includes(value))
      throw new Error(`Unknown Assignment activity filter: ${String(value)}`);
  const text = input.query?.trim().toLocaleLowerCase();
  const after = input.cursor === undefined ? undefined : decodeDirectoryCursor(input.cursor);
  const matches = assignments.filter((assignment) => {
    if (input.includeArchived !== true && assignment.archivedAt !== undefined) return false;
    if (activity !== undefined && !activity.has(assignment.activity)) return false;
    if (text !== undefined && text !== '') {
      const haystack = [
        assignment.title,
        assignment.description,
        assignment.continuityKey ?? '',
        assignment.latestReport?.summary ?? '',
      ]
        .join('\n')
        .toLocaleLowerCase();
      if (!haystack.includes(text)) return false;
    }
    if (after !== undefined)
      return (
        assignment.updatedAt < after.updatedAt ||
        (assignment.updatedAt === after.updatedAt && assignment.sessionId > after.sessionId)
      );
    return true;
  });
  const ordered = [...matches].sort((left, right) =>
    left.updatedAt === right.updatedAt
      ? left.sessionId < right.sessionId
        ? -1
        : left.sessionId > right.sessionId
          ? 1
          : 0
      : left.updatedAt < right.updatedAt
        ? 1
        : -1,
  );
  const page = ordered.slice(0, limit);
  const last = page.at(-1);
  return {
    assignments: page,
    ...(ordered.length > limit && last !== undefined
      ? { nextCursor: encodeDirectoryCursor(last) }
      : {}),
  };
}

function onlyPairedLifecycle(unit: InboxUnit): boolean {
  return (
    unit.sourceKind === 'assignment-lifecycle' &&
    (unit.lifecycleNotices ?? []).length > 0 &&
    (unit.lifecycleNotices ?? []).every((notice) => notice.reportSourceEventId !== undefined)
  );
}

function keptLifecycleNotice(
  row: InboxReportRow,
): NonNullable<InboxUnit['lifecycleNotices']>[number] | undefined {
  if (row.source_kind !== 'assignment-lifecycle') return undefined;
  if (row.paired_report_id != null)
    return {
      sourceEventId: row.source_event_id,
      reportSourceEventId: row.paired_report_id,
      summary: row.body,
    };
  if (row.lifecycle_cause?.startsWith('direct-') === true)
    return { sourceEventId: row.source_event_id, summary: row.body };
  return undefined;
}

function coalesceInbox(rows: InboxReportRow[]): InboxUnit[] {
  const units = new Map<string, InboxUnit>();
  for (const row of rows) {
    const key = row.assignment_session_id ?? row.source_event_id;
    const existing = units.get(key);
    const kept = keptLifecycleNotice(row);
    if (kept !== undefined && existing !== undefined) {
      (existing.lifecycleNotices ??= []).push(kept);
      existing.repeats += 1;
      continue;
    }
    if (existing === undefined) {
      units.set(key, {
        sourceEventId: row.source_event_id,
        sourceKind: row.source_kind,
        ...(row.external === undefined ? {} : { external: row.external }),
        ...scheduleInboxFacts(row.schedule_json),
        assignmentSessionId: row.assignment_session_id,
        summary: row.body,
        createdAt: row.created_at,
        openAskId: row.open_ask_id ?? null,
        openAskSummary: row.open_ask_summary ?? null,
        continuityKey: row.continuity_key,
        activity: row.activity,
        repeats: 1,
        ...(kept === undefined ? {} : { lifecycleNotices: [kept] }),
      });
      continue;
    }
    existing.sourceEventId = row.source_event_id;
    existing.sourceKind = row.source_kind;
    existing.summary = row.body;
    existing.createdAt = row.created_at;
    existing.openAskId = row.open_ask_id ?? null;
    existing.openAskSummary = row.open_ask_summary ?? null;
    existing.activity = row.activity;
    existing.repeats += 1;
  }
  return [...units.values()];
}

function requireBoundedText(value: unknown, field: string, maxLength: number): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized === '')
    throw new TypeError(`create_assignment: ${field} is required and must not be blank`);
  if ([...normalized].length > maxLength)
    throw new TypeError(
      `create_assignment: ${field} must be at most ${maxLength} characters; keep it short`,
    );
  return normalized;
}

function sessionFailureDetails(error: unknown): {
  code?: string;
  status?: number;
  detail: string;
} {
  const raw = error instanceof Error ? error.message : String(error);
  const clean = Array.from(raw, (character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 || code === 127 ? ' ' : character;
  })
    .join('')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, 600);
  const match = /^([A-Z][A-Z0-9_-]{1,31}):\s*(.+)$/u.exec(clean);
  const detail = (match?.[2] ?? clean) || 'Unknown session error';
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? (error as { status?: unknown }).status
      : undefined;
  return {
    ...(typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? { code: error.code }
      : match === null
        ? {}
        : { code: match[1] }),
    ...(typeof status === 'number' ? { status } : {}),
    detail,
  };
}

const CONTEXT_WINDOW_EXCEEDED_NOTICE =
  "This conversation's context is full and automatic compaction could not recover it. Retry with a smaller request, for example ask for one part of a large file or command output instead of all of it.";

function sessionFailureBody(details: { code?: string; detail: string }): string {
  if (details.code === 'CONTEXT_WINDOW_EXCEEDED')
    return `Session failed: CONTEXT_WINDOW_EXCEEDED: ${CONTEXT_WINDOW_EXCEEDED_NOTICE}`;
  return `Session failed: ${details.code === undefined ? '' : details.code + ': '}${details.detail}`;
}

const TRANSIENT_FAILURE_CODES = new Set([
  'TRANSPORT',
  'TIMEOUT',
  'SERVER',
  'RATE_LIMIT',
  'EMPTY_RESPONSE',
]);
const AUTO_CONTINUE_DELAYS_MS: readonly number[] = [60_000, 180_000];
const FAILURE_HOLD_THRESHOLD = 3;

export type BotHoldCause = 'human-stop' | 'failures' | 'quota';

export interface StoppedSessionRef {
  botSlug: string;
  sessionId: string;
  role: 'orchestrator' | 'assignment';
}

export interface BotStopOutcome {
  stopped: StoppedSessionRef[];
  alreadyIdle: StoppedSessionRef[];
}

export type SessionStopOutcome =
  | ({ outcome: 'settled' } & BotStopOutcome)
  | { outcome: 'refused'; code: 'unknown-session'; message: string };

const STOP_SETTLE_TIMEOUT_MS = 30_000;

const SESSION_STOPPED_REFUSAL =
  'The Human stopped this Session. This action was not performed; wait for the Human before doing more.';

const ASSIGNMENT_FALLBACK_NOTE =
  'The previous model stopped before finishing this Turn (out of quota or unavailable). The Host moved this Session to the next model in its Routing Group. Continue the work from where it stopped.';

const ASSIGNMENT_MODEL_CHANGE_NOTE =
  'Continue the work from where it stopped, using the selected model.';

const sameModelRoute = (left: ModelRoute, right: ModelRoute) =>
  left.provider === right.provider &&
  left.model === right.model &&
  (left.reasoningEffort ?? '') === (right.reasoningEffort ?? '');

const ASSIGNMENT_RECOVERY_NOTE =
  '[Host: your previous Turn in this Session did not finish cleanly (it ended with an error, was cancelled, or was interrupted by a Host restart). Your context is intact. Check the current state of your workspace and any side effects before redoing work, and do not repeat a side effect blindly; an earlier request may already have reached you.]\n\n';

const DIRECT_ASSIGNMENT_TOOLS: ReadonlySet<string> = new Set([
  'create_assignment',
  'send_assignment_request',
  'unarchive_assignment',
]);

const HUMAN_SESSION_STOP_NOTICE =
  'The Human stopped this Assignment; it is now a Stopped Session with its history kept. Do not resend its old work just because it stopped. When a later request fits it, send_assignment_request to this Session id wakes it and delivers the request.';

const HUMAN_TURN_STOP_NOTICE =
  'Stopped by the Human together with your turn; it is now a Stopped Session with its history kept. Do not resend its old work just because it stopped. When a later request fits it, send_assignment_request to this Session id wakes it and delivers the request.';

const ORCHESTRATOR_STOP_NOTICE =
  'Stopped by the Orchestrator; it is now a Stopped Session with its history kept. When a later request fits it, send_assignment_request to this Session id wakes it and delivers the request.';

class BotRuntimeImplementation implements BotRuntime {
  readonly #requireModelRoute: BotRuntimeOptions['requireModelRoute'];
  readonly #requireAssignmentEngine: BotRuntimeOptions['requireAssignmentEngine'];
  readonly #requireExecution: BotRuntimeOptions['requireExecution'];
  readonly #routeRests: BotRuntimeOptions['routeRests'];
  readonly #inheritedModelPlan: BotRuntimeOptions['inheritedModelPlan'];
  readonly #groupFallback: BotRuntimeOptions['groupFallback'];
  readonly #sessionRoute: BotRuntimeOptions['sessionRoute'];
  readonly #engineFallback: BotRuntimeOptions['engineFallback'];
  readonly #team: TeamService | undefined;
  readonly #externalMessaging: OutboundMessaging | undefined;
  readonly #database: OperationalDatabaseModulePort;
  readonly #sessionModels: ReturnType<typeof sessionModelChoices>;
  readonly #activeSessionModels = new Map<string, SessionModelChoice | null>();
  readonly #ownership: SessionOwnership;
  readonly #grants: WorkspaceGrantStore | undefined;
  readonly #assignmentAccessPresetStore: AssignmentAccessStore | undefined;
  readonly #workspaceRoot: string | undefined;
  readonly #orchestratorCwd: ((bot: PersonaBotRecord) => string | undefined) | undefined;
  readonly #registry: PersonaBotRegistry;
  readonly #botNetwork: import('./bot-network.js').BotNetworkPort | undefined;
  readonly #createBotId: () => string;
  readonly #channels: ChannelStore;
  readonly groupSendReview: GroupSendReview;
  readonly #inboxHistory: InboxHistoryQuery;
  readonly #inboxTriage: InboxTriage;
  readonly #sourcePolicy: BotSourcePolicyStore;
  readonly #schedules: BotRuntimeOptions['schedules'];
  readonly #agents: BotAgentAdapter;
  readonly #memory: BotRuntimeOptions['memory'];
  readonly #attachments: AttachmentStore | undefined;
  readonly #voiceMessages: import('../voice/messages.js').VoiceMessages | undefined;
  readonly #callFrames: BotRuntimeOptions['callFrames'];
  readonly #originalAttachments = new OriginalAttachmentAccess((fileId) =>
    this.#channels.recordAttachmentChange?.(fileId),
  );
  readonly #saveReportSpill: BotRuntimeOptions['saveReportSpill'];
  readonly #readAssignmentTail: BotRuntimeOptions['readAssignmentTail'];
  readonly #messagePerf: MessagePerfTracker | undefined;
  readonly #now: () => Date;
  readonly #promptText: (botSlug: string) => PromptText;
  readonly #promptLimits: (botSlug: string) => PromptLimits;
  readonly #createSessionId: () => string;
  readonly #sessionArchived: ((sessionId: string) => boolean) | undefined;
  readonly #createEventId: () => string;
  readonly #createMessageId: () => string;
  readonly #assignmentConcurrencyLimit: () => number;
  readonly #botHopLimit: () => number;
  readonly #sessionArchive: (() => NativeSessionArchive | undefined) | undefined;
  readonly #approvalCapacity: AssignmentApprovalCapacity;
  readonly #warn: ((message: string) => void) | undefined;
  readonly #triageContinuation: boolean;
  readonly #quoteBlocks = new Map<string, { channelId: string; message: ChannelMessage }>();
  readonly #tails = new Map<string, Promise<unknown>>();
  readonly #activeTurns = new Map<string, Promise<void>>();
  readonly #nativeStepReady = new Map<string, (accepted: boolean) => void>();
  readonly #preparedOrchestrators = new Set<string>();
  readonly #preparedAssignments = new Set<string>();
  readonly #groupContinuations = new Map<string, { error?: unknown; refreshing: boolean }>();
  readonly #nativeAssignmentSteps = new Map<
    string,
    { step: Promise<boolean>; signal: AbortSignal }
  >();
  readonly #stoppedTurns = new Set<string>();
  readonly #switchingRoutingGroups = new Set<string>();
  readonly #stopNotices = new Map<string, string>();
  readonly #held = new Map<string, BotHoldCause>();
  readonly #failureStreaks = new Map<string, number>();
  readonly #typingTurns = new Map<string, MessagingProcessing>();
  readonly #typingAssignments = new Map<string, MessagingProcessing>();
  readonly #turnSources = new Map<
    string,
    {
      sessionId: string;
      eventIds: Set<string>;
      acceptedEventIds: Set<string>;
      inboundChannelId: string | undefined;
      steeredChannelIds: Set<string>;
      memoryObservation: 'source-event' | 'recovered-question';
    }
  >();
  readonly #memoryTurnOperations = new Set<string>();
  readonly #memoryEvents: ReturnType<typeof createMemoryEvents>;
  readonly #activeMemoryEvents = new Map<
    string,
    { eventIds: string[]; preserveObservation: boolean }
  >();
  readonly #steerSettlements = new Set<Promise<void>>();
  readonly #pendingHarvests = new Set<string>();
  readonly #digestTimers = new Map<string, NodeJS.Timeout>();
  readonly #completionDigestTimers = new Map<string, NodeJS.Timeout>();
  readonly #snoozeTimers = new Map<string, NodeJS.Timeout>();
  readonly #autoContinues = new Map<string, PendingAutoContinue>();
  readonly #readTurnProgress: BotRuntimeOptions['readTurnProgress'];
  readonly #autoContinueDelaysMs: readonly number[];
  readonly #stopSettleTimeoutMs: number;
  readonly #closeSessionApprovals: BotRuntimeOptions['closeSessionApprovals'];
  readonly #interruptedTools = new Map<string, InterruptedToolCall[]>();
  readonly #pendingDeliveries = new Map<string, string>();
  readonly #triageQueued = new Set<string>();
  readonly #triageRunning = new Map<string, number>();
  readonly #triageBaseline = new Map<string, number>();
  readonly #triageStalled = new Map<string, Set<string>>();
  readonly #groupAdmissionRetries = new Map<string, NodeJS.Timeout>();
  readonly #digestRetryAt = new Map<string, number>();
  readonly #digestFailureCount = new Map<string, number>();
  readonly #inboxFactoryRetries = new Map<string, { attempts: number; timer?: NodeJS.Timeout }>();
  readonly #assignmentRuns = new Map<string, Promise<void>>();
  readonly #assignmentAcceptances = new Set<string>();
  readonly #assignmentArchives = new Set<string>();
  readonly #assignmentNotices = new Set<Promise<void>>();
  readonly #waitLifetime = new AbortController();
  readonly #waitOptions: Pick<BotRuntimeOptions, 'database' | 'beginAssignmentWait'>;
  readonly #activeDirectTools = new Map<
    string,
    { botSlug: string; agentSessionId: string; approvalHuman?: HumanContext }
  >();
  readonly #tobCliRequests = new Map<string, TobCliRequestLease>();
  #closed = false;
  readonly #tob: TobService | undefined;
  readonly #onTobDelegation: () => void;
  readonly #directToolCalls = new Map<string, DirectBotToolCall[]>();

  readonly #assignmentEvents: ReturnType<typeof createAssignmentEvents>;
  readonly #assignmentReporting: ReturnType<typeof createAssignmentReporting>;
  readonly #assignmentDelivery: ReturnType<typeof createAssignmentDelivery>;
  readonly #activityEvents: ReturnType<typeof createActivityEvents>;
  readonly #messagingEvents: ReturnType<typeof createMessagingEvents>;

  readonly #causalSending: ReturnType<typeof createCausalSending>;
  readonly #channelAdmission: ReturnType<typeof createChannelAdmission>;
  readonly #groupDigest: ReturnType<typeof createGroupDigest>;
  readonly #scheduling: ReturnType<typeof createOrchestratorScheduling>;
  readonly #cancellation: ReturnType<typeof createOrchestratorCancellation>;
  readonly #continuation: ReturnType<typeof createOrchestratorContinuation>;

  constructor(options: BotRuntimeOptions) {
    this.#waitOptions = options;
    this.#tob = options.tob;
    this.#onTobDelegation = options.onTobDelegation ?? (() => {});
    this.#externalMessaging = options.externalMessaging;
    this.#database = attachOperationalModule(options.database, 'bot-runtime');
    this.#sessionModels = sessionModelChoices(this.#database);
    this.#grants = options.grants;
    this.#assignmentAccessPresetStore = options.assignmentAccess;
    this.#ownership =
      options.ownership ??
      createSessionOwnership(attachOperationalModule(options.database, 'session-ownership'));
    this.#workspaceRoot = options.workspaceRoot;
    this.#orchestratorCwd = options.orchestratorCwd;
    this.#sessionArchived = options.sessionArchived;
    this.#registry = options.registry;
    this.#botNetwork = options.botNetwork;
    this.#requireExecution = options.requireExecution;
    this.#routeRests = options.routeRests;
    this.#inheritedModelPlan = options.inheritedModelPlan;
    this.#groupFallback = options.groupFallback;
    this.#sessionRoute = options.sessionRoute;
    this.#engineFallback = options.engineFallback;
    this.#team = options.team;
    this.#requireModelRoute = options.requireModelRoute;
    this.#requireAssignmentEngine = options.requireAssignmentEngine;
    this.#channels = options.channels;
    this.groupSendReview = new GroupSendReview(
      attachOperationalModule(options.database, 'channel-send-review'),
      options.now,
      options.channels.projectMessageAttachments,
      (message) =>
        message.attachments?.map((ref) => {
          if (!options.attachments) throw new Error('Attachment owner is unavailable for review');
          return options.attachments.contentVersion(ref);
        }) ?? [],
    );
    this.#inboxHistory =
      options.inboxHistory ??
      createInboxHistoryQuery(
        attachOperationalModule(options.database, 'messaging'),
        options.channels,
        options.now,
      );
    this.#inboxTriage = createInboxTriage(this.#database, options.channels, options.now);
    this.#sourcePolicy =
      options.sourcePolicy ?? createBotSourcePolicyStore(this.#database, options.now);
    this.#schedules = options.schedules;
    this.#agents = options.agents;
    this.#memory = options.memory;
    this.#attachments = options.attachments;
    this.#voiceMessages = options.voiceMessages;
    this.#callFrames = options.callFrames;
    this.#saveReportSpill = options.saveReportSpill;
    this.#readAssignmentTail = options.readAssignmentTail;
    this.#messagePerf = options.messagePerf;
    this.#now = options.now ?? (() => new Date());
    this.#readTurnProgress = options.readTurnProgress;
    this.#autoContinueDelaysMs = options.autoContinueDelaysMs ?? AUTO_CONTINUE_DELAYS_MS;
    this.#stopSettleTimeoutMs = options.stopSettleTimeoutMs ?? STOP_SETTLE_TIMEOUT_MS;
    this.#closeSessionApprovals = options.closeSessionApprovals;
    this.#promptText = options.promptText ?? (() => DEFAULT_PROMPT_TEXT);
    this.#promptLimits = options.promptLimits ?? (() => DEFAULT_PROMPT_LIMITS);
    this.#createSessionId = options.createSessionId ?? (() => `botharness-${randomUUID()}`);
    this.#createEventId = options.createEventId ?? (() => randomUUID());
    this.#createMessageId = options.createMessageId ?? (() => randomUUID());
    this.#createBotId = options.createBotId ?? (() => 'bot-' + randomUUID().replaceAll('-', ''));
    const configuredLimit =
      options.assignmentConcurrencyLimit ?? DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT;
    this.#assignmentConcurrencyLimit =
      typeof configuredLimit === 'function' ? configuredLimit : () => configuredLimit;
    this.#botHopLimit = options.botHopLimit ?? (() => DEFAULT_BOT_HOP_LIMIT);
    this.#sessionArchive = options.sessionArchive;
    this.#warn = options.warn;
    this.#memoryEvents = createMemoryEvents({
      database: this.#database,
      registry: this.#registry,
      memory: this.#memory,
      now: () => this.#now(),
      createEventId: () => this.#createEventId(),
      insertMemoryChange: (db, eventId, botSlug, change) =>
        this.#insertMemoryChange(db, eventId, botSlug, change),
      coalesceInbox,
      promptText: (botSlug) => this.#promptText(botSlug),
      setObserved: (eventIds, at) => this.#setObserved(eventIds, at),
      trackSteer: (settlement) => this.#channelAdmission.trackSteer(settlement),
      warn: this.#warn === undefined ? undefined : (message) => this.#warn?.(message),
    });
    this.#triageContinuation = options.triageContinuation === true;
    this.#approvalCapacity = new AssignmentApprovalCapacity({
      valid: (sessionId) => this.#assignmentExecutionAvailable(sessionId),
      available: () => this.#assignmentCapacityRefusal('awakened') === undefined,
      releaseAllowed: (sessionId) => this.#ownership.descendantsOf(sessionId).length === 0,
      changed: (sessionId, state, durationMs) => {
        this.#database.transaction(
          (database) =>
            database
              .prepare(
                "UPDATE assignments SET updated_at = ? WHERE session_id = ? AND stop_state = 'running'",
              )
              .run(this.#now().toISOString(), sessionId),
          ['assignments'],
        );
        this.#warn?.(
          `botharness.assignment.approval_capacity session=${sessionId} initiator=native-approval phase=${state ?? 'running'} duration_ms=${durationMs}`,
        );
      },
    });

    this.#assignmentEvents = createAssignmentEvents({
      database: this.#database,
      scheduleHarvest: (...args) => this.#scheduling.scheduleHarvest(...args),
      completionDigestTimers: this.#completionDigestTimers,
      getAssignment: (...args) => this.getAssignment(...args),
      waitOptions: this.#waitOptions,
      waitLifetime: this.#waitLifetime,
      now: (...args) => this.#now(...args),
      setObserved: (...args) => this.#setObserved(...args),
      markReportsHandled: (...args) => this.#markReportsHandled(...args),
    });
    this.#assignmentReporting = createAssignmentReporting({
      createEventId: (...args) => this.#createEventId(...args),
      now: (...args) => this.#now(...args),
      database: this.#database,
      sourcePolicy: this.#sourcePolicy,
      scheduleHarvest: (...args) => this.#scheduling.scheduleHarvest(...args),
      ownership: this.#ownership,
      closed: () => this.#closed,
      registry: this.#registry,
      assignmentRow: (...args) => this.#assignmentRow(...args),
      getAssignment: (...args) => this.getAssignment(...args),
      saveReportSpill: this.#saveReportSpill,
      readAssignmentReportPage: options.readAssignmentReportPage,
      scheduleReportHarvest: (...args) => this.#assignmentEvents.scheduleReportHarvest(...args),
    });
    this.#assignmentDelivery = createAssignmentDelivery({
      assignmentCapacityRefusal: (...args) => this.#assignmentCapacityRefusal(...args),
      requireAssignmentSummary: (...args) => this.#requireAssignmentSummary(...args),
      setStopState: (...args) => this.#setStopState(...args),
      setActivity: (...args) => this.#setActivity(...args),
      groupContinuations: this.#groupContinuations,
      agents: this.#agents,
      interruptedTools: this.#interruptedTools,
      publishAssignmentRefusal: (...args) => this.#publishAssignmentRefusal(...args),
      now: (...args) => this.#now(...args),
      database: this.#database,
      assignmentAcceptances: this.#assignmentAcceptances,
      trackAssignmentRun: (...args) => this.#trackAssignmentRun(...args),
    });
    this.#activityEvents = createActivityEvents({
      snoozeTimers: this.#snoozeTimers,
      registry: this.#registry,
      closed: () => this.#closed,
      database: this.#database,
      now: (...args) => this.#now(...args),
      held: this.#held,
      enqueue: (...args) => this.#scheduling.enqueue(...args),
      triageContinuation: this.#triageContinuation,
      triageQueued: this.#triageQueued,
      inboxTriage: this.#inboxTriage,
      triageBaseline: this.#triageBaseline,
      triageStalled: this.#triageStalled,
      dmChannel: (...args) => this.#dmChannel(...args),
      promptText: (...args) => this.#promptText(...args),
      triageRunning: this.#triageRunning,
      ensureOrchestrator: (...args) => this.#ensureOrchestrator(...args),
      runOrchestratorTurn: (...args) => this.#runOrchestratorTurn(...args),
      failureStreaks: this.#failureStreaks,
      noteAutomaticFailure: (...args) => this.#noteAutomaticFailure(...args),
      warn: this.#warn === undefined ? undefined : (message) => this.#warn?.(message),
    });
    this.#scheduling = createOrchestratorScheduling({
      activeTurns: this.#activeTurns,
      activityEvents: this.#activityEvents,
      checkHarvestReadiness: (...args) => this.#groupDigest.checkHarvestReadiness(...args),
      closed: () => this.#closed,
      database: this.#database,
      held: this.#held,
      inboxFactoryRetries: this.#inboxFactoryRetries,
      pendingHarvests: this.#pendingHarvests,
      recoverPendingDigests: (...args) => this.#groupDigest.recoverPendingDigests(...args),
      registry: this.#registry,
      runHarvestTurn: (...args) => this.#runHarvestTurn(...args),
      tails: this.#tails,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#continuation = createOrchestratorContinuation({
      admitDmMessage: (...args) => this.admitDmMessage(...args),
      agents: this.#agents,
      appendModelSwitch: (...args) => this.#appendModelSwitch(...args),
      autoContinues: this.#autoContinues,
      channels: this.#channels,
      claimDmContinuation: (...args) => this.#claimDmContinuation(...args),
      closed: () => this.#closed,
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      database: this.#database,
      engineFallback:
        this.#engineFallback === undefined
          ? undefined
          : (...args) => this.#engineFallback?.(...args),
      enqueue: (...args) => this.#scheduling.enqueue(...args),
      failureStreaks: this.#failureStreaks,
      groupFallback: this.#groupFallback,
      memberBotEnabled: (...args) => this.#memberBotEnabled(...args),
      now: () => this.#now(),
      orchestratorServices: (...args) => this.#orchestratorServices(...args),
      registry: this.#registry,
      release: (...args) => this.#release(...args),
      replaceOrchestrator: (...args) => this.#replaceOrchestrator(...args),
      requireExecution:
        this.#requireExecution === undefined
          ? undefined
          : (...args) => this.#requireExecution?.(...args),
      routeRests: this.#routeRests,
      runHumanDmTurn: (...args) => this.#runHumanDmTurn(...args),
      sessionRoute:
        this.#sessionRoute === undefined ? undefined : (...args) => this.#sessionRoute?.(...args),
      stoppedTurns: this.#stoppedTurns,
      switchingRoutingGroups: this.#switchingRoutingGroups,
      tails: this.#tails,
      team: this.#team,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#messagingEvents = createMessagingEvents({
      closed: () => this.#closed,
      externalMessaging: this.#externalMessaging,
      database: this.#database,
      release: (...args) => this.#release(...args),
      checkHarvestReadiness: (...args) => this.#groupDigest.checkHarvestReadiness(...args),
      admitChannelMessage: (...args) => this.#channelAdmission.admitChannelMessage(...args),
      activeTurns: this.#activeTurns,
      delivery: (...args) => this.#channelAdmission.delivery(...args),
      steerWithMemory:
        this.#agents.steerOrchestrator === undefined
          ? undefined
          : (botSlug, prompt, requireAccess) =>
              this.#channelAdmission.steerWithMemory(botSlug, prompt, requireAccess),
      promptText: (...args) => this.#promptText(...args),
      promptLimits: (...args) => this.#promptLimits(...args),
      claimGroupContext: (...args) => this.#claimGroupContext(...args),
      setObserved: (...args) => this.#setObserved(...args),
      now: (...args) => this.#now(...args),
      markAdmissionsSideEffect: (botSlug, sourceIds) =>
        this.#markAdmissionsSideEffect(botSlug, sourceIds, false),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      turnSessionId: (botSlug) => this.#turnSources.get(botSlug)?.sessionId,
      routingGroupReplyState: (...args) => this.#continuation.routingGroupReplyState(...args),
      noteSteeredChannel: (...args) => this.#noteSteeredChannel(...args),
      groupContextSection: (...args) => this.#groupDigest.groupContextSection(...args),
      settleHarvestFailure: (...args) => this.#settleHarvestFailure(...args),
      acceptTurnSources: (...args) => this.#acceptTurnSources(...args),
      typingTurns: this.#typingTurns,
      observeAdmission: (...args) => this.#observeAdmission(...args),
      markReportsHandled: (...args) => this.#markReportsHandled(...args),
      settleHarvestHandled: (...args) => this.#settleHarvestHandled(...args),
      trackSteer: (settlement) => this.#channelAdmission.trackSteer(settlement),
      held: this.#held,
      armDigest: (...args) => this.#groupDigest.armDigest(...args),
    });
    this.#cancellation = createOrchestratorCancellation({
      activeTurns: this.#activeTurns,
      agents: this.#agents,
      assignmentAcceptances: this.#assignmentAcceptances,
      assignmentRow: (...args) => this.#assignmentRow(...args),
      assignmentRuns: this.#assignmentRuns,
      cancelAutoContinue: (...args) => this.#continuation.cancelAutoContinue(...args),
      closed: () => this.#closed,
      closeSessionApprovals:
        this.#closeSessionApprovals === undefined
          ? undefined
          : (...args) => this.#closeSessionApprovals?.(...args),
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      database: this.#database,
      groupSendReview: this.groupSendReview,
      interruptedTools: this.#interruptedTools,
      memoryTurnOperations: this.#memoryTurnOperations,
      now: () => this.#now(),
      ownership: this.#ownership,
      pendingDeliveries: this.#pendingDeliveries,
      pendingHarvests: this.#pendingHarvests,
      registry: this.#registry,
      stopAssignment: (...args) => this.#stopAssignment(...args),
      stopNotices: this.#stopNotices,
      stoppedTurns: this.#stoppedTurns,
      stopSettleTimeoutMs: this.#stopSettleTimeoutMs,
      switchingRoutingGroups: this.#switchingRoutingGroups,
      tails: this.#tails,
      tobCliRequests: this.#tobCliRequests,
      turnSources: this.#turnSources,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });

    this.#groupDigest = createGroupDigest({
      assignmentEvents: this.#assignmentEvents,
      channels: this.#channels,
      closed: () => this.#closed,
      database: this.#database,
      digestRetryAt: this.#digestRetryAt,
      digestTimers: this.#digestTimers,
      dmChannel: (...args) => this.#dmChannel(...args),
      externalMessaging: this.#externalMessaging,
      held: this.#held,
      messagingEvents: this.#messagingEvents,
      now: () => this.#now(),
      promptText: (botSlug) => this.#promptText(botSlug),
      registry: this.#registry,
      rowQuotes: (...args) => this.#rowQuotes(...args),
      scheduling: this.#scheduling,
    });
    this.#channelAdmission = createChannelAdmission({
      acceptTurnSources: (...args) => this.#acceptTurnSources(...args),
      activeMemoryEvents: this.#activeMemoryEvents,
      activeTurns: this.#activeTurns,
      admitGroupMessage: (...args) => this.admitGroupMessage(...args),
      agents: this.#agents,
      autoContinues: this.#autoContinues,
      channels: this.#channels,
      claimSourceEvent: (...args) => this.#claimSourceEvent(...args),
      claimSteeredDm: (...args) => this.#claimSteeredDm(...args),
      claimSteeredGroupMention: (...args) => this.#claimSteeredGroupMention(...args),
      closed: () => this.#closed,
      continuation: this.#continuation,
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      database: this.#database,
      dmContextSection: (...args) => this.#groupDigest.dmContextSection(...args),
      groupAdmissionRetries: this.#groupAdmissionRetries,
      groupContextSection: (...args) => this.#groupDigest.groupContextSection(...args),
      markAdmissionsSideEffect: (...args) => this.#markAdmissionsSideEffect(...args),
      memberBotEnabled: (...args) => this.#memberBotEnabled(...args),
      memory: this.#memory,
      memoryEvents: this.#memoryEvents,
      memoryTurnOperations: this.#memoryTurnOperations,
      noteSteeredChannel: (...args) => this.#noteSteeredChannel(...args),
      now: () => this.#now(),
      observeAdmission: (...args) => this.#observeAdmission(...args),
      promptText: (botSlug) => this.#promptText(botSlug),
      quotePrompt: (...args) => this.#quotePrompt(...args),
      registry: this.#registry,
      release: (...args) => this.#release(...args),
      requireMembership: (...args) => this.#requireMembership(...args),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      restoreSteeredAdmissions: (...args) => this.#restoreSteeredAdmissions(...args),
      runHumanDmTurn: (...args) => this.#runHumanDmTurn(...args),
      scheduleDigest: (...args) => this.#groupDigest.scheduleDigest(...args),
      scheduling: this.#scheduling,
      settleSteeredAdmission: (...args) => this.#settleSteeredAdmission(...args),
      sourcePolicy: this.#sourcePolicy,
      speakerInput: (...args) => this.#speakerInput(...args),
      steerSettlements: this.#steerSettlements,
      team: this.#team,
      tob: this.#tob,
      tobCliRequests: this.#tobCliRequests,
      turnSources: this.#turnSources,
      warn: this.#warn === undefined ? undefined : (message) => this.#warn?.(message),
    });
    this.#causalSending = createCausalSending({
      admitBotDmMessage: (...args) => this.admitBotDmMessage(...args),
      admitGroupMessage: (...args) => this.admitGroupMessage(...args),
      botHopLimit: () => this.#botHopLimit(),
      botNetwork: this.#botNetwork,
      channels: this.#channels,
      closed: () => this.#closed,
      createMessageId: () => this.#createMessageId(),
      database: this.#database,
      groupSendReview: this.groupSendReview,
      isMember: (...args) => this.#isMember(...args),
      messagePerf: this.#messagePerf,
      now: () => this.#now(),
      onTobDelegation: () => this.#onTobDelegation(),
      ownership: this.#ownership,
      registry: this.#registry,
      requireMembership: (...args) => this.#requireMembership(...args),
      stoppedTurns: this.#stoppedTurns,
      team: this.#team,
      tob: this.#tob,
      turnSources: this.#turnSources,
      warn: this.#warn === undefined ? undefined : (message) => this.#warn?.(message),
    });

    if (options.database.mode === 'ready') {
      const interruptedDms = this.#recoverInterruptedAttempts();
      this.#retireRevokedGroupRetries();
      this.#channelAdmission.recoverPendingChannelAdmissions();
      for (const row of interruptedDms) {
        const channel = this.#channels.get(row.channel_id);
        const botSlug = channel?.type === 'dm' ? channel.botSlug : undefined;
        if (botSlug === undefined) continue;
        const failure = this.#channels.latestMessage(row.channel_id)?.sessionFailure;
        void this.#continuation
          .continueDmTurn(botSlug, row.channel_id, row.message_id, {
            kind: 'host-restart',
            autoAttempts:
              failure?.requestMessageId === row.message_id
                ? (failure.autoContinue?.attempt ?? 0)
                : 0,
          })
          ?.catch(() => undefined);
      }
      this.#continuation.rearmAutoContinues();
      this.#groupDigest.recoverPendingDigests();
      this.#assignmentEvents.recoverPendingAssignmentReports();
      for (const bot of this.#registry.list()) this.#activityEvents.armSnooze(bot.slug);
    }
  }

  #react(botSlug: string, channel: ChannelRecord, input: BotReactionInput): BotReactionResult {
    const bot = this.#registry.get(botSlug);
    if (this.#closed || bot === undefined || bot.paused === true)
      throw new Error('channel_action: Bot is unavailable');
    if (this.#channels.setBotReaction === undefined)
      throw new Error('channel_action: reactions are unavailable');
    const reactions = this.#channels.setBotReaction(
      channel.id,
      botSlug,
      input.messageId,
      input.emoji,
      input.active,
    );
    if (reactions === undefined)
      throw new Error(
        `channel_action: message ${input.messageId} cannot take this reaction in Channel ${channel.id}`,
      );
    return { channelId: channel.id, messageId: input.messageId, reactions };
  }

  retryDmMessage(
    channelId: string,
    messageId: string,
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<void> {
    return this.#continuation.retryDmMessage(channelId, messageId, human);
  }

  #claimDmContinuation(botSlug: string, sourceEventId: string): boolean {
    return this.#database.transaction(
      (database) => {
        const events = database
          .prepare(
            `UPDATE source_events SET attempt_state = 'running'
              WHERE source_event_id = ? AND attempt_state IN ('retryable', 'needs-repair')`,
          )
          .run(sourceEventId).changes;
        database
          .prepare(
            `
          UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('retryable', 'needs-repair')
        `,
          )
          .run(sourceEventId, botSlug);
        return events > 0;
      },
      ['source-event', 'bot-inbox'],
    );
  }

  recoverDmMessage(
    input: {
      channelId: string;
      failureMessageId: string;
      action: SessionRecoveryAction;
      compact(sessionId: string): Promise<boolean>;
    },
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<void> {
    return this.#continuation.recoverDmMessage(input, human);
  }

  compactOrchestrator<T>(botSlug: string, compact: (sessionId: string) => Promise<T>): Promise<T> {
    return this.#continuation.compactOrchestrator(botSlug, compact);
  }

  async tobCli(human: HumanContext, input: TobCliRequest): Promise<TobCliStatus> {
    if (this.#closed) throw new TobError('runtime-closed');
    for (const [id, request] of this.#tobCliRequests) {
      if (request.finishedAt !== undefined && Date.now() - request.finishedAt > 10 * 60 * 1000)
        this.#tobCliRequests.delete(id);
    }
    if (input.action !== 'start') {
      const request = this.#tobCliRequests.get(input.id);
      if (!request || request.humanId !== human.humanId)
        throw new TobError('cli-request-unavailable');
      if (input.action === 'cancel' && request.status.state === 'running') {
        request.status = { ...request.status, cancelRequested: true };
        request.controller.abort();
      }
      return structuredClone(request.status);
    }
    if (!this.#tob) throw new TobError('tob-authority-required');
    await this.#tob.ensure(human);
    if (this.#closed) throw new TobError('runtime-closed');
    const bot = this.#registry
      .list()
      .find(
        (candidate) => this.#tob?.isTob(candidate.slug) && botOwner(candidate) === human.humanId,
      );
    if (!bot || bot.paused || !this.#memberBotEnabled(bot))
      throw new TobError('tob-authority-required');
    if (
      this.#tails.has(bot.slug) ||
      [...this.#activeDirectTools.values()].some((call) => call.botSlug === bot.slug) ||
      [...this.#tobCliRequests.values()].some((request) => request.status.state === 'running')
    )
      throw new TobError('bot-busy');
    if (this.#tobCliRequests.size >= 16) {
      const completed = [...this.#tobCliRequests].find(
        ([, request]) => request.finishedAt !== undefined,
      );
      if (completed) this.#tobCliRequests.delete(completed[0]);
      else throw new TobError('bot-busy');
    }
    const channel = this.#channels.getOrCreateDm(human, bot.slug, bot.displayName);
    if (!channel) throw new TobError('human-dm-required');
    const channelId = channel.id;
    const id = randomUUID();
    const messageId = 'human-' + randomUUID();
    const controller = new AbortController();
    const request: TobCliRequestLease = {
      humanId: human.humanId,
      botSlug: bot.slug,
      controller,
      status: {
        id,
        channelId,
        messageId,
        state: 'running',
        cancelRequested: false,
      },
      finishedAt: undefined,
    };
    this.#tobCliRequests.set(id, request);
    const timer = setTimeout(() => controller.abort(), 10 * 60 * 1000);
    timer.unref?.();
    let result: import('../tob/cli-request.js').TobCliOutput | undefined;
    const finish = (error?: unknown) => {
      clearTimeout(timer);
      request.finishedAt = Date.now();
      request.status = controller.signal.aborted
        ? {
            id,
            channelId,
            messageId,
            state: 'cancelled',
            cancelRequested: true,
            code: 'operation-cancelled',
          }
        : error !== undefined || result === undefined
          ? {
              id,
              channelId,
              messageId,
              state: 'failed',
              cancelRequested: false,
              code:
                error instanceof TobError ||
                error instanceof DirectBotToolError ||
                error instanceof TeamError
                  ? error.code
                  : 'operation-failed',
            }
          : { id, channelId, messageId, state: 'completed', cancelRequested: false, result };
    };
    try {
      this.#requireExecution?.(bot.slug);
      const body = 'Run a typed CLI command without a model: ' + input.command.argv[0];
      const appended = await this.#channels.appendMessageOnce(human, channelId, {
        id: messageId,
        at: this.#now().toISOString(),
        author: { kind: 'human', humanId: human.humanId },
        tobCliRequestId: id,
        body,
      });
      if (appended.status !== 'appended') throw new TobError('human-dm-required');
      controller.signal.throwIfAborted();
      const admission = this.#admitDmMessage(
        human,
        { channelId, messageId, body },
        {
          command: { argv: [...input.command.argv], stdin: input.command.stdin },
          signal: controller.signal,
          complete: (output) => {
            result = output;
          },
        },
      );
      if (!admission.admitted) throw new TobError(admission.reason);
      void admission.settled.then(() => finish(), finish);
      return structuredClone(request.status);
    } catch (error) {
      finish(error);
      throw error;
    }
  }

  admitDmMessage(human: HumanContext, input: HandleDmMessageInput): DmMessageAdmission {
    return this.#admitDmMessage(human, input);
  }

  #admitDmMessage(
    human: HumanContext,
    input: HandleDmMessageInput,
    tobCliTurn?: TobCliTurn,
  ): DmMessageAdmission {
    return this.#channelAdmission.admitDmMessage(human, input, tobCliTurn);
  }

  sendOrchestratorMessage(
    human: HumanContext,
    input: { botSlug: string; sessionId: string; text: string },
  ): OrchestratorMessageOutcome {
    return this.#channelAdmission.sendOrchestratorMessage(human, input);
  }

  admitGroupMessage(channelId: string, messageId: string): void {
    return this.#channelAdmission.admitGroupMessage(channelId, messageId);
  }

  retryGroupMessageAdmission(channelId: string, messageId: string): void {
    return this.#channelAdmission.retryGroupMessageAdmission(channelId, messageId);
  }

  admitBotDmMessage(channelId: string, messageId: string): void {
    return this.#channelAdmission.admitBotDmMessage(channelId, messageId);
  }

  async withdrawNetworkMembership(hostId: string): Promise<void> {
    for (const bot of this.#registry.list())
      await this.#retireWithdrawnNetworkAdmissions(bot.slug, hostId);
  }

  admitGroupInvitation(targetDmChannelId: string, invitationId: string): void {
    return this.#channelAdmission.admitGroupInvitation(targetDmChannelId, invitationId);
  }

  admitGroupJoinRequest(ownerDmChannelId: string, requestId: string): void {
    return this.#channelAdmission.admitGroupJoinRequest(ownerDmChannelId, requestId);
  }

  admitGroupJoinDecision(requesterDmChannelId: string, requestId: string): void {
    return this.#channelAdmission.admitGroupJoinDecision(requesterDmChannelId, requestId);
  }

  admitScheduleFiring(botSlug: string): void {
    if (this.#closed) return;
    this.#groupDigest.checkHarvestReadiness(botSlug);
  }

  admitExternalSource(botSlug: string, sourceEventId: string): void {
    this.#messagingEvents.admitExternalSource(botSlug, sourceEventId);
  }

  #claimSteeredDm(
    botSlug: string,
    channelId: string,
    reason: 'human-dm' | 'bot-dm',
    sourceEventId: string,
  ): GroupContext | undefined {
    return this.#database.transaction(
      (database) => {
        database
          .prepare(
            `
        UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
         WHERE source_event_id = ? AND bot_slug = ?
           AND attempt_state IN ('pending', 'retryable')
      `,
          )
          .run(sourceEventId, botSlug);
        return this.#claimDmContext(database, botSlug, channelId, reason, sourceEventId);
      },
      ['bot-inbox'],
    );
  }

  #claimDmContext(
    database: DatabaseSync,
    botSlug: string,
    channelId: string,
    reason: 'human-dm' | 'bot-dm',
    excludeSourceEventId: string,
  ): GroupContext | undefined {
    const base = `
      FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
     WHERE a.bot_slug = ? AND a.reason = ? AND a.attempt_state IN ('pending', 'retryable')
       AND e.channel_id = ? AND a.source_event_id != ?`;
    const total = database
      .prepare(`SELECT COUNT(*) AS count ${base}`)
      .get(botSlug, reason, channelId, excludeSourceEventId) as {
      count: number;
    };
    if (total.count === 0) return undefined;
    const columns = `SELECT a.source_event_id, a.bot_slug, e.message_id,
      CASE WHEN json_type(e.payload_json, '$.genuiReplyContext') = 'text'
        THEN e.body || char(10) || char(10) || json_extract(e.payload_json, '$.genuiReplyContext')
        ELSE e.body END AS body, e.created_at,
      json_extract(e.payload_json, '$.author.kind') AS author_kind,
      json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 json_extract(e.payload_json, '$.external.event.actor.name') AS external_sender,
                 json_extract(e.payload_json, '$.external.event.actor.id') AS external_sender_id,
                 json_extract(e.payload_json, '$.external.platform') AS external_platform,
                 json_extract(e.payload_json, '$.external.event.messageId') AS external_message_id,
                 json_extract(e.payload_json, '$.external.event.mentions') AS external_mentions,
      json_extract(e.payload_json, '$.assignmentReply.sessionId') AS reply_session_id,
      json_extract(e.payload_json, '$.assignmentReply.sourceEventId') AS reply_source_event_id`;
    const candidates = database
      .prepare(`${columns} ${base} ORDER BY e.created_at, e.rowid LIMIT ?`)
      .all(
        botSlug,
        reason,
        channelId,
        excludeSourceEventId,
        GROUP_PROMPT_CHANNEL_LIMIT,
      ) as unknown as DigestRow[];
    const limits = this.#promptLimits(botSlug);
    const bodyLimit = limits['context-message-chars'];
    const rows: DigestRow[] = [];
    let characters = 0;
    for (const row of candidates) {
      const cost =
        Math.min(row.body.length, bodyLimit) +
        80 +
        this.#rowQuotes(channelId, row.message_id).length;
      if (
        rows.length >= GROUP_PROMPT_CHANNEL_LIMIT ||
        characters + cost > limits['dm-context-chars']
      )
        break;
      rows.push(row);
      characters += cost;
    }
    if (rows.length === 0) return undefined;
    const context = {
      channelId,
      rows,
      omittedCount: total.count - rows.length,
      bodyLimit,
    };
    for (const row of rows)
      database
        .prepare(
          `
          UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')
        `,
        )
        .run(row.source_event_id, botSlug);
    return context;
  }

  #claimSteeredGroupMention(
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    mentionPrompt: string,
  ): GroupContext | false | undefined {
    return this.#database.transaction(
      (database) => {
        const mention =
          database
            .prepare(
              `
        UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
         WHERE source_event_id = ? AND bot_slug = ?
           AND attempt_state IN ('pending', 'retryable')
      `,
            )
            .run(sourceEventId, botSlug).changes > 0;
        return mention
          ? this.#claimGroupContext(database, botSlug, channelId, {
              remainingCharacters: Math.max(
                0,
                this.#promptLimits(botSlug)['group-context-chars'] - mentionPrompt.length,
              ),
              includedByChannel: new Map(),
            })
          : false;
      },
      ['bot-inbox'],
    );
  }

  #restoreSteeredAdmissions(
    admissions: Array<{ sourceEventId: string; messageId: string }>,
    botSlug: string,
    turn: { sessionId: string } | undefined,
    now: string,
    error?: { cause: unknown },
  ): void {
    this.#database.transaction(
      (db) => {
        for (const { sourceEventId } of admissions) {
          const reply =
            turn &&
            this.#continuation.routingGroupReplyState(botSlug, turn.sessionId, sourceEventId);
          const state =
            reply === 'delivered'
              ? 'handled'
              : error || reply === 'uncertain'
                ? 'needs-repair'
                : 'pending';
          db.prepare(`UPDATE inbox_admissions SET attempt_state = ?,
            side_effect_started_at = CASE WHEN ? = 'pending' THEN NULL ELSE side_effect_started_at END,
            handled_at = CASE WHEN ? = 'handled' THEN ? ELSE handled_at END,
            last_error = ?
            WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'`).run(
            state,
            state,
            state,
            now,
            error ? String(error.cause).slice(0, 500) : null,
            sourceEventId,
            botSlug,
          );
        }
      },
      ['bot-inbox'],
    );
  }

  #settleSteeredAdmission(
    admissions: Array<{ sourceEventId: string; messageId: string }>,
    botSlug: string,
    channelId: string,
    succeeded: boolean,
  ): void {
    this.#database.transaction(
      (database) => {
        for (const admission of admissions)
          database
            .prepare(
              `
        UPDATE inbox_admissions
           SET attempt_state = ?,
               handled_at = CASE WHEN ? THEN ? ELSE handled_at END,
               opened_at = CASE WHEN ? THEN COALESCE(opened_at, ?) ELSE opened_at END,
               last_error = CASE WHEN ? THEN NULL ELSE 'Steered Orchestrator turn failed' END
         WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
      `,
            )
            .run(
              succeeded ? 'handled' : 'needs-repair',
              succeeded ? 1 : 0,
              this.#now().toISOString(),
              succeeded ? 1 : 0,
              this.#now().toISOString(),
              succeeded ? 1 : 0,
              admission.sourceEventId,
              botSlug,
            );
      },
      ['bot-inbox'],
    );
    for (const admission of admissions)
      this.#channels.admissionChanged?.(channelId, admission.messageId);
  }

  resumePendingDigests(botSlug: string): void {
    this.#groupDigest.recoverPendingDigests(botSlug);
  }

  async #runHarvestTurn(botSlug: string): Promise<void> {
    if (this.#closed || this.#held.has(botSlug)) return;
    await this.#retireWithdrawnNetworkAdmissions(botSlug);
    if (this.#closed) return;
    const bot = this.#registry.get(botSlug);
    if (bot === undefined || bot.paused === true) return;
    const collected = this.#collectInbox(botSlug);
    const externalContextChannels = [
      ...new Set(
        collected.units.flatMap((unit) =>
          unit.external?.receptionPaths
            ? unit.external.receptionPaths.flatMap((path) =>
                path.channelId ? [path.channelId] : [],
              )
            : unit.external?.localChannelId
              ? [unit.external.localChannelId]
              : [],
        ),
      ),
    ];
    const claimed = this.#claimHarvest(
      botSlug,
      externalContextChannels,
      renderInbox(collected.units, this.#promptText(botSlug)).length,
    );
    if (
      claimed.items.length === 0 &&
      claimed.digests.length === 0 &&
      (collected.eventIds.length === 0 ||
        (claimed.contexts.length === 0 && collected.units.every(onlyPairedLifecycle)))
    ) {
      this.#assignmentEvents.settleSeenPairedNotices(botSlug, collected.eventIds);
      return;
    }
    const externalChannelId = collected.units.find((unit) => unit.external?.localChannelId)
      ?.external?.localChannelId;
    const primaryChannelId =
      claimed.items[0]?.channelId ??
      claimed.digests[0]?.channelId ??
      externalChannelId ??
      this.#dmChannel(botSlug)?.id;
    const externalOnly =
      claimed.items.length === 0 &&
      claimed.digests.length === 0 &&
      collected.units.every((unit) => unit.sourceKind === 'bridge-message');
    const hasExternalSource = collected.units.some((unit) => unit.sourceKind === 'bridge-message');
    if (primaryChannelId === undefined && !hasExternalSource) return;
    const digestIds = claimed.digests.flatMap((digest) =>
      digest.rows.map((row) => row.source_event_id),
    );
    const contextIds = claimed.contexts.flatMap((context) =>
      context.rows.map((row) => row.source_event_id),
    );
    const includedIds = [
      ...claimed.items.map((item) => item.sourceEventId),
      ...digestIds,
      ...contextIds,
    ];
    const sourceEventId = claimed.items[0]?.sourceEventId ?? digestIds[0] ?? collected.eventIds[0];
    if (sourceEventId === undefined) return;
    const timestamp = this.#now().toISOString();
    for (const item of claimed.items)
      this.#observeAdmission(item.sourceEventId, botSlug, item.channelId, item.messageId);
    if (digestIds.length + contextIds.length > 0)
      this.#database.transaction(
        (database) => {
          for (const id of [...digestIds, ...contextIds])
            database
              .prepare(
                `
        UPDATE inbox_admissions SET observed_at = ?
         WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
      `,
              )
              .run(timestamp, id, botSlug);
        },
        ['bot-inbox'],
      );
    this.#setObserved(collected.eventIds, timestamp, botSlug);
    let orchestrator: { sessionId: string; resume: boolean } | undefined;
    try {
      const started = this.#ensureOrchestrator(bot, timestamp);
      orchestrator = started;
      const sections = [
        ...claimed.items.map((item) =>
          this.#channelAdmission.inboundChannelMessage(
            botSlug,
            item.channelId,
            item.messageId,
            item.body,
            item.sourceEventId,
          ),
        ),
        ...claimed.digests.map((digest) =>
          this.#groupDigest.digestSection(
            botSlug,
            digest.channelId,
            digest.rows,
            digest.omittedCount,
          ),
        ),
        ...claimed.contexts.map((context) => this.#groupDigest.groupContextSection(context)),
      ];
      const attentionCount = sections.length + (collected.eventIds.length > 0 ? 1 : 0);
      const preamble =
        attentionCount > 1
          ? `[Bot Inbox harvest] ${attentionCount} attention items are ready. Handle them together where useful and in parallel where independent; long-running work belongs in Assignment Sessions.`
          : undefined;
      const ran = await this.#runOnLiveOrchestrator(bot, started, (session) => {
        orchestrator = session;
        return this.#runOrchestratorTurn(
          bot,
          session,
          sourceEventId,
          externalOnly && externalChannelId === undefined ? undefined : primaryChannelId,
          [preamble, ...sections].filter((part): part is string => part !== undefined).join('\n\n'),
          collected.units,
          collected.eventIds.length > 0,
          () => this.#markAdmissionsSideEffect(botSlug, includedIds),
          collected.eventIds,
          [...new Set([...includedIds, ...collected.eventIds])],
        );
      });
      this.#markReportsHandled(collected.eventIds, botSlug, ran.sessionId);
      this.#settleHarvestHandled(botSlug, includedIds);
      this.#failureStreaks.delete(botSlug);
      for (const digest of claimed.digests) {
        this.#digestRetryAt.delete(`${botSlug}:${digest.channelId}`);
        this.#digestFailureCount.delete(`${botSlug}:${digest.channelId}`);
      }
      const retry = this.#inboxFactoryRetries.get(botSlug);
      if (retry !== undefined) {
        if (retry.timer !== undefined) clearTimeout(retry.timer);
        this.#inboxFactoryRetries.delete(botSlug);
        this.#warn?.(
          JSON.stringify({
            component: 'bot-runtime',
            event: 'inbox-factory-recovered',
            botSlug,
            attempts: retry.attempts,
          }),
        );
      }
    } catch (error) {
      this.#setObserved(collected.eventIds, null, botSlug);
      this.#database.transaction(
        (db) => {
          for (const id of collected.eventIds)
            db.prepare(
              'UPDATE inbox_admissions SET last_error = ? WHERE source_event_id = ? AND bot_slug = ?',
            ).run(String(error).slice(0, 500), id, botSlug);
        },
        ['bot-inbox'],
      );
      this.#settleHarvestFailure(botSlug, includedIds, String(error));
      for (const digest of claimed.digests) {
        const key = `${botSlug}:${digest.channelId}`;
        const failures = Math.min(6, (this.#digestFailureCount.get(key) ?? 0) + 1);
        this.#digestFailureCount.set(key, failures);
        this.#digestRetryAt.set(
          key,
          this.#now().getTime() + Math.min(300_000, 10_000 * 2 ** (failures - 1)),
        );
      }
      if (
        collected.eventIds.length > 0 &&
        this.#scheduling.retryInboxAfterAgentFactoryStarts(botSlug, collected.eventIds, error)
      )
        return;
      const retry = this.#inboxFactoryRetries.get(botSlug);
      if (retry !== undefined) {
        if (retry.timer !== undefined) clearTimeout(retry.timer);
        this.#inboxFactoryRetries.delete(botSlug);
      }
      if (orchestrator !== undefined && primaryChannelId !== undefined) {
        try {
          await this.#publishSessionFailure({
            channelId: primaryChannelId,
            botSlug,
            sessionId: orchestrator.sessionId,
            role: 'orchestrator',
            error,
          });
        } catch (reportError) {
          this.#warn?.(
            JSON.stringify({
              component: 'bot-runtime',
              event: 'session-failure-report-failed',
              botSlug,
              error: String(reportError),
            }),
          );
        }
      }
      await this.#noteAutomaticFailure(botSlug, primaryChannelId, error);
      throw error;
    } finally {
      for (const item of claimed.items)
        this.#channels.admissionChanged?.(item.channelId, item.messageId);
      for (const digest of claimed.digests)
        for (const row of digest.rows)
          this.#channels.admissionChanged?.(digest.channelId, row.message_id);
      for (const context of claimed.contexts)
        for (const row of context.rows)
          this.#channels.admissionChanged?.(context.channelId, row.message_id);
    }
  }

  #claimHarvest(
    botSlug: string,
    externalContextChannels: string[] = [],
    externalCharacters = 0,
  ): {
    items: Array<{
      sourceEventId: string;
      channelId: string;
      messageId: string;
      body: string;
    }>;
    digests: Array<{
      channelId: string;
      rows: DigestRow[];
      omittedCount: number;
    }>;
    contexts: GroupContext[];
  } {
    return this.#database.transaction(
      (database) => {
        const itemRows = database
          .prepare(
            `
        SELECT a.source_event_id, e.channel_id, e.message_id, e.body
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND a.attempt_state IN ('pending', 'retryable')
           AND a.reason IN ('group-mention', 'bot-dm', 'group-invite', 'group-join-request', 'group-join-decision')
           AND e.channel_id IS NOT NULL AND e.message_id IS NOT NULL AND e.source_kind != 'bridge-message'
         ORDER BY CASE a.reason
                    WHEN 'group-mention' THEN 0
                    WHEN 'bot-dm' THEN 1
                    WHEN 'group-invite' THEN 2
                    WHEN 'group-join-request' THEN 3
                    ELSE 4
                  END,
                  e.created_at, e.rowid
         LIMIT 20
      `,
          )
          .all(botSlug) as unknown as Array<{
          source_event_id: string;
          channel_id: string;
          message_id: string;
          body: string;
        }>;
        for (const row of itemRows)
          database
            .prepare(
              `
          UPDATE inbox_admissions SET attempt_state = 'running', observed_at = NULL, last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')
        `,
            )
            .run(row.source_event_id, botSlug);
        const budget: GroupPromptBudget = {
          remainingCharacters: Math.max(
            0,
            this.#promptLimits(botSlug)['group-context-chars'] -
              externalCharacters -
              itemRows.reduce(
                (size, row) =>
                  size +
                  this.#channelAdmission.inboundChannelMessage(
                    botSlug,
                    row.channel_id,
                    row.message_id,
                    row.body,
                    row.source_event_id,
                  ).length,
                200,
              ),
          ),
          includedByChannel: new Map(),
        };
        const groups = database
          .prepare(
            `
        SELECT e.channel_id AS channel_id, a.wake_policy_revision AS revision,
               a.source_policy_revision AS source_revision, a.external_default_revision AS default_revision, a.external_thread_policy_revision AS thread_revision,
               CASE WHEN a.external_thread_policy_revision IS NOT NULL THEN json_extract(e.payload_json, '$.external.event.reply.threadId') ELSE '' END AS thread_scope,
               MIN(e.created_at) AS first_at, a.wake_interval_ms AS interval_ms,
               a.wake_count AS wake_count, COUNT(*) AS count
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND a.reason = 'group-ordinary' AND e.channel_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)
           AND a.wake_count IS NOT NULL AND a.observed_at IS NULL
           AND a.attempt_state IN ('pending', 'retryable')
         GROUP BY e.channel_id, a.wake_policy_revision, a.source_policy_revision, default_revision, thread_revision, thread_scope
         ORDER BY first_at, channel_id
      `,
          )
          .all(botSlug) as unknown as Array<{
          channel_id: string;
          revision: number;
          source_revision: number | null;
          default_revision: number | null;
          thread_revision: number | null;
          thread_scope: string;
          first_at: string;
          interval_ms: number;
          wake_count: number;
          count: number;
        }>;
        const now = this.#now().getTime();
        const digests: Array<{
          channelId: string;
          rows: DigestRow[];
          omittedCount: number;
        }> = [];
        for (const group of groups) {
          if (
            group.count < group.wake_count &&
            Date.parse(group.first_at) + group.interval_ms > now
          )
            continue;
          const candidates = database
            .prepare(
              `
          SELECT a.source_event_id, a.bot_slug, e.message_id, e.body, e.created_at,
                 json_extract(e.payload_json, '$.skillInvocations') AS skill_invocations,
                 json_extract(e.payload_json, '$.mentions') AS human_mentions,
                 json_extract(e.payload_json, '$.author.kind') AS author_kind,
                 json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 json_extract(e.payload_json, '$.external.event.actor.name') AS external_sender,
                 json_extract(e.payload_json, '$.external.event.actor.id') AS external_sender_id,
                 json_extract(e.payload_json, '$.external.platform') AS external_platform,
                 json_extract(e.payload_json, '$.external.event.messageId') AS external_message_id,
                 json_extract(e.payload_json, '$.external.event.mentions') AS external_mentions
            FROM inbox_admissions a
            JOIN source_events e ON e.source_event_id = a.source_event_id
           WHERE a.bot_slug = ? AND a.reason = 'group-ordinary' AND e.channel_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)
             AND a.wake_count IS NOT NULL AND a.observed_at IS NULL
             AND a.attempt_state IN ('pending', 'retryable')
             AND e.channel_id = ? AND a.wake_policy_revision = ?
             AND a.source_policy_revision IS ? AND a.external_default_revision IS ? AND a.external_thread_policy_revision IS ?
             AND CASE WHEN a.external_thread_policy_revision IS NOT NULL THEN json_extract(e.payload_json, '$.external.event.reply.threadId') ELSE '' END = ?
           ORDER BY e.created_at, e.rowid LIMIT 100
        `,
            )
            .all(
              botSlug,
              group.channel_id,
              group.revision,
              group.source_revision,
              group.default_revision,
              group.thread_revision,
              group.thread_scope,
            ) as unknown as DigestRow[];
          const rows: DigestRow[] = [];
          const alreadyIncluded = budget.includedByChannel.get(group.channel_id) ?? 0;

          const contextReserve = itemRows.some((row) => row.channel_id === group.channel_id)
            ? 4_000
            : 0;
          for (const row of candidates) {
            if (alreadyIncluded + rows.length >= GROUP_PROMPT_CHANNEL_LIMIT) break;
            const nextLength = this.#groupDigest.digestSection(
              botSlug,
              group.channel_id,
              [...rows, row],
              group.count - rows.length - 1,
            ).length;
            if (
              (budget.includedByChannel.size > 0 || rows.length > 0) &&
              nextLength > budget.remainingCharacters - contextReserve
            )
              break;
            rows.push(row);
          }
          if (rows.length > 0) {
            budget.remainingCharacters -= this.#groupDigest.digestSection(
              botSlug,
              group.channel_id,
              rows,
              group.count - rows.length,
            ).length;
            budget.includedByChannel.set(group.channel_id, alreadyIncluded + rows.length);
          }
          for (const row of rows)
            database
              .prepare(
                `
          UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')
        `,
              )
              .run(row.source_event_id, botSlug);
          if (rows.length > 0)
            digests.push({
              channelId: group.channel_id,
              rows,
              omittedCount: group.count - rows.length,
            });
        }
        const contextChannels = new Set([
          ...externalContextChannels,
          ...itemRows.map((row) => row.channel_id),
          ...digests.map((digest) => digest.channelId),
        ]);
        const contexts = [...contextChannels]
          .map((channelId) => this.#claimGroupContext(database, botSlug, channelId, budget))
          .filter((context): context is GroupContext => context !== undefined);
        return {
          items: itemRows.map((row) => ({
            sourceEventId: row.source_event_id,
            channelId: row.channel_id,
            messageId: row.message_id,
            body: row.body,
          })),
          digests,
          contexts,
        };
      },
      ['bot-inbox'],
    );
  }

  #claimGroupContext(
    database: DatabaseSync,
    botSlug: string,
    channelId: string,
    budget: GroupPromptBudget,
  ): GroupContext | undefined {
    const alreadyIncluded = budget.includedByChannel.get(channelId) ?? 0;
    if (alreadyIncluded >= GROUP_PROMPT_CHANNEL_LIMIT) return undefined;
    const base = `
      FROM inbox_admissions a JOIN source_events e ON e.source_event_id = a.source_event_id
     WHERE a.bot_slug = ? AND a.reason = 'group-ordinary' AND e.channel_id IS NOT NULL
           AND NOT EXISTS (SELECT 1 FROM messaging_bridge_sources rp WHERE rp.source_event_id = e.source_event_id)
       AND (a.wake_mode IN ('all', 'digest', 'mentions') OR (a.wake_mode = 'silent' AND a.source_policy_wake_mode = 'context'))
       AND a.attempt_state IN ('pending', 'retryable') AND e.channel_id = ?`;
    const total = database.prepare(`SELECT COUNT(*) AS count ${base}`).get(botSlug, channelId) as {
      count: number;
    };
    if (total.count === 0) return undefined;
    const columns = `SELECT a.source_event_id, a.bot_slug, e.message_id, e.body, e.created_at,
      json_extract(e.payload_json, '$.skillInvocations') AS skill_invocations,
      json_extract(e.payload_json, '$.mentions') AS human_mentions,
      json_extract(e.payload_json, '$.author.kind') AS author_kind,
      json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 json_extract(e.payload_json, '$.external.event.actor.name') AS external_sender,
                 json_extract(e.payload_json, '$.external.event.actor.id') AS external_sender_id,
                 json_extract(e.payload_json, '$.external.platform') AS external_platform,
                 json_extract(e.payload_json, '$.external.event.messageId') AS external_message_id,
                 json_extract(e.payload_json, '$.external.event.mentions') AS external_mentions`;
    const candidates = database
      .prepare(`${columns} ${base} ORDER BY e.created_at, e.rowid LIMIT ?`)
      .all(botSlug, channelId, GROUP_PROMPT_CHANNEL_LIMIT) as unknown as DigestRow[];
    const bodyLimit = this.#promptLimits(botSlug)['context-message-chars'];
    const rows: DigestRow[] = [];
    for (const row of candidates) {
      if (!sourceSenderAllowed(database, botSlug, row.source_event_id, true)) continue;
      if (alreadyIncluded + rows.length >= GROUP_PROMPT_CHANNEL_LIMIT) break;
      const candidateContext = {
        channelId,
        rows: [...rows, row],
        omittedCount: total.count - rows.length - 1,
        bodyLimit,
      };
      if (
        (budget.includedByChannel.size > 0 || rows.length > 0) &&
        this.#groupDigest.groupContextSection(candidateContext).length > budget.remainingCharacters
      )
        break;
      rows.push(row);
    }
    if (rows.length === 0) return undefined;
    const context = {
      channelId,
      rows,
      omittedCount: total.count - rows.length,
      bodyLimit,
    };
    budget.remainingCharacters -= this.#groupDigest.groupContextSection(context).length;
    budget.includedByChannel.set(channelId, alreadyIncluded + rows.length);
    for (const row of rows)
      database
        .prepare(
          `UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
        WHERE source_event_id = ? AND bot_slug = ? AND attempt_state IN ('pending', 'retryable')`,
        )
        .run(row.source_event_id, botSlug);
    return context;
  }

  #noteSteeredChannel(botSlug: string, channelId: string): void {
    const turn = this.#turnSources.get(botSlug);
    if (turn !== undefined && turn.inboundChannelId !== channelId)
      turn.steeredChannelIds.add(channelId);
  }

  #acceptTurnSources(botSlug: string, sourceEventIds: readonly string[]): void {
    const turn = this.#turnSources.get(botSlug);
    if (turn === undefined) return;
    for (const id of sourceEventIds) {
      turn.eventIds.add(id);
      turn.acceptedEventIds.add(id);
    }
  }

  #markAdmissionsSideEffect(botSlug: string, sourceEventIds: string[], recordInTurn = true): void {
    if (sourceEventIds.length === 0) return;
    if (recordInTurn) {
      const turn = this.#turnSources.get(botSlug);
      if (turn !== undefined) for (const id of sourceEventIds) turn.eventIds.add(id);
    }
    this.#database.transaction(
      (database) => {
        for (const id of sourceEventIds) {
          requireSourceEffects(database, id, botSlug);
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
        `,
            )
            .run(this.#now().toISOString(), id, botSlug);
        }
      },
      ['bot-inbox'],
    );
  }

  #settleHarvestHandled(botSlug: string, sourceEventIds: string[]): void {
    if (sourceEventIds.length === 0) return;
    this.#database.transaction(
      (database) => {
        for (const id of sourceEventIds)
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?, opened_at = COALESCE(opened_at, ?)
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
        `,
            )
            .run(this.#now().toISOString(), this.#now().toISOString(), id, botSlug);
      },
      ['bot-inbox'],
    );
  }

  #settleHarvestFailure(botSlug: string, sourceEventIds: string[], error: string): void {
    if (sourceEventIds.length === 0) return;
    this.#database.transaction(
      (database) => {
        for (const id of sourceEventIds)
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = CASE WHEN side_effect_started_at IS NULL THEN 'retryable' ELSE 'needs-repair' END,
                 observed_at = CASE
                   WHEN reason = 'group-ordinary' AND side_effect_started_at IS NULL THEN NULL
                   ELSE observed_at END,
                 last_error = ?
           WHERE source_event_id = ? AND bot_slug = ? AND attempt_state = 'running'
        `,
            )
            .run(error.slice(0, 500), id, botSlug);
      },
      ['bot-inbox'],
    );
  }

  #interruptedDmNotice(botSlug: string, channelId: string | undefined): string {
    const rows = this.#database.read((database) =>
      database
        .prepare(
          `
        SELECT e.channel_id, e.message_id
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
         WHERE a.bot_slug = ? AND a.reason = 'human-dm' AND e.source_kind = 'human-message'
           AND a.attempt_state IN ('retryable', 'needs-repair')
           AND e.channel_id IS NOT NULL AND e.message_id IS NOT NULL AND e.channel_id != ?
           AND e.created_at > COALESCE((
             SELECT MAX(handled_at) FROM inbox_admissions WHERE bot_slug = ? AND handled_at IS NOT NULL
           ), '')
         ORDER BY e.created_at, e.message_id
         LIMIT 5
      `,
        )
        .all(botSlug, channelId ?? '', botSlug),
    ) as Array<{ channel_id: string; message_id: string }>;
    return rows
      .map(
        (row) =>
          `[Host: your earlier turn for Human DM ${row.channel_id}, message ${row.message_id}, ended without a reply. It stays in that DM for the Human to retry; do not answer it in another Channel.]\n\n`,
      )
      .join('');
  }

  #rowQuotes(channelId: string, messageId: string): string {
    return this.#quotePrompt(channelId, this.#channels.message(channelId, messageId));
  }

  #quotePrompt(channelId: string, message: ChannelMessage | undefined): string {
    const block = this.#renderQuotePrompt(channelId, message);
    if (block.length > 0 && message !== undefined) {
      this.#quoteBlocks.delete(block);
      this.#quoteBlocks.set(block, { channelId, message });
      if (this.#quoteBlocks.size > 256)
        this.#quoteBlocks.delete(this.#quoteBlocks.keys().next().value!);
    }
    return block;
  }

  #turnQuoteBlocks(
    body: string,
  ): ReadonlyArray<readonly [string, { channelId: string; message: ChannelMessage }]> {
    return [...this.#quoteBlocks].filter(([block]) => body.includes(block));
  }

  #refreshQuoteBlocks(
    body: string,
    sources: ReadonlyArray<readonly [string, { channelId: string; message: ChannelMessage }]>,
  ): string {
    let refreshed = body;
    for (const [block, source] of sources) {
      if (!refreshed.includes(block)) continue;
      const current = this.#renderQuotePrompt(source.channelId, source.message);
      if (current !== block) refreshed = refreshed.split(block).join(current);
    }
    return refreshed;
  }

  #renderQuotePrompt(channelId: string, message: ChannelMessage | undefined): string {
    return quotePromptBlock(message?.quotes, (messageId) => {
      const target = this.#channels.message(channelId, messageId);
      if (target === undefined || Reflect.get(target, 'contentPurge') !== undefined)
        return undefined;
      const author =
        target.author.kind === 'bot' || target.author.kind === 'remote-bot'
          ? `PersonaBot ${target.author.slug}`
          : target.author.kind === 'human'
            ? `Human${target.author.displayName === undefined ? '' : ` ${JSON.stringify(target.author.displayName)}`}`
            : target.author.kind === 'bridged'
              ? `${JSON.stringify(target.bridgeOrigin?.senderName ?? target.bridgeOrigin?.senderId ?? 'unknown')} (${target.bridgeOrigin?.platform ?? target.author.source}, external)`
              : 'Channel system';
      return { author, body: target.body };
    });
  }

  #observeAdmission(
    sourceEventId: string,
    botSlug: string,
    channelId: string,
    messageId: string,
    claimPending = false,
  ): void {
    const changed = this.#database.transaction(
      (database) =>
        database
          .prepare(
            `
        UPDATE inbox_admissions
           SET observed_at = COALESCE(observed_at, ?), attempt_state = 'running',
               last_error = CASE WHEN attempt_state = 'running' THEN last_error ELSE NULL END
         WHERE source_event_id = ? AND bot_slug = ?
           AND (attempt_state = 'running' OR (? AND attempt_state IN ('pending', 'retryable')))
      `,
          )
          .run(this.#now().toISOString(), sourceEventId, botSlug, Number(claimPending)).changes > 0,
      ['bot-inbox'],
    );
    if (changed) this.#channels.admissionChanged?.(channelId, messageId);
  }

  askChannel(sessionId: string): string | undefined {
    return this.#askOrigin({ sessionId })?.channelId;
  }

  hasDirectToolInvocation({ sessionId, callId }: ToolApprovalOriginQuery): boolean {
    return this.#activeDirectTools.get(callId)?.agentSessionId === sessionId;
  }

  toolApprovalOrigin(query: ToolApprovalOriginQuery): ToolApprovalOrigin | undefined {
    return this.#askOrigin(query);
  }

  #askOrigin({
    sessionId,
    callId,
  }: {
    sessionId: string;
    callId?: string;
  }): ToolApprovalOrigin | undefined {
    const owner = this.#ownership.resolve(sessionId);
    if (this.#closed || owner?.rootRole !== 'orchestrator') return undefined;
    const direct = this.#activeDirectTools.get(callId ?? sessionId);
    if (direct !== undefined) {
      if (direct.botSlug !== owner.botSlug || direct.agentSessionId !== sessionId) return undefined;
      const channel =
        direct.approvalHuman === undefined
          ? undefined
          : this.#channels.getOrCreateDm(
              direct.approvalHuman,
              owner.botSlug,
              this.#registry.get(owner.botSlug)?.displayName,
            );
      return channel?.type === 'dm' && channel.botSlug === owner.botSlug
        ? { kind: 'direct', channelId: channel.id }
        : undefined;
    }
    const turn = this.#turnSources.get(owner.botSlug);
    if (
      turn?.sessionId !== sessionId ||
      turn.inboundChannelId === undefined ||
      turn.steeredChannelIds.size > 0
    )
      return undefined;
    const channel = this.#channels.get(turn.inboundChannelId);
    if (channel === undefined) return undefined;
    if (channel.type === 'group')
      return channel.members.includes(owner.botSlug)
        ? { kind: 'turn', channelId: channel.id }
        : undefined;
    return channel.botSlug === owner.botSlug ? { kind: 'turn', channelId: channel.id } : undefined;
  }

  botCreatePreview(botSlug: string, args: unknown): BotCreatePreview | undefined {
    if (typeof args !== 'object' || args === null) return undefined;
    const input = args as Record<string, unknown>;
    const location =
      typeof input['memory_location'] === 'string' ? input['memory_location'].trim() : '';
    let avatar: string | undefined;
    let avatarError: string | undefined;
    if (typeof input['avatar_path'] === 'string')
      try {
        avatar = this.#readCreatedAvatar(botSlug, input['avatar_path']);
      } catch (error) {
        avatarError = error instanceof Error ? error.message : 'invalid-avatar';
      }
    return {
      memoryFolder:
        location.length > 0
          ? join(location, NEW_BOT_ID_PLACEHOLDER)
          : join(this.#registry.rootDir, NEW_BOT_ID_PLACEHOLDER, 'memory'),
      defaultLocation: location.length === 0,
      ...(avatar === undefined ? {} : { avatar }),
      ...(avatarError === undefined ? {} : { avatarError }),
    };
  }

  captureTobCliAuthority(sessionId: string): TobCliAuthority {
    const owner = this.#ownership.resolve(sessionId);
    if (
      this.#closed ||
      !this.#ownership.contentAvailable(sessionId) ||
      owner?.rootRole !== 'orchestrator' ||
      owner.parentSessionId !== undefined ||
      !this.#tob?.isTob(owner.botSlug)
    )
      throw new TobError('tob-authority-required');
    const turn = this.#turnSources.get(owner.botSlug);
    if (turn?.sessionId !== sessionId || turn.acceptedEventIds.size === 0)
      throw new TobError('human-dm-required');
    const accepted = new Set(turn.acceptedEventIds);
    const dm = dmChannelId(owner.botSlug);
    const authorize = () => {
      const currentOwner = this.#ownership.resolve(sessionId);
      if (
        this.#closed ||
        !this.#ownership.contentAvailable(sessionId) ||
        currentOwner?.botSlug !== owner.botSlug ||
        currentOwner.rootRole !== 'orchestrator' ||
        currentOwner.parentSessionId !== undefined ||
        !this.#tob?.isTob(owner.botSlug)
      )
        throw new TobError('tob-authority-required');

      if (
        this.#turnSources.get(owner.botSlug) !== turn ||
        turn.acceptedEventIds.size !== accepted.size ||
        [...accepted].some((id) => !turn.acceptedEventIds.has(id))
      )
        throw new TobError('human-dm-required');
      this.#database.read((db) => {
        for (const id of accepted) {
          const event = db
            .prepare(
              'SELECT source_kind, channel_id, human_id FROM source_events WHERE source_event_id = ?',
            )
            .get(id);
          if (
            event?.source_kind !== 'human-message' ||
            event.channel_id !== dm ||
            (event.human_id ?? 'local-human') !== botOwner(this.#registry.get(owner.botSlug)!)
          )
            throw new TobError('human-dm-required');
          requireSourceEffects(db, id, owner.botSlug);
        }
      });
    };
    authorize();
    return Object.assign(authorize, {
      markSideEffect: () => {
        authorize();
        this.#markAdmissionsSideEffect(owner.botSlug, [...accepted]);
      },
    });
  }

  canRequestPrivateInput(sessionId: string, selected?: string): boolean {
    const owner = this.#ownership.resolve(sessionId);
    if (
      this.#closed ||
      owner?.rootRole !== 'orchestrator' ||
      !this.#ownership.contentAvailable(sessionId)
    )
      return false;
    const turn = this.#turnSources.get(owner.botSlug);
    if (turn?.sessionId !== sessionId) return false;
    try {
      if (this.bindPrivateInputOrigin(sessionId, selected) !== undefined) return true;
    } catch {
      return false;
    }
    return this.#hasLocalPrivateInputSource(owner.botSlug, turn.acceptedEventIds);
  }

  #hasLocalPrivateInputSource(botSlug: string, sourceEventIds: Iterable<string>): boolean {
    return this.#database.read((db) => {
      const human = db.prepare(
        `SELECT e.channel_id FROM source_events e
         JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
         WHERE e.source_event_id = ? AND a.bot_slug = ? AND e.source_kind = 'human-message'
           AND a.reason IN ('human-dm', 'group-mention', 'group-ordinary')`,
      );
      return [...sourceEventIds].some((id) => {
        const source = human.get(id, botSlug);
        if (
          typeof source?.channel_id !== 'string' ||
          this.#channels.get(source.channel_id) === undefined
        )
          return false;
        try {
          requireSourceEffects(db, id, botSlug);
          return true;
        } catch {
          return false;
        }
      });
    });
  }

  bindPrivateInputOrigin(sessionId: string, selected?: string): PrivateInputOrigin | undefined {
    const owner = this.#ownership.resolve(sessionId);
    const turn = owner === undefined ? undefined : this.#turnSources.get(owner.botSlug);
    if (owner?.rootRole !== 'orchestrator' || turn?.sessionId !== sessionId) {
      if (selected !== undefined) throw new PrivateInputRefusal('private-source-invalid');
      return undefined;
    }
    if (
      selected === undefined &&
      this.#hasLocalPrivateInputSource(owner.botSlug, turn.acceptedEventIds)
    )
      return undefined;
    const ids = this.#database.read((db) => {
      const query = db.prepare('SELECT source_kind FROM source_events WHERE source_event_id = ?');
      return [...turn.acceptedEventIds].filter(
        (id) => query.get(id)?.source_kind === 'bridge-message',
      );
    });
    if (ids.length === 0 && selected === undefined) return undefined;
    const id = selected ?? (ids.length === 1 ? ids[0] : undefined);
    if (id === undefined) throw new PrivateInputRefusal('private-source-required');
    if (!ids.includes(id)) throw new PrivateInputRefusal('private-source-invalid');
    if (this.#externalMessaging === undefined)
      throw new PrivateInputRefusal('private-source-unavailable');
    const messaging = this.#externalMessaging;
    const bot = this.#registry.get(owner.botSlug);
    if (bot === undefined) throw new PrivateInputRefusal('private-source-revoked');
    const signal = messaging.inbound.sourceSignal(owner.botSlug, id);
    const applies = () => this.#turnSources.get(owner.botSlug) === turn;
    const current = () => {
      const currentOwner = this.#ownership.resolve(sessionId);
      const currentBot = this.#registry.get(owner.botSlug);
      if (
        this.#closed ||
        signal.aborted ||
        currentBot?.createdAt !== bot.createdAt ||
        currentBot.paused === true ||
        currentOwner?.rootRole !== 'orchestrator' ||
        currentOwner.botSlug !== owner.botSlug ||
        !this.#ownership.contentAvailable(sessionId) ||
        !applies() ||
        !turn.acceptedEventIds.has(id) ||
        !messaging.inbound.available(owner.botSlug, id)
      )
        return false;
      try {
        this.#database.read((db) => requireSourceEffects(db, id, owner.botSlug));
        return true;
      } catch {
        return false;
      }
    };
    if (!current()) throw new PrivateInputRefusal('private-source-revoked');
    return { sourceEventId: id, signal, applies, current };
  }

  bindNativeQuestionInput(
    sessionId: string,
    channelId: string,
    question?: { messageId: string; callId: string },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    const owner = this.#ownership.resolve(sessionId);
    const turn = owner === undefined ? undefined : this.#turnSources.get(owner.botSlug);
    const sources = turn?.sessionId === sessionId ? turn.acceptedEventIds : undefined;
    const sourceEventId = sources?.values().next().value;
    if (owner?.rootRole !== 'orchestrator' || sourceEventId === undefined) return undefined;
    if (turn?.memoryObservation === 'recovered-question') {
      if (question === undefined) return undefined;
      return (deliver) => {
        const request = this.#channels.message(channelId, question.messageId)?.userQuestionRequest;
        if (request?.callId !== question.callId) {
          this.#warn?.(
            'native-question-input-refused phase=binding reason=question-card-unavailable',
          );
          return Promise.resolve(false);
        }
        return (
          this.recoverNativeQuestionInput(sessionId, channelId, question.messageId)?.(deliver) ??
          Promise.resolve(false)
        );
      };
    }
    return this.#nativeQuestionInput(
      owner.botSlug,
      sessionId,
      channelId,
      sourceEventId,
      [...(sources ?? [])],
      () => this.#markSideEffectStarted(sourceEventId),
    );
  }

  recoverNativeQuestionInput(
    sessionId: string,
    channelId: string,
    requestMessageId: string,
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    const owner = this.#ownership.resolve(sessionId);
    if (owner?.rootRole !== 'orchestrator') return undefined;
    const request = this.#channels.message(channelId, requestMessageId)?.userQuestionRequest;
    const callId = request?.callId;
    const holdsCard = (): boolean => {
      const card = this.#channels.message(channelId, requestMessageId);
      return (
        callId !== undefined &&
        card?.author.kind === 'bot' &&
        card.author.slug === owner.botSlug &&
        card.userQuestionRequest?.sessionId === sessionId &&
        card.userQuestionRequest.callId === callId
      );
    };
    if (!holdsCard()) {
      this.#warn?.('native-question-input-refused phase=recovery reason=question-card-unavailable');
      return undefined;
    }
    const row = this.#database.read((db) =>
      db
        .prepare(
          `
          SELECT e.source_event_id FROM source_events e
           WHERE e.message_id = ? AND e.bot_slug = ? AND e.source_kind = 'bot-message'
             AND ${channelSql('e')} = ?
        `,
        )
        .get(requestMessageId, owner.botSlug, channelId),
    ) as { source_event_id: string } | undefined;
    if (row === undefined || !this.nativeQuestionAvailable(sessionId, channelId)) return undefined;
    return this.#nativeQuestionInput(
      owner.botSlug,
      sessionId,
      channelId,
      row.source_event_id,
      [row.source_event_id],
      () => undefined,
      { kind: 'recovered-question', holdsCard },
    );
  }

  nativeQuestionAvailable(sessionId: string, channelId: string): boolean {
    const owner = this.#ownership.resolve(sessionId);
    const bot = owner === undefined ? undefined : this.#registry.get(owner.botSlug);
    const channel = this.#channels.get(channelId);
    return (
      !this.#closed &&
      bot !== undefined &&
      owner?.rootRole === 'orchestrator' &&
      this.#ownership.contentAvailable(sessionId) &&
      this.#sessionArchived?.(sessionId) !== true &&
      (channel?.type === 'group'
        ? channel.members.includes(owner.botSlug)
        : channel?.botSlug === owner.botSlug)
    );
  }

  captureNativeOrchestratorModel(sessionId: string): void {
    if (this.#closed || this.#preparedOrchestrators.has(sessionId)) return;
    const owner = this.#ownership.resolve(sessionId);
    if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined) return;
    const bot = this.#registry.get(owner.botSlug);
    if (
      bot === undefined ||
      bot.paused ||
      this.currentOrchestratorSessionId(bot.slug) !== sessionId
    )
      return;
    this.#agents.captureNativeOrchestratorModel?.(sessionId, bot);
  }

  async prepareNativeOrchestratorStep(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const owner = this.#ownership.resolve(sessionId);
    if (owner?.rootRole === 'assignment' && owner.parentSessionId === undefined)
      return this.#prepareNativeAssignmentStep(sessionId, senderSessionIds, signal);
    if (owner?.rootRole !== 'orchestrator' || owner.parentSessionId !== undefined) return true;
    const unavailable = (): NativeOrchestratorRefusal | undefined => {
      if (this.#closed) return 'runtime-closed';
      if (signal.aborted) return 'aborted';
      const bot = this.#registry.get(owner.botSlug);
      if (bot === undefined) return 'bot-missing';
      if (bot.paused) return 'bot-paused';
      const current = this.currentOrchestratorSessionId(owner.botSlug);
      if (current !== sessionId)
        return current === undefined ? 'no-current-orchestrator' : 'not-current-orchestrator';
      return undefined;
    };
    const available = () => unavailable() === undefined;
    const fatal = (reason: NativeOrchestratorRefusal | undefined) =>
      reason === 'runtime-closed' || reason === 'aborted';
    const admissible = () => !fatal(unavailable());
    const refuse = (reason: NativeOrchestratorRefusal): false => {
      this.#warn?.(
        JSON.stringify({
          event: 'native-orchestrator-input',
          phase: 'refused',
          reason,
          bot: owner.botSlug,
          session: sessionId,
          executionReady: this.#preparedOrchestrators.has(sessionId),
          senders: senderSessionIds.length,
        }),
      );
      return false;
    };
    const admitUnavailable = (reason: NativeOrchestratorRefusal): void =>
      this.#warn?.(
        JSON.stringify({
          event: 'native-orchestrator-input',
          phase: 'admitted-unavailable',
          reason,
          bot: owner.botSlug,
          session: sessionId,
          senders: senderSessionIds.length,
        }),
      );
    const refusal = unavailable();
    if (this.#preparedOrchestrators.has(sessionId)) {
      if (refusal === 'runtime-closed' || refusal === 'aborted') return refuse(refusal);
      if (refusal !== undefined) admitUnavailable(refusal);
      return true;
    }
    if (refusal !== undefined) return refuse(refusal);
    if (!senderSessionIds.length) return refuse('no-native-sender');
    if (
      !senderSessionIds.every((id) => {
        const sender = this.#ownership.resolve(id);
        return (
          sender?.botSlug === owner.botSlug &&
          sender.parentSessionId === sessionId &&
          this.#ownership.contentAvailable(id)
        );
      })
    )
      return refuse('foreign-sender');
    const cancellation = AbortSignal.any([signal, this.#waitLifetime.signal]);
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (accepted: boolean) => {
        if (settled) return;
        settled = true;
        cancellation.removeEventListener('abort', abort);
        if (this.#nativeStepReady.get(sessionId) === finish)
          this.#nativeStepReady.delete(sessionId);
        const refusal = unavailable();
        const stop = fatal(refusal);
        if (accepted && refusal !== undefined && !stop) admitUnavailable(refusal);
        const reason = accepted && !stop ? undefined : (refusal ?? 'run-not-ready');
        if (reason !== undefined) refuse(reason);
        resolve(reason === undefined);
      };
      const abort = () => finish(false);
      this.#nativeStepReady.set(sessionId, finish);
      cancellation.addEventListener('abort', abort, { once: true });
      if (cancellation.aborted) return abort();
      void this.#scheduling
        .enqueue(owner.botSlug, async () => {
          if (settled || !available()) return;
          const bot = this.#registry.get(owner.botSlug)!;
          await this.#runOrchestratorTurn(
            bot,
            { sessionId, resume: true },
            undefined,
            undefined,
            '',
            [],
            false,
            () => {
              if (!admissible()) throw new Error('Native Orchestrator is unavailable');
            },
            [],
            [],
            admissible,
          );
        })
        .then(
          () => finish(false),
          () => {
            finish(false);
            this.#warn?.('native-subagent-input-run-failed');
          },
        );
    });
  }

  #nativeQuestionInput(
    botSlug: string,
    sessionId: string,
    channelId: string,
    sourceEventId: string,
    sourceIds: readonly string[],
    markAttemptSideEffect: () => void,
    input: { kind: 'source-event' } | { kind: 'recovered-question'; holdsCard(): boolean } = {
      kind: 'source-event',
    },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    const owner = { botSlug };
    const held = (): boolean => {
      const channel = this.#channels.get(channelId);
      return channel?.type === 'group'
        ? channel.members.includes(owner.botSlug)
        : channel?.botSlug === owner.botSlug;
    };
    if (!held()) return undefined;
    return (deliver) => {
      let phase:
        | 'queue'
        | 'authority'
        | 'resume'
        | 'native-delivery'
        | 'continuation'
        | 'completed' = 'queue';
      const correlation = `bot=${botSlug.slice(0, 120)} session=${sessionId.slice(0, 120)} source=${sourceEventId.slice(0, 120)}`;
      const refused = (
        reason: 'owner-unavailable' | 'native-refused' | 'run-failed',
        kind?: string,
      ): void =>
        this.#warn?.(
          `native-question-input-refused phase=${phase} reason=${reason}${kind === undefined ? '' : ` kind=${kind}`} ${correlation}`,
        );
      let accept!: (value: boolean) => void;
      const accepted = new Promise<boolean>((resolve) => {
        accept = resolve;
      });
      const done = this.#scheduling.enqueue(owner.botSlug, async () => {
        try {
          phase = 'authority';
          const bot = this.#registry.get(owner.botSlug);
          const current = this.#ownership.resolve(sessionId);
          if (
            this.#closed ||
            bot === undefined ||
            bot.paused === true ||
            current?.rootRole !== 'orchestrator' ||
            current.botSlug !== owner.botSlug ||
            !this.#ownership.contentAvailable(sessionId) ||
            this.#sessionArchived?.(sessionId) === true ||
            !held() ||
            (input.kind === 'recovered-question' && !input.holdsCard())
          ) {
            refused('owner-unavailable');
            return;
          }
          this.#database.read((db) => {
            for (const id of sourceIds) requireSourceEffects(db, id, owner.botSlug);
          });
          phase = 'resume';
          await this.#runOrchestratorTurn(
            bot,
            { sessionId, resume: true },
            sourceEventId,
            channelId,
            '',
            [],
            false,
            markAttemptSideEffect,
            [],
            [],
            () => {
              phase = 'native-delivery';
              const currentBot = this.#registry.get(owner.botSlug);
              const currentOwner = this.#ownership.resolve(sessionId);
              if (
                this.#closed ||
                currentBot === undefined ||
                currentBot.paused === true ||
                currentOwner?.rootRole !== 'orchestrator' ||
                currentOwner.botSlug !== owner.botSlug ||
                !this.#ownership.contentAvailable(sessionId) ||
                this.#sessionArchived?.(sessionId) === true ||
                !held() ||
                (input.kind === 'recovered-question' && !input.holdsCard())
              ) {
                refused('owner-unavailable');
                accept(false);
                return false;
              }
              this.#database.read((db) => {
                for (const id of sourceIds) requireSourceEffects(db, id, owner.botSlug);
              });
              const result = deliver();
              if (!result) refused('native-refused');
              else phase = 'continuation';
              accept(result);
              return result;
            },
            sourceIds,
            input.kind,
          );
          phase = 'completed';
        } finally {
          accept(false);
        }
      });
      void done.catch((error: unknown) => {
        accept(false);
        const kind =
          error instanceof MemoryAcceptError
            ? 'memory'
            : error instanceof TypeError
              ? 'type'
              : error instanceof RangeError
                ? 'range'
                : error instanceof SyntaxError
                  ? 'syntax'
                  : error instanceof Error
                    ? 'error'
                    : 'non-error';
        refused('run-failed', kind);
      });
      void done.then(
        () => accept(false),
        () => accept(false),
      );
      return accepted;
    };
  }

  directBotTools(): DirectBotToolSpec[] {
    return this.#agents.directTools?.() ?? [];
  }

  directBotToolCalls(botSlug: string): readonly DirectBotToolCall[] {
    return this.#directToolCalls.get(botSlug) ?? [];
  }

  async runDirectBotTool(
    botSlug: string,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    parentSessionId?: string,
    sourceEventId?: string,
    human?: HumanContext,
  ): Promise<{ tool: string; sessionId: 'direct'; result: unknown }> {
    if (this.#closed) throw new DirectBotToolError('runtime-closed', 'BotRuntime is closed');
    this.#team?.bots.requireActive(botSlug);
    const bot = this.#registry.get(botSlug);
    if (bot === undefined) throw new DirectBotToolError('unknown-bot', `Unknown bot: ${botSlug}`);
    if (
      [...this.#tobCliRequests.values()].some(
        (request) => request.botSlug === botSlug && request.status.state === 'running',
      )
    )
      throw new DirectBotToolError(
        'bot-busy',
        'Wait for the active Tob CLI request or cancel it first',
      );
    if (bot.paused === true)
      throw new DirectBotToolError('bot-paused', `PersonaBot ${botSlug} is paused`);
    const runDirect = this.#agents.runDirectTool?.bind(this.#agents);
    if (runDirect === undefined)
      throw new DirectBotToolError('unavailable', 'Direct Bot tools are unavailable on this Host');
    if (!this.directBotTools().some((spec) => spec.name === tool))
      throw new DirectBotToolError(
        'tool-not-direct',
        `${tool} is not a Bot tool the direct runner can call; list them with bot-tools`,
      );
    const delegation = isBotSubagentModelTool(tool);
    if (!delegation && parentSessionId !== undefined)
      throw new DirectBotToolError(
        'invalid-args',
        `${tool} runs as the Bot's Orchestrator; --session applies only to Subagent tools`,
      );
    if (delegation) {
      const owner =
        parentSessionId === undefined ? undefined : this.#ownership.resolve(parentSessionId);
      if (owner?.botSlug !== bot.slug || owner.rootRole !== 'assignment')
        throw new DirectBotToolError(
          'parent-unavailable',
          `${tool} runs inside an Assignment; pass --session with one of ${bot.slug}'s Assignment Sessions`,
        );
    }
    this.#requireExecution?.(bot.slug);
    const sessionId = `direct-${randomUUID()}`;
    const directChannel =
      typeof args.channel_id === 'string'
        ? (() => {
            const channel = this.#channels.get(args.channel_id);
            if (this.#team && channel) {
              this.#team.bots.requireChannel(botSlug, channel);
              return channel;
            }
            return this.#requireMembership(botSlug, args.channel_id);
          })()
        : undefined;
    if (sourceEventId !== undefined) {
      this.#database.read((db) => {
        const source = db
          .prepare(
            `SELECT e.channel_id FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
          WHERE e.source_event_id = ? AND a.bot_slug = ?`,
          )
          .get(sourceEventId, botSlug);
        if (source === undefined)
          throw new DirectBotToolError(
            'source-unavailable',
            'Source Event is not admitted to this Bot',
          );
        requireSourceEffects(db, sourceEventId, botSlug);
        if (typeof source.channel_id === 'string')
          this.#requireMembership(botSlug, source.channel_id);
      });
    }
    const directOrigin =
      sourceEventId === undefined && DIRECT_ASSIGNMENT_TOOLS.has(tool)
        ? this.#recordDirectToolSource(bot.slug, tool)
        : sourceEventId;
    const directSource =
      directOrigin !== undefined
        ? { source_event_id: directOrigin }
        : directChannel === undefined
          ? undefined
          : this.#database.read((db) =>
              db
                .prepare(
                  'SELECT source_event_id FROM channel_placements WHERE channel_id = ? ORDER BY revision DESC LIMIT 1',
                )
                .get(directChannel.id),
            );
    const run: OrchestratorAgentRun = {
      sessionId,
      resume: false,
      bot,
      message: '',
      inbox: '',
      inboundChannelId: undefined,
      ...this.#orchestratorServices(bot, {
        sessionId,
        channelId: undefined,
        sourceEventId: directSource
          ? String(directSource.source_event_id)
          : `direct-${randomUUID()}`,
        markSideEffect: () => undefined,
        readAdmissions: new Set(),
        importedFiles: new Map(),
        turnSources: new Set(),
        observeMemory: false,
        observeReads: false,
      }),
    };
    let approvalHuman: HumanContext | undefined;
    if (
      PRIVATE_INPUT_TOOLS.has(tool) ||
      hasIrreversibleExternalEffect(toolEffects(tool, args)) ||
      toolEffects(tool, args)?.authority === 'management'
    ) {
      approvalHuman = human;
      if (!PRIVATE_INPUT_TOOLS.has(tool))
        this.#ownership.claim({
          sessionId,
          botSlug,
          rootRole: 'orchestrator',
          provenance: 'created',
          at: this.#now().toISOString(),
        });
    }
    const started = this.#now();
    const record = (outcome: 'ok' | 'error', result: string) => {
      const calls = this.#directToolCalls.get(bot.slug) ?? [];
      calls.push({
        callId: sessionId,
        tool,
        args: PRIVATE_INPUT_TOOLS.has(tool) ? {} : args,
        at: started.toISOString(),
        durationMs: this.#now().getTime() - started.getTime(),
        outcome,
        result: PRIVATE_INPUT_TOOLS.has(tool) ? '[private tool result omitted]' : result,
      });
      this.#directToolCalls.set(bot.slug, calls.slice(-DIRECT_TOOL_CALL_LIMIT));
    };
    const executionParentSessionId = delegation
      ? parentSessionId
      : this.currentOrchestratorSessionId(botSlug);
    this.#activeDirectTools.set(sessionId, {
      botSlug: bot.slug,
      agentSessionId: PRIVATE_INPUT_TOOLS.has(tool)
        ? (executionParentSessionId ?? sessionId)
        : sessionId,
      ...(approvalHuman === undefined ? {} : { approvalHuman }),
    });
    try {
      const result = await runDirect(run, tool, args, signal, executionParentSessionId);
      record('ok', typeof result === 'string' ? result : JSON.stringify(result));
      if (DIRECT_ASSIGNMENT_TOOLS.has(tool)) {
        try {
          this.#assignmentReporting.noticeDirectAssignmentCall(bot.slug, tool, args, result);
        } catch (error) {
          this.#warn?.(
            `Direct ${tool} succeeded but its Orchestrator notice was not recorded: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
      return { tool, sessionId: 'direct', result };
    } catch (error) {
      record('error', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.#activeDirectTools.delete(sessionId);
    }
  }

  #recordDirectToolSource(botSlug: string, tool: string): string {
    const id = this.#createEventId();
    const at = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at,
               handled_at, attempt_state, expects_reply, payload_json)
             VALUES (?, 'system-message', ?, ?, ?, ?, 'handled', 0, ?)`,
          )
          .run(
            id,
            botSlug,
            `Direct ${tool} call from the deepseekbot CLI.`,
            at,
            at,
            JSON.stringify({ author: { kind: 'system' }, directBotTool: { tool } }),
          );
      },
      ['source-event'],
    );
    return id;
  }

  currentTurnTarget(botSlug: string): TurnTarget | undefined {
    const sessionId = this.currentOrchestratorSessionId(botSlug);
    return sessionId === undefined ? undefined : this.sessionTurnTarget(sessionId);
  }

  activeSessionModel(sessionId: string): SessionModelChoice | null | undefined {
    return this.#activeSessionModels.get(sessionId);
  }

  sessionTurnTarget(sessionId: string): TurnTarget | undefined {
    return lastTurnTarget(this.#database, sessionId);
  }

  sessionTurnTargets(sessionId: string): TurnTargetSegment[] {
    return readTurnTargets(this.#database, sessionId);
  }

  currentOrchestratorSessionId(botSlug: string): string | undefined {
    return this.#ownership
      .rootsFor(botSlug, 'orchestrator')
      .find(
        (root) =>
          this.#ownership.contentAvailable(root.sessionId) &&
          this.#sessionArchived?.(root.sessionId) !== true,
      )?.sessionId;
  }

  latestAssignmentActivity(): ReadonlyMap<string, number> {
    return this.#database.read((database) => {
      const rows = database
        .prepare(
          `SELECT bot_slug, MAX(unixepoch(latest_report_at, 'subsec') * 1000) AS at
         FROM assignments WHERE latest_report_at IS NOT NULL GROUP BY bot_slug`,
        )
        .all();
      return new Map(
        rows.flatMap((row) =>
          typeof row['bot_slug'] === 'string' &&
          typeof row['at'] === 'number' &&
          Number.isFinite(row['at'])
            ? [[row['bot_slug'], row['at']]]
            : [],
        ),
      );
    });
  }

  assignmentEngineAccountUses(accountId: string): string[] {
    return this.#database.read((database) => {
      const rows = database
        .prepare(
          `SELECT session_id, json_extract(model_route_json, '$.engine') AS engine,
                  json_extract(model_route_json, '$.accountId') AS account_id
             FROM assignments
            WHERE model_group_id IS NULL
              AND json_extract(model_route_json, '$.kind') = 'engine'
              AND (account_id = ? OR account_id IS NULL)
            ORDER BY session_id`,
        )
        .all(accountId);
      return rows.flatMap(({ session_id, engine, account_id }) =>
        typeof session_id === 'string' &&
        isEngineId(engine) &&
        engineAccountKey(engine, typeof account_id === 'string' ? account_id : undefined) ===
          accountId
          ? [session_id]
          : [],
      );
    });
  }

  async refreshBotContacts(): Promise<void> {
    await this.#botNetwork?.refresh?.();
  }

  networkBotAvailability(
    hostId: string,
    botSlug: string,
  ): import('./bot-network.js').NetworkBotAvailability {
    return this.#botNetwork?.availability?.(hostId, botSlug) ?? 'unavailable';
  }

  botContacts(botSlug: string, query?: BotContactQuery): BotContactPage {
    const contacts = this.#botNetwork?.contacts() ?? [];
    if (
      query?.botId?.startsWith('remote:') &&
      !contacts.some((contact) => networkBotId(contact.hostId, contact.botSlug) === query.botId)
    )
      return { outputLimit: BOT_CONTACT_OUTPUT_LIMIT, contacts: [] };
    return discoverBotContacts(
      this.#registry,
      botSlug,
      query,
      contacts,
      this.#team
        ? (target) => {
            try {
              this.#team!.bots.requireBotTarget(botSlug, target.slug);
              return true;
            } catch {
              return false;
            }
          }
        : undefined,
    );
  }

  listAssignments(botSlug: string): AssignmentSummary[] {
    const rows = this.#database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, title, description, activity, stop_state,
                  latest_report_state, latest_report_summary, latest_report_at,
                  continuity_key, open_ask_source_event_id, open_ask_at,
                  grant_id, workspace_id, primary_cwd, permission_mode,
                  approval_policy, preset_revision, created_at, updated_at
                  , model_route_json, model_group_id, model_effort, agent_preset, archived_at, (SELECT body FROM source_events WHERE source_event_id = assignments.open_ask_source_event_id) AS open_ask_summary
             FROM assignments
            WHERE bot_slug = ?
            ORDER BY updated_at DESC, session_id ASC`,
        )
        .all(botSlug),
    ) as unknown as AssignmentRow[];
    return rows.map((row) => {
      const {
        botSlug: _botSlug,
        sourceEventId: _sourceEventId,
        ...summary
      } = assignmentFromRow(row);
      const executionWait = this.#approvalCapacity.state(row.session_id);
      return {
        ...summary,
        ...(executionWait === undefined ? {} : { executionWait }),
      };
    });
  }

  listChannelAssignments(channelId: string): ChannelAssignmentSummary[] {
    const rows = this.#database.read((database) =>
      database
        .prepare(
          `SELECT a.session_id, a.source_event_id, a.bot_slug, a.title, a.description, a.activity, a.stop_state,
                  a.latest_report_state, a.latest_report_summary, a.latest_report_at,
                  a.continuity_key, a.open_ask_source_event_id, a.open_ask_at,
                  a.grant_id, a.workspace_id, a.primary_cwd, a.permission_mode,
                  a.approval_policy, a.preset_revision, a.created_at, a.updated_at,
                  a.model_route_json, a.model_group_id, a.model_effort, a.archived_at
             FROM assignments a
             JOIN source_events s ON s.source_event_id = a.source_event_id
            WHERE s.channel_id = ?
            ORDER BY a.updated_at DESC, a.session_id ASC
            LIMIT 200`,
        )
        .all(channelId),
    ) as unknown as AssignmentRow[];
    return rows.map((row) => {
      const assignment = assignmentFromRow(row);
      return {
        sessionId: assignment.sessionId,
        botSlug: assignment.botSlug,
        title: assignment.title,
        description: assignment.description,
        activity: assignment.activity,
        ...(assignment.latestReport === undefined ? {} : { latestReport: assignment.latestReport }),
        ...(assignment.modelRoute === undefined ? {} : { modelRoute: assignment.modelRoute }),
        ...(assignment.archivedAt === undefined ? {} : { archivedAt: assignment.archivedAt }),
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      };
    });
  }

  async setAssignmentArchived(
    botSlug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<AssignmentArchiveOutcome | { outcome: 'unarchived'; assignment: AssignmentSummary }> {
    const bot = this.#registry.get(botSlug);
    if (bot === undefined) throw new Error(`Unknown PersonaBot: ${botSlug}`);
    return archived
      ? this.#archiveAssignment(bot, sessionId, () => {})
      : this.#unarchiveAssignment(bot, sessionId, () => {});
  }

  async replaceOrchestrator<T>(
    botSlug: string,
    body: () => T,
  ): Promise<OrchestratorReplacement<T>> {
    if (this.#tails.has(botSlug)) return BOT_BUSY;
    let result: OrchestratorReplacement<T> | undefined;
    await this.#scheduling.enqueue(botSlug, async () => {
      result = await this.#replaceOrchestrator(botSlug, body);
    });
    if (result === undefined) throw new Error(`Unknown PersonaBot: ${botSlug}`);
    return result;
  }

  async startFreshOrchestrator(
    botSlug: string,
    assertCurrent?: () => void,
  ): Promise<'started' | 'busy'> {
    assertCurrent?.();
    const outcome = await this.replaceOrchestrator(botSlug, () => assertCurrent?.());
    return outcome.outcome === 'refused' ? 'busy' : 'started';
  }

  turnRunning(botSlug: string): boolean {
    return this.#turnSources.has(botSlug) && this.#activeTurns.has(botSlug);
  }

  hasPendingInbox(botSlug: string): boolean {
    if (this.#closed || this.#tails.has(botSlug)) return true;
    return this.#database.read(
      (database) =>
        database
          .prepare(
            `SELECT 1 FROM inbox_admissions
              WHERE bot_slug = ? AND attempt_state IN ('pending', 'running', 'retryable')
              LIMIT 1`,
          )
          .get(botSlug) !== undefined,
    );
  }

  async #replaceOrchestrator<T>(
    botSlug: string,
    body: () => T,
  ): Promise<OrchestratorReplacement<T>> {
    const current = this.currentOrchestratorSessionId(botSlug);
    if (current === undefined) return { outcome: 'replaced', value: body() };
    const archive = this.#sessionArchive?.();
    if (archive === undefined) throw new Error('DSH Session archive is unavailable');
    try {
      await archive.archiveSession(current);
    } catch (error) {
      if (error instanceof Error && error.name === 'WorkspaceActiveSessionError') return BOT_BUSY;
      if (!(error instanceof Error && error.name === 'WorkspaceUnknownSessionError')) throw error;
      return {
        outcome: 'replaced',
        value: this.#supersedeUnsavedOrchestrator(current, body),
      };
    }
    await this.#agents.releaseSession?.(current).catch(() =>
      this.#warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'orchestrator-release-failed',
          botSlug,
          sessionId: current,
        }),
      ),
    );
    try {
      return { outcome: 'replaced', value: body() };
    } catch (error) {
      await archive.unarchiveSession(current);
      throw error;
    }
  }

  #supersedeUnsavedOrchestrator<T>(unsaved: string, body: () => T): T {
    const owner = this.#ownership.resolve(unsaved);
    const bot = owner === undefined ? undefined : this.#registry.get(owner.botSlug);
    if (owner === undefined || bot === undefined) throw new Error('Unknown Orchestrator Session');
    const value = body();
    const at = Math.max(this.#now().getTime(), Date.parse(owner.createdAt) + 1);
    this.#releaseReplacedOrchestrators(
      bot.slug,
      this.#claimOrchestrator(bot, new Date(at).toISOString()),
    );
    return value;
  }

  triageOpenCount(botSlug: string): number | undefined {
    return this.#triageRunning.get(botSlug);
  }

  getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined {
    const row = this.#database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, title, description, activity, stop_state,
                  latest_report_state, latest_report_summary, latest_report_at,
                  continuity_key, open_ask_source_event_id, open_ask_at,
                  grant_id, workspace_id, primary_cwd, permission_mode,
                  approval_policy, preset_revision, created_at, updated_at
                  , model_route_json, model_group_id, model_effort, agent_preset, archived_at, (SELECT body FROM source_events WHERE source_event_id = assignments.open_ask_source_event_id) AS open_ask_summary
             FROM assignments
            WHERE bot_slug = ? AND session_id = ?`,
        )
        .get(botSlug, sessionId),
    ) as AssignmentRow | undefined;
    if (row === undefined) return undefined;
    const executionWait = this.#approvalCapacity.state(sessionId);
    return {
      ...assignmentFromRow(row),
      ...(executionWait === undefined ? {} : { executionWait }),
    };
  }

  beginAssignmentApprovalWait(
    sessionId: string,
    callId: string,
    signal: AbortSignal,
  ): AssignmentApprovalWaitLease | undefined {
    if (this.#assignmentRow(undefined, sessionId) === undefined) return undefined;
    return this.#approvalCapacity.begin(sessionId, callId, signal);
  }

  async ensureAssignmentCapacity(sessionId: string, signal: AbortSignal): Promise<void> {
    if (this.#ownership.resolve(sessionId)?.rootRole === 'assignment')
      await this.#approvalCapacity.ensure(sessionId, signal);
  }

  assignmentApprovalWait(sessionId: string, callId: string): AssignmentExecutionWait | undefined {
    return this.#approvalCapacity.stateForCall(sessionId, callId);
  }

  runAssignmentTool<T>(
    sessionId: string,
    callId: string,
    token: symbol,
    signal: AbortSignal,
    body: () => Promise<T>,
  ): Promise<T> {
    return this.#assignmentRow(undefined, sessionId) !== undefined
      ? this.#approvalCapacity.execute(sessionId, callId, token, signal, body)
      : body();
  }

  settleAssignmentTool(sessionId: string, callId: string): void {
    this.#approvalCapacity.settledTool(sessionId, callId);
  }

  #assignmentExecutionAvailable(sessionId: string): boolean {
    return this.#assignmentAvailable(sessionId, 'working');
  }

  #assignmentAvailable(sessionId: string, activity: 'working' | 'idle'): boolean {
    if (this.#closed) return false;
    const row = this.#assignmentRow(undefined, sessionId);
    const owner = this.#ownership.resolve(sessionId);
    const bot = row === undefined ? undefined : this.#registry.get(row.bot_slug);
    if (
      row?.stop_state !== 'running' ||
      row.activity !== activity ||
      owner?.rootRole !== 'assignment' ||
      owner.botSlug !== row.bot_slug ||
      bot === undefined ||
      bot.paused === true ||
      isArchivedRow(row) ||
      this.#sessionArchived?.(sessionId) === true ||
      this.#assignmentArchives.has(sessionId) ||
      !this.#ownership.contentAvailable(sessionId)
    )
      return false;
    const permission = permissionFromRow(row);
    if (permission === undefined || this.#grants === undefined) return false;
    try {
      const grant = this.#grants.requireActive(row.bot_slug, permission.grantId);
      if (
        grant.workspaceId !== permission.workspaceId ||
        grant.workspacePath !== permission.primaryCwd
      )
        return false;
      this.#database.read((db) => requireSourceEffects(db, row.source_event_id, row.bot_slug));
      return true;
    } catch {
      return false;
    }
  }

  async #prepareNativeAssignmentStep(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const startedAt = Date.now();
    if (this.#preparedAssignments.has(sessionId))
      return !signal.aborted && this.#assignmentExecutionAvailable(sessionId);
    const trusted = () =>
      senderSessionIds.length > 0 &&
      senderSessionIds.every((id) => {
        const sender = this.#ownership.resolve(id);
        return (
          sender?.parentSessionId === sessionId &&
          sender.botSlug === this.#assignmentRow(undefined, sessionId)?.bot_slug &&
          sender.provenance === 'subagent' &&
          this.#ownership.contentAvailable(id)
        );
      });
    const cancellation = AbortSignal.any([signal, this.#waitLifetime.signal]);
    const valid = () =>
      !cancellation.aborted &&
      (this.#assignmentAvailable(sessionId, 'idle') ||
        this.#assignmentExecutionAvailable(sessionId)) &&
      trusted();
    const refuse = (reason = 'execution-unavailable') => {
      this.#warn?.(
        JSON.stringify({
          event: 'native-assignment-input',
          phase: 'refused',
          reason,
          session: sessionId,
          durationMs: Date.now() - startedAt,
        }),
      );
      return false;
    };
    if (!valid()) return refuse();
    const pending = this.#nativeAssignmentSteps.get(sessionId);
    if (pending !== undefined) {
      const accepted = await new Promise<boolean>((resolve) => {
        const finish = (result: boolean) => {
          cancellation.removeEventListener('abort', abort);
          resolve(result);
        };
        const abort = () => finish(false);
        cancellation.addEventListener('abort', abort, { once: true });
        void pending.step.then(finish, () => finish(false));
        if (cancellation.aborted) abort();
      });
      if (!valid()) return refuse();
      if (!accepted && pending.signal.aborted)
        return this.#prepareNativeAssignmentStep(sessionId, senderSessionIds, signal);
      return accepted;
    }
    const prepare = async () => {
      while (this.#assignmentRuns.has(sessionId)) {
        if (this.#preparedAssignments.has(sessionId)) return valid();
        await this.#assignmentRuns.get(sessionId);
      }
      while (valid() && this.#assignmentCapacityRefusal('awakened') !== undefined) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            unsubscribe();
            cancellation.removeEventListener('abort', finish);
            resolve();
          };
          const unsubscribe = this.#waitOptions.database.subscribe(finish);
          cancellation.addEventListener('abort', finish, { once: true });
          if (!valid() || this.#assignmentCapacityRefusal('awakened') === undefined) finish();
        });
      }
      if (!valid()) return refuse();
      const row = this.#assignmentRow(undefined, sessionId)!;
      const bot = this.#registry.get(row.bot_slug)!;
      const permission = permissionFromRow(row)!;
      const retained = row.model_group_id === null ? storedAssignmentTarget(row) : undefined;
      const directTarget = retained !== undefined && 'kind' in retained ? retained : undefined;
      if (directTarget?.kind === 'engine' && this.#sessionModels.get(sessionId) === null)
        return refuse('native-input-requires-dsh-agent');
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (accepted: boolean) => {
          if (settled) return;
          settled = true;
          cancellation.removeEventListener('abort', abort);
          resolve(accepted);
        };
        const abort = () => finish(false);
        cancellation.addEventListener('abort', abort, { once: true });
        const agentPreset = row.agent_preset ?? undefined;
        this.#trackAssignmentRun(sessionId, async () => {
          const modelRoute =
            this.#sessionModels.get(sessionId) === null
              ? await this.refreshAssignmentRoute(row.bot_slug, sessionId).catch(() =>
                  modelRouteFromRow(row),
                )
              : modelRouteFromRow(row);
          try {
            await this.#agents.runAssignment({
              ...this.#assignmentModelSelection(bot.slug, sessionId),
              sessionId,
              bot,
              text: '',
              resume: true,
              permission,
              recoveryEntry: () => this.getAssignment(bot.slug, sessionId),
              failEngineRecovery: (summary) =>
                this.#assignmentReporting.recordEngineRecoveryFailure(bot.slug, sessionId, summary),
              ...(modelRoute === undefined ? {} : { modelRoute }),
              ...(directTarget?.kind === 'route' ? { routingTarget: directTarget } : {}),
              ...(agentPreset === undefined ? {} : { agentPreset }),
              requireContent: () => {
                this.#requireTurnAccess(bot.slug, row.source_event_id ? [row.source_event_id] : []);
                this.#database.read((db) =>
                  requireAssignmentSource(db, row.source_event_id, bot.slug),
                );
              },
              setExecutionReady: (ready) => this.#setAssignmentExecutionReady(sessionId, ready),
              acceptNativeInput: () => {
                const accepted = valid();
                if (accepted) this.#groupContinuations.delete(sessionId);
                this.#warn?.(
                  JSON.stringify({
                    event: 'native-assignment-input',
                    phase: accepted ? 'ready' : 'refused',
                    session: sessionId,
                    durationMs: Date.now() - startedAt,
                  }),
                );
                finish(accepted);
                return accepted;
              },
              report: (report, execution) =>
                this.#assignmentReporting.recordReport(bot.slug, sessionId, report, execution),
              completedTurn: (execution) =>
                this.#assignmentReporting.recordCompletedAssignment(bot.slug, sessionId, execution),
              cancelledTurn: (execution) =>
                this.#assignmentReporting.recordUnsuccessfulAssignment(
                  bot.slug,
                  sessionId,
                  execution,
                  'cancelled',
                ),
              failedTurn: (execution) => this.#assignmentFailed(bot.slug, sessionId, execution),
            });
          } finally {
            this.#preparedAssignments.delete(sessionId);
            finish(false);
          }
        });
      });
    };
    const step = prepare();
    this.#nativeAssignmentSteps.set(sessionId, { step, signal: cancellation });
    try {
      return await step;
    } finally {
      if (this.#nativeAssignmentSteps.get(sessionId)?.step === step)
        this.#nativeAssignmentSteps.delete(sessionId);
    }
  }

  stopBot(botSlug: string): Promise<void> {
    return this.#cancellation.stopBot(botSlug);
  }

  stopSession(botSlug: string, sessionId: string): Promise<SessionStopOutcome> {
    return this.#cancellation.stopSession(botSlug, sessionId);
  }

  async stopTurn(
    botSlug: string,
    scope?: { autoContinueFor: string; channelId: string },
  ): Promise<{ sessionId: string } | undefined> {
    if (scope !== undefined) {
      const pending = this.#autoContinues.get(botSlug);
      if (
        this.#closed ||
        pending?.messageId !== scope.autoContinueFor ||
        pending.channelId !== scope.channelId
      )
        return undefined;
      this.#continuation.cancelAutoContinue(botSlug);
      return { sessionId: pending.sessionId };
    }
    const outcome = await this.stopAllSessions(botSlug);
    if (outcome.stopped.length === 0) return undefined;
    const sessionId =
      outcome.stopped.find((ref) => ref.role === 'orchestrator')?.sessionId ??
      this.currentOrchestratorSessionId(botSlug);
    return sessionId === undefined ? undefined : { sessionId };
  }

  stopAllSessions(botSlug: string): Promise<BotStopOutcome> {
    return this.#cancellation.stopAllSessions(botSlug);
  }

  heldCause(botSlug: string): BotHoldCause | undefined {
    return this.#held.get(botSlug);
  }

  releaseQuotaHold(botSlug: string): boolean {
    if (this.#held.get(botSlug) !== 'quota') return false;
    this.#release(botSlug);
    return true;
  }

  #hold(botSlug: string, cause: BotHoldCause): void {
    this.#held.set(botSlug, cause);
    this.#triageQueued.delete(botSlug);
    for (const [key, timer] of this.#digestTimers)
      if (key.startsWith(`${botSlug}:`) || key === `external:${botSlug}`) {
        clearTimeout(timer);
        this.#digestTimers.delete(key);
      }
    const snooze = this.#snoozeTimers.get(botSlug);
    if (snooze !== undefined) clearTimeout(snooze);
    this.#snoozeTimers.delete(botSlug);
    const retry = this.#inboxFactoryRetries.get(botSlug);
    if (retry?.timer !== undefined) clearTimeout(retry.timer);
    this.#inboxFactoryRetries.delete(botSlug);
  }

  #release(botSlug: string): void {
    this.#failureStreaks.delete(botSlug);
    if (!this.#held.delete(botSlug)) return;
    for (const key of this.#digestRetryAt.keys())
      if (key.startsWith(`${botSlug}:`)) {
        this.#digestRetryAt.delete(key);
        this.#digestFailureCount.delete(key);
      }
    this.#scheduling.resumeAutomaticWakes(botSlug);
  }

  async #appendModelSwitch(
    botSlug: string,
    sessionId: string,
    channelId: string | undefined,
    choice: ModelSwitch,
  ): Promise<void> {
    const bot = this.#registry.get(botSlug);
    if (bot === undefined) return;
    const original = channelId === undefined ? undefined : this.#channels.get(channelId);
    const channel =
      original !== undefined &&
      !isBotDmChannel(original) &&
      (original.type !== 'group' || original.members.includes(botSlug))
        ? original.id
        : this.#channels.getOrCreateDm(humanContext(botOwner(bot)), botSlug, bot.displayName)?.id;
    if (channel === undefined) return;
    await this.#channels
      .appendMessage(OWNER_HUMAN_CONTEXT, channel, {
        id: `model-switch-${randomUUID()}`,
        at: this.#now().toISOString(),
        author: { kind: 'system' },
        body: '',
        modelSwitch: {
          botSlug,
          botName: bot.displayName,
          sessionId,
          from: { provider: choice.from.provider, model: choice.from.model },
          to: { provider: choice.to.provider, model: choice.to.model },
          reason: choice.reason,
          ...(choice.until === undefined ? {} : { until: choice.until }),
        },
      })
      .catch(() => undefined);
  }

  async #holdForRestingRoute(
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ): Promise<boolean> {
    const rests = this.#continuation.restsOf(botSlug, error);
    if (rests === undefined || rests.length === 0) return false;
    const sessionId = this.currentOrchestratorSessionId(botSlug);
    if (!(error instanceof RouteRestingError) && sessionId !== undefined) {
      const fallback = await this.#continuation.fallBack(botSlug, sessionId, channelId, error);
      if (fallback !== undefined && 'kind' in fallback) {
        this.#failureStreaks.delete(botSlug);
        return true;
      }
    }
    const rest = rests[0]!;
    if (this.#held.has(botSlug)) return true;
    this.#failureStreaks.delete(botSlug);
    this.#hold(botSlug, 'quota');
    if (error instanceof RouteRestingError && error.subscription !== undefined) {
      await this.#appendHoldNotice(
        botSlug,
        channelId,
        `${this.#registry.get(botSlug)?.displayName ?? botSlug} paused: all Routing Group targets are resting. Try again after ${rest.until}.`,
        {
          cause: 'quota',
          rests: rests.slice(0, 32),
          engine: error.subscription,
          routingGroup: true,
        },
      );
      return true;
    }
    if (error instanceof EngineLimitError) {
      this.#warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'engine-limit-hold',
          botSlug,
          engine: error.engine,
          until: error.until,
        }),
      );
      const name = this.#registry.get(botSlug)?.displayName ?? botSlug;
      await this.#appendHoldNotice(
        botSlug,
        channelId,
        `${name} paused: the ${error.engine} subscription (${error.account}) is used up until ${error.until}. Switch it to an API model, or message it after the reset.`,
        {
          cause: 'quota',
          rests: error.rests.map(({ provider, model, until }) => ({ provider, model, until })),
          engine: { engine: error.engine, account: error.account, until: error.until },
        },
      );
      return true;
    }
    this.#warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'quota-hold',
        botSlug,
        provider: rest.provider,
        model: rest.model,
        until: rest.until,
      }),
    );
    await this.#appendHoldNotice(
      botSlug,
      channelId,
      `${this.#registry.get(botSlug)?.displayName ?? botSlug} paused: ${rests.map((item) => `${item.provider}/${item.model} rests until ${item.until}`).join('; ')}. Send it a message to try again.`,
      {
        cause: 'quota',
        rests: rests.map(({ provider, model, until }) => ({ provider, model, until })),
      },
    );
    return true;
  }

  async #appendHoldNotice(
    botSlug: string,
    channelId: string | undefined,
    body: string,
    stop: Pick<ChannelTurnStop, 'cause' | 'failures' | 'rests' | 'engine' | 'routingGroup'>,
  ): Promise<void> {
    const bot = this.#registry.get(botSlug);
    const sessionId = this.currentOrchestratorSessionId(botSlug);
    const original = channelId === undefined ? undefined : this.#channels.get(channelId);
    const channel =
      original === undefined ||
      isBotDmChannel(original) ||
      (original.type === 'group' && !original.members.includes(botSlug))
        ? bot === undefined
          ? undefined
          : this.#channels.getOrCreateDm(
              humanContext(botOwner(this.#registry.get(botSlug)!)),
              botSlug,
              bot.displayName,
            )?.id
        : original.id;
    if (bot === undefined || sessionId === undefined || channel === undefined) return;
    await this.#channels
      .appendMessage(OWNER_HUMAN_CONTEXT, channel, {
        id: `turn-stopped-${randomUUID()}`,
        at: this.#now().toISOString(),
        author: { kind: 'system' },
        body,
        turnStop: {
          botSlug,
          botName: bot.displayName,
          humanName:
            this.#channels.listHumanMembers(OWNER_HUMAN_CONTEXT, channel)[0]?.displayName ??
            'Human',
          sessionId,
          held: true,
          ...stop,
        },
      })
      .catch(() => undefined);
  }

  async #noteAutomaticFailure(
    botSlug: string,
    channelId: string | undefined,
    error: unknown,
  ): Promise<void> {
    const code = sessionFailureDetails(error).code;
    if (this.#held.has(botSlug)) return;
    if (await this.#holdForRestingRoute(botSlug, channelId, error)) return;
    if (code === undefined || TRANSIENT_FAILURE_CODES.has(code)) {
      this.#failureStreaks.delete(botSlug);
      return;
    }
    const streak = (this.#failureStreaks.get(botSlug) ?? 0) + 1;
    this.#failureStreaks.set(botSlug, streak);
    if (streak < FAILURE_HOLD_THRESHOLD) return;
    this.#failureStreaks.delete(botSlug);
    this.#hold(botSlug, 'failures');
    this.#warn?.(
      JSON.stringify({ component: 'bot-runtime', event: 'failure-hold', botSlug, code, streak }),
    );
    await this.#appendHoldNotice(
      botSlug,
      channelId,
      `${this.#registry.get(botSlug)?.displayName ?? botSlug} stopped after ${streak} failed runs in a row (${code}). Send it a message to try again.`,
      { cause: 'failures', failures: streak },
    );
  }

  async endGroup(channelId: string): Promise<void> {
    const at = this.#now().toISOString();
    await Promise.all(
      [...this.#turnSources]
        .filter(([, turn]) => turn.inboundChannelId === channelId)
        .map(([botSlug]) =>
          this.#cancellation.stopTurn(
            botSlug,
            `[Host: the Human disbanded the group your previous turn was answering at ${at}, and its messages were deleted. Do not continue that work.]\n\n`,
          ),
        ),
    );
  }

  async whenIdle(): Promise<void> {
    for (;;) {
      const pending = [
        ...this.#tails.values(),
        ...this.#assignmentRuns.values(),
        ...this.#assignmentNotices,
        ...this.#steerSettlements,
      ];
      if (pending.length === 0) return;
      await Promise.allSettled(pending);
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    for (const request of this.#tobCliRequests.values()) request.controller.abort();
    this.#inboxHistory.clear();
    this.#approvalCapacity.close();
    this.#waitLifetime.abort(new Error('Bot Runtime closed'));
    await Promise.allSettled(
      [...this.#typingTurns.values(), ...this.#typingAssignments.values()].map((processing) =>
        processing.stop(),
      ),
    );
    this.#typingTurns.clear();
    this.#typingAssignments.clear();
    for (const timer of this.#digestTimers.values()) clearTimeout(timer);
    this.#digestTimers.clear();
    for (const timer of this.#completionDigestTimers.values()) clearTimeout(timer);
    this.#completionDigestTimers.clear();
    for (const timer of this.#snoozeTimers.values()) clearTimeout(timer);
    this.#snoozeTimers.clear();
    this.#continuation.clearAutoContinues();
    for (const timer of this.#groupAdmissionRetries.values()) clearTimeout(timer);
    this.#groupAdmissionRetries.clear();
    this.#digestRetryAt.clear();
    this.#digestFailureCount.clear();
    this.#scheduling.clearInboxFactoryRetries();
    await Promise.allSettled([
      ...this.#tails.values(),
      ...this.#assignmentRuns.values(),
      ...this.#assignmentNotices,
    ]);
    this.#tails.clear();
    this.#assignmentRuns.clear();
    this.#assignmentAcceptances.clear();
    this.#assignmentNotices.clear();
    await this.#agents.close();
  }

  #admissionHandled(sourceEventId: string, botSlug: string): boolean {
    const row = this.#database.read((database) =>
      database
        .prepare(
          `SELECT attempt_state FROM inbox_admissions WHERE source_event_id = ? AND bot_slug = ?`,
        )
        .get(sourceEventId, botSlug),
    ) as { attempt_state: string } | undefined;
    return row?.attempt_state === 'handled';
  }

  async #runHumanDmTurn(
    bot: PersonaBotRecord,
    channelId: string,
    body: string,
    claim: SourceEventClaim,
    messageId: string,
    continuation?: DmContinuation,
    tobCliTurn?: TobCliTurn,
  ): Promise<void> {
    if (claim.reconciliationRequired === true) {
      throw new Error(`Source Event ${claim.sourceEventId} requires reconciliation before replay`);
    }
    if (!claim.shouldRun) return;
    if (this.#admissionHandled(claim.sourceEventId, bot.slug)) return;
    if (continuation === undefined && this.#autoContinues.get(bot.slug)?.messageId !== messageId)
      this.#continuation.cancelAutoContinue(bot.slug);

    const timestamp = this.#now().toISOString();
    let orchestrator = this.#ensureOrchestrator(bot, timestamp);

    const collected =
      tobCliTurn === undefined ? this.#collectInbox(bot.slug) : { units: [], eventIds: [] };
    this.#setObserved(collected.eventIds, timestamp, bot.slug);
    try {
      tobCliTurn?.signal.throwIfAborted();
      this.#observeAdmission(claim.sourceEventId, bot.slug, channelId, messageId, true);
      await this.#runOnLiveOrchestrator(bot, orchestrator, (session) => {
        orchestrator = session;
        return this.#runOrchestratorTurn(
          bot,
          session,
          claim.sourceEventId,
          channelId,
          (continuation === undefined ? '' : continuationNote(continuation)) +
            this.#channelAdmission.inboundChannelMessage(
              bot.slug,
              channelId,
              messageId,
              body,
              claim.sourceEventId,
            ),
          collected.units,
          this.#channels.message(channelId, messageId)?.memorySwitchTarget !== undefined,
          undefined,
          collected.eventIds,
          undefined,
          undefined,
          undefined,
          undefined,
          tobCliTurn,
        );
      });
    } catch (error) {
      this.#setObserved(collected.eventIds, null, bot.slug);
      this.#markSourceEventFailed(claim.sourceEventId);
      const code = sessionFailureDetails(error).code;
      const autoAttempts = continuation?.autoAttempts ?? 0;
      const delayMs = this.#autoContinueDelaysMs[autoAttempts];
      const resting = this.#continuation.restsOf(bot.slug, error) !== undefined;
      if (
        resting &&
        !(error instanceof RouteRestingError) &&
        tobCliTurn === undefined &&
        !this.#stoppedTurns.has(bot.slug) &&
        !this.#held.has(bot.slug) &&
        channelId === dmChannelId(bot.slug)
      ) {
        const fallback = await this.#continuation.fallBack(
          bot.slug,
          orchestrator.sessionId,
          channelId,
          error,
        );
        if (fallback !== undefined && 'kind' in fallback) {
          this.#failureStreaks.delete(bot.slug);
          this.#continuation.armAutoContinue(
            bot.slug,
            { channelId, messageId, sessionId: orchestrator.sessionId, attempt: autoAttempts },
            0,
            code ?? 'ROUTE_FALLBACK',
          );
          throw error;
        }
      }
      const autoContinue =
        tobCliTurn === undefined &&
        !resting &&
        code !== undefined &&
        TRANSIENT_FAILURE_CODES.has(code) &&
        delayMs !== undefined &&
        !this.#stoppedTurns.has(bot.slug) &&
        !this.#held.has(bot.slug) &&
        channelId === dmChannelId(bot.slug)
          ? {
              attempt: autoAttempts + 1,
              maxAttempts: this.#autoContinueDelaysMs.length,
              at: new Date(this.#now().getTime() + delayMs).toISOString(),
            }
          : undefined;
      const sessionId = orchestrator.sessionId;
      await this.#publishSessionFailure({
        channelId,
        requestMessageId: messageId,
        botSlug: bot.slug,
        sessionId,
        role: 'orchestrator',
        error,
        progress: await this.#readTurnProgress?.(sessionId).catch(() => undefined),
        ...(autoContinue === undefined ? {} : { autoContinue }),
      });
      if (resting) await this.#holdForRestingRoute(bot.slug, channelId, error);
      if (autoContinue !== undefined && code !== undefined && delayMs !== undefined)
        this.#continuation.armAutoContinue(
          bot.slug,
          { channelId, messageId, sessionId, attempt: autoContinue.attempt },
          delayMs,
          code,
        );
      throw error;
    }
    this.#markReportsHandled(collected.eventIds, bot.slug, orchestrator.sessionId);
    const handledAt = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET handled_at = ?, attempt_state = 'handled'
              WHERE source_event_id = ?`,
          )
          .run(handledAt, claim.sourceEventId);
        database
          .prepare(
            `
          UPDATE inbox_admissions
             SET handled_at = ?, attempt_state = 'handled', opened_at = COALESCE(opened_at, ?)
           WHERE source_event_id = ? AND bot_slug = ?
        `,
          )
          .run(handledAt, handledAt, claim.sourceEventId, bot.slug);
      },
      ['source-event', 'bot-inbox'],
    );
    this.#channels.admissionChanged?.(
      channelId,
      this.#database.read((database) => {
        const row = database
          .prepare('SELECT message_id FROM source_events WHERE source_event_id = ?')
          .get(claim.sourceEventId) as { message_id: string | null } | undefined;
        return row?.message_id ?? '';
      }),
    );
  }

  async #runOrchestratorTurn(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    sourceEventId: string | undefined,
    channelId: string | undefined,
    body: string,
    inboxUnits: InboxUnit[],
    coordinateBranchSwitch = false,
    markAttemptSideEffect: () => void = () => {
      if (sourceEventId !== undefined) this.#markSideEffectStarted(sourceEventId);
    },
    reportEventIds: readonly string[] = [],
    wakeEventIds: readonly string[] = sourceEventId === undefined ? [] : [sourceEventId],
    acceptNativeInput?: () => boolean,
    nativeSourceIds: readonly string[] = [],
    memoryObservation: 'source-event' | 'recovered-question' = 'source-event',
    tobCliTurn?: TobCliTurn,
  ): Promise<void> {
    if (!this.#memberBotEnabled(bot)) throw new TobError('permission-required');
    const readAdmissions = new Set<string>();
    this.#requireExecution?.(bot.slug);
    const choice =
      tobCliTurn === undefined ? this.#sessionModels.get(orchestrator.sessionId) : null;
    const explicitEngine =
      tobCliTurn === undefined && choice === null && this.#agents.runsOnEngine?.(bot.slug) === true;
    const selectGroup = async (attempted?: ReadonlySet<string>) =>
      choice?.kind === 'group'
        ? this.#pickSessionGroup(bot.slug, choice, attempted)
        : this.#groupFallback?.pickMixedOrchestrator?.(bot.slug, attempted);
    const group =
      tobCliTurn === undefined && (choice?.kind === 'group' || (choice === null && !explicitEngine))
        ? await selectGroup()
        : undefined;
    if (group?.kind === 'exhausted') throw new RouteRestingError(group.rests, group.subscription);
    if (group?.kind === 'unavailable') throw new RoutingGroupUnavailableError();
    const routingTarget =
      choice !== null && choice.kind !== 'group' ? directSessionTarget(choice) : group?.target;
    if (routingTarget?.kind === 'route') this.#requireModelRoute?.(bot.slug, routingTarget.route);
    let switchReason = group?.switchReason;
    if (routingTarget === undefined && !explicitEngine) {
      if (!orchestrator.resume) await this.#groupFallback?.start(bot.slug, orchestrator.sessionId);
      const fallback = await this.#continuation.fallBack(
        bot.slug,
        orchestrator.sessionId,
        channelId,
      );
      if (fallback !== undefined && !('kind' in fallback)) throw new RouteRestingError(fallback);
      if (fallback?.kind === 'switch') switchReason = fallback.reason;
    }
    const turnSources = new Set([
      ...(sourceEventId === undefined ? [] : [sourceEventId]),
      ...wakeEventIds,
      ...reportEventIds,
      ...nativeSourceIds,
    ]);
    this.#activeSessionModels.set(orchestrator.sessionId, choice);
    this.#turnSources.set(bot.slug, {
      sessionId: orchestrator.sessionId,
      eventIds: turnSources,
      acceptedEventIds: new Set(turnSources),
      inboundChannelId: channelId,
      steeredChannelIds: new Set(),
      memoryObservation,
    });
    const typingSources = [...turnSources, ...inboxUnits.map((unit) => unit.sourceEventId)];
    for (const unit of inboxUnits) {
      if (!unit.assignmentSessionId) continue;
      const origin = this.#assignmentRow(bot.slug, unit.assignmentSessionId)?.source_event_id;
      if (origin) typingSources.push(origin);
    }
    let processing: MessagingProcessing | undefined;
    const memorySource = this.#database.read((db) =>
      db
        .prepare(
          `
          SELECT e.source_kind, EXISTS (
            SELECT 1 FROM inbox_admissions a
             WHERE a.source_event_id = e.source_event_id AND a.bot_slug = ?
               AND a.reason = 'group-ordinary'
          ) AS ordinary
            FROM source_events e WHERE e.source_event_id = ?
        `,
        )
        .get(bot.slug, sourceEventId ?? null),
    );
    const observeMemory =
      tobCliTurn === undefined &&
      memoryObservation === 'source-event' &&
      sourceEventId !== undefined &&
      memorySource?.source_kind !== 'bridge-message' &&
      !(memorySource?.source_kind === 'bot-message' && memorySource.ordinary === 1);
    let memoryEventIds: string[] = [];
    let preserveObservation = false;
    const importedFiles = new Map<string, ChannelAttachmentRef>();
    const markSideEffect = (): void => {
      this.#requireTurnAccess(bot.slug, new Set([...turnSources, ...readAdmissions]));
      if (this.#stoppedTurns.has(bot.slug)) throw new Error(SESSION_STOPPED_REFUSAL);
      this.#database.read((db) => {
        for (const id of new Set([...turnSources, ...readAdmissions]))
          requireSourceEffects(db, id, bot.slug);
      });
      this.#markReportSideEffects([...reportEventIds, ...memoryEventIds], bot.slug);
      markAttemptSideEffect();
    };
    try {
      const ids = [...new Set(wakeEventIds)];
      if (ids.length > 0)
        this.#database.transaction(
          (database) => {
            const rows = database
              .prepare(
                `
          SELECT DISTINCT reason FROM inbox_admissions
           WHERE bot_slug = ? AND source_event_id IN (${ids.map(() => '?').join(', ')})
        `,
              )
              .all(bot.slug, ...ids) as { reason: string }[];
            const startedAt = this.#now().toISOString();
            for (const row of rows)
              database
                .prepare(
                  `
          INSERT INTO bot_source_wake_attempts
            (wake_id, bot_slug, source_class, session_id, started_at)
          VALUES (?, ?, ?, ?, ?)
        `,
                )
                .run(randomUUID(), bot.slug, row.reason, orchestrator.sessionId, startedAt);
          },
          ['bot-inbox'],
        );
      if (observeMemory) this.#memoryTurnOperations.add(bot.slug);
      const quoteSources = this.#turnQuoteBlocks(body);
      const change = observeMemory
        ? await (this.#memory?.prepareTurnAsync ?? this.#memory?.prepareTurn)?.(
            bot.slug,
            orchestrator.sessionId,
            {
              coordinateBranchSwitch,
            },
          )
        : undefined;
      if (this.#closed || this.#stoppedTurns.has(bot.slug))
        throw new Error(SESSION_STOPPED_REFUSAL);
      body = this.#refreshQuoteBlocks(body, quoteSources);
      const observation = observeMemory
        ? this.#memory?.preparedObservation?.(bot.slug, orchestrator.sessionId)
        : undefined;
      if (observation !== undefined) {
        preserveObservation = true;
        this.#memoryEvents.recordMemoryObservation(bot.slug, observation);
        preserveObservation = false;
      } else if (change !== undefined) {
        preserveObservation = true;
        this.#memoryEvents.admitMemoryChange(bot.slug, change);
        preserveObservation = false;
      }
      const memoryInbox = observeMemory
        ? this.#memoryEvents.collectMemoryInbox(bot.slug)
        : { units: [], eventIds: [] };
      memoryEventIds = memoryInbox.eventIds;
      const units = [...inboxUnits, ...memoryInbox.units];
      const inbox = [
        units.length === 0 ? '' : renderInbox(units, this.#promptText(bot.slug)),
        this.#inboxTriage.openSummary(bot.slug),
      ]
        .filter((part) => part.length > 0)
        .join('\n\n');
      this.#setObserved(memoryEventIds, this.#now().toISOString());
      if (observeMemory)
        this.#activeMemoryEvents.set(bot.slug, {
          eventIds: memoryEventIds,
          preserveObservation: false,
        });
      this.#memoryTurnOperations.delete(bot.slug);
      processing = this.#externalMessaging?.beginProcessing(bot.slug, typingSources);
      if (processing) this.#typingTurns.set(bot.slug, processing);
      this.#database.transaction(
        (db) => {
          const source = db
            .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
            .get(sourceEventId ?? null);
          const humanId = typeof source?.['human_id'] === 'string' ? source['human_id'] : undefined;
          if (humanId)
            db.prepare('INSERT OR REPLACE INTO usage_turn_humans VALUES (?, -1, ?, ?)').run(
              orchestrator.sessionId,
              humanId,
              this.#now().getTime(),
            );
          else
            db.prepare('DELETE FROM usage_turn_humans WHERE session_id = ? AND turn = -1').run(
              orchestrator.sessionId,
            );
        },
        ['usage'],
      );
      const envelope = this.#speakerInput(bot.slug, orchestrator.sessionId, [...turnSources], body);
      const request = randomUUID();
      const segments: TurnTargetSegment[] = [];
      const observeTurnTarget: NonNullable<OrchestratorAgentRun['observeTurnTarget']> = (
        turn,
        step,
        target,
        reason,
      ) => {
        const previous = segments.at(-1);
        if (previous?.turn === turn && JSON.stringify(previous.target) === JSON.stringify(target))
          return;
        const segment = {
          turn,
          step,
          request,
          target,
          ...(reason === undefined ? {} : { switchReason: reason }),
        };
        recordTurnTarget(this.#database, orchestrator.sessionId, segment);
        if (previous?.turn === turn && previous.step === step) segments.pop();
        segments.push(segment);
      };
      const run: OrchestratorAgentRun & { triage: OrchestratorInboxTriage } = {
        observeTurnTarget,
        ...(switchReason === undefined ? {} : { switchReason }),
        ...(choice === null ? {} : { groupEffort: choice.effort ?? null }),
        ...(tobCliTurn === undefined ? {} : { tobCliTurn }),
        setExecutionReady: (ready) => {
          if (ready) {
            this.#preparedOrchestrators.add(orchestrator.sessionId);
            this.#nativeStepReady.get(orchestrator.sessionId)?.(true);
          } else this.#preparedOrchestrators.delete(orchestrator.sessionId);
        },
        canUseEngineChannel: (id) => {
          const turn = this.#turnSources.get(bot.slug);
          if (turn?.sessionId !== orchestrator.sessionId) return false;
          const channel = this.#channels.get(id);
          if (channel === undefined || !this.#isMember(bot.slug, channel)) return false;
          return (
            turn.steeredChannelIds.has(id) ||
            this.#causalSending.turnSourceIn(
              bot.slug,
              id,
              readAdmissions,
              turn.acceptedEventIds,
            ) !== undefined
          );
        },
        priorEngineReplies: () => {
          const turn = this.#turnSources.get(bot.slug);
          if (turn?.sessionId !== orchestrator.sessionId) return new Set();
          return new Set(
            [...turn.acceptedEventIds].filter(
              (id) =>
                this.#continuation.routingGroupReplyState(bot.slug, orchestrator.sessionId, id) !==
                undefined,
            ),
          );
        },
        inputAccepted: () => envelope?.commit(),
        ...(acceptNativeInput === undefined ? {} : { acceptNativeInput }),
        requireContent: () => {
          this.#requireTurnAccess(bot.slug, new Set([...turnSources, ...readAdmissions]));
          this.#database.read((db) => {
            for (const id of new Set([...turnSources, ...readAdmissions]))
              requireSourceEffects(db, id, bot.slug);
          });
        },
        sessionId: orchestrator.sessionId,
        resume: orchestrator.resume,
        bot,
        toolsInterrupted: (calls) =>
          this.#cancellation.recordInterruptedTools(bot.slug, orchestrator.sessionId, calls),
        message: (() => {
          const human =
            channelId === undefined
              ? undefined
              : this.#channels
                  .listHumanMembers(humanContext(botOwner(bot)), channelId)
                  .find((member) => member.humanId === botOwner(bot));
          const stopped = this.#stopNotices.get(bot.slug) ?? '';
          this.#stopNotices.delete(bot.slug);
          return (
            stopped +
            this.#cancellation.takeInterruptedToolsNote(orchestrator.sessionId) +
            this.#interruptedDmNotice(bot.slug, channelId) +
            (envelope
              ? envelope.text
              : human === undefined || human.displayName === 'Human'
                ? body
                : 'Current Channel Human: ' +
                  JSON.stringify({
                    humanId: human.humanId,
                    displayName: human.displayName,
                  }) +
                  '\n' +
                  body)
          );
        })(),
        inbox,
        inboundChannelId: channelId,
        ...this.#orchestratorServices(bot, {
          sessionId: orchestrator.sessionId,
          channelId,
          sourceEventId,
          markSideEffect,
          readAdmissions,
          importedFiles,
          turnSources,
          observeMemory,
          observeReads: true,
          modelContent: body + '\n' + inbox,
          replyTargets: () => segments,
        }),
      };
      if (group?.kind === 'target') {
        await this.#continuation.runMixedGroupTurn(run, group.target, sourceEventId, selectGroup);
      } else {
        try {
          await this.#agents.runOrchestrator({
            ...run,
            ...(routingTarget === undefined ? {} : { routingTarget }),
          });
        } catch (error) {
          const rest =
            routingTarget === undefined
              ? undefined
              : this.#continuation.routingTargetFailure(routingTarget, error);
          if (rest !== undefined) throw new RouteRestingError([rest]);
          throw error;
        }
      }
      this.#requireTurnAccess(bot.slug, turnSources);
      if (acceptNativeInput === undefined) envelope?.commit();
      if (tobCliTurn !== undefined && sourceEventId !== undefined)
        run.triage.resolve({ ids: [sourceEventId], outcome: 'done' });
      if (observeMemory) {
        await this.#memoryEvents.settleSteerMemoryScan(bot.slug);
        this.#memoryTurnOperations.add(bot.slug);
        await (this.#memory?.reconcileTurnAsync ?? this.#memory?.reconcileTurn)?.({
          botSlug: bot.slug,
          sessionId: orchestrator.sessionId,
          sourceEventId,
          preserveObservation: this.#activeMemoryEvents.get(bot.slug)?.preserveObservation ?? false,
        });
        await this.#recordTurnCommits(bot.slug, sourceEventId!);
      }
      this.#markReportsHandled(memoryEventIds);
      this.#settleHarvestHandled(bot.slug, [...readAdmissions]);
      this.#notifyReadAdmissions(readAdmissions);
      if (!this.#triageRunning.has(bot.slug)) this.#triageBaseline.delete(bot.slug);
      if (tobCliTurn === undefined && !this.#stoppedTurns.has(bot.slug))
        this.#activityEvents.queueTriage(bot.slug);
    } catch (error) {
      this.#setObserved(memoryEventIds, null);
      this.#settleHarvestFailure(bot.slug, [...readAdmissions], String(error));
      this.#notifyReadAdmissions(readAdmissions);
      if (observeMemory) {
        await this.#memoryEvents.settleSteerMemoryScan(bot.slug);
        this.#memoryTurnOperations.add(bot.slug);
        await (this.#memory?.abortTurnAsync ?? this.#memory?.abortTurn)?.(
          bot.slug,
          orchestrator.sessionId,
          preserveObservation || this.#activeMemoryEvents.get(bot.slug)?.preserveObservation,
        );
      }
      throw error;
    } finally {
      this.#memoryTurnOperations.delete(bot.slug);
      await processing?.stop();
      if (this.#typingTurns.get(bot.slug) === processing) this.#typingTurns.delete(bot.slug);
      if (this.#turnSources.get(bot.slug)?.eventIds === turnSources) {
        this.#turnSources.delete(bot.slug);
        this.#stoppedTurns.delete(bot.slug);
      }
      if (observeMemory) this.#activeMemoryEvents.delete(bot.slug);
      this.#activeSessionModels.delete(orchestrator.sessionId);
      this.#originalAttachments.clear(orchestrator.sessionId);
    }
  }

  #orchestratorServices(
    bot: PersonaBotRecord,
    turn: OrchestratorServiceTurn,
  ): Omit<
    OrchestratorAgentRun,
    'sessionId' | 'resume' | 'bot' | 'message' | 'inbox' | 'inboundChannelId'
  > & { triage: OrchestratorInboxTriage } {
    const channels = this.#channelAccess(
      bot.slug,
      turn.channelId,
      turn.sourceEventId,
      turn.sessionId,
      turn.markSideEffect,
      turn.readAdmissions,
      (ref) => turn.importedFiles.set(attachmentIdentity(ref), ref),
      turn.observeReads,
      turn.modelContent,
      turn.replyTargets,
    );
    return {
      ...(this.#team
        ? {
            speakerPolicy: (humanId?: string, topic?: string) => {
              this.#requireTurnAccess(bot.slug, turn.turnSources);
              const source = this.#database.read((db) =>
                db
                  .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
                  .get(turn.sourceEventId ?? null),
              );
              return this.#team!.speakerPolicy.forHuman(
                humanId ??
                  (typeof source?.['human_id'] === 'string' ? source['human_id'] : botOwner(bot)),
                topic,
              );
            },
          }
        : {}),
      ...(this.#tob?.isTob(bot.slug) ? { tobCli: true } : {}),
      ...(this.#externalMessaging === undefined
        ? {}
        : {
            externalMessaging: {
              connected: () => {
                const { identities, grants } = this.#externalMessaging!.deletionDependencies(
                  bot.slug,
                );
                return identities.length > 0 || grants.length > 0;
              },
              senderPermissions: (id) => this.#externalMessaging!.senderPermissions(bot.slug, id),
              directory: (query) => this.#externalMessaging!.directory(bot.slug, query),
              reachable: async (bindingId, cursor) => {
                const snapshot = await this.#externalMessaging!.snapshot(bot.slug);
                const identities = (snapshot.identities ?? []).filter(
                  (identity) =>
                    !identity.revokedAt &&
                    identity.enabled &&
                    identity.availability === 'available' &&
                    (bindingId === undefined || identity.id === bindingId),
                );
                if (bindingId && !identities.length) throw new Error('identity-unavailable');
                if (cursor && !bindingId) throw new Error('bad-request');
                return Promise.all(
                  identities.map(async (identity) => {
                    const app = {
                      bindingId: identity.id,
                      platform: identity.platform,
                      accountName: identity.name,
                    };
                    try {
                      return {
                        ...app,
                        page: await this.#externalMessaging!.reachable(
                          bot.slug,
                          identity.id,
                          cursor,
                        ),
                      };
                    } catch (error) {
                      return {
                        ...app,
                        reason:
                          error instanceof Error &&
                          'code' in error &&
                          typeof error.code === 'string'
                            ? error.code
                            : 'provider-unavailable',
                      };
                    }
                  }),
                );
              },
              postConversation: (bindingId, conversationId, requestId, text) => {
                turn.markSideEffect();
                return this.#externalMessaging!.postConversation(
                  bot.slug,
                  bindingId,
                  conversationId,
                  requestId,
                  text,
                );
              },
              targets: async () => {
                const snapshot = await this.#externalMessaging!.snapshot(bot.slug);
                return snapshot.grants
                  .filter((g) => g.availability === 'available' && !g.revokedAt && g.canPost)
                  .flatMap((g) =>
                    g.postConversationId
                      ? [
                          {
                            grantId: g.id,
                            bindingId: g.bindingId,
                            accountRef: g.accountRef,
                            platform: g.platform,
                            accountName: g.accountName,
                            targetName: g.targetName,
                            conversationId: g.postConversationId,
                            canPost: true as const,
                          },
                        ]
                      : [],
                  );
              },
              post: (grantId, requestId, text) => {
                turn.markSideEffect();
                return this.#externalMessaging!.post(bot.slug, grantId, requestId, text);
              },
              outbox: (intentId) => {
                if (intentId) return this.#externalMessaging!.inspectIntent(bot.slug, intentId);
                return this.#externalMessaging!
                  .history(bot.slug)
                  .filter((intent) => intent.report)
                  .slice(0, 10)
                  .map(({ text, ...intent }) => ({
                    ...intent,
                    preview: text.slice(0, 160),
                  }));
              },
              policies: async () => {
                const snapshot = await this.#externalMessaging!.snapshot(bot.slug);
                return snapshot.grants
                  .filter((grant) => grant.receiveScope && grant.groupPolicy)
                  .map((grant) => ({
                    grantId: grant.id,
                    group: grant.targetName,
                    policy: grant.groupPolicy!,
                    ...(grant.receiveTargetChannelId &&
                    this.#channels.get(grant.receiveTargetChannelId)
                      ? {
                          memberWake: externalMemberWake(
                            this.#channels.get(grant.receiveTargetChannelId)!,
                            bot.slug,
                            this.#sourcePolicy
                              .list(bot.slug)
                              .find((rule) => rule.sourceClass === 'group-ordinary'),
                            this.#externalMessaging!.defaults(),
                          ),
                        }
                      : {}),
                    ordinaryDelivery: grant.ordinaryDelivery ?? 'unverified',
                  }));
              },
              setPolicy: (grantId, input) => {
                turn.markSideEffect();
                return this.#externalMessaging!.inbound.setPolicy(bot.slug, grantId, input, {
                  kind: 'bot',
                  botSlug: bot.slug,
                });
              },
              threads: async () => {
                const snapshot = await this.#externalMessaging!.snapshot(bot.slug);
                return snapshot.grants.flatMap((grant) =>
                  (grant.threadPolicies ?? []).map((thread) => ({
                    ...thread,
                    grantId: grant.id,
                    group: grant.targetName,
                  })),
                );
              },
              setThread: (sourceEventId, input) => {
                turn.markSideEffect();
                return this.#externalMessaging!.inbound.setThread(bot.slug, sourceEventId, input, {
                  kind: 'bot',
                  botSlug: bot.slug,
                });
              },
              read: (id: string) => {
                const source = this.#externalMessaging!.inbound.readShared(bot.slug, id);
                if (turn.observeReads)
                  this.#messagingEvents.observeExternalRead(bot.slug, [id], turn.readAdmissions);
                return source;
              },
              replyCapability: (source, signal) =>
                this.#externalMessaging!.replyCapability(bot.slug, source, signal),
              share: (id, destinationChannelId) => {
                turn.markSideEffect();
                return this.#externalMessaging!.inbound.share(bot.slug, id, destinationChannelId);
              },
              context: async (id: string, query: ExternalContextQuery, signal?: AbortSignal) => {
                const result = await this.#externalMessaging!.inbound.context(
                  bot.slug,
                  id,
                  turn.sessionId,
                  query,
                  signal,
                );
                if (turn.observeReads)
                  this.#messagingEvents.observeExternalRead(
                    bot.slug,
                    result.messages.map((item) => item.sourceEventId),
                    turn.readAdmissions,
                  );
                return result;
              },
              saveFile: async (input) => {
                if (this.#attachments === undefined || this.#grants === undefined)
                  throw new Error('Bridge file operations are unavailable');
                const destinationGrant = this.#grants.requireActive(bot.slug, input.grantId);
                if (destinationGrant.orchestratorWrite !== true)
                  throw new Error('Destination requires Orchestrator write authorization');
                const ref = await (
                  input.representation === 'playback'
                    ? this.#externalMessaging!.prepareAudio
                    : this.#externalMessaging!.acquireFile
                )(bot.slug, input.sourceEventId, input.attachmentId);
                return saveAttachmentFile(input, {
                  botSlug: bot.slug,
                  grants: this.#grants,
                  attachments: this.#attachments,
                  source: () => {
                    if (!this.#externalMessaging!.inbound.available(bot.slug, input.sourceEventId))
                      throw new Error('Bridge file source is unavailable');
                    return this.#attachments!.current(ref);
                  },
                });
              },
              replyFile: (id: string, fileId: string, messageKey?: string) => {
                const ref = turn.importedFiles.get(fileId);
                if (ref === undefined || this.#attachments === undefined)
                  throw new Error(
                    'Select a result file with channel_attachment_import in this run before replying',
                  );
                turn.markSideEffect();
                return this.#externalMessaging!.replyFile(
                  bot.slug,
                  id,
                  this.#attachments.current(ref),
                  messageKey,
                );
              },
              reply: (id: string, text: string, messageKey?: string) => {
                turn.markSideEffect();
                return this.#externalMessaging!.reply(bot.slug, id, text, messageKey);
              },
            },
          }),
      inboxHistory: (input) => this.#inboxHistory.list(bot.slug, input),
      triage: this.#inboxTriage.access({
        botSlug: bot.slug,
        sessionId: turn.sessionId,
        current: () => [...turn.turnSources, ...turn.readAdmissions],
        changed: (changedChannelId, messageId) =>
          this.#channels.admissionChanged?.(changedChannelId, messageId),
        snoozed: () => this.#activityEvents.armSnooze(bot.slug),
      }),
      channels,
      replyDestination: (id) => {
        const source = this.#database.read((db) => {
          requireSourceEffects(db, id, bot.slug);
          return db
            .prepare('SELECT source_kind FROM source_events WHERE source_event_id = ?')
            .get(id);
        });
        if (source?.source_kind === 'bridge-message') {
          return {
            kind: 'external',
            source: this.#externalMessaging!.inbound.readShared(bot.slug, id),
          };
        }
        const reply = channels.replySource!(id);
        return { kind: 'channel', ...reply };
      },
      sourcePolicy: {
        list: () => this.#sourcePolicy.list(bot.slug),
        setAssignmentReport: (wake) => {
          turn.markSideEffect();
          const changed = this.#sourcePolicy.setAssignmentReport(bot.slug, wake, {
            kind: 'bot',
            botSlug: bot.slug,
          });
          return changed;
        },
        resetAssignmentReport: () => {
          turn.markSideEffect();
          const changed = this.#sourcePolicy.resetAssignmentReport(bot.slug, {
            kind: 'bot',
            botSlug: bot.slug,
          });
          return changed;
        },
        setGroupOrdinary: (wake, digestCount, digestIntervalSeconds) => {
          turn.markSideEffect();
          return this.#sourcePolicy.setGroupOrdinary(
            bot.slug,
            wake,
            digestCount,
            digestIntervalSeconds,
            { kind: 'bot', botSlug: bot.slug },
          );
        },
        setImmediateDelivery: (sourceClass, delivery) => {
          turn.markSideEffect();
          return this.#sourcePolicy.setImmediateDelivery(bot.slug, sourceClass, delivery, {
            kind: 'bot',
            botSlug: bot.slug,
          });
        },
        resetImmediateDelivery: (sourceClass) => {
          turn.markSideEffect();
          return this.#sourcePolicy.resetImmediateDelivery(bot.slug, sourceClass, {
            kind: 'bot',
            botSlug: bot.slug,
          });
        },
        resetGroupOrdinary: () => {
          turn.markSideEffect();
          return this.#sourcePolicy.resetGroupOrdinary(bot.slug, {
            kind: 'bot',
            botSlug: bot.slug,
          });
        },
      },
      ...(this.#schedules === undefined
        ? {}
        : { schedules: bindScheduleCommands(this.#schedules, bot, () => turn.markSideEffect()) }),
      ...(turn.observeMemory
        ? {
            memory: {
              continueFromCommit: (sha, branch) => {
                if (this.#memory === undefined) throw new Error('Memory is unavailable');
                const result = this.#memory.continueFromCommit({
                  botSlug: bot.slug,
                  sessionId: turn.sessionId,
                  sha,
                  branch,
                });
                turn.markSideEffect();
                return result;
              },
              switchBranch: (branch) => {
                if (this.#memory === undefined) throw new Error('Memory is unavailable');
                const result = this.#memory.switchBranch({
                  botSlug: bot.slug,
                  sessionId: turn.sessionId,
                  branch,
                });
                turn.markSideEffect();
                return result;
              },
            },
          }
        : {}),
      assignments: this.#assignmentAccess(
        bot,
        turn.sourceEventId,
        turn.markSideEffect,
        turn.sessionId,
        turn.readAdmissions,
      ),
    };
  }

  async #publishSessionFailure(input: {
    channelId: string;
    requestMessageId?: string;
    botSlug: string;
    sessionId: string;
    role: 'orchestrator' | 'assignment';
    error: unknown;
    context?: string;
    assignmentAnswerTo?: string;
    progress?: SessionFailureProgress | undefined;
    autoContinue?: { attempt: number; maxAttempts: number; at: string };
  }): Promise<void> {
    if (input.error instanceof RouteRestingError) return;
    if (
      input.role === 'orchestrator' &&
      input.error instanceof EngineLimitError &&
      (await this.#holdForRestingRoute(input.botSlug, input.channelId, input.error))
    )
      return;
    const details = sessionFailureDetails(input.error);
    const failure = {
      role: input.role,
      sessionId: input.sessionId,
      ...details,
      ...(input.progress === undefined ? {} : { progress: input.progress }),
      ...(input.autoContinue === undefined ? {} : { autoContinue: input.autoContinue }),
      ...(input.context === undefined ? {} : { context: input.context }),
      ...(input.assignmentAnswerTo === undefined
        ? {}
        : { assignmentAnswerTo: input.assignmentAnswerTo }),
    };
    const original = this.#channels.get(input.channelId);
    const target =
      original !== undefined &&
      (isBotDmChannel(original) ||
        (original.type === 'group' && !original.members.includes(input.botSlug)))
        ? this.#channels.getOrCreateDm(
            humanContext(botOwner(this.#registry.get(input.botSlug)!)),
            input.botSlug,
            this.#registry.get(input.botSlug)?.displayName ?? input.botSlug,
          )
        : original;
    if (target === undefined)
      throw new Error('Could not publish Session failure: Channel is missing');
    const result = await this.#channels.appendMessage(OWNER_HUMAN_CONTEXT, target.id, {
      id: `session-failure-${randomUUID()}`,
      at: this.#now().toISOString(),
      author: { kind: 'bot', slug: input.botSlug },
      body: sessionFailureBody(details),
      format: 'text',
      sessionFailure: {
        ...failure,
        ...(input.requestMessageId === undefined
          ? {}
          : { requestMessageId: input.requestMessageId }),
      },
    });
    if (result === undefined) {
      throw new Error('Could not publish Session failure: Channel is missing');
    }
  }

  #assignmentAccess(
    bot: PersonaBotRecord,
    sourceEventId: string | undefined,
    markAttemptSideEffect: () => void = () => {
      if (sourceEventId !== undefined) this.#markSideEffectStarted(sourceEventId);
    },
    orchestratorSessionId?: string,
    readAdmissions?: Set<string>,
  ): OrchestratorAssignmentAccess {
    const markSideEffect = markAttemptSideEffect;
    const refuseStopped = () => {
      if (orchestratorSessionId !== undefined && this.#stoppedTurns.has(bot.slug))
        throw new Error(SESSION_STOPPED_REFUSAL);
    };
    const trackDelivery = (sessionId: string, pending: boolean) => {
      if (orchestratorSessionId === undefined) return;
      if (pending) this.#pendingDeliveries.set(sessionId, orchestratorSessionId);
      else this.#pendingDeliveries.delete(sessionId);
    };
    return {
      create: (input) => {
        if (sourceEventId === undefined)
          throw new Error('Assignment creation requires a Source Event');
        refuseStopped();
        this.#database.read((db) => requireSourceEffects(db, sourceEventId, bot.slug));
        const outcome = this.#createOrReuseAssignment(bot, sourceEventId, input, trackDelivery);
        if (outcome.outcome === 'created' || outcome.outcome === 'reused') {
          markSideEffect();
          this.#assignmentEvents.linkRequestAssignment(sourceEventId, outcome.assignment.sessionId);
        }
        return outcome;
      },
      refreshRoute: (sessionId) => this.refreshAssignmentRoute(bot.slug, sessionId, true),
      grants: () => this.#grants?.list(bot.slug) ?? [],
      list: () => this.listAssignments(bot.slug),
      query: (input) => queryAssignmentDirectory(this.listAssignments(bot.slug), input),
      archive: (sessionId) => this.#archiveAssignment(bot, sessionId, markSideEffect),
      unarchive: (sessionId) => this.#unarchiveAssignment(bot, sessionId, markSideEffect),
      inspect: (sessionId) => this.getAssignment(bot.slug, sessionId),
      tail: async (sessionId) => {
        if (this.getAssignment(bot.slug, sessionId) === undefined)
          throw new Error(`Unknown Assignment Session: ${sessionId}`);
        if (this.#readAssignmentTail === undefined)
          throw new Error('DSH Session Query is unavailable');
        return this.#readAssignmentTail(sessionId);
      },
      reportPage: (request) => this.#assignmentReporting.reportPage(bot.slug, request),
      request: (input) => {
        refuseStopped();
        if (sourceEventId !== undefined)
          this.#database.read((db) => requireSourceEffects(db, sourceEventId, bot.slug));
        const outcome = this.#requestAssignment(bot, input, trackDelivery, sourceEventId);
        if (outcome.delivery !== 'capacity' && outcome.delivery !== 'refused') {
          markSideEffect();
          if (sourceEventId !== undefined)
            this.#assignmentEvents.linkRequestAssignment(sourceEventId, input.sessionId);
        }
        return outcome;
      },
      wait: (sessionId, signal, timeoutMs) =>
        this.#assignmentEvents.wait(
          bot,
          orchestratorSessionId,
          readAdmissions,
          sessionId,
          signal,
          timeoutMs,
        ),
      stop: (sessionId) => this.#stopAssignment(bot, sessionId, markSideEffect),
    };
  }

  #claimSourceEvent(
    human: HumanContext,
    botSlug: string,
    channelId: string,
    messageId: string,
    body: string,
    createdAt: string,
  ): SourceEventClaim {
    return this.#database.transaction(
      (database) => {
        const sourcePolicy = this.#sourcePolicy.resolveIn(database, botSlug, 'human-dm');
        const existing = database
          .prepare(
            `SELECT source_event_id, bot_slug, body, handled_at, attempt_state
               FROM source_events
              WHERE channel_id = ? AND message_id = ?`,
          )
          .get(channelId, messageId) as SourceEventRow | undefined;
        if (existing !== undefined) {
          if (existing.bot_slug !== botSlug || existing.body !== body) {
            throw new Error(`Source Event identity conflict for Channel message ${messageId}`);
          }
          database
            .prepare(
              `
            INSERT OR IGNORE INTO inbox_admissions (
              source_event_id, bot_slug, reason, attempt_state, handled_at,
              source_policy_revision, source_policy_wake_mode
            ) VALUES (?, ?, 'human-dm', ?, ?, ?, ?)
          `,
            )
            .run(
              existing.source_event_id,
              botSlug,
              existing.attempt_state,
              existing.handled_at,
              sourcePolicy.revision,
              sourcePolicy.wake,
            );
          if (existing.handled_at !== null || existing.attempt_state === 'handled') {
            return {
              sourceEventId: existing.source_event_id,
              shouldRun: false,
            };
          }
          if (existing.attempt_state === 'running' || existing.attempt_state === 'needs-repair') {
            return {
              sourceEventId: existing.source_event_id,
              shouldRun: false,
              reconciliationRequired: true,
            };
          }
          database
            .prepare(
              `UPDATE source_events SET attempt_state = 'running'
                WHERE source_event_id = ?`,
            )
            .run(existing.source_event_id);
          database
            .prepare(
              `
            UPDATE inbox_admissions SET attempt_state = 'running', last_error = NULL
            WHERE source_event_id = ? AND bot_slug = ?
          `,
            )
            .run(existing.source_event_id, botSlug);
          return { sourceEventId: existing.source_event_id, shouldRun: true };
        }

        const sourceEventId = this.#createEventId();
        database
          .prepare(
            `INSERT INTO source_events (
               source_event_id, source_kind, bot_slug, channel_id, message_id,
               body, created_at, attempt_state, human_id
             ) VALUES (?, 'human-message', ?, ?, ?, ?, ?, 'running', ?)`,
          )
          .run(sourceEventId, botSlug, channelId, messageId, body, createdAt, human.humanId);
        database
          .prepare(
            `
          INSERT INTO inbox_admissions
            (source_event_id, bot_slug, reason, attempt_state,
             source_policy_revision, source_policy_wake_mode)
          VALUES (?, ?, 'human-dm', 'running', ?, ?)
        `,
          )
          .run(sourceEventId, botSlug, sourcePolicy.revision, sourcePolicy.wake);
        return { sourceEventId, shouldRun: true };
      },
      ['source-event', 'bot-inbox'],
    );
  }

  #markSideEffectStarted(sourceEventId: string): void {
    this.#database.transaction(
      (database) => {
        requireSourceContent(database, sourceEventId);
        database
          .prepare(
            `UPDATE source_events
                SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
              WHERE source_event_id = ? AND attempt_state = 'running'`,
          )
          .run(this.#now().toISOString(), sourceEventId);
        database
          .prepare(
            `
          UPDATE inbox_admissions
             SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
           WHERE source_event_id = ? AND attempt_state = 'running'
        `,
          )
          .run(this.#now().toISOString(), sourceEventId);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  #markSourceEventFailed(sourceEventId: string): void {
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events
                SET attempt_state = CASE
                      WHEN side_effect_started_at IS NULL THEN 'retryable'
                      ELSE 'needs-repair'
                    END
              WHERE source_event_id = ? AND attempt_state = 'running'`,
          )
          .run(sourceEventId);
        database
          .prepare(
            `
          UPDATE inbox_admissions
             SET attempt_state = CASE
               WHEN side_effect_started_at IS NULL THEN 'retryable' ELSE 'needs-repair' END
           WHERE source_event_id = ? AND attempt_state = 'running'
        `,
          )
          .run(sourceEventId);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  #recoverInterruptedAttempts(): Array<{
    channel_id: string;
    message_id: string;
    body: string;
  }> {
    const interruptedDms = this.#database.read((database) =>
      database
        .prepare(
          `
        SELECT e.channel_id, e.message_id, e.body
          FROM source_events e
          JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
         WHERE e.source_kind = 'human-message' AND a.reason = 'human-dm'
           AND e.attempt_state = 'running' AND a.attempt_state = 'running'
           AND e.channel_id IS NOT NULL AND e.message_id IS NOT NULL
         ORDER BY e.created_at, e.message_id
      `,
        )
        .all(),
    ) as Array<{ channel_id: string; message_id: string; body: string }>;
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events SET attempt_state = 'needs-repair'
              WHERE attempt_state = 'running' AND side_effect_started_at IS NOT NULL`,
          )
          .run();
        database
          .prepare(
            `UPDATE source_events SET attempt_state = 'retryable'
              WHERE attempt_state = 'running' AND side_effect_started_at IS NULL`,
          )
          .run();
      },
      ['source-event', 'bot-inbox'],
    );
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            "UPDATE assignments SET stop_state = 'stopped', activity = 'idle', continuity_key = NULL, open_ask_source_event_id = NULL, open_ask_at = NULL WHERE stop_state = 'requested'",
          )
          .run();

        const interrupted = database
          .prepare(
            "SELECT bot_slug, session_id FROM assignments WHERE activity = 'working' AND stop_state = 'running'",
          )
          .all() as Array<Pick<AssignmentRow, 'bot_slug' | 'session_id'>>;
        const at = this.#now().toISOString();
        for (const assignment of interrupted) {
          const id = this.#createEventId();
          const rule = this.#sourcePolicy.resolveIn(
            database,
            assignment.bot_slug,
            'assignment-lifecycle',
          );
          database
            .prepare(
              "UPDATE assignments SET activity = 'error', updated_at = ? WHERE bot_slug = ? AND session_id = ? AND activity = 'working' AND stop_state = 'running'",
            )
            .run(at, assignment.bot_slug, assignment.session_id);
          database
            .prepare(
              `
              INSERT INTO source_events (source_event_id, source_kind, bot_slug, assignment_session_id,
                body, created_at, handled_at, attempt_state, expects_reply, payload_json)
              VALUES (?, 'assignment-lifecycle', ?, ?, ?, ?, ?, 'handled', 0, ?)
            `,
            )
            .run(
              id,
              assignment.bot_slug,
              assignment.session_id,
              'Host recovery found this Assignment still marked as executing. Its prior execution outcome is unconfirmed; it was not resumed automatically. Its context is kept: send_assignment_request with this Session id continues it; archive_assignment resolves it.',
              at,
              at,
              JSON.stringify({
                author: { kind: 'system' },
                assignmentLifecycle: {
                  state: 'interrupted',
                  cause: 'host-recovery',
                },
              }),
            );
          database
            .prepare(
              `
              INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
              VALUES (?, ?, 'assignment-lifecycle', ?, ?)
            `,
            )
            .run(id, assignment.bot_slug, rule.revision, rule.wake);
        }
      },
      ['assignments', 'source-event', 'bot-inbox'],
    );
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `
        UPDATE inbox_admissions SET attempt_state =
          CASE WHEN side_effect_started_at IS NULL THEN 'retryable' ELSE 'needs-repair' END
        WHERE attempt_state = 'running'
      `,
          )
          .run();
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET attempt_state = 'needs-repair',
                   last_error = 'Assignment report observation interrupted'
             WHERE reason IN ('assignment-report', 'assignment-lifecycle')
               AND observed_at IS NOT NULL
               AND attempt_state = 'retryable'
          `,
          )
          .run();
        database
          .prepare(
            `
            UPDATE source_events SET observed_at = NULL
             WHERE source_kind IN ('memory-change', 'schedule', 'bridge-message')
               AND source_event_id IN (
                 SELECT source_event_id FROM inbox_admissions
                  WHERE reason IN ('memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm') AND attempt_state = 'retryable'
                    AND side_effect_started_at IS NULL
               )
          `,
          )
          .run();
        database
          .prepare(
            `
            UPDATE inbox_admissions SET observed_at = NULL
             WHERE (reason IN ('memory-change', 'schedule', 'group-mention', 'group-ordinary') OR
                    (reason = 'human-dm' AND source_event_id IN (
                      SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'
                    ))) AND attempt_state = 'retryable'
               AND side_effect_started_at IS NULL
          `,
          )
          .run();
      },
      ['source-event', 'bot-inbox'],
    );
    return interruptedDms;
  }

  async #retireWithdrawnNetworkAdmissions(botSlug: string, withdrawnHost?: string): Promise<void> {
    const membership = this.#botNetwork?.membership;
    if (membership === undefined && withdrawnHost === undefined) return;
    const pending = this.#database.read((database) =>
      database
        .prepare(
          `
        SELECT a.source_event_id, e.channel_id, e.message_id
          FROM inbox_admissions a JOIN source_events e USING (source_event_id)
         WHERE a.bot_slug = ? AND a.reason = 'bot-dm'
           AND a.attempt_state IN ('pending', 'retryable')
           AND a.observed_at IS NULL AND a.side_effect_started_at IS NULL
           AND a.ignored_at IS NULL
      `,
        )
        .all(botSlug),
    ) as Array<{
      source_event_id: string;
      channel_id: string;
      message_id: string;
    }>;
    const hosts = new Map<string, boolean>();
    for (const row of pending) {
      const peer = this.#channels.get(row.channel_id)?.remoteBot;
      if (peer === undefined) continue;
      if (withdrawnHost !== undefined && peer.hostId !== withdrawnHost) continue;
      const unverified = peer.membership === undefined;
      if (!unverified && !hosts.has(peer.hostId)) {
        const state =
          withdrawnHost === peer.hostId
            ? 'withdrawn'
            : await membership!(peer.hostId).catch(() => 'unavailable');
        hosts.set(peer.hostId, state === 'withdrawn');
      }
      if ((!unverified && !hosts.get(peer.hostId)) || this.#closed) continue;
      const at = this.#now().toISOString();
      this.#database.transaction(
        (database) => {
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?, ignored_at = ?,
                 snoozed_until = NULL, wake_count = NULL, wake_interval_ms = NULL,
                 last_error = ?
           WHERE source_event_id = ? AND bot_slug = ?
             AND attempt_state IN ('pending', 'retryable')
             AND observed_at IS NULL AND side_effect_started_at IS NULL AND ignored_at IS NULL
        `,
            )
            .run(
              at,
              at,
              unverified
                ? 'Bot collaboration provenance unavailable before execution'
                : 'Bot collaboration membership withdrawn before execution',
              row.source_event_id,
              botSlug,
            );
        },
        ['bot-inbox'],
      );
      this.#channels.admissionChanged?.(row.channel_id, row.message_id);
    }
  }

  #retireRevokedGroupRetries(): void {
    const retries = this.#database.read((database) =>
      database
        .prepare(
          `
        SELECT a.source_event_id, a.bot_slug, e.channel_id
          FROM inbox_admissions a JOIN source_events e USING (source_event_id)
         WHERE a.reason IN ('group-mention', 'group-ordinary')
           AND a.attempt_state IN ('pending', 'retryable')
           AND a.side_effect_started_at IS NULL AND a.ignored_at IS NULL
           AND e.source_kind != 'bridge-message' AND e.channel_id IS NOT NULL
      `,
        )
        .all(),
    ) as Array<{
      source_event_id: string;
      bot_slug: string;
      channel_id: string;
    }>;
    const revoked = retries.filter((row) => {
      const channel = this.#channels.get(row.channel_id);
      return channel === undefined || !this.#isMember(row.bot_slug, channel);
    });
    if (revoked.length === 0) return;
    const at = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        for (const row of revoked)
          database
            .prepare(
              `
          UPDATE inbox_admissions
             SET attempt_state = 'handled', handled_at = ?, ignored_at = ?,
                 snoozed_until = NULL, wake_count = NULL, wake_interval_ms = NULL,
                 last_error = 'Group membership revoked during recovery'
           WHERE source_event_id = ? AND bot_slug = ?
             AND attempt_state IN ('pending', 'retryable')
             AND side_effect_started_at IS NULL AND ignored_at IS NULL
        `,
            )
            .run(at, at, row.source_event_id, row.bot_slug);
      },
      ['bot-inbox'],
    );
  }

  originalAttachmentRoot(
    sessionId: string,
    path: string,
    kind: 'read' | 'write',
    shell = false,
  ): string | undefined {
    return this.#originalAttachments.root(sessionId, path, kind, shell);
  }

  #channelAccess(
    botSlug: string,
    defaultChannelId: string | undefined,
    sourceEventId: string | undefined,
    sessionId: string,
    beforeSend: () => void,
    readAdmissions: Set<string>,
    onImport?: (ref: ChannelAttachmentRef) => void,
    observeReads = true,
    modelContent?: string,
    replyTargets?: () => readonly TurnTargetSegment[],
  ): OrchestratorChannelAccess {
    const actorHuman = humanContext(botOwner(this.#registry.get(botSlug)!));
    const reviewOwner = sessionId.startsWith('direct-')
      ? `direct:${botSlug}`
      : `${botSlug}:${sessionId}`;
    const turnAttribution = () => {
      const segments = replyTargets?.().slice(-MAX_MIXED_GROUP_ATTEMPTS);
      const last = segments?.at(-1);
      const turnModelSwitch =
        last === undefined ? undefined : readTurnModelSwitch(this.#database, sessionId, last);
      return {
        ...(segments?.length ? { turnTargets: segments.map((segment) => segment.target) } : {}),
        ...(turnModelSwitch === undefined ? {} : { turnModelSwitch }),
      };
    };
    const observations = new Map<string, string>();
    const exhaustedDrops = new Map<string, string>();
    const recordObservation = (views: ChannelMessageView[]): void => {
      for (const id of new Set(views.map((view) => view.channelId))) {
        if (!this.groupSendReview.enabled(id)) continue;
        observations.set(
          id,
          this.groupSendReview.observe(
            reviewOwner,
            id,
            views.filter((view) => view.channelId === id).map((view) => view.message),
            observations.get(id),
          ),
        );
      }
    };
    const initial = this.#database.read((db) =>
      db
        .prepare('SELECT channel_id, message_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId ?? null),
    );
    if (initial?.channel_id && initial.message_id && !sessionId.startsWith('direct-')) {
      const id = String(initial.channel_id);
      const message = this.#channels.message(id, String(initial.message_id));
      if (
        message &&
        message.body.length > 0 &&
        modelContent?.includes(sessionMentionText(message.body, message.mentions ?? [])) &&
        this.groupSendReview.enabled(id)
      )
        observations.set(id, this.groupSendReview.observe(reviewOwner, id, [message]));
    }
    const initialObservations = new Map(observations);
    const reviewSourceChannelId =
      initial?.channel_id && this.groupSendReview.enabled(String(initial.channel_id))
        ? String(initial.channel_id)
        : undefined;
    const requireReplySource = () => {
      if (reviewSourceChannelId === undefined) return;
      const source = this.#channels.get(reviewSourceChannelId);
      if (!source || !this.#isMember(botSlug, source))
        throw new GroupReplySourceRevoked(reviewSourceChannelId);
    };
    const authorize = beforeSend;
    beforeSend = () => {
      this.#requireTurnAccess(botSlug, sourceEventId ? [sourceEventId] : []);
      requireReplySource();
      if (sourceEventId !== undefined)
        this.#database.read((db) => requireSourceEffects(db, sourceEventId, botSlug));
      authorize();
    };
    const requireOrdinaryGroupActor = () => {
      if (this.#tob?.isTob(botSlug)) throw new TobError('tob-cli-required');
    };
    const resolve = (requested?: string): ChannelRecord => {
      const id = requested ?? defaultChannelId;
      if (id === undefined)
        throw new Error(
          'No inbound local Channel; select an explicit joined Channel or use bot_send_message with source_event_id for an external source',
        );
      const channel = this.#channels.get(id);
      if (this.#team && channel) {
        this.#team.bots.requireChannel(botSlug, channel);
        return channel;
      }
      return this.#requireMembership(botSlug, id);
    };
    const humanNames = (channel: ChannelRecord): Record<string, string> =>
      Object.fromEntries(
        this.#channels
          .listHumanMembers(actorHuman, channel.id)
          .map((member) => [member.humanId, member.displayName]),
      );
    const viewOf = (
      channel: ChannelRecord,
      message: ChannelMessage,
      humans = humanNames(channel),
    ): ChannelMessageView => ({
      channelId: channel.id,
      channelName: channel.name,
      message,
      actorNames: {
        humans,
        bots: Object.fromEntries(
          [
            ...new Set([
              ...(message.author.kind === 'bot' ? [message.author.slug] : []),
              ...(message.mentions ?? []).map((mention) => mention.botSlug),
            ]),
          ].flatMap((slug) => {
            const bot = this.#registry.get(slug);
            return bot === undefined ? [] : [[slug, bot.displayName]];
          }),
        ),
      },
    });
    const contentProgress = new Map<string, number>();
    const queryPage = (input: ChannelQueryInput = {}): ChannelQueryPage => {
      if (input.scope !== undefined && input.scope !== 'channel' && input.scope !== 'joined') {
        throw new Error('channel_read: invalid scope');
      }
      if (hasChannelCallWindow(input)) {
        const { channel, window, page } = queryCallWindow({
          channels: this.#channels,
          resolve,
          input,
        });
        const humans = humanNames(channel);
        return {
          messages: page.messages.map((message) => viewOf(channel, message, humans)),
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
          call: window,
        };
      }
      if (input.scope !== 'joined') {
        const channel = resolve(input.channelId);
        const page = this.#channels.queryMessages(channel.id, input);
        const humans = humanNames(channel);
        const messages = page.messages.map((message) => viewOf(channel, message, humans));
        return {
          messages,
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
        };
      }
      if (input.channelId !== undefined) {
        throw new Error('channel_read: channel_id cannot be combined with joined scope');
      }
      const text = requireNonBlank(input.text ?? '', 'Cross-Channel text query');
      const channels = this.#channels
        .list()
        .filter((channel) => this.#isMember(botSlug, channel))
        .sort((left, right) => left.id.localeCompare(right.id));
      const filter = createHash('sha256')
        .update(
          JSON.stringify({
            channelIds: channels.map((channel) => channel.id),
            text: text.toLowerCase(),
            authorBotId: input.authorBotId,
            authorKind: input.authorKind,
            from: input.from,
            to: input.to,
          }),
        )
        .digest('hex')
        .slice(0, 16);
      type SortKey = { at: string; channelId: string; messageId: string };
      const descending = (left: string, right: string): number =>
        right < left ? -1 : right > left ? 1 : 0;
      const compare = (left: SortKey, right: SortKey): number =>
        Date.parse(right.at) - Date.parse(left.at) ||
        descending(left.channelId, right.channelId) ||
        descending(left.messageId, right.messageId);
      let after: SortKey | undefined;
      if (input.cursor !== undefined) {
        try {
          const decoded: unknown = JSON.parse(
            Buffer.from(input.cursor, 'base64url').toString('utf8'),
          );
          if (
            typeof decoded !== 'object' ||
            decoded === null ||
            !('filter' in decoded) ||
            decoded.filter !== filter ||
            !('at' in decoded) ||
            typeof decoded.at !== 'string' ||
            !('channelId' in decoded) ||
            typeof decoded.channelId !== 'string' ||
            !('messageId' in decoded) ||
            typeof decoded.messageId !== 'string'
          )
            throw new Error('invalid');
          after = {
            at: decoded.at,
            channelId: decoded.channelId,
            messageId: decoded.messageId,
          };
        } catch {
          throw new Error('channel_read: invalid cursor');
        }
      }
      const {
        cursor: _cursor,
        scope: _scope,
        channelId: _channelId,
        limit: _limit,
        ...filters
      } = input;
      const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), MAX_MESSAGE_PAGE));
      const afterTo =
        after !== undefined && Number.isFinite(Date.parse(after.at)) ? after.at : undefined;
      if (
        afterTo !== undefined &&
        filters.from !== undefined &&
        Date.parse(filters.from) > Date.parse(afterTo)
      )
        return { messages: [] };
      const found: ChannelMessageView[] = [];
      for (const channel of channels) {
        const humans = humanNames(channel);
        let cursor: string | undefined;
        do {
          const page = this.#channels.queryMessages(channel.id, {
            ...filters,
            text,
            ...(afterTo !== undefined && filters.to === undefined ? { to: afterTo } : {}),
            orderBy: 'time',
            ...(cursor === undefined ? {} : { cursor }),
            limit: MAX_MESSAGE_PAGE,
          });
          for (const message of page.messages) {
            const key = {
              at: message.at,
              channelId: channel.id,
              messageId: message.id,
            };
            if (after !== undefined && compare(key, after) <= 0) continue;
            found.push(viewOf(channel, message, humans));
          }
          found.sort((left, right) =>
            compare(
              {
                at: left.message.at,
                channelId: left.channelId,
                messageId: left.message.id,
              },
              {
                at: right.message.at,
                channelId: right.channelId,
                messageId: right.message.id,
              },
            ),
          );
          found.length = Math.min(found.length, limit + 1);
          cursor = page.nextCursor;
          const tail = page.messages.at(-1);
          const worst = found[limit];
          if (
            cursor !== undefined &&
            tail !== undefined &&
            worst !== undefined &&
            compare(
              { at: tail.at, channelId: channel.id, messageId: tail.id },
              {
                at: worst.message.at,
                channelId: worst.channelId,
                messageId: worst.message.id,
              },
            ) >= 0
          )
            break;
        } while (cursor !== undefined);
      }
      const page = found;
      const messages = page.slice(0, limit);
      const last = messages.at(-1);
      return {
        messages,
        ...(page.length <= limit || last === undefined
          ? {}
          : {
              nextCursor: Buffer.from(
                JSON.stringify({
                  at: last.message.at,
                  channelId: last.channelId,
                  messageId: last.message.id,
                  filter,
                }),
              ).toString('base64url'),
            }),
      };
    };
    const replySource = (id: string) => {
      const source = this.#database.read((db) => {
        requireSourceEffects(db, id, botSlug);
        return db
          .prepare(
            `SELECT e.channel_id, e.message_id FROM source_events e
            JOIN inbox_admissions a ON a.source_event_id = e.source_event_id
            WHERE e.source_event_id = ? AND a.bot_slug = ?
              AND (
                e.source_kind IN ('human-message', 'bot-message')
                OR (
                  e.source_kind = 'system-message'
                  AND json_extract(e.payload_json, '$.takeoverResolution') IS NOT NULL
                )
              )`,
          )
          .get(id, botSlug);
      });
      if (typeof source?.channel_id !== 'string' || typeof source.message_id !== 'string')
        throw new Error('Trusted local reply source is unavailable');
      const channel = resolve(source.channel_id);
      if (
        (channel.type === 'dm' && !isBotDmChannel(channel) && channel.botSlug !== botSlug) ||
        (!this.#channels.hasMessage(channel.id, source.message_id) &&
          !source.message_id.startsWith(SESSION_DIRECT_MESSAGE_PREFIX))
      )
        throw new Error('Trusted local reply source is unavailable');
      return { channelId: channel.id, messageId: source.message_id };
    };
    return {
      replySource,
      list: (input = {}) => {
        if (input.type !== undefined && input.type !== 'group' && input.type !== 'dm') {
          throw new Error('channel_list: type must be group or dm');
        }
        const name = input.name?.trim().toLowerCase();
        const memberBotIds = [...new Set(input.memberBotIds ?? [])].sort();
        const filter = createHash('sha256')
          .update(
            JSON.stringify({
              channelId: input.channelId,
              name,
              type: input.type,
              memberBotIds,
            }),
          )
          .digest('hex')
          .slice(0, 16);
        let afterId: string | undefined;
        if (input.cursor !== undefined) {
          try {
            const decoded: unknown = JSON.parse(
              Buffer.from(input.cursor, 'base64url').toString('utf8'),
            );
            if (
              typeof decoded !== 'object' ||
              decoded === null ||
              !('afterId' in decoded) ||
              typeof decoded.afterId !== 'string' ||
              !('filter' in decoded) ||
              decoded.filter !== filter
            )
              throw new Error('invalid');
            afterId = decoded.afterId;
          } catch {
            throw new Error('channel_list: invalid cursor');
          }
        }
        const limit = Math.max(1, Math.min(Math.floor(input.limit ?? 20), 100));
        const matching = this.#channels
          .list()
          .filter((channel) => this.#isMember(botSlug, channel))
          .filter((channel) => input.channelId === undefined || channel.id === input.channelId)
          .filter((channel) => input.type === undefined || channel.type === input.type)
          .filter((channel) => name === undefined || channel.name.toLowerCase().includes(name))
          .filter((channel) => memberBotIds.every((id) => channel.members.includes(id)))
          .filter((channel) => afterId === undefined || channel.id > afterId)
          .sort((left, right) => left.id.localeCompare(right.id));
        const page = matching.slice(0, limit + 1);
        const channels = page.slice(0, limit).map((channel): ChannelListEntry => ({
          id: channel.id,
          name: channel.name,
          type: channel.type,
          kind:
            channel.type === 'group' ? 'group' : isBotDmChannel(channel) ? 'bot-dm' : 'human-dm',
          members: channel.members.map((id) => {
            const member = this.#registry.get(id);
            return {
              botId: id,
              displayName: member?.displayName ?? id,
              active: member !== undefined && member.paused !== true,
            };
          }),
          humanMembers: this.#channels.listHumanMembers(actorHuman, channel.id),
          ...(channel.ownerBotSlug === undefined ? {} : { ownerBotId: channel.ownerBotSlug }),
          ...(channel.type === 'group' && channel.ownerBotSlug === botSlug
            ? {
                pendingJoinRequests: (channel.joinRequests ?? [])
                  .filter((item) => item.status === 'pending')
                  .map((item) => ({
                    requestId: item.id,
                    requesterBotId: item.requesterBotSlug,
                    createdAt: item.createdAt,
                  })),
              }
            : {}),
        }));
        const last = channels.at(-1);
        return {
          channels,
          ...(page.length <= limit || last === undefined
            ? {}
            : {
                nextCursor: Buffer.from(JSON.stringify({ afterId: last.id, filter })).toString(
                  'base64url',
                ),
              }),
        };
      },
      startHumanDm: (humanId) => {
        if (!this.#team) throw new TeamError('unavailable');
        this.#team.bots.requireProactive(botSlug, humanId);
        return this.#team.bots.dm(humanContext(humanId), botSlug)!;
      },
      contacts: async (input) => {
        const actor = this.#registry.get(botSlug);
        if (actor && botOwner(actor) === 'local-human') await this.refreshBotContacts();
        return this.botContacts(botSlug, input);
      },
      createGroup: (name) => {
        requireOrdinaryGroupActor();
        const sender = this.#registry.get(botSlug);
        if (sender === undefined || sender.paused === true)
          throw new Error('Bot Group creator is no longer active');
        this.#team?.roles.require(actorHuman, 'channels.create');
        const clean = requireNonBlank(name, 'Group name').slice(0, 120);
        beforeSend();
        return this.#channels.createGroup(humanContext(botOwner(sender)), {
          name: clean,
          members: [botSlug],
          ownerBotSlug: botSlug,
        });
      },
      inviteGroup: (input) => {
        requireOrdinaryGroupActor();
        const channel = this.#channels.get(input.channelId);
        const target = this.#registry.get(input.targetBotSlug);
        if (this.#team)
          this.#team.bots.recordAdder(actorHuman, input.targetBotSlug, input.channelId);
        else if (
          (!target && botOwner(this.#registry.get(botSlug)!) !== 'local-human') ||
          (target && botOwner(target) !== botOwner(this.#registry.get(botSlug)!))
        )
          throw new TobError('bot-not-found');
        if (this.#tob?.isTob(input.targetBotSlug)) throw new TobError('protected-bot');
        if (
          channel?.type !== 'group' ||
          channel.ownerBotSlug !== botSlug ||
          !this.#isMember(botSlug, channel)
        )
          throw new Error('Only the Bot Group owner may invite');
        if (target === undefined || target.paused === true || target.slug === botSlug)
          throw new Error('Invitee must be another active nonmember PersonaBot');
        const botCausation = this.#causalSending.botCausation(sourceEventId);
        this.#causalSending.requireBotHop(botCausation);
        const dm = this.#channels.getOrCreateDm(
          humanContext(botOwner(this.#registry.get(target.slug)!)),
          target.slug,
          target.displayName,
        );
        if (dm === undefined) throw new Error('Invitee DM is unavailable');
        beforeSend();
        const invitation = this.#channels.inviteGroupBot({
          channelId: channel.id,
          inviterBotSlug: botSlug,
          targetBotSlug: target.slug,
          targetBotCreatedAt: target.createdAt,
          targetDmChannelId: dm.id,
          botCausation,
        });
        this.admitGroupInvitation(dm.id, invitation.id);
        return invitation;
      },
      requestGroupJoin: (input) => {
        requireOrdinaryGroupActor();
        const target = this.#channels.get(input.channelId);
        const requester = this.#registry.get(botSlug);
        const source = this.#database.read((database) =>
          database
            .prepare(
              'SELECT channel_id, message_id, source_kind FROM source_events WHERE source_event_id = ?',
            )
            .get(sourceEventId ?? null),
        ) as
          | {
              channel_id: string | null;
              message_id: string | null;
              source_kind: string;
            }
          | undefined;
        const sourceChannel =
          source?.channel_id == null ? undefined : this.#channels.get(source.channel_id);
        const selected =
          source?.source_kind === 'human-message' &&
          source.channel_id !== null &&
          sourceChannel?.type === 'dm' &&
          sourceChannel.botSlug === botSlug &&
          source.message_id !== null
            ? this.#channels.message(source.channel_id, source.message_id)?.channelRefs
            : undefined;
        if (
          requester === undefined ||
          requester.paused === true ||
          target?.type !== 'group' ||
          target.members.includes(botSlug) ||
          !selected?.some((ref) => ref.channelId === input.channelId)
        )
          throw new Error('group_join_request requires a selected #Group in this Human DM turn');
        if (
          botOwner(requester) !== 'local-human' &&
          !this.#channels
            .listHumanMembers(actorHuman, target.id)
            .some((member) => member.humanId === actorHuman.humanId)
        )
          throw new TobError('channel-not-found');
        const owner =
          target.ownerBotSlug === undefined ? undefined : this.#registry.get(target.ownerBotSlug);
        const botCausation = this.#causalSending.botCausation(sourceEventId);
        this.#causalSending.requireBotHop(botCausation);
        beforeSend();
        const ownerDm =
          owner === undefined || botOwner(owner) !== botOwner(requester)
            ? undefined
            : this.#channels.getOrCreateDm(
                humanContext(botOwner(this.#registry.get(owner.slug)!)),
                owner.slug,
                owner.displayName,
              );
        const request = this.#channels.requestGroupJoin({
          channelId: target.id,
          requesterBotSlug: botSlug,
          requesterBotCreatedAt: requester.createdAt,
          ...(ownerDm === undefined ? {} : { ownerDmChannelId: ownerDm.id }),
          botCausation,
        });
        if (ownerDm !== undefined) this.admitGroupJoinRequest(ownerDm.id, request.id);
        return request;
      },
      decideGroupJoin: (input) => {
        requireOrdinaryGroupActor();
        const target = this.#channels.get(input.channelId);
        const request = target?.joinRequests?.find((item) => item.id === input.requestId);
        const requester =
          request === undefined ? undefined : this.#registry.get(request.requesterBotSlug);
        if (requester && botOwner(requester) !== botOwner(this.#registry.get(botSlug)!))
          throw new TobError('bot-not-found');
        if (request !== undefined && this.#tob?.isTob(request.requesterBotSlug))
          throw new TobError('protected-bot');
        if (
          target?.type !== 'group' ||
          target.ownerBotSlug !== botSlug ||
          !target.members.includes(botSlug) ||
          request === undefined ||
          requester === undefined ||
          requester.paused === true ||
          requester.createdAt !== request.requesterBotCreatedAt
        )
          throw new Error('Only the current Bot Group owner can decide this join request');
        const botCausation = this.#causalSending.botCausation(sourceEventId);
        this.#causalSending.requireBotHop(botCausation);
        beforeSend();
        const dm = this.#channels.getOrCreateDm(
          humanContext(botOwner(this.#registry.get(requester.slug)!)),
          requester.slug,
          requester.displayName,
        );
        if (dm === undefined) throw new Error('Requester DM is unavailable');
        const decided = this.#channels.decideGroupJoin({
          channelId: target.id,
          requestId: request.id,
          accept: input.accept,
          decidedBy: botSlug,
          requesterBotCreatedAt: requester.createdAt,
          requesterDmChannelId: dm.id,
          botCausation,
        });
        if (decided.notified) this.admitGroupJoinDecision(dm.id, request.id);
        return { channel: decided.channel, request: decided.request };
      },
      respondToGroupInvite: (input) => {
        requireOrdinaryGroupActor();
        const target = this.#registry.get(botSlug);
        if (target === undefined || target.paused === true)
          throw new Error('Archived PersonaBot cannot answer a Group invitation');
        beforeSend();
        return this.#channels.respondToGroupInvite({
          invitationId: input.invitationId,
          targetBotSlug: botSlug,
          targetBotCreatedAt: target.createdAt,
          accept: input.accept,
        });
      },
      renameGroup: (input) => {
        requireOrdinaryGroupActor();
        const channel = this.#channels.get(input.channelId);
        if (
          channel?.type !== 'group' ||
          channel.ownerBotSlug !== botSlug ||
          !channel.members.includes(botSlug)
        )
          throw new Error('Only the Bot Group owner may rename');
        const name = requireNonBlank(input.name, 'Group name').slice(0, 120);
        beforeSend();
        const renamed = this.#channels.rename(OWNER_HUMAN_CONTEXT, channel.id, name);
        if (renamed === undefined) throw new Error('Group rename did not return a Channel');
        return renamed;
      },
      removeGroupMember: (input) => {
        requireOrdinaryGroupActor();
        const channel = this.#channels.get(input.channelId);
        if (
          channel?.type !== 'group' ||
          channel.ownerBotSlug !== botSlug ||
          !channel.members.includes(botSlug) ||
          input.botSlug === botSlug
        )
          throw new Error('Only the Bot Group owner may remove another member');
        beforeSend();
        return this.#channels.removeGroupMember(channel.id, input.botSlug);
      },
      readGroupWakePolicy: (channelId) => {
        const channel = resolve(channelId);
        if (channel.type !== 'group') throw new Error('Group Channel is required');
        return this.#channels.getGroupWakePolicy(channel.id, botSlug);
      },
      setGroupWakePolicy: (input) => {
        const bot = this.#registry.get(botSlug);
        if (bot === undefined || bot.paused === true)
          throw new Error('PersonaBot is no longer active');
        const channel = resolve(input.channelId);
        if (channel.type !== 'group') throw new Error('Group Channel is required');
        this.#channels.setGroupWakePolicy(
          channel.id,
          botSlug,
          {
            mode: input.mode,
            count: input.count,
            intervalSeconds: input.intervalSeconds,
          },
          { kind: 'bot', botSlug },
        );
        return this.#channels.getGroupWakePolicy(channel.id, botSlug);
      },
      react: (input) => {
        const channel = resolve(input.channelId);
        this.#team?.bots.requireChannel(botSlug, channel, true);
        return this.#react(botSlug, channel, input);
      },
      ...createVoiceAccess({
        botSlug,
        channels: this.#channels,
        resolve,
        voiceMessages: this.#voiceMessages,
        callFrames: this.#callFrames,
      }),
      leaveGroup: (input) => {
        requireOrdinaryGroupActor();
        const channel = this.#channels.get(input.channelId);
        if (channel === undefined) throw new Error('group_leave: channel-unavailable');
        if (channel.type !== 'group') throw new Error('group_leave: group-required');
        if (!channel.members.includes(botSlug)) return { channelId: input.channelId, left: false };
        beforeSend();
        this.#channels.removeGroupMember(channel.id, botSlug, 'left');
        return { channelId: channel.id, left: true };
      },
      createBot: (input) => this.#createBot(botSlug, sourceEventId, beforeSend, input),
      sendToBot: async (input) => {
        if (input.botSlug.startsWith('remote:')) {
          if (input.replyTo !== undefined)
            throw new Error('Remote Bot DMs currently support text without quoted replies');
          let contact = this.botContacts(botSlug, { botId: input.botSlug }).contacts[0];
          if (contact === undefined) {
            await this.refreshBotContacts();
            contact = this.botContacts(botSlug, { botId: input.botSlug }).contacts[0];
          }
          if (contact?.hostId === undefined || contact.botSlug === undefined)
            throw new BotNetworkDeliveryError('unable-to-deliver');
          const channel = this.#channels.getOrCreateRemoteBotDm(botSlug, {
            hostId: contact.hostId,
            botSlug: contact.botSlug,
            displayName: contact.displayName,
          });
          return this.#causalSending.sendNetworkBotDm({
            botSlug,
            channel,
            sessionId,
            sourceEventId,
            body: input.body,
            beforeSend,
            ...(input.deliveryKey === undefined ? {} : { deliveryKey: input.deliveryKey }),
          });
        }
        const sender = this.#registry.get(botSlug);
        const target = this.#registry.get(input.botSlug);
        if (this.#team) this.#team.bots.requireBotTarget(botSlug, input.botSlug);
        else if (
          sender &&
          ((!target && botOwner(sender) !== 'local-human') ||
            (target && botOwner(sender) !== botOwner(target)))
        )
          throw new TobError('bot-not-found');
        if (
          sender === undefined ||
          sender.paused === true ||
          target === undefined ||
          target.paused === true ||
          target.slug === botSlug
        )
          throw new Error('Bot DM recipient must be another active PersonaBot');
        if (!input.body.trim()) throw new Error('Bot DM message requires a body');
        const dm = this.#channels.getOrCreateBotDm(
          OWNER_HUMAN_CONTEXT,
          botSlug,
          target.slug,
          `${sender.displayName} · ${target.displayName}`,
        );
        if (dm === undefined) throw new Error('Bot DM is unavailable');
        const sent = await this.#causalSending.sendBotDm({
          botSlug,
          recipientBotSlug: target.slug,
          channel: dm,
          sourceEventId,
          readSourceEventIds: readAdmissions,
          sessionId,
          beforeSend: input.deliveryKey === undefined ? beforeSend : () => undefined,
          ...(input.deliveryKey === undefined ? {} : { afterSend: beforeSend }),
          body: input.body,
          replyTo: input.replyTo,
          deliveryKey: input.deliveryKey,
          ...turnAttribution(),
        });
        return sent;
      },
      ignore: ({ channelId, messageId }) => {
        const channel = resolve(channelId);
        if (this.#channels.message(channel.id, messageId) === undefined)
          throw new Error('inbox_ignore: message is unavailable in this Channel');
        const decision = this.#database.transaction(
          (database) => {
            const row = database
              .prepare(
                `
                SELECT a.source_event_id, a.attempt_state, a.observed_at, a.ignored_at
                  FROM inbox_admissions a
                  JOIN source_events e ON e.source_event_id = a.source_event_id
                 WHERE a.bot_slug = ? AND e.channel_id = ? AND e.message_id = ?
              `,
              )
              .get(botSlug, channel.id, messageId) as
              | {
                  source_event_id: string;
                  attempt_state: string;
                  observed_at: string | null;
                  ignored_at: string | null;
                }
              | undefined;
            if (row === undefined)
              return {
                error: 'inbox_ignore: no Inbox Admission for this Bot',
              } as const;
            if (row.attempt_state === 'needs-repair')
              return {
                error: 'inbox_ignore: this admission needs repair',
              } as const;
            if (row.ignored_at !== null)
              return {
                sourceEventId: row.source_event_id,
                ignoredAt: row.ignored_at,
                alreadyIgnored: true,
              };
            if (
              row.attempt_state !== 'running' &&
              row.attempt_state !== 'handled' &&
              row.observed_at === null
            )
              return {
                error: 'inbox_ignore: observe this message before ignoring it',
              } as const;
            const ignoredAt = this.#now().toISOString();
            database
              .prepare(
                `
                UPDATE inbox_admissions
                   SET ignored_at = ?, ignored_by_session_id = ?,
                       resolved_at = COALESCE(resolved_at, ?),
                       resolution = COALESCE(resolution, 'ignored'),
                       resolved_by_session_id = COALESCE(resolved_by_session_id, ?),
                       observed_at = COALESCE(observed_at, ?),
                       attempt_state = CASE
                         WHEN attempt_state IN ('pending', 'retryable', 'running') THEN 'handled'
                         ELSE attempt_state END,
                       handled_at = CASE
                         WHEN attempt_state IN ('pending', 'retryable', 'running') THEN ?
                         ELSE handled_at END
                 WHERE source_event_id = ? AND bot_slug = ? AND ignored_at IS NULL
              `,
              )
              .run(
                ignoredAt,
                sessionId,
                ignoredAt,
                sessionId,
                ignoredAt,
                ignoredAt,
                row.source_event_id,
                botSlug,
              );
            return {
              sourceEventId: row.source_event_id,
              ignoredAt,
              alreadyIgnored: false,
            };
          },
          ['bot-inbox'],
        );
        if ('error' in decision) throw new Error(decision.error);
        this.#channels.admissionChanged?.(channel.id, messageId);
        return decision;
      },
      read: (input = {}) => {
        const channel = resolve(input.channelId);
        const humans = humanNames(channel);
        const messages = this.#channels
          .readMessages(channel.id, {
            ...(input.before === undefined ? {} : { before: input.before }),
            ...(input.limit === undefined ? {} : { limit: input.limit }),
          })
          .map((message) => viewOf(channel, message, humans));
        if (observeReads && input.observe !== false)
          this.#observeReadMessages(botSlug, messages, readAdmissions);
        return messages;
      },
      query: (input = {}) => {
        const page = queryPage(input);
        if (observeReads) this.#observeReadMessages(botSlug, page.messages, readAdmissions);
        return page;
      },
      readModel: (input = {}) => {
        if (input.messageId !== undefined) {
          const { channelId, messageId, contentCursor, ...filters } = input;
          if (Object.values(filters).some((value) => value !== undefined))
            throw new Error('channel_read: message_id cannot be combined with query filters');
          const channel = resolve(channelId);
          const message = this.#channels.message(channel.id, messageId);
          if (message === undefined) throw new Error('channel_read: message not found');
          const view = viewOf(channel, message);
          const chunk = readModelContent(
            view,
            contentCursor,
            this.groupSendReview.enabled(view.channelId) ? 100 : 0,
          );
          const previous = contentProgress.get(chunk.hash) ?? 0;
          const progress = chunk.start <= previous ? Math.max(previous, chunk.end) : previous;
          contentProgress.set(chunk.hash, progress);
          if (observeReads && progress === chunk.total)
            this.#observeReadMessages(botSlug, [view], readAdmissions);
          if (progress === chunk.total) recordObservation([view]);
          const observationId = observations.get(view.channelId);
          return observationId === undefined
            ? chunk.output
            : JSON.stringify({ ...JSON.parse(chunk.output), observationId });
        }
        if (input.contentCursor !== undefined)
          throw new Error('channel_read: content_cursor requires message_id');
        const page = queryPage(input);
        const callMeta =
          page.call === undefined ? 0 : JSON.stringify({ call: page.call }).length + 1;
        const bounded = boundModelPage(
          page,
          (count) => queryPage({ ...input, limit: count }).nextCursor,
          (included) => {
            const ids = [...new Set(included.map((view) => view.channelId))].filter((id) =>
              this.groupSendReview.enabled(id),
            );
            return (
              callMeta +
              (ids.length === 0
                ? 0
                : JSON.stringify(Object.fromEntries(ids.map((id) => [id, 'x'.repeat(36)]))).length +
                  24)
            );
          },
        );
        if (observeReads) this.#observeReadMessages(botSlug, bounded.included, readAdmissions);
        recordObservation(bounded.included);
        const observationIds = Object.fromEntries(
          [...new Set(bounded.included.map((view) => view.channelId))].flatMap((id) =>
            observations.has(id) ? [[id, observations.get(id)]] : [],
          ),
        );
        return Object.keys(observationIds).length === 0 && page.call === undefined
          ? bounded.output
          : JSON.stringify({
              ...JSON.parse(bounded.output),
              ...(page.call === undefined ? {} : { call: page.call }),
              ...(Object.keys(observationIds).length === 0 ? {} : { observationIds }),
            });
      },
      ...createChannelFileAccess({
        botSlug,
        sessionId,
        defaultChannelId,
        channels: this.#channels,
        attachments: this.#attachments,
        grants: this.#grants,
        ownership: this.#ownership,
        registry: this.#registry,
        originalAttachments: this.#originalAttachments,
        isClosed: () => this.#closed,
        authorizedPathRoot,
        resolve,
        beforeSend,
        onImport,
      }),
      requestGrant: async (reason, channelId) => {
        const channel = resolve(channelId);
        if (
          channel.type === 'group'
            ? !channel.members.includes(botSlug)
            : channel.botSlug !== botSlug
        ) {
          throw new Error(
            'Workspace Grant requests must be sent in a Group this PersonaBot belongs to or in its Human DM',
          );
        }
        const body = requireNonBlank(reason, 'Workspace Grant request reason');
        beforeSend();
        const message: ChannelMessage = {
          id: this.#createMessageId(),
          at: this.#now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
          grantRequest: true,
          grantRequestOwner: this.#registry.get(botSlug)!.createdAt,
        };
        const appended = await this.#channels.appendMessage(
          OWNER_HUMAN_CONTEXT,
          channel.id,
          message,
          {
            sessionId,
            ...(sourceEventId === undefined ? {} : { sourceEventId }),
          },
        );
        if (appended === undefined) throw new Error(`Channel disappeared: ${channel.id}`);
        return appended;
      },
      linkSessions: (input) => {
        if (this.#channels.addMessageSessionLinks === undefined)
          throw new Error('Session links are unavailable');
        const channel = this.#channels
          .list()
          .find(
            (candidate) =>
              candidate.type === 'dm' &&
              candidate.botSlug === botSlug &&
              !isBotDmChannel(candidate) &&
              this.#channels.message(candidate.id, input.messageId)?.author.kind === 'bot',
          );
        const message =
          channel === undefined ? undefined : this.#channels.message(channel.id, input.messageId);
        if (
          channel === undefined ||
          message === undefined ||
          message.author.kind !== 'bot' ||
          message.author.slug !== botSlug
        )
          throw new Error(`Message ${input.messageId} is not one of your messages in a Human DM`);
        const linked = this.#channels.addMessageSessionLinks(
          channel.id,
          message.id,
          input.links.map(({ sessionId, kind, title, createdAt }) => ({
            sessionId,
            title,
            kind:
              kind === 'sent' &&
              createdAt !== undefined &&
              Date.parse(createdAt) >= Date.parse(message.at)
                ? 'created'
                : kind,
          })),
        );
        if (linked === undefined) throw new Error(`Message ${input.messageId} disappeared`);
        return linked;
      },
      inspectDrafts: (input) => {
        const channel = this.#channels.get(input.channelId);
        const bot = this.#registry.get(botSlug);
        if (
          !channel ||
          channel.type !== 'group' ||
          !this.#isMember(botSlug, channel) ||
          !bot ||
          bot.paused ||
          this.#closed
        )
          return {
            status: 'refused',
            channelId: input.channelId,
            draftId: input.draftId ?? '',
            reason: 'draft-access-unavailable',
          };
        requireReplySource();
        this.#causalSending.requireSendReviewOwner(botSlug, sessionId);
        return this.groupSendReview.inspectRecords(reviewOwner, channel.id, input.draftId);
      },
      dropDraft: (input) => {
        resolve(input.channelId);
        const result = this.groupSendReview.drop(
          reviewOwner,
          input.channelId,
          input.draftId,
          input.yieldToMessageIds === undefined
            ? undefined
            : {
                observationId: input.observationId ?? '',
                messageIds: input.yieldToMessageIds,
              },
        );
        if (result.status === 'dropped' && result.budget?.exhausted)
          exhaustedDrops.set(input.channelId, input.draftId);
        return result;
      },
      send: async (input) => {
        const attribution = turnAttribution();
        if (input.replySourceEventId !== undefined) {
          const reply = replySource(input.replySourceEventId);
          if (
            input.channelId !== reply.channelId ||
            input.replyTo !==
              (reply.messageId.startsWith(SESSION_DIRECT_MESSAGE_PREFIX)
                ? undefined
                : reply.messageId)
          )
            throw new Error('Reply destination does not match the trusted source');
        }
        requireReplySource();
        const steered = this.#turnSources.get(botSlug);
        const turnChannelIds =
          steered?.sessionId === sessionId && steered.steeredChannelIds.size > 0
            ? [
                ...(steered.inboundChannelId === undefined ? [] : [steered.inboundChannelId]),
                ...steered.steeredChannelIds,
              ]
            : [];
        const repliedChannelIds =
          input.channelId === undefined && input.replyTo !== undefined
            ? turnChannelIds.filter(
                (id) => this.#channels.message(id, input.replyTo!) !== undefined,
              )
            : [];
        if (input.channelId === undefined && repliedChannelIds.length === 1)
          input = { ...input, channelId: repliedChannelIds[0]! };
        if (input.channelId === undefined && turnChannelIds.length > 0)
          throw new Error(
            `This turn carries messages from several Channels: ${turnChannelIds
              .map((id) => {
                const candidate = this.#channels.get(id);
                const kind =
                  candidate === undefined
                    ? 'Channel'
                    : candidate.type === 'group'
                      ? `Group ${JSON.stringify(candidate.name)}`
                      : isBotDmChannel(candidate)
                        ? 'Bot DM'
                        : 'Human DM';
                return `${kind} (channel_id ${JSON.stringify(id)})`;
              })
              .join(
                '; ',
              )}. Call bot_send_message with the trusted source_event_id you are answering, or an explicit channel_id for a proactive message.`,
          );
        const channel = resolve(input.channelId);
        this.#team?.bots.requireChannel(botSlug, channel, true);
        if (this.#team && channel.botSlug === botSlug) {
          const source = this.#database.read((db) =>
            db
              .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
              .get(
                input.replySourceEventId ??
                  (steered?.sessionId === sessionId
                    ? this.#causalSending.turnSourceIn(botSlug, channel.id, readAdmissions)
                    : undefined) ??
                  (sessionId.startsWith('direct-') ? undefined : sourceEventId) ??
                  null,
              ),
          );
          if (source?.['channel_id'] !== channel.id)
            this.#team.bots.requireProactive(
              botSlug,
              channel.dmHumanId ?? botOwner(this.#registry.get(botSlug)!),
            );
        }
        const exhaustedDraftId = exhaustedDrops.get(channel.id);
        if (input.genui !== undefined && (channel.type !== 'dm' || channel.botSlug !== botSlug))
          throw new Error('GenUI reports require the Bot Human DM');
        if (
          input.sessionLinks !== undefined &&
          (channel.type !== 'dm' || channel.botSlug !== botSlug)
        )
          throw new Error('Session links require the Bot Human DM');
        if (exhaustedDraftId)
          throw new SendReviewRequired({
            status: 'requires-review',
            channelId: channel.id,
            draftId: exhaustedDraftId,
            reason: 'dropped-exhausted-draft-defer-turn',
            choices: ['snooze-inbox'],
          });
        if (input.freshnessOverride && channel.type !== 'group')
          throw new Error('Freshness override requires the original Group draft');
        if (input.mentionBotIds?.length && channel.type !== 'group')
          throw new Error('Bot mentions require a Group Channel');
        if (input.mentionHumanIds?.length && channel.type !== 'group')
          throw new Error('Human mentions require a Group Channel');
        if (isBotDmChannel(channel)) {
          if (channel.remoteBot !== undefined) {
            if (input.quotes?.length)
              throw new ChannelQuoteError(
                'unsupported-quotes',
                'Quotes are not supported in remote Bot DMs',
              );
            if (
              input.attachments?.length ||
              (input.replyTo !== undefined && input.replySourceEventId === undefined)
            )
              throw new Error('Remote Bot DMs currently support text without quoted replies');
            return (
              await this.#causalSending.sendNetworkBotDm({
                botSlug,
                channel,
                sessionId,
                sourceEventId:
                  input.replySourceEventId ??
                  this.#causalSending.turnSourceIn(botSlug, channel.id, readAdmissions) ??
                  sourceEventId,
                body: input.body,
                beforeSend,
                ...attribution,
                ...(input.deliveryKey === undefined ? {} : { deliveryKey: input.deliveryKey }),
              })
            ).message;
          }
          const recipientBotSlug = channel.members.find((slug) => slug !== botSlug);
          if (recipientBotSlug === undefined) throw new Error('Bot DM has no recipient');
          const sent = await this.#causalSending.sendBotDm({
            botSlug,
            recipientBotSlug,
            channel,
            sourceEventId: input.replySourceEventId ?? sourceEventId,
            ...(input.replySourceEventId === undefined
              ? {}
              : { replySourceEventId: input.replySourceEventId }),
            readSourceEventIds: readAdmissions,
            sessionId,
            beforeSend: input.deliveryKey === undefined ? beforeSend : () => undefined,
            ...(input.deliveryKey === undefined ? {} : { afterSend: beforeSend }),
            body: input.body,
            ...attribution,
            replyTo: input.replyTo,
            quotes: input.quotes,
            attachments: input.attachments,
            deliveryKey: input.deliveryKey,
          });
          return sent.message;
        }
        if (channel.type === 'group') {
          const sent = await this.#causalSending
            .sendBotGroup({
              reviewOwner,
              observationId: input.observationId ?? initialObservations.get(channel.id),
              draftId: input.draftId,
              freshnessOverride: input.freshnessOverride,
              recover: input.recover,
              botSlug,
              channel,
              sourceEventId: input.replySourceEventId ?? sourceEventId,
              ...(input.replySourceEventId === undefined
                ? {}
                : { replySourceEventId: input.replySourceEventId }),
              readSourceEventIds: readAdmissions,
              sessionId,
              beforeSend: input.deliveryKey === undefined ? beforeSend : () => undefined,
              ...(input.deliveryKey === undefined ? {} : { afterSend: beforeSend }),
              body: input.body,
              ...attribution,
              replyTo: input.replyTo,
              quotes: input.quotes,
              attachments: input.attachments,
              mentionBotIds: input.mentionBotIds,
              mentionHumanIds: input.mentionHumanIds,
              deliveryKey: input.deliveryKey,
            })
            .catch((error: unknown) => {
              if (
                !(error instanceof SendReviewRequired) ||
                (error.outcome.status !== 'held' && error.outcome.status !== 'requires-review')
              )
                throw error;
              const changed = error.outcome.changedMessageIds;
              if (!changed?.length) throw error;
              const current = resolve(channel.id);
              const views = changed.flatMap((id) => {
                const message = this.#channels.message(current.id, id);
                return message === undefined ? [] : [viewOf(current, message)];
              });
              const bounded = boundModelPage(
                { messages: views },
                () => undefined,
                () => 2_000,
              );
              if (!bounded.included.length) throw error;
              const review = {
                observationId: 'x'.repeat(36),
                content: bounded.output,
                complete: bounded.included.length === error.outcome.changedMessageCount,
                observedMessageIds: bounded.included.map((view) => view.message.id),
                peerMessageIds: bounded.included
                  .filter(
                    ({ message }) =>
                      message.author.kind === 'bot' &&
                      message.author.slug !== botSlug &&
                      !message.sessionFailure &&
                      !!message.body.trim(),
                  )
                  .map(({ message }) => message.id),
                responsibility:
                  'These messages join this turn. Internally compare committed peer replies with your remaining responsibility; do not include this protocol or task-ownership explanation in the Channel reply. If they fully answer it, drop silently with yield_to_message_ids and observation_id; no agreement message is needed. Otherwise send the missing fact, independent evidence or requested second opinion. A new Human question is separate work even with the same words. Peer IDs identify observed messages, not proof of semantic completion. Explicitly resolve_inbox_ids only for work you judge complete after send/drop. Held/refused never resolve work. Unrelated FYI needs no reply. Cancelled work should be dropped silently. Keep unfinished work open.',
              };
              if (JSON.stringify({ ...error.outcome, review }).length > CHANNEL_READ_OUTPUT_LIMIT)
                throw error;
              const observationId = this.groupSendReview.observe(
                reviewOwner,
                current.id,
                bounded.included.map((view) => view.message),
                input.observationId ?? initialObservations.get(current.id),
              );
              observations.set(current.id, observationId);
              if (observeReads)
                this.#observeReadMessages(botSlug, bounded.included, readAdmissions);
              throw new SendReviewRequired({
                ...error.outcome,
                review: { ...review, observationId },
              });
            });
          return sent;
        }
        const body = input.body;
        if (!body.trim() && !input.attachments?.length)
          throw new Error('Channel message requires a body or attachment');
        this.#channels.assertAttachmentRefs(input.attachments ?? []);
        if (input.replyTo !== undefined && !this.#channels.hasMessage(channel.id, input.replyTo)) {
          throw new ChannelReplyTargetError();
        }
        const messageId = this.#causalSending.deliveryMessageId(sessionId, input.deliveryKey);
        this.#causalSending.assertQuoteTargets(channel.id, messageId, input.quotes);
        beforeSend();
        const message: ChannelMessage = {
          id: messageId,
          at: this.#now().toISOString(),
          author: { kind: 'bot', slug: botSlug },
          body,
          ...(input.attachments === undefined ? {} : { attachments: input.attachments }),
          ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
          ...(input.quotes?.length ? { quotes: input.quotes } : {}),
          ...this.#causalSending.perf(sessionId, body),
          ...attribution,
          ...(input.genui === undefined ? {} : { genui: input.genui }),
          ...(input.sessionLinks === undefined ? {} : { sessionLinks: input.sessionLinks }),
        };
        const originId = input.replySourceEventId ?? sourceEventId;
        const origin = {
          sessionId,
          ...(originId === undefined ? {} : { sourceEventId: originId }),
        };
        if (input.deliveryKey === undefined) {
          const appended = await this.#channels.appendMessage(
            OWNER_HUMAN_CONTEXT,
            channel.id,
            message,
            origin,
          );
          if (appended === undefined) throw new Error(`Channel disappeared: ${channel.id}`);
          return appended;
        }
        const result = await this.#channels.appendMessageOnce(
          OWNER_HUMAN_CONTEXT,
          channel.id,
          message,
          undefined,
          origin,
        );
        if (result.status === 'missing') throw new Error(`Channel disappeared: ${channel.id}`);
        if (result.status === 'conflict')
          throw new Error('Human DM delivery key has different content');
        return result.message;
      },
    };
  }

  async #recordTurnCommits(botSlug: string, causeSourceEventId: string): Promise<void> {
    const memory = this.#memory;
    if (memory?.pendingCommits === undefined || memory.advanceCommitCursor === undefined) return;
    try {
      const pending = await (memory.pendingCommitsAsync ?? memory.pendingCommits)(botSlug);
      if (pending.commits.length > 0)
        this.#channels.appendMemoryCommits({
          botSlug,
          causeSourceEventId,
          commits: pending.commits,
        });
      memory.advanceCommitCursor(botSlug, pending.branch, pending.head);
    } catch (error) {
      this.#warn?.(
        `memory-commit-record-failed bot=${botSlug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
  }

  #createBot(
    botSlug: string,
    sourceEventId: string | undefined,
    beforeSend: () => void,
    input: BotCreateInput,
  ): BotCreateOutcome {
    if (sourceEventId === undefined)
      throw new DirectBotToolError('source-required', 'Bot creation requires a Source Event');
    const refuse = (code: string, message: string): never => {
      throw new DirectBotToolError(code, `${code}: ${message}`);
    };
    const creator = this.#registry.get(botSlug);
    if (this.#closed || creator === undefined || creator.paused === true)
      refuse('creator-unavailable', 'The creating PersonaBot is no longer active');
    if (creator) this.#team?.roles.require(humanContext(botOwner(creator)), 'bots.createPrivate');
    const displayName = input.displayName.trim();
    if (displayName.length === 0 || [...displayName].length > MAX_CREATED_BOT_NAME_LENGTH)
      refuse(
        'invalid-input',
        `display_name must be 1 to ${MAX_CREATED_BOT_NAME_LENGTH} characters`,
      );
    const description = input.description?.trim();
    if (description !== undefined && [...description].length > MAX_CREATED_BOT_BIO_LENGTH)
      refuse(
        'invalid-input',
        `description must be at most ${MAX_CREATED_BOT_BIO_LENGTH} characters`,
      );
    const tags = [
      ...new Set((input.tags ?? []).map((tag) => tag.trim()).filter((tag) => tag.length > 0)),
    ];
    if (
      tags.length > MAX_CREATED_BOT_TAGS ||
      tags.some((tag) => [...tag].length > MAX_CREATED_BOT_TAG_LENGTH)
    )
      refuse(
        'invalid-input',
        `tags allows at most ${MAX_CREATED_BOT_TAGS} tags of at most ${MAX_CREATED_BOT_TAG_LENGTH} characters`,
      );
    const memoryLocation = input.memoryLocation?.trim();
    if (memoryLocation !== undefined && memoryLocation.length > 0 && !isAbsolute(memoryLocation))
      refuse('invalid-memory-dir', 'memory_location must be an absolute folder path');
    const avatar =
      input.avatarPath === undefined
        ? undefined
        : this.#readCreatedAvatar(botSlug, input.avatarPath);
    if (memoryLocation) this.#grants?.validatePath?.(botSlug, memoryLocation, true);
    const slug = this.#createBotId();
    beforeSend();
    const created = this.#registry.create({
      slug,
      ownerHumanId: botOwner(creator!),
      displayName,
      ...(input.soul === undefined ? {} : { persona: input.soul }),
      ...(input.coreMemory === undefined ? {} : { coreMemory: input.coreMemory }),
      ...(tags.length === 0 ? {} : { roles: tags }),
      ...(description ? { description } : {}),
      ...(avatar === undefined ? {} : { avatar }),
      ...(memoryLocation ? { memoryLocation } : {}),
    });
    if (!created.ok)
      refuse(
        created.reason === 'invalid-memory-dir' ||
          created.reason === 'git-not-found' ||
          created.reason === 'memory-unavailable'
          ? created.reason
          : 'invalid-input',
        created.reason === 'invalid-memory-dir'
          ? 'memory_location must be an existing absolute folder that does not already hold this Bot'
          : created.reason === 'git-not-found'
            ? 'Git is required to create a Memory Repository'
            : (created.detail ?? 'The PersonaBot could not be created'),
      );
    const record = (created as Extract<typeof created, { ok: true }>).record;
    const dm = this.#channels.getOrCreateDm(
      humanContext(botOwner(record)),
      record.slug,
      record.displayName,
    );
    try {
      this.#channels.appendBotCreateAction?.({
        botSlug,
        causeSourceEventId: sourceEventId,
        created: { botSlug: record.slug, displayName: record.displayName },
      });
    } catch (error) {
      this.#warn?.(
        `bot-create-action-record-failed bot=${botSlug} created=${record.slug} reason=${error instanceof Error ? error.name : 'unknown'}`,
      );
    }
    return {
      botId: record.slug,
      displayName: record.displayName,
      dmChannelId: dm?.id ?? dmChannelId(record.slug),
      memoryDir: this.#registry.memoryDirFor(record.slug) ?? '',
      model: record.modelPlan === undefined && record.model === undefined ? 'host-default' : 'set',
    };
  }

  #readCreatedAvatar(botSlug: string, path: string): string {
    const refuse = (message: string): never => {
      throw new DirectBotToolError('invalid-avatar', `invalid-avatar: ${message}`);
    };
    if (!isAbsolute(path)) refuse('avatar_path must be an absolute file path');
    const roots = (this.#grants?.list(botSlug) ?? [])
      .filter((grant) => grant.revokedAt === undefined)
      .flatMap((grant) => {
        try {
          return [this.#grants!.requireActive(botSlug, grant.id).workspacePath];
        } catch {
          return [];
        }
      });
    const memory = this.#registry.memoryDirFor(botSlug);
    if (memory !== undefined) roots.push(memory);
    this.#grants?.validatePath?.(botSlug, path);
    if (authorizedPathRoot(roots, path) === undefined)
      refuse('avatar_path is outside your Memory Repository and Workspace Grants');
    let bytes: Buffer;
    try {
      const size = statSync(path).size;
      if (size > MAX_PERSONA_BOT_AVATAR_BYTES)
        refuse(`the image is larger than ${MAX_PERSONA_BOT_AVATAR_BYTES} bytes`);
      bytes = readFileSync(path);
    } catch (error) {
      if (error instanceof DirectBotToolError) throw error;
      return refuse('the image file cannot be read');
    }
    return personaBotAvatarFromBytes(bytes) ?? refuse('the image must be a PNG, JPEG or WebP file');
  }

  #memberBotEnabled(bot: PersonaBotRecord): boolean {
    const current = this.#registry.get(bot.slug);
    if (!current || botOwner(current) !== botOwner(bot)) return false;
    return (
      this.#database.read((db) =>
        db
          .prepare(`SELECT 1 FROM humans h, team_settings s
          WHERE h.human_id = ? AND h.status = 'active' AND s.singleton = 1
            AND (s.enabled = 1 OR s.owner_human_id = h.human_id)`)
          .get(botOwner(current)),
      ) !== undefined
    );
  }

  #isMember(botSlug: string, channel: ChannelRecord): boolean {
    if (this.#team)
      return channel.members.includes(botSlug) && this.#team.bots.canRead(botSlug, channel);
    return (
      channel.members.includes(botSlug) &&
      (channel.type !== 'dm' || channel.botSlug === undefined || channel.botSlug === botSlug)
    );
  }

  #speakerInput(botSlug: string, sessionId: string, ids: readonly string[], body: string) {
    const bot = this.#registry.get(botSlug);
    if (!this.#team || !bot || !this.#team.bots.speakerContextEnabled(botSlug)) return undefined;
    const pending = new Map<string, number>();
    const envelopes: Array<ReturnType<TeamService['speakerPolicy']['envelope']>> = [];
    let text = body;
    for (const id of new Set(ids)) {
      if (!text.includes(id)) continue;
      const source = this.#database.read((db) =>
        db
          .prepare(
            "SELECT human_id FROM source_events WHERE source_event_id=? AND source_kind='human-message'",
          )
          .get(id),
      );
      if (typeof source?.['human_id'] !== 'string') continue;
      const envelope = this.#team.speakerPolicy.envelope(
        sessionId,
        source['human_id'],
        '',
        pending,
      );
      envelopes.push(envelope);
      const direct = sessionDirectSpeaker(text, id, envelope.text);
      if (direct !== undefined) {
        text = direct;
        continue;
      }
      const header = `Source Event ID: ${id}`;
      const anchor = text.includes(header) ? header : `[Source Event ${id}]`;
      if (text.includes(anchor))
        text = text.replace(anchor, `${anchor} ${envelope.text.trimEnd()}`);
      else text = text.replace(id, `${id} ${envelope.text.trimEnd()}`);
    }
    return envelopes.length
      ? {
          text,
          commit: () => {
            for (const envelope of envelopes) envelope.commit();
          },
        }
      : undefined;
  }

  #requireTurnAccess(botSlug: string, ids: Iterable<string>): void {
    if (!this.#team) return;
    this.#team.bots.requireActive(botSlug);
    for (const id of ids) {
      const row = this.#database.read((db) =>
        db.prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?').get(id),
      );
      if (typeof row?.['channel_id'] !== 'string') continue;
      const channel = this.#channels.get(row['channel_id']);
      if (channel) this.#team.bots.requireChannel(botSlug, channel);
    }
  }

  #requireMembership(botSlug: string, channelId: string): ChannelRecord {
    const channel = this.#channels.get(channelId);
    if (channel === undefined) throw new Error(`Unknown Channel: ${channelId}`);
    if (!this.#isMember(botSlug, channel)) {
      throw new Error(`PersonaBot ${botSlug} is not a member of Channel ${channelId}`);
    }
    return channel;
  }

  async #runOnLiveOrchestrator(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    run: (orchestrator: { sessionId: string; resume: boolean }) => Promise<void>,
  ): Promise<{ sessionId: string; resume: boolean }> {
    try {
      await run(orchestrator);
      return orchestrator;
    } catch (error) {
      if (this.#closed || this.#turnSideEffectStarted(bot.slug)) throw error;
      if (error instanceof OrchestratorWorkingDirectoryError)
        return this.#replaceMisplacedOrchestrator(bot, orchestrator, error, run);
      if (this.#sessionArchived?.(orchestrator.sessionId) !== true) throw error;
      const replacement = this.#ensureOrchestrator(bot, this.#now().toISOString());
      if (replacement.sessionId === orchestrator.sessionId) throw error;
      this.#warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'orchestrator-archived-mid-turn',
          botSlug: bot.slug,
          archivedSessionId: orchestrator.sessionId,
          sessionId: replacement.sessionId,
        }),
      );
      await run(replacement);
      return replacement;
    }
  }

  async #replaceMisplacedOrchestrator(
    bot: PersonaBotRecord,
    orchestrator: { sessionId: string; resume: boolean },
    error: OrchestratorWorkingDirectoryError,
    run: (orchestrator: { sessionId: string; resume: boolean }) => Promise<void>,
  ): Promise<{ sessionId: string; resume: boolean }> {
    if (this.currentOrchestratorSessionId(bot.slug) !== orchestrator.sessionId) throw error;
    const replaced = await this.#replaceOrchestrator(bot.slug, () => undefined);
    if (replaced.outcome === 'refused') throw error;
    const replacement = this.#ensureOrchestrator(bot, this.#now().toISOString());
    if (replacement.sessionId === orchestrator.sessionId) throw error;
    this.#warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'orchestrator-working-directory-replaced',
        botSlug: bot.slug,
        replacedSessionId: orchestrator.sessionId,
        sessionId: replacement.sessionId,
        sessionCwd: error.sessionCwd,
        memoryCwd: error.memoryCwd,
      }),
    );
    await run(replacement);
    return replacement;
  }

  #turnSideEffectStarted(botSlug: string): boolean {
    return (
      this.#database.read((database) =>
        database
          .prepare(
            `SELECT 1 FROM inbox_admissions
              WHERE bot_slug = ? AND attempt_state = 'running'
                AND side_effect_started_at IS NOT NULL
              LIMIT 1`,
          )
          .get(botSlug),
      ) !== undefined
    );
  }

  #ensureOrchestrator(bot: PersonaBotRecord, at: string): { sessionId: string; resume: boolean } {
    const existing = this.currentOrchestratorSessionId(bot.slug);
    const orchestrator =
      existing === undefined
        ? { sessionId: this.#claimOrchestrator(bot, at), resume: false }
        : { sessionId: existing, resume: true };
    this.#releaseReplacedOrchestrators(bot.slug, orchestrator.sessionId);
    return orchestrator;
  }

  #releaseReplacedOrchestrators(botSlug: string, current: string): void {
    const release = this.#agents.releaseSession?.bind(this.#agents);
    if (release === undefined) return;
    for (const root of this.#ownership.rootsFor(botSlug, 'orchestrator')) {
      if (root.sessionId === current) continue;
      void release(root.sessionId).catch(() =>
        this.#warn?.(
          JSON.stringify({
            component: 'bot-runtime',
            event: 'orchestrator-release-failed',
            botSlug,
            sessionId: root.sessionId,
          }),
        ),
      );
    }
  }

  #claimOrchestrator(bot: PersonaBotRecord, at: string): string {
    const sessionId = this.#createSessionId();
    const cwdReference = this.#orchestratorCwdReference(bot);
    this.#ownership.claim({
      sessionId,
      botSlug: bot.slug,
      rootRole: 'orchestrator',
      ...(cwdReference === undefined ? {} : { cwdReference }),
      at,
    });
    return sessionId;
  }

  #orchestratorCwdReference(bot: PersonaBotRecord): string | undefined {
    return this.#orchestratorCwd?.(bot) ?? this.#cwdReference(bot);
  }

  #cwdReference(bot: PersonaBotRecord): string | undefined {
    const configured = bot.workspaces[0];
    if (configured !== undefined) return configured;
    return this.#workspaceRoot === undefined ? undefined : join(this.#workspaceRoot, bot.slug);
  }

  #createOrReuseAssignment(
    bot: PersonaBotRecord,
    sourceEventId: string,
    input: {
      title: string;
      description: string;
      instructions?: string;
      key?: string;
      grantId: string;
      model?: ModelRoute;
      engine?: PresetSubEngineSelection;
      engineEffort?: string;
      modelGroupId?: string;
      routingTarget?: RoutingTarget;
      modelGroupEffort?: string;
      mode?: string;
    },
    trackDelivery?: (sessionId: string, pending: boolean) => void,
  ): AssignmentCreateOutcome {
    const title = requireBoundedText(input.title, 'title', ASSIGNMENT_TITLE_MAX_LENGTH);
    const description = requireBoundedText(
      input.description,
      'description',
      ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
    );
    const instructions =
      input.instructions === undefined || input.instructions.trim() === ''
        ? undefined
        : input.instructions.trim();
    const text = instructions ?? description;
    const grantId = requireNonBlank(input.grantId, 'Workspace Grant id');
    if (this.#registry.get(bot.slug) === undefined) throw new Error('PersonaBot is deleted');
    const current = this.#registry.get(bot.slug) ?? bot;
    const plan = resolveBotModelPlan(current, () => this.#inheritedModelPlan?.());
    if (input.model !== undefined && !isAssignmentModelChoice(input.model))
      throw new Error('Assignment model choice is invalid');
    const modelGroupId =
      input.modelGroupId === undefined
        ? undefined
        : plan?.assignmentDefault === undefined
          ? input.modelGroupId === this.#groupFallback?.inherited()
            ? input.modelGroupId
            : undefined
          : selectAssignmentGroup(plan, { group: input.modelGroupId });
    if (input.model !== undefined && plan === undefined && modelGroupId === undefined)
      throw new Error('Apply a Model Preset before choosing an Assignment model');
    if (
      input.modelGroupId !== undefined &&
      (modelGroupId === undefined ||
        (input.model === undefined && input.routingTarget === undefined))
    )
      throw new Error('An Assignment Routing Group needs its chosen member route');
    if (this.#grants === undefined) throw new Error('Workspace Grants are unavailable');
    const grant = this.#grants.requireActive(bot.slug, grantId);
    const access = this.#assignmentAccessPresetStore?.get(bot.slug) ?? {
      mode: 'workspace-write' as const,
      revision: 0,
    };
    if (
      access.mode === 'danger-full-access' &&
      bot.ownerHumanId !== undefined &&
      bot.ownerHumanId !==
        (this.#database.read((db) => db.prepare('SELECT owner_human_id FROM team_settings').get())
          ?.owner_human_id ?? OWNER_HUMAN_CONTEXT.humanId)
    )
      throw new TeamError('permission-required');
    const permission: AssignmentPermissionSnapshot = {
      grantId: grant.id,
      workspaceId: grant.workspaceId,
      primaryCwd: grant.workspacePath,
      mode: access.mode,
      approval: 'ask',
      presetRevision: access.revision,
    };
    const key = input.key === undefined ? undefined : requireNonBlank(input.key, 'Continuity Key');
    if (key !== undefined) {
      const holder = this.#assignmentByKey(bot.slug, key);
      if (holder !== undefined && holder.grant_id !== grant.id) {
        throw new Error('Continuity Key belongs to an Assignment with a different Workspace Grant');
      }
      if (
        holder !== undefined &&
        (holder.activity === 'idle' || holder.activity === 'error') &&
        holder.stop_state === 'running'
      ) {
        if (
          input.model !== undefined ||
          input.routingTarget !== undefined ||
          input.engine !== undefined
        )
          throw new Error(
            'An existing keyed Assignment keeps its model; use a new key for a new model choice',
          );
        if (input.mode !== undefined)
          throw new Error(
            'An existing keyed Assignment keeps its mode; use a new key for a new mode choice',
          );
        const request = this.#requestAssignment(
          bot,
          { sessionId: holder.session_id, mode: 'next-turn', text },
          trackDelivery,
          sourceEventId,
        );
        if (request.delivery === 'capacity') {
          const { assignment: _assignment, delivery: _delivery, ...refusal } = request;
          return refusal;
        }
        if (request.delivery === 'refused') throw new Error(request.message);
        return {
          outcome: 'reused',
          assignment: this.#requireAssignmentSummary(bot.slug, holder.session_id),
        };
      }
      if (holder !== undefined) {
        return {
          outcome: 'key-busy',
          message: `Continuity Key ${key} is held by running Assignment ${holder.session_id}; send it a request, wait, or create a new Assignment without the key.`,
        };
      }
    }
    const engineSelection =
      input.engine ??
      (modelGroupId === undefined &&
      input.model === undefined &&
      plan?.sub?.default?.kind === 'engine'
        ? plan.sub.default
        : undefined);
    let engineTarget: Extract<RoutingTarget, { kind: 'engine' }> | undefined;
    if (engineSelection !== undefined) {
      const choice = plan?.sub?.choices.find((entry) =>
        matchesPresetSubChoice(entry, engineSelection),
      );
      if (
        choice?.kind !== 'engine' ||
        (input.engineEffort !== undefined && input.engineEffort !== (choice.effort ?? ''))
      )
        throw new AssignmentChoiceError(
          'assignment-choice-not-allowed',
          'Choose a listed Assignment Subscription Engine account, model and effort',
        );
      engineTarget = presetSubEngineTarget(choice);
      try {
        this.#requireAssignmentEngine?.(bot.slug, engineTarget);
      } catch (error) {
        if (error instanceof EngineLimitError)
          throw new AssignmentChoiceError('assignment-choice-resting', error.message);
        if (error instanceof EngineRefusal)
          throw new AssignmentChoiceError('assignment-choice-unavailable', error.message);
        throw error;
      }
    }
    const modelRoute =
      modelGroupId !== undefined
        ? input.routingTarget?.kind === 'route'
          ? input.routingTarget.route
          : input.model
        : plan === undefined || engineTarget !== undefined
          ? undefined
          : selectAssignmentRoute(plan, input.model);
    if (modelRoute) this.#requireModelRoute?.(bot.slug, modelRoute);
    if (plan?.sub !== undefined && modelGroupId === undefined && modelRoute !== undefined) {
      const rest = this.#routeRests?.restingUntil(modelRoute);
      if (rest !== undefined)
        throw new AssignmentChoiceError(
          'assignment-choice-resting',
          `Assignment model ${rest.provider}/${rest.model} is resting until ${rest.until}`,
        );
    }
    const target =
      engineTarget ??
      input.routingTarget ??
      (modelRoute === undefined ? undefined : { kind: 'route' as const, route: modelRoute });
    const directTarget =
      modelGroupId === undefined &&
      (engineTarget !== undefined || plan?.sub?.choices.some((choice) => choice.kind === 'engine'))
        ? target
        : undefined;
    const refusal = this.#assignmentCapacityRefusal('created');
    if (refusal !== undefined) return refusal;
    const sessionId = this.#createSessionId();
    const createdAt = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        const cwdReference = permission.primaryCwd;
        this.#ownership.claimWithin(database, {
          sessionId,
          botSlug: bot.slug,
          rootRole: 'assignment',
          ...(cwdReference === undefined ? {} : { cwdReference }),
          at: createdAt,
        });
        const sourceHuman = database
          .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
          .get(sourceEventId);
        const rootSessionId = this.#turnSources.get(bot.slug)?.sessionId;
        const rootHuman = rootSessionId
          ? database
              .prepare(
                'SELECT human_id FROM usage_turn_humans WHERE session_id = ? ORDER BY turn DESC LIMIT 1',
              )
              .get(rootSessionId)
          : undefined;
        const creatorHumanId =
          typeof sourceHuman?.['human_id'] === 'string'
            ? sourceHuman['human_id']
            : rootHuman?.['human_id'];
        if (typeof creatorHumanId === 'string')
          database
            .prepare('INSERT OR IGNORE INTO usage_turn_humans VALUES (?, 0, ?, ?)')
            .run(sessionId, creatorHumanId, Date.parse(createdAt));
        database
          .prepare(
            `INSERT INTO assignments (
               session_id, source_event_id, bot_slug, title, description, activity,
               continuity_key, grant_id, workspace_id, primary_cwd, permission_mode,
               approval_policy, preset_revision, model_route_json, model_group_id, model_effort,
               agent_preset, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, 'working', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sessionId,
            sourceEventId,
            bot.slug,
            title,
            description,
            key ?? null,
            permission.grantId,
            permission.workspaceId,
            permission.primaryCwd,
            permission.mode,
            permission.approval,
            permission.presetRevision,
            directTarget !== undefined
              ? JSON.stringify(directTarget)
              : target === undefined
                ? null
                : saveAssignmentTarget(target),
            modelGroupId ?? null,
            modelGroupId === undefined ? null : (input.modelGroupEffort ?? null),
            input.mode ?? null,
            createdAt,
            createdAt,
          );
      },
      ['session-ownership', 'assignments'],
    );
    trackDelivery?.(sessionId, true);
    this.#trackAssignmentRun(sessionId, () =>
      this.#agents.runAssignment({
        ...this.#assignmentModelSelection(bot.slug, sessionId),
        setExecutionReady: (ready) => this.#setAssignmentExecutionReady(sessionId, ready),
        requireContent: () => {
          this.#requireTurnAccess(bot.slug, sourceEventId ? [sourceEventId] : []);
          this.#database.read((db) => requireAssignmentSource(db, sourceEventId, bot.slug));
        },
        accepted: () => trackDelivery?.(sessionId, false),
        toolsInterrupted: (calls) =>
          this.#cancellation.recordInterruptedTools(bot.slug, sessionId, calls),
        sessionId,
        bot,
        text,
        permission,
        recoveryEntry: () => this.getAssignment(bot.slug, sessionId),
        failEngineRecovery: (summary) =>
          this.#assignmentReporting.recordEngineRecoveryFailure(bot.slug, sessionId, summary),
        ...(modelRoute === undefined ? {} : { modelRoute }),
        ...(directTarget !== undefined || (modelGroupId !== undefined && target !== undefined)
          ? { routingTarget: directTarget ?? target! }
          : {}),
        ...this.#assignmentGroupExecution(
          bot.slug,
          sessionId,
          modelGroupId,
          input.modelGroupEffort,
        ),
        ...(input.mode === undefined ? {} : { agentPreset: input.mode }),
        report: async (report, execution) =>
          this.#assignmentReporting.recordReport(bot.slug, sessionId, report, execution),
        completedTurn: (execution) =>
          this.#assignmentReporting.recordCompletedAssignment(bot.slug, sessionId, execution),
        cancelledTurn: (execution) =>
          this.#assignmentReporting.recordUnsuccessfulAssignment(
            bot.slug,
            sessionId,
            execution,
            'cancelled',
          ),
        failedTurn: (execution) => this.#assignmentFailed(bot.slug, sessionId, execution),
      }),
    );
    return {
      outcome: 'created',
      assignment: this.#requireAssignmentSummary(bot.slug, sessionId),
    };
  }

  #requestAssignment(
    bot: PersonaBotRecord,
    input: {
      sessionId: string;
      mode: AssignmentRequestMode;
      text: string;
      answerTo?: string;
      model?: ModelRoute;
    },
    trackDelivery?: (sessionId: string, pending: boolean) => void,
    sourceEventId?: string,
    switchReason?: TurnTargetSwitchReason,
  ): AssignmentRequestOutcome {
    let row = this.#assignmentRow(bot.slug, input.sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${input.sessionId}`);
    if (isArchivedRow(row) || this.#assignmentArchives.has(input.sessionId)) {
      return {
        outcome: 'refused',
        code: 'assignment-ended',
        assignment: this.#requireAssignmentSummary(bot.slug, input.sessionId),
        delivery: 'refused',
        message: `Assignment Session ${input.sessionId} is archived (resolved); nothing was delivered. Create a new Assignment for new work, or call unarchive_assignment first to continue this one.`,
      };
    }
    const stopped = row.stop_state === 'stopped' ? row : undefined;
    if (stopped !== undefined) row = { ...row, stop_state: 'running', activity: 'idle' };
    if (row.stop_state !== 'running') {
      throw new Error(`Assignment Session ${input.sessionId} is stopped or stopping`);
    }
    const permission = permissionFromRow(row);
    if (permission === undefined || this.#grants === undefined) {
      throw new Error('Assignment has no valid Workspace Grant snapshot');
    }
    const grant = this.#grants.requireActive(bot.slug, permission.grantId);
    if (
      grant.workspaceId !== permission.workspaceId ||
      grant.workspacePath !== permission.primaryCwd
    ) {
      throw new Error('Assignment Workspace Grant no longer matches its permission snapshot');
    }
    if (this.#assignmentAcceptances.has(input.sessionId)) {
      throw new Error(
        `Assignment Session ${input.sessionId} is awaiting Inbox acceptance; inspect it before retrying`,
      );
    }
    const text = requireNonBlank(input.text, 'Assignment Request text');
    const recovering = row.activity === 'error';
    const settledActivity: 'idle' | 'error' = recovering ? 'error' : 'idle';
    if (recovering && input.answerTo !== undefined) {
      throw new Error(
        `Assignment Session ${input.sessionId} failed or was interrupted, so an earlier answer may already have reached it; inspect it, then continue it with a request without answer_to`,
      );
    }
    if (input.answerTo !== undefined && input.answerTo !== row.open_ask_source_event_id) {
      throw new Error(
        `Assignment Session ${input.sessionId} has no open ask ${input.answerTo}; inspect it before answering`,
      );
    }
    const retained = storedAssignmentTarget(row);
    const directTarget =
      row.model_group_id === null && retained !== undefined && 'kind' in retained
        ? retained
        : undefined;
    if (input.model !== undefined && directTarget !== undefined && row.activity === 'working')
      throw new Error('Wait for the current Assignment turn to finish before changing its model');
    let modelRoute =
      retained === undefined || !('kind' in retained)
        ? retained
        : retained.kind === 'route'
          ? retained.route
          : undefined;
    if (input.model !== undefined) {
      if (!isAssignmentModelChoice(input.model))
        throw new Error('Assignment model choice is invalid');
      if (this.#registry.get(bot.slug) === undefined) throw new Error('PersonaBot is deleted');
      const current = this.#registry.get(bot.slug) ?? bot;
      const plan = resolveBotModelPlan(current, () => this.#inheritedModelPlan?.());
      if (plan === undefined)
        throw new Error('Apply a Model Preset before choosing an Assignment model');
      modelRoute = selectAssignmentRoute(plan, input.model);
    }
    if (modelRoute && this.#sessionModels.get(input.sessionId) === null)
      this.#requireModelRoute?.(bot.slug, modelRoute);
    const interrupted = this.#interruptedTools.get(input.sessionId);
    const initiatingHuman = this.#database.read((db) => {
      const source = db
        .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId ?? null);
      if (typeof source?.['human_id'] === 'string') return source['human_id'];
      const parentSessionId = this.#turnSources.get(bot.slug)?.sessionId;
      const parent = db
        .prepare(
          'SELECT human_id FROM usage_turn_humans WHERE session_id = ? AND turn >= 0 ORDER BY turn DESC LIMIT 1',
        )
        .get(parentSessionId ?? null);
      return typeof parent?.['human_id'] === 'string' ? parent['human_id'] : undefined;
    });
    const run: AssignmentAgentRun = {
      ...this.#assignmentModelSelection(bot.slug, input.sessionId),
      ...(switchReason === undefined ? {} : { switchReason }),
      beginTurn: () => {
        if (typeof initiatingHuman !== 'string') return;
        this.#database.transaction(
          (db) => {
            db.prepare('INSERT OR REPLACE INTO usage_turn_humans VALUES (?, -1, ?, ?)').run(
              input.sessionId,
              initiatingHuman,
              this.#now().getTime(),
            );
          },
          ['usage'],
        );
      },
      setExecutionReady: (ready) => this.#setAssignmentExecutionReady(input.sessionId, ready),
      requireContent: () => {
        this.#requireTurnAccess(bot.slug, row.source_event_id ? [row.source_event_id] : []);
        this.#database.read((db) => requireAssignmentSource(db, row.source_event_id, bot.slug));
      },
      accepted: () => trackDelivery?.(input.sessionId, false),
      toolsInterrupted: (calls) =>
        this.#cancellation.recordInterruptedTools(bot.slug, input.sessionId, calls),
      sessionId: input.sessionId,
      bot,
      text:
        (recovering ? ASSIGNMENT_RECOVERY_NOTE : '') +
        (interrupted === undefined ? '' : interruptedToolsNote(interrupted)) +
        text,
      resume: true,
      permission,
      recoveryEntry: () => this.getAssignment(bot.slug, input.sessionId),
      failEngineRecovery: (summary) =>
        this.#assignmentReporting.recordEngineRecoveryFailure(bot.slug, input.sessionId, summary),
      ...(modelRoute === undefined ? {} : { modelRoute }),
      ...(directTarget === undefined
        ? {}
        : {
            routingTarget:
              input.model === undefined ? directTarget : { kind: 'route', route: modelRoute! },
          }),
      ...(input.model === undefined
        ? this.#assignmentGroupExecution(
            bot.slug,
            input.sessionId,
            row.model_group_id,
            row.model_effort,
          )
        : {}),
      ...(typeof row.agent_preset === 'string' ? { agentPreset: row.agent_preset } : {}),
      report: async (report, execution) =>
        this.#assignmentReporting.recordReport(bot.slug, input.sessionId, report, execution),
      completedTurn: (execution) =>
        this.#assignmentReporting.recordCompletedAssignment(bot.slug, input.sessionId, execution),
      cancelledTurn: (execution) =>
        this.#assignmentReporting.recordUnsuccessfulAssignment(
          bot.slug,
          input.sessionId,
          execution,
          'cancelled',
        ),
      failedTurn: (execution) => this.#assignmentFailed(bot.slug, input.sessionId, execution),
    };
    return this.#assignmentDelivery.deliverAssignmentRequest({
      bot,
      input,
      row,
      stopped,
      recovering,
      settledActivity,
      run,
      interrupted,
      modelRoute,
      trackDelivery,
    });
  }

  async #stopAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
    cause: 'orchestrator-stop' | 'human-stop' | 'human-session-stop' = 'orchestrator-stop',
  ): Promise<AssignmentSummary> {
    const row = this.#assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (row.stop_state === 'stopped') return this.#requireAssignmentSummary(bot.slug, sessionId);
    if (this.#agents.stopAssignment === undefined)
      throw new Error('Assignment stop is unavailable');
    markSideEffect();
    this.#pendingDeliveries.delete(sessionId);
    this.#cancellation.beginSessionStop(bot.slug, sessionId, 'assignment');
    if (row.stop_state === 'running') {
      const at = this.#now().toISOString();
      this.#database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments
             SET stop_state = 'requested', updated_at = ?
           WHERE bot_slug = ? AND session_id = ? AND stop_state = 'running'`,
            )
            .run(at, bot.slug, sessionId);
        },
        ['assignments'],
      );
    }
    await this.#typingAssignments.get(sessionId)?.stop();
    const stopAssignment = this.#agents.stopAssignment.bind(this.#agents);
    await this.#cancellation.settleStop(
      bot.slug,
      sessionId,
      (async () => {
        await stopAssignment(sessionId);
        await this.#assignmentRuns.get(sessionId);
      })(),
    );
    const at = this.#now().toISOString();
    const sourceEventId = this.#createEventId();
    const stopped = this.#database.transaction(
      (database) => {
        const changed = database
          .prepare(
            `UPDATE assignments
           SET stop_state = 'stopped', activity = 'idle', continuity_key = NULL,
               open_ask_source_event_id = NULL, open_ask_at = NULL, updated_at = ?
         WHERE bot_slug = ? AND session_id = ? AND stop_state = 'requested'`,
          )
          .run(at, bot.slug, sessionId);
        if (changed.changes !== 1) return false;
        const sourceRule = this.#sourcePolicy.resolveIn(database, bot.slug, 'assignment-lifecycle');
        database
          .prepare(
            `INSERT INTO source_events (
            source_event_id, source_kind, bot_slug, assignment_session_id,
            body, created_at, handled_at, attempt_state, payload_json
          ) VALUES (?, 'assignment-lifecycle', ?, ?, ?, ?, ?, 'handled', ?) `,
          )
          .run(
            sourceEventId,
            bot.slug,
            sessionId,
            cause === 'human-session-stop'
              ? HUMAN_SESSION_STOP_NOTICE
              : cause === 'human-stop'
                ? HUMAN_TURN_STOP_NOTICE
                : ORCHESTRATOR_STOP_NOTICE,
            at,
            at,
            JSON.stringify({
              assignmentLifecycle: {
                state: 'stopped',
                cause,
                ...(cause === 'orchestrator-stop' ? {} : { stoppedBy: 'human' }),
              },
            }),
          );
        database
          .prepare(
            `INSERT INTO inbox_admissions
                    (source_event_id, bot_slug, reason,
                     source_policy_revision, source_policy_wake_mode)
                    VALUES (?, ?, 'assignment-lifecycle', ?, ?)`,
          )
          .run(
            sourceEventId,
            bot.slug,
            sourceRule.revision,
            cause === 'human-session-stop' ? 'silent' : sourceRule.wake,
          );
        return cause !== 'human-session-stop' && sourceRule.wake === 'immediate';
      },
      ['assignments', 'source-event', 'bot-inbox'],
    );
    if (stopped) this.#scheduling.scheduleHarvest(bot.slug);
    return this.#requireAssignmentSummary(bot.slug, sessionId);
  }

  async #archiveAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
  ): Promise<AssignmentArchiveOutcome> {
    const row = this.#assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (isArchivedRow(row))
      return {
        outcome: 'archived',
        assignment: this.#requireAssignmentSummary(bot.slug, sessionId),
      };
    const active = (message: string): AssignmentArchiveOutcome => ({
      outcome: 'refused',
      code: 'assignment-active',
      assignment: this.#requireAssignmentSummary(bot.slug, sessionId),
      message,
    });
    if (
      row.activity === 'working' ||
      row.stop_state === 'requested' ||
      this.#assignmentAcceptances.has(sessionId)
    )
      return active(
        `Assignment Session ${sessionId} is still active; nothing was archived. Wait for it to settle or call stop_assignment first.`,
      );
    const archive = this.#sessionArchive?.();
    if (archive === undefined) throw new Error('DSH Session archive is unavailable');
    if (this.#assignmentArchives.has(sessionId))
      return active(
        `Assignment Session ${sessionId} is already being archived; inspect it shortly.`,
      );
    this.#assignmentArchives.add(sessionId);
    try {
      markSideEffect();
      try {
        await archive.archiveSession(sessionId);
      } catch (error) {
        if (error instanceof Error && error.name === 'WorkspaceActiveSessionError')
          return active(
            `DSH reports Session ${sessionId} still has running work; nothing was archived. Stop it first, then retry.`,
          );
        throw error;
      }
      this.#database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments SET archived_at = ?, continuity_key = NULL
                WHERE bot_slug = ? AND session_id = ? AND archived_at IS NULL`,
            )
            .run(this.#now().toISOString(), bot.slug, sessionId);
        },
        ['assignments'],
      );
    } finally {
      this.#assignmentArchives.delete(sessionId);
    }
    return {
      outcome: 'archived',
      assignment: this.#requireAssignmentSummary(bot.slug, sessionId),
    };
  }

  async #unarchiveAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
  ): Promise<{ outcome: 'unarchived'; assignment: AssignmentSummary }> {
    const row = this.#assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (isArchivedRow(row)) {
      const archive = this.#sessionArchive?.();
      if (archive === undefined) throw new Error('DSH Session archive is unavailable');
      markSideEffect();
      await archive.unarchiveSession(sessionId);
      this.#database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments SET archived_at = NULL
                WHERE bot_slug = ? AND session_id = ? AND archived_at IS NOT NULL`,
            )
            .run(bot.slug, sessionId);
        },
        ['assignments'],
      );
    }
    if (row.stop_state === 'stopped') {
      markSideEffect();
      this.#database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments SET stop_state = 'running', activity = 'idle', updated_at = ?
                WHERE bot_slug = ? AND session_id = ? AND stop_state = 'stopped'`,
            )
            .run(this.#now().toISOString(), bot.slug, sessionId);
        },
        ['assignments'],
      );
    }
    return {
      outcome: 'unarchived',
      assignment: this.#requireAssignmentSummary(bot.slug, sessionId),
    };
  }

  #assignmentDmChannel(row: AssignmentRow): ChannelRecord | undefined {
    const bot = this.#registry.get(row.bot_slug);
    if (!bot) return undefined;
    const requester = this.#database.read((db) =>
      db
        .prepare(`
      SELECT coalesce(
        (SELECT human_id FROM source_events WHERE source_event_id = ?),
        (SELECT human_id FROM usage_turn_humans WHERE session_id = ? AND turn >= 0 ORDER BY turn LIMIT 1)
      ) AS human_id
    `)
        .get(row.source_event_id, row.session_id),
    );
    const principal = botOwner(bot);
    const humanId = typeof requester?.['human_id'] === 'string' ? requester['human_id'] : principal;
    return this.#channels
      .list()
      .find(
        (channel) =>
          channel.type === 'dm' &&
          channel.botSlug === row.bot_slug &&
          !channel.deletedAt &&
          (channel.dmHumanId ?? principal) === humanId,
      );
  }

  #publishAssignmentRefusal(row: AssignmentRow, error: unknown): void {
    const channel = this.#assignmentDmChannel(row);
    if (channel === undefined) return;
    const notice = this.#publishSessionFailure({
      channelId: channel.id,
      botSlug: row.bot_slug,
      sessionId: row.session_id,
      role: 'assignment',
      error,
      context: row.title,
      ...(error instanceof AssignmentInboxAcceptanceUncertainError ||
      row.open_ask_source_event_id === null
        ? {}
        : { assignmentAnswerTo: row.open_ask_source_event_id }),
    });
    this.#assignmentNotices.add(notice);
    void notice.then(
      () => this.#assignmentNotices.delete(notice),
      () => this.#assignmentNotices.delete(notice),
    );
  }

  #setAssignmentExecutionReady(sessionId: string, ready: boolean): void {
    if (ready) this.#preparedAssignments.add(sessionId);
    else this.#preparedAssignments.delete(sessionId);
  }

  #trackAssignmentRun(
    sessionId: string,
    task: (beginProcessing: () => void) => Promise<void>,
    failure: () => { activity: 'idle' | 'error'; answerTo?: string } = () => ({
      activity: 'error',
    }),
    awaitAcceptance = false,
  ): void {
    let tracked: Promise<void> | undefined;
    const run = (async () => {
      const assignment = this.#assignmentRow(undefined, sessionId);
      if (assignment === undefined) return;
      let processing: MessagingProcessing | undefined;
      const beginProcessing = () => {
        if (
          processing ||
          this.#closed ||
          this.#assignmentRow(undefined, sessionId)?.stop_state !== 'running'
        )
          return;
        processing = this.#externalMessaging?.beginProcessing(assignment.bot_slug, [
          assignment.source_event_id,
        ]);
        if (processing) this.#typingAssignments.set(sessionId, processing);
      };
      this.#setActivity(sessionId, 'working');
      try {
        if (!awaitAcceptance) beginProcessing();
        await task(beginProcessing);
        if (this.#assignmentRuns.get(sessionId) !== tracked) return;
        if (this.#assignmentRow(undefined, sessionId)?.activity === 'error') return;
        this.#setActivity(sessionId, 'idle');
      } catch (error) {
        if (this.#assignmentRuns.get(sessionId) !== tracked) return;
        const continuation = this.#groupContinuations.get(sessionId);
        if (continuation !== undefined && !continuation.refreshing) {
          continuation.error = error;
          this.#setActivity(sessionId, 'idle');
          return;
        }
        const refused = failure();
        this.#setActivity(sessionId, refused.activity);
        const row = this.#assignmentRow(undefined, sessionId);
        if (row?.stop_state !== 'running') return;
        if (row !== undefined) {
          const channel = this.#assignmentDmChannel(row);
          if (channel !== undefined) {
            await this.#publishSessionFailure({
              channelId: channel.id,
              botSlug: row.bot_slug,
              sessionId,
              role: 'assignment',
              error,
              context: row.title,
              ...(refused.answerTo === undefined ? {} : { assignmentAnswerTo: refused.answerTo }),
            });
          }
        }
      } finally {
        await processing?.stop();
        if (this.#typingAssignments.get(sessionId) === processing)
          this.#typingAssignments.delete(sessionId);
        this.#approvalCapacity.forget(sessionId);
      }
    })();
    tracked = run.then(
      () => {
        if (this.#assignmentRuns.get(sessionId) === tracked) this.#assignmentRuns.delete(sessionId);
      },
      () => {
        if (this.#assignmentRuns.get(sessionId) === tracked) this.#assignmentRuns.delete(sessionId);
      },
    );
    this.#assignmentRuns.set(sessionId, tracked);
  }

  #assignmentRow(botSlug: string | undefined, sessionId: string): AssignmentRow | undefined {
    return this.#database.read(
      (database) =>
        (botSlug === undefined
          ? database.prepare(`SELECT * FROM assignments WHERE session_id = ?`).get(sessionId)
          : database
              .prepare(`SELECT * FROM assignments WHERE bot_slug = ? AND session_id = ?`)
              .get(botSlug, sessionId)) as AssignmentRow | undefined,
    );
  }

  #assignmentByKey(botSlug: string, continuityKey: string): AssignmentRow | undefined {
    return this.#database.read(
      (database) =>
        database
          .prepare(`SELECT * FROM assignments WHERE bot_slug = ? AND continuity_key = ?`)
          .get(botSlug, continuityKey) as AssignmentRow | undefined,
    );
  }

  #activeAssignmentCount(): number {
    return this.#database.read((database) => {
      const rows = database
        .prepare(
          "SELECT session_id, stop_state FROM assignments WHERE activity = 'working' OR stop_state = 'requested'",
        )
        .all() as Array<{ session_id: string; stop_state: string }>;
      return rows.filter(
        (row) => row.stop_state === 'requested' || !this.#approvalCapacity.released(row.session_id),
      ).length;
    });
  }

  #assignmentCapacityRefusal(
    action: 'created' | 'awakened',
  ): AssignmentCapacityRefusal | undefined {
    const activeCount = this.#activeAssignmentCount();
    const limit = this.#assignmentConcurrencyLimit();
    if (!Number.isInteger(limit) || limit < 1 || limit > 32)
      throw new Error('Invalid Assignment Concurrency Limit; expected an integer from 1 to 32');
    if (activeCount < limit) return undefined;
    return {
      outcome: 'capacity',
      code: 'assignment-capacity',
      activeCount,
      limit,
      retryable: true,
      message: `Assignment Concurrency Limit ${limit} reached; retryable: true. Nothing was ${action}. Wait for active work to settle before retrying; keep the item that asked for this open, or snooze it with inbox_snooze until then, and do not resolve it.`,
    };
  }

  #requireAssignmentSummary(botSlug: string, sessionId: string): AssignmentSummary {
    const assignment = this.getAssignment(botSlug, sessionId);
    if (assignment === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    return assignment;
  }

  async #pickSessionGroup(
    botSlug: string,
    choice: Extract<SessionModelChoice, { kind: 'group' }>,
    attempted?: ReadonlySet<string>,
  ): Promise<import('../models/group-fallback.js').MixedGroupPick> {
    const groups = this.#groupFallback;
    const mixed = await groups?.pickMixedAssignment?.(botSlug, choice.id, choice.effort, attempted);
    if (mixed !== undefined) return mixed;
    const native = await groups?.pick(botSlug, choice.id, choice.effort);
    if (native?.kind === 'exhausted') return native;
    if (native?.kind !== 'route') return { kind: 'unavailable' };
    const { route, switchReason } = native;
    return {
      kind: 'target',
      target: { kind: 'route', route },
      ...(switchReason === undefined ? {} : { switchReason }),
    };
  }

  #assignmentModelSelection(
    botSlug: string,
    sessionId: string,
  ): Pick<AssignmentAgentRun, 'sessionModel' | 'observeTurnTarget'> {
    const request = randomUUID();
    return {
      observeTurnTarget: (turn, step, target, reason) =>
        recordTurnTarget(this.#database, sessionId, {
          turn,
          step,
          target,
          request,
          ...(reason === undefined ? {} : { switchReason: reason }),
        }),
      sessionModel: () => {
        const choice = this.#sessionModels.get(sessionId);
        this.#activeSessionModels.set(sessionId, choice);
        return {
          choice,
          finish: () => this.#activeSessionModels.delete(sessionId),
          apply: (run) => {
            if (choice === null) return run;
            const {
              modelRoute: _route,
              routingTarget: _target,
              selectGroupTarget: _select,
              groupEffort: _effort,
              groupSwitchReason: _groupReason,
              switchReason: _reason,
              failedTurn: _failure,
              ...rest
            } = run;
            const base: AssignmentAgentRun = {
              ...rest,
              failedTurn: (execution) =>
                this.#assignmentReporting.recordUnsuccessfulAssignment(
                  botSlug,
                  sessionId,
                  execution,
                  'failed',
                ),
            };
            if (choice.kind !== 'group') {
              const target = directSessionTarget(choice);
              if (target.kind === 'route') this.#requireModelRoute?.(botSlug, target.route);
              return {
                ...base,
                routingTarget: target,
                ...(target.kind === 'route' ? { modelRoute: target.route } : {}),
              };
            }
            let current: RoutingTarget | undefined;
            let reason: TurnTargetSwitchReason | undefined;
            return {
              ...base,
              ...(choice.effort === undefined ? {} : { groupEffort: choice.effort }),
              groupSwitchReason: () => reason,
              selectGroupTarget: async (attempted, error) => {
                const rest =
                  current === undefined || error === undefined
                    ? undefined
                    : this.#continuation.routingTargetFailure(current, error);
                if (error !== undefined && rest === undefined && !unavailableRoutingEngine(error))
                  throw error instanceof Error
                    ? error
                    : new Error('Assignment failed', { cause: error });
                const next = await this.#pickSessionGroup(botSlug, choice, attempted);
                if (next.kind === 'exhausted')
                  throw new RouteRestingError(next.rests, next.subscription);
                if (
                  next.kind !== 'target' ||
                  attempted.size >= MAX_MIXED_GROUP_ATTEMPTS ||
                  attempted.has(routingTargetRestKey(next.target))
                )
                  throw new RoutingGroupUnavailableError(error);
                current = next.target;
                reason =
                  next.switchReason ??
                  rest?.reason ??
                  (error === undefined ? undefined : 'credential');
                return current;
              },
            };
          },
        };
      },
    };
  }

  #assignmentGroupExecution(
    botSlug: string,
    sessionId: string,
    groupId: string | null | undefined,
    effort: string | null | undefined,
  ): Pick<AssignmentAgentRun, 'selectGroupTarget' | 'groupEffort' | 'groupSwitchReason'> {
    const groups = this.#groupFallback;
    if (groupId == null || !groups?.pickMixedAssignment) return {};
    const row = this.#assignmentRow(botSlug, sessionId);
    if (
      groups.isMixed?.(groupId) !== true &&
      (row === undefined || assignmentTargetFromRow(row)?.kind !== 'engine')
    )
      return {};
    let reason: TurnTargetSwitchReason | undefined;
    return {
      groupSwitchReason: () => reason,
      ...(effort == null ? {} : { groupEffort: effort }),
      selectGroupTarget: async (attempted, error) => {
        const row = this.#assignmentRow(botSlug, sessionId);
        if (
          row?.stop_state !== 'running' ||
          row.model_group_id !== groupId ||
          isArchivedRow(row) ||
          this.#closed
        )
          return undefined;
        const current = assignmentTargetFromRow(row);
        const rest =
          error === undefined || current === undefined
            ? undefined
            : this.#continuation.routingTargetFailure(current, error);
        if (
          error !== undefined &&
          rest === undefined &&
          !(current?.kind === 'engine' && unavailableRoutingEngine(error))
        )
          throw error instanceof Error ? error : new Error('Assignment failed', { cause: error });
        this.#requireExecution?.(botSlug);
        const mixed = await groups.pickMixedAssignment?.(
          botSlug,
          groupId,
          effort ?? undefined,
          attempted,
        );
        const native =
          mixed === undefined
            ? await groups.pick(botSlug, groupId, effort ?? undefined)
            : undefined;
        const next =
          native?.kind === 'route'
            ? {
                kind: 'target' as const,
                target: { kind: 'route' as const, route: native.route },
                switchReason: native.switchReason,
              }
            : mixed;
        if (next?.kind === 'exhausted') throw new RouteRestingError(next.rests, next.subscription);
        if (next?.kind !== 'target' || attempted.size >= MAX_MIXED_GROUP_ATTEMPTS)
          throw new RoutingGroupUnavailableError(error);
        const target = next.target;
        reason =
          next.switchReason ?? rest?.reason ?? (error === undefined ? undefined : 'credential');
        const serialized = saveAssignmentTarget(target);
        if (serialized === row.model_route_json) return target;
        const written = this.#database.transaction(
          (db) =>
            db
              .prepare(
                `UPDATE assignments SET model_route_json = ?, updated_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = 'running' AND archived_at IS NULL
              AND model_group_id = ? AND model_route_json IS ?`,
              )
              .run(
                serialized,
                this.#now().toISOString(),
                sessionId,
                botSlug,
                groupId,
                row.model_route_json,
              ),
          ['assignments'],
        );
        if (written.changes === 0) return undefined;
        if (current !== undefined && error !== undefined)
          await this.#appendModelSwitch(botSlug, sessionId, undefined, {
            kind: 'switch',
            from: routingTargetKey(current),
            to: routingTargetKey(target),
            reason: rest?.reason ?? 'credential',
            ...(rest === undefined ? {} : { until: rest.until }),
          });
        return target;
      },
    };
  }

  #assignmentFailed(
    botSlug: string,
    sessionId: string,
    execution: { turn: number; endSeq: number },
  ): void {
    const row = this.#assignmentRow(botSlug, sessionId);
    const current = row === undefined ? undefined : modelRouteFromRow(row);
    if (
      row?.model_group_id == null ||
      this.#groupFallback?.isMixed?.(row.model_group_id) === true ||
      current === undefined ||
      this.#groupFallback === undefined ||
      this.#routeRests?.restingUntil(current) === undefined
    ) {
      this.#assignmentReporting.recordUnsuccessfulAssignment(
        botSlug,
        sessionId,
        execution,
        'failed',
      );
      return;
    }
    const continuation = { refreshing: false };
    this.#groupContinuations.set(sessionId, continuation);
    void this.#continueOnGroup(botSlug, sessionId, current, execution, continuation).finally(() => {
      if (this.#groupContinuations.get(sessionId) === continuation)
        this.#groupContinuations.delete(sessionId);
    });
  }

  async #continueOnGroup(
    botSlug: string,
    sessionId: string,
    failed: ModelRoute,
    execution: { turn: number; endSeq: number },
    continuation: { error?: unknown; refreshing: boolean },
  ): Promise<void> {
    const ownsContinuation = () => this.#groupContinuations.get(sessionId) === continuation;
    const runningAssignment = () => {
      if (!ownsContinuation() || this.#assignmentRuns.has(sessionId)) return undefined;
      const row = this.#assignmentRow(botSlug, sessionId);
      return row?.stop_state === 'running' && !isArchivedRow(row) ? row : undefined;
    };
    const fail = (error: unknown) => {
      const row = runningAssignment();
      if (row === undefined) return;
      this.#assignmentReporting.recordUnsuccessfulAssignment(
        botSlug,
        sessionId,
        execution,
        'failed',
      );
      this.#setActivity(sessionId, 'error');
      const channel = this.#assignmentDmChannel(row);
      if (channel === undefined) return;
      void this.#publishSessionFailure({
        channelId: channel.id,
        botSlug,
        sessionId,
        role: 'assignment',
        error,
        context: row.title,
      });
    };
    try {
      await Promise.resolve();
      const running = this.#assignmentRuns.get(sessionId);
      if (running !== undefined) await running.catch(() => undefined);
      if (!ownsContinuation()) return;
      continuation.refreshing = true;
      const cause = continuation.error ?? new Error('The Assignment model stopped');
      const restReason = this.#routeRests?.restingUntil(failed)?.reason;
      const next = await this.refreshAssignmentRoute(botSlug, sessionId);
      const bot = this.#registry.get(botSlug);
      const row = runningAssignment();
      if (row === undefined) return;
      if (next === undefined || sameModelRoute(next, failed) || bot === undefined) {
        fail(cause);
        return;
      }
      const request = this.#requestAssignment(
        bot,
        {
          sessionId,
          mode: 'next-turn',
          text:
            row.model_group_id == null ? ASSIGNMENT_MODEL_CHANGE_NOTE : ASSIGNMENT_FALLBACK_NOTE,
        },
        undefined,
        undefined,
        restReason ?? this.#routeRests?.restingUntil(failed)?.reason,
      );
      if (request.delivery === 'refused' || request.delivery === 'capacity') fail(cause);
    } catch (error) {
      fail(continuation.error ?? error);
    }
  }

  async refreshAssignmentRoute(
    botSlug: string,
    sessionId: string,
    allowStopped = false,
  ): Promise<ModelRoute | undefined> {
    const row = this.#assignmentRow(botSlug, sessionId);
    const groupId = row?.model_group_id;
    const current = row === undefined ? undefined : modelRouteFromRow(row);
    if (
      row === undefined ||
      groupId == null ||
      this.#groupFallback?.isMixed?.(groupId) === true ||
      current === undefined ||
      this.#groupFallback === undefined ||
      isArchivedRow(row) ||
      (row.stop_state !== 'running' && !(allowStopped && row.stop_state === 'stopped'))
    )
      return current;
    const rest = this.#routeRests?.restingUntil(current);
    if (rest === undefined) return current;
    const keepLegacyEffort =
      row.model_effort == null &&
      (assignmentGroupOptionOf(
        resolveBotModelPlan(this.#registry.get(botSlug) ?? {}, () => this.#inheritedModelPlan?.()),
        groupId,
      )?.allowedEfforts?.includes(current.reasoningEffort ?? '') ??
        (groupId === this.#groupFallback.inherited() &&
          current.reasoningEffort !== undefined &&
          current.reasoningEffort === this.#groupFallback.inheritedEffort()));
    const effort = row.model_effort ?? (keepLegacyEffort ? current.reasoningEffort : undefined);
    const pick = await this.#groupFallback.pick(botSlug, groupId, effort);
    const readCurrentRoute = () => {
      const latest = this.#assignmentRow(botSlug, sessionId);
      return latest === undefined ? undefined : modelRouteFromRow(latest);
    };
    if (pick.kind !== 'route' || sameModelRoute(pick.route, current)) return readCurrentRoute();
    const { reasoningEffort: memberEffort, ...member } = pick.route;
    const reasoningEffort =
      keepLegacyEffort && memberEffort !== undefined ? current.reasoningEffort : memberEffort;
    const route = reasoningEffort === undefined ? member : { ...member, reasoningEffort };
    const at = this.#now().toISOString();
    const written = this.#database.transaction(
      (database) =>
        database
          .prepare(
            `UPDATE assignments SET model_route_json = ?, updated_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = ? AND archived_at IS NULL
                AND model_group_id = ? AND model_route_json = ?`,
          )
          .run(
            JSON.stringify(route),
            at,
            sessionId,
            botSlug,
            row.stop_state,
            groupId,
            row.model_route_json,
          ),
      ['assignments'],
    );
    if (written.changes === 0) return readCurrentRoute();
    const choice: ModelSwitch = {
      kind: 'switch',
      from: { provider: current.provider, model: current.model },
      to: route,
      reason: rest.reason ?? 'quota',
      until: rest.until,
    };
    this.#warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'model-fallback',
        botSlug,
        session: sessionId,
        from: `${choice.from.provider}/${choice.from.model}`,
        to: `${choice.to.provider}/${choice.to.model}`,
      }),
    );
    await this.#appendModelSwitch(botSlug, sessionId, undefined, choice);
    return route;
  }

  #collectInbox(botSlug: string): { units: InboxUnit[]; eventIds: string[] } {
    const rows = this.#database.read(
      (database) =>
        database
          .prepare(
            `SELECT e.source_event_id, e.source_kind, e.assignment_session_id,
                    e.body, e.created_at, e.expects_reply, a.continuity_key,
                    CASE WHEN e.source_kind = 'schedule' THEN e.payload_json END AS schedule_json,
                    json_extract(e.payload_json, '$.assignmentLifecycle.reportSourceEventId') AS paired_report_id,
                    json_extract(e.payload_json, '$.assignmentLifecycle.cause') AS lifecycle_cause,
                    CASE WHEN a.stop_state = 'running' THEN a.open_ask_source_event_id END AS open_ask_id,
                    (SELECT body FROM source_events WHERE source_event_id = a.open_ask_source_event_id) AS open_ask_summary,
                    CASE WHEN a.stop_state = 'stopped' THEN 'stopped'
                         WHEN a.stop_state = 'requested' THEN 'stopping'
                         ELSE a.activity END AS activity
               FROM source_events e
               LEFT JOIN assignments a ON a.session_id = e.assignment_session_id
              WHERE e.bot_slug = ?
                AND e.source_kind IN ('assignment-report', 'assignment-lifecycle', 'schedule')
                AND e.observed_at IS NULL
              ORDER BY e.rowid DESC
              LIMIT 20`,
          )
          .all(botSlug) as unknown as InboxReportRow[],
    );

    rows.reverse();
    this.#messagingEvents.collectExternalRows(botSlug, rows);
    const units = coalesceInbox(rows);
    return {
      units,
      eventIds: rows.map((row) => row.source_event_id),
    };
  }

  reconcileMemoryChangesOnStartup(): void {
    this.#memoryEvents.reconcileMemoryChangesOnStartup(this.#closed);
  }

  #insertMemoryChange(
    database: DatabaseSync,
    sourceEventId: string,
    botSlug: string,
    change: MemoryChangeDelta,
  ): void {
    database
      .prepare(
        `
        INSERT INTO source_events (
          source_event_id, source_kind, bot_slug, body, created_at, payload_json
        ) VALUES (?, 'memory-change', ?, ?, ?, ?)
      `,
      )
      .run(
        sourceEventId,
        botSlug,
        change.summary,
        this.#now().toISOString(),
        JSON.stringify({ memoryChange: change }),
      );
    database
      .prepare(
        `
        INSERT INTO inbox_admissions (source_event_id, bot_slug, reason)
        VALUES (?, ?, 'memory-change')
      `,
      )
      .run(sourceEventId, botSlug);
  }

  #dmChannel(botSlug: string): ChannelRecord | undefined {
    return this.#channels
      .list()
      .find((channel) => channel.type === 'dm' && channel.botSlug === botSlug);
  }

  #observeReadMessages(
    botSlug: string,
    messages: ChannelMessageView[],
    readAdmissions: Set<string>,
  ): void {
    if (messages.length === 0) return;
    const observedAt = this.#now().toISOString();
    const { changedChannels, changedMessages } = this.#database.transaction(
      (database) => {
        const update = database.prepare(`
          UPDATE inbox_admissions
             SET observed_at = COALESCE(observed_at, ?),
                 side_effect_started_at = COALESCE(side_effect_started_at, ?),
                 attempt_state = 'running', last_error = NULL
           WHERE bot_slug = ?
             AND reason NOT IN ('assignment-report', 'assignment-lifecycle')
             AND attempt_state IN ('pending', 'retryable')
             AND source_event_id IN (
               SELECT source_event_id FROM channel_placements
                WHERE channel_id = ? AND message_id = ?
             )
           RETURNING source_event_id
        `);
        const changedChannels = new Set<string>();
        const changedMessages: Array<{ channelId: string; messageId: string }> = [];
        for (const item of messages) {
          const claimed = update.get(
            observedAt,
            observedAt,
            botSlug,
            item.channelId,
            item.message.id,
          ) as { source_event_id: string } | undefined;
          if (claimed === undefined) continue;
          readAdmissions.add(claimed.source_event_id);
          changedChannels.add(item.channelId);
          changedMessages.push({
            channelId: item.channelId,
            messageId: item.message.id,
          });
        }
        return { changedChannels, changedMessages };
      },
      ['bot-inbox'],
    );
    for (const { channelId, messageId } of changedMessages)
      this.#channels.admissionChanged?.(channelId, messageId);
    for (const channelId of changedChannels) this.#groupDigest.scheduleDigest(botSlug, channelId);
  }

  #notifyReadAdmissions(sourceEventIds: Set<string>): void {
    if (sourceEventIds.size === 0) return;
    const ids = [...sourceEventIds];
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.#database.read((database) =>
      database
        .prepare(
          `SELECT channel_id, message_id FROM source_events
          WHERE source_event_id IN (${placeholders})`,
        )
        .all(...ids),
    ) as Array<{ channel_id: string | null; message_id: string | null }>;
    for (const source of rows) {
      if (source.channel_id !== null && source.message_id !== null)
        this.#channels.admissionChanged?.(source.channel_id, source.message_id);
    }
  }

  #markReportSideEffects(sourceEventIds: readonly string[], botSlug: string): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    this.#database.transaction(
      (database) =>
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET side_effect_started_at = COALESCE(side_effect_started_at, ?)
             WHERE bot_slug = ? AND reason IN ('assignment-report', 'assignment-lifecycle', 'memory-change', 'group-mention', 'group-ordinary', 'human-dm')
               AND attempt_state = 'running'
               AND source_event_id IN (${placeholders})
          `,
          )
          .run(this.#now().toISOString(), botSlug, ...sourceEventIds),
      ['bot-inbox'],
    );
  }

  #setObserved(sourceEventIds: string[], at: string | null, botSlug?: string): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE source_events SET observed_at = ?
              WHERE source_event_id IN (${placeholders})`,
          )
          .run(at, ...sourceEventIds);
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET observed_at = ?,
                   attempt_state = CASE
                     WHEN ? IS NOT NULL THEN 'running'
                     WHEN side_effect_started_at IS NULL THEN 'retryable'
                     ELSE 'needs-repair'
                   END
             WHERE reason IN ('assignment-report', 'assignment-lifecycle', 'memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm')
               AND attempt_state IN ('pending', 'retryable', 'running')
               AND (? IS NULL OR bot_slug = ?)
               AND source_event_id IN (${placeholders})
          `,
          )
          .run(at, at, botSlug ?? null, botSlug ?? null, ...sourceEventIds);
      },
      ['source-event', 'bot-inbox'],
    );
  }

  #markReportsHandled(sourceEventIds: string[], botSlug?: string, sessionId?: string): void {
    if (sourceEventIds.length === 0) return;
    const placeholders = sourceEventIds.map(() => '?').join(', ');
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `
            UPDATE inbox_admissions
               SET attempt_state = 'handled', handled_at = ?, opened_at = COALESCE(opened_at, ?)
             WHERE reason IN ('assignment-report', 'assignment-lifecycle', 'memory-change', 'schedule', 'group-mention', 'group-ordinary', 'human-dm')
               AND attempt_state = 'running'
               AND (? IS NULL OR bot_slug = ?)
               AND source_event_id IN (${placeholders})
          `,
          )
          .run(
            this.#now().toISOString(),
            this.#now().toISOString(),
            botSlug ?? null,
            botSlug ?? null,
            ...sourceEventIds,
          );
        if (sessionId !== undefined)
          linkScheduleFiringsToSession(database, sourceEventIds, placeholders, sessionId);
      },
      ['bot-inbox', 'bot-schedules'],
    );
  }

  #setStopState(
    botSlug: string,
    sessionId: string,
    from: 'running' | 'stopped',
    to: 'running' | 'stopped',
    activity: AssignmentRow['activity'] = 'idle',
  ): void {
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE assignments SET stop_state = ?, activity = ?, updated_at = ?
              WHERE bot_slug = ? AND session_id = ? AND stop_state = ?`,
          )
          .run(to, activity, this.#now().toISOString(), botSlug, sessionId, from);
      },
      ['assignments'],
    );
    this.#approvalCapacity.changed();
  }

  #setActivity(sessionId: string, activity: AssignmentActivity): void {
    const at = this.#now().toISOString();
    this.#database.transaction(
      (database) => {
        database
          .prepare(
            "UPDATE assignments SET activity = ?, updated_at = ? WHERE session_id = ? AND stop_state = 'running'",
          )
          .run(activity, at, sessionId);
      },
      ['assignments'],
    );
    this.#approvalCapacity.changed();
  }
}

export { callTimelineNote, callVisualNote } from '../features/voice/events.js';

export function createBotRuntime(options: BotRuntimeOptions): BotRuntime {
  return new BotRuntimeImplementation(options);
}
