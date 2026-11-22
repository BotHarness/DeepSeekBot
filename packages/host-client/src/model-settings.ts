import { QueryClient } from '@tanstack/query-core';
import {
  matchesPresetSubChoice,
  presetSubFromLegacy,
  presetSubWithEngine,
} from '@botharness/host-protocol/preset-sub';
import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';

import {
  currentModel,
  HostAnswerInvalid,
  loadBotModel,
  loadGlobalModel,
  sameModel,
  setModelFavorite,
  type AssignmentGroupOption,
  type AssignmentModelOption,
  type BotModel,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
  type ModelChoice,
  type ModelPlanGroups,
  type ModelPreset,
  type ModelRoute,
  type ModelSettingsClient,
} from './bot-settings';
import { recordFeature } from './telemetry/features';
import { answerRecord, record } from './host-answer';
import {
  engineCatalogModel,
  modelCatalogGroupEfforts,
  modelCatalogGroupFront,
  modelEffortChoices,
  parseRoutingGroup,
  routingGroupEngineChoices,
  serialWrites,
  type RoutingGroup,
  type RoutingGroupMember,
} from './model-catalog';
import {
  createModelPreset,
  customizeModelPlan,
  DEFAULT_MODEL_PRESET_ID,
  inheritModelPlan,
  setModelPlan,
  setOnboardingModel,
  updateModelPreset,
} from './model-plans';
import {
  cleanSub,
  savePlanSub,
  savePresetSub,
  type SubChoice,
  type SubChoices,
  type SubSelection,
} from './preset-sub';

export const ASSIGNMENT_GROUP_NOTE_MAX = 500;

export type ModelScope =
  | { kind: 'global' }
  | { kind: 'bot'; slug: string }
  | { kind: 'preset'; id: string };
export type ModelField =
  | 'orchestrator'
  | 'assignment'
  | 'allowed'
  | 'allowed-effort'
  | 'orchestrator-effort'
  | 'assignment-effort'
  | 'sub-add'
  | 'sub-effort';
export type ModelSettingsState = BotModel & { preset?: ModelPreset };

export function modelScopeKey(scope: ModelScope): string {
  return scope.kind === 'bot'
    ? `bot:${scope.slug}`
    : scope.kind === 'preset'
      ? `preset:${scope.id}`
      : 'global';
}

const owners = new WeakMap<ModelSettingsClient, QueryClient>();
const modelSettingsKey = ['mobile-model-settings'];
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
  const queryKey = [...modelSettingsKey, modelScopeKey(scope)];
  return {
    peek: () => owner.getQueryData<ModelSettingsState>(queryKey),
    write: async (work: () => Promise<void>) => {
      await owner.cancelQueries({ queryKey, exact: true });
      await work();
      await owner.cancelQueries({ queryKey, exact: true });
      await owner.invalidateQueries({
        queryKey: modelSettingsKey,
        refetchType: 'none',
      });
    },
    favorite: async (choice: ModelChoice, favorite: boolean) => {
      const favorites = await writeFavorite(client)(choice, favorite);
      owner.setQueriesData<ModelSettingsState>({ queryKey: modelSettingsKey }, (old) =>
        old === undefined ? old : { ...old, favorites },
      );
      await owner.invalidateQueries({
        queryKey: modelSettingsKey,
        refetchType: 'none',
      });
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
  const orchestratorGroupId =
    source === undefined ? state.defaultGroupId : source.orchestratorGroupId;
  const orchestratorGroupEffort =
    source === undefined ? state.defaultGroupEffort : source.orchestratorGroupEffort;
  const groups: ModelPlanGroups = {
    ...(orchestratorGroupId === undefined ? {} : { orchestratorGroupId }),
    ...(orchestratorGroupId === undefined || orchestratorGroupEffort === undefined
      ? {}
      : { orchestratorGroupEffort }),
    ...(source?.assignmentGroups === undefined
      ? {}
      : { assignmentGroups: [...source.assignmentGroups] }),
    ...(source?.assignmentDefaultGroupId === undefined
      ? {}
      : { assignmentDefaultGroupId: source.assignmentDefaultGroupId }),
    ...(source?.assignmentGroupOptions === undefined
      ? {}
      : { assignmentGroupOptions: source.assignmentGroupOptions.map((option) => ({ ...option })) }),
    ...(source?.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
  };
  return { orchestrator, assignmentDefault, assignmentModels, groups };
}

export function subInherited(state: ModelSettingsState): boolean {
  return (
    state.preset === undefined &&
    state.plan?.sub === undefined &&
    state.plan?.assignmentDefault === undefined
  );
}

function defaultPreset(state: ModelSettingsState): ModelPreset | undefined {
  return state.presets.find((entry) => entry.id === DEFAULT_MODEL_PRESET_ID);
}

export function modelSub(state: ModelSettingsState): SubChoices {
  const preset = state.preset ?? (subInherited(state) ? defaultPreset(state) : undefined);
  if (preset !== undefined) {
    return preset.sub ?? presetSubWithEngine(presetSubFromLegacy(preset), preset.assignmentEngine);
  }
  return state.plan?.sub ?? presetSubFromLegacy(state.plan ?? {});
}

export async function setModelSub(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  next: SubChoices,
): Promise<void> {
  if (scope.kind === 'global') throw new HostAnswerInvalid('USE_DEFAULT_PRESET');
  const sub = cleanSub(next);
  if (scope.kind === 'preset') {
    if (state.preset?.id !== scope.id || state.preset.revision === undefined)
      throw new HostAnswerInvalid('MODEL_PRESET_REVISION_REQUIRED');
    await savePresetSub(client, { id: scope.id, expectedRevision: state.preset.revision, sub });
  } else if (state.plan !== undefined) {
    await savePlanSub(client, { slug: scope.slug, expectedRevision: state.plan.revision, sub });
  } else {
    const { defaultGroupId, defaultGroupEffort } = state;
    await setModelPlan(client, scope.slug, state.revision, {
      ...(defaultGroupId === undefined
        ? { orchestrator: requireRoute(currentModel(state).route) }
        : {
            orchestratorGroupId: defaultGroupId,
            ...(defaultGroupEffort === undefined
              ? {}
              : { orchestratorGroupEffort: defaultGroupEffort }),
          }),
      sub,
    });
  }
  recordFeature('model:plan_update', { via: 'sub' });
}

function groupFields(groups: ModelPlanGroups, orchestrator: ModelRoute) {
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
    ...(groups.openAssignmentModels === true ? { openAssignmentModels: true } : {}),
  };
}

export function searchModels(
  models: readonly ModelCatalogEntry[],
  query: string,
): ModelCatalogEntry[] {
  const matches = catalogSearch(query);
  return models
    .filter((entry) =>
      matches(`${entry.provider} ${entry.providerName} ${entry.model} ${entry.modelName}`),
    )
    .sort((a, b) => Number(a.credential !== undefined) - Number(b.credential !== undefined));
}

function catalogSearch(query: string): (label: string) => boolean {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return (label) => {
    const text = label.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  };
}

type EnginePickerEntry = ReturnType<typeof routingGroupEngineChoices>[number];

export type SubAddOption =
  | { kind: 'model'; entry: ModelCatalogEntry; choice: Extract<SubChoice, { kind: 'model' }> }
  | { kind: 'group'; group: ModelCatalogGroup; choice: Extract<SubChoice, { kind: 'group' }> }
  | { kind: 'engine'; entry: EnginePickerEntry; choice: Extract<SubChoice, { kind: 'engine' }> };

export function searchSubChoices(
  state: ModelSettingsState,
  query: string,
  engines: readonly RoutingGroupEngineOptions[] = state.engines ?? [],
): SubAddOption[] {
  const matches = catalogSearch(query);
  const options: SubAddOption[] = [
    ...(state.groups ?? [])
      .filter((group) => matches(`${group.name} ${group.id}`))
      .map((group): SubAddOption => ({
        kind: 'group',
        group,
        choice: { kind: 'group', group: group.id },
      })),
    ...searchModels(state.models, query)
      .filter((entry) => entry.credential === undefined)
      .map((entry): SubAddOption => ({
        kind: 'model',
        entry,
        choice: {
          kind: 'model',
          provider: entry.provider,
          model: entry.model,
          ...modelEffortChoices(entry),
        },
      })),
    ...routingGroupEngineChoices(engines)
      .filter(({ member, model, accountName }) =>
        matches(`${member.engine} ${model.id} ${model.name} ${accountName ?? ''}`),
      )
      .map((entry): SubAddOption => ({ kind: 'engine', entry, choice: entry.member })),
  ];
  const { choices } = modelSub(state);
  return options.filter(
    ({ choice }) => !choices.some((entry) => matchesPresetSubChoice(entry, choice)),
  );
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
    await updateModelPreset(client, scope.id, state.preset.revision, {
      name: state.preset.name,
      ...fields,
    });
  } else {
    await setModelPlan(client, scope.slug, state.plan?.revision ?? state.revision, fields);
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
    await setOnboardingModel(client, {
      expectedRevision: 0,
      expectedDefaultRevision: state.defaultRevision,
      ...(state.defaultGroupRevision === undefined
        ? {}
        : { expectedDefaultGroupRevision: state.defaultGroupRevision }),
      route,
      globalDefault: true,
    });
    recordFeature('model:plan_update', { via: 'default' });
    return;
  }
  const previous = modelRoutes(state);
  if (scope.kind === 'bot' && field === 'orchestrator') {
    await customizeModelPlan(
      client,
      scope.slug,
      { orchestrator: route },
      state.plan?.revision ?? state.revision,
    );
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
  effort = '',
): Promise<void> {
  const group = state.groups?.find((entry) => entry.id === groupId);
  if (group === undefined || group.restingUntil !== undefined)
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  if (effort !== '' && !modelCatalogGroupEfforts(group, state.models).some((e) => e.id === effort))
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  if (field === 'assignment' || scope.kind === 'preset') {
    if (scope.kind === 'global') throw new HostAnswerInvalid('GLOBAL_MODEL_REQUIRED');
    const previous = modelRoutes(state);
    const front = requireRoute(modelCatalogGroupFront(group, state.models));
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
          ? {
              ...withoutKey(previous.groups, 'orchestratorGroupEffort'),
              orchestratorGroupId: groupId,
              ...(effort === '' ? {} : { orchestratorGroupEffort: effort }),
            }
          : {
              ...previous.groups,
              assignmentGroups: ids.includes(groupId) ? ids : [...ids, groupId],
              assignmentDefaultGroupId: groupId,
              assignmentGroupOptions: groupDefaultEffort(
                previous.groups.assignmentGroupOptions ?? [],
                groupId,
                effort,
              ),
            },
    });
    recordFeature('model:plan_update', { via: 'group' });
    return;
  }
  if (scope.kind === 'global') {
    await setOnboardingModel(client, {
      expectedRevision: 0,
      ...(state.defaultRevision === undefined
        ? {}
        : { expectedDefaultRevision: state.defaultRevision }),
      ...(state.defaultGroupRevision === undefined
        ? {}
        : { expectedDefaultGroupRevision: state.defaultGroupRevision }),
      groupId,
      ...(effort === '' ? {} : { groupEffort: effort }),
      globalDefault: true,
    });
    recordFeature('model:plan_update', { via: 'group' });
    return;
  }
  await customizeModelPlan(
    client,
    scope.slug,
    { orchestratorGroupId: groupId, ...(effort === '' ? {} : { orchestratorGroupEffort: effort }) },
    state.plan?.revision ?? state.revision,
  );
  recordFeature('model:plan_update', { via: 'group' });
}

export type ModelGroupInput = { name: string; members: RoutingGroupMember[] };

export async function loadModelGroup(
  client: ModelSettingsClient,
  id: string,
): Promise<RoutingGroup> {
  const answer = answerRecord(await client.call('modelGroup', { id }), 'modelGroup');
  const group = parseRoutingGroup(answer['group']);
  if (group === undefined || group.id !== id)
    throw new HostAnswerInvalid('modelGroup returned an invalid Routing Group.');
  return group;
}

async function writeModelGroup(
  client: ModelSettingsClient,
  method: 'modelGroupCreate' | 'modelGroupUpdate' | 'modelGroupDelete',
  args: Record<string, unknown>,
): Promise<void> {
  await client.call(method, args);
  const owner = owners.get(client);
  await owner?.cancelQueries({ queryKey: modelSettingsKey });
  await owner?.invalidateQueries({ queryKey: modelSettingsKey, refetchType: 'none' });
}

export function createModelGroup(
  client: ModelSettingsClient,
  input: ModelGroupInput,
): Promise<void> {
  return writeModelGroup(client, 'modelGroupCreate', input);
}

export function updateModelGroup(
  client: ModelSettingsClient,
  id: string,
  revision: number,
  input: ModelGroupInput,
): Promise<void> {
  return writeModelGroup(client, 'modelGroupUpdate', { ...input, id, expectedRevision: revision });
}

export function deleteModelGroup(
  client: ModelSettingsClient,
  id: string,
  revision: number,
): Promise<void> {
  return writeModelGroup(client, 'modelGroupDelete', { id, expectedRevision: revision });
}

export function modelGroupReferences(details: unknown): string[] {
  const references = record(details)?.['references'];
  return Array.isArray(references)
    ? references.filter((reference): reference is string => typeof reference === 'string')
    : [];
}

function groupDefaultEffort(
  options: readonly AssignmentGroupOption[],
  groupId: string,
  effort: string,
): AssignmentGroupOption[] {
  const current = options.find((option) => option.group === groupId) ?? { group: groupId };
  const { allowedEfforts, defaultEffort: _default, ...kept } = current;
  const allowed = allowedEfforts ?? [];
  const next: AssignmentGroupOption =
    effort === ''
      ? kept
      : {
          ...kept,
          allowedEfforts: allowed.includes(effort) ? allowed : [...allowed, effort],
          defaultEffort: effort,
        };
  const keep = next.allowedEfforts !== undefined || next.note !== undefined;
  return [...options.filter((option) => option.group !== groupId), ...(keep ? [next] : [])];
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
        { provider: entry.provider, model: entry.model, ...modelEffortChoices(entry) },
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

export async function setAssignmentGroupNote(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  groupId: string,
  note: string,
): Promise<void> {
  const routes = modelRoutes(state);
  if (!(routes.groups.assignmentGroups ?? []).includes(groupId))
    throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  const text = note.trim();
  if (text.length > ASSIGNMENT_GROUP_NOTE_MAX) throw new HostAnswerInvalid('NOTE_TOO_LONG');
  const options = routes.groups.assignmentGroupOptions ?? [];
  const { note: _note, ...kept } = options.find((option) => option.group === groupId) ?? {
    group: groupId,
  };
  const next: AssignmentGroupOption = text === '' ? kept : { ...kept, note: text };
  const keep = next.allowedEfforts !== undefined || next.note !== undefined;
  await writePlan(client, scope, state, {
    orchestrator: requireRoute(routes.orchestrator),
    assignmentDefault: requireRoute(routes.assignmentDefault),
    assignmentModels: routes.assignmentModels,
    groups: {
      ...routes.groups,
      assignmentGroupOptions: [
        ...options.filter((option) => option.group !== groupId),
        ...(keep ? [next] : []),
      ],
    },
  });
  recordFeature('model:plan_update', { via: 'assignments' });
}

export type AssignmentEffortTarget =
  | Extract<SubSelection, { kind: 'model' | 'engine' }>
  | { kind: 'group'; id: string };

export function subEffortOptions(
  state: ModelSettingsState,
  target: AssignmentEffortTarget,
  engines: readonly RoutingGroupEngineOptions[] = state.engines ?? [],
):
  | { selection: SubSelection; effort: string; options: { id: string; name: string }[] }
  | undefined {
  const selection: SubSelection =
    target.kind === 'group' ? { kind: 'group', group: target.id } : target;
  const choice = modelSub(state).choices.find((entry) => matchesPresetSubChoice(entry, selection));
  if (choice === undefined) return undefined;
  switch (choice.kind) {
    case 'model': {
      const entry = state.models.find((entry) => sameModel(entry, choice));
      return {
        selection,
        effort: choice.defaultEffort,
        options: entry?.efforts?.filter((effort) => effort.id !== '') ?? [],
      };
    }
    case 'group': {
      const group = state.groups?.find((entry) => entry.id === choice.group);
      return {
        selection,
        effort: choice.defaultEffort ?? '',
        options: group === undefined ? [] : modelCatalogGroupEfforts(group, state.models),
      };
    }
    case 'engine': {
      const accounts = engines.filter(
        (entry) =>
          entry.available &&
          entry.engine === choice.engine &&
          (choice.accountId === undefined || choice.accountId === entry.accountId),
      );
      const model =
        choice.model === undefined
          ? routingGroupEngineChoices(accounts).find((entry) => entry.isDefault)?.model
          : engineCatalogModel(accounts, { engine: choice.engine, model: choice.model });
      return { selection, effort: choice.effort ?? '', options: model?.efforts ?? [] };
    }
  }
}

export function assignmentEffortRange(
  state: ModelSettingsState,
  target: AssignmentEffortTarget,
): { allowed: string[]; defaultEffort: string; locked?: string } | undefined {
  if (target.kind === 'engine') return undefined;
  const routes = modelRoutes(state);
  if (target.kind === 'model') {
    const option = routes.assignmentModels.find((item) => sameModel(item, target));
    if (option === undefined) return undefined;
    const fixed =
      routes.groups.assignmentDefaultGroupId === undefined &&
      routes.assignmentDefault !== undefined &&
      sameModel(routes.assignmentDefault, target);
    return {
      allowed: [...option.allowedEfforts],
      defaultEffort: option.defaultEffort,
      ...(fixed ? { locked: routes.assignmentDefault?.reasoningEffort ?? '' } : {}),
    };
  }
  if (!(routes.groups.assignmentGroups ?? []).includes(target.id)) return undefined;
  const option = routes.groups.assignmentGroupOptions?.find((item) => item.group === target.id);
  const fixed =
    routes.groups.assignmentDefaultGroupId === target.id && (option?.defaultEffort ?? '') !== '';
  return {
    allowed: [...(option?.allowedEfforts ?? [])],
    defaultEffort: option?.defaultEffort ?? '',
    ...(fixed ? { locked: option?.defaultEffort ?? '' } : {}),
  };
}

function groupEffortRange(
  options: readonly AssignmentGroupOption[],
  groupId: string,
  efforts: string[],
  chosen: string,
): AssignmentGroupOption[] {
  const current = options.find((option) => option.group === groupId) ?? { group: groupId };
  const { allowedEfforts: _efforts, defaultEffort: _default, ...kept } = current;
  const next: AssignmentGroupOption =
    efforts.length === 0 ? kept : { ...kept, allowedEfforts: efforts, defaultEffort: chosen };
  const keep = next.allowedEfforts !== undefined || next.note !== undefined;
  return [...options.filter((option) => option.group !== groupId), ...(keep ? [next] : [])];
}

export async function setAssignmentEfforts(
  client: ModelSettingsClient,
  scope: ModelScope,
  state: ModelSettingsState,
  target: AssignmentEffortTarget,
  allowed: readonly string[],
  defaultEffort: string,
): Promise<void> {
  const range = assignmentEffortRange(state, target);
  if (range === undefined) throw new HostAnswerInvalid('MODEL_UNAVAILABLE');
  const efforts = [...new Set(allowed)];
  if (range.locked !== undefined && !efforts.includes(range.locked))
    throw new HostAnswerInvalid('ASSIGNMENT_DEFAULT_REQUIRED');
  if (target.kind === 'model' && efforts.length === 0)
    throw new HostAnswerInvalid('EFFORT_REQUIRED');
  const chosen =
    range.locked ?? (efforts.includes(defaultEffort) ? defaultEffort : (efforts[0] ?? ''));
  const routes = modelRoutes(state);
  const assignmentModels =
    target.kind === 'model'
      ? routes.assignmentModels.map((option) =>
          sameModel(option, target)
            ? { ...option, allowedEfforts: efforts, defaultEffort: chosen }
            : option,
        )
      : routes.assignmentModels;
  const options = routes.groups.assignmentGroupOptions ?? [];
  const assignmentGroupOptions =
    target.kind === 'group' ? groupEffortRange(options, target.id, efforts, chosen) : options;
  await writePlan(client, scope, state, {
    orchestrator: requireRoute(routes.orchestrator),
    assignmentDefault: requireRoute(routes.assignmentDefault),
    assignmentModels,
    groups: { ...routes.groups, assignmentGroupOptions },
  });
  recordFeature('model:plan_update', { via: 'assignments' });
}

export async function inheritModel(
  client: ModelSettingsClient,
  slug: string,
  state: ModelSettingsState,
): Promise<void> {
  await inheritModelPlan(client, slug, state.plan?.revision ?? state.revision);
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
  const input = {
    name: name.trim(),
    ...groupFields(routes.groups, orchestrator),
    assignmentDefault,
    assignmentModels,
  };
  try {
    const saved =
      update && preset?.revision !== undefined
        ? await updateModelPreset(client, preset.id, preset.revision, input)
        : await createModelPreset(client, input);
    return saved.id;
  } catch (error) {
    if (error instanceof HostAnswerInvalid) throw new HostAnswerInvalid('MODEL_PRESET_NOT_SAVED');
    throw error;
  }
}
