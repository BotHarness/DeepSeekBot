import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord, SessionFailureProgress } from '../../channels/channel.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { isEngineId } from '../../engines/engine-session.js';
import {
  type ModelSwitch,
  routingTargetRestKey,
  unavailableRoutingEngine,
} from '../../models/group-fallback.js';
import {
  assignmentGroupOptionOf,
  type ModelRoute,
  resolveBotModelPlan,
} from '../../models/presets.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestMode,
  AssignmentRequestOutcome,
  BotRuntimeOptions,
} from '../../runtime/bot-runtime.js';
import {
  createOrchestratorContinuation,
  MAX_MIXED_GROUP_ATTEMPTS,
  RouteRestingError,
  RoutingGroupUnavailableError,
  routingTargetKey,
} from '../../runtime/orchestrator-continuation.js';
import {
  directSessionTarget,
  type sessionModelChoices,
} from '../../runtime/session-model-choices.js';
import { recordTurnTarget } from '../../runtime/turn-targets.js';
import type { AssignmentRow } from './events-types.js';
import type { createAssignmentReporting } from './reporting.js';
import {
  assignmentTargetFromRow,
  isArchivedRow,
  modelRouteFromRow,
  saveAssignmentTarget,
} from './runtime-records.js';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import { engineAccountKey } from '@botharness/host-protocol/subscription-engine';
import type { TurnTargetSwitchReason } from '@botharness/host-protocol/turn-target';
import type { AssignmentActivity } from '@botharness/host-protocol/wire';
import { randomUUID } from 'node:crypto';

const ASSIGNMENT_FALLBACK_NOTE =
  'The previous model stopped before finishing this Turn (out of quota or unavailable). The Host moved this Session to the next model in its Routing Group. Continue the work from where it stopped.';

const ASSIGNMENT_MODEL_CHANGE_NOTE =
  'Continue the work from where it stopped, using the selected model.';

const sameModelRoute = (left: ModelRoute, right: ModelRoute) =>
  left.provider === right.provider &&
  left.model === right.model &&
  (left.reasoningEffort ?? '') === (right.reasoningEffort ?? '');

interface AssignmentRoutingPorts {
  activeSessionModels: Map<string, SessionModelChoice | null>;
  appendModelSwitch: (
    botSlug: string,
    sessionId: string,
    channelId: string | undefined,
    choice: ModelSwitch,
  ) => Promise<void>;
  assignmentDmChannel: (row: AssignmentRow) => ChannelRecord | undefined;
  assignmentReporting: Pick<
    ReturnType<typeof createAssignmentReporting>,
    'recordUnsuccessfulAssignment'
  >;
  assignmentRow: (botSlug: string | undefined, sessionId: string) => AssignmentRow | undefined;
  assignmentRuns: Map<string, Promise<void>>;
  closed: () => boolean;
  routingTargetFailure: ReturnType<typeof createOrchestratorContinuation>['routingTargetFailure'];
  database: OperationalDatabaseModulePort;
  groupContinuations: Map<string, { error?: unknown; refreshing: boolean }>;
  groupFallback: BotRuntimeOptions['groupFallback'];
  inheritedModelPlan: BotRuntimeOptions['inheritedModelPlan'];
  now: () => Date;
  pickSessionGroup: (
    botSlug: string,
    choice: Extract<SessionModelChoice, { kind: 'group' }>,
    attempted?: ReadonlySet<string>,
  ) => Promise<import('../../models/group-fallback.js').MixedGroupPick>;
  publishSessionFailure: (input: {
    channelId: string;
    requestMessageId?: string;
    botSlug: string;
    sessionId: string;
    role: 'orchestrator' | 'assignment';
    error: unknown;
    context?: string;
    assignmentAnswerTo?: string;
    progress?: SessionFailureProgress | undefined;
    autoContinue?: { attempt: number; maxAttempts: number; at: string };
  }) => Promise<void>;
  refreshAssignmentRoute: (
    botSlug: string,
    sessionId: string,
    allowStopped?: boolean,
  ) => Promise<ModelRoute | undefined>;
  registry: PersonaBotRegistry;
  requestAssignment: (
    bot: PersonaBotRecord,
    input: {
      sessionId: string;
      mode: AssignmentRequestMode;
      text: string;
      answerTo?: string;
      model?: ModelRoute;
    },
    trackDelivery?: (sessionId: string, pending: boolean) => void,
    sourceEventId?: string,
    switchReason?: TurnTargetSwitchReason,
  ) => AssignmentRequestOutcome;
  requireExecution: BotRuntimeOptions['requireExecution'];
  requireModelRoute: BotRuntimeOptions['requireModelRoute'];
  routeRests: BotRuntimeOptions['routeRests'];
  sessionModels: ReturnType<typeof sessionModelChoices>;
  setActivity: (sessionId: string, activity: AssignmentActivity) => void;
  warn: BotRuntimeOptions['warn'];
}

export function createAssignmentRouting(ports: AssignmentRoutingPorts) {
  function assignmentEngineAccountUses(accountId: string): string[] {
    return ports.database.read((database) => {
      const rows = database
        .prepare(
          `SELECT session_id, json_extract(model_route_json, '$.engine') AS engine,
                  json_extract(model_route_json, '$.accountId') AS account_id
             FROM assignments
            WHERE model_group_id IS NULL
              AND json_extract(model_route_json, '$.kind') = 'engine'
              AND (account_id = ? OR account_id IS NULL)
            ORDER BY session_id`,
        )
        .all(accountId);
      return rows.flatMap(({ session_id, engine, account_id }) =>
        typeof session_id === 'string' &&
        isEngineId(engine) &&
        engineAccountKey(engine, typeof account_id === 'string' ? account_id : undefined) ===
          accountId
          ? [session_id]
          : [],
      );
    });
  }

  function assignmentModelSelection(
    botSlug: string,
    sessionId: string,
  ): Pick<AssignmentAgentRun, 'sessionModel' | 'observeTurnTarget'> {
    const request = randomUUID();
    return {
      observeTurnTarget: (turn, step, target, reason) =>
        recordTurnTarget(ports.database, sessionId, {
          turn,
          step,
          target,
          request,
          ...(reason === undefined ? {} : { switchReason: reason }),
        }),
      sessionModel: () => {
        const choice = ports.sessionModels.get(sessionId);
        ports.activeSessionModels.set(sessionId, choice);
        return {
          choice,
          finish: () => ports.activeSessionModels.delete(sessionId),
          apply: (run) => {
            if (choice === null) return run;
            const {
              modelRoute: _route,
              routingTarget: _target,
              selectGroupTarget: _select,
              groupEffort: _effort,
              groupSwitchReason: _groupReason,
              switchReason: _reason,
              failedTurn: _failure,
              ...rest
            } = run;
            const base: AssignmentAgentRun = {
              ...rest,
              failedTurn: (execution) =>
                ports.assignmentReporting.recordUnsuccessfulAssignment(
                  botSlug,
                  sessionId,
                  execution,
                  'failed',
                ),
            };
            if (choice.kind !== 'group') {
              const target = directSessionTarget(choice);
              if (target.kind === 'route') ports.requireModelRoute?.(botSlug, target.route);
              return {
                ...base,
                routingTarget: target,
                ...(target.kind === 'route' ? { modelRoute: target.route } : {}),
              };
            }
            let current: RoutingTarget | undefined;
            let reason: TurnTargetSwitchReason | undefined;
            return {
              ...base,
              ...(choice.effort === undefined ? {} : { groupEffort: choice.effort }),
              groupSwitchReason: () => reason,
              selectGroupTarget: async (attempted, error) => {
                const rest =
                  current === undefined || error === undefined
                    ? undefined
                    : ports.routingTargetFailure(current, error);
                if (error !== undefined && rest === undefined && !unavailableRoutingEngine(error))
                  throw error instanceof Error
                    ? error
                    : new Error('Assignment failed', { cause: error });
                const next = await ports.pickSessionGroup(botSlug, choice, attempted);
                if (next.kind === 'exhausted')
                  throw new RouteRestingError(next.rests, next.subscription);
                if (
                  next.kind !== 'target' ||
                  attempted.size >= MAX_MIXED_GROUP_ATTEMPTS ||
                  attempted.has(routingTargetRestKey(next.target))
                )
                  throw new RoutingGroupUnavailableError(error);
                current = next.target;
                reason =
                  next.switchReason ??
                  rest?.reason ??
                  (error === undefined ? undefined : 'credential');
                return current;
              },
            };
          },
        };
      },
    };
  }

  function assignmentGroupExecution(
    botSlug: string,
    sessionId: string,
    groupId: string | null | undefined,
    effort: string | null | undefined,
  ): Pick<AssignmentAgentRun, 'selectGroupTarget' | 'groupEffort' | 'groupSwitchReason'> {
    const groups = ports.groupFallback;
    if (groupId == null || !groups?.pickMixedAssignment) return {};
    const row = ports.assignmentRow(botSlug, sessionId);
    if (
      groups.isMixed?.(groupId) !== true &&
      (row === undefined || assignmentTargetFromRow(row)?.kind !== 'engine')
    )
      return {};
    let reason: TurnTargetSwitchReason | undefined;
    return {
      groupSwitchReason: () => reason,
      ...(effort == null ? {} : { groupEffort: effort }),
      selectGroupTarget: async (attempted, error) => {
        const row = ports.assignmentRow(botSlug, sessionId);
        if (
          row?.stop_state !== 'running' ||
          row.model_group_id !== groupId ||
          isArchivedRow(row) ||
          ports.closed()
        )
          return undefined;
        const current = assignmentTargetFromRow(row);
        const rest =
          error === undefined || current === undefined
            ? undefined
            : ports.routingTargetFailure(current, error);
        if (
          error !== undefined &&
          rest === undefined &&
          !(current?.kind === 'engine' && unavailableRoutingEngine(error))
        )
          throw error instanceof Error ? error : new Error('Assignment failed', { cause: error });
        ports.requireExecution?.(botSlug);
        const mixed = await groups.pickMixedAssignment?.(
          botSlug,
          groupId,
          effort ?? undefined,
          attempted,
        );
        const native =
          mixed === undefined
            ? await groups.pick(botSlug, groupId, effort ?? undefined)
            : undefined;
        const next =
          native?.kind === 'route'
            ? {
                kind: 'target' as const,
                target: { kind: 'route' as const, route: native.route },
                switchReason: native.switchReason,
              }
            : mixed;
        if (next?.kind === 'exhausted') throw new RouteRestingError(next.rests, next.subscription);
        if (next?.kind !== 'target' || attempted.size >= MAX_MIXED_GROUP_ATTEMPTS)
          throw new RoutingGroupUnavailableError(error);
        const target = next.target;
        reason =
          next.switchReason ?? rest?.reason ?? (error === undefined ? undefined : 'credential');
        const serialized = saveAssignmentTarget(target);
        if (serialized === row.model_route_json) {
          const latest = ports.assignmentRow(botSlug, sessionId);
          return latest?.stop_state === 'running' &&
            latest.model_group_id === groupId &&
            latest.model_route_json === row.model_route_json &&
            !isArchivedRow(latest) &&
            !ports.closed()
            ? target
            : undefined;
        }
        const written = ports.database.transaction(
          (db) =>
            db
              .prepare(
                `UPDATE assignments SET model_route_json = ?, updated_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = 'running' AND archived_at IS NULL
              AND model_group_id = ? AND model_route_json IS ?`,
              )
              .run(
                serialized,
                ports.now().toISOString(),
                sessionId,
                botSlug,
                groupId,
                row.model_route_json,
              ),
          ['assignments'],
        );
        if (written.changes === 0) return undefined;
        if (current !== undefined && error !== undefined)
          await ports.appendModelSwitch(botSlug, sessionId, undefined, {
            kind: 'switch',
            from: routingTargetKey(current),
            to: routingTargetKey(target),
            reason: rest?.reason ?? 'credential',
            ...(rest === undefined ? {} : { until: rest.until }),
          });
        return target;
      },
    };
  }

  function assignmentFailed(
    botSlug: string,
    sessionId: string,
    execution: { turn: number; endSeq: number },
  ): void {
    const row = ports.assignmentRow(botSlug, sessionId);
    const current = row === undefined ? undefined : modelRouteFromRow(row);
    if (
      row?.model_group_id == null ||
      ports.groupFallback?.isMixed?.(row.model_group_id) === true ||
      current === undefined ||
      ports.groupFallback === undefined ||
      ports.routeRests?.restingUntil(current) === undefined
    ) {
      ports.assignmentReporting.recordUnsuccessfulAssignment(
        botSlug,
        sessionId,
        execution,
        'failed',
      );
      return;
    }
    const continuation = { refreshing: false };
    ports.groupContinuations.set(sessionId, continuation);
    void continueOnGroup(botSlug, sessionId, current, execution, continuation).finally(() => {
      if (ports.groupContinuations.get(sessionId) === continuation)
        ports.groupContinuations.delete(sessionId);
    });
  }

  async function continueOnGroup(
    botSlug: string,
    sessionId: string,
    failed: ModelRoute,
    execution: { turn: number; endSeq: number },
    continuation: { error?: unknown; refreshing: boolean },
  ): Promise<void> {
    const ownsContinuation = () => ports.groupContinuations.get(sessionId) === continuation;
    const runningAssignment = () => {
      if (!ownsContinuation() || ports.assignmentRuns.has(sessionId)) return undefined;
      const row = ports.assignmentRow(botSlug, sessionId);
      return row?.stop_state === 'running' && !isArchivedRow(row) ? row : undefined;
    };
    const fail = (error: unknown) => {
      const row = runningAssignment();
      if (row === undefined) return;
      ports.assignmentReporting.recordUnsuccessfulAssignment(
        botSlug,
        sessionId,
        execution,
        'failed',
      );
      ports.setActivity(sessionId, 'error');
      const channel = ports.assignmentDmChannel(row);
      if (channel === undefined) return;
      void ports
        .publishSessionFailure({
          channelId: channel.id,
          botSlug,
          sessionId,
          role: 'assignment',
          error,
          context: row.title,
        })
        .catch((publicationError: unknown) => {
          const code =
            publicationError instanceof Error &&
            'code' in publicationError &&
            typeof publicationError.code === 'string' &&
            /^(?:ERR_|SQLITE_|E[A-Z])[A-Z0-9_]{1,40}$/u.test(publicationError.code)
              ? publicationError.code
              : 'unknown';
          ports.warn?.(
            JSON.stringify({
              component: 'bot-runtime',
              event: 'assignment-failure-publication',
              phase: 'failed',
              botSlug,
              session: sessionId,
              code,
            }),
          );
        });
    };
    try {
      await Promise.resolve();
      const running = ports.assignmentRuns.get(sessionId);
      if (running !== undefined) await running.catch(() => undefined);
      if (!ownsContinuation()) return;
      continuation.refreshing = true;
      const cause = continuation.error ?? new Error('The Assignment model stopped');
      const restReason = ports.routeRests?.restingUntil(failed)?.reason;
      const next = await ports.refreshAssignmentRoute(botSlug, sessionId);
      const bot = ports.registry.get(botSlug);
      const row = runningAssignment();
      if (row === undefined) return;
      if (next === undefined || sameModelRoute(next, failed) || bot === undefined) {
        fail(cause);
        return;
      }
      const request = ports.requestAssignment(
        bot,
        {
          sessionId,
          mode: 'next-turn',
          text:
            row.model_group_id == null ? ASSIGNMENT_MODEL_CHANGE_NOTE : ASSIGNMENT_FALLBACK_NOTE,
        },
        undefined,
        undefined,
        restReason ?? ports.routeRests?.restingUntil(failed)?.reason,
      );
      if (request.delivery === 'refused' || request.delivery === 'capacity') fail(cause);
    } catch (error) {
      fail(continuation.error ?? error);
    }
  }

  async function refreshAssignmentRoute(
    botSlug: string,
    sessionId: string,
    allowStopped = false,
  ): Promise<ModelRoute | undefined> {
    const row = ports.assignmentRow(botSlug, sessionId);
    const groupId = row?.model_group_id;
    const current = row === undefined ? undefined : modelRouteFromRow(row);
    if (
      row === undefined ||
      groupId == null ||
      ports.groupFallback?.isMixed?.(groupId) === true ||
      current === undefined ||
      ports.groupFallback === undefined ||
      isArchivedRow(row) ||
      (row.stop_state !== 'running' && !(allowStopped && row.stop_state === 'stopped'))
    )
      return current;
    const rest = ports.routeRests?.restingUntil(current);
    if (rest === undefined) return current;
    const keepLegacyEffort =
      row.model_effort == null &&
      (assignmentGroupOptionOf(
        resolveBotModelPlan(ports.registry.get(botSlug) ?? {}, () => ports.inheritedModelPlan?.()),
        groupId,
      )?.allowedEfforts?.includes(current.reasoningEffort ?? '') ??
        (groupId === ports.groupFallback.inherited() &&
          current.reasoningEffort !== undefined &&
          current.reasoningEffort === ports.groupFallback.inheritedEffort()));
    const effort = row.model_effort ?? (keepLegacyEffort ? current.reasoningEffort : undefined);
    const pick = await ports.groupFallback.pick(botSlug, groupId, effort);
    const readCurrentRoute = () => {
      const latest = ports.assignmentRow(botSlug, sessionId);
      return latest === undefined ? undefined : modelRouteFromRow(latest);
    };
    if (pick.kind !== 'route' || sameModelRoute(pick.route, current)) return readCurrentRoute();
    const { reasoningEffort: memberEffort, ...member } = pick.route;
    const reasoningEffort =
      keepLegacyEffort && memberEffort !== undefined ? current.reasoningEffort : memberEffort;
    const route = reasoningEffort === undefined ? member : { ...member, reasoningEffort };
    const at = ports.now().toISOString();
    const written = ports.database.transaction(
      (database) =>
        database
          .prepare(
            `UPDATE assignments SET model_route_json = ?, updated_at = ?
              WHERE session_id = ? AND bot_slug = ? AND stop_state = ? AND archived_at IS NULL
                AND model_group_id = ? AND model_route_json = ?`,
          )
          .run(
            JSON.stringify(route),
            at,
            sessionId,
            botSlug,
            row.stop_state,
            groupId,
            row.model_route_json,
          ),
      ['assignments'],
    );
    if (written.changes === 0) return readCurrentRoute();
    const choice: ModelSwitch = {
      kind: 'switch',
      from: { provider: current.provider, model: current.model },
      to: route,
      reason: rest.reason ?? 'quota',
      until: rest.until,
    };
    ports.warn?.(
      JSON.stringify({
        component: 'bot-runtime',
        event: 'model-fallback',
        botSlug,
        session: sessionId,
        from: `${choice.from.provider}/${choice.from.model}`,
        to: `${choice.to.provider}/${choice.to.model}`,
      }),
    );
    await ports.appendModelSwitch(botSlug, sessionId, undefined, choice);
    return route;
  }

  return {
    assignmentEngineAccountUses,
    assignmentModelSelection,
    assignmentGroupExecution,
    assignmentFailed,
    refreshAssignmentRoute,
  };
}
