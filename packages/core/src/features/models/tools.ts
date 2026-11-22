import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { EngineId } from '../../engines/engine-session.js';
import type { OpenAssignmentRoutes } from '../../models/open-assignments.js';
import {
  assignmentGroupOptionOf,
  assignmentModelsOf,
  matchesPresetSubChoice,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../../models/presets.js';
import type { RestingRoute } from '../../models/route-rest.js';
import type { RoutingTarget } from '../../models/routing-groups.js';
import type { OrchestratorAgentRun } from '../../runtime/bot-runtime.js';

interface AssignmentModelToolOptions {
  run: Pick<OrchestratorAgentRun, 'bot'>;
  isRunActive: () => boolean;
  resolveModelPlan: () => PersonaBotModelPlan | undefined;
  loadAssignmentModes: () =>
    | Promise<{ default: string; allowed: readonly { id: string }[] }>
    | undefined;
  groups:
    | {
        describe(
          groupId: string,
          botSlug: string,
        ): { name: string; routes: ModelRoute[]; targets?: RoutingTarget[] } | undefined;
        engineRestingUntil?(engine: EngineId, accountId?: string): string | undefined;
        restingUntil(route: ModelRoute): RestingRoute | undefined;
        inherited?(): string | undefined;
      }
    | undefined;
  modelFilter: () => ((route: ModelRoute) => boolean) | undefined;
  openAssignmentRoutes: Pick<OpenAssignmentRoutes, 'list'> | undefined;
}

export function createListAssignmentModelsTool({
  run,
  isRunActive,
  resolveModelPlan,
  loadAssignmentModes,
  groups,
  modelFilter,
  openAssignmentRoutes,
}: AssignmentModelToolOptions): ToolDefinition {
  return defineTool({
    name: 'list_assignment_models',
    description:
      'Read the Human-approved provider/model and effort choices for new Assignments, including each model’s default effort, the overall default model, and any Human note on when to use a model. assignmentGroups lists Routing Groups you may pass as group: an Assignment on a group moves to the next member when one runs out and keeps its effort. front is the member it starts on; efforts and defaultEffort, when present, are the levels you may pass as reasoning_effort for that group. A route with restingUntil is out of quota or unavailable until then; avoid it. When open is true, openModels also lists every other model the Human allows for Assignments, with its catalog name and efforts. assignmentModes lists the DSH modes a new Assignment may run in. Call before selecting a non-default route or mode, and follow the notes to pick the cheapest choice that fits the task.',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    execute: async () => {
      if (!isRunActive())
        throw new Error('list_assignment_models: Orchestrator run is unavailable');
      const plan = resolveModelPlan();
      const modeChoices = await loadAssignmentModes()?.then(
        (modes) => ({ assignmentModes: { default: modes.default, allowed: modes.allowed } }),
        (error: unknown) => ({
          assignmentModesError: `DSH modes could not be read, so new Assignments use this Bot's mode: ${error instanceof Error ? error.message : String(error)}`,
        }),
      );
      const allowed = modelFilter() ?? (() => true);
      const resting = <T extends { provider: string; model: string }>(route: T) => {
        const rest = groups?.restingUntil(route);
        return rest === undefined ? route : { ...route, restingUntil: rest.until };
      };
      const describeGroup = (id: string, isDefault: boolean) => {
        const group = groups?.describe(id, run.bot.slug);
        if (group === undefined || !group.routes.every(allowed)) return [];
        const members =
          group.targets === undefined
            ? group.routes.map(resting)
            : group.targets.map((target) => {
                if (target.kind === 'route') return resting(target.route);
                const until = groups?.engineRestingUntil?.(target.engine, target.accountId);
                return until === undefined ? target : { ...target, restingUntil: until };
              });
        const until = members.map((member) =>
          'restingUntil' in member ? member.restingUntil : undefined,
        );
        const front = members.find((member) => !('restingUntil' in member));
        const option = assignmentGroupOptionOf(plan, id);
        return [
          {
            group: id,
            name: group.name,
            ...(isDefault ? { default: true } : {}),
            ...(option?.note === undefined ? {} : { note: option.note }),
            ...(front === undefined
              ? {}
              : {
                  front:
                    'engine' in front ? front : { provider: front.provider, model: front.model },
                }),
            ...(option?.allowedEfforts === undefined
              ? {}
              : { efforts: option.allowedEfforts, defaultEffort: option.defaultEffort }),
            members,
            ...(until.length > 0 && until.every((value) => value !== undefined)
              ? { restingUntil: until.sort()[0] }
              : {}),
          },
        ];
      };
      if (plan?.assignmentDefault === undefined) {
        const inherited = groups?.inherited?.();
        const inheritedGroups = inherited === undefined ? [] : describeGroup(inherited, true);
        return JSON.stringify(
          inheritedGroups.length === 0
            ? {
                configured: false,
                message: 'Ask the Human to apply a Model Preset first',
                ...modeChoices,
              }
            : {
                configured: false,
                inherited: true,
                assignmentGroups: inheritedGroups,
                message:
                  'Assignments follow the Profile default Routing Group; omit provider, model and group to use it',
                ...modeChoices,
              },
        );
      }
      const open = plan.openAssignmentModels === true;
      const assignmentGroups = (plan.assignmentGroups ?? []).flatMap((id) =>
        describeGroup(id, id === plan.assignmentDefaultGroupId),
      );
      const assignmentModels = assignmentModelsOf(plan).filter(allowed).map(resting);
      const openModels = open
        ? ((await openAssignmentRoutes?.list(run.bot.slug)) ?? []).map(resting)
        : [];
      const choices = plan.sub?.choices.flatMap((choice) => {
        const entry =
          choice.kind === 'group'
            ? assignmentGroups.find(({ group }) => group === choice.group)
            : assignmentModels.find(
                ({ provider, model }) => provider === choice.provider && model === choice.model,
              );
        return entry === undefined ? [] : [{ ...entry, kind: choice.kind }];
      });
      const selection = plan.sub?.default;
      const listedDefault =
        selection == null
          ? undefined
          : plan.sub?.choices.find((choice) => matchesPresetSubChoice(choice, selection));
      const defaultVisible =
        listedDefault?.kind === 'group'
          ? assignmentGroups.some(({ group }) => group === listedDefault.group)
          : assignmentModels.some(
              ({ provider, model }) =>
                provider === listedDefault?.provider && model === listedDefault.model,
            );
      return JSON.stringify({
        configured: true,
        revision: plan.revision,
        ...(choices === undefined
          ? {}
          : {
              sub: {
                choices: [...choices, ...openModels.map((model) => ({ ...model, kind: 'model' }))],
                default: defaultVisible
                  ? { ...selection, defaultEffort: listedDefault?.defaultEffort ?? '' }
                  : null,
              },
            }),
        ...(plan.sub?.default?.kind !== 'group' && allowed(plan.assignmentDefault)
          ? { assignmentDefault: resting(plan.assignmentDefault) }
          : {}),
        assignmentModels,
        ...(assignmentGroups.length === 0 ? {} : { assignmentGroups }),
        ...(open
          ? {
              open: true,
              openModels,
            }
          : {}),
        ...modeChoices,
      });
    },
  });
}
