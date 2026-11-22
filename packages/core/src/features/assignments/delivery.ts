import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { AssignmentRow } from './events-types.js';
import type { AssignmentActivity } from '@botharness/host-protocol/wire';
import { AssignmentInboxAcceptanceUncertainError } from '../../runtime/assignment-delivery.js';
import type { ModelRoute } from '../../models/presets.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type {
  BotAgentAdapter,
  AssignmentSummary,
  AssignmentRequestDelivery,
  AssignmentAgentRun,
  AssignmentRequestOutcome,
  AssignmentCapacityRefusal,
  InterruptedToolCall,
} from '../../runtime/bot-runtime.js';

export function createAssignmentDelivery({
  assignmentCapacityRefusal,
  requireAssignmentSummary,
  setStopState,
  setActivity,
  groupContinuations,
  agents,
  interruptedTools,
  publishAssignmentRefusal,
  now,
  database,
  assignmentAcceptances,
  trackAssignmentRun,
}: {
  assignmentCapacityRefusal: (
    action: 'created' | 'awakened',
  ) => AssignmentCapacityRefusal | undefined;
  requireAssignmentSummary: (botSlug: string, sessionId: string) => AssignmentSummary;
  setStopState: (
    botSlug: string,
    sessionId: string,
    from: 'running' | 'stopped',
    to: 'running' | 'stopped',
    activity?: AssignmentRow['activity'],
  ) => void;
  setActivity: (sessionId: string, activity: AssignmentActivity) => void;
  groupContinuations: Map<string, { error?: unknown; refreshing: boolean }>;
  agents: Pick<BotAgentAdapter, 'requestAssignment'>;
  interruptedTools: Pick<Map<string, InterruptedToolCall[]>, 'delete'>;
  publishAssignmentRefusal: (row: AssignmentRow, error: unknown) => void;
  now: () => Date;
  database: OperationalDatabaseModulePort;
  assignmentAcceptances: Set<string>;
  trackAssignmentRun: (
    sessionId: string,
    task: (beginProcessing: () => void) => Promise<void>,
    failure: () => { activity: 'idle' | 'error'; answerTo?: string },
    awaitAcceptance: boolean,
  ) => void;
}) {
  function deliverAssignmentRequest({
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
  }: {
    bot: PersonaBotRecord;
    input: { sessionId: string; model?: ModelRoute };
    row: AssignmentRow;
    stopped: AssignmentRow | undefined;
    recovering: boolean;
    settledActivity: 'idle' | 'error';
    run: AssignmentAgentRun;
    interrupted: InterruptedToolCall[] | undefined;
    modelRoute: ModelRoute | undefined;
    trackDelivery: ((sessionId: string, pending: boolean) => void) | undefined;
  }): AssignmentRequestOutcome {
    const waking = row.activity === 'idle' || recovering;
    if (waking) {
      const refusal = assignmentCapacityRefusal('awakened');
      if (refusal !== undefined) {
        return {
          ...refusal,
          assignment: requireAssignmentSummary(bot.slug, input.sessionId),
          delivery: 'capacity',
        };
      }
      if (stopped !== undefined)
        setStopState(bot.slug, input.sessionId, 'stopped', 'running', 'working');
      else setActivity(input.sessionId, 'working');
    }
    let delivery: AssignmentRequestDelivery;
    const previousContinuation = groupContinuations.get(input.sessionId);
    try {
      delivery = agents.requestAssignment(run);
      if (interrupted !== undefined) interruptedTools.delete(input.sessionId);
    } catch (error) {
      const uncertain = error instanceof AssignmentInboxAcceptanceUncertainError;
      if (uncertain) setActivity(input.sessionId, 'error');
      else if (waking) setActivity(input.sessionId, settledActivity);
      if (stopped !== undefined && !uncertain)
        setStopState(bot.slug, input.sessionId, 'running', 'stopped', stopped.activity);
      publishAssignmentRefusal(row, error);
      throw error;
    }
    const settleAcceptance = () => {
      const at = now().toISOString();
      database.transaction(
        (database) => {
          if (row.open_ask_source_event_id !== null) {
            database
              .prepare(
                `UPDATE assignments
              SET open_ask_source_event_id = NULL, open_ask_at = NULL, updated_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = 'running'
                AND open_ask_source_event_id = ?`,
              )
              .run(at, input.sessionId, bot.slug, row.open_ask_source_event_id);
          }
          if (input.model !== undefined) {
            database
              .prepare(
                `UPDATE assignments
              SET model_route_json = ?, model_group_id = NULL, model_effort = NULL, updated_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = 'running'`,
              )
              .run(
                JSON.stringify(
                  run.routingTarget?.kind === 'route' ? run.routingTarget : modelRoute,
                ),
                at,
                input.sessionId,
                bot.slug,
              );
          }
        },
        ['assignments'],
      );
    };
    if (delivery.delivery === 'followup') {
      assignmentAcceptances.add(input.sessionId);
      trackDelivery?.(input.sessionId, true);
      let accepted = false;
      let uncertain = false;
      void delivery.done.catch(() => undefined);
      trackAssignmentRun(
        input.sessionId,
        async (beginProcessing) => {
          try {
            await delivery.accepted;
          } catch (error) {
            uncertain = error instanceof AssignmentInboxAcceptanceUncertainError;
            assignmentAcceptances.delete(input.sessionId);
            throw error;
          }
          assignmentAcceptances.delete(input.sessionId);
          accepted = true;
          if (groupContinuations.get(input.sessionId) === previousContinuation)
            groupContinuations.delete(input.sessionId);
          settleAcceptance();
          beginProcessing();
          await delivery.done;
        },
        () => ({
          activity: !accepted && !uncertain && waking ? settledActivity : 'error',
          ...(!accepted && !uncertain && row.open_ask_source_event_id !== null
            ? { answerTo: row.open_ask_source_event_id }
            : {}),
        }),
        true,
      );
    } else {
      settleAcceptance();
      setActivity(input.sessionId, 'working');
    }
    return {
      assignment: requireAssignmentSummary(bot.slug, input.sessionId),
      delivery: delivery.delivery,
      acceptance: delivery.delivery === 'steer' ? 'accepted' : 'pending',
    };
  }
  return { deliverAssignmentRequest };
}
