import {
  type DirectBotToolCall,
  type DirectBotToolSpec,
} from '../features/sessions/direct-tools.js';
import { type TobCliAuthority } from '../features/tob/cli-runtime.js';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { lastTurnTarget, readTurnTargets, type TurnTargetSegment } from './turn-targets.js';
import type { ChannelAssignmentSummary } from '@botharness/host-protocol/wire';
import type { TobCliRequest, TobCliStatus, TobCliTurn } from '../tob/cli-request.js';
import { OWNER_HUMAN_CONTEXT, type HumanContext } from '../humans/context.js';
import type { SessionRecoveryAction } from './session-recovery.js';
import type { GroupSendReview } from '../channels/send-review.js';
import {
  type AssignmentApprovalWaitLease,
  type AssignmentExecutionWait,
} from './assignment-approval-capacity.js';
import { type PrivateInputOrigin } from '../credentials/im-origin.js';
import type { ModelRoute } from '../models/presets.js';
import type {
  BotCreatePreview,
  ToolApprovalOrigin,
  ToolApprovalOriginQuery,
} from '../workspaces/tool-approval.js';
import { type BotContactQuery, type BotContactPage } from './bot-contact-discovery.js';
import { BOT_BUSY } from '../features/sessions/runtime-orchestrator-sessions.js';
import { createBotRuntimeFeatures } from './bot-runtime-features.js';
import { createBotRuntimeState } from './bot-runtime-state.js';
import type { BotRuntime, BotRuntimeOptions } from './bot-runtime-types.js';
import type {
  BotHoldCause,
  BotStopOutcome,
  OrchestratorReplacement,
  SessionStopOutcome,
} from '../features/sessions/agent-run-types.js';
import type {
  AssignmentArchiveOutcome,
  AssignmentDetail,
  AssignmentSummary,
} from '../features/assignments/runtime-types.js';
import type {
  DmMessageAdmission,
  HandleDmMessageInput,
  OrchestratorMessageOutcome,
} from '../channels/runtime-admission-types.js';

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
export { DirectBotToolError } from '../features/sessions/direct-tools.js';
export type { DirectBotToolCall, DirectBotToolSpec } from '../features/sessions/direct-tools.js';
export type { TobCliAuthority, TobCliRequestLease } from '../features/tob/cli-runtime.js';
export { markSkillTokens, skillInvocationPrompt } from './channel-prompts.js';
export type { GroupContext } from './group-digest.js';
export type {
  AssignmentActivity,
  AssignmentReport,
  AssignmentReportInput,
  AssignmentReportState,
  ChannelAssignmentSummary,
} from '@botharness/host-protocol/wire';
export { queryAssignmentDirectory } from '../features/assignments/runtime-records.js';
export type { BotCreateInput } from '../features/personabots/runtime-creation.js';

export type { BotCreateOutcome } from '../features/personabots/runtime-creation.js';

export { NEW_BOT_ID_PLACEHOLDER } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_NAME_LENGTH } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_TAGS } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_TAG_LENGTH } from '../features/personabots/runtime-creation.js';

export { MAX_CREATED_BOT_BIO_LENGTH } from '../features/personabots/runtime-creation.js';
export { DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT } from '../features/assignments/runtime-types.js';
export type {
  AssignmentRequestMode,
  AssignmentOpenAsk,
  AssignmentSummary,
  AssignmentDirectoryQuery,
  AssignmentDirectoryPage,
  AssignmentArchiveOutcome,
  AssignmentDetail,
  AssignmentEventTail,
  AssignmentCapacityRefusal,
  AssignmentCreateOutcome,
  AssignmentRequestOutcome,
  AssignmentEndedRefusal,
  OrchestratorAssignmentAccess,
  AssignmentAgentRun,
  AssignmentRequestDelivery,
} from '../features/assignments/runtime-types.js';
export type {
  OrchestratorAgentRun,
  InterruptedToolCall,
  OrchestratorServiceTurn,
  BotAgentAdapter,
  OrchestratorReplacement,
  NativeSessionArchive,
  BotHoldCause,
  StoppedSessionRef,
  BotStopOutcome,
  SessionStopOutcome,
} from '../features/sessions/agent-run-types.js';
export type {
  InboxReportRow,
  GroupPromptBudget,
  SourceEventAttemptState,
  SourceEventClaim,
} from '../features/activity/runtime-admission-support.js';
export type {
  HandleDmMessageInput,
  DmAdmissionFailure,
  OrchestratorMessageOutcome,
  DmMessageAdmission,
} from '../channels/runtime-admission-types.js';
export type { BotRuntime, BotRuntimeOptions } from './bot-runtime-types.js';

class BotRuntimeImplementation implements BotRuntime {
  readonly groupSendReview: GroupSendReview;
  readonly #features: ReturnType<typeof createBotRuntimeFeatures>;

  constructor(options: BotRuntimeOptions) {
    const state = createBotRuntimeState(options);
    this.groupSendReview = state.groupSendReview;
    this.#features = createBotRuntimeFeatures(options, state, this, (...args) =>
      this.#recordDirectToolSource(...args),
    );
    this.#features.recoverAtStartup();
  }

  retryDmMessage(
    channelId: string,
    messageId: string,
    human: HumanContext = OWNER_HUMAN_CONTEXT,
  ): Promise<void> {
    return this.#features.continuation.retryDmMessage(channelId, messageId, human);
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
    return this.#features.continuation.recoverDmMessage(input, human);
  }

  compactOrchestrator<T>(botSlug: string, compact: (sessionId: string) => Promise<T>): Promise<T> {
    return this.#features.continuation.compactOrchestrator(botSlug, compact);
  }

  tobCli(human: HumanContext, input: TobCliRequest): Promise<TobCliStatus> {
    return this.#features.tobCliRuntime.tobCli(human, input);
  }

  admitDmMessage(human: HumanContext, input: HandleDmMessageInput): DmMessageAdmission {
    return this.#admitDmMessage(human, input);
  }

  #admitDmMessage(
    human: HumanContext,
    input: HandleDmMessageInput,
    tobCliTurn?: TobCliTurn,
  ): DmMessageAdmission {
    return this.#features.channelAdmission.admitDmMessage(human, input, tobCliTurn);
  }

  sendOrchestratorMessage(
    human: HumanContext,
    input: { botSlug: string; sessionId: string; text: string },
  ): OrchestratorMessageOutcome {
    return this.#features.channelAdmission.sendOrchestratorMessage(human, input);
  }

  admitGroupMessage(channelId: string, messageId: string): void {
    return this.#features.channelAdmission.admitGroupMessage(channelId, messageId);
  }

  retryGroupMessageAdmission(channelId: string, messageId: string): void {
    return this.#features.channelAdmission.retryGroupMessageAdmission(channelId, messageId);
  }

  admitBotDmMessage(channelId: string, messageId: string): void {
    return this.#features.channelAdmission.admitBotDmMessage(channelId, messageId);
  }

  withdrawNetworkMembership(hostId: string): Promise<void> {
    return this.#features.withdrawNetworkMembership(hostId);
  }

  admitGroupInvitation(targetDmChannelId: string, invitationId: string): void {
    return this.#features.channelAdmission.admitGroupInvitation(targetDmChannelId, invitationId);
  }

  admitGroupJoinRequest(ownerDmChannelId: string, requestId: string): void {
    return this.#features.channelAdmission.admitGroupJoinRequest(ownerDmChannelId, requestId);
  }

  admitGroupJoinDecision(requesterDmChannelId: string, requestId: string): void {
    return this.#features.channelAdmission.admitGroupJoinDecision(requesterDmChannelId, requestId);
  }

  admitScheduleFiring(botSlug: string): void {
    if (this.#features.closed()) return;
    this.#features.groupDigest.checkHarvestReadiness(botSlug);
  }

  admitExternalSource(botSlug: string, sourceEventId: string): void {
    this.#features.messagingEvents.admitExternalSource(botSlug, sourceEventId);
  }

  resumePendingDigests(botSlug: string): void {
    this.#features.groupDigest.recoverPendingDigests(botSlug);
  }

  askChannel(sessionId: string): string | undefined {
    return this.#features.runtimeInputs.askOrigin({ sessionId })?.channelId;
  }

  hasDirectToolInvocation({ sessionId, callId }: ToolApprovalOriginQuery): boolean {
    return this.#features.activeDirectTools.get(callId)?.agentSessionId === sessionId;
  }

  toolApprovalOrigin(query: ToolApprovalOriginQuery): ToolApprovalOrigin | undefined {
    return this.#features.runtimeInputs.askOrigin(query);
  }

  botCreatePreview(botSlug: string, args: unknown): BotCreatePreview | undefined {
    return this.#features.botCreation.botCreatePreview(botSlug, args);
  }

  captureTobCliAuthority(sessionId: string): TobCliAuthority {
    return this.#features.tobCliRuntime.captureTobCliAuthority(sessionId);
  }

  canRequestPrivateInput(sessionId: string, selected?: string): boolean {
    return this.#features.runtimeInputs.canRequestPrivateInput(sessionId, selected);
  }

  bindPrivateInputOrigin(sessionId: string, selected?: string): PrivateInputOrigin | undefined {
    return this.#features.runtimeInputs.bindPrivateInputOrigin(sessionId, selected);
  }

  bindNativeQuestionInput(
    sessionId: string,
    channelId: string,
    question?: { messageId: string; callId: string },
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    return this.#features.runtimeInputs.bindNativeQuestionInput(sessionId, channelId, question);
  }

  recoverNativeQuestionInput(
    sessionId: string,
    channelId: string,
    requestMessageId: string,
  ): ((deliver: () => boolean) => Promise<boolean>) | undefined {
    return this.#features.runtimeInputs.recoverNativeQuestionInput(
      sessionId,
      channelId,
      requestMessageId,
    );
  }

  nativeQuestionAvailable(sessionId: string, channelId: string): boolean {
    return this.#features.runtimeInputs.nativeQuestionAvailable(sessionId, channelId);
  }

  captureNativeOrchestratorModel(sessionId: string): void {
    return this.#features.orchestratorSessions.captureNativeOrchestratorModel(sessionId);
  }

  prepareNativeOrchestratorStep(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    return this.#features.prepareNativeOrchestratorStep(sessionId, senderSessionIds, signal);
  }

  directBotTools(): DirectBotToolSpec[] {
    return this.#features.directTools.directBotTools();
  }

  directBotToolCalls(botSlug: string): readonly DirectBotToolCall[] {
    return this.#features.directTools.directBotToolCalls(botSlug);
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
    return this.#features.directTools.runDirectBotTool(
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
    const id = this.#features.createEventId();
    const at = this.#features.now().toISOString();
    this.#features.database.transaction(
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
    return this.#features.activeSessionModels.get(sessionId);
  }

  sessionTurnTarget(sessionId: string): TurnTarget | undefined {
    return lastTurnTarget(this.#features.database, sessionId);
  }

  sessionTurnTargets(sessionId: string): TurnTargetSegment[] {
    return readTurnTargets(this.#features.database, sessionId);
  }

  currentOrchestratorSessionId(botSlug: string): string | undefined {
    return this.#features.orchestratorSessions.currentOrchestratorSessionId(botSlug);
  }

  latestAssignmentActivity(): ReadonlyMap<string, number> {
    return this.#features.assignmentExecution.latestAssignmentActivity();
  }

  assignmentEngineAccountUses(accountId: string): string[] {
    return this.#features.assignmentRouting.assignmentEngineAccountUses(accountId);
  }

  refreshBotContacts(): Promise<void> {
    return this.#features.contacts.refreshBotContacts();
  }

  networkBotAvailability(
    hostId: string,
    botSlug: string,
  ): import('./bot-network.js').NetworkBotAvailability {
    return this.#features.contacts.networkBotAvailability(hostId, botSlug);
  }

  botContacts(botSlug: string, query?: BotContactQuery): BotContactPage {
    return this.#features.contacts.botContacts(botSlug, query);
  }

  listAssignments(botSlug: string): AssignmentSummary[] {
    return this.#features.assignmentExecution.listAssignments(botSlug);
  }

  listChannelAssignments(channelId: string): ChannelAssignmentSummary[] {
    return this.#features.assignmentExecution.listChannelAssignments(channelId);
  }

  setAssignmentArchived(
    botSlug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<AssignmentArchiveOutcome | { outcome: 'unarchived'; assignment: AssignmentSummary }> {
    return this.#features.assignmentExecution.setAssignmentArchived(botSlug, sessionId, archived);
  }

  async replaceOrchestrator<T>(
    botSlug: string,
    body: () => T,
  ): Promise<OrchestratorReplacement<T>> {
    if (this.#features.tails.has(botSlug)) return BOT_BUSY;
    let result: OrchestratorReplacement<T> | undefined;
    await this.#features.scheduling.enqueue(botSlug, async () => {
      result = await this.#features.orchestratorSessions.replaceOrchestrator(botSlug, body);
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
    return this.#features.turnSources.has(botSlug) && this.#features.activeTurns.has(botSlug);
  }

  hasPendingInbox(botSlug: string): boolean {
    return this.#features.admissions.hasPendingInbox(botSlug);
  }

  triageOpenCount(botSlug: string): number | undefined {
    return this.#features.triageRunning.get(botSlug);
  }

  getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined {
    return this.#features.assignmentExecution.getAssignment(botSlug, sessionId);
  }

  beginAssignmentApprovalWait(
    sessionId: string,
    callId: string,
    signal: AbortSignal,
  ): AssignmentApprovalWaitLease | undefined {
    return this.#features.assignmentExecution.beginAssignmentApprovalWait(
      sessionId,
      callId,
      signal,
    );
  }

  ensureAssignmentCapacity(sessionId: string, signal: AbortSignal): Promise<void> {
    return this.#features.assignmentExecution.ensureAssignmentCapacity(sessionId, signal);
  }

  assignmentApprovalWait(sessionId: string, callId: string): AssignmentExecutionWait | undefined {
    return this.#features.assignmentExecution.assignmentApprovalWait(sessionId, callId);
  }

  runAssignmentTool<T>(
    sessionId: string,
    callId: string,
    token: symbol,
    signal: AbortSignal,
    body: () => Promise<T>,
  ): Promise<T> {
    return this.#features.assignmentExecution.runAssignmentTool(
      sessionId,
      callId,
      token,
      signal,
      body,
    );
  }

  settleAssignmentTool(sessionId: string, callId: string): void {
    this.#features.assignmentExecution.settleAssignmentTool(sessionId, callId);
  }

  stopBot(botSlug: string): Promise<void> {
    return this.#features.cancellation.stopBot(botSlug);
  }

  stopSession(botSlug: string, sessionId: string): Promise<SessionStopOutcome> {
    return this.#features.cancellation.stopSession(botSlug, sessionId);
  }

  async stopTurn(
    botSlug: string,
    scope?: { autoContinueFor: string; channelId: string },
  ): Promise<{ sessionId: string } | undefined> {
    if (scope !== undefined) {
      const pending = this.#features.autoContinues.get(botSlug);
      if (
        this.#features.closed() ||
        pending?.messageId !== scope.autoContinueFor ||
        pending.channelId !== scope.channelId
      )
        return undefined;
      this.#features.continuation.cancelAutoContinue(botSlug);
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
    return this.#features.cancellation.stopAllSessions(botSlug);
  }

  heldCause(botSlug: string): BotHoldCause | undefined {
    return this.#features.turnFailures.heldCause(botSlug);
  }

  releaseQuotaHold(botSlug: string): boolean {
    return this.#features.turnFailures.releaseQuotaHold(botSlug);
  }

  async endGroup(channelId: string): Promise<void> {
    const at = this.#features.now().toISOString();
    await Promise.all(
      [...this.#features.turnSources]
        .filter(([, turn]) => turn.inboundChannelId === channelId)
        .map(([botSlug]) =>
          this.#features.cancellation.stopTurn(
            botSlug,
            `[Host: the Human disbanded the group your previous turn was answering at ${at}, and its messages were deleted. Do not continue that work.]\n\n`,
          ),
        ),
    );
  }

  whenIdle(): Promise<void> {
    return this.#features.lifecycle.whenIdle();
  }

  close(): Promise<void> {
    return this.#features.lifecycle.close();
  }

  originalAttachmentRoot(
    sessionId: string,
    path: string,
    kind: 'read' | 'write',
    shell = false,
  ): string | undefined {
    return this.#features.originalAttachments.root(sessionId, path, kind, shell);
  }

  refreshAssignmentRoute(
    botSlug: string,
    sessionId: string,
    allowStopped = false,
  ): Promise<ModelRoute | undefined> {
    return this.#features.assignmentRouting.refreshAssignmentRoute(
      botSlug,
      sessionId,
      allowStopped,
    );
  }

  reconcileMemoryChangesOnStartup(): void {
    this.#features.reconcileMemoryChangesOnStartup();
  }
}

export { callTimelineNote, callVisualNote } from '../features/voice/events.js';

export function createBotRuntime(options: BotRuntimeOptions): BotRuntime {
  return new BotRuntimeImplementation(options);
}
