import type { AssignmentRow } from '../features/assignments/events-types.js';
import type { GroupSendReview } from '../channels/send-review.js';
import type { PersonaBotRecord } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type {
  BotRuntimeOptions,
  BotAgentAdapter,
  BotStopOutcome,
  SessionStopOutcome,
  StoppedSessionRef,
  InterruptedToolCall,
  AssignmentSummary,
  TobCliRequestLease,
} from './bot-runtime.js';
import type { PendingAutoContinue } from './orchestrator-continuation.js';
export function interruptedToolsNote(calls: readonly InterruptedToolCall[]): string {
  const lines = calls.map((call) => {
    const line = call.arguments.replace(/\s*[\r\n]+\s*/gu, ' ');
    const args = line.length > 300 ? `${line.slice(0, 300)}…` : line;
    return `- ${call.name} (call ${call.callId}): ${args}`;
  });
  return `[Host: the Human stopped this Session while these tool calls were still running. Each is recorded as stopped by the Human with an unknown result: it may or may not have taken effect. Check its effect before you redo any of them, and do not repeat a side effect blindly.\n${lines.join('\n')}]\n\n`;
}

interface OrchestratorCancellationPorts {
  activeTurns: Map<string, Promise<void>>;
  agents: BotAgentAdapter;
  assignmentAcceptances: Set<string>;
  assignmentRow: (botSlug: string | undefined, sessionId: string) => AssignmentRow | undefined;
  assignmentRuns: Map<string, Promise<void>>;
  cancelAutoContinue: (botSlug: string) => PendingAutoContinue | undefined;
  closed: () => boolean;
  closeSessionApprovals: BotRuntimeOptions['closeSessionApprovals'];
  currentOrchestratorSessionId: (botSlug: string) => string | undefined;
  database: OperationalDatabaseModulePort;
  groupSendReview: GroupSendReview;
  interruptedTools: Map<string, InterruptedToolCall[]>;
  memoryTurnOperations: Set<string>;
  now: () => Date;
  ownership: SessionOwnership;
  pendingDeliveries: Map<string, string>;
  pendingHarvests: Set<string>;
  registry: PersonaBotRegistry;
  stopAssignment: (
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
    cause?: 'orchestrator-stop' | 'human-stop' | 'human-session-stop',
  ) => Promise<AssignmentSummary>;
  stopNotices: Map<string, string>;
  stoppedTurns: Set<string>;
  stopSettleTimeoutMs: number;
  switchingRoutingGroups: Set<string>;
  tails: Map<string, Promise<unknown>>;
  tobCliRequests: Map<string, TobCliRequestLease>;
  turnSources: ReadonlyMap<string, { sessionId: string }>;
  warn: ((message: string) => void) | undefined;
}

export function createOrchestratorCancellation(ports: OrchestratorCancellationPorts) {
  function cancelTobCli(botSlug: string): boolean {
    let cancelled = false;
    for (const request of ports.tobCliRequests.values()) {
      if (
        request.botSlug !== botSlug ||
        request.status.state !== 'running' ||
        request.controller.signal.aborted
      )
        continue;
      request.status = { ...request.status, cancelRequested: true };
      request.controller.abort();
      cancelled = true;
    }
    return cancelled;
  }

  async function stopBot(botSlug: string): Promise<void> {
    cancelTobCli(botSlug);
    const owned = () =>
      ports.ownership
        .rootsFor(botSlug)
        .flatMap((root) => [
          root.sessionId,
          ...ports.ownership.descendantsOf(root.sessionId).map((child) => child.sessionId),
        ]);
    const sessionIds = owned();
    const active = [
      ports.tails.get(botSlug),
      ...sessionIds.map((id) => ports.assignmentRuns.get(id)),
    ].filter((run): run is Promise<void> => run !== undefined);
    if (ports.agents.stopBot === undefined && active.length > 0)
      throw new Error('Agent adapter cannot stop this Bot safely');
    ports.groupSendReview.stop(botSlug);
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            "UPDATE assignments SET stop_state = 'requested', updated_at = ? WHERE bot_slug = ? AND stop_state = 'running'",
          )
          .run(ports.now().toISOString(), botSlug);
      },
      ['assignments'],
    );
    await ports.agents.stopBot?.(botSlug, sessionIds);
    await Promise.allSettled(active);
    await ports.agents.stopBot?.(botSlug, owned());
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            "UPDATE assignments SET stop_state = 'stopped', activity = 'idle', continuity_key = NULL, updated_at = ? WHERE bot_slug = ? AND stop_state = 'requested'",
          )
          .run(ports.now().toISOString(), botSlug);
      },
      ['assignments'],
    );
    ports.pendingHarvests.delete(botSlug);
  }

  async function stopSession(botSlug: string, sessionId: string): Promise<SessionStopOutcome> {
    const bot = ports.registry.get(botSlug);
    const row = ports.assignmentRow(botSlug, sessionId);
    if (bot === undefined || row === undefined) {
      const owned =
        bot !== undefined &&
        ports.ownership
          .rootsFor(botSlug, 'orchestrator')
          .some((root) => root.sessionId === sessionId);
      if (!owned || bot === undefined)
        return {
          outcome: 'refused',
          code: 'unknown-session',
          message: `${sessionId} is not a Session of ${botSlug}`,
        };
      const ref: StoppedSessionRef = { botSlug, sessionId, role: 'orchestrator' };
      const current = ports.currentOrchestratorSessionId(botSlug);
      const cliStopped = current === sessionId && cancelTobCli(botSlug);
      const stopped =
        (current === undefined || current === sessionId) &&
        (await humanStopOrchestrator(
          bot,
          `[Host: the Human stopped your previous turn at ${ports.now().toISOString()} before it finished. Only your Orchestrator Session stopped; your Assignment Sessions keep running. Do not resume that work unless they ask again.]\n\n`,
        )) !== undefined;
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'session-stop',
          role: 'orchestrator',
          botSlug,
          sessionId,
          stopped: stopped || cliStopped,
        }),
      );
      return stopped || cliStopped
        ? { outcome: 'settled', stopped: [ref], alreadyIdle: [] }
        : { outcome: 'settled', stopped: [], alreadyIdle: [ref] };
    }
    const ref: StoppedSessionRef = { botSlug, sessionId, role: 'assignment' };
    if (!assignmentActive(row)) return { outcome: 'settled', stopped: [], alreadyIdle: [ref] };
    await ports.stopAssignment(bot, sessionId, () => undefined, 'human-session-stop');
    ports.warn?.(
      JSON.stringify({ component: 'bot-runtime', event: 'session-stop', botSlug, sessionId }),
    );
    return { outcome: 'settled', stopped: [ref], alreadyIdle: [] };
  }

  async function stopAllSessions(botSlug: string): Promise<BotStopOutcome> {
    const cliStopped = cancelTobCli(botSlug);
    const bot = ports.registry.get(botSlug);
    if (bot === undefined) return { stopped: [], alreadyIdle: [] };
    const orchestratorId = ports.currentOrchestratorSessionId(botSlug);
    const assignmentIds = activeAssignmentIds(botSlug);
    const turn = await humanStopOrchestrator(
      bot,
      `[Host: the Human stopped your previous turn at ${ports.now().toISOString()} before it finished${assignmentIds.length > 0 ? ', together with your running Assignment Sessions' : ''}. Do not resume that work unless they ask again.]\n\n`,
    );
    const stopped: StoppedSessionRef[] = [];
    const alreadyIdle: StoppedSessionRef[] = [];
    const orchestratorSession = turn?.sessionId ?? orchestratorId;
    if (orchestratorSession !== undefined)
      (turn !== undefined || cliStopped ? stopped : alreadyIdle).push({
        botSlug,
        sessionId: orchestratorSession,
        role: 'orchestrator',
      });
    if (ports.agents.stopAssignment !== undefined)
      for (const sessionId of assignmentIds) {
        try {
          await ports.stopAssignment(bot, sessionId, () => undefined, 'human-session-stop');
          stopped.push({ botSlug, sessionId, role: 'assignment' });
        } catch (error) {
          ports.warn?.(
            JSON.stringify({
              component: 'bot-runtime',
              event: 'human-stop-assignment-failed',
              botSlug,
              sessionId,
              error: String(error).slice(0, 500),
            }),
          );
        }
      }
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'human-stop',
        botSlug,
        turn: turn !== undefined,
        assignments: stopped.filter((ref) => ref.role === 'assignment').length,
      }),
    );
    return { stopped, alreadyIdle };
  }

  async function humanStopOrchestrator(
    bot: PersonaBotRecord,
    notice: string,
  ): Promise<{ sessionId: string } | undefined> {
    const orchestratorSessionId = ports.currentOrchestratorSessionId(bot.slug);
    if (orchestratorSessionId !== undefined)
      beginSessionStop(bot.slug, orchestratorSessionId, 'orchestrator');
    ports.groupSendReview.stop(bot.slug);
    const turn = await stopTurn(bot.slug, notice);
    if (turn !== undefined) await cancelPendingDeliveries(bot, turn.sessionId);
    return turn;
  }

  function assignmentActive(row: {
    stop_state: string;
    activity: string;
    session_id: string;
  }): boolean {
    return (
      row.stop_state === 'requested' ||
      (row.stop_state === 'running' &&
        (row.activity === 'working' ||
          ports.assignmentAcceptances.has(row.session_id) ||
          ports.assignmentRuns.has(row.session_id)))
    );
  }

  function activeAssignmentIds(botSlug: string): string[] {
    return (
      ports.database.read((database) =>
        database
          .prepare(
            `SELECT session_id, stop_state, activity FROM assignments
              WHERE bot_slug = ? AND stop_state IN ('running', 'requested')
              ORDER BY session_id`,
          )
          .all(botSlug),
      ) as unknown as Array<{ session_id: string; stop_state: string; activity: string }>
    )
      .filter((row) => assignmentActive(row))
      .map((row) => row.session_id);
  }

  async function stopTurn(
    botSlug: string,
    notice: string,
  ): Promise<{ sessionId: string } | undefined> {
    const turn = ports.turnSources.get(botSlug);
    const active = ports.activeTurns.get(botSlug);
    const waiting = ports.cancelAutoContinue(botSlug);
    if (waiting !== undefined && (turn === undefined || active === undefined))
      return ports.closed() ? undefined : { sessionId: waiting.sessionId };
    if (ports.closed() || turn === undefined || active === undefined) return undefined;
    const sessionId =
      ports.agents.stopOrchestratorTurn?.(botSlug) ??
      (ports.memoryTurnOperations.has(botSlug) || ports.switchingRoutingGroups.has(botSlug)
        ? turn.sessionId
        : undefined);
    if (sessionId === undefined) return undefined;
    ports.stoppedTurns.add(botSlug);
    ports.groupSendReview.stop(botSlug);
    ports.stopNotices.set(botSlug, notice);
    await settleStop(
      botSlug,
      sessionId,
      active.catch(() => undefined),
    );
    return { sessionId };
  }

  function beginSessionStop(
    botSlug: string,
    sessionId: string,
    role: 'orchestrator' | 'assignment',
  ): void {
    const tree = [
      sessionId,
      ...ports.ownership.descendantsOf(sessionId).map((child) => child.sessionId),
    ];
    try {
      ports.closeSessionApprovals?.(tree);
    } catch (error) {
      ports.warn?.(
        JSON.stringify({
          component: 'bot-runtime',
          event: 'stop-approvals-failed',
          botSlug,
          sessionId,
          error: String(error).slice(0, 500),
        }),
      );
    }
    if (role === 'orchestrator') ports.groupSendReview.stopOwner(`${botSlug}:${sessionId}`);
  }

  async function settleStop(
    botSlug: string,
    sessionId: string,
    settling: Promise<unknown>,
  ): Promise<void> {
    let timer: NodeJS.Timeout | undefined;
    let outcome: 'settled' | 'timeout';
    try {
      outcome = await Promise.race([
        settling.then(() => 'settled' as const),
        new Promise<'timeout'>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), ports.stopSettleTimeoutMs);
          timer.unref?.();
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
    if (outcome === 'settled') return;
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'stop-settle-timeout',
        botSlug,
        sessionId,
        timeoutMs: ports.stopSettleTimeoutMs,
      }),
    );
    if (ports.agents.abandonSession === undefined)
      throw new Error('Session stop timed out and abandonment is unavailable');
    await ports.agents.abandonSession(sessionId);
  }

  async function cancelPendingDeliveries(
    bot: PersonaBotRecord,
    orchestratorSessionId: string,
  ): Promise<number> {
    let cancelled = 0;
    for (const sessionId of [...ports.pendingDeliveries.keys()]) {
      if (ports.pendingDeliveries.get(sessionId) !== orchestratorSessionId) continue;
      ports.pendingDeliveries.delete(sessionId);
      try {
        await ports.stopAssignment(bot, sessionId, () => undefined, 'human-session-stop');
        cancelled += 1;
      } catch (error) {
        ports.warn?.(
          JSON.stringify({
            component: 'bot-runtime',
            event: 'stop-pending-delivery-failed',
            botSlug: bot.slug,
            sessionId,
            error: String(error).slice(0, 500),
          }),
        );
      }
    }
    return cancelled;
  }

  function recordInterruptedTools(
    botSlug: string,
    sessionId: string,
    calls: readonly InterruptedToolCall[],
  ): void {
    if (calls.length === 0) return;
    ports.interruptedTools.set(sessionId, [
      ...(ports.interruptedTools.get(sessionId) ?? []),
      ...calls,
    ]);
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'stop-interrupted-tools',
        botSlug,
        sessionId,
        result: 'unknown',
        stoppedBy: 'human',
        calls: calls.map((call) => ({ callId: call.callId, name: call.name })),
      }),
    );
  }

  function takeInterruptedToolsNote(sessionId: string): string {
    const calls = ports.interruptedTools.get(sessionId);
    if (calls === undefined) return '';
    ports.interruptedTools.delete(sessionId);
    return interruptedToolsNote(calls);
  }

  return {
    stopBot,
    stopSession,
    stopAllSessions,
    stopTurn,
    recordInterruptedTools,
    takeInterruptedToolsNote,
    beginSessionStop,
    settleStop,
  };
}
