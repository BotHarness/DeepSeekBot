import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelRecord, SessionFailureProgress } from '../../channels/channel.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { OutboundMessaging } from '../../messaging/outbound.js';
import type { MessagingProcessing } from '../../messaging/typing.js';
import { requireAssignmentSource, requireSourceEffects } from '../../purge/fence.js';
import type {
  AssignmentApprovalCapacity,
  AssignmentApprovalWaitLease,
  AssignmentExecutionWait,
} from '../../runtime/assignment-approval-capacity.js';
import { AssignmentInboxAcceptanceUncertainError } from '../../runtime/assignment-delivery.js';
import type {
  AssignmentAgentRun,
  AssignmentArchiveOutcome,
  AssignmentCapacityRefusal,
  AssignmentDetail,
  AssignmentSummary,
  BotAgentAdapter,
  BotRuntime,
  BotRuntimeOptions,
} from '../../runtime/bot-runtime.js';
import type { sessionModelChoices } from '../../runtime/session-model-choices.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import { botOwner } from '../../team/bot-access.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { createAssignmentRouting } from './runtime-routing.js';
import type { AssignmentRow } from './events-types.js';
import type { createAssignmentReporting } from './reporting.js';
import {
  assignmentFromRow,
  isArchivedRow,
  modelRouteFromRow,
  permissionFromRow,
  storedAssignmentTarget,
} from './runtime-records.js';
import type { AssignmentActivity, ChannelAssignmentSummary } from '@botharness/host-protocol/wire';

interface AssignmentExecutionPorts {
  agents: BotAgentAdapter;
  approvalCapacity: AssignmentApprovalCapacity;
  assignmentAcceptances: Set<string>;
  assignmentArchives: Set<string>;
  assignmentConcurrencyLimit: () => number;
  assignmentFailed: (
    botSlug: string,
    sessionId: string,
    execution: { turn: number; endSeq: number },
  ) => void;
  assignmentModelSelection: (
    botSlug: string,
    sessionId: string,
  ) => Pick<AssignmentAgentRun, 'sessionModel' | 'observeTurnTarget'>;
  assignmentNotices: Set<Promise<void>>;
  assignmentReporting: Pick<
    ReturnType<typeof createAssignmentReporting>,
    | 'recordCompletedAssignment'
    | 'recordEngineRecoveryFailure'
    | 'recordReport'
    | 'recordUnsuccessfulAssignment'
  >;
  assignmentRuns: Map<string, Promise<void>>;
  channels: ChannelStore;
  closed: () => boolean;
  database: OperationalDatabaseModulePort;
  externalMessaging: OutboundMessaging | undefined;
  getAssignment: BotRuntime['getAssignment'];
  grants: WorkspaceGrantStore | undefined;
  groupContinuations: Map<string, { error?: unknown; refreshing: boolean }>;
  nativeAssignmentSteps: Map<string, { step: Promise<boolean>; signal: AbortSignal }>;
  now: () => Date;
  ownership: SessionOwnership;
  preparedAssignments: Set<string>;
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
  refreshAssignmentRoute: ReturnType<typeof createAssignmentRouting>['refreshAssignmentRoute'];
  registry: PersonaBotRegistry;
  requireTurnAccess: (botSlug: string, ids: Iterable<string>) => void;
  sessionArchive: BotRuntimeOptions['sessionArchive'];
  sessionArchived: (sessionId: string) => boolean | undefined;
  sessionModels: ReturnType<typeof sessionModelChoices>;
  typingAssignments: Map<string, MessagingProcessing>;
  waitLifetime: AbortController;
  waitOptions: Pick<BotRuntimeOptions, 'database' | 'beginAssignmentWait'>;
  warn: BotRuntimeOptions['warn'];
}

export function createAssignmentExecution(ports: AssignmentExecutionPorts) {
  function latestAssignmentActivity(): ReadonlyMap<string, number> {
    return ports.database.read((database) => {
      const rows = database
        .prepare(
          `SELECT bot_slug, MAX(unixepoch(latest_report_at, 'subsec') * 1000) AS at
         FROM assignments WHERE latest_report_at IS NOT NULL GROUP BY bot_slug`,
        )
        .all();
      return new Map(
        rows.flatMap((row) =>
          typeof row['bot_slug'] === 'string' &&
          typeof row['at'] === 'number' &&
          Number.isFinite(row['at'])
            ? [[row['bot_slug'], row['at']]]
            : [],
        ),
      );
    });
  }

  function listAssignments(botSlug: string): AssignmentSummary[] {
    const rows = ports.database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, title, description, activity, stop_state,
                  latest_report_state, latest_report_summary, latest_report_at,
                  continuity_key, open_ask_source_event_id, open_ask_at,
                  grant_id, workspace_id, primary_cwd, permission_mode,
                  approval_policy, preset_revision, created_at, updated_at
                  , model_route_json, model_group_id, model_effort, agent_preset, archived_at, (SELECT body FROM source_events WHERE source_event_id = assignments.open_ask_source_event_id) AS open_ask_summary
             FROM assignments
            WHERE bot_slug = ?
            ORDER BY updated_at DESC, session_id ASC`,
        )
        .all(botSlug),
    ) as unknown as AssignmentRow[];
    return rows.map((row) => {
      const {
        botSlug: _botSlug,
        sourceEventId: _sourceEventId,
        ...summary
      } = assignmentFromRow(row);
      const executionWait = ports.approvalCapacity.state(row.session_id);
      return {
        ...summary,
        ...(executionWait === undefined ? {} : { executionWait }),
      };
    });
  }

  function listChannelAssignments(channelId: string): ChannelAssignmentSummary[] {
    const rows = ports.database.read((database) =>
      database
        .prepare(
          `SELECT a.session_id, a.source_event_id, a.bot_slug, a.title, a.description, a.activity, a.stop_state,
                  a.latest_report_state, a.latest_report_summary, a.latest_report_at,
                  a.continuity_key, a.open_ask_source_event_id, a.open_ask_at,
                  a.grant_id, a.workspace_id, a.primary_cwd, a.permission_mode,
                  a.approval_policy, a.preset_revision, a.created_at, a.updated_at,
                  a.model_route_json, a.model_group_id, a.model_effort, a.archived_at
             FROM assignments a
             JOIN source_events s ON s.source_event_id = a.source_event_id
            WHERE s.channel_id = ?
            ORDER BY a.updated_at DESC, a.session_id ASC
            LIMIT 200`,
        )
        .all(channelId),
    ) as unknown as AssignmentRow[];
    return rows.map((row) => {
      const assignment = assignmentFromRow(row);
      return {
        sessionId: assignment.sessionId,
        botSlug: assignment.botSlug,
        title: assignment.title,
        description: assignment.description,
        activity: assignment.activity,
        ...(assignment.latestReport === undefined ? {} : { latestReport: assignment.latestReport }),
        ...(assignment.modelRoute === undefined ? {} : { modelRoute: assignment.modelRoute }),
        ...(assignment.archivedAt === undefined ? {} : { archivedAt: assignment.archivedAt }),
        createdAt: assignment.createdAt,
        updatedAt: assignment.updatedAt,
      };
    });
  }

  async function setAssignmentArchived(
    botSlug: string,
    sessionId: string,
    archived: boolean,
  ): Promise<AssignmentArchiveOutcome | { outcome: 'unarchived'; assignment: AssignmentSummary }> {
    const bot = ports.registry.get(botSlug);
    if (bot === undefined) throw new Error(`Unknown PersonaBot: ${botSlug}`);
    return archived
      ? archiveAssignment(bot, sessionId, () => {})
      : unarchiveAssignment(bot, sessionId, () => {});
  }

  function getAssignment(botSlug: string, sessionId: string): AssignmentDetail | undefined {
    const row = ports.database.read((database) =>
      database
        .prepare(
          `SELECT session_id, source_event_id, bot_slug, title, description, activity, stop_state,
                  latest_report_state, latest_report_summary, latest_report_at,
                  continuity_key, open_ask_source_event_id, open_ask_at,
                  grant_id, workspace_id, primary_cwd, permission_mode,
                  approval_policy, preset_revision, created_at, updated_at
                  , model_route_json, model_group_id, model_effort, agent_preset, archived_at, (SELECT body FROM source_events WHERE source_event_id = assignments.open_ask_source_event_id) AS open_ask_summary
             FROM assignments
            WHERE bot_slug = ? AND session_id = ?`,
        )
        .get(botSlug, sessionId),
    ) as AssignmentRow | undefined;
    if (row === undefined) return undefined;
    const executionWait = ports.approvalCapacity.state(sessionId);
    return {
      ...assignmentFromRow(row),
      ...(executionWait === undefined ? {} : { executionWait }),
    };
  }

  function beginAssignmentApprovalWait(
    sessionId: string,
    callId: string,
    signal: AbortSignal,
  ): AssignmentApprovalWaitLease | undefined {
    if (assignmentRow(undefined, sessionId) === undefined) return undefined;
    return ports.approvalCapacity.begin(sessionId, callId, signal);
  }

  async function ensureAssignmentCapacity(sessionId: string, signal: AbortSignal): Promise<void> {
    if (ports.ownership.resolve(sessionId)?.rootRole === 'assignment')
      await ports.approvalCapacity.ensure(sessionId, signal);
  }

  function assignmentApprovalWait(
    sessionId: string,
    callId: string,
  ): AssignmentExecutionWait | undefined {
    return ports.approvalCapacity.stateForCall(sessionId, callId);
  }

  function runAssignmentTool<T>(
    sessionId: string,
    callId: string,
    token: symbol,
    signal: AbortSignal,
    body: () => Promise<T>,
  ): Promise<T> {
    return assignmentRow(undefined, sessionId) !== undefined
      ? ports.approvalCapacity.execute(sessionId, callId, token, signal, body)
      : body();
  }

  function settleAssignmentTool(sessionId: string, callId: string): void {
    ports.approvalCapacity.settledTool(sessionId, callId);
  }

  function assignmentExecutionAvailable(sessionId: string): boolean {
    return assignmentAvailable(sessionId, 'working');
  }

  function assignmentAvailable(sessionId: string, activity: 'working' | 'idle'): boolean {
    if (ports.closed()) return false;
    const row = assignmentRow(undefined, sessionId);
    const owner = ports.ownership.resolve(sessionId);
    const bot = row === undefined ? undefined : ports.registry.get(row.bot_slug);
    if (
      row?.stop_state !== 'running' ||
      row.activity !== activity ||
      owner?.rootRole !== 'assignment' ||
      owner.botSlug !== row.bot_slug ||
      bot === undefined ||
      bot.paused === true ||
      isArchivedRow(row) ||
      ports.sessionArchived?.(sessionId) === true ||
      ports.assignmentArchives.has(sessionId) ||
      !ports.ownership.contentAvailable(sessionId)
    )
      return false;
    const permission = permissionFromRow(row);
    if (permission === undefined || ports.grants === undefined) return false;
    try {
      const grant = ports.grants.requireActive(row.bot_slug, permission.grantId);
      if (
        grant.workspaceId !== permission.workspaceId ||
        grant.workspacePath !== permission.primaryCwd
      )
        return false;
      ports.database.read((db) => requireSourceEffects(db, row.source_event_id, row.bot_slug));
      return true;
    } catch {
      return false;
    }
  }

  async function prepareNativeAssignmentStep(
    sessionId: string,
    senderSessionIds: readonly string[],
    signal: AbortSignal,
  ): Promise<boolean> {
    const startedAt = Date.now();
    if (ports.preparedAssignments.has(sessionId))
      return !signal.aborted && assignmentExecutionAvailable(sessionId);
    const trusted = () =>
      senderSessionIds.length > 0 &&
      senderSessionIds.every((id) => {
        const sender = ports.ownership.resolve(id);
        return (
          sender?.parentSessionId === sessionId &&
          sender.botSlug === assignmentRow(undefined, sessionId)?.bot_slug &&
          sender.provenance === 'subagent' &&
          ports.ownership.contentAvailable(id)
        );
      });
    const cancellation = AbortSignal.any([signal, ports.waitLifetime.signal]);
    const valid = () =>
      !cancellation.aborted &&
      (assignmentAvailable(sessionId, 'idle') || assignmentExecutionAvailable(sessionId)) &&
      trusted();
    const refuse = (reason = 'execution-unavailable') => {
      ports.warn?.(
        JSON.stringify({
          event: 'native-assignment-input',
          phase: 'refused',
          reason,
          session: sessionId,
          durationMs: Date.now() - startedAt,
        }),
      );
      return false;
    };
    if (!valid()) return refuse();
    const waitUnlessCancelled = (step: Promise<boolean>) =>
      new Promise<boolean>((resolve) => {
        const finish = (result: boolean) => {
          cancellation.removeEventListener('abort', abort);
          resolve(result);
        };
        const abort = () => finish(false);
        cancellation.addEventListener('abort', abort, { once: true });
        void step.then(finish, () => finish(false));
        if (cancellation.aborted) abort();
      });
    const pending = ports.nativeAssignmentSteps.get(sessionId);
    if (pending !== undefined) {
      const accepted = await waitUnlessCancelled(pending.step);
      if (!valid()) return refuse();
      if (!accepted && pending.signal.aborted)
        return prepareNativeAssignmentStep(sessionId, senderSessionIds, signal);
      return accepted;
    }
    const prepare = async () => {
      for (let running = ports.assignmentRuns.get(sessionId); running !== undefined;) {
        if (ports.preparedAssignments.has(sessionId)) return valid();
        if (!(await waitUnlessCancelled(running.then(() => true)))) return refuse();
        running = ports.assignmentRuns.get(sessionId);
      }
      while (valid() && assignmentCapacityRefusal('awakened') !== undefined) {
        await new Promise<void>((resolve) => {
          const finish = () => {
            unsubscribe();
            cancellation.removeEventListener('abort', finish);
            resolve();
          };
          const unsubscribe = ports.waitOptions.database.subscribe(finish);
          cancellation.addEventListener('abort', finish, { once: true });
          if (!valid() || assignmentCapacityRefusal('awakened') === undefined) finish();
        });
      }
      if (!valid()) return refuse();
      const row = assignmentRow(undefined, sessionId)!;
      const bot = ports.registry.get(row.bot_slug)!;
      const permission = permissionFromRow(row)!;
      const retained = row.model_group_id === null ? storedAssignmentTarget(row) : undefined;
      const directTarget = retained !== undefined && 'kind' in retained ? retained : undefined;
      if (directTarget?.kind === 'engine' && ports.sessionModels.get(sessionId) === null)
        return refuse('native-input-requires-dsh-agent');
      return new Promise<boolean>((resolve) => {
        let settled = false;
        const finish = (accepted: boolean) => {
          if (settled) return;
          settled = true;
          cancellation.removeEventListener('abort', abort);
          resolve(accepted);
        };
        const abort = () => finish(false);
        cancellation.addEventListener('abort', abort, { once: true });
        const agentPreset = row.agent_preset ?? undefined;
        trackAssignmentRun(sessionId, async () => {
          try {
            const modelRoute =
              ports.sessionModels.get(sessionId) === null
                ? await ports
                    .refreshAssignmentRoute(row.bot_slug, sessionId)
                    .catch(() => modelRouteFromRow(row))
                : modelRouteFromRow(row);
            await ports.agents.runAssignment({
              ...ports.assignmentModelSelection(bot.slug, sessionId),
              sessionId,
              bot,
              text: '',
              resume: true,
              permission,
              recoveryEntry: () => ports.getAssignment(bot.slug, sessionId),
              failEngineRecovery: (summary) =>
                ports.assignmentReporting.recordEngineRecoveryFailure(bot.slug, sessionId, summary),
              ...(modelRoute === undefined ? {} : { modelRoute }),
              ...(directTarget?.kind === 'route' ? { routingTarget: directTarget } : {}),
              ...(agentPreset === undefined ? {} : { agentPreset }),
              requireContent: () => {
                ports.requireTurnAccess(bot.slug, row.source_event_id ? [row.source_event_id] : []);
                ports.database.read((db) =>
                  requireAssignmentSource(db, row.source_event_id, bot.slug),
                );
              },
              setExecutionReady: (ready) => setAssignmentExecutionReady(sessionId, ready),
              acceptNativeInput: () => {
                const accepted = valid();
                if (accepted) ports.groupContinuations.delete(sessionId);
                ports.warn?.(
                  JSON.stringify({
                    event: 'native-assignment-input',
                    phase: accepted ? 'ready' : 'refused',
                    session: sessionId,
                    durationMs: Date.now() - startedAt,
                  }),
                );
                finish(accepted);
                return accepted;
              },
              report: (report, execution) =>
                ports.assignmentReporting.recordReport(bot.slug, sessionId, report, execution),
              completedTurn: (execution) =>
                ports.assignmentReporting.recordCompletedAssignment(bot.slug, sessionId, execution),
              cancelledTurn: (execution) =>
                ports.assignmentReporting.recordUnsuccessfulAssignment(
                  bot.slug,
                  sessionId,
                  execution,
                  'cancelled',
                ),
              failedTurn: (execution) => ports.assignmentFailed(bot.slug, sessionId, execution),
            });
          } finally {
            ports.preparedAssignments.delete(sessionId);
            finish(false);
          }
        });
      });
    };
    const step = prepare();
    ports.nativeAssignmentSteps.set(sessionId, { step, signal: cancellation });
    try {
      return await step;
    } finally {
      if (ports.nativeAssignmentSteps.get(sessionId)?.step === step)
        ports.nativeAssignmentSteps.delete(sessionId);
    }
  }

  async function archiveAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
  ): Promise<AssignmentArchiveOutcome> {
    const row = assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (isArchivedRow(row))
      return {
        outcome: 'archived',
        assignment: requireAssignmentSummary(bot.slug, sessionId),
      };
    const active = (message: string): AssignmentArchiveOutcome => ({
      outcome: 'refused',
      code: 'assignment-active',
      assignment: requireAssignmentSummary(bot.slug, sessionId),
      message,
    });
    if (
      row.activity === 'working' ||
      row.stop_state === 'requested' ||
      ports.assignmentAcceptances.has(sessionId)
    )
      return active(
        `Assignment Session ${sessionId} is still active; nothing was archived. Wait for it to settle or call stop_assignment first.`,
      );
    const archive = ports.sessionArchive?.();
    if (archive === undefined) throw new Error('DSH Session archive is unavailable');
    if (ports.assignmentArchives.has(sessionId))
      return active(
        `Assignment Session ${sessionId} is already being archived; inspect it shortly.`,
      );
    ports.assignmentArchives.add(sessionId);
    try {
      markSideEffect();
      try {
        await archive.archiveSession(sessionId);
      } catch (error) {
        if (error instanceof Error && error.name === 'WorkspaceActiveSessionError')
          return active(
            `DSH reports Session ${sessionId} still has running work; nothing was archived. Stop it first, then retry.`,
          );
        throw error;
      }
      ports.database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments SET archived_at = ?, continuity_key = NULL
                WHERE bot_slug = ? AND session_id = ? AND archived_at IS NULL`,
            )
            .run(ports.now().toISOString(), bot.slug, sessionId);
        },
        ['assignments'],
      );
    } finally {
      ports.assignmentArchives.delete(sessionId);
    }
    return {
      outcome: 'archived',
      assignment: requireAssignmentSummary(bot.slug, sessionId),
    };
  }

  async function unarchiveAssignment(
    bot: PersonaBotRecord,
    sessionId: string,
    markSideEffect: () => void,
  ): Promise<{ outcome: 'unarchived'; assignment: AssignmentSummary }> {
    const row = assignmentRow(bot.slug, sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    if (isArchivedRow(row)) {
      const archive = ports.sessionArchive?.();
      if (archive === undefined) throw new Error('DSH Session archive is unavailable');
      markSideEffect();
      await archive.unarchiveSession(sessionId);
      ports.database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments SET archived_at = NULL
                WHERE bot_slug = ? AND session_id = ? AND archived_at IS NOT NULL`,
            )
            .run(bot.slug, sessionId);
        },
        ['assignments'],
      );
    }
    if (row.stop_state === 'stopped') {
      markSideEffect();
      ports.database.transaction(
        (database) => {
          database
            .prepare(
              `UPDATE assignments SET stop_state = 'running', activity = 'idle', updated_at = ?
                WHERE bot_slug = ? AND session_id = ? AND stop_state = 'stopped'`,
            )
            .run(ports.now().toISOString(), bot.slug, sessionId);
        },
        ['assignments'],
      );
    }
    return {
      outcome: 'unarchived',
      assignment: requireAssignmentSummary(bot.slug, sessionId),
    };
  }

  function assignmentDmChannel(row: AssignmentRow): ChannelRecord | undefined {
    const bot = ports.registry.get(row.bot_slug);
    if (!bot) return undefined;
    const requester = ports.database.read((db) =>
      db
        .prepare(`
      SELECT coalesce(
        (SELECT human_id FROM source_events WHERE source_event_id = ?),
        (SELECT human_id FROM usage_turn_humans WHERE session_id = ? AND turn >= 0 ORDER BY turn LIMIT 1)
      ) AS human_id
    `)
        .get(row.source_event_id, row.session_id),
    );
    const principal = botOwner(bot);
    const humanId = typeof requester?.['human_id'] === 'string' ? requester['human_id'] : principal;
    return ports.channels
      .list()
      .find(
        (channel) =>
          channel.type === 'dm' &&
          channel.botSlug === row.bot_slug &&
          !channel.deletedAt &&
          (channel.dmHumanId ?? principal) === humanId,
      );
  }

  function publishAssignmentRefusal(row: AssignmentRow, error: unknown): void {
    const channel = assignmentDmChannel(row);
    if (channel === undefined) return;
    const notice = ports.publishSessionFailure({
      channelId: channel.id,
      botSlug: row.bot_slug,
      sessionId: row.session_id,
      role: 'assignment',
      error,
      context: row.title,
      ...(error instanceof AssignmentInboxAcceptanceUncertainError ||
      row.open_ask_source_event_id === null
        ? {}
        : { assignmentAnswerTo: row.open_ask_source_event_id }),
    });
    ports.assignmentNotices.add(notice);
    void notice.then(
      () => ports.assignmentNotices.delete(notice),
      () => ports.assignmentNotices.delete(notice),
    );
  }

  function setAssignmentExecutionReady(sessionId: string, ready: boolean): void {
    if (ready) ports.preparedAssignments.add(sessionId);
    else ports.preparedAssignments.delete(sessionId);
  }

  function trackAssignmentRun(
    sessionId: string,
    task: (beginProcessing: () => void) => Promise<void>,
    failure: () => { activity: 'idle' | 'error'; answerTo?: string } = () => ({
      activity: 'error',
    }),
    awaitAcceptance = false,
  ): void {
    let tracked: Promise<void> | undefined;
    const run = (async () => {
      const assignment = assignmentRow(undefined, sessionId);
      if (assignment === undefined) return;
      let processing: MessagingProcessing | undefined;
      const beginProcessing = () => {
        if (
          processing ||
          ports.closed() ||
          assignmentRow(undefined, sessionId)?.stop_state !== 'running'
        )
          return;
        processing = ports.externalMessaging?.beginProcessing(assignment.bot_slug, [
          assignment.source_event_id,
        ]);
        if (processing) ports.typingAssignments.set(sessionId, processing);
      };
      setActivity(sessionId, 'working');
      try {
        if (!awaitAcceptance) beginProcessing();
        await task(beginProcessing);
        if (ports.assignmentRuns.get(sessionId) !== tracked) return;
        if (assignmentRow(undefined, sessionId)?.activity === 'error') return;
        setActivity(sessionId, 'idle');
      } catch (error) {
        if (ports.assignmentRuns.get(sessionId) !== tracked) return;
        const continuation = ports.groupContinuations.get(sessionId);
        if (continuation !== undefined && !continuation.refreshing) {
          continuation.error = error;
          setActivity(sessionId, 'idle');
          return;
        }
        const refused = failure();
        setActivity(sessionId, refused.activity);
        const row = assignmentRow(undefined, sessionId);
        if (row?.stop_state !== 'running') return;
        if (row !== undefined) {
          const channel = assignmentDmChannel(row);
          if (channel !== undefined) {
            await ports.publishSessionFailure({
              channelId: channel.id,
              botSlug: row.bot_slug,
              sessionId,
              role: 'assignment',
              error,
              context: row.title,
              ...(refused.answerTo === undefined ? {} : { assignmentAnswerTo: refused.answerTo }),
            });
          }
        }
      } finally {
        await processing?.stop();
        if (ports.typingAssignments.get(sessionId) === processing)
          ports.typingAssignments.delete(sessionId);
        if (ports.assignmentRuns.get(sessionId) === tracked)
          ports.approvalCapacity.forget(sessionId);
      }
    })();
    tracked = run.then(
      () => {
        if (ports.assignmentRuns.get(sessionId) === tracked) ports.assignmentRuns.delete(sessionId);
      },
      () => {
        if (ports.assignmentRuns.get(sessionId) === tracked) ports.assignmentRuns.delete(sessionId);
      },
    );
    ports.assignmentRuns.set(sessionId, tracked);
  }

  function assignmentRow(
    botSlug: string | undefined,
    sessionId: string,
  ): AssignmentRow | undefined {
    return ports.database.read(
      (database) =>
        (botSlug === undefined
          ? database.prepare(`SELECT * FROM assignments WHERE session_id = ?`).get(sessionId)
          : database
              .prepare(`SELECT * FROM assignments WHERE bot_slug = ? AND session_id = ?`)
              .get(botSlug, sessionId)) as AssignmentRow | undefined,
    );
  }

  function assignmentByKey(botSlug: string, continuityKey: string): AssignmentRow | undefined {
    return ports.database.read(
      (database) =>
        database
          .prepare(`SELECT * FROM assignments WHERE bot_slug = ? AND continuity_key = ?`)
          .get(botSlug, continuityKey) as AssignmentRow | undefined,
    );
  }

  function activeAssignmentCount(): number {
    return ports.database.read((database) => {
      const rows = database
        .prepare(
          "SELECT session_id, stop_state FROM assignments WHERE activity = 'working' OR stop_state = 'requested'",
        )
        .all() as Array<{ session_id: string; stop_state: string }>;
      return rows.filter(
        (row) => row.stop_state === 'requested' || !ports.approvalCapacity.released(row.session_id),
      ).length;
    });
  }

  function assignmentCapacityRefusal(
    action: 'created' | 'awakened',
  ): AssignmentCapacityRefusal | undefined {
    const activeCount = activeAssignmentCount();
    const limit = ports.assignmentConcurrencyLimit();
    if (!Number.isInteger(limit) || limit < 1 || limit > 32)
      throw new Error('Invalid Assignment Concurrency Limit; expected an integer from 1 to 32');
    if (activeCount < limit) return undefined;
    return {
      outcome: 'capacity',
      code: 'assignment-capacity',
      activeCount,
      limit,
      retryable: true,
      message: `Assignment Concurrency Limit ${limit} reached; retryable: true. Nothing was ${action}. Wait for active work to settle before retrying; keep the item that asked for this open, or snooze it with inbox_snooze until then, and do not resolve it.`,
    };
  }

  function requireAssignmentSummary(botSlug: string, sessionId: string): AssignmentSummary {
    const assignment = ports.getAssignment(botSlug, sessionId);
    if (assignment === undefined) throw new Error(`Unknown Assignment Session: ${sessionId}`);
    return assignment;
  }

  function setActivity(sessionId: string, activity: AssignmentActivity): void {
    const at = ports.now().toISOString();
    ports.database.transaction(
      (database) => {
        database
          .prepare(
            "UPDATE assignments SET activity = ?, updated_at = ? WHERE session_id = ? AND stop_state = 'running'",
          )
          .run(activity, at, sessionId);
      },
      ['assignments'],
    );
    ports.approvalCapacity.changed();
  }

  return {
    latestAssignmentActivity,
    listAssignments,
    listChannelAssignments,
    setAssignmentArchived,
    getAssignment,
    beginAssignmentApprovalWait,
    ensureAssignmentCapacity,
    assignmentApprovalWait,
    runAssignmentTool,
    settleAssignmentTool,
    assignmentExecutionAvailable,
    prepareNativeAssignmentStep,
    archiveAssignment,
    unarchiveAssignment,
    assignmentDmChannel,
    publishAssignmentRefusal,
    setAssignmentExecutionReady,
    trackAssignmentRun,
    assignmentRow,
    assignmentByKey,
    assignmentCapacityRefusal,
    requireAssignmentSummary,
    setActivity,
  };
}
