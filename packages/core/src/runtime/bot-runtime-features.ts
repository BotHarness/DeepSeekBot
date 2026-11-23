import { createChannelAccess } from '../channels/runtime-access.js';
import { createRuntimeInputs } from '../features/approvals/runtime-inputs.js';
import { createDirectTools } from '../features/sessions/direct-tools.js';
import { createTobCliRuntime } from '../features/tob/cli-runtime.js';
import { createGroupDigest } from './group-digest.js';
import { createChannelAdmission } from '../channels/runtime-admission.js';
import { createCausalSending } from '../channels/causal-sending.js';
import { createOrchestratorScheduling } from './orchestrator-scheduling.js';
import { createOrchestratorCancellation } from './orchestrator-cancellation.js';
import { createOrchestratorContinuation } from './orchestrator-continuation.js';
import { createMessagingEvents } from '../features/messaging/events.js';
import { createActivityEvents } from '../features/activity/events.js';
import { createAssignmentDelivery } from '../features/assignments/delivery.js';
import { createAssignmentReporting } from '../features/assignments/reporting.js';
import { createAssignmentEvents } from '../features/assignments/events.js';
import { createMemoryEvents } from '../features/memory/events.js';
import { randomUUID } from 'node:crypto';
import { createInboxHistoryQuery } from './inbox-history.js';
import { createInboxTriage } from './inbox-triage.js';
import { DEFAULT_BOT_HOP_LIMIT } from '../channels/channel.js';
import { attachOperationalModule } from '../database/owner.js';
import { createBotSourcePolicyStore } from './source-policy.js';
import { DEFAULT_PROMPT_TEXT } from '../prompts/prompt-parts.js';
import { DEFAULT_PROMPT_LIMITS } from '../prompts/prompt-limits.js';
import { coalesceInbox, createInboxHarvest } from '../features/activity/inbox-harvest.js';
import { createAssignmentExecution } from '../features/assignments/runtime-execution.js';
import { createAssignmentIntake } from '../features/assignments/runtime-intake.js';
import { createAssignmentRouting } from '../features/assignments/runtime-routing.js';
import { createRuntimeAdmissions } from '../features/activity/runtime-admissions.js';
import { createRuntimeAdmissionRecovery } from '../features/activity/runtime-admission-recovery.js';
import { createOrchestratorTurns } from '../features/sessions/runtime-orchestrator-turns.js';
import { createOrchestratorSessions } from '../features/sessions/runtime-orchestrator-sessions.js';
import { createOrchestratorServices } from '../features/sessions/runtime-orchestrator-services.js';
import { createTurnFailures } from '../features/sessions/runtime-turn-failures.js';
import { createRuntimeBotCreation } from '../features/personabots/runtime-creation.js';
import type { BotRuntime, BotRuntimeOptions } from './bot-runtime-types.js';
import type { createBotRuntimeState } from './bot-runtime-state.js';
import { createBotRuntimeLifecycle, createBotRuntimeRecovery } from './bot-runtime-lifecycle.js';
import { DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT } from '../features/assignments/runtime-types.js';
import { interruptedDmNotice } from '../features/activity/runtime-admission-support.js';
import { createRuntimeAssignmentAccess } from '../features/assignments/runtime-access.js';
import { createRuntimeAssignmentLifecycle } from '../features/assignments/runtime-lifecycle.js';
import { pickSessionGroup } from '../features/models/runtime-session-group.js';
import { createRuntimeMemoryChanges } from '../features/memory/runtime-changes.js';
import { createRuntimeBotContacts } from '../features/personabots/runtime-contacts.js';
import { createNativeOrchestratorStep } from '../features/sessions/native-orchestrator-step.js';
import { createRuntimeMembership } from '../channels/runtime-membership.js';
import { createRuntimeQuotes } from '../channels/runtime-quotes.js';

type RuntimeInstancePorts = Pick<
  Required<BotRuntime>,
  | 'getAssignment'
  | 'admitDmMessage'
  | 'currentOrchestratorSessionId'
  | 'admitGroupMessage'
  | 'admitBotDmMessage'
  | 'admitGroupInvitation'
  | 'admitGroupJoinDecision'
  | 'admitGroupJoinRequest'
  | 'botContacts'
  | 'refreshBotContacts'
  | 'bindPrivateInputOrigin'
  | 'nativeQuestionAvailable'
  | 'recoverNativeQuestionInput'
  | 'directBotTools'
  | 'listAssignments'
> & {
  refreshAssignmentRoute: ReturnType<typeof createAssignmentRouting>['refreshAssignmentRoute'];
};

const AUTO_CONTINUE_DELAYS_MS: readonly number[] = [60_000, 180_000];
const STOP_SETTLE_TIMEOUT_MS = 30_000;

export function createBotRuntimeFeatures(
  options: BotRuntimeOptions,
  state: ReturnType<typeof createBotRuntimeState>,
  runtime: RuntimeInstancePorts,
  recordDirectToolSource: Parameters<typeof createDirectTools>[0]['recordDirectToolSource'],
) {
  const {
    activeSessionModels,
    originalAttachments,
    quoteBlocks,
    tails,
    activeTurns,
    nativeStepReady,
    preparedOrchestrators,
    preparedAssignments,
    groupContinuations,
    nativeAssignmentSteps,
    stoppedTurns,
    switchingRoutingGroups,
    stopNotices,
    held,
    failureStreaks,
    typingTurns,
    typingAssignments,
    turnSources,
    memoryTurnOperations,
    activeMemoryEvents,
    steerSettlements,
    pendingHarvests,
    digestTimers,
    completionDigestTimers,
    snoozeTimers,
    autoContinues,
    interruptedTools,
    pendingDeliveries,
    triageQueued,
    triageRunning,
    triageBaseline,
    triageStalled,
    groupAdmissionRetries,
    digestRetryAt,
    digestFailureCount,
    inboxFactoryRetries,
    assignmentRuns,
    assignmentAcceptances,
    assignmentArchives,
    assignmentNotices,
    waitLifetime,
    activeDirectTools,
    tobCliRequests,
    directToolCalls,
    waitOptions,
    tob,
    externalMessaging,
    database,
    sessionModels,
    grants,
    assignmentAccessPresetStore,
    ownership,
    workspaceRoot,
    orchestratorCwd,
    sessionArchived,
    registry,
    botNetwork,
    requireExecution,
    routeRests,
    inheritedModelPlan,
    groupFallback,
    sessionRoute,
    engineFallback,
    team,
    requireModelRoute,
    requireAssignmentEngine,
    channels,
    groupSendReview,
    closed,
    markClosed,
    onTobDelegation: configuredOnTobDelegation,
  } = state;
  const inboxHistory =
    options.inboxHistory ??
    createInboxHistoryQuery(
      attachOperationalModule(options.database, 'messaging'),
      options.channels,
      options.now,
    );
  const inboxTriage = createInboxTriage(database, options.channels, options.now);
  const sourcePolicy = options.sourcePolicy ?? createBotSourcePolicyStore(database, options.now);
  const schedules = options.schedules;
  const agents = options.agents;
  const memory = options.memory;
  const attachments = options.attachments;
  const voiceMessages = options.voiceMessages;
  const callFrames = options.callFrames;
  const saveReportSpill = options.saveReportSpill;
  const readAssignmentTail = options.readAssignmentTail;
  const messagePerf = options.messagePerf;
  const configuredNow = options.now ?? (() => new Date());
  const readTurnProgress = options.readTurnProgress;
  const autoContinueDelaysMs = options.autoContinueDelaysMs ?? AUTO_CONTINUE_DELAYS_MS;
  const stopSettleTimeoutMs = options.stopSettleTimeoutMs ?? STOP_SETTLE_TIMEOUT_MS;
  const closeSessionApprovals = options.closeSessionApprovals;
  const configuredPromptText = options.promptText ?? (() => DEFAULT_PROMPT_TEXT);
  const configuredPromptLimits = options.promptLimits ?? (() => DEFAULT_PROMPT_LIMITS);
  const configuredCreateSessionId = options.createSessionId ?? (() => `botharness-${randomUUID()}`);
  const configuredCreateEventId = options.createEventId ?? (() => randomUUID());
  const configuredCreateMessageId = options.createMessageId ?? (() => randomUUID());
  const configuredCreateBotId =
    options.createBotId ?? (() => 'bot-' + randomUUID().replaceAll('-', ''));
  const configuredLimit =
    options.assignmentConcurrencyLimit ?? DEFAULT_ASSIGNMENT_CONCURRENCY_LIMIT;
  const configuredAssignmentConcurrencyLimit =
    typeof configuredLimit === 'function' ? configuredLimit : () => configuredLimit;
  const configuredBotHopLimit = options.botHopLimit ?? (() => DEFAULT_BOT_HOP_LIMIT);
  const sessionArchive = options.sessionArchive;
  const configuredWarn = options.warn;
  const requireExecutionForRuntime = requireExecution?.bind(runtime);
  const requireModelRouteForRuntime = requireModelRoute?.bind(runtime);
  const sessionArchivedForRuntime = sessionArchived?.bind(runtime);
  const sessionArchiveForRuntime = sessionArchive?.bind(runtime);
  const inheritedModelPlanForRuntime = inheritedModelPlan?.bind(runtime);
  const now = () => configuredNow.call(runtime);
  const createEventId = () => configuredCreateEventId.call(runtime);
  const warn =
    configuredWarn === undefined
      ? undefined
      : (message: string) => configuredWarn.call(runtime, message);
  const promptText = (botSlug: string) => configuredPromptText.call(runtime, botSlug);
  const promptLimits = (botSlug: string) => configuredPromptLimits.call(runtime, botSlug);
  const createSessionId = () => configuredCreateSessionId.call(runtime);
  const createMessageId = () => configuredCreateMessageId.call(runtime);
  const createBotId = () => configuredCreateBotId.call(runtime);
  const botHopLimit = () => configuredBotHopLimit.call(runtime);
  const assignmentConcurrencyLimit = () => configuredAssignmentConcurrencyLimit.call(runtime);
  const onTobDelegation = () => configuredOnTobDelegation.call(runtime);

  const { memberBotEnabled, isMember, requireTurnAccess, requireMembership, dmChannel } =
    createRuntimeMembership({ channels, database, registry, team });
  const { rowQuotes, quotePrompt, turnQuoteBlocks, refreshQuoteBlocks } = createRuntimeQuotes({
    channels,
    quoteBlocks,
  });
  const { recordTurnCommits, insertMemoryChange } = createRuntimeMemoryChanges({
    channels,
    memory,
    now,
    warn,
  });
  const memoryEvents = createMemoryEvents({
    database,
    registry,
    memory,
    now,
    createEventId,
    insertMemoryChange,
    coalesceInbox,
    promptText,
    setObserved: (eventIds, at) => admissions.setObserved(eventIds, at),
    trackSteer: (settlement) => channelAdmission.trackSteer(settlement),
    warn,
  });
  const triageContinuation = options.triageContinuation === true;

  const { approvalCapacity, setStopState, stopAssignment } = createRuntimeAssignmentLifecycle({
    agents,
    database,
    ownership,
    now,
    createEventId,
    warn,
    pendingDeliveries,
    typingAssignments,
    assignmentRuns,
    sourcePolicy,
    assignmentExecutionAvailable: (...args) =>
      assignmentExecution.assignmentExecutionAvailable(...args),
    assignmentCapacityRefusal: (...args) => assignmentExecution.assignmentCapacityRefusal(...args),
    assignmentRow: (...args) => assignmentExecution.assignmentRow(...args),
    requireAssignmentSummary: (...args) => assignmentExecution.requireAssignmentSummary(...args),
    beginSessionStop: (...args) => cancellation.beginSessionStop(...args),
    settleStop: (...args) => cancellation.settleStop(...args),
    scheduleHarvest: (...args) => scheduling.scheduleHarvest(...args),
  });
  const assignmentEvents = createAssignmentEvents({
    database,
    scheduleHarvest: (...args) => scheduling.scheduleHarvest(...args),
    completionDigestTimers,
    getAssignment: (...args) => runtime.getAssignment(...args),
    waitOptions,
    waitLifetime,
    now,
    setObserved: (...args) => admissions.setObserved(...args),
    markReportsHandled: (...args) => admissions.markReportsHandled(...args),
  });
  const assignmentReporting = createAssignmentReporting({
    createEventId,
    now,
    database,
    sourcePolicy,
    scheduleHarvest: (...args) => scheduling.scheduleHarvest(...args),
    ownership,
    closed,
    registry,
    assignmentRow: (...args) => assignmentExecution.assignmentRow(...args),
    getAssignment: (...args) => runtime.getAssignment(...args),
    saveReportSpill,
    readAssignmentReportPage: options.readAssignmentReportPage,
    scheduleReportHarvest: (...args) => assignmentEvents.scheduleReportHarvest(...args),
  });
  const assignmentDelivery = createAssignmentDelivery({
    assignmentCapacityRefusal: (...args) => assignmentExecution.assignmentCapacityRefusal(...args),
    requireAssignmentSummary: (...args) => assignmentExecution.requireAssignmentSummary(...args),
    setStopState,
    setActivity: (...args) => assignmentExecution.setActivity(...args),
    groupContinuations,
    agents,
    interruptedTools,
    publishAssignmentRefusal: (...args) => assignmentExecution.publishAssignmentRefusal(...args),
    now,
    database,
    assignmentAcceptances,
    trackAssignmentRun: (...args) => assignmentExecution.trackAssignmentRun(...args),
  });
  const activityEvents = createActivityEvents({
    snoozeTimers,
    registry,
    closed,
    database,
    now,
    held,
    enqueue: (...args) => scheduling.enqueue(...args),
    triageContinuation,
    triageQueued,
    inboxTriage,
    triageBaseline,
    triageStalled,
    dmChannel,
    promptText,
    triageRunning,
    ensureOrchestrator: (...args) => orchestratorSessions.ensureOrchestrator(...args),
    runOrchestratorTurn: (...args) => orchestratorTurns.runOrchestratorTurn(...args),
    failureStreaks,
    noteAutomaticFailure: (...args) => turnFailures.noteAutomaticFailure(...args),
    warn,
  });
  const scheduling = createOrchestratorScheduling({
    activeTurns,
    activityEvents,
    checkHarvestReadiness: (...args) => groupDigest.checkHarvestReadiness(...args),
    closed,
    database,
    held,
    inboxFactoryRetries,
    pendingHarvests,
    recoverPendingDigests: (...args) => groupDigest.recoverPendingDigests(...args),
    registry,
    runHarvestTurn: (...args) => inboxHarvest.runHarvestTurn(...args),
    tails,
    warn,
  });
  const continuation = createOrchestratorContinuation({
    admitDmMessage: (...args) => runtime.admitDmMessage(...args),
    agents,
    appendModelSwitch: (...args) => turnFailures.appendModelSwitch(...args),
    autoContinues,
    channels,
    claimDmContinuation: (...args) => admissions.claimDmContinuation(...args),
    closed,
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    database,
    engineFallback: engineFallback?.bind(runtime),
    enqueue: (...args) => scheduling.enqueue(...args),
    failureStreaks,
    groupFallback,
    memberBotEnabled,
    now,
    orchestratorServices: (...args) => orchestratorServices.orchestratorServices(...args),
    registry,
    release: (...args) => turnFailures.release(...args),
    replaceOrchestrator: (...args) => orchestratorSessions.replaceOrchestrator(...args),
    requireExecution: requireExecutionForRuntime,
    routeRests,
    runHumanDmTurn: (...args) => orchestratorTurns.runHumanDmTurn(...args),
    sessionRoute: sessionRoute?.bind(runtime),
    stoppedTurns,
    switchingRoutingGroups,
    tails,
    team,
    warn,
  });
  const messagingEvents = createMessagingEvents({
    closed,
    externalMessaging,
    database,
    release: (...args) => turnFailures.release(...args),
    checkHarvestReadiness: (...args) => groupDigest.checkHarvestReadiness(...args),
    admitChannelMessage: (...args) => channelAdmission.admitChannelMessage(...args),
    activeTurns,
    delivery: (...args) => channelAdmission.delivery(...args),
    steerWithMemory:
      agents.steerOrchestrator === undefined
        ? undefined
        : (botSlug, prompt, requireAccess) =>
            channelAdmission.steerWithMemory(botSlug, prompt, requireAccess),
    promptText,
    promptLimits,
    claimGroupContext: (...args) => inboxHarvest.claimGroupContext(...args),
    setObserved: (...args) => admissions.setObserved(...args),
    now,
    markAdmissionsSideEffect: (botSlug, sourceIds) =>
      admissions.markAdmissionsSideEffect(botSlug, sourceIds, false),
    requireTurnAccess,
    turnSessionId: (botSlug) => turnSources.get(botSlug)?.sessionId,
    routingGroupReplyState: (...args) => continuation.routingGroupReplyState(...args),
    noteSteeredChannel: (...args) => admissions.noteSteeredChannel(...args),
    groupContextSection: (...args) => groupDigest.groupContextSection(...args),
    settleHarvestFailure: (...args) => inboxHarvest.settleHarvestFailure(...args),
    acceptTurnSources: (...args) => admissions.acceptTurnSources(...args),
    typingTurns,
    observeAdmission: (...args) => admissions.observeAdmission(...args),
    markReportsHandled: (...args) => admissions.markReportsHandled(...args),
    settleHarvestHandled: (...args) => inboxHarvest.settleHarvestHandled(...args),
    trackSteer: (settlement) => channelAdmission.trackSteer(settlement),
    held,
    armDigest: (...args) => groupDigest.armDigest(...args),
  });
  const cancellation = createOrchestratorCancellation({
    activeTurns,
    agents,
    assignmentAcceptances,
    assignmentRow: (...args) => assignmentExecution.assignmentRow(...args),
    assignmentRuns,
    cancelAutoContinue: (...args) => continuation.cancelAutoContinue(...args),
    closed,
    closeSessionApprovals: closeSessionApprovals?.bind(runtime),
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    database,
    groupSendReview,
    interruptedTools,
    memoryTurnOperations,
    now,
    ownership,
    pendingDeliveries,
    pendingHarvests,
    registry,
    stopAssignment,
    stopNotices,
    stoppedTurns,
    stopSettleTimeoutMs,
    switchingRoutingGroups,
    tails,
    tobCliRequests,
    turnSources,
    warn,
  });

  const groupDigest = createGroupDigest({
    assignmentEvents,
    channels,
    closed,
    database,
    digestRetryAt,
    digestTimers,
    dmChannel,
    externalMessaging,
    held,
    messagingEvents,
    now,
    promptText,
    registry,
    rowQuotes,
    scheduling,
  });
  const channelAdmission = createChannelAdmission({
    acceptTurnSources: (...args) => admissions.acceptTurnSources(...args),
    activeMemoryEvents,
    activeTurns,
    admitGroupMessage: (...args) => runtime.admitGroupMessage(...args),
    agents,
    autoContinues,
    channels,
    claimSourceEvent: (...args) => admissions.claimSourceEvent(...args),
    claimSteeredDm: (...args) => admissions.claimSteeredDm(...args),
    claimSteeredGroupMention: (...args) => admissions.claimSteeredGroupMention(...args),
    closed,
    continuation,
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    database,
    dmContextSection: (...args) => groupDigest.dmContextSection(...args),
    groupAdmissionRetries,
    groupContextSection: (...args) => groupDigest.groupContextSection(...args),
    markAdmissionsSideEffect: (...args) => admissions.markAdmissionsSideEffect(...args),
    memberBotEnabled,
    memory,
    memoryEvents,
    memoryTurnOperations,
    noteSteeredChannel: (...args) => admissions.noteSteeredChannel(...args),
    now,
    observeAdmission: (...args) => admissions.observeAdmission(...args),
    promptText,
    quotePrompt,
    registry,
    release: (...args) => turnFailures.release(...args),
    requireMembership,
    requireTurnAccess,
    restoreSteeredAdmissions: (...args) => admissions.restoreSteeredAdmissions(...args),
    runHumanDmTurn: (...args) => orchestratorTurns.runHumanDmTurn(...args),
    scheduleDigest: (...args) => groupDigest.scheduleDigest(...args),
    scheduling,
    settleSteeredAdmission: (...args) => admissions.settleSteeredAdmission(...args),
    sourcePolicy,
    speakerInput: (...args) => orchestratorServices.speakerInput(...args),
    steerSettlements,
    team,
    tob,
    tobCliRequests,
    turnSources,
    warn,
  });
  const causalSending = createCausalSending({
    admitBotDmMessage: (...args) => runtime.admitBotDmMessage(...args),
    admitGroupMessage: (...args) => runtime.admitGroupMessage(...args),
    botHopLimit,
    botNetwork,
    channels,
    closed,
    createMessageId,
    database,
    groupSendReview,
    isMember,
    messagePerf,
    now,
    onTobDelegation,
    ownership,
    registry,
    requireMembership,
    stoppedTurns,
    team,
    tob,
    turnSources,
    warn,
  });
  const channelAccess = createChannelAccess({
    admitGroupInvitation: (...args) => runtime.admitGroupInvitation(...args),
    admitGroupJoinDecision: (...args) => runtime.admitGroupJoinDecision(...args),
    admitGroupJoinRequest: (...args) => runtime.admitGroupJoinRequest(...args),
    attachments,
    botContacts: (...args) => runtime.botContacts(...args),
    callFrames,
    causalSending,
    channels,
    closed,
    createBot: (...args) => botCreation.createBot(...args),
    createMessageId,
    database,
    grants,
    groupSendReview,
    ignoreAdmission: (...args) => admissions.ignoreAdmission(...args),
    isMember,
    now,
    observeReadMessages: (...args) => admissions.observeReadMessages(...args),
    originalAttachments,
    ownership,
    refreshBotContacts: () => runtime.refreshBotContacts(),
    registry,
    requireMembership,
    requireTurnAccess,
    team,
    tob,
    turnSources,
    voiceMessages,
  });
  const runtimeInputs = createRuntimeInputs({
    activeDirectTools,
    bindPrivateInputOrigin: (...args) => runtime.bindPrivateInputOrigin(...args),
    channels,
    closed,
    database,
    enqueue: (...args) => scheduling.enqueue(...args),
    externalMessaging,
    markSideEffectStarted: (...args) => admissions.markSideEffectStarted(...args),
    nativeQuestionAvailable: (...args) => runtime.nativeQuestionAvailable(...args),
    ownership,
    recoverNativeQuestionInput: (...args) => runtime.recoverNativeQuestionInput(...args),
    registry,
    runOrchestratorTurn: (...args) => orchestratorTurns.runOrchestratorTurn(...args),
    sessionArchived: (...args) => sessionArchived?.call(runtime, ...args),
    turnSources,
    warn,
  });
  const directTools = createDirectTools({
    activeDirectTools,
    agents,
    channels,
    closed,
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    database,
    directBotTools: () => runtime.directBotTools(),
    directToolCalls,
    noticeDirectAssignmentCall: (...args) =>
      assignmentReporting.noticeDirectAssignmentCall(...args),
    now,
    orchestratorServices: (...args) => orchestratorServices.orchestratorServices(...args),
    ownership,
    recordDirectToolSource,
    registry,
    requireExecution: requireExecutionForRuntime,
    requireMembership,
    team,
    tobCliRequests,
    warn,
  });
  const tobCliRuntime = createTobCliRuntime({
    activeDirectTools,
    admitDmMessage: (...args) => channelAdmission.admitDmMessage(...args),
    channels,
    closed,
    database,
    markAdmissionsSideEffect: (...args) => admissions.markAdmissionsSideEffect(...args),
    memberBotEnabled,
    now,
    ownership,
    registry,
    requireExecution: requireExecutionForRuntime,
    tails,
    tob,
    tobCliRequests,
    turnSources,
  });
  const assignmentIntake = createAssignmentIntake({
    agents,
    assignmentAcceptances,
    assignmentAccessPresetStore,
    assignmentArchives,
    assignmentByKey: (...args) => assignmentExecution.assignmentByKey(...args),
    assignmentCapacityRefusal: (...args) => assignmentExecution.assignmentCapacityRefusal(...args),
    assignmentDelivery,
    assignmentFailed: (...args) => assignmentRouting.assignmentFailed(...args),
    assignmentGroupExecution: (...args) => assignmentRouting.assignmentGroupExecution(...args),
    assignmentModelSelection: (...args) => assignmentRouting.assignmentModelSelection(...args),
    assignmentReporting,
    assignmentRow: (...args) => assignmentExecution.assignmentRow(...args),
    recordInterruptedTools: (...args) => cancellation.recordInterruptedTools(...args),
    createSessionId,
    database,
    getAssignment: (...args) => runtime.getAssignment(...args),
    grants,
    groupFallback,
    inheritedModelPlan: inheritedModelPlanForRuntime,
    interruptedTools,
    now,
    ownership,
    registry,
    requireAssignmentEngine: requireAssignmentEngine?.bind(runtime),
    requireAssignmentSummary: (...args) => assignmentExecution.requireAssignmentSummary(...args),
    requireModelRoute: requireModelRouteForRuntime,
    requireTurnAccess,
    routeRests,
    sessionModels,
    setAssignmentExecutionReady: (...args) =>
      assignmentExecution.setAssignmentExecutionReady(...args),
    trackAssignmentRun: (...args) => assignmentExecution.trackAssignmentRun(...args),
    turnSources,
  });
  const assignmentExecution = createAssignmentExecution({
    agents,
    approvalCapacity,
    assignmentAcceptances,
    assignmentArchives,
    assignmentConcurrencyLimit,
    assignmentFailed: (...args) => assignmentRouting.assignmentFailed(...args),
    assignmentModelSelection: (...args) => assignmentRouting.assignmentModelSelection(...args),
    assignmentNotices,
    assignmentReporting,
    assignmentRuns,
    channels,
    closed,
    database,
    externalMessaging,
    getAssignment: (...args) => runtime.getAssignment(...args),
    grants,
    groupContinuations,
    nativeAssignmentSteps,
    now,
    ownership,
    preparedAssignments,
    publishSessionFailure: (...args) => turnFailures.publishSessionFailure(...args),
    refreshAssignmentRoute: (...args) => runtime.refreshAssignmentRoute(...args),
    registry,
    requireTurnAccess,
    sessionArchive: sessionArchiveForRuntime,
    sessionArchived: (...args) => sessionArchived?.call(runtime, ...args),
    sessionModels,
    typingAssignments,
    waitLifetime,
    waitOptions,
    warn,
  });
  const assignmentRouting = createAssignmentRouting({
    activeSessionModels,
    appendModelSwitch: (...args) => turnFailures.appendModelSwitch(...args),
    assignmentDmChannel: (...args) => assignmentExecution.assignmentDmChannel(...args),
    assignmentReporting,
    assignmentRow: (...args) => assignmentExecution.assignmentRow(...args),
    assignmentRuns,
    closed,
    routingTargetFailure: (...args) => continuation.routingTargetFailure(...args),
    database,
    groupContinuations,
    groupFallback,
    inheritedModelPlan: inheritedModelPlanForRuntime,
    now,
    pickSessionGroup: (...args) => pickSessionGroup(groupFallback, ...args),
    publishSessionFailure: (...args) => turnFailures.publishSessionFailure(...args),
    refreshAssignmentRoute: (...args) => runtime.refreshAssignmentRoute(...args),
    registry,
    requestAssignment: (...args) => assignmentIntake.requestAssignment(...args),
    requireExecution: requireExecutionForRuntime,
    requireModelRoute: requireModelRouteForRuntime,
    routeRests,
    sessionModels,
    setActivity: (...args) => assignmentExecution.setActivity(...args),
    warn,
  });
  const inboxHarvest = createInboxHarvest({
    assignmentEvents,
    channelAdmission,
    channels,
    closed,
    database,
    digestFailureCount,
    digestRetryAt,
    dmChannel,
    ensureOrchestrator: (...args) => orchestratorSessions.ensureOrchestrator(...args),
    failureStreaks,
    groupDigest,
    held,
    inboxFactoryRetries,
    markAdmissionsSideEffect: (...args) => admissions.markAdmissionsSideEffect(...args),
    markReportsHandled: (...args) => admissions.markReportsHandled(...args),
    messagingEvents,
    noteAutomaticFailure: (...args) => turnFailures.noteAutomaticFailure(...args),
    now,
    observeAdmission: (...args) => admissions.observeAdmission(...args),
    promptLimits,
    promptText,
    publishSessionFailure: (...args) => turnFailures.publishSessionFailure(...args),
    registry,
    retireWithdrawnNetworkAdmissions: (...args) =>
      admissionRecovery.retireWithdrawnNetworkAdmissions(...args),
    rowQuotes,
    runOnLiveOrchestrator: (...args) => orchestratorTurns.runOnLiveOrchestrator(...args),
    runOrchestratorTurn: (...args) => orchestratorTurns.runOrchestratorTurn(...args),
    scheduling,
    setObserved: (...args) => admissions.setObserved(...args),
    warn,
  });

  const admissions = createRuntimeAdmissions({
    channels,
    closed,
    continuation,
    createEventId,
    database,
    groupDigest,
    inboxHarvest,
    now,
    promptLimits,
    sourcePolicy,
    tails,
    turnSources,
  });
  const admissionRecovery = createRuntimeAdmissionRecovery({
    botNetwork,
    channels,
    closed,
    createEventId,
    database,
    isMember,
    now,
    sourcePolicy,
  });
  const orchestratorTurns = createOrchestratorTurns({
    activeMemoryEvents,
    activeSessionModels,
    activityEvents,
    admissionHandled: (...args) => admissions.admissionHandled(...args),
    agents,
    assignmentExecution,
    autoContinueDelaysMs,
    autoContinues,
    cancellation,
    causalSending,
    channelAdmission,
    channels,
    closed,
    continuation,
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    database,
    ensureOrchestrator: (...args) => orchestratorSessions.ensureOrchestrator(...args),
    externalMessaging,
    failureStreaks,
    groupFallback,
    held,
    holdForRestingRoute: (...args) => turnFailures.holdForRestingRoute(...args),
    inboxHarvest,
    inboxTriage,
    interruptedDmNotice: (...args) => interruptedDmNotice(database, ...args),
    isMember,
    markReportsHandled: (...args) => admissions.markReportsHandled(...args),
    markReportSideEffects: (...args) => admissions.markReportSideEffects(...args),
    markSideEffectStarted: (...args) => admissions.markSideEffectStarted(...args),
    markSourceEventFailed: (...args) => admissions.markSourceEventFailed(...args),
    memberBotEnabled,
    memory,
    memoryEvents,
    memoryTurnOperations,
    nativeStepReady,
    notifyReadAdmissions: (...args) => admissions.notifyReadAdmissions(...args),
    now,
    observeAdmission: (...args) => admissions.observeAdmission(...args),
    orchestratorServices: (...args) => orchestratorServices.orchestratorServices(...args),
    originalAttachments,
    pickSessionGroup: (...args) => pickSessionGroup(groupFallback, ...args),
    preparedOrchestrators,
    promptText,
    publishSessionFailure: (...args) => turnFailures.publishSessionFailure(...args),
    readTurnProgress: readTurnProgress?.bind(runtime),
    recordTurnCommits,
    refreshQuoteBlocks,
    replaceOrchestrator: (...args) => orchestratorSessions.replaceOrchestrator(...args),
    requireExecution: requireExecutionForRuntime,
    requireModelRoute: requireModelRouteForRuntime,
    requireTurnAccess,
    sessionArchived: sessionArchivedForRuntime,
    sessionModels,
    setObserved: (...args) => admissions.setObserved(...args),
    speakerInput: (...args) => orchestratorServices.speakerInput(...args),
    stopNotices,
    stoppedTurns,
    triageBaseline,
    triageRunning,
    turnQuoteBlocks,
    turnSideEffectStarted: (...args) => admissions.turnSideEffectStarted(...args),
    turnSources,
    typingTurns,
    warn,
  });
  const orchestratorSessions = createOrchestratorSessions({
    agents,
    closed,
    createSessionId,
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    now,
    orchestratorCwd: orchestratorCwd?.bind(runtime),
    ownership,
    preparedOrchestrators,
    registry,
    sessionArchive: sessionArchiveForRuntime,
    sessionArchived: sessionArchivedForRuntime,
    warn,
    workspaceRoot,
  });
  const { assignmentAccess } = createRuntimeAssignmentAccess({
    database,
    stoppedTurns,
    pendingDeliveries,
    grants,
    readAssignmentTail: readAssignmentTail?.bind(runtime),
    assignmentEvents,
    assignmentExecution,
    assignmentReporting,
    assignmentIntake,
    refreshAssignmentRoute: (...args) => runtime.refreshAssignmentRoute(...args),
    listAssignments: (...args) => runtime.listAssignments(...args),
    getAssignment: (...args) => runtime.getAssignment(...args),
    markSideEffectStarted: (...args) => admissions.markSideEffectStarted(...args),
    stopAssignment,
  });
  const orchestratorServices = createOrchestratorServices({
    activityEvents,
    assignmentAccess,
    attachments,
    channelAccess,
    channels,
    database,
    externalMessaging,
    grants,
    inboxHistory,
    inboxTriage,
    memory,
    messagingEvents,
    registry,
    requireTurnAccess,
    schedules,
    sourcePolicy,
    team,
    tob,
  });
  const turnFailures = createTurnFailures({
    channels,
    continuation,
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    digestFailureCount,
    digestRetryAt,
    digestTimers,
    failureStreaks,
    held,
    inboxFactoryRetries,
    now,
    registry,
    scheduling,
    snoozeTimers,
    triageQueued,
    warn,
  });
  const botCreation = createRuntimeBotCreation({
    channels,
    closed,
    createBotId,
    grants,
    registry,
    team,
    warn,
  });

  const { prepareNativeOrchestratorStep } = createNativeOrchestratorStep({
    prepareNativeAssignmentStep: (...args) =>
      assignmentExecution.prepareNativeAssignmentStep(...args),
    enqueue: (...args) => scheduling.enqueue(...args),
    runOrchestratorTurn: (...args) => orchestratorTurns.runOrchestratorTurn(...args),
    currentOrchestratorSessionId: (...args) => runtime.currentOrchestratorSessionId(...args),
    ownership,
    closed,
    registry,
    warn,
    preparedOrchestrators,
    waitLifetime,
    nativeStepReady,
  });
  const contacts = createRuntimeBotContacts({ botNetwork, registry, team });
  const lifecycle = createBotRuntimeLifecycle({
    closed,
    markClosed,
    tobCliRequests,
    inboxHistory,
    approvalCapacity,
    waitLifetime,
    typingTurns,
    typingAssignments,
    digestTimers,
    completionDigestTimers,
    snoozeTimers,
    continuation,
    groupAdmissionRetries,
    digestRetryAt,
    digestFailureCount,
    scheduling,
    tails,
    assignmentRuns,
    assignmentAcceptances,
    assignmentNotices,
    steerSettlements,
    agents,
  });

  const recoverAtStartup = createBotRuntimeRecovery({
    ready: () => options.database.mode === 'ready',
    admissionRecovery,
    channelAdmission,
    channels,
    continuation,
    groupDigest,
    assignmentEvents,
    registry,
    activityEvents,
  });

  return {
    admissions,
    assignmentExecution,
    assignmentRouting,
    botCreation,
    cancellation,
    channelAdmission,
    continuation,
    directTools,
    groupDigest,
    messagingEvents,
    orchestratorSessions,
    runtimeInputs,
    tobCliRuntime,
    turnFailures,
    originalAttachments,
    activeDirectTools,
    activeSessionModels,
    database,
    tails,
    scheduling,
    turnSources,
    activeTurns,
    triageRunning,
    autoContinues,
    now,
    closed,
    reconcileMemoryChangesOnStartup: () => memoryEvents.reconcileMemoryChangesOnStartup(closed()),
    recoverAtStartup,
    prepareNativeOrchestratorStep,
    createEventId,
    contacts,
    lifecycle,
    withdrawNetworkMembership,
  };

  async function withdrawNetworkMembership(hostId: string): Promise<void> {
    for (const bot of registry.list())
      await admissionRecovery.retireWithdrawnNetworkAdmissions(bot.slug, hostId);
  }
}
