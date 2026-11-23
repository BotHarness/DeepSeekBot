import {
  type ActiveDirectTool,
  type DirectBotToolCall,
} from '../features/sessions/direct-tools.js';
import { type TobCliRequestLease } from '../features/tob/cli-runtime.js';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import { sessionModelChoices } from './session-model-choices.js';
import { type PendingAutoContinue } from './orchestrator-continuation.js';
import { GroupSendReview } from '../channels/send-review.js';
import { OriginalAttachmentAccess } from '../attachments/original-access.js';
import type { MessagingProcessing } from '../messaging/typing.js';
import { type ChannelMessage } from '../channels/channel.js';
import { attachOperationalModule } from '../database/owner.js';
import { createSessionOwnership } from '../sessions/ownership.js';
import type { BotRuntimeOptions } from './bot-runtime-types.js';
import type { BotHoldCause, InterruptedToolCall } from '../features/sessions/agent-run-types.js';

export function createBotRuntimeState(options: BotRuntimeOptions) {
  const activeSessionModels = new Map<string, SessionModelChoice | null>();
  const originalAttachments = new OriginalAttachmentAccess((fileId) =>
    channels.recordAttachmentChange?.(fileId),
  );
  const quoteBlocks = new Map<string, { channelId: string; message: ChannelMessage }>();
  const tails = new Map<string, Promise<unknown>>();
  const activeTurns = new Map<string, Promise<void>>();
  const nativeStepReady = new Map<string, (accepted: boolean) => void>();
  const preparedOrchestrators = new Set<string>();
  const preparedAssignments = new Set<string>();
  const groupContinuations = new Map<string, { error?: unknown; refreshing: boolean }>();
  const nativeAssignmentSteps = new Map<string, { step: Promise<boolean>; signal: AbortSignal }>();
  const stoppedTurns = new Set<string>();
  const switchingRoutingGroups = new Set<string>();
  const stopNotices = new Map<string, string>();
  const held = new Map<string, BotHoldCause>();
  const failureStreaks = new Map<string, number>();
  const typingTurns = new Map<string, MessagingProcessing>();
  const typingAssignments = new Map<string, MessagingProcessing>();
  const turnSources = new Map<
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
  const memoryTurnOperations = new Set<string>();
  const activeMemoryEvents = new Map<
    string,
    { eventIds: string[]; preserveObservation: boolean }
  >();
  const steerSettlements = new Set<Promise<void>>();
  const pendingHarvests = new Set<string>();
  const digestTimers = new Map<string, NodeJS.Timeout>();
  const completionDigestTimers = new Map<string, NodeJS.Timeout>();
  const snoozeTimers = new Map<string, NodeJS.Timeout>();
  const autoContinues = new Map<string, PendingAutoContinue>();
  const interruptedTools = new Map<string, InterruptedToolCall[]>();
  const pendingDeliveries = new Map<string, string>();
  const triageQueued = new Set<string>();
  const triageRunning = new Map<string, number>();
  const triageBaseline = new Map<string, number>();
  const triageStalled = new Map<string, Set<string>>();
  const groupAdmissionRetries = new Map<string, NodeJS.Timeout>();
  const digestRetryAt = new Map<string, number>();
  const digestFailureCount = new Map<string, number>();
  const inboxFactoryRetries = new Map<string, { attempts: number; timer?: NodeJS.Timeout }>();
  const assignmentRuns = new Map<string, Promise<void>>();
  const assignmentAcceptances = new Set<string>();
  const assignmentArchives = new Set<string>();
  const assignmentNotices = new Set<Promise<void>>();
  const waitLifetime = new AbortController();
  const activeDirectTools = new Map<string, ActiveDirectTool>();
  const tobCliRequests = new Map<string, TobCliRequestLease>();
  let closed = false;
  const directToolCalls = new Map<string, DirectBotToolCall[]>();

  const waitOptions = options;
  const tob = options.tob;
  const onTobDelegation = options.onTobDelegation ?? (() => {});
  const externalMessaging = options.externalMessaging;
  const database = attachOperationalModule(options.database, 'bot-runtime');
  const sessionModels = sessionModelChoices(database);
  const grants = options.grants;
  const assignmentAccessPresetStore = options.assignmentAccess;
  const ownership =
    options.ownership ??
    createSessionOwnership(attachOperationalModule(options.database, 'session-ownership'));
  const workspaceRoot = options.workspaceRoot;
  const orchestratorCwd = options.orchestratorCwd;
  const sessionArchived = options.sessionArchived;
  const registry = options.registry;
  const botNetwork = options.botNetwork;
  const requireExecution = options.requireExecution;
  const routeRests = options.routeRests;
  const inheritedModelPlan = options.inheritedModelPlan;
  const groupFallback = options.groupFallback;
  const sessionRoute = options.sessionRoute;
  const engineFallback = options.engineFallback;
  const team = options.team;
  const requireModelRoute = options.requireModelRoute;
  const requireAssignmentEngine = options.requireAssignmentEngine;
  const channels = options.channels;
  const groupSendReview = new GroupSendReview(
    attachOperationalModule(options.database, 'channel-send-review'),
    options.now,
    options.channels.projectMessageAttachments,
    (message) =>
      message.attachments?.map((ref) => {
        if (!options.attachments) throw new Error('Attachment owner is unavailable for review');
        return options.attachments.contentVersion(ref);
      }) ?? [],
  );

  return {
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
    onTobDelegation,
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
    closed: () => closed,
    markClosed: () => {
      closed = true;
    },
  };
}
