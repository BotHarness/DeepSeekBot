import { loadRoutingGroupEngines } from '@botharness/host-client/model-catalog';
import type * as prompts from '@botharness/host-client/prompt-presets';
import { inheritModelPlan, setOnboardingModel } from '@botharness/host-client/model-plans';
import { invalidateInheritedModelPlans } from './model-plan-store.js';
import { modelFavoritesEpoch, rememberModelFavorites } from './model-favorites.js';
import {
  bridgeHost,
  loadModelCatalog,
  setModelFavorite,
  loadModelPresets,
  loadModelPlan,
  loadModelPlanState,
  type ModelPlanStateView,
  createRoutingGroup,
  deleteRoutingGroup,
  loadRoutingGroups,
  updateRoutingGroup,
  type RestingRouteView,
  type RoutingGroupMemberView,
  type RoutingGroupView,
  applyModelPreset,
  customizeModelPlan,
  chooseModelPlanGroup,
  setModelPlanAssignments,
  setModelPlan,
  setStandingLimits,
  type ModelCatalogView,
  type ModelChoice,
  type ModelPlanGroupsView,
  type ModelPresetView,
  type ModelPlanView,
  type ModelRouteView,
  type AssignmentModelOptionView,
  type BridgeCall,
} from './bridge.js';
import type { BotSummary, StandingLimitsView } from './store.js';
import type { BridgeActions } from './actions.js';
import { recorded } from './actions-telemetry.js';

export interface ModelActions {
  onboardingModel(
    slug: string | undefined,
    expectedRevision: number,
    choice: ModelRouteView | { groupId: string; effort?: string },
    globalDefault: boolean,
  ): Promise<{ revision: number }>;
  inheritModel(slug: string, expectedRevision: number): Promise<{ revision: number }>;
  modelCatalog(): Promise<ModelCatalogView>;
  routingGroupEngines(): ReturnType<typeof loadRoutingGroupEngines>;
  setModelFavorite?(choice: ModelChoice, favorite: boolean): Promise<ModelChoice[]>;
  modelPresets(): Promise<ModelPresetView[]>;
  routingGroups(): Promise<{
    groups: RoutingGroupView[];
    rests: RestingRouteView[];
  }>;
  createRoutingGroup(name: string, members: RoutingGroupMemberView[]): Promise<RoutingGroupView>;
  updateRoutingGroup(
    id: string,
    expectedRevision: number,
    name: string,
    members: RoutingGroupMemberView[],
  ): Promise<RoutingGroupView>;
  deleteRoutingGroup(id: string, expectedRevision: number): Promise<RoutingGroupView>;
  modelPlan(slug: string): Promise<ModelPlanView | undefined>;
  modelPlanState(slug: string): Promise<ModelPlanStateView>;
  applyModelPreset(slug: string, presetId: string): Promise<ModelPlanView>;
  customizeModelPlan(
    slug: string,
    orchestrator: ModelRouteView,
    expectedRevision?: number,
  ): Promise<ModelPlanView>;
  chooseModelPlanGroup(
    slug: string,
    groupId: string,
    expectedRevision?: number,
    effort?: string,
  ): Promise<ModelPlanView>;
  setStandingLimits(slug: string, limits: StandingLimitsView): Promise<BotSummary>;
  setModelPlanAssignments(
    slug: string,
    expectedRevision: number,
    assignmentDefault: ModelRouteView,
    assignmentModels: AssignmentModelOptionView[],
  ): Promise<ModelPlanView>;
  setModelPlan(
    slug: string,
    expectedRevision: number,
    orchestrator: ModelRouteView,
    assignmentDefault: ModelRouteView,
    assignmentModels: AssignmentModelOptionView[],
    openAssignmentModels?: boolean,
    groups?: ModelPlanGroupsView,
  ): Promise<ModelPlanView>;
}

export function createModelActions(
  call: BridgeCall,
  host: prompts.PromptPresetClient,
  getActions: () => BridgeActions,
) {
  return {
    onboardingModel: async (slug, expectedRevision, choice, globalDefault) => {
      const result = await setOnboardingModel(host, {
        ...(slug === undefined ? {} : { slug }),
        expectedRevision,
        ...('groupId' in choice
          ? {
              groupId: choice.groupId,
              ...(choice.effort === undefined ? {} : { groupEffort: choice.effort }),
            }
          : { route: choice }),
        globalDefault,
      });
      if (globalDefault) invalidateInheritedModelPlans(getActions());
      return result;
    },
    inheritModel: (slug, expectedRevision) =>
      recorded(inheritModelPlan(host, slug, expectedRevision), () =>
        getActions().telemetryEvent('model:plan_update', { via: 'inherit' }),
      ),
    modelCatalog: () => {
      const seen = modelFavoritesEpoch();
      return loadModelCatalog(call).then((catalog) => {
        rememberModelFavorites(
          catalog.favorites,
          call,
          (choice, favorite) => setModelFavorite(call, choice, favorite),
          seen,
        );
        return catalog;
      });
    },
    setModelFavorite: (choice, favorite) => setModelFavorite(call, choice, favorite),
    modelPresets: () => loadModelPresets(call),
    routingGroups: () => loadRoutingGroups(call),
    routingGroupEngines: () => loadRoutingGroupEngines(bridgeHost(call)),
    createRoutingGroup: (name, members) => createRoutingGroup(call, name, members),
    updateRoutingGroup: (id, expectedRevision, name, members) =>
      updateRoutingGroup(call, id, expectedRevision, name, members),
    deleteRoutingGroup: (id, expectedRevision) => deleteRoutingGroup(call, id, expectedRevision),
    modelPlan: (slug) => loadModelPlan(call, slug),
    modelPlanState: (slug) => loadModelPlanState(call, slug),
    applyModelPreset: (slug, presetId) =>
      recorded(applyModelPreset(call, slug, presetId), () =>
        getActions().telemetryEvent('model:plan_update', { via: 'preset' }),
      ),
    customizeModelPlan: (slug, orchestrator, expectedRevision) =>
      recorded(customizeModelPlan(call, slug, orchestrator, expectedRevision), () =>
        getActions().telemetryEvent('model:plan_update', { via: 'custom' }),
      ),
    chooseModelPlanGroup: (slug, groupId, expectedRevision, effort) =>
      recorded(chooseModelPlanGroup(call, slug, groupId, expectedRevision, effort), () =>
        getActions().telemetryEvent('model:plan_update', { via: 'group' }),
      ),
    setStandingLimits: (slug, limits) => setStandingLimits(call, slug, limits),
    setModelPlanAssignments: (slug, expectedRevision, assignmentDefault, assignmentModels) =>
      recorded(
        setModelPlanAssignments(call, slug, expectedRevision, assignmentDefault, assignmentModels),
        () => getActions().telemetryEvent('model:plan_update', { via: 'assignments' }),
      ),
    setModelPlan: (
      slug,
      expectedRevision,
      orchestrator,
      assignmentDefault,
      assignmentModels,
      openAssignmentModels,
      groups,
    ) =>
      recorded(
        setModelPlan(
          call,
          slug,
          expectedRevision,
          orchestrator,
          assignmentDefault,
          assignmentModels,
          openAssignmentModels,
          groups,
        ),
        () => getActions().telemetryEvent('model:plan_update', { via: 'plan' }),
      ),
  } satisfies ModelActions;
}
