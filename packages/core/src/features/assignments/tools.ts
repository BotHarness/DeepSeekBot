import type { Agent } from '@deepseek-ai/dsh-agent';
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { ChannelSessionLink } from '../../channels/channel.js';
import type { EngineTool } from '../../engines/engine-host.js';
import type { GroupFallback, GroupPick, MixedGroupPick } from '../../models/group-fallback.js';
import type { OpenAssignmentRoutes } from '../../models/open-assignments.js';
import { isPresetSubEngineSelection } from '../../models/preset-sub.js';
import {
  AssignmentChoiceError,
  assignmentGroupOptionOf,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../../models/presets.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import { TeamError } from '../../team/error.js';
import type {
  AssignmentActivity,
  AssignmentAgentRun,
  AssignmentReportState,
  AssignmentRequestMode,
  AssignmentRequestOutcome,
  OrchestratorAgentRun,
  OrchestratorAssignmentAccess,
} from '../../runtime/bot-runtime.js';

interface OrchestratorAssignmentRun {
  run: Pick<OrchestratorAgentRun, 'assignments'> & {
    channels: Pick<OrchestratorAgentRun['channels'], 'linkSessions'>;
  };
  sessionLinks?: Map<string, ChannelSessionLink['kind']>;
  linkedSessionIds?: Set<string>;
}

export interface AssignmentToolOptions {
  currentRun: () => OrchestratorAssignmentRun | undefined;
  run: Pick<OrchestratorAgentRun, 'bot'>;
  resolveModelPlan: () => PersonaBotModelPlan | undefined;
  openAssignmentRoutes: Pick<OpenAssignmentRoutes, 'require'> | undefined;
}

interface CreateAssignmentToolOptions extends AssignmentToolOptions {
  assignmentGroups:
    | (Partial<Pick<GroupFallback, 'inherited' | 'inheritedEffort'>> & {
        pick(
          botSlug: string,
          groupId: string,
          effort?: string,
        ): Promise<GroupPick | MixedGroupPick>;
      })
    | undefined;
  modeChoices: AssignmentModeChoices | undefined;
  loadAssignmentModes: () => Promise<AssignmentModeChoices> | undefined;
}

export interface AssignmentModeChoices {
  default: string;
  allowed: Array<{ id: string; name?: string; description?: string }>;
  restricted: boolean;
}

const ASSIGNMENT_MODE_GUIDANCE =
  'A mode decides the Assignment’s tools, and every tool definition costs input tokens on each step, so choose the lightest allowed mode whose description covers the work. The mode is fixed once the Assignment starts and a continuity key keeps the existing Assignment’s mode: work that needs tools its mode lacks goes to a new Assignment under a new key.';

export function assignmentModeParameter(choices: AssignmentModeChoices | undefined): {
  type: 'string';
  description: string;
  enum?: string[];
} {
  if (choices === undefined || choices.allowed.length < 2)
    return {
      type: 'string',
      description: `Optional DSH mode id from assignmentModes.allowed in list_assignment_models; omitted uses this Bot’s mode (${choices?.default ?? 'unknown'}). ${ASSIGNMENT_MODE_GUIDANCE}`,
    };
  const modes = choices.allowed
    .map((mode) => `- ${mode.id}: ${mode.description ?? mode.name ?? 'no description'}`)
    .join('\n');
  return {
    type: 'string',
    enum: choices.allowed.map((mode) => mode.id),
    description: `Optional DSH mode for this Assignment; omitted uses this Bot’s mode (${choices.default}). ${ASSIGNMENT_MODE_GUIDANCE} Allowed modes:\n${modes}`,
  };
}

interface AssignmentRequestArgs {
  session_id: string;
  text: string;
  mode?: string;
  answer_to?: string;
  provider?: string;
  model?: string;
  reasoning_effort?: string;
}

function assignmentRequestInput(
  tool: string,
  args: AssignmentRequestArgs,
): {
  sessionId: string;
  mode: AssignmentRequestMode;
  text: string;
  answerTo?: string;
  model?: ModelRoute;
} {
  if (args.mode !== undefined && args.mode !== 'next-turn' && args.mode !== 'next-step') {
    throw new Error(`${tool}: mode must be next-turn or next-step`);
  }
  if ((args.provider === undefined) !== (args.model === undefined))
    throw new Error(`${tool}: provider and model must be specified together`);
  if (args.reasoning_effort !== undefined && args.provider === undefined)
    throw new Error(`${tool}: reasoning_effort requires provider and model`);
  return {
    sessionId: args.session_id,
    mode: args.mode ?? 'next-turn',
    text: args.text,
    ...(args.answer_to === undefined ? {} : { answerTo: args.answer_to }),
    ...(args.provider === undefined
      ? {}
      : {
          model: {
            provider: args.provider,
            model: args.model!,
            ...(args.reasoning_effort === undefined
              ? {}
              : { reasoningEffort: args.reasoning_effort }),
          },
        }),
  };
}

function assignmentRequestResult(outcome: AssignmentRequestOutcome): Record<string, unknown> {
  if (outcome.delivery === 'refused') {
    return {
      outcome: outcome.outcome,
      code: outcome.code,
      message: outcome.message,
      sessionId: outcome.assignment.sessionId,
      activity: outcome.assignment.activity,
    };
  }
  if (outcome.delivery === 'capacity') {
    return {
      outcome: outcome.outcome,
      code: outcome.code,
      activeCount: outcome.activeCount,
      limit: outcome.limit,
      retryable: outcome.retryable,
      message: outcome.message,
      sessionId: outcome.assignment.sessionId,
      activity: outcome.assignment.activity,
    };
  }
  return {
    sessionId: outcome.assignment.sessionId,
    activity: outcome.assignment.activity,
    delivery: outcome.delivery,
    acceptance: outcome.acceptance ?? (outcome.delivery === 'steer' ? 'accepted' : 'pending'),
    modelRoute: outcome.assignment.modelRoute,
  };
}

export function onlyActiveGrant(access: Pick<OrchestratorAssignmentAccess, 'grants'>): string {
  const active = access.grants().filter((grant) => grant.revokedAt === undefined);
  if (active.length === 1) return active[0]!.id;
  throw new Error(
    active.length === 0
      ? 'create_assignment: no Workspace Grant is active; call request_workspace_grant first'
      : `create_assignment: ${active.length} Workspace Grants are active; pass grant_id (${active.map((grant) => grant.id).join(', ')})`,
  );
}

function linkSession(
  active: OrchestratorAssignmentRun,
  sessionId: string,
  kind: ChannelSessionLink['kind'],
): void {
  const links = (active.sessionLinks ??= new Map());
  if (links.get(sessionId) !== 'created') links.set(sessionId, kind);
}

export function createAssignmentTool({
  currentRun,
  run,
  resolveModelPlan,
  openAssignmentRoutes,
  assignmentGroups,
  modeChoices,
  loadAssignmentModes,
}: CreateAssignmentToolOptions): ToolDefinition {
  return defineTool({
    name: 'create_assignment',
    description:
      'Start one independent Assignment Session and return its Session id immediately. First search list_assignments with query: work serving the same goal or deliverable belongs in the Assignment already doing it. Call list_assignment_models for the current allowed sub choices, default and modes. Omit the model selection to use the default, or pick one listed API model, Subscription Engine account model, or Routing Group. Pass a continuity key to continue the same direction of work in the keyed Assignment instead of creating another one; omit the key for a different direction.',
    parameters: {
      title: {
        type: 'string',
        required: true,
        description:
          'Assignment Title: a short name of about 40 characters that lets the Human recognize this line of work in a list, in the Human’s language, e.g. "Fix Safari export button".',
      },
      description: {
        type: 'string',
        required: true,
        description:
          'Assignment Description: one or two sentences saying what the Assignment sets out to do and what it delivers. It is not a report.',
      },
      instructions: {
        type: 'string',
        description:
          'Optional detailed first request for the Assignment Session (steps, constraints, files). Not stored; omitted sends the Description.',
      },
      grant_id: {
        type: 'string',
        description:
          'Active Workspace Grant id from [Host context] or list_workspace_grants; raw paths are not accepted. Omit it when exactly one Grant is active.',
      },
      key: {
        type: 'string',
        description:
          'Optional continuity key naming this direction of work; reuse it to continue the same Assignment.',
      },
      provider: {
        type: 'string',
        description:
          'Optional exact provider id from the current Assignment model set; specify with model.',
      },
      model: {
        type: 'string',
        description:
          'Exact model id from the listed choice, paired with provider for an API model or engine for a Subscription Engine model.',
      },
      engine: {
        type: 'string',
        description: 'Subscription Engine id from a kind: engine choice in list_assignment_models.',
      },
      account_id: {
        type: 'string',
        description: 'Exact accountId of the selected Subscription Engine choice, when present.',
      },
      reasoning_effort: {
        type: 'string',
        description:
          'Optional allowed effort for the selected model, or for the selected Routing Group when list_assignment_models gives it efforts; omitted uses the Human-selected default. Pass an empty string to select the provider default when allowed.',
      },
      group: {
        type: 'string',
        description:
          'Optional Routing Group id from list_assignment_models assignmentGroups instead of provider/model; the Assignment runs on its first usable member and falls back to the next one.',
      },
      mode: assignmentModeParameter(modeChoices),
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      const active = currentRun();
      if (active === undefined) {
        throw new Error('create_assignment: Orchestrator run is unavailable');
      }
      if (
        (args.group !== undefined &&
          (args.provider !== undefined || args.model !== undefined || args.engine !== undefined)) ||
        (args.engine !== undefined && args.provider !== undefined) ||
        (args.account_id !== undefined && args.engine === undefined)
      )
        throw new Error(
          'create_assignment: choose one API model, Subscription Engine choice, or Routing Group',
        );
      const plan = resolveModelPlan();
      const refusal = (error: unknown): string => {
        if (
          (plan?.sub !== undefined || args.engine !== undefined) &&
          (error instanceof AssignmentChoiceError ||
            (error instanceof TeamError && error.code === 'model-not-allowed'))
        )
          return JSON.stringify({
            outcome: 'refused',
            code: error.code,
            retryable: false,
            message: error.message,
          });
        throw error;
      };
      const inherited =
        plan?.assignmentDefault === undefined ? assignmentGroups?.inherited?.() : undefined;
      const engineSelection =
        args.engine === undefined
          ? undefined
          : {
              kind: 'engine',
              engine: args.engine,
              ...(args.account_id === undefined ? {} : { accountId: args.account_id }),
              ...(args.model === undefined ? {} : { model: args.model }),
            };
      if (engineSelection !== undefined && !isPresetSubEngineSelection(engineSelection))
        return refusal(
          new AssignmentChoiceError(
            'assignment-choice-not-allowed',
            'create_assignment: choose a listed Subscription Engine account and model',
          ),
        );
      const groupId =
        args.group ??
        (args.provider === undefined && engineSelection === undefined
          ? (plan?.assignmentDefaultGroupId ?? inherited)
          : undefined);
      if (
        engineSelection === undefined &&
        (args.provider === undefined) !== (args.model === undefined)
      )
        throw new Error('create_assignment: provider and model must be specified together');
      if (
        groupId !== undefined &&
        groupId !== inherited &&
        !(plan?.assignmentGroups ?? []).includes(groupId)
      )
        return refusal(
          new AssignmentChoiceError(
            'assignment-choice-not-allowed',
            `create_assignment: Routing Group ${groupId} is not allowed`,
          ),
        );
      if (
        args.reasoning_effort !== undefined &&
        args.provider === undefined &&
        engineSelection === undefined
      ) {
        if (groupId === undefined)
          throw new Error('create_assignment: reasoning_effort requires provider and model');
        const allowed = assignmentGroupOptionOf(plan, groupId)?.allowedEfforts ?? [];
        if (!allowed.includes(args.reasoning_effort))
          return refusal(
            new AssignmentChoiceError(
              'assignment-choice-not-allowed',
              `create_assignment: Routing Group ${groupId} allows ${allowed.length === 0 ? 'no effort choice' : `efforts ${allowed.join(', ')}`}`,
            ),
          );
      }
      const groupEffort =
        groupId === undefined
          ? undefined
          : (args.reasoning_effort ??
            assignmentGroupOptionOf(plan, groupId)?.defaultEffort ??
            (groupId === inherited ? assignmentGroups?.inheritedEffort?.() : undefined));
      let picked: RoutingTarget | undefined;
      if (groupId !== undefined) {
        let pick: GroupPick | MixedGroupPick | undefined;
        try {
          pick = await assignmentGroups?.pick(run.bot.slug, groupId, groupEffort);
        } catch (error) {
          if (
            plan?.sub !== undefined ||
            !(error instanceof TeamError && error.code === 'model-not-allowed')
          )
            return refusal(error);
        }
        if (pick?.kind !== 'route' && pick?.kind !== 'target')
          return JSON.stringify({
            outcome: 'refused',
            retryable: false,
            ...(plan?.sub === undefined
              ? {}
              : {
                  code:
                    pick?.kind === 'exhausted' &&
                    (pick.rests.length > 0 ||
                      ('subscription' in pick && pick.subscription !== undefined))
                      ? 'assignment-choice-resting'
                      : 'assignment-choice-unavailable',
                }),
            message:
              pick?.kind === 'exhausted' && pick.rests.length > 0
                ? `Every model in Routing Group ${groupId} is resting: ${pick.rests.map((rest) => `${rest.provider}/${rest.model} until ${rest.until}`).join('; ')}`
                : `Routing Group ${groupId} has no usable model`,
          });
        picked = pick.kind === 'target' ? pick.target : { kind: 'route', route: pick.route };
      }
      if (args.provider !== undefined) {
        try {
          await openAssignmentRoutes?.require(run.bot.slug, {
            provider: args.provider,
            model: args.model!,
            ...(args.reasoning_effort ? { reasoningEffort: args.reasoning_effort } : {}),
          });
        } catch (error) {
          return refusal(error);
        }
      }
      if (args.mode !== undefined) {
        const modes = await loadAssignmentModes();
        if (modes === undefined)
          throw new Error('create_assignment: DSH modes are unavailable on this Host');
        if (!modes.allowed.some((mode) => mode.id === args.mode))
          throw new Error(
            `create_assignment: mode ${args.mode} is not allowed; choose one of ${modes.allowed.map((mode) => mode.id).join(', ')}`,
          );
      }
      const grantId = args.grant_id ?? onlyActiveGrant(active.run.assignments);
      let outcome: ReturnType<OrchestratorAgentRun['assignments']['create']>;
      try {
        outcome = active.run.assignments.create({
          title: args.title,
          description: args.description,
          ...(args.instructions === undefined ? {} : { instructions: args.instructions }),
          grantId,
          ...(args.key === undefined ? {} : { key: args.key }),
          ...(args.mode === undefined ? {} : { mode: args.mode }),
          ...(picked !== undefined && groupId !== undefined
            ? {
                ...(picked.kind === 'route' ? { model: picked.route } : { routingTarget: picked }),
                modelGroupId: groupId,
                ...(groupEffort === undefined ? {} : { modelGroupEffort: groupEffort }),
              }
            : engineSelection !== undefined
              ? {
                  engine: engineSelection,
                  ...(args.reasoning_effort === undefined
                    ? {}
                    : { engineEffort: args.reasoning_effort }),
                }
              : args.provider === undefined
                ? {}
                : {
                    model: {
                      provider: args.provider,
                      model: args.model!,
                      ...(args.reasoning_effort === undefined
                        ? {}
                        : { reasoningEffort: args.reasoning_effort }),
                    },
                  }),
        });
      } catch (error) {
        return refusal(error);
      }
      if (outcome.outcome === 'created' || outcome.outcome === 'reused') {
        linkSession(
          active,
          outcome.assignment.sessionId,
          outcome.outcome === 'created' ? 'created' : 'sent',
        );
        return JSON.stringify({
          outcome: outcome.outcome,
          sessionId: outcome.assignment.sessionId,
          title: outcome.assignment.title,
          description: outcome.assignment.description,
          activity: outcome.assignment.activity,
          ...(outcome.assignment.modelRoute === undefined
            ? {}
            : { modelRoute: outcome.assignment.modelRoute }),
          ...(outcome.assignment.agentPreset === undefined
            ? {}
            : { mode: outcome.assignment.agentPreset }),
        });
      }
      if (outcome.outcome === 'capacity') return JSON.stringify(outcome);
      return JSON.stringify({
        outcome: outcome.outcome,
        retryable: true,
        message: outcome.message,
      });
    },
  });
}

export function registerAssignmentTools(
  { currentRun, run, resolveModelPlan, openAssignmentRoutes }: AssignmentToolOptions,
  registerTool: (tool: ToolDefinition) => unknown,
): void {
  registerTool(
    defineTool({
      name: 'list_assignments',
      description:
        'List this PersonaBot Assignments with current activity, latest report, continuity key, and any open question waiting for your answer. Archived Assignments are hidden unless include_archived is true. Before creating an Assignment, search with query for one already serving the same goal or deliverable. Results are newest first; follow nextCursor with unchanged filters.',
      parameters: {
        query: {
          type: 'string',
          description:
            'Case-insensitive text to find in the Title, Description, continuity key, or latest report summary.',
        },
        activity: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['working', 'idle', 'error', 'stopping', 'stopped'],
          },
          description: 'Keep only Assignments in these activities.',
        },
        include_archived: {
          type: 'boolean',
          description: 'Also list archived Assignments. Default false.',
        },
        limit: { type: 'integer', description: 'Page size 1–50, default 20.' },
        cursor: {
          type: 'string',
          description: 'Opaque nextCursor from the previous page with the same filters.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('list_assignments: Orchestrator run is unavailable');
        }
        const access = active.run.assignments;
        if (access.query === undefined)
          throw new Error('list_assignments: Assignment Directory is unavailable');
        return JSON.stringify(
          access.query({
            ...(args.query === undefined ? {} : { query: args.query }),
            ...(args.activity === undefined
              ? {}
              : { activity: args.activity as AssignmentActivity[] }),
            ...(args.include_archived === undefined
              ? {}
              : { includeArchived: args.include_archived }),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'archive_assignment',
      description:
        'Archive one finished or no-longer-needed Assignment Session so it leaves your default list_assignments view and native Session lists. Refused while the Assignment is working or stopping: wait for it to settle or call stop_assignment first. Archiving clears its continuity key; history is kept and unarchive_assignment restores it. Nothing is ever archived automatically.',
      parameters: {
        session_id: {
          type: 'string',
          required: true,
          description: 'Assignment Session id from list_assignments.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.run.assignments.archive === undefined) {
          throw new Error('archive_assignment: Orchestrator run is unavailable');
        }
        const outcome = await active.run.assignments.archive(args.session_id);
        return JSON.stringify(
          outcome.outcome === 'archived'
            ? {
                outcome: outcome.outcome,
                sessionId: outcome.assignment.sessionId,
                archivedAt: outcome.assignment.archivedAt,
              }
            : {
                outcome: outcome.outcome,
                code: outcome.code,
                sessionId: outcome.assignment.sessionId,
                activity: outcome.assignment.activity,
                message: outcome.message,
              },
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'unarchive_assignment',
      description:
        'Restore one archived Assignment Session to your default list_assignments view so you can send it requests again. Its continuity key is not restored. It also resumes a stopped Assignment Session. Pass message to revive it and send it that request in one call; the request goes through send_assignment_request delivery with the same mode and refusals. Only a delivery of steer or followup means the request was delivered; code request-not-delivered means it was unarchived but received nothing.',
      parameters: {
        session_id: {
          type: 'string',
          required: true,
          description:
            'Archived or stopped Assignment Session id from list_assignments include_archived.',
        },
        message: {
          type: 'string',
          description:
            'Optional Assignment Request to deliver once it is unarchived, such as an instruction to continue its work.',
        },
        mode: {
          type: 'string',
          description:
            'With message only: next-turn (default) continues after the current turn; next-step steers a running Assignment at its next step.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        const assignments = active?.run.assignments;
        const unarchive = assignments?.unarchive;
        if (assignments === undefined || unarchive === undefined) {
          throw new Error('unarchive_assignment: Orchestrator run is unavailable');
        }
        if (args.message === undefined && args.mode !== undefined)
          throw new Error('unarchive_assignment: mode requires message');
        if (args.message !== undefined && args.message.trim() === '')
          throw new Error('unarchive_assignment: message must not be blank');
        const input =
          args.message === undefined
            ? undefined
            : assignmentRequestInput('unarchive_assignment', {
                session_id: args.session_id,
                text: args.message,
                ...(args.mode === undefined ? {} : { mode: args.mode }),
              });
        const outcome = await unarchive(args.session_id);
        const restored = {
          outcome: outcome.outcome,
          sessionId: outcome.assignment.sessionId,
          activity: outcome.assignment.activity,
        };
        if (input === undefined) return JSON.stringify(restored);
        const notDelivered = (reason: string, detail: Record<string, unknown> = {}) =>
          JSON.stringify({
            ...restored,
            ...detail,
            outcome: 'unarchived',
            delivery: 'refused',
            code: 'request-not-delivered',
            message: `Assignment Session ${args.session_id} is active, but the request was not delivered: ${reason}`,
          });
        let request: AssignmentRequestOutcome;
        try {
          request = assignments.request(input);
        } catch (error) {
          return notDelivered(error instanceof Error ? error.message : String(error), {
            activity: assignments.inspect(args.session_id)?.activity ?? restored.activity,
          });
        }
        const result = assignmentRequestResult(request);
        if (request.delivery === 'refused' || request.delivery === 'capacity')
          return notDelivered(request.message, { ...result, requestCode: request.code });
        return JSON.stringify({ ...restored, ...result, outcome: 'unarchived' });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'inspect_assignment',
      description:
        'Inspect one owned Assignment by Session id, including its current model route beside the default for new Assignments. Set report_offset=0 to page through its accepted report via DSH Session Query; use report_source_event_id=reportPage.reportSourceEventId and report_offset=reportPage.nextOffset for subsequent pages, even after a newer report arrives. Set include_recent_events for a separate bounded Session tail.',
      parameters: {
        session_id: {
          type: 'string',
          required: true,
          description: 'Assignment Session id returned by create_assignment.',
        },
        include_recent_events: {
          type: 'boolean',
          description:
            'Include up to four recent Assignment Session events, bounded to 12,000 characters.',
        },
        report_offset: {
          type: 'integer',
          description:
            'Read 2,000 characters of the accepted report starting at this character offset; start with 0.',
        },
        report_source_event_id: {
          type: 'string',
          description:
            'Report identity returned as reportPage.reportSourceEventId. Required for nonzero offsets; keeps reading the same report even when a newer one arrives.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('inspect_assignment: Orchestrator run is unavailable');
        }
        if (args.report_source_event_id !== undefined && args.report_offset === undefined)
          throw new Error(
            'REPORT_OFFSET_REQUIRED: Provide report_offset with report_source_event_id',
          );
        const detail = active.run.assignments.inspect(args.session_id);
        if (detail === undefined)
          return JSON.stringify({ error: `Unknown Assignment Session: ${args.session_id}` });
        const reportPage =
          args.report_offset === undefined
            ? undefined
            : await active.run.assignments.reportPage?.({
                sessionId: args.session_id,
                offset: args.report_offset,
                ...(args.report_source_event_id === undefined
                  ? {}
                  : { reportSourceEventId: args.report_source_event_id }),
              });
        if (args.report_offset !== undefined && reportPage === undefined)
          throw new Error('inspect_assignment: DSH Session Query is unavailable');
        const recentEvents =
          args.include_recent_events === true
            ? await active.run.assignments.tail?.(args.session_id)
            : undefined;
        if (args.include_recent_events === true && recentEvents === undefined)
          throw new Error('inspect_assignment: DSH Session Query is unavailable');
        return JSON.stringify({
          ...detail,
          modelRoutes: {
            currentAssignment: detail.modelRoute ?? null,
            newAssignmentDefault: resolveModelPlan()?.assignmentDefault ?? null,
          },
          ...(reportPage === undefined ? {} : { reportPage }),
          ...(recentEvents === undefined ? {} : { recentEvents }),
        });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'send_assignment_request',
      description:
        'Send an addressed request to one Assignment Session. It works on any unarchived Assignment, including one whose last Turn failed, was cancelled or was interrupted, and one that was stopped (by you or the Human), which it resumes; sending to an archived one unarchives it first (the result carries unarchived: true) and retries once; that retry can still return capacity or refused, which deliver nothing. Use answer_to to answer a waiting question. To change this existing Session’s model for its next model request, first call list_assignment_models, then pass an allowed provider/model/effort with this request. Omitted model fields keep the Session’s current route, even after the Human changes the Bot preset.',
      parameters: {
        session_id: {
          type: 'string',
          required: true,
          description: 'Assignment Session id.',
        },
        text: {
          type: 'string',
          required: true,
          description: 'The instruction or answer to deliver.',
        },
        mode: {
          type: 'string',
          description:
            'next-turn (default) continues after the current turn; next-step steers a running Assignment at its next step.',
        },
        answer_to: {
          type: 'string',
          description: 'The answer_to value from a Bot Inbox item that waits for your answer.',
        },
        provider: {
          type: 'string',
          description:
            'Optional provider id from the Bot’s current Assignment model set; specify with model.',
        },
        model: {
          type: 'string',
          description:
            'Optional model id from the Bot’s current Assignment model set; specify with provider.',
        },
        reasoning_effort: {
          type: 'string',
          description: 'Optional allowed effort; omitted uses this model’s default effort.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('send_assignment_request: Orchestrator run is unavailable');
        }
        const assignments = active.run.assignments;
        const input = assignmentRequestInput('send_assignment_request', args);
        if (input.model !== undefined)
          await openAssignmentRoutes?.require(run.bot.slug, input.model);
        else await assignments.refreshRoute?.(input.sessionId);
        let outcome = assignments.request(input);
        let unarchived = false;
        if (
          outcome.delivery === 'refused' &&
          outcome.code === 'assignment-ended' &&
          assignments.unarchive !== undefined
        ) {
          await assignments.unarchive(args.session_id);
          if (input.model === undefined) await assignments.refreshRoute?.(input.sessionId);
          outcome = assignments.request(input);
          unarchived = outcome.delivery !== 'refused';
        }
        if (outcome.delivery === 'steer' || outcome.delivery === 'followup')
          linkSession(active, args.session_id, 'sent');
        return JSON.stringify({
          ...assignmentRequestResult(outcome),
          ...(unarchived ? { unarchived: true } : {}),
        });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'link_message_sessions',
      description:
        'Link one of your own sent Human DM messages to the Assignment Sessions it reports on; each shows as a link on that message, marked new or sent. Pass the messageId bot_send_message returned and the Session ids from create_assignment or send_assignment_request. Calling again adds Sessions to the same message, so one message can link Sessions created in later steps or turns.',
      parameters: {
        message_id: {
          type: 'string',
          required: true,
          description: 'messageId of your own sent message in your Human DM.',
        },
        session_ids: {
          type: 'array',
          items: { type: 'string' },
          required: true,
          description: 'Assignment Session ids this message reports on.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined)
          throw new Error('link_message_sessions: Orchestrator run is unavailable');
        const channels = active.run.channels;
        if (channels.linkSessions === undefined)
          throw new Error('link_message_sessions: Session links are unavailable');
        const ids = [...new Set(args.session_ids)];
        if (ids.length === 0)
          throw new Error('link_message_sessions: pass at least one Session id');
        const links = ids.map((sessionId) => {
          const assignment = active.run.assignments.inspect(sessionId);
          if (assignment === undefined)
            throw new Error(`link_message_sessions: ${sessionId} is not one of your Assignments`);
          return {
            sessionId,
            title: assignment.title,
            kind: active.sessionLinks?.get(sessionId) ?? 'sent',
            createdAt: assignment.createdAt,
          };
        });
        const message = channels.linkSessions({ messageId: args.message_id, links });
        for (const { sessionId } of links) (active.linkedSessionIds ??= new Set()).add(sessionId);
        return JSON.stringify({
          outcome: 'linked',
          messageId: message.id,
          sessions: (message.sessionLinks ?? []).map(({ sessionId, kind }) => ({
            sessionId,
            kind,
          })),
        });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'wait_for_assignment',
      description:
        'Wait for one owned Assignment to commit a new report or settle. Returns after at most 120 seconds; cancellation stops only this wait, not the Assignment. Use instead of repeated inspect polling when its result is needed now.',
      parameters: {
        session_id: {
          type: 'string',
          required: true,
          description: 'Owned Assignment Session id.',
        },
        timeout_seconds: { type: 'number', description: 'Integer 1-120; default 30.' },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args, context) => {
        const active = currentRun();
        if (active === undefined || active.run.assignments.wait === undefined)
          throw new Error('wait_for_assignment: Orchestrator run is unavailable');
        const seconds = args.timeout_seconds ?? 30;
        if (!Number.isInteger(seconds) || seconds < 1 || seconds > 120)
          throw new Error('wait_for_assignment: timeout_seconds must be an integer 1-120');
        return JSON.stringify(
          await active.run.assignments.wait(args.session_id, context.signal, seconds * 1000),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'stop_assignment',
      description:
        'Stop one Assignment Session for this PersonaBot. Cancels active DSH work, clears queued input and its continuity key, and pauses it with its history kept; the next send_assignment_request to it resumes it. Confirm the returned activity before telling the Human.',
      parameters: {
        session_id: {
          type: 'string',
          required: true,
          description: 'Assignment Session id returned by create_assignment or list_assignments.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) {
          throw new Error('stop_assignment: Orchestrator run is unavailable');
        }
        const assignment = await active.run.assignments.stop(args.session_id);
        return JSON.stringify({
          sessionId: assignment.sessionId,
          activity: assignment.activity,
        });
      },
    }),
  );
}

export const ENGINE_REPORT_TOOL: EngineTool = {
  name: 'report_to_orchestrator',
  description:
    'Required internal reply transport to the Orchestrator: ordinary assistant text is private, not a delivered report. Put the requested result in summary. Report progress at milestones and one terminal state before finishing; set expects_reply when you need an Orchestrator answer to continue.',
  parameters: {
    type: 'object',
    properties: {
      state: {
        type: 'string',
        enum: ['progress', 'completed', 'blocked', 'waiting-human', 'failed'],
      },
      summary: {
        type: 'string',
        description: 'Outcome, blocker, or question to report to the Orchestrator.',
      },
      expects_reply: {
        type: 'boolean',
        description:
          'True when you cannot continue before the Orchestrator answers; end your turn after reporting and you will be resumed with the answer.',
      },
    },
    required: ['state', 'summary'],
  },
};

export function isReportState(value: string): value is AssignmentReportState {
  return (
    value === 'progress' ||
    value === 'completed' ||
    value === 'blocked' ||
    value === 'waiting-human' ||
    value === 'failed'
  );
}

export function createAssignmentReportTool(
  currentRun: () => { run: Pick<AssignmentAgentRun, 'report'>; reported: boolean } | undefined,
  agent: Pick<Agent, 'session'>,
): ToolDefinition {
  return defineTool({
    name: 'report_to_orchestrator',
    description:
      'Required internal reply transport to the Orchestrator, including text-only tasks: ordinary assistant text is private, not a delivered report. Put the requested result in summary. Report progress at milestones and one terminal state before finishing; set expects_reply when you need an Orchestrator answer to continue.',
    parameters: {
      state: {
        type: 'string',
        required: true,
        description: 'One of: progress, completed, blocked, waiting-human, failed.',
      },
      summary: {
        type: 'string',
        required: true,
        description: 'Outcome, blocker, or question to report to the Orchestrator.',
      },
      expects_reply: {
        type: 'boolean',
        description:
          'True when you cannot continue before the Orchestrator answers; end your turn after reporting and you will be resumed with the answer.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async (args) => {
      if (!isReportState(args.state)) {
        throw new Error(
          'report_to_orchestrator: state must be progress, completed, blocked, waiting-human, or failed',
        );
      }
      const active = currentRun();
      if (active === undefined) {
        throw new Error('report_to_orchestrator: Assignment run is unavailable');
      }
      const start = agent.session.snapshotEvents().findLast((event) => event.type === 'turn/start');
      if (start === undefined) throw new Error('Assignment Report has no native Turn identity');
      await active.run.report(
        {
          state: args.state,
          summary: args.summary,
          ...(args.expects_reply === undefined
            ? {}
            : { expectsReply: args.expects_reply === true }),
        },
        { turn: start.data.turn },
      );
      active.reported = true;
      return 'Report delivered to the Orchestrator.';
    },
  });
}
