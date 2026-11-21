import { asRecord, bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import { setModelFavorite as setHostModelFavorite } from '@botharness/host-client/bot-settings';
import type {
  ModelCatalogGroup,
  ModelChoice,
  RoutingGroupMember,
} from '@botharness/host-client/model-catalog';
import {
  applyModelPreset as applyHostModelPreset,
  customizeModelPlan as customizeHostModelPlan,
  loadModelCatalog as loadHostModelCatalog,
  loadModelPlanState as loadHostModelPlanState,
  loadModelPresets as loadHostModelPresets,
  setModelPlan as setHostModelPlan,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type ModelPlan,
  type ModelPlanGroups,
  type ModelPlanState,
  type ModelPreset,
  type ModelRoute,
} from '@botharness/host-client/model-plans';

export type ModelRouteView = ModelRoute;

export type AssignmentModelOptionView = AssignmentModelOption;

export interface ModelCatalogEntryView {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts: { id: string; name: string }[];
  defaultEffort?: string;
  credential?: 'missing' | 'invalid';
  restingUntil?: string;
}

export type ModelCatalogGroupView = ModelCatalogGroup;

export interface ModelCatalogView {
  models: ModelCatalogEntryView[];
  default?: ModelRouteView;
  defaultGroupId?: string;
  defaultGroupEffort?: string;
  favorites?: ModelChoice[];
  groups?: ModelCatalogGroupView[];
}

export type { ModelChoice };

export async function setModelFavorite(
  call: BridgeCall,
  choice: ModelChoice,
  favorite: boolean,
): Promise<ModelChoice[]> {
  return setHostModelFavorite(bridgeHost(call), choice, favorite);
}

export type AssignmentGroupOptionView = AssignmentGroupOption;

export type ModelPlanGroupsView = Omit<ModelPlanGroups, 'openAssignmentModels'>;

function groupPayload(orchestrator: ModelRouteView, groups: ModelPlanGroupsView | undefined) {
  if (groups === undefined) return { orchestrator };
  const ids = groups.assignmentGroups ?? [];
  return {
    ...(groups.orchestratorGroupId === undefined ? { orchestrator } : {}),
    orchestratorGroupId: groups.orchestratorGroupId ?? null,
    ...(groups.orchestratorGroupId === undefined
      ? {}
      : { orchestratorGroupEffort: groups.orchestratorGroupEffort ?? null }),
    assignmentGroups: ids,
    assignmentDefaultGroupId:
      groups.assignmentDefaultGroupId !== undefined && ids.includes(groups.assignmentDefaultGroupId)
        ? groups.assignmentDefaultGroupId
        : null,
    assignmentGroupOptions: (groups.assignmentGroupOptions ?? []).filter((option) =>
      ids.includes(option.group),
    ),
  };
}

export type ModelPresetView = ModelPreset;

export type ModelPlanView = ModelPlan;

export async function loadModelCatalog(call: BridgeCall): Promise<ModelCatalogView> {
  const catalog = await loadHostModelCatalog(bridgeHost(call));
  return {
    models: catalog.models.map((entry) => ({
      ...entry,
      efforts: entry.efforts ?? [],
    })),
    ...(catalog.default === undefined
      ? {}
      : { default: { provider: catalog.default.provider, model: catalog.default.model } }),
    ...(catalog.defaultGroupId === undefined ? {} : { defaultGroupId: catalog.defaultGroupId }),
    ...(catalog.defaultGroupEffort === undefined
      ? {}
      : { defaultGroupEffort: catalog.defaultGroupEffort }),
    ...(catalog.favorites === undefined ? {} : { favorites: catalog.favorites }),
    ...(catalog.groups === undefined ? {} : { groups: catalog.groups }),
  };
}

export async function loadModelPresets(call: BridgeCall): Promise<ModelPresetView[]> {
  return loadHostModelPresets(bridgeHost(call));
}

export async function loadModelPlan(
  call: BridgeCall,
  slug: string,
): Promise<ModelPlanView | undefined> {
  return (await loadModelPlanState(call, slug)).plan;
}

export type ModelPlanStateView = ModelPlanState;

export async function loadModelPlanState(
  call: BridgeCall,
  slug: string,
): Promise<ModelPlanStateView> {
  return loadHostModelPlanState(bridgeHost(call), slug);
}

export type RoutingGroupMemberView = RoutingGroupMember;

export interface RoutingGroupView {
  id: string;
  name: string;
  revision: number;
  mode: 'order';
  members: RoutingGroupMemberView[];
  createdAt: string;
  updatedAt: string;
}

export interface RestingRouteView {
  provider: string;
  model: string;
  until: string;
  reason?: 'quota' | 'credential' | 'rate-limit';
}

export async function loadRoutingGroups(
  call: BridgeCall,
): Promise<{ groups: RoutingGroupView[]; rests: RestingRouteView[] }> {
  const value = asRecord(await unwrap(call, 'modelGroups', {}));
  if (!Array.isArray(value?.['groups'])) throw new Error('Invalid Routing Groups');
  return {
    groups: value['groups'] as RoutingGroupView[],
    rests: Array.isArray(value['rests']) ? (value['rests'] as RestingRouteView[]) : [],
  };
}

function routingGroupOf(value: unknown): RoutingGroupView {
  const group = asRecord(asRecord(value)?.['group']);
  if (group === undefined) throw new Error('Invalid Routing Group result');
  return group as unknown as RoutingGroupView;
}

export async function createRoutingGroup(
  call: BridgeCall,
  name: string,
  members: RoutingGroupMemberView[],
): Promise<RoutingGroupView> {
  return routingGroupOf(await unwrap(call, 'modelGroupCreate', { name, members }));
}

export async function updateRoutingGroup(
  call: BridgeCall,
  id: string,
  expectedRevision: number,
  name: string,
  members: RoutingGroupMemberView[],
): Promise<RoutingGroupView> {
  return routingGroupOf(
    await unwrap(call, 'modelGroupUpdate', {
      id,
      expectedRevision,
      name,
      members,
    }),
  );
}

export async function deleteRoutingGroup(
  call: BridgeCall,
  id: string,
  expectedRevision: number,
): Promise<RoutingGroupView> {
  return routingGroupOf(await unwrap(call, 'modelGroupDelete', { id, expectedRevision }));
}

export async function applyModelPreset(
  call: BridgeCall,
  slug: string,
  presetId: string,
): Promise<ModelPlanView> {
  return applyHostModelPreset(bridgeHost(call), slug, presetId);
}

export async function customizeModelPlan(
  call: BridgeCall,
  slug: string,
  orchestrator: ModelRouteView,
  expectedRevision?: number,
): Promise<ModelPlanView> {
  return customizeHostModelPlan(bridgeHost(call), slug, { orchestrator }, expectedRevision);
}

export async function chooseModelPlanGroup(
  call: BridgeCall,
  slug: string,
  groupId: string,
  expectedRevision?: number,
  effort = '',
): Promise<ModelPlanView> {
  return customizeHostModelPlan(
    bridgeHost(call),
    slug,
    { orchestratorGroupId: groupId, ...(effort === '' ? {} : { orchestratorGroupEffort: effort }) },
    expectedRevision,
  );
}

export async function setModelPlanAssignments(
  call: BridgeCall,
  slug: string,
  expectedRevision: number,
  assignmentDefault: ModelRouteView,
  assignmentModels: AssignmentModelOptionView[],
): Promise<ModelPlanView> {
  const value = asRecord(
    await unwrap(call, 'modelPlanAssignmentsSet', {
      slug,
      expectedRevision,
      assignmentDefault,
      assignmentModels,
    }),
  );
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export async function setModelPlan(
  call: BridgeCall,
  slug: string,
  expectedRevision: number,
  orchestrator: ModelRouteView,
  assignmentDefault: ModelRouteView,
  assignmentModels: AssignmentModelOptionView[],
  openAssignmentModels?: boolean,
  groups?: ModelPlanGroupsView,
): Promise<ModelPlanView> {
  return setHostModelPlan(bridgeHost(call), slug, expectedRevision, {
    ...groupPayload(orchestrator, groups),
    assignmentDefault,
    assignmentModels,
    ...(openAssignmentModels === undefined ? {} : { openAssignmentModels }),
  });
}
