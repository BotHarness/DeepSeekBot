import { QueryClient } from '@tanstack/react-query';

import {
  currentModel,
  HostAnswerInvalid,
  loadBotModel,
  loadGlobalModel,
  sameModel,
  type AssignmentModelOption,
  type BotModel,
  type ModelCatalogEntry,
  type ModelPreset,
  type ModelRoute,
} from './bot-settings';
import type { HostClient } from './client';

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

const owners = new WeakMap<HostClient, QueryClient>();
export function modelSettingsResource(client: HostClient, scope: ModelScope) {
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
  return { orchestrator, assignmentDefault, assignmentModels };
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
  client: HostClient,
  scope: ModelScope,
  state: ModelSettingsState,
  routes: {
    orchestrator: ModelRoute;
    assignmentDefault: ModelRoute;
    assignmentModels: AssignmentModelOption[];
  },
): Promise<void> {
  if (scope.kind === 'global') throw new HostAnswerInvalid('BOT_OR_PRESET_REQUIRED');
  if (scope.kind === 'preset') {
    if (state.preset?.revision === undefined)
      throw new HostAnswerInvalid('MODEL_PRESET_REVISION_REQUIRED');
    await client.call('modelPresetUpdate', {
      id: scope.id,
      expectedRevision: state.preset.revision,
      name: state.preset.name,
      ...routes,
    });
  } else {
    await client.call('modelPlanSet', {
      slug: scope.slug,
      expectedRevision: state.plan?.revision ?? state.revision,
      ...routes,
    });
  }
}

export async function setModelRoute(
  client: HostClient,
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
    await client.call('onboardingModel', { expectedRevision: 0, route, globalDefault: true });
    return;
  }
  const previous = modelRoutes(state);
  if (scope.kind === 'bot' && field === 'orchestrator') {
    await client.call('modelPlanCustomize', {
      slug: scope.slug,
      expectedRevision: state.plan?.revision ?? state.revision,
      orchestrator: route,
    });
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
  });
}

export async function toggleAssignmentModel(
  client: HostClient,
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
  });
}

export async function inheritModel(
  client: HostClient,
  slug: string,
  state: ModelSettingsState,
): Promise<void> {
  await client.call('modelPlanInherit', {
    slug,
    expectedRevision: state.plan?.revision ?? state.revision,
  });
}

export async function saveModelPreset(
  client: HostClient,
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
  const value = await client.call<{ preset: { id: string } }>(
    update ? 'modelPresetUpdate' : 'modelPresetCreate',
    {
      ...(update && preset !== undefined
        ? { id: preset.id, expectedRevision: preset.revision }
        : {}),
      name: name.trim(),
      orchestrator,
      assignmentDefault,
      assignmentModels,
    },
  );
  if (typeof value.preset?.id !== 'string') throw new HostAnswerInvalid('MODEL_PRESET_NOT_SAVED');
  return value.preset.id;
}
