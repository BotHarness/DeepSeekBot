import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import { EngineLimitError, EngineRefusal } from '../../engines/engine-session.js';
import { OWNER_HUMAN_CONTEXT } from '../../humans/context.js';
import {
  matchesPresetSubChoice,
  type PresetSubEngineSelection,
  presetSubEngineTarget,
} from '../../models/preset-sub.js';
import {
  AssignmentChoiceError,
  isAssignmentModelChoice,
  type ModelRoute,
  resolveBotModelPlan,
  selectAssignmentGroup,
  selectAssignmentRoute,
} from '../../models/presets.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import { requireAssignmentSource } from '../../purge/fence.js';
import {
  ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
  ASSIGNMENT_TITLE_MAX_LENGTH,
} from '../../runtime/assignment-title.js';
import type {
  AssignmentAgentRun,
  AssignmentCapacityRefusal,
  AssignmentCreateOutcome,
  AssignmentRequestMode,
  AssignmentRequestOutcome,
  AssignmentSummary,
  BotAgentAdapter,
  BotRuntime,
  BotRuntimeOptions,
  InterruptedToolCall,
} from '../../runtime/bot-runtime.js';
import {
  type createOrchestratorCancellation,
  interruptedToolsNote,
} from '../../runtime/orchestrator-cancellation.js';
import { requireNonBlank } from '../../runtime/require-non-blank.js';
import type { sessionModelChoices } from '../../runtime/session-model-choices.js';
import type { SessionOwnership } from '../../sessions/ownership.js';
import { TeamError } from '../../team/error.js';
import type { AssignmentAccessStore } from '../../workspaces/assignment-access.js';
import type { AssignmentPermissionSnapshot, WorkspaceGrantStore } from '../../workspaces/grants.js';
import type { createAssignmentDelivery } from './delivery.js';
import type { AssignmentRow } from './events-types.js';
import type { createAssignmentReporting } from './reporting.js';
import {
  isArchivedRow,
  permissionFromRow,
  readAssignmentTarget,
  saveAssignmentTarget,
  storedAssignmentTarget,
} from './runtime-records.js';
import type { TurnTargetSwitchReason } from '@botharness/host-protocol/turn-target';

function requireBoundedText(value: unknown, field: string, maxLength: number): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (normalized === '')
    throw new TypeError(`create_assignment: ${field} is required and must not be blank`);
  if ([...normalized].length > maxLength)
    throw new TypeError(
      `create_assignment: ${field} must be at most ${maxLength} characters; keep it short`,
    );
  return normalized;
}

const ASSIGNMENT_RECOVERY_NOTE =
  '[Host: your previous Turn in this Session did not finish cleanly (it ended with an error, was cancelled, or was interrupted by a Host restart). Your context is intact. Check the current state of your workspace and any side effects before redoing work, and do not repeat a side effect blindly; an earlier request may already have reached you.]\n\n';

interface AssignmentIntakePorts {
  agents: BotAgentAdapter;
  assignmentAcceptances: Set<string>;
  assignmentAccessPresetStore: AssignmentAccessStore | undefined;
  assignmentArchives: Set<string>;
  assignmentByKey: (botSlug: string, continuityKey: string) => AssignmentRow | undefined;
  assignmentCapacityRefusal: (
    action: 'created' | 'awakened',
  ) => AssignmentCapacityRefusal | undefined;
  assignmentDelivery: Pick<ReturnType<typeof createAssignmentDelivery>, 'deliverAssignmentRequest'>;
  assignmentFailed: (
    botSlug: string,
    sessionId: string,
    execution: { turn: number; endSeq: number },
  ) => void;
  assignmentGroupExecution: (
    botSlug: string,
    sessionId: string,
    groupId: string | null | undefined,
    effort: string | null | undefined,
  ) => Pick<AssignmentAgentRun, 'selectGroupTarget' | 'groupEffort' | 'groupSwitchReason'>;
  assignmentModelSelection: (
    botSlug: string,
    sessionId: string,
  ) => Pick<AssignmentAgentRun, 'sessionModel' | 'observeTurnTarget'>;
  assignmentReporting: Pick<
    ReturnType<typeof createAssignmentReporting>,
    | 'recordCompletedAssignment'
    | 'recordEngineRecoveryFailure'
    | 'recordReport'
    | 'recordUnsuccessfulAssignment'
  >;
  assignmentRow: (botSlug: string | undefined, sessionId: string) => AssignmentRow | undefined;
  recordInterruptedTools: ReturnType<
    typeof createOrchestratorCancellation
  >['recordInterruptedTools'];
  createSessionId: () => string;
  database: OperationalDatabaseModulePort;
  getAssignment: BotRuntime['getAssignment'];
  grants: WorkspaceGrantStore | undefined;
  groupFallback: BotRuntimeOptions['groupFallback'];
  inheritedModelPlan: BotRuntimeOptions['inheritedModelPlan'];
  interruptedTools: Map<string, InterruptedToolCall[]>;
  now: () => Date;
  ownership: SessionOwnership;
  registry: PersonaBotRegistry;
  requireAssignmentEngine: BotRuntimeOptions['requireAssignmentEngine'];
  requireAssignmentSummary: (botSlug: string, sessionId: string) => AssignmentSummary;
  requireModelRoute: BotRuntimeOptions['requireModelRoute'];
  requireTurnAccess: (botSlug: string, ids: Iterable<string>) => void;
  routeRests: BotRuntimeOptions['routeRests'];
  sessionModels: ReturnType<typeof sessionModelChoices>;
  setAssignmentExecutionReady: (sessionId: string, ready: boolean) => void;
  trackAssignmentRun: (
    sessionId: string,
    task: (beginProcessing: () => void) => Promise<void>,
    failure?: () => { activity: 'idle' | 'error'; answerTo?: string },
    awaitAcceptance?: boolean,
  ) => void;
  turnSources: ReadonlyMap<string, { sessionId: string }>;
}

export function createAssignmentIntake(ports: AssignmentIntakePorts) {
  function createOrReuseAssignment(
    bot: PersonaBotRecord,
    sourceEventId: string,
    input: {
      title: string;
      description: string;
      instructions?: string;
      key?: string;
      grantId: string;
      model?: ModelRoute;
      engine?: PresetSubEngineSelection;
      engineEffort?: string;
      modelGroupId?: string;
      routingTarget?: RoutingTarget;
      modelGroupEffort?: string;
      mode?: string;
    },
    trackDelivery?: (sessionId: string, pending: boolean) => void,
  ): AssignmentCreateOutcome {
    const title = requireBoundedText(input.title, 'title', ASSIGNMENT_TITLE_MAX_LENGTH);
    const description = requireBoundedText(
      input.description,
      'description',
      ASSIGNMENT_DESCRIPTION_MAX_LENGTH,
    );
    const instructions =
      input.instructions === undefined || input.instructions.trim() === ''
        ? undefined
        : input.instructions.trim();
    const text = instructions ?? description;
    const grantId = requireNonBlank(input.grantId, 'Workspace Grant id');
    if (ports.registry.get(bot.slug) === undefined) throw new Error('PersonaBot is deleted');
    const current = ports.registry.get(bot.slug) ?? bot;
    const plan = resolveBotModelPlan(current, () => ports.inheritedModelPlan?.());
    if (input.model !== undefined && !isAssignmentModelChoice(input.model))
      throw new Error('Assignment model choice is invalid');
    const modelGroupId =
      input.modelGroupId === undefined
        ? undefined
        : plan?.assignmentDefault === undefined
          ? input.modelGroupId === ports.groupFallback?.inherited()
            ? input.modelGroupId
            : undefined
          : selectAssignmentGroup(plan, { group: input.modelGroupId });
    if (input.model !== undefined && plan === undefined && modelGroupId === undefined)
      throw new Error('Apply a Model Preset before choosing an Assignment model');
    if (
      input.modelGroupId !== undefined &&
      (modelGroupId === undefined ||
        (input.model === undefined && input.routingTarget === undefined))
    )
      throw new Error('An Assignment Routing Group needs its chosen member route');
    if (ports.grants === undefined) throw new Error('Workspace Grants are unavailable');
    const grant = ports.grants.requireActive(bot.slug, grantId);
    const access = ports.assignmentAccessPresetStore?.get(bot.slug) ?? {
      mode: 'workspace-write' as const,
      revision: 0,
    };
    if (
      access.mode === 'danger-full-access' &&
      bot.ownerHumanId !== undefined &&
      bot.ownerHumanId !==
        (ports.database.read((db) => db.prepare('SELECT owner_human_id FROM team_settings').get())
          ?.owner_human_id ?? OWNER_HUMAN_CONTEXT.humanId)
    )
      throw new TeamError('permission-required');
    const permission: AssignmentPermissionSnapshot = {
      grantId: grant.id,
      workspaceId: grant.workspaceId,
      primaryCwd: grant.workspacePath,
      mode: access.mode,
      approval: 'ask',
      presetRevision: access.revision,
    };
    const key = input.key === undefined ? undefined : requireNonBlank(input.key, 'Continuity Key');
    if (key !== undefined) {
      const holder = ports.assignmentByKey(bot.slug, key);
      if (holder !== undefined && holder.grant_id !== grant.id) {
        throw new Error('Continuity Key belongs to an Assignment with a different Workspace Grant');
      }
      if (
        holder !== undefined &&
        (holder.activity === 'idle' || holder.activity === 'error') &&
        holder.stop_state === 'running'
      ) {
        if (
          input.model !== undefined ||
          input.routingTarget !== undefined ||
          input.engine !== undefined
        )
          throw new Error(
            'An existing keyed Assignment keeps its model; use a new key for a new model choice',
          );
        if (input.mode !== undefined)
          throw new Error(
            'An existing keyed Assignment keeps its mode; use a new key for a new mode choice',
          );
        const request = requestAssignment(
          bot,
          { sessionId: holder.session_id, mode: 'next-turn', text },
          trackDelivery,
          sourceEventId,
        );
        if (request.delivery === 'capacity') {
          const { assignment: _assignment, delivery: _delivery, ...refusal } = request;
          return refusal;
        }
        if (request.delivery === 'refused') throw new Error(request.message);
        return {
          outcome: 'reused',
          assignment: ports.requireAssignmentSummary(bot.slug, holder.session_id),
        };
      }
      if (holder !== undefined) {
        return {
          outcome: 'key-busy',
          message: `Continuity Key ${key} is held by running Assignment ${holder.session_id}; send it a request, wait, or create a new Assignment without the key.`,
        };
      }
    }
    const engineSelection =
      input.engine ??
      (modelGroupId === undefined &&
      input.model === undefined &&
      plan?.sub?.default?.kind === 'engine'
        ? plan.sub.default
        : undefined);
    let engineTarget: Extract<RoutingTarget, { kind: 'engine' }> | undefined;
    if (engineSelection !== undefined) {
      const choice = plan?.sub?.choices.find((entry) =>
        matchesPresetSubChoice(entry, engineSelection),
      );
      if (
        choice?.kind !== 'engine' ||
        (input.engineEffort !== undefined && input.engineEffort !== (choice.effort ?? ''))
      )
        throw new AssignmentChoiceError(
          'assignment-choice-not-allowed',
          'Choose a listed Assignment Subscription Engine account, model and effort',
        );
      engineTarget = presetSubEngineTarget(choice);
      try {
        ports.requireAssignmentEngine?.(bot.slug, engineTarget);
      } catch (error) {
        if (error instanceof EngineLimitError)
          throw new AssignmentChoiceError('assignment-choice-resting', error.message);
        if (error instanceof EngineRefusal)
          throw new AssignmentChoiceError('assignment-choice-unavailable', error.message);
        throw error;
      }
    }
    const modelRoute =
      modelGroupId !== undefined
        ? input.routingTarget?.kind === 'route'
          ? input.routingTarget.route
          : input.model
        : plan === undefined || engineTarget !== undefined
          ? undefined
          : selectAssignmentRoute(plan, input.model);
    if (modelRoute) ports.requireModelRoute?.(bot.slug, modelRoute);
    if (plan?.sub !== undefined && modelGroupId === undefined && modelRoute !== undefined) {
      const rest = ports.routeRests?.restingUntil(modelRoute);
      if (rest !== undefined)
        throw new AssignmentChoiceError(
          'assignment-choice-resting',
          `Assignment model ${rest.provider}/${rest.model} is resting until ${rest.until}`,
        );
    }
    const target =
      engineTarget ??
      input.routingTarget ??
      (modelRoute === undefined ? undefined : { kind: 'route' as const, route: modelRoute });
    const directTarget =
      modelGroupId === undefined &&
      (engineTarget !== undefined || plan?.sub?.choices.some((choice) => choice.kind === 'engine'))
        ? target
        : undefined;
    const refusal = ports.assignmentCapacityRefusal('created');
    if (refusal !== undefined) return refusal;
    const sessionId = ports.createSessionId();
    const serializedTarget =
      directTarget !== undefined
        ? JSON.stringify(directTarget)
        : target === undefined
          ? null
          : saveAssignmentTarget(target);
    readAssignmentTarget(serializedTarget, sessionId);
    const createdAt = ports.now().toISOString();
    ports.database.transaction(
      (database) => {
        const cwdReference = permission.primaryCwd;
        ports.ownership.claimWithin(database, {
          sessionId,
          botSlug: bot.slug,
          rootRole: 'assignment',
          ...(cwdReference === undefined ? {} : { cwdReference }),
          at: createdAt,
        });
        const sourceHuman = database
          .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
          .get(sourceEventId);
        const rootSessionId = ports.turnSources.get(bot.slug)?.sessionId;
        const rootHuman = rootSessionId
          ? database
              .prepare(
                'SELECT human_id FROM usage_turn_humans WHERE session_id = ? ORDER BY turn DESC LIMIT 1',
              )
              .get(rootSessionId)
          : undefined;
        const creatorHumanId =
          typeof sourceHuman?.['human_id'] === 'string'
            ? sourceHuman['human_id']
            : rootHuman?.['human_id'];
        if (typeof creatorHumanId === 'string')
          database
            .prepare('INSERT OR IGNORE INTO usage_turn_humans VALUES (?, 0, ?, ?)')
            .run(sessionId, creatorHumanId, Date.parse(createdAt));
        database
          .prepare(
            `INSERT INTO assignments (
               session_id, source_event_id, bot_slug, title, description, activity,
               continuity_key, grant_id, workspace_id, primary_cwd, permission_mode,
               approval_policy, preset_revision, model_route_json, model_group_id, model_effort,
               agent_preset, created_at, updated_at
             ) VALUES (?, ?, ?, ?, ?, 'working', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            sessionId,
            sourceEventId,
            bot.slug,
            title,
            description,
            key ?? null,
            permission.grantId,
            permission.workspaceId,
            permission.primaryCwd,
            permission.mode,
            permission.approval,
            permission.presetRevision,
            serializedTarget,
            modelGroupId ?? null,
            modelGroupId === undefined ? null : (input.modelGroupEffort ?? null),
            input.mode ?? null,
            createdAt,
            createdAt,
          );
      },
      ['session-ownership', 'assignments'],
    );
    trackDelivery?.(sessionId, true);
    ports.trackAssignmentRun(sessionId, () =>
      ports.agents.runAssignment({
        ...ports.assignmentModelSelection(bot.slug, sessionId),
        setExecutionReady: (ready) => ports.setAssignmentExecutionReady(sessionId, ready),
        requireContent: () => {
          ports.requireTurnAccess(bot.slug, sourceEventId ? [sourceEventId] : []);
          ports.database.read((db) => requireAssignmentSource(db, sourceEventId, bot.slug));
        },
        accepted: () => trackDelivery?.(sessionId, false),
        toolsInterrupted: (calls) => ports.recordInterruptedTools(bot.slug, sessionId, calls),
        sessionId,
        bot,
        text,
        permission,
        recoveryEntry: () => ports.getAssignment(bot.slug, sessionId),
        failEngineRecovery: (summary) =>
          ports.assignmentReporting.recordEngineRecoveryFailure(bot.slug, sessionId, summary),
        ...(modelRoute === undefined ? {} : { modelRoute }),
        ...(directTarget !== undefined || (modelGroupId !== undefined && target !== undefined)
          ? { routingTarget: directTarget ?? target! }
          : {}),
        ...ports.assignmentGroupExecution(
          bot.slug,
          sessionId,
          modelGroupId,
          input.modelGroupEffort,
        ),
        ...(input.mode === undefined ? {} : { agentPreset: input.mode }),
        report: async (report, execution) =>
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
      }),
    );
    return {
      outcome: 'created',
      assignment: ports.requireAssignmentSummary(bot.slug, sessionId),
    };
  }

  function requestAssignment(
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
  ): AssignmentRequestOutcome {
    let row = ports.assignmentRow(bot.slug, input.sessionId);
    if (row === undefined) throw new Error(`Unknown Assignment Session: ${input.sessionId}`);
    if (isArchivedRow(row) || ports.assignmentArchives.has(input.sessionId)) {
      return {
        outcome: 'refused',
        code: 'assignment-ended',
        assignment: ports.requireAssignmentSummary(bot.slug, input.sessionId),
        delivery: 'refused',
        message: `Assignment Session ${input.sessionId} is archived (resolved); nothing was delivered. Create a new Assignment for new work, or call unarchive_assignment first to continue this one.`,
      };
    }
    const stopped = row.stop_state === 'stopped' ? row : undefined;
    if (stopped !== undefined) row = { ...row, stop_state: 'running', activity: 'idle' };
    if (row.stop_state !== 'running') {
      throw new Error(`Assignment Session ${input.sessionId} is stopped or stopping`);
    }
    const permission = permissionFromRow(row);
    if (permission === undefined || ports.grants === undefined) {
      throw new Error('Assignment has no valid Workspace Grant snapshot');
    }
    const grant = ports.grants.requireActive(bot.slug, permission.grantId);
    if (
      grant.workspaceId !== permission.workspaceId ||
      grant.workspacePath !== permission.primaryCwd
    ) {
      throw new Error('Assignment Workspace Grant no longer matches its permission snapshot');
    }
    if (ports.assignmentAcceptances.has(input.sessionId)) {
      throw new Error(
        `Assignment Session ${input.sessionId} is awaiting Inbox acceptance; inspect it before retrying`,
      );
    }
    const text = requireNonBlank(input.text, 'Assignment Request text');
    const recovering = row.activity === 'error';
    const settledActivity: 'idle' | 'error' = recovering ? 'error' : 'idle';
    if (recovering && input.answerTo !== undefined) {
      throw new Error(
        `Assignment Session ${input.sessionId} failed or was interrupted, so an earlier answer may already have reached it; inspect it, then continue it with a request without answer_to`,
      );
    }
    if (input.answerTo !== undefined && input.answerTo !== row.open_ask_source_event_id) {
      throw new Error(
        `Assignment Session ${input.sessionId} has no open ask ${input.answerTo}; inspect it before answering`,
      );
    }
    const retained = storedAssignmentTarget(row);
    const directTarget =
      row.model_group_id === null && retained !== undefined && 'kind' in retained
        ? retained
        : undefined;
    if (input.model !== undefined && directTarget !== undefined && row.activity === 'working')
      throw new Error('Wait for the current Assignment turn to finish before changing its model');
    let modelRoute =
      retained === undefined || !('kind' in retained)
        ? retained
        : retained.kind === 'route'
          ? retained.route
          : undefined;
    if (input.model !== undefined) {
      if (!isAssignmentModelChoice(input.model))
        throw new Error('Assignment model choice is invalid');
      if (ports.registry.get(bot.slug) === undefined) throw new Error('PersonaBot is deleted');
      const current = ports.registry.get(bot.slug) ?? bot;
      const plan = resolveBotModelPlan(current, () => ports.inheritedModelPlan?.());
      if (plan === undefined)
        throw new Error('Apply a Model Preset before choosing an Assignment model');
      modelRoute = selectAssignmentRoute(plan, input.model);
    }
    if (modelRoute && ports.sessionModels.get(input.sessionId) === null)
      ports.requireModelRoute?.(bot.slug, modelRoute);
    const interrupted = ports.interruptedTools.get(input.sessionId);
    const initiatingHuman = ports.database.read((db) => {
      const source = db
        .prepare('SELECT human_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId ?? null);
      if (typeof source?.['human_id'] === 'string') return source['human_id'];
      const parentSessionId = ports.turnSources.get(bot.slug)?.sessionId;
      const parent = db
        .prepare(
          'SELECT human_id FROM usage_turn_humans WHERE session_id = ? AND turn >= 0 ORDER BY turn DESC LIMIT 1',
        )
        .get(parentSessionId ?? null);
      return typeof parent?.['human_id'] === 'string' ? parent['human_id'] : undefined;
    });
    const run: AssignmentAgentRun = {
      ...ports.assignmentModelSelection(bot.slug, input.sessionId),
      ...(switchReason === undefined ? {} : { switchReason }),
      beginTurn: () => {
        if (typeof initiatingHuman !== 'string') return;
        ports.database.transaction(
          (db) => {
            db.prepare('INSERT OR REPLACE INTO usage_turn_humans VALUES (?, -1, ?, ?)').run(
              input.sessionId,
              initiatingHuman,
              ports.now().getTime(),
            );
          },
          ['usage'],
        );
      },
      setExecutionReady: (ready) => ports.setAssignmentExecutionReady(input.sessionId, ready),
      requireContent: () => {
        ports.requireTurnAccess(bot.slug, row.source_event_id ? [row.source_event_id] : []);
        ports.database.read((db) => requireAssignmentSource(db, row.source_event_id, bot.slug));
      },
      accepted: () => trackDelivery?.(input.sessionId, false),
      toolsInterrupted: (calls) => ports.recordInterruptedTools(bot.slug, input.sessionId, calls),
      sessionId: input.sessionId,
      bot,
      text:
        (recovering ? ASSIGNMENT_RECOVERY_NOTE : '') +
        (interrupted === undefined ? '' : interruptedToolsNote(interrupted)) +
        text,
      resume: true,
      permission,
      recoveryEntry: () => ports.getAssignment(bot.slug, input.sessionId),
      failEngineRecovery: (summary) =>
        ports.assignmentReporting.recordEngineRecoveryFailure(bot.slug, input.sessionId, summary),
      ...(modelRoute === undefined ? {} : { modelRoute }),
      ...(directTarget === undefined
        ? {}
        : {
            routingTarget:
              input.model === undefined ? directTarget : { kind: 'route', route: modelRoute! },
          }),
      ...(input.model === undefined
        ? ports.assignmentGroupExecution(
            bot.slug,
            input.sessionId,
            row.model_group_id,
            row.model_effort,
          )
        : {}),
      ...(typeof row.agent_preset === 'string' ? { agentPreset: row.agent_preset } : {}),
      report: async (report, execution) =>
        ports.assignmentReporting.recordReport(bot.slug, input.sessionId, report, execution),
      completedTurn: (execution) =>
        ports.assignmentReporting.recordCompletedAssignment(bot.slug, input.sessionId, execution),
      cancelledTurn: (execution) =>
        ports.assignmentReporting.recordUnsuccessfulAssignment(
          bot.slug,
          input.sessionId,
          execution,
          'cancelled',
        ),
      failedTurn: (execution) => ports.assignmentFailed(bot.slug, input.sessionId, execution),
    };
    return ports.assignmentDelivery.deliverAssignmentRequest({
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
    });
  }

  return {
    createOrReuseAssignment,
    requestAssignment,
  };
}
