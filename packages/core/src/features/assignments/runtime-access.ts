import type { createAssignmentReporting } from './reporting.js';
import type { createAssignmentEvents } from './events.js';
import { requireSourceEffects } from '../../purge/fence.js';
import { type PersonaBotRecord } from '../../bots/persona-bot.js';
import { type OperationalDatabaseModulePort } from '../../database/owner.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { createAssignmentExecution } from './runtime-execution.js';
import type { createAssignmentIntake } from './runtime-intake.js';
import { queryAssignmentDirectory } from './runtime-records.js';
import type { createRuntimeAdmissions } from '../activity/runtime-admissions.js';
import { SESSION_STOPPED_REFUSAL } from '../sessions/runtime-orchestrator-turns.js';
import type { BotRuntime, BotRuntimeOptions } from '../../runtime/bot-runtime-types.js';
import type { OrchestratorAssignmentAccess } from './runtime-types.js';
import type { createAssignmentRouting } from './runtime-routing.js';
import type { createRuntimeAssignmentLifecycle } from './runtime-lifecycle.js';

interface RuntimeAssignmentAccessPorts {
  database: OperationalDatabaseModulePort;
  stoppedTurns: ReadonlySet<string>;
  pendingDeliveries: Map<string, string>;
  grants: WorkspaceGrantStore | undefined;
  readAssignmentTail: BotRuntimeOptions['readAssignmentTail'];
  assignmentEvents: ReturnType<typeof createAssignmentEvents>;
  assignmentExecution: ReturnType<typeof createAssignmentExecution>;
  assignmentReporting: ReturnType<typeof createAssignmentReporting>;
  assignmentIntake: ReturnType<typeof createAssignmentIntake>;
  refreshAssignmentRoute: ReturnType<typeof createAssignmentRouting>['refreshAssignmentRoute'];
  listAssignments: BotRuntime['listAssignments'];
  getAssignment: BotRuntime['getAssignment'];
  markSideEffectStarted: ReturnType<typeof createRuntimeAdmissions>['markSideEffectStarted'];
  stopAssignment: ReturnType<typeof createRuntimeAssignmentLifecycle>['stopAssignment'];
}

export function createRuntimeAssignmentAccess(ports: RuntimeAssignmentAccessPorts) {
  const {
    database,
    stoppedTurns,
    pendingDeliveries,
    grants,
    readAssignmentTail,
    assignmentEvents,
    assignmentExecution,
    assignmentReporting,
    assignmentIntake,
    refreshAssignmentRoute,
    listAssignments,
    getAssignment,
    markSideEffectStarted,
    stopAssignment,
  } = ports;

  function assignmentAccess(
    bot: PersonaBotRecord,
    sourceEventId: string | undefined,
    markAttemptSideEffect: () => void = () => {
      if (sourceEventId !== undefined) markSideEffectStarted(sourceEventId);
    },
    orchestratorSessionId?: string,
    readAdmissions?: Set<string>,
  ): OrchestratorAssignmentAccess {
    const markSideEffect = markAttemptSideEffect;
    const refuseStopped = () => {
      if (orchestratorSessionId !== undefined && stoppedTurns.has(bot.slug))
        throw new Error(SESSION_STOPPED_REFUSAL);
    };
    const trackDelivery = (sessionId: string, pending: boolean) => {
      if (orchestratorSessionId === undefined) return;
      if (pending) pendingDeliveries.set(sessionId, orchestratorSessionId);
      else pendingDeliveries.delete(sessionId);
    };
    return {
      create: (input) => {
        if (sourceEventId === undefined)
          throw new Error('Assignment creation requires a Source Event');
        refuseStopped();
        database.read((db) => requireSourceEffects(db, sourceEventId, bot.slug));
        const outcome = assignmentIntake.createOrReuseAssignment(
          bot,
          sourceEventId,
          input,
          trackDelivery,
        );
        if (outcome.outcome === 'created' || outcome.outcome === 'reused') {
          markSideEffect();
          assignmentEvents.linkRequestAssignment(sourceEventId, outcome.assignment.sessionId);
        }
        return outcome;
      },
      refreshRoute: (sessionId) => refreshAssignmentRoute(bot.slug, sessionId, true),
      grants: () => grants?.list(bot.slug) ?? [],
      list: () => listAssignments(bot.slug),
      query: (input) => queryAssignmentDirectory(listAssignments(bot.slug), input),
      archive: (sessionId) => assignmentExecution.archiveAssignment(bot, sessionId, markSideEffect),
      unarchive: (sessionId) =>
        assignmentExecution.unarchiveAssignment(bot, sessionId, markSideEffect),
      inspect: (sessionId) => getAssignment(bot.slug, sessionId),
      tail: async (sessionId) => {
        if (getAssignment(bot.slug, sessionId) === undefined)
          throw new Error(`Unknown Assignment Session: ${sessionId}`);
        if (readAssignmentTail === undefined) throw new Error('DSH Session Query is unavailable');
        return readAssignmentTail(sessionId);
      },
      reportPage: (request) => assignmentReporting.reportPage(bot.slug, request),
      request: (input) => {
        refuseStopped();
        if (sourceEventId !== undefined)
          database.read((db) => requireSourceEffects(db, sourceEventId, bot.slug));
        const outcome = assignmentIntake.requestAssignment(
          bot,
          input,
          trackDelivery,
          sourceEventId,
        );
        if (outcome.delivery !== 'capacity' && outcome.delivery !== 'refused') {
          markSideEffect();
          if (sourceEventId !== undefined)
            assignmentEvents.linkRequestAssignment(sourceEventId, input.sessionId);
        }
        return outcome;
      },
      wait: (sessionId, signal, timeoutMs) =>
        assignmentEvents.wait(
          bot,
          orchestratorSessionId,
          readAdmissions,
          sessionId,
          signal,
          timeoutMs,
        ),
      stop: (sessionId) => stopAssignment(bot, sessionId, markSideEffect),
    };
  }

  return { assignmentAccess };
}
