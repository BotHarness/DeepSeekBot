import type { OrchestratorChannelAccess } from '../../channels/runtime-access-types.js';
import { type DirectBotToolSpec } from './direct-tools.js';
import type { TurnTarget, TurnTargetSwitchReason } from '@botharness/host-protocol/turn-target';
import { type TurnTargetSegment } from '../../runtime/turn-targets.js';
import type { TobCliTurn } from '../../tob/cli-request.js';
import type { TeamService } from '../../team/service.js';
import type { externalMemberWake } from '../../messaging/defaults.js';
import type { SenderPermissions } from '../../messaging/sender-access.js';
import type { MessagingDirectoryQuery, MessagingDirectoryPage } from '../../messaging/directory.js';
import type {
  ThreadReceptionInput,
  ThreadReceptionPolicy,
  ThreadReceptionView,
} from '../../messaging/thread-policy.js';
import type { GroupReceptionInput, GroupReceptionPolicy } from '../../messaging/group-policy.js';
import type { saveAttachmentFile } from '../../attachments/file-operations.js';
import type { OutboxIntent, OutboundMessaging } from '../../messaging/outbound.js';
import type {
  ExternalSource,
  ExternalContextQuery,
  ExternalContextResult,
} from '../../messaging/inbound.js';
import { type InboxHistoryInput, type InboxHistoryPage } from '../../runtime/inbox-history.js';
import { type OrchestratorInboxTriage } from '../../runtime/inbox-triage.js';
import type { DatabaseSync } from 'node:sqlite';
import { type PersonaBotRecord } from '../../bots/persona-bot.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import { type ChannelAttachmentRef } from '../../attachments/ref.js';
import { type BotSourcePolicy } from '../../runtime/source-policy.js';
import type {
  BotSchedule,
  BotScheduleChange,
  BotScheduleInput,
} from '../../schedules/bot-schedules.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  OrchestratorAssignmentAccess,
} from '../assignments/runtime-types.js';

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
        page?: import('../../messaging/provider.js').MessagingReachablePage;
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

export type OrchestratorReplacement<T> =
  | { outcome: 'replaced'; value: T }
  | { outcome: 'refused'; code: 'bot-busy'; message: string };

export interface NativeSessionArchive {
  archiveSession(sessionId: string): Promise<void>;
  unarchiveSession(sessionId: string): Promise<void>;
}

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
