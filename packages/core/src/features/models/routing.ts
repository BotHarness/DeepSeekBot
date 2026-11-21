import { type BridgeResult } from '../../bridge/method-utils.js';
import { modelFailure } from '../../models/provider-bridge.js';
import {
  engineAccountKey,
  type EngineId,
  type RoutingGroupEngineMember,
} from '@botharness/host-protocol/subscription-engine';
import { EngineRefusal } from '../../engines/engine-session.js';
import { botModelGrants, requireBotModel } from '../../team/models.js';
import { requireEngineAccountGrant } from '../../team/roles.js';
import { allowsEngineAccount } from '../../team/permissions.js';
import { TeamError } from '../../team/error.js';
import { type HumanContext } from '../../humans/context.js';
import { join } from 'node:path';
import {
  type ModelPresetEngineInput,
  isModelRoute,
  validateAssignmentModels,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type ModelRoute,
  type ModelPresetGroups,
} from '../../models/presets.js';
import { type ModelFavorite } from '../../models/favorites.js';
import { RoutingGroupError, type RoutingGroupMember } from '../../models/routing-groups.js';
import { groupEfforts } from '../../models/catalog.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { ModelsBridgeDeps } from './deps.js';

export interface ModelCatalogGroup {
  id: string;
  name: string;
  revision: number;
  mode: 'order';
  members: RoutingGroupMember[];
  routes: ModelRoute[];
  restingUntil?: string;
}

export function routeKey(route: { provider: string; model: string }): string {
  return JSON.stringify([route.provider, route.model]);
}

export function routingGroupFailure(error: unknown): BridgeResult<never> {
  if (!(error instanceof RoutingGroupError)) return modelFailure(error);
  return {
    ok: false,
    error: {
      code: error.code === 'invalid-input' ? 'invalid-input' : `routing-group-${error.code}`,
      message: error.message,
      ...(error.references.length > 0 ? { details: { references: error.references } } : {}),
    },
  };
}

export function createModelRoutingHelpers(
  human: HumanContext,
  deps: ModelsBridgeDeps & Pick<BridgeMethodsDeps, 'registry' | 'team'>,
  isHostOwner: () => boolean,
  requireOwnedBot: (slug: string) => void,
) {
  const catalogRests = (): Map<string, string> =>
    new Map((deps.routeRests?.list() ?? []).map((rest) => [routeKey(rest), rest.until]));
  const catalogEntry = <T extends { provider: string; model: string }>(
    entry: T,
    rests: ReadonlyMap<string, string>,
  ): T & { restingUntil?: string } => {
    const until = rests.get(routeKey(entry));
    return until === undefined ? entry : { ...entry, restingUntil: until };
  };
  const catalogGroups = (
    rests: ReadonlyMap<string, string>,
    allowed: (route: ModelRoute) => boolean,
    engineAllowed: (id: string) => boolean,
  ): { groups?: ModelCatalogGroup[] } => {
    const store = deps.routingGroups;
    if (store === undefined) return {};
    return {
      groups: store.list().flatMap((group) => {
        let routes: ModelRoute[];
        try {
          const targets = store.targets(group.id);
          if (
            targets.some(
              (target) =>
                target.kind === 'engine' &&
                !engineAllowed(engineAccountKey(target.engine, target.accountId)),
            )
          )
            return [];
          routes = targets.flatMap((target) => (target.kind === 'route' ? [target.route] : []));
        } catch {
          return [];
        }
        if (routes.length === 0 || !routes.every(allowed)) return [];
        const untils = routes.map((route) => rests.get(routeKey(route)));
        const restingUntil = untils.every((until) => until !== undefined)
          ? [...(untils as string[])].sort()[0]
          : undefined;
        return [
          {
            id: group.id,
            name: group.name,
            revision: group.revision,
            mode: group.mode,
            members: group.members,
            routes,
            ...(restingUntil === undefined ? {} : { restingUntil }),
          },
        ];
      }),
    };
  };
  const favoritesOf = (): { favorites?: ModelFavorite[] } =>
    deps.modelFavorites === undefined ? {} : { favorites: deps.modelFavorites.list(human.humanId) };
  type EngineChoice = { engine: EngineId; accountId?: string };
  const groupEngineChoices = (id: string): RoutingGroupEngineMember[] =>
    deps.routingGroups?.targets(id).filter((target) => target.kind === 'engine') ?? [];
  const memberEngineChoices = (members: readonly RoutingGroupMember[]): EngineChoice[] =>
    members.flatMap((member) =>
      member.kind === 'engine'
        ? [member]
        : member.kind === 'group'
          ? groupEngineChoices(member.id)
          : [],
    );
  const engineChoiceFilter = () => {
    const owner = isHostOwner();
    const grants = owner ? undefined : deps.team?.roles.modelsAllowed(human);
    return ({ engine, accountId }: EngineChoice) =>
      deps.localSubscriptionEngines !== false &&
      (owner ||
        (grants !== undefined && allowsEngineAccount(grants, engineAccountKey(engine, accountId))));
  };
  const requireEngineChoices = (choices: readonly EngineChoice[], slug?: string): void => {
    if (choices.length === 0) return;
    if (deps.localSubscriptionEngines === false)
      throw new EngineRefusal(
        'engine-unavailable',
        'Subscription Engines run only on a local Host',
      );
    const actor = deps.team?.roles.modelsAllowed(human);
    const bot = slug === undefined ? undefined : deps.registry.get(slug);
    if (slug !== undefined && bot === undefined) throw new TeamError('bot-not-found');
    const botGrants = deps.team && bot ? botModelGrants(deps.team, bot) : undefined;
    for (const { engine, accountId } of choices) {
      const id = engineAccountKey(engine, accountId);
      if (actor !== undefined) requireEngineAccountGrant(actor, id);
      else if (!isHostOwner()) throw new TeamError('model-not-allowed', undefined, { route: id });
      if (botGrants !== undefined) requireEngineAccountGrant(botGrants, id);
    }
  };
  const requireGroupEngines = (id: string, slug?: string): void =>
    requireEngineChoices(groupEngineChoices(id), slug);
  const validateGroupMembers = async (
    members: RoutingGroupMember[],
    previous: readonly RoutingGroupMember[] = [],
  ): Promise<void> => {
    requireEngineChoices(memberEngineChoices(members));
    const engineEfforts = members.flatMap((member) =>
      member.kind === 'engine' &&
      member.model !== undefined &&
      member.reasoningEffort !== undefined &&
      !previous.some(
        (saved) =>
          saved.kind === 'engine' &&
          saved.engine === member.engine &&
          engineAccountKey(saved.engine, saved.accountId) ===
            engineAccountKey(member.engine, member.accountId) &&
          saved.model === member.model?.trim() &&
          saved.reasoningEffort === member.reasoningEffort?.trim(),
      )
        ? [
            {
              engine: member.engine,
              ...(member.accountId === undefined ? {} : { accountId: member.accountId }),
              model: member.model.trim(),
              effort: member.reasoningEffort.trim(),
            },
          ]
        : [],
    );
    if (engineEfforts.length > 0) {
      const engines = deps.subscriptionEngines;
      if (engines === undefined)
        throw new EngineRefusal('engine-unavailable', 'Subscription Engines are unavailable');
      try {
        await Promise.all(
          engineEfforts.map(({ engine, ...choice }) => engines.validateChoice(engine, choice)),
        );
      } catch (error) {
        if (error instanceof EngineRefusal)
          throw new RoutingGroupError('invalid-input', error.message);
        throw error;
      }
    }
    const routes = members.filter((member) => member.kind === 'model');
    if (routes.length === 0) return;
    const known = new Set(
      (await deps.modelCatalog!.list()).map((entry) =>
        JSON.stringify([entry.provider, entry.model]),
      ),
    );
    const unknown = routes.find(
      (route) => !known.has(JSON.stringify([route.provider, route.model])),
    );
    if (unknown !== undefined)
      throw new RoutingGroupError(
        'invalid-input',
        `Model ${unknown.provider}/${unknown.model} is not in this Host's model list`,
      );
  };
  const assertEngineAccounts = (
    choices: readonly (
      | Pick<import('../../models/presets.js').ModelPresetEngine, 'engine' | 'accountId'>
      | null
      | undefined
    )[],
  ) => {
    if (!deps.engineAccounts) return;
    for (const choice of choices)
      if (choice != null) deps.engineAccounts.resolveAccount(choice.engine, choice.accountId);
  };
  const firstUsableRoute = async (routes: readonly ModelRoute[]): Promise<ModelRoute> => {
    let failure: Error | undefined;
    const rests = catalogRests();
    const ordered = [
      ...routes.filter((route) => !rests.has(routeKey(route))),
      ...routes.filter((route) => rests.has(routeKey(route))),
    ];
    for (const route of ordered) {
      try {
        await deps.modelCatalog!.validate(route);
        return { ...route };
      } catch (error) {
        failure ??= error instanceof Error ? error : new Error(String(error), { cause: error });
      }
    }
    throw failure ?? new RoutingGroupError('empty-group', 'The Routing Group has no model');
  };
  const requireRoutes = (slug: string, routes: readonly ModelRoute[]): void => {
    requireOwnedBot(slug);
    deps.team?.roles.require(human, 'models.use');
    for (const route of routes) requireBotModel(deps.team, deps.registry.get(slug), route);
  };
  const groupRoutes = (id: string): ModelRoute[] => {
    if (deps.routingGroups?.get(id) === undefined)
      throw new RoutingGroupError('not-found', `Routing Group ${id} does not exist`);
    return deps.routingGroups.routes(id);
  };
  const presetEngineChoices = (choices: ModelPresetEngineInput): EngineChoice[] =>
    [choices.orchestratorEngine, choices.assignmentEngine].filter((choice) => choice != null);
  const checkPresetEngines = async (
    choices: ModelPresetEngineInput,
    slug?: string,
  ): Promise<void> => {
    const selected = [choices.orchestratorEngine, choices.assignmentEngine].filter(
      (choice) => choice != null,
    );
    if (selected.length === 0) return;
    requireEngineChoices(selected, slug);
    const engines = deps.subscriptionEngines;
    if (engines === undefined)
      throw new EngineRefusal('engine-unavailable', 'Subscription Engines are unavailable');
    await Promise.all(selected.map((choice) => engines.validateChoice(choice.engine, choice)));
  };
  const presetGroupIds = (groups: ModelPresetGroups): string[] => [
    ...(groups.orchestratorGroupId === undefined ? [] : [groups.orchestratorGroupId]),
    ...(groups.assignmentGroups ?? []),
  ];
  const presetGroupRoutes = (groups: ModelPresetGroups, slug?: string): ModelRoute[] =>
    presetGroupIds(groups).flatMap((id) => {
      const routes = groupRoutes(id);
      requireGroupEngines(id, slug);
      return routes;
    });
  const requireGroupEfforts = async (group: string, efforts: readonly string[]): Promise<void> => {
    if (efforts.length === 0) return;
    if (deps.modelCatalog === undefined) throw new Error('Model catalog is unavailable');
    const shared = groupEfforts(groupRoutes(group), await deps.modelCatalog.list());
    const outside = efforts.filter((effort) => !shared.includes(effort));
    if (outside.length > 0)
      throw new RoutingGroupError(
        'invalid-input',
        `Routing Group ${deps.routingGroups?.get(group)?.name ?? group}: effort ${outside.join(', ')} is not supported by every reasoning member; shared levels: ${shared.join(', ') || 'none'}`,
      );
  };
  const validateGroupOptions = async (
    options: readonly AssignmentGroupOption[] | undefined,
  ): Promise<void> => {
    for (const option of options ?? [])
      await requireGroupEfforts(option.group, option.allowedEfforts ?? []);
  };
  const validateGroupEffort = async (groups: ModelPresetGroups | undefined): Promise<void> => {
    if (groups?.orchestratorGroupId === undefined || groups.orchestratorGroupEffort === undefined)
      return;
    await requireGroupEfforts(groups.orchestratorGroupId, [groups.orchestratorGroupEffort]);
  };
  const presetOrchestrator = async (
    orchestrator: unknown,
    groups: ModelPresetGroups | undefined,
  ): Promise<ModelRoute | undefined> => {
    if (groups?.orchestratorGroupId === undefined)
      return isModelRoute(orchestrator) ? orchestrator : undefined;
    if (orchestrator !== undefined) return undefined;
    return firstUsableRoute(groupRoutes(groups.orchestratorGroupId));
  };
  const validateAssignmentCatalog = async (
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
  ): Promise<void> => {
    validateAssignmentModels(assignmentDefault, assignmentModels);
    if (deps.modelCatalog === undefined) throw new Error('Model catalog is unavailable');
    await Promise.all(
      assignmentModels.flatMap((option) =>
        option.allowedEfforts.map((effort) =>
          deps.modelCatalog!.validate({
            provider: option.provider,
            model: option.model,
            ...(effort === '' ? {} : { reasoningEffort: effort }),
          }),
        ),
      ),
    );
  };
  return {
    catalogRests,
    catalogEntry,
    catalogGroups,
    favoritesOf,
    groupEngineChoices,
    memberEngineChoices,
    engineChoiceFilter,
    requireEngineChoices,
    requireGroupEngines,
    validateGroupMembers,
    assertEngineAccounts,
    firstUsableRoute,
    requireRoutes,
    groupRoutes,
    presetEngineChoices,
    checkPresetEngines,
    presetGroupIds,
    presetGroupRoutes,
    requireGroupEfforts,
    validateGroupOptions,
    validateGroupEffort,
    presetOrchestrator,
    validateAssignmentCatalog,
  };
}
