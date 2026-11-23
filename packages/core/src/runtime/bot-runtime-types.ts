import {
  type DirectBotToolCall,
  type DirectBotToolSpec,
} from '../features/sessions/direct-tools.js';
import { type TobCliAuthority } from '../features/tob/cli-runtime.js';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { type TurnTargetSegment } from './turn-targets.js';
import type { ChannelAssignmentSummary } from '@botharness/host-protocol/wire';
import type { TobCliRequest, TobCliStatus } from '../tob/cli-request.js';
import type { TeamService } from '../team/service.js';
import { type HumanContext } from '../humans/context.js';
import type { SessionRecoveryAction } from './session-recovery.js';
import type { AssignmentReportContent } from './assignment-report.js';
import { GroupSendReview } from '../channels/send-review.js';
import { type TobService } from '../tob/service.js';
import {
  type AssignmentApprovalWaitLease,
  type AssignmentExecutionWait,
} from './assignment-approval-capacity.js';
import { type CallFrameAccess } from '../features/voice/events.js';
import type { OutboundMessaging } from '../messaging/outbound.js';
import { type PrivateInputOrigin } from '../credentials/im-origin.js';
import { type InboxHistoryQuery } from './inbox-history.js';
import { type PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotModelPlan, ModelRoute } from '../models/presets.js';
import type { RouteRests } from '../models/route-rest.js';
import type { GroupFallback, ModelSwitch } from '../models/group-fallback.js';
import type { RoutingTarget } from '../models/routing-groups.js';
import type { EngineLimitError } from '../engines/engine-session.js';
import type { AssignmentAccessStore } from '../workspaces/assignment-access.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type {
  BotCreatePreview,
  ToolApprovalOrigin,
  ToolApprovalOriginQuery,
} from '../workspaces/tool-approval.js';
import type { MemoryService } from '../memory/service.js';
import { type SessionFailureProgress } from '../channels/channel.js';
import type { MessagePerfTracker } from '../usage/message-perf.js';
import type { ChannelStore } from '../channels/store.js';
import { type BotContactQuery, type BotContactPage } from './bot-contact-discovery.js';
import type { AttachmentStore } from '../attachments/store.js';
import { type OperationalDatabaseOwner } from '../database/owner.js';
import { type SessionOwnership } from '../sessions/ownership.js';
import { type BotSourcePolicyStore } from './source-policy.js';
import type { AssignmentReportPage } from './assignment-tail.js';
import type { BotScheduleStore } from '../schedules/bot-schedules.js';
import type { WorkspaceGrantStore } from '../workspaces/grants.js';
import { type PromptText } from '../prompts/prompt-parts.js';
import { type PromptLimits } from '../prompts/prompt-limits.js';
import type {
  AssignmentArchiveOutcome,
  AssignmentDetail,
  AssignmentEventTail,
  AssignmentSummary,
} from '../features/assignments/runtime-types.js';
import type {
  BotAgentAdapter,
  BotHoldCause,
  BotStopOutcome,
  NativeSessionArchive,
  OrchestratorReplacement,
  SessionStopOutcome,
} from '../features/sessions/agent-run-types.js';
import type {
  DmMessageAdmission,
  HandleDmMessageInput,
  OrchestratorMessageOutcome,
} from '../channels/runtime-admission-types.js';

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
