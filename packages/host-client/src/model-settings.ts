import { QueryClient } from '@tanstack/query-core';

import {
  currentModel,
  HostAnswerInvalid,
  loadBotModel,
  loadGlobalModel,
  sameModel,
  setModelFavorite,
  type AssignmentModelOption,
  type BotModel,
  type ModelCatalogEntry,
  type ModelChoice,
  type ModelPlanGroups,
  type ModelPreset,
  type ModelRoute,
  type ModelSettingsClient,
} from './bot-settings';
import { recordFeature } from './telemetry/features';
import { serialWrites } from './model-catalog';

export type ModelScope =
  | { kind: 'global' }
  | { kind: 'bot'; slug: string }
  | { kind: 'preset'; id: string };
export type ModelField =
  | 'orchestrator'
  | 'assignment'
  | 'allowed'
  | 'orchestrator-effort'
  | 'assignment-effort';
export type ModelSettingsState = BotModel & { preset?: ModelPreset };

export function modelScopeKey(scope: ModelScope): string {
  return scope.kind === 'bot'
    ? `bot:${scope.slug}`
    : scope.kind === 'preset'
      ? `preset:${scope.id}`
      : 'global';
}

const owners = new WeakMap<ModelSettingsClient, QueryClient>();
const favoriteWriters = new WeakMap<
  ModelSettingsClient,
  (choice: ModelChoice, favorite: boolean) => Promise<ModelChoice[]>
>();
function writeFavorite(client: ModelSettingsClient) {
  let write = favoriteWriters.get(client);
  if (write === undefined) {
    write = serialWrites((choice: ModelChoice, favorite: boolean) =>
      setModelFavorite(client, choice, favorite),
    );
    favoriteWriters.set(client, write);
  }
  return write;
}
export function modelSettingsResource(client: ModelSettingsClient, scope: ModelScope) {
  let queries = owners.get(client);
  if (queries === undefined) {
    queries = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 10 * 60 * 1000 } },
    });
    owners.set(client, queries);
  }
  const owner = queries;
  const queryKey = ['mobile-model-settings', modelScopeKey(scope)];
  return {
    peek: () => owner.getQueryData<ModelSettingsState>(queryKey),
    write: async (work: () => Promise<void>) => {
      await owner.cancelQueries({ queryKey, exact: true });
      await work();
      await owner.cancelQueries({ queryKey, exact: true });
      await owner.invalidateQueries({ queryKey: ['mobile-model-settings'], refetchType: 'none' });
    },
    favorite: async (choice: ModelChoice, favorite: boolean) => {
      const favorites = await writeFavorite(client)(choice, favorite);
      owner.setQueriesData<ModelSettingsState>({ queryKey: ['mobile-model-settings'] }, (old) =>
        old === undefined ? old : { ...old, favorites },
      );
      await owner.invalidateQueries({ queryKey: ['mobile-model-settings'], refetchType: 'none' });
      return favorites;
    },
    refresh: () =>
      owner.fetchQuery({
        queryKey,
        staleTime: 0,
        queryFn: async () => {
          if (scope.kind === 'bot') return loadBotModel(client, scope.slug, true);
          const model = await loadGlobalModel(client);
          if (scope.kind === 'global') return model;
          const preset = model.presets.find((entry) => entry.id === scope.id);
          if (preset === undefined) throw new HostAnswerInvalid('MODEL_PRESET_NOT_FOUND');
          return { ...model, preset };
        },
      }),
  };
}

export function modelRoutes(state: ModelSettingsState) {
  const source = state.preset ?? state.plan;
  const orchestrator = source?.orchestrator ?? currentModel(state).route;
  const assignmentDefault = source?.assignmentDefault;
  const assignmentModels: AssignmentModelOption[] =
    source?.assignmentModels ??
    (assignmentDefault === undefined
      ? []
      : [
          {
            provider: assignmentDefault.provider,
            model: assignmentDefault.model,
            allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
            defaultEffort: assignmentDefault.reasoningEffort ?? '',
          },
        ]);
  const groups: ModelPlanGroups = {
    ...(source?.orchestratorGroupId === undefined
      ? {}
      : { orchestratorGroupId: source.orchestratorGroupId }),
    ...(source?.assignmentGroups === undefined
      ? {}
      : { assignmentGroups: [...source.assignmentGroups] }),
    ...(source?.assignmentDefaultGroupId === undefined
      ? {}
      : { assignmentDefaultGroupId: source.assignmentDefaultGroupId }),
    ...(source?.assignmentGroupOptions === undefined
      ? {}
      : { assignmentGroupOptions: source.assignmentGroupOptions.map((option) => ({ ...option })) }),
  };
  return { orchestrator, assignmentDefault, assignmentModels, groups };
}

function groupFields(groups: ModelPlanGroups, orchestrator: ModelRoute) {
  const ids = groups.assignmentGroups ?? [];
  return {
    ...(groups.orchestratorGroupId === undefined ? { orchestrator } : {}),
    orchestratorGroupId: groups.orchestratorGroupId ?? null,
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

export function searchModels(
  models: readonly ModelCatalogEntry[],
  query: string,
): ModelCatalogEntry[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return models
    .filter((entry) => {
      const text =
        `${entry.provider} ${entry.providerName} ${entry.model} ${entry.modelName}`.toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    })
    .sort((a, b) => Number(a.credential !== undefined) - Number(b.credential !== undefined));
}

function requireRoute(route: ModelRoute | undefined): ModelRoute {
  if (route === undefined) throw new HostAnswerInvalid('MODEL_REQUIRED');
  return route;
}

async function writePlan(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  routes: {
    orchestrator: ModelRoute;
    assignmentDefault: ModelRoute;
    assignmentModels: AssignmentModelOption[];
    groups: ModelPlanGroups;
  },
): Promise<void> {
  if (scope.kind === 'global') throw new HostAnswerInvalid('BOT_OR_PRESET_REQUIRED');
  const fields = {
    ...groupFields(routes.groups, routes.orchestrator),
    assignmentDefault: routes.assignmentDefault,
    assignmentModels: routes.assignmentModels,
  };
  if (scope.kind === 'preset') {
    if (state.preset?.revision === undefined)
      throw new HostAnswerInvalid('MODEL_PRESET_REVISION_REQUIRED');
    await client.call('modelPresetUpdate', {
      id: scope.id,
      expectedRevision: state.preset.revision,
      name: state.preset.name,
      ...fields,
    });
  } else {
    await client.call('modelPlanSet', {
      slug: scope.slug,
      expectedRevision: state.plan?.revision ?? state.revision,
      ...fields,
    });
  }
}

function withoutKey<T extends object, K extends keyof T>(value: T, key: K): Omit<T, K> {
  const { [key]: _removed, ...rest } = value;
  return rest;
}

export async function setModelRoute(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  field: 'orchestrator' | 'assignment',
  route: ModelRoute,
): Promise<void> {
  const entry = state.models.find((item) => sameModel(item, route));
  if (entry === undefined || entry.credential !== undefined)
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  if (scope.kind === 'global') {
    if (field !== 'orchestrator') throw new HostAnswerInvalid('GLOBAL_MODEL_REQUIRED');
    if (
      state.defaultRevision === undefined ||
      !Number.isSafeInteger(state.defaultRevision) ||
      state.defaultRevision < 0
    )
      throw new HostAnswerInvalid('MODEL_DEFAULT_REVISION_REQUIRED');
    await client.call('onboardingModel', {
      expectedRevision: 0,
      expectedDefaultRevision: state.defaultRevision,
      route,
      globalDefault: true,
    });
    recordFeature('model:plan_update', { via: 'default' });
    return;
  }
  const previous = modelRoutes(state);
  if (scope.kind === 'bot' && field === 'orchestrator') {
    await client.call('modelPlanCustomize', {
      slug: scope.slug,
      expectedRevision: state.plan?.revision ?? state.revision,
      orchestrator: route,
    });
    recordFeature('model:plan_update', { via: 'custom' });
    return;
  }
  const assignmentDefault =
    field === 'assignment' ? route : requireRoute(previous.assignmentDefault);
  const effort = assignmentDefault.reasoningEffort ?? '';
  const assignmentModels = previous.assignmentModels.some((option) =>
    sameModel(option, assignmentDefault),
  )
    ? previous.assignmentModels.map((option) =>
        sameModel(option, assignmentDefault)
          ? {
              ...option,
              defaultEffort: effort,
              allowedEfforts: option.allowedEfforts.includes(effort)
                ? [...option.allowedEfforts]
                : [...option.allowedEfforts, effort],
            }
          : option,
      )
    : [
        ...previous.assignmentModels,
        {
          provider: assignmentDefault.provider,
          model: assignmentDefault.model,
          allowedEfforts: [effort],
          defaultEffort: effort,
        },
      ];
  await writePlan(client, scope, state, {
    orchestrator: field === 'orchestrator' ? route : requireRoute(previous.orchestrator),
    assignmentDefault,
    assignmentModels,
    groups: withoutKey(
      previous.groups,
      field === 'orchestrator' ? 'orchestratorGroupId' : 'assignmentDefaultGroupId',
    ),
  });
  recordFeature('model:plan_update', { via: 'plan' });
}

export async function setModelGroup(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  groupId: string,
  field: 'orchestrator' | 'assignment' = 'orchestrator',
): Promise<void> {
  const group = state.groups?.find((entry) => entry.id === groupId);
  if (group === undefined || group.restingUntil !== undefined)
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  if (field === 'assignment' || scope.kind === 'preset') {
    if (scope.kind === 'global') throw new HostAnswerInvalid('GLOBAL_MODEL_REQUIRED');
    const previous = modelRoutes(state);
    const front = requireRoute(group.routes[0]);
    const ids = previous.groups.assignmentGroups ?? [];
    const assignmentDefault = previous.assignmentDefault ?? front;
    await writePlan(client, scope, state, {
      orchestrator: requireRoute(previous.orchestrator),
      assignmentDefault,
      assignmentModels:
        previous.assignmentModels.length > 0
          ? previous.assignmentModels
          : [
              {
                provider: assignmentDefault.provider,
                model: assignmentDefault.model,
                allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
                defaultEffort: assignmentDefault.reasoningEffort ?? '',
              },
            ],
      groups:
        field === 'orchestrator'
          ? { ...previous.groups, orchestratorGroupId: groupId }
          : {
              ...previous.groups,
              assignmentGroups: ids.includes(groupId) ? ids : [...ids, groupId],
              assignmentDefaultGroupId: groupId,
            },
    });
    recordFeature('model:plan_update', { via: 'group' });
    return;
  }
  if (scope.kind === 'global') {
    await client.call('onboardingModel', {
      expectedRevision: 0,
      ...(state.defaultRevision === undefined
        ? {}
        : { expectedDefaultRevision: state.defaultRevision }),
      groupId,
      globalDefault: true,
    });
    recordFeature('model:plan_update', { via: 'group' });
    return;
  }
  await client.call('modelPlanCustomize', {
    slug: scope.slug,
    expectedRevision: state.plan?.revision ?? state.revision,
    orchestratorGroupId: groupId,
  });
  recordFeature('model:plan_update', { via: 'group' });
}

export async function toggleAssignmentModel(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  entry: ModelCatalogEntry,
): Promise<void> {
  const routes = modelRoutes(state);
  const assignmentDefault = requireRoute(routes.assignmentDefault);
  if (sameModel(entry, assignmentDefault))
    throw new HostAnswerInvalid('ASSIGNMENT_DEFAULT_REQUIRED');
  if (
    entry.credential !== undefined &&
    !routes.assignmentModels.some((option) => sameModel(option, entry))
  )
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  const assignmentModels = routes.assignmentModels.some((option) => sameModel(option, entry))
    ? routes.assignmentModels.filter((option) => !sameModel(option, entry))
    : [
        ...routes.assignmentModels,
        {
          provider: entry.provider,
          model: entry.model,
          allowedEfforts: [entry.defaultEffort ?? ''],
          defaultEffort: entry.defaultEffort ?? '',
        },
      ];
  await writePlan(client, scope, state, {
    orchestrator: requireRoute(routes.orchestrator),
    assignmentDefault,
    assignmentModels,
    groups: routes.groups,
  });
  recordFeature('model:plan_update', { via: 'assignments' });
}

export async function toggleAssignmentGroup(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  groupId: string,
): Promise<void> {
  const routes = modelRoutes(state);
  const assignmentDefault = requireRoute(routes.assignmentDefault);
  if (routes.groups.assignmentDefaultGroupId === groupId)
    throw new HostAnswerInvalid('ASSIGNMENT_DEFAULT_REQUIRED');
  const ids = routes.groups.assignmentGroups ?? [];
  const listed = ids.includes(groupId);
  if (!listed && state.groups?.some((entry) => entry.id === groupId) !== true)
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  await writePlan(client, scope, state, {
    orchestrator: requireRoute(routes.orchestrator),
    assignmentDefault,
    assignmentModels: routes.assignmentModels,
    groups: {
      ...routes.groups,
      assignmentGroups: listed ? ids.filter((id) => id !== groupId) : [...ids, groupId],
    },
  });
  recordFeature('model:plan_update', { via: 'assignments' });
}

export async function inheritModel(
  client: ModelSettingsClient,
  slug: string,
  state: ModelSettingsState,
): Promise<void> {
  await client.call('modelPlanInherit', {
    slug,
    expectedRevision: state.plan?.revision ?? state.revision,
  });
  recordFeature('model:plan_update', { via: 'inherit' });
}

export async function saveModelPreset(
  client: ModelSettingsClient,
  state: ModelSettingsState,
  name: string,
  update = false,
): Promise<string> {
  if (name.trim() === '') throw new HostAnswerInvalid('MODEL_PRESET_NAME_REQUIRED');
  const routes = modelRoutes(state);
  const orchestrator = requireRoute(routes.orchestrator);
  const assignmentDefault = routes.assignmentDefault ?? orchestrator;
  const assignmentModels =
    routes.assignmentDefault === undefined
      ? [
          {
            provider: assignmentDefault.provider,
            model: assignmentDefault.model,
            allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
            defaultEffort: assignmentDefault.reasoningEffort ?? '',
          },
        ]
      : routes.assignmentModels;
  const preset = state.preset;
  if (update && preset?.revision === undefined)
    throw new HostAnswerInvalid('MODEL_PRESET_REVISION_REQUIRED');
  const value = await client.call(update ? 'modelPresetUpdate' : 'modelPresetCreate', {
    ...(update && preset !== undefined ? { id: preset.id, expectedRevision: preset.revision } : {}),
    name: name.trim(),
    ...groupFields(routes.groups, orchestrator),
    assignmentDefault,
    assignmentModels,
  });
  if (typeof value !== 'object' || value === null || !('preset' in value))
    throw new HostAnswerInvalid('MODEL_PRESET_NOT_SAVED');
  const presetAnswer = value.preset;
  if (
    typeof presetAnswer !== 'object' ||
    presetAnswer === null ||
    !('id' in presetAnswer) ||
    typeof presetAnswer.id !== 'string'
  )
    throw new HostAnswerInvalid('MODEL_PRESET_NOT_SAVED');
  return presetAnswer.id;
}
