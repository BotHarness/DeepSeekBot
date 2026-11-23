import type { createChannelAdmission } from '../channels/runtime-admission.js';
import type { ChannelStore } from '../channels/store.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { createActivityEvents } from '../features/activity/events.js';
import type { createRuntimeAdmissionRecovery } from '../features/activity/runtime-admission-recovery.js';
import type { createAssignmentEvents } from '../features/assignments/events.js';
import type { createGroupDigest } from './group-digest.js';
import { type TobCliRequestLease } from '../features/tob/cli-runtime.js';
import type { createOrchestratorScheduling } from './orchestrator-scheduling.js';
import type { createOrchestratorContinuation } from './orchestrator-continuation.js';
import { AssignmentApprovalCapacity } from './assignment-approval-capacity.js';
import type { MessagingProcessing } from '../messaging/typing.js';
import { type InboxHistoryQuery } from './inbox-history.js';
import type { BotAgentAdapter } from '../features/sessions/agent-run-types.js';

interface BotRuntimeLifecyclePorts {
  closed: () => boolean;
  markClosed: () => void;
  tobCliRequests: ReadonlyMap<string, TobCliRequestLease>;
  inboxHistory: InboxHistoryQuery;
  approvalCapacity: AssignmentApprovalCapacity;
  waitLifetime: AbortController;
  typingTurns: Map<string, MessagingProcessing>;
  typingAssignments: Map<string, MessagingProcessing>;
  digestTimers: Map<string, NodeJS.Timeout>;
  completionDigestTimers: Map<string, NodeJS.Timeout>;
  snoozeTimers: Map<string, NodeJS.Timeout>;
  continuation: Pick<ReturnType<typeof createOrchestratorContinuation>, 'clearAutoContinues'>;
  groupAdmissionRetries: Map<string, NodeJS.Timeout>;
  digestRetryAt: Map<string, number>;
  digestFailureCount: Map<string, number>;
  scheduling: Pick<ReturnType<typeof createOrchestratorScheduling>, 'clearInboxFactoryRetries'>;
  tails: Map<string, Promise<unknown>>;
  assignmentRuns: Map<string, Promise<void>>;
  assignmentAcceptances: Set<string>;
  assignmentNotices: Set<Promise<void>>;
  steerSettlements: ReadonlySet<Promise<void>>;
  agents: BotAgentAdapter;
}

export function createBotRuntimeLifecycle(ports: BotRuntimeLifecyclePorts) {
  const {
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
  } = ports;

  async function whenIdle(): Promise<void> {
    for (;;) {
      const pending = [
        ...tails.values(),
        ...assignmentRuns.values(),
        ...assignmentNotices,
        ...steerSettlements,
      ];
      if (pending.length === 0) return;
      await Promise.allSettled(pending);
    }
  }

  async function close(): Promise<void> {
    if (closed()) return;
    markClosed();
    for (const request of tobCliRequests.values()) request.controller.abort();
    inboxHistory.clear();
    approvalCapacity.close();
    waitLifetime.abort(new Error('Bot Runtime closed'));
    await Promise.allSettled(
      [...typingTurns.values(), ...typingAssignments.values()].map((processing) =>
        processing.stop(),
      ),
    );
    typingTurns.clear();
    typingAssignments.clear();
    for (const timer of digestTimers.values()) clearTimeout(timer);
    digestTimers.clear();
    for (const timer of completionDigestTimers.values()) clearTimeout(timer);
    completionDigestTimers.clear();
    for (const timer of snoozeTimers.values()) clearTimeout(timer);
    snoozeTimers.clear();
    continuation.clearAutoContinues();
    for (const timer of groupAdmissionRetries.values()) clearTimeout(timer);
    groupAdmissionRetries.clear();
    digestRetryAt.clear();
    digestFailureCount.clear();
    scheduling.clearInboxFactoryRetries();
    await Promise.allSettled([...tails.values(), ...assignmentRuns.values(), ...assignmentNotices]);
    tails.clear();
    assignmentRuns.clear();
    assignmentAcceptances.clear();
    assignmentNotices.clear();
    await agents.close();
  }

  return { whenIdle, close };
}

interface BotRuntimeRecoveryPorts {
  ready: () => boolean;
  admissionRecovery: Pick<
    ReturnType<typeof createRuntimeAdmissionRecovery>,
    'recoverInterruptedAttempts' | 'retireRevokedGroupRetries'
  >;
  channelAdmission: Pick<
    ReturnType<typeof createChannelAdmission>,
    'recoverPendingChannelAdmissions'
  >;
  channels: ChannelStore;
  continuation: Pick<
    ReturnType<typeof createOrchestratorContinuation>,
    'continueDmTurn' | 'rearmAutoContinues'
  >;
  groupDigest: Pick<ReturnType<typeof createGroupDigest>, 'recoverPendingDigests'>;
  assignmentEvents: Pick<
    ReturnType<typeof createAssignmentEvents>,
    'recoverPendingAssignmentReports'
  >;
  registry: PersonaBotRegistry;
  activityEvents: Pick<ReturnType<typeof createActivityEvents>, 'armSnooze'>;
}

export function createBotRuntimeRecovery({
  ready,
  admissionRecovery,
  channelAdmission,
  channels,
  continuation,
  groupDigest,
  assignmentEvents,
  registry,
  activityEvents,
}: BotRuntimeRecoveryPorts) {
  return function recoverAtStartup(): void {
    if (ready()) {
      const interruptedDms = admissionRecovery.recoverInterruptedAttempts();
      admissionRecovery.retireRevokedGroupRetries();
      channelAdmission.recoverPendingChannelAdmissions();
      for (const row of interruptedDms) {
        const channel = channels.get(row.channel_id);
        const botSlug = channel?.type === 'dm' ? channel.botSlug : undefined;
        if (botSlug === undefined) continue;
        const failure = channels.latestMessage(row.channel_id)?.sessionFailure;
        void continuation
          .continueDmTurn(botSlug, row.channel_id, row.message_id, {
            kind: 'host-restart',
            autoAttempts:
              failure?.requestMessageId === row.message_id
                ? (failure.autoContinue?.attempt ?? 0)
                : 0,
          })
          ?.catch(() => undefined);
      }
      continuation.rearmAutoContinues();
      groupDigest.recoverPendingDigests();
      assignmentEvents.recoverPendingAssignmentReports();
      for (const bot of registry.list()) activityEvents.armSnooze(bot.slug);
    }
  };
}
