import type { createOrchestratorScheduling } from '../../runtime/orchestrator-scheduling.js';
import type { createOrchestratorCancellation } from '../../runtime/orchestrator-cancellation.js';
import type { AssignmentRow } from './events-types.js';
import { AssignmentApprovalCapacity } from '../../runtime/assignment-approval-capacity.js';
import type { MessagingProcessing } from '../../messaging/typing.js';
import { type PersonaBotRecord } from '../../bots/persona-bot.js';
import { type OperationalDatabaseModulePort } from '../../database/owner.js';
import { type SessionOwnership } from '../../sessions/ownership.js';
import { type BotSourcePolicyStore } from '../../runtime/source-policy.js';
import type { createAssignmentExecution } from './runtime-execution.js';
import type { BotRuntimeOptions } from '../../runtime/bot-runtime-types.js';
import type { BotAgentAdapter } from '../sessions/agent-run-types.js';
import type { AssignmentSummary } from './runtime-types.js';

const HUMAN_SESSION_STOP_NOTICE =
  'The Human stopped this Assignment; it is now a Stopped Session with its history kept. Do not resend its old work just because it stopped. When a later request fits it, send_assignment_request to this Session id wakes it and delivers the request.';

const HUMAN_TURN_STOP_NOTICE =
  'Stopped by the Human together with your turn; it is now a Stopped Session with its history kept. Do not resend its old work just because it stopped. When a later request fits it, send_assignment_request to this Session id wakes it and delivers the request.';

const ORCHESTRATOR_STOP_NOTICE =
  'Stopped by the Orchestrator; it is now a Stopped Session with its history kept. When a later request fits it, send_assignment_request to this Session id wakes it and delivers the request.';

interface RuntimeAssignmentLifecyclePorts {
  agents: BotAgentAdapter;
  database: OperationalDatabaseModulePort;
  ownership: SessionOwnership;
  now: () => Date;
  createEventId: () => string;
  warn: BotRuntimeOptions['warn'];
  pendingDeliveries: Map<string, string>;
  typingAssignments: ReadonlyMap<string, MessagingProcessing>;
  assignmentRuns: ReadonlyMap<string, Promise<void>>;
  sourcePolicy: BotSourcePolicyStore;
  assignmentExecutionAvailable: ReturnType<
    typeof createAssignmentExecution
  >['assignmentExecutionAvailable'];
  assignmentCapacityRefusal: ReturnType<
    typeof createAssignmentExecution
  >['assignmentCapacityRefusal'];
  assignmentRow: ReturnType<typeof createAssignmentExecution>['assignmentRow'];
  requireAssignmentSummary: ReturnType<
    typeof createAssignmentExecution
  >['requireAssignmentSummary'];
  beginSessionStop: ReturnType<typeof createOrchestratorCancellation>['beginSessionStop'];
  settleStop: ReturnType<typeof createOrchestratorCancellation>['settleStop'];
  scheduleHarvest: ReturnType<typeof createOrchestratorScheduling>['scheduleHarvest'];
}

export function createRuntimeAssignmentLifecycle(ports: RuntimeAssignmentLifecyclePorts) {
  const {
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
    assignmentExecutionAvailable,
    assignmentCapacityRefusal,
    assignmentRow,
    requireAssignmentSummary,
    beginSessionStop,
    settleStop,
    scheduleHarvest,
  } = ports;

  const approvalCapacity = new AssignmentApprovalCapacity({
    valid: (sessionId) => assignmentExecutionAvailable(sessionId),
    available: () => assignmentCapacityRefusal('awakened') === undefined,
    releaseAllowed: (sessionId) => ownership.descendantsOf(sessionId).length === 0,
    changed: (sessionId, state, durationMs) => {
      database.transaction(
        (database) =>
          database
            .prepare(
              "UPDATE assignments SET updated_at = ? WHERE session_id = ? AND stop_state = 'running'",
            )
            .run(now().toISOString(), sessionId),
        ['assignments'],
      );
      warn?.(
        `botharness.assignment.approval_capacity session=${sessionId} initiator=native-approval phase=${state ?? 'running'} duration_ms=${durationMs}`,
      );
    },
  });

  async function stopAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
    cause: 'orchestrator-stop' | 'human-stop' | 'human-session-stop' = 'orchestrator-stop',
  ): Promise<AssignmentSummary> {
    const row = assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (row.stop_state === 'stopped') return requireAssignmentSummary(bot.slug, sessionId);
    if (agents.stopAssignment === undefined) throw new Error('Assignment stop is unavailable');
    markSideEffect();
    pendingDeliveries.delete(sessionId);
    beginSessionStop(bot.slug, sessionId, 'assignment');
    if (row.stop_state === 'running') {
      const at = now().toISOString();
      database.transaction(
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
    await typingAssignments.get(sessionId)?.stop();
    const stopAssignment = agents.stopAssignment.bind(agents);
    await settleStop(
      bot.slug,
      sessionId,
      (async () => {
        await stopAssignment(sessionId);
        await assignmentRuns.get(sessionId);
      })(),
    );
    const at = now().toISOString();
    const sourceEventId = createEventId();
    const stopped = database.transaction(
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
        const sourceRule = sourcePolicy.resolveIn(database, bot.slug, 'assignment-lifecycle');
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
    if (stopped) scheduleHarvest(bot.slug);
    return requireAssignmentSummary(bot.slug, sessionId);
  }

  function setStopState(
    botSlug: string,
    sessionId: string,
    from: 'running' | 'stopped',
    to: 'running' | 'stopped',
    activity: AssignmentRow['activity'] = 'idle',
  ): void {
    database.transaction(
      (database) => {
        database
          .prepare(
            `UPDATE assignments SET stop_state = ?, activity = ?, updated_at = ?
              WHERE bot_slug = ? AND session_id = ? AND stop_state = ?`,
          )
          .run(to, activity, now().toISOString(), botSlug, sessionId, from);
      },
      ['assignments'],
    );
    approvalCapacity.changed();
  }

  return { approvalCapacity, stopAssignment, setStopState };
}
