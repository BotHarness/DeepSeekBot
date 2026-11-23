import type { OrchestratorChannelAccess } from '../channels/runtime-access-types.js';
export type {
  BotReactionInput,
  BotReactionResult,
  ChannelListEntry,
  ChannelListInput,
  ChannelListPage,
  ChannelMessageView,
  ChannelQueryInput,
  ChannelQueryPage,
  OrchestratorChannelAccess,
} from '../channels/runtime-access-types.js';
import { createChannelAccess } from '../channels/runtime-access.js';
import { createRuntimeInputs } from '../features/approvals/runtime-inputs.js';
import {
  createDirectTools,
  type ActiveDirectTool,
  type DirectBotToolCall,
  type DirectBotToolSpec,
} from '../features/sessions/direct-tools.js';
import {
  createTobCliRuntime,
  type TobCliAuthority,
  type TobCliRequestLease,
} from '../features/tob/cli-runtime.js';
export { DirectBotToolError } from '../features/sessions/direct-tools.js';
export type { DirectBotToolCall, DirectBotToolSpec } from '../features/sessions/direct-tools.js';
export type { TobCliAuthority, TobCliRequestLease } from '../features/tob/cli-runtime.js';
export { markSkillTokens, skillInvocationPrompt } from './channel-prompts.js';
import { createGroupDigest } from './group-digest.js';
export type { GroupContext } from './group-digest.js';
import { createChannelAdmission } from '../channels/runtime-admission.js';
import { createCausalSending } from '../channels/causal-sending.js';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import { sessionModelChoices } from './session-model-choices.js';
import { createOrchestratorScheduling } from './orchestrator-scheduling.js';
import { createOrchestratorCancellation } from './orchestrator-cancellation.js';
import {
  createOrchestratorContinuation,
  type PendingAutoContinue,
} from './orchestrator-continuation.js';
import type { AssignmentRow } from '../features/assignments/events-types.js';
import { createMessagingEvents } from '../features/messaging/events.js';
import { createActivityEvents } from '../features/activity/events.js';
import { createAssignmentDelivery } from '../features/assignments/delivery.js';
import { createAssignmentReporting } from '../features/assignments/reporting.js';
import { createAssignmentEvents } from '../features/assignments/events.js';
import type { TurnTarget, TurnTargetSwitchReason } from '@botharness/host-protocol/turn-target';
import { lastTurnTarget, readTurnTargets, type TurnTargetSegment } from './turn-targets.js';
import type {
  AssignmentActivity,
  AssignmentReport,
  AssignmentReportInput,
  ChannelAssignmentSummary,
} from '@botharness/host-protocol/wire';

import { quotePromptBlock } from '../channels/quotes.js';

import type { TobCliRequest, TobCliStatus, TobCliTurn } from '../tob/cli-request.js';
import type { TeamService } from '../team/service.js';
import { botOwner } from '../team/bot-access.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { SessionRecoveryAction } from './session-recovery.js';
import type { AssignmentReportContent } from './assignment-report.js';
import type {
  AssignmentReportRead,
  AcceptedAssignmentReportPage,
} from './assignment-report-reader.js';
import { GroupSendReview } from '../channels/send-review.js';
import { type TobService } from '../tob/service.js';
import {
  AssignmentApprovalCapacity,
  type AssignmentApprovalWaitLease,
  type AssignmentExecutionWait,
} from './assignment-approval-capacity.js';
import type { AssignmentWaitOutcome } from './assignment-wait.js';
import { externalMemberWake } from '../messaging/defaults.js';
import type { SenderPermissions } from '../messaging/sender-access.js';
import type { MessagingDirectoryQuery, MessagingDirectoryPage } from '../messaging/directory.js';
import type {
  ThreadReceptionInput,
  ThreadReceptionPolicy,
  ThreadReceptionView,
} from '../messaging/thread-policy.js';
import type { GroupReceptionInput, GroupReceptionPolicy } from '../messaging/group-policy.js';
import { requireSourceEffects } from '../purge/fence.js';
import { saveAttachmentFile } from '../attachments/file-operations.js';
import { OriginalAttachmentAccess } from '../attachments/original-access.js';
import { createMemoryEvents } from '../features/memory/events.js';
import { type CallFrameAccess } from '../features/voice/events.js';
import type { OutboxIntent, OutboundMessaging } from '../messaging/outbound.js';
import { type PrivateInputOrigin } from '../credentials/im-origin.js';
import type { MessagingProcessing } from '../messaging/typing.js';
import type {
  ExternalSource,
  ExternalContextQuery,
  ExternalContextResult,
} from '../messaging/inbound.js';
import { randomUUID } from 'node:crypto';
import {
  createInboxHistoryQuery,
  type InboxHistoryInput,
  type InboxHistoryPage,
  type InboxHistoryQuery,
} from './inbox-history.js';
import {
  createInboxTriage,
  type InboxTriage,
  type OrchestratorInboxTriage,
} from './inbox-triage.js';
import type { DatabaseSync } from 'node:sqlite';
import { type PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotModelPlan, ModelRoute } from '../models/presets.js';
import type { PresetSubEngineSelection } from '../models/preset-sub.js';
import type { RouteRests } from '../models/route-rest.js';
import type { GroupFallback, ModelSwitch } from '../models/group-fallback.js';
import type { RoutingTarget } from '../models/routing-groups.js';
import { EngineLimitError } from '../engines/engine-session.js';
import type { AssignmentAccessStore } from '../workspaces/assignment-access.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type {
  BotCreatePreview,
  ToolApprovalOrigin,
  ToolApprovalOriginQuery,
} from '../workspaces/tool-approval.js';
import { type MemoryChangeDelta } from '../memory/accepted.js';
import type { MemoryService } from '../memory/service.js';
import {
  DEFAULT_BOT_HOP_LIMIT,
  type ChannelMessage,
  type ChannelRecord,
  type SessionFailureProgress,
} from '../channels/channel.js';
import type { MessagePerfTracker } from '../usage/message-perf.js';
import { type ChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelStore } from '../channels/store.js';
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
import {
  createBotSourcePolicyStore,
  type BotSourcePolicy,
  type BotSourcePolicyStore,
} from './source-policy.js';
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

export type {
  AssignmentActivity,
  AssignmentReport,
  AssignmentReportInput,
  AssignmentReportState,
  ChannelAssignmentSummary,
} from '@botharness/host-protocol/wire';
import { coalesceInbox, createInboxHarvest } from '../features/activity/inbox-harvest.js';
import { createAssignmentExecution } from '../features/assignments/runtime-execution.js';
import { createAssignmentIntake } from '../features/assignments/runtime-intake.js';
import { queryAssignmentDirectory } from '../features/assignments/runtime-records.js';
import { createAssignmentRouting } from '../features/assignments/runtime-routing.js';
import { createRuntimeAdmissions } from '../features/activity/runtime-admissions.js';
import { createRuntimeAdmissionRecovery } from '../features/activity/runtime-admission-recovery.js';
import {
  createOrchestratorTurns,
  SESSION_STOPPED_REFUSAL,
} from '../features/sessions/runtime-orchestrator-turns.js';
import {
  createOrchestratorSessions,
  BOT_BUSY,
} from '../features/sessions/runtime-orchestrator-sessions.js';
import { createOrchestratorServices } from '../features/sessions/runtime-orchestrator-services.js';
import { createTurnFailures } from '../features/sessions/runtime-turn-failures.js';
import { createRuntimeBotCreation } from '../features/personabots/runtime-creation.js';
export { queryAssignmentDirectory } from '../features/assignments/runtime-records.js';

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

export type { BotCreateInput } from '../features/personabots/runtime-creation.js';

export type { BotCreateOutcome } from '../features/personabots/runtime-creation.js';

export { NEW_BOT_ID_PLACEHOLDER } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_NAME_LENGTH } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_TAGS } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_TAG_LENGTH } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_BIO_LENGTH } from '../features/personabots/runtime-creation.js';

export interface OrchestratorServiceTurn {
  replyTargets?: () => readonly TurnTargetSegment[];
  modelContent?: string;
  sessionId: string;
  channelId: string | undefined;
  sourceEventId: string | undefined;
  markSideEffect: (database?: DatabaseSync) => void;
  readAdmissions: Set<string>;
  importedFiles: Map<string, ChannelAttachmentRef>;
  turnSources: ReadonlySet<string>;
  observeMemory: boolean;
  observeReads: boolean;
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
  replaceOrchestrator?<T>(
    botSlug: string,
    body: () => T,
    nextCwd?: () => string | undefined,
  ): Promise<OrchestratorReplacement<T>>;
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

export type SourceEventAttemptState =
  | 'pending'
  | 'running'
  | 'retryable'
  | 'needs-repair'
  | 'handled';

export interface SourceEventClaim {
  sourceEventId: string;
  shouldRun: boolean;
  reconciliationRequired?: true;
}

export const DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT = 8;
const AUTO_CONTINUE_DELAYS_MS: readonly number[] = [60_000, 180_000];

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
  readonly #activeDirectTools = new Map<string, ActiveDirectTool>();
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

  readonly #channelAccess: ReturnType<typeof createChannelAccess>;
  readonly #runtimeInputs: ReturnType<typeof createRuntimeInputs>;
  readonly #directTools: ReturnType<typeof createDirectTools>;
  readonly #tobCliRuntime: ReturnType<typeof createTobCliRuntime>;
  readonly #causalSending: ReturnType<typeof createCausalSending>;
  readonly #channelAdmission: ReturnType<typeof createChannelAdmission>;
  readonly #groupDigest: ReturnType<typeof createGroupDigest>;
  readonly #scheduling: ReturnType<typeof createOrchestratorScheduling>;
  readonly #cancellation: ReturnType<typeof createOrchestratorCancellation>;
  readonly #continuation: ReturnType<typeof createOrchestratorContinuation>;

  readonly #assignmentIntake: ReturnType<typeof createAssignmentIntake>;
  readonly #assignmentExecution: ReturnType<typeof createAssignmentExecution>;
  readonly #assignmentRouting: ReturnType<typeof createAssignmentRouting>;
  readonly #inboxHarvest: ReturnType<typeof createInboxHarvest>;
  readonly #admissions: ReturnType<typeof createRuntimeAdmissions>;
  readonly #admissionRecovery: ReturnType<typeof createRuntimeAdmissionRecovery>;
  readonly #orchestratorTurns: ReturnType<typeof createOrchestratorTurns>;
  readonly #orchestratorSessions: ReturnType<typeof createOrchestratorSessions>;
  readonly #orchestratorServices: ReturnType<typeof createOrchestratorServices>;
  readonly #turnFailures: ReturnType<typeof createTurnFailures>;
  readonly #botCreation: ReturnType<typeof createRuntimeBotCreation>;

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
      setObserved: (eventIds, at) => this.#admissions.setObserved(eventIds, at),
      trackSteer: (settlement) => this.#channelAdmission.trackSteer(settlement),
      warn: this.#warn === undefined ? undefined : (message) => this.#warn?.(message),
    });
    this.#triageContinuation = options.triageContinuation === true;
    this.#approvalCapacity = new AssignmentApprovalCapacity({
      valid: (sessionId) => this.#assignmentExecution.assignmentExecutionAvailable(sessionId),
      available: () =>
        this.#assignmentExecution.assignmentCapacityRefusal('awakened') === undefined,
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
      setObserved: (...args) => this.#admissions.setObserved(...args),
      markReportsHandled: (...args) => this.#admissions.markReportsHandled(...args),
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
      assignmentRow: (...args) => this.#assignmentExecution.assignmentRow(...args),
      getAssignment: (...args) => this.getAssignment(...args),
      saveReportSpill: this.#saveReportSpill,
      readAssignmentReportPage: options.readAssignmentReportPage,
      scheduleReportHarvest: (...args) => this.#assignmentEvents.scheduleReportHarvest(...args),
    });
    this.#assignmentDelivery = createAssignmentDelivery({
      assignmentCapacityRefusal: (...args) =>
        this.#assignmentExecution.assignmentCapacityRefusal(...args),
      requireAssignmentSummary: (...args) =>
        this.#assignmentExecution.requireAssignmentSummary(...args),
      setStopState: (...args) => this.#setStopState(...args),
      setActivity: (...args) => this.#assignmentExecution.setActivity(...args),
      groupContinuations: this.#groupContinuations,
      agents: this.#agents,
      interruptedTools: this.#interruptedTools,
      publishAssignmentRefusal: (...args) =>
        this.#assignmentExecution.publishAssignmentRefusal(...args),
      now: (...args) => this.#now(...args),
      database: this.#database,
      assignmentAcceptances: this.#assignmentAcceptances,
      trackAssignmentRun: (...args) => this.#assignmentExecution.trackAssignmentRun(...args),
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
      ensureOrchestrator: (...args) => this.#orchestratorSessions.ensureOrchestrator(...args),
      runOrchestratorTurn: (...args) => this.#orchestratorTurns.runOrchestratorTurn(...args),
      failureStreaks: this.#failureStreaks,
      noteAutomaticFailure: (...args) => this.#turnFailures.noteAutomaticFailure(...args),
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
      runHarvestTurn: (...args) => this.#inboxHarvest.runHarvestTurn(...args),
      tails: this.#tails,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#continuation = createOrchestratorContinuation({
      admitDmMessage: (...args) => this.admitDmMessage(...args),
      agents: this.#agents,
      appendModelSwitch: (...args) => this.#turnFailures.appendModelSwitch(...args),
      autoContinues: this.#autoContinues,
      channels: this.#channels,
      claimDmContinuation: (...args) => this.#admissions.claimDmContinuation(...args),
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
      orchestratorServices: (...args) => this.#orchestratorServices.orchestratorServices(...args),
      registry: this.#registry,
      release: (...args) => this.#turnFailures.release(...args),
      replaceOrchestrator: (...args) => this.#orchestratorSessions.replaceOrchestrator(...args),
      requireExecution:
        this.#requireExecution === undefined
          ? undefined
          : (...args) => this.#requireExecution?.(...args),
      routeRests: this.#routeRests,
      runHumanDmTurn: (...args) => this.#orchestratorTurns.runHumanDmTurn(...args),
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
      release: (...args) => this.#turnFailures.release(...args),
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
      claimGroupContext: (...args) => this.#inboxHarvest.claimGroupContext(...args),
      setObserved: (...args) => this.#admissions.setObserved(...args),
      now: (...args) => this.#now(...args),
      markAdmissionsSideEffect: (botSlug, sourceIds) =>
        this.#admissions.markAdmissionsSideEffect(botSlug, sourceIds, false),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      turnSessionId: (botSlug) => this.#turnSources.get(botSlug)?.sessionId,
      routingGroupReplyState: (...args) => this.#continuation.routingGroupReplyState(...args),
      noteSteeredChannel: (...args) => this.#admissions.noteSteeredChannel(...args),
      groupContextSection: (...args) => this.#groupDigest.groupContextSection(...args),
      settleHarvestFailure: (...args) => this.#inboxHarvest.settleHarvestFailure(...args),
      acceptTurnSources: (...args) => this.#admissions.acceptTurnSources(...args),
      typingTurns: this.#typingTurns,
      observeAdmission: (...args) => this.#admissions.observeAdmission(...args),
      markReportsHandled: (...args) => this.#admissions.markReportsHandled(...args),
      settleHarvestHandled: (...args) => this.#inboxHarvest.settleHarvestHandled(...args),
      trackSteer: (settlement) => this.#channelAdmission.trackSteer(settlement),
      held: this.#held,
      armDigest: (...args) => this.#groupDigest.armDigest(...args),
    });
    this.#cancellation = createOrchestratorCancellation({
      activeTurns: this.#activeTurns,
      agents: this.#agents,
      assignmentAcceptances: this.#assignmentAcceptances,
      assignmentRow: (...args) => this.#assignmentExecution.assignmentRow(...args),
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
      acceptTurnSources: (...args) => this.#admissions.acceptTurnSources(...args),
      activeMemoryEvents: this.#activeMemoryEvents,
      activeTurns: this.#activeTurns,
      admitGroupMessage: (...args) => this.admitGroupMessage(...args),
      agents: this.#agents,
      autoContinues: this.#autoContinues,
      channels: this.#channels,
      claimSourceEvent: (...args) => this.#admissions.claimSourceEvent(...args),
      claimSteeredDm: (...args) => this.#admissions.claimSteeredDm(...args),
      claimSteeredGroupMention: (...args) => this.#admissions.claimSteeredGroupMention(...args),
      closed: () => this.#closed,
      continuation: this.#continuation,
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      database: this.#database,
      dmContextSection: (...args) => this.#groupDigest.dmContextSection(...args),
      groupAdmissionRetries: this.#groupAdmissionRetries,
      groupContextSection: (...args) => this.#groupDigest.groupContextSection(...args),
      markAdmissionsSideEffect: (...args) => this.#admissions.markAdmissionsSideEffect(...args),
      memberBotEnabled: (...args) => this.#memberBotEnabled(...args),
      memory: this.#memory,
      memoryEvents: this.#memoryEvents,
      memoryTurnOperations: this.#memoryTurnOperations,
      noteSteeredChannel: (...args) => this.#admissions.noteSteeredChannel(...args),
      now: () => this.#now(),
      observeAdmission: (...args) => this.#admissions.observeAdmission(...args),
      promptText: (botSlug) => this.#promptText(botSlug),
      quotePrompt: (...args) => this.#quotePrompt(...args),
      registry: this.#registry,
      release: (...args) => this.#turnFailures.release(...args),
      requireMembership: (...args) => this.#requireMembership(...args),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      restoreSteeredAdmissions: (...args) => this.#admissions.restoreSteeredAdmissions(...args),
      runHumanDmTurn: (...args) => this.#orchestratorTurns.runHumanDmTurn(...args),
      scheduleDigest: (...args) => this.#groupDigest.scheduleDigest(...args),
      scheduling: this.#scheduling,
      settleSteeredAdmission: (...args) => this.#admissions.settleSteeredAdmission(...args),
      sourcePolicy: this.#sourcePolicy,
      speakerInput: (...args) => this.#orchestratorServices.speakerInput(...args),
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
    this.#channelAccess = createChannelAccess({
      admitGroupInvitation: (...args) => this.admitGroupInvitation(...args),
      admitGroupJoinDecision: (...args) => this.admitGroupJoinDecision(...args),
      admitGroupJoinRequest: (...args) => this.admitGroupJoinRequest(...args),
      attachments: this.#attachments,
      botContacts: (...args) => this.botContacts(...args),
      callFrames: this.#callFrames,
      causalSending: this.#causalSending,
      channels: this.#channels,
      closed: () => this.#closed,
      createBot: (...args) => this.#botCreation.createBot(...args),
      createMessageId: () => this.#createMessageId(),
      database: this.#database,
      grants: this.#grants,
      groupSendReview: this.groupSendReview,
      ignoreAdmission: (...args) => this.#admissions.ignoreAdmission(...args),
      isMember: (...args) => this.#isMember(...args),
      now: () => this.#now(),
      observeReadMessages: (...args) => this.#admissions.observeReadMessages(...args),
      originalAttachments: this.#originalAttachments,
      ownership: this.#ownership,
      refreshBotContacts: () => this.refreshBotContacts(),
      registry: this.#registry,
      requireMembership: (...args) => this.#requireMembership(...args),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      team: this.#team,
      tob: this.#tob,
      turnSources: this.#turnSources,
      voiceMessages: this.#voiceMessages,
    });
    this.#runtimeInputs = createRuntimeInputs({
      activeDirectTools: this.#activeDirectTools,
      bindPrivateInputOrigin: (...args) => this.bindPrivateInputOrigin(...args),
      channels: this.#channels,
      closed: () => this.#closed,
      database: this.#database,
      enqueue: (...args) => this.#scheduling.enqueue(...args),
      externalMessaging: this.#externalMessaging,
      markSideEffectStarted: (...args) => this.#admissions.markSideEffectStarted(...args),
      nativeQuestionAvailable: (...args) => this.nativeQuestionAvailable(...args),
      ownership: this.#ownership,
      recoverNativeQuestionInput: (...args) => this.recoverNativeQuestionInput(...args),
      registry: this.#registry,
      runOrchestratorTurn: (...args) => this.#orchestratorTurns.runOrchestratorTurn(...args),
      sessionArchived: (...args) => this.#sessionArchived?.(...args),
      turnSources: this.#turnSources,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#directTools = createDirectTools({
      activeDirectTools: this.#activeDirectTools,
      agents: this.#agents,
      channels: this.#channels,
      closed: () => this.#closed,
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      database: this.#database,
      directBotTools: () => this.directBotTools(),
      directToolCalls: this.#directToolCalls,
      noticeDirectAssignmentCall: (...args) =>
        this.#assignmentReporting.noticeDirectAssignmentCall(...args),
      now: () => this.#now(),
      orchestratorServices: (...args) => this.#orchestratorServices.orchestratorServices(...args),
      ownership: this.#ownership,
      recordDirectToolSource: (...args) => this.#recordDirectToolSource(...args),
      registry: this.#registry,
      requireExecution:
        this.#requireExecution === undefined
          ? undefined
          : (...args) => this.#requireExecution?.(...args),
      requireMembership: (...args) => this.#requireMembership(...args),
      team: this.#team,
      tobCliRequests: this.#tobCliRequests,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#tobCliRuntime = createTobCliRuntime({
      activeDirectTools: this.#activeDirectTools,
      admitDmMessage: (...args) => this.#admitDmMessage(...args),
      channels: this.#channels,
      closed: () => this.#closed,
      database: this.#database,
      markAdmissionsSideEffect: (...args) => this.#admissions.markAdmissionsSideEffect(...args),
      memberBotEnabled: (...args) => this.#memberBotEnabled(...args),
      now: () => this.#now(),
      ownership: this.#ownership,
      registry: this.#registry,
      requireExecution:
        this.#requireExecution === undefined
          ? undefined
          : (...args) => this.#requireExecution?.(...args),
      tails: this.#tails,
      tob: this.#tob,
      tobCliRequests: this.#tobCliRequests,
      turnSources: this.#turnSources,
    });
    this.#assignmentIntake = createAssignmentIntake({
      agents: this.#agents,
      assignmentAcceptances: this.#assignmentAcceptances,
      assignmentAccessPresetStore: this.#assignmentAccessPresetStore,
      assignmentArchives: this.#assignmentArchives,
      assignmentByKey: (...args) => this.#assignmentExecution.assignmentByKey(...args),
      assignmentCapacityRefusal: (...args) =>
        this.#assignmentExecution.assignmentCapacityRefusal(...args),
      assignmentDelivery: this.#assignmentDelivery,
      assignmentFailed: (...args) => this.#assignmentRouting.assignmentFailed(...args),
      assignmentGroupExecution: (...args) =>
        this.#assignmentRouting.assignmentGroupExecution(...args),
      assignmentModelSelection: (...args) =>
        this.#assignmentRouting.assignmentModelSelection(...args),
      assignmentReporting: this.#assignmentReporting,
      assignmentRow: (...args) => this.#assignmentExecution.assignmentRow(...args),
      recordInterruptedTools: (...args) => this.#cancellation.recordInterruptedTools(...args),
      createSessionId: (...args) => this.#createSessionId(...args),
      database: this.#database,
      getAssignment: (...args) => this.getAssignment(...args),
      grants: this.#grants,
      groupFallback: this.#groupFallback,
      inheritedModelPlan:
        this.#inheritedModelPlan === undefined
          ? undefined
          : (...args) => this.#inheritedModelPlan?.(...args),
      interruptedTools: this.#interruptedTools,
      now: (...args) => this.#now(...args),
      ownership: this.#ownership,
      registry: this.#registry,
      requireAssignmentEngine:
        this.#requireAssignmentEngine === undefined
          ? undefined
          : (...args) => this.#requireAssignmentEngine?.(...args),
      requireAssignmentSummary: (...args) =>
        this.#assignmentExecution.requireAssignmentSummary(...args),
      requireModelRoute:
        this.#requireModelRoute === undefined
          ? undefined
          : (...args) => this.#requireModelRoute?.(...args),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      routeRests: this.#routeRests,
      sessionModels: this.#sessionModels,
      setAssignmentExecutionReady: (...args) =>
        this.#assignmentExecution.setAssignmentExecutionReady(...args),
      trackAssignmentRun: (...args) => this.#assignmentExecution.trackAssignmentRun(...args),
      turnSources: this.#turnSources,
    });
    this.#assignmentExecution = createAssignmentExecution({
      agents: this.#agents,
      approvalCapacity: this.#approvalCapacity,
      assignmentAcceptances: this.#assignmentAcceptances,
      assignmentArchives: this.#assignmentArchives,
      assignmentConcurrencyLimit: (...args) => this.#assignmentConcurrencyLimit(...args),
      assignmentFailed: (...args) => this.#assignmentRouting.assignmentFailed(...args),
      assignmentModelSelection: (...args) =>
        this.#assignmentRouting.assignmentModelSelection(...args),
      assignmentNotices: this.#assignmentNotices,
      assignmentReporting: this.#assignmentReporting,
      assignmentRuns: this.#assignmentRuns,
      channels: this.#channels,
      closed: () => this.#closed,
      database: this.#database,
      externalMessaging: this.#externalMessaging,
      getAssignment: (...args) => this.getAssignment(...args),
      grants: this.#grants,
      groupContinuations: this.#groupContinuations,
      nativeAssignmentSteps: this.#nativeAssignmentSteps,
      now: (...args) => this.#now(...args),
      ownership: this.#ownership,
      preparedAssignments: this.#preparedAssignments,
      publishSessionFailure: (...args) => this.#turnFailures.publishSessionFailure(...args),
      refreshAssignmentRoute: (...args) => this.refreshAssignmentRoute(...args),
      registry: this.#registry,
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      sessionArchive:
        this.#sessionArchive === undefined
          ? undefined
          : (...args) => this.#sessionArchive?.(...args),
      sessionArchived: (...args) => this.#sessionArchived?.(...args),
      sessionModels: this.#sessionModels,
      typingAssignments: this.#typingAssignments,
      waitLifetime: this.#waitLifetime,
      waitOptions: this.#waitOptions,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#assignmentRouting = createAssignmentRouting({
      activeSessionModels: this.#activeSessionModels,
      appendModelSwitch: (...args) => this.#turnFailures.appendModelSwitch(...args),
      assignmentDmChannel: (...args) => this.#assignmentExecution.assignmentDmChannel(...args),
      assignmentReporting: this.#assignmentReporting,
      assignmentRow: (...args) => this.#assignmentExecution.assignmentRow(...args),
      assignmentRuns: this.#assignmentRuns,
      closed: () => this.#closed,
      routingTargetFailure: (...args) => this.#continuation.routingTargetFailure(...args),
      database: this.#database,
      groupContinuations: this.#groupContinuations,
      groupFallback: this.#groupFallback,
      inheritedModelPlan:
        this.#inheritedModelPlan === undefined
          ? undefined
          : (...args) => this.#inheritedModelPlan?.(...args),
      now: (...args) => this.#now(...args),
      pickSessionGroup: (...args) => this.#pickSessionGroup(...args),
      publishSessionFailure: (...args) => this.#turnFailures.publishSessionFailure(...args),
      refreshAssignmentRoute: (...args) => this.refreshAssignmentRoute(...args),
      registry: this.#registry,
      requestAssignment: (...args) => this.#assignmentIntake.requestAssignment(...args),
      requireExecution:
        this.#requireExecution === undefined
          ? undefined
          : (...args) => this.#requireExecution?.(...args),
      requireModelRoute:
        this.#requireModelRoute === undefined
          ? undefined
          : (...args) => this.#requireModelRoute?.(...args),
      routeRests: this.#routeRests,
      sessionModels: this.#sessionModels,
      setActivity: (...args) => this.#assignmentExecution.setActivity(...args),
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#inboxHarvest = createInboxHarvest({
      assignmentEvents: this.#assignmentEvents,
      channelAdmission: this.#channelAdmission,
      channels: this.#channels,
      closed: () => this.#closed,
      database: this.#database,
      digestFailureCount: this.#digestFailureCount,
      digestRetryAt: this.#digestRetryAt,
      dmChannel: (...args) => this.#dmChannel(...args),
      ensureOrchestrator: (...args) => this.#orchestratorSessions.ensureOrchestrator(...args),
      failureStreaks: this.#failureStreaks,
      groupDigest: this.#groupDigest,
      held: this.#held,
      inboxFactoryRetries: this.#inboxFactoryRetries,
      markAdmissionsSideEffect: (...args) => this.#admissions.markAdmissionsSideEffect(...args),
      markReportsHandled: (...args) => this.#admissions.markReportsHandled(...args),
      messagingEvents: this.#messagingEvents,
      noteAutomaticFailure: (...args) => this.#turnFailures.noteAutomaticFailure(...args),
      now: (...args) => this.#now(...args),
      observeAdmission: (...args) => this.#admissions.observeAdmission(...args),
      promptLimits: (...args) => this.#promptLimits(...args),
      promptText: (...args) => this.#promptText(...args),
      publishSessionFailure: (...args) => this.#turnFailures.publishSessionFailure(...args),
      registry: this.#registry,
      retireWithdrawnNetworkAdmissions: (...args) =>
        this.#admissionRecovery.retireWithdrawnNetworkAdmissions(...args),
      rowQuotes: (...args) => this.#rowQuotes(...args),
      runOnLiveOrchestrator: (...args) => this.#orchestratorTurns.runOnLiveOrchestrator(...args),
      runOrchestratorTurn: (...args) => this.#orchestratorTurns.runOrchestratorTurn(...args),
      scheduling: this.#scheduling,
      setObserved: (...args) => this.#admissions.setObserved(...args),
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });

    this.#admissions = createRuntimeAdmissions({
      channels: this.#channels,
      closed: () => this.#closed,
      continuation: this.#continuation,
      createEventId: (...args) => this.#createEventId(...args),
      database: this.#database,
      groupDigest: this.#groupDigest,
      inboxHarvest: this.#inboxHarvest,
      now: (...args) => this.#now(...args),
      promptLimits: (...args) => this.#promptLimits(...args),
      sourcePolicy: this.#sourcePolicy,
      tails: this.#tails,
      turnSources: this.#turnSources,
    });
    this.#admissionRecovery = createRuntimeAdmissionRecovery({
      botNetwork: this.#botNetwork,
      channels: this.#channels,
      closed: () => this.#closed,
      createEventId: (...args) => this.#createEventId(...args),
      database: this.#database,
      isMember: (...args) => this.#isMember(...args),
      now: (...args) => this.#now(...args),
      sourcePolicy: this.#sourcePolicy,
    });
    this.#orchestratorTurns = createOrchestratorTurns({
      activeMemoryEvents: this.#activeMemoryEvents,
      activeSessionModels: this.#activeSessionModels,
      activityEvents: this.#activityEvents,
      admissionHandled: (...args) => this.#admissions.admissionHandled(...args),
      agents: this.#agents,
      assignmentExecution: this.#assignmentExecution,
      autoContinueDelaysMs: this.#autoContinueDelaysMs,
      autoContinues: this.#autoContinues,
      cancellation: this.#cancellation,
      causalSending: this.#causalSending,
      channelAdmission: this.#channelAdmission,
      channels: this.#channels,
      closed: () => this.#closed,
      continuation: this.#continuation,
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      database: this.#database,
      ensureOrchestrator: (...args) => this.#orchestratorSessions.ensureOrchestrator(...args),
      externalMessaging: this.#externalMessaging,
      failureStreaks: this.#failureStreaks,
      groupFallback: this.#groupFallback,
      held: this.#held,
      holdForRestingRoute: (...args) => this.#turnFailures.holdForRestingRoute(...args),
      inboxHarvest: this.#inboxHarvest,
      inboxTriage: this.#inboxTriage,
      interruptedDmNotice: (...args) => this.#interruptedDmNotice(...args),
      isMember: (...args) => this.#isMember(...args),
      markReportsHandled: (...args) => this.#admissions.markReportsHandled(...args),
      markReportSideEffects: (...args) => this.#admissions.markReportSideEffects(...args),
      markSideEffectStarted: (...args) => this.#admissions.markSideEffectStarted(...args),
      markSourceEventFailed: (...args) => this.#admissions.markSourceEventFailed(...args),
      memberBotEnabled: (...args) => this.#memberBotEnabled(...args),
      memory: this.#memory,
      memoryEvents: this.#memoryEvents,
      memoryTurnOperations: this.#memoryTurnOperations,
      nativeStepReady: this.#nativeStepReady,
      notifyReadAdmissions: (...args) => this.#admissions.notifyReadAdmissions(...args),
      now: (...args) => this.#now(...args),
      observeAdmission: (...args) => this.#admissions.observeAdmission(...args),
      orchestratorServices: (...args) => this.#orchestratorServices.orchestratorServices(...args),
      originalAttachments: this.#originalAttachments,
      pickSessionGroup: (...args) => this.#pickSessionGroup(...args),
      preparedOrchestrators: this.#preparedOrchestrators,
      promptText: (...args) => this.#promptText(...args),
      publishSessionFailure: (...args) => this.#turnFailures.publishSessionFailure(...args),
      readTurnProgress:
        this.#readTurnProgress === undefined
          ? undefined
          : (...args) => this.#readTurnProgress!(...args),
      recordTurnCommits: (...args) => this.#recordTurnCommits(...args),
      refreshQuoteBlocks: (...args) => this.#refreshQuoteBlocks(...args),
      replaceOrchestrator: (...args) => this.#orchestratorSessions.replaceOrchestrator(...args),
      requireExecution:
        this.#requireExecution === undefined
          ? undefined
          : (...args) => this.#requireExecution?.(...args),
      requireModelRoute:
        this.#requireModelRoute === undefined
          ? undefined
          : (...args) => this.#requireModelRoute?.(...args),
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      sessionArchived:
        this.#sessionArchived === undefined
          ? undefined
          : (...args) => this.#sessionArchived!(...args),
      sessionModels: this.#sessionModels,
      setObserved: (...args) => this.#admissions.setObserved(...args),
      speakerInput: (...args) => this.#orchestratorServices.speakerInput(...args),
      stopNotices: this.#stopNotices,
      stoppedTurns: this.#stoppedTurns,
      triageBaseline: this.#triageBaseline,
      triageRunning: this.#triageRunning,
      turnQuoteBlocks: (...args) => this.#turnQuoteBlocks(...args),
      turnSideEffectStarted: (...args) => this.#admissions.turnSideEffectStarted(...args),
      turnSources: this.#turnSources,
      typingTurns: this.#typingTurns,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#orchestratorSessions = createOrchestratorSessions({
      agents: this.#agents,
      closed: () => this.#closed,
      createSessionId: (...args) => this.#createSessionId(...args),
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      now: (...args) => this.#now(...args),
      orchestratorCwd:
        this.#orchestratorCwd === undefined
          ? undefined
          : (...args) => this.#orchestratorCwd?.(...args),
      ownership: this.#ownership,
      preparedOrchestrators: this.#preparedOrchestrators,
      registry: this.#registry,
      sessionArchive:
        this.#sessionArchive === undefined
          ? undefined
          : (...args) => this.#sessionArchive?.(...args),
      sessionArchived:
        this.#sessionArchived === undefined
          ? undefined
          : (...args) => this.#sessionArchived!(...args),
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
      workspaceRoot: this.#workspaceRoot,
    });
    this.#orchestratorServices = createOrchestratorServices({
      activityEvents: this.#activityEvents,
      assignmentAccess: (...args) => this.#assignmentAccess(...args),
      attachments: this.#attachments,
      channelAccess: this.#channelAccess,
      channels: this.#channels,
      database: this.#database,
      externalMessaging: this.#externalMessaging,
      grants: this.#grants,
      inboxHistory: this.#inboxHistory,
      inboxTriage: this.#inboxTriage,
      memory: this.#memory,
      messagingEvents: this.#messagingEvents,
      registry: this.#registry,
      requireTurnAccess: (...args) => this.#requireTurnAccess(...args),
      schedules: this.#schedules,
      sourcePolicy: this.#sourcePolicy,
      team: this.#team,
      tob: this.#tob,
    });
    this.#turnFailures = createTurnFailures({
      channels: this.#channels,
      continuation: this.#continuation,
      currentOrchestratorSessionId: (...args) => this.currentOrchestratorSessionId(...args),
      digestFailureCount: this.#digestFailureCount,
      digestRetryAt: this.#digestRetryAt,
      digestTimers: this.#digestTimers,
      failureStreaks: this.#failureStreaks,
      held: this.#held,
      inboxFactoryRetries: this.#inboxFactoryRetries,
      now: (...args) => this.#now(...args),
      registry: this.#registry,
      scheduling: this.#scheduling,
      snoozeTimers: this.#snoozeTimers,
      triageQueued: this.#triageQueued,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });
    this.#botCreation = createRuntimeBotCreation({
      channels: this.#channels,
      closed: () => this.#closed,
      createBotId: (...args) => this.#createBotId(...args),
      grants: this.#grants,
      registry: this.#registry,
      team: this.#team,
      warn: this.#warn === undefined ? undefined : (...args) => this.#warn?.(...args),
    });

    if (options.database.mode === 'ready') {
      const interruptedDms = this.#admissionRecovery.recoverInterruptedAttempts();
      this.#admissionRecovery.retireRevokedGroupRetries();
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

  retryDmMessage(
    channelId: string,
    messageId: string,
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<void> {
    return this.#continuation.retryDmMessage(channelId, messageId, human);
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

  tobCli(human: HumanContext, input: TobCliRequest): Promise<TobCliStatus> {
    return this.#tobCliRuntime.tobCli(human, input);
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
      await this.#admissionRecovery.retireWithdrawnNetworkAdmissions(bot.slug, hostId);
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

  resumePendingDigests(botSlug: string): void {
    this.#groupDigest.recoverPendingDigests(botSlug);
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

  askChannel(sessionId: string): string | undefined {
    return this.#runtimeInputs.askOrigin({ sessionId })?.channelId;
  }

  hasDirectToolInvocation({ sessionId, callId }: ToolApprovalOriginQuery): boolean {
    return this.#activeDirectTools.get(callId)?.agentSessionId === sessionId;
  }

  toolApprovalOrigin(query: ToolApprovalOriginQuery): ToolApprovalOrigin | undefined {
    return this.#runtimeInputs.askOrigin(query);
  }

  botCreatePreview(botSlug: string, args: unknown): BotCreatePreview | undefined {
    return this.#botCreation.botCreatePreview(botSlug, args);
  }

  captureTobCliAuthority(sessionId: string): TobCliAuthority {
    return this.#tobCliRuntime.captureTobCliAuthority(sessionId);
  }

  canRequestPrivateInput(sessionId: string, selected?: string): boolean {
    return this.#runtimeInputs.canRequestPrivateInput(sessionId, selected);
  }

  bindPrivateInputOrigin(sessionId: string, selected?: string): PrivateInputOrigin | undefined {
    return this.#runtimeInputs.bindPrivateInputOrigin(sessionId, selected);
  }

  bindNativeQuestionInput(
    sessionId: string,
    channelId: string,
    question?: { messageId: string; callId: string },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    return this.#runtimeInputs.bindNativeQuestionInput(sessionId, channelId, question);
  }

  recoverNativeQuestionInput(
    sessionId: string,
    channelId: string,
    requestMessageId: string,
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    return this.#runtimeInputs.recoverNativeQuestionInput(sessionId, channelId, requestMessageId);
  }

  nativeQuestionAvailable(sessionId: string, channelId: string): boolean {
    return this.#runtimeInputs.nativeQuestionAvailable(sessionId, channelId);
  }

  captureNativeOrchestratorModel(sessionId: string): void {
    return this.#orchestratorSessions.captureNativeOrchestratorModel(sessionId);
  }

  async prepareNativeOrchestratorStep(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const owner = this.#ownership.resolve(sessionId);
    if (owner?.rootRole === 'assignment' && owner.parentSessionId === undefined)
      return this.#assignmentExecution.prepareNativeAssignmentStep(
        sessionId,
        senderSessionIds,
        signal,
      );
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
          await this.#orchestratorTurns.runOrchestratorTurn(
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

  directBotTools(): DirectBotToolSpec[] {
    return this.#directTools.directBotTools();
  }

  directBotToolCalls(botSlug: string): readonly DirectBotToolCall[] {
    return this.#directTools.directBotToolCalls(botSlug);
  }

  runDirectBotTool(
    botSlug: string,
    tool: string,
    args: Record<string, unknown>,
    signal: AbortSignal,
    parentSessionId?: string,
    sourceEventId?: string,
    human?: HumanContext,
  ): Promise<{ tool: string; sessionId: 'direct'; result: unknown }> {
    return this.#directTools.runDirectBotTool(
      botSlug,
      tool,
      args,
      signal,
      parentSessionId,
      sourceEventId,
      human,
    );
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
    return this.#orchestratorSessions.currentOrchestratorSessionId(botSlug);
  }

  latestAssignmentActivity(): ReadonlyMap<string, number> {
    return this.#assignmentExecution.latestAssignmentActivity();
  }

  assignmentEngineAccountUses(accountId: string): string[] {
    return this.#assignmentRouting.assignmentEngineAccountUses(accountId);
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
    return this.#assignmentExecution.listAssignments(botSlug);
  }

  listChannelAssignments(channelId: string): ChannelAssignmentSummary[] {
    return this.#assignmentExecution.listChannelAssignments(channelId);
  }

  setAssignmentArchived(
    botSlug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<AssignmentArchiveOutcome | { outcome: 'unarchived'; assignment: AssignmentSummary }> {
    return this.#assignmentExecution.setAssignmentArchived(botSlug, sessionId, archived);
  }

  async replaceOrchestrator<T>(
    botSlug: string,
    body: () => T,
    nextCwd?: () => string | undefined,
  ): Promise<OrchestratorReplacement<T>> {
    if (this.#tails.has(botSlug)) return BOT_BUSY;
    let result: OrchestratorReplacement<T> | undefined;
    await this.#scheduling.enqueue(botSlug, async () => {
      result = await this.#orchestratorSessions.replaceOrchestrator(botSlug, body, nextCwd);
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
    return this.#admissions.hasPendingInbox(botSlug);
  }

  triageOpenCount(botSlug: string): number | undefined {
    return this.#triageRunning.get(botSlug);
  }

  getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined {
    return this.#assignmentExecution.getAssignment(botSlug, sessionId);
  }

  beginAssignmentApprovalWait(
    sessionId: string,
    callId: string,
    signal: AbortSignal,
  ): AssignmentApprovalWaitLease | undefined {
    return this.#assignmentExecution.beginAssignmentApprovalWait(sessionId, callId, signal);
  }

  ensureAssignmentCapacity(sessionId: string, signal: AbortSignal): Promise<void> {
    return this.#assignmentExecution.ensureAssignmentCapacity(sessionId, signal);
  }

  assignmentApprovalWait(sessionId: string, callId: string): AssignmentExecutionWait | undefined {
    return this.#assignmentExecution.assignmentApprovalWait(sessionId, callId);
  }

  runAssignmentTool<T>(
    sessionId: string,
    callId: string,
    token: symbol,
    signal: AbortSignal,
    body: () => Promise<T>,
  ): Promise<T> {
    return this.#assignmentExecution.runAssignmentTool(sessionId, callId, token, signal, body);
  }

  settleAssignmentTool(sessionId: string, callId: string): void {
    this.#assignmentExecution.settleAssignmentTool(sessionId, callId);
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
    return this.#turnFailures.heldCause(botSlug);
  }

  releaseQuotaHold(botSlug: string): boolean {
    return this.#turnFailures.releaseQuotaHold(botSlug);
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

  #assignmentAccess(
    bot: PersonaBotRecord,
    sourceEventId: string | undefined,
    markAttemptSideEffect: () => void = () => {
      if (sourceEventId !== undefined) this.#admissions.markSideEffectStarted(sourceEventId);
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
        const outcome = this.#assignmentIntake.createOrReuseAssignment(
          bot,
          sourceEventId,
          input,
          trackDelivery,
        );
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
      archive: (sessionId) =>
        this.#assignmentExecution.archiveAssignment(bot, sessionId, markSideEffect),
      unarchive: (sessionId) =>
        this.#assignmentExecution.unarchiveAssignment(bot, sessionId, markSideEffect),
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
        const outcome = this.#assignmentIntake.requestAssignment(
          bot,
          input,
          trackDelivery,
          sourceEventId,
        );
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

  originalAttachmentRoot(
    sessionId: string,
    path: string,
    kind: 'read' | 'write',
    shell = false,
  ): string | undefined {
    return this.#originalAttachments.root(sessionId, path, kind, shell);
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

  async #stopAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
    cause: 'orchestrator-stop' | 'human-stop' | 'human-session-stop' = 'orchestrator-stop',
  ): Promise<AssignmentSummary> {
    const row = this.#assignmentExecution.assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (row.stop_state === 'stopped')
      return this.#assignmentExecution.requireAssignmentSummary(bot.slug, sessionId);
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
    return this.#assignmentExecution.requireAssignmentSummary(bot.slug, sessionId);
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

  refreshAssignmentRoute(
    botSlug: string,
    sessionId: string,
    allowStopped = false,
  ): Promise<ModelRoute | undefined> {
    return this.#assignmentRouting.refreshAssignmentRoute(botSlug, sessionId, allowStopped);
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
}

export { callTimelineNote, callVisualNote } from '../features/voice/events.js';

export function createBotRuntime(options: BotRuntimeOptions): BotRuntime {
  return new BotRuntimeImplementation(options);
}
