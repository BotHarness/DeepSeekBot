import {
  asObject,
  invalidInput,
  unavailable,
  unknownBot,
  asSlug,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import type { PersonaBotRecord } from '../../bots/persona-bot.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
import type { HumanContext } from '../../humans/context.js';
import {
  effectiveSubForMain,
  storedPlanSub,
  isPresetSub,
  presetSubProjection,
  resolveBotModelPlan,
  storedPresetSub,
  type PresetSub,
} from '../../models/preset-sub.js';
import {
  DEFAULT_MODEL_PRESET_ID,
  defaultPresetPlan,
  isModelRoute,
  ModelPresetError,
  type ModelPreset,
  type ModelPresetGroups,
  type ModelRoute,
  type PersonaBotModelPlan,
} from '../../models/presets.js';
import { EngineRefusal } from '../../engines/engine-session.js';
import { modelFailure } from '../../models/provider-bridge.js';
import { RoutingGroupError } from '../../models/routing-groups.js';
import { TeamError } from '../../team/error.js';
import { presetEnginesInput } from './inputs.js';
import type { ModelsBridgeDeps } from './deps.js';
import { routingGroupFailure, type createModelRoutingHelpers } from './routing.js';

export interface ModelPresetSubView {
  id: string;
  revision: number;
  sub: PresetSub;
  legacyOpen?: true;
}

export function readPlanSub(
  plan: PersonaBotModelPlan,
  presets: ModelsBridgeDeps['modelPresets'],
): PresetSub {
  if (plan.sub !== undefined || plan.assignmentDefault !== undefined) return storedPlanSub(plan);
  const preset = presets?.get(DEFAULT_MODEL_PRESET_ID);
  if (preset === undefined) return storedPlanSub(plan);
  return storedPlanSub(
    resolveBotModelPlan({ modelPlan: plan }, () => defaultPresetPlan(preset)) ?? plan,
  );
}

export interface ModelPlanSubView {
  slug: string;
  revision: number;
  sub: PresetSub;
  legacyOpen?: true;
}

export interface PresetSubBridgeMethods {
  modelPresetSub(payload: unknown): BridgeResult<ModelPresetSubView>;
  modelPresetSubSet(payload: unknown): Promise<BridgeResult<ModelPresetSubView>>;
  modelPlanSub(payload: unknown): BridgeResult<ModelPlanSubView>;
  modelPlanSubSet(payload: unknown): Promise<BridgeResult<ModelPlanSubView>>;
}

type MainChoice = Pick<
  ModelPreset,
  'orchestrator' | 'orchestratorGroupId' | 'orchestratorGroupEffort' | 'orchestratorEngine'
>;

export function createSubChecks(
  human: HumanContext,
  deps: Pick<BridgeMethodsDeps, 'team'>,
  isHostOwner: () => boolean,
  routing: ReturnType<typeof createModelRoutingHelpers>,
) {
  const {
    groupRoutes,
    groupEngineChoices,
    requireEngineChoices,
    requireEngineChoiceGrants,
    requireRoutes,
    checkPresetEngines,
    assertEngineAccounts,
    validateGroupOptions,
    validateAssignmentCatalog,
  } = routing;
  const requireConfigure = () => {
    if (human.caller === 'bot' || (!isHostOwner() && deps.team === undefined))
      throw new TeamError('permission-required', undefined, { permission: 'models.configure' });
    if (!isHostOwner()) deps.team?.roles.require(human, 'models.configure');
  };
  const requireModelRoutes = (routes: ModelRoute[], slug?: string) => {
    if (slug !== undefined) requireRoutes(slug, routes);
    else for (const route of routes) deps.team?.roles.requireModel(human, route);
  };
  const requireSubRoutes = (
    main: MainChoice,
    sub: PresetSub,
    { slug, grantsOnly }: { slug?: string; grantsOnly?: boolean } = {},
  ): void => {
    const requireEngines = grantsOnly ? requireEngineChoiceGrants : requireEngineChoices;
    const { choices } = effectiveSubForMain(main, sub);
    const routes: ModelRoute[] = [];
    for (const choice of choices) {
      if (choice.kind === 'model') routes.push(choice);
      else if (choice.kind === 'engine') requireEngines([choice], slug);
      else {
        routes.push(...groupRoutes(choice.group));
        requireEngines(groupEngineChoices(choice.group), slug);
      }
    }
    requireModelRoutes(routes, slug);
  };
  const validateSub = async (main: MainChoice, sub: PresetSub, slug?: string) => {
    await checkPresetEngines({ sub }, slug);
    const projection = presetSubProjection(sub, main.orchestrator);
    await validateGroupOptions(projection.assignmentGroupOptions);
    if (projection.assignmentModels !== undefined)
      await validateAssignmentCatalog(projection.assignmentDefault, projection.assignmentModels);
  };
  const assertSubAccounts = (sub: PresetSub) =>
    assertEngineAccounts(sub.choices.filter((choice) => choice.kind === 'engine'));
  return { requireConfigure, requireModelRoutes, requireSubRoutes, validateSub, assertSubAccounts };
}

export function createPresetSubMethods(
  human: HumanContext,
  deps: ModelsBridgeDeps & Pick<BridgeMethodsDeps, 'registry' | 'team'>,
  isHostOwner: () => boolean,
  requireOwnedBot: (slug: string) => void,
  {
    requireConfigure,
    requireSubRoutes,
    validateSub,
    assertSubAccounts,
  }: ReturnType<typeof createSubChecks>,
): PresetSubBridgeMethods {
  const subView = (preset: ModelPreset): ModelPresetSubView => ({
    id: preset.id,
    revision: preset.revision,
    sub: storedPresetSub(preset),
    ...(preset.openAssignmentModels === true ? { legacyOpen: true } : {}),
  });
  const planView = (slug: string, plan: PersonaBotModelPlan): ModelPlanSubView => ({
    slug,
    revision: plan.revision,
    sub: readPlanSub(plan, deps.modelPresets),
    ...(plan.openAssignmentModels === true ? { legacyOpen: true } : {}),
  });
  const failure = (error: unknown) =>
    error instanceof RoutingGroupError ? routingGroupFailure(error) : modelFailure(error);
  return {
    modelPresetSub(payload) {
      const store = deps.modelPresets;
      if (store === undefined) return unavailable();
      const id = asObject(payload)['id'];
      if (typeof id !== 'string') return invalidInput('A Model Preset id is required');
      try {
        if (!isHostOwner()) {
          if (deps.team === undefined)
            throw new TeamError('permission-required', undefined, { permission: 'models.use' });
          deps.team.roles.require(human, 'models.use');
        }
        const preset = store.get(id);
        if (preset === undefined) return invalidInput('Model Preset was not found');
        const view = subView(preset);
        if (!isHostOwner()) requireSubRoutes(preset, view.sub);
        return { ok: true, value: view };
      } catch (error) {
        return failure(error);
      }
    },
    async modelPresetSubSet(payload) {
      const store = deps.modelPresets;
      if (store === undefined || deps.modelCatalog === undefined) return unavailable();
      const { id, expectedRevision, sub } = asObject(payload);
      if (
        typeof id !== 'string' ||
        typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        !isPresetSub(sub)
      )
        return invalidInput(
          'A Model Preset id, revision and valid sub choices and default are required',
        );
      try {
        requireConfigure();
        const preset = store.get(id);
        if (preset === undefined) return invalidInput('Model Preset was not found');
        if (preset.revision !== expectedRevision)
          throw new ModelPresetError(
            'stale-setting',
            'Model Preset changed; read it again before saving',
          );
        const check = () => {
          requireConfigure();
          if (!isHostOwner())
            requireSubRoutes(preset, storedPresetSub(preset), { grantsOnly: true });
          requireSubRoutes(preset, sub);
        };
        check();
        await validateSub(preset, sub);
        check();
        assertSubAccounts(sub);
        return { ok: true, value: subView(store.setSub(id, expectedRevision, sub)) };
      } catch (error) {
        return failure(error);
      }
    },
    modelPlanSub(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      try {
        requireOwnedBot(slug);
        if (bot.modelPlan === undefined) return invalidInput('Apply a Model Preset first');
        return { ok: true, value: planView(slug, bot.modelPlan) };
      } catch (error) {
        return failure(error);
      }
    },
    async modelPlanSubSet(payload) {
      if (deps.modelCatalog === undefined) return unavailable();
      const slug = asSlug(payload);
      const { expectedRevision, sub } = asObject(payload);
      if (
        slug === undefined ||
        typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        !isPresetSub(sub)
      )
        return invalidInput(
          'A Bot, expected revision, and valid sub choices and default are required',
        );
      try {
        requireConfigure();
        requireOwnedBot(slug);
        const bot = deps.registry.get(slug);
        if (bot === undefined) return unknownBot(slug);
        const plan = bot.modelPlan;
        if (plan === undefined) return invalidInput('Apply a Model Preset first');
        const stale = () => invalidInput('Bot Model Plan changed; reopen it before saving');
        if (plan.revision !== expectedRevision) return stale();
        const check = () => {
          requireConfigure();
          if (!isHostOwner())
            requireSubRoutes(plan, readPlanSub(plan, deps.modelPresets), {
              slug,
              grantsOnly: true,
            });
          requireSubRoutes(plan, sub, { slug });
        };
        check();
        await validateSub(plan, sub, slug);
        check();
        assertSubAccounts(sub);
        const result = deps.registry.setModelPlanSub(slug, sub, expectedRevision);
        if (!result.ok) return result.reason === 'not-found' ? unknownBot(slug) : stale();
        const saved = result.record.modelPlan;
        if (saved === undefined) return unknownBot(slug);
        return { ok: true, value: planView(slug, saved) };
      } catch (error) {
        return failure(error);
      }
    },
  };
}

export function createSubWriters(
  human: HumanContext,
  deps: ModelsBridgeDeps & Pick<BridgeMethodsDeps, 'registry' | 'team'>,
  isHostOwner: () => boolean,
  {
    requireRoutes,
    presetGroupRoutes,
    presetOrchestrator,
    validateGroupEffort,
    requireEngineChoices,
    checkPresetEngines,
    assertEngineAccounts,
  }: ReturnType<typeof createModelRoutingHelpers>,
  {
    requireConfigure,
    requireModelRoutes,
    requireSubRoutes,
    validateSub,
    assertSubAccounts,
  }: ReturnType<typeof createSubChecks>,
) {
  const failure = (error: unknown) => {
    if (error instanceof RoutingGroupError) return routingGroupFailure(error);
    return error instanceof ModelPresetError ||
      error instanceof TeamError ||
      error instanceof EngineRefusal ||
      !deps.team ||
      deps.team.isOwner(human)
      ? modelFailure(error)
      : invalidInput('model-unavailable');
  };
  const savePresetWithSub = async (
    name: string,
    source: Record<string, unknown>,
    groups: ModelPresetGroups | undefined,
    sub: PresetSub,
    update?: { id: string; expectedRevision: number },
  ): Promise<BridgeResult<{ preset: ModelPreset }>> => {
    const { modelPresets: store, modelCatalog: catalog } = deps;
    if (store === undefined || catalog === undefined) return unavailable();
    try {
      requireConfigure();
      const current = update === undefined ? undefined : store.get(update.id);
      if (update !== undefined && current === undefined)
        return invalidInput('Model Preset was not found');
      if (update !== undefined && current?.revision !== update.expectedRevision)
        throw new ModelPresetError(
          'stale-setting',
          'Model Preset changed; read it again before saving',
        );
      const { orchestratorEngine } = presetEnginesInput(source);
      const selectedEngine =
        orchestratorEngine === undefined ? current?.orchestratorEngine : orchestratorEngine;
      const engines = selectedEngine == null ? [] : [selectedEngine];
      const checkMain = (orchestrator?: ModelRoute) => {
        requireConfigure();
        const routes = groups === undefined ? [] : presetGroupRoutes(groups);
        if (orchestrator !== undefined) routes.push(orchestrator);
        requireModelRoutes(routes);
        requireEngineChoices(engines);
        if (!isHostOwner() && current !== undefined)
          requireSubRoutes(current, storedPresetSub(current), { grantsOnly: true });
      };
      checkMain(isModelRoute(source['orchestrator']) ? source['orchestrator'] : undefined);
      const orchestrator = await presetOrchestrator(source['orchestrator'], groups);
      if (orchestrator === undefined) return invalidInput('A valid Orchestrator is required');
      const main = {
        orchestrator,
        ...groups,
        ...(selectedEngine == null ? {} : { orchestratorEngine: selectedEngine }),
      };
      requireSubRoutes(main, sub);
      await catalog.validate(orchestrator);
      await validateGroupEffort(groups);
      if (selectedEngine != null) await checkPresetEngines({ orchestratorEngine: selectedEngine });
      await validateSub(main, sub);
      checkMain(orchestrator);
      requireSubRoutes(main, sub);
      assertEngineAccounts(engines);
      assertSubAccounts(sub);
      const input = {
        name,
        orchestrator,
        sub,
        ...(groups === undefined ? {} : { groups }),
        ...(orchestratorEngine === undefined ? {} : { engines: { orchestratorEngine } }),
      };
      const preset =
        update === undefined
          ? store.create(input)
          : store.update(update.id, { ...input, expectedRevision: update.expectedRevision });
      return preset === undefined
        ? invalidInput('Model Preset was not found')
        : { ok: true, value: { preset } };
    } catch (error) {
      return failure(error);
    }
  };
  const savePlanWithSub = async ({
    bot,
    orchestrator,
    groups,
    sub,
    expectedRevision,
  }: {
    bot: PersonaBotRecord;
    orchestrator: unknown;
    groups: ModelPresetGroups | undefined;
    sub: PresetSub;
    expectedRevision: number;
  }): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>> => {
    const catalog = deps.modelCatalog;
    if (catalog === undefined) return unavailable();
    const { slug } = bot;
    try {
      const stale = () => invalidInput('Bot Model Plan changed; reopen it before saving');
      requireConfigure();
      requireRoutes(slug, []);
      if ((bot.modelPlan?.revision ?? bot.modelPlanRevision ?? 0) !== expectedRevision)
        return stale();
      const check = (main?: { orchestrator: ModelRoute }) => {
        requireConfigure();
        const routes = groups === undefined ? [] : presetGroupRoutes(groups, slug);
        if (main !== undefined) routes.push(main.orchestrator);
        else if (isModelRoute(orchestrator)) routes.push(orchestrator);
        requireRoutes(slug, routes);
        if (!isHostOwner() && bot.modelPlan !== undefined)
          requireSubRoutes(bot.modelPlan, readPlanSub(bot.modelPlan, deps.modelPresets), {
            slug,
            grantsOnly: true,
          });
        if (main !== undefined) requireSubRoutes(main, sub, { slug });
      };
      check();
      const route = await presetOrchestrator(orchestrator, groups);
      if (route === undefined) return invalidInput('A valid Orchestrator is required');
      const main = { orchestrator: route, ...groups };
      check(main);
      await catalog.validate(route);
      await validateGroupEffort(groups);
      await validateSub(main, sub, slug);
      check(main);
      assertSubAccounts(sub);
      const result = deps.registry.setModelPlan(
        slug,
        { orchestrator: route, sub, ...(groups === undefined ? {} : { groups }) },
        expectedRevision,
      );
      if (!result.ok) return result.reason === 'not-found' ? unknownBot(slug) : stale();
      if (result.record.modelPlan === undefined) return unknownBot(slug);
      return { ok: true, value: { plan: result.record.modelPlan } };
    } catch (error) {
      return failure(error);
    }
  };
  return { savePresetWithSub, savePlanWithSub };
}
