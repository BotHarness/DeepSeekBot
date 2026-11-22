import { sameModel, type ModelPreset, type ModelRoute } from '@botharness/host-client/bot-settings';
import {
  modelCatalogGroupEfforts,
  modelCatalogGroupFront,
  type ModelCatalogEntry,
  type ModelCatalogGroup,
} from '@botharness/host-client/model-catalog';
import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import { t } from '../strings';
import { modelEntryLabel } from './composer-labels';

export function routeLabel(value: ModelSettingsState, route: ModelRoute | undefined): string {
  if (route === undefined) return t.modelSettings.inherited;
  const entry = value.models.find((item) => sameModel(item, route));
  return entry === undefined ? route.model : shortModelName(entry);
}

export function effortLabel(value: ModelSettingsState, route: ModelRoute): string {
  const effort = route.reasoningEffort ?? '';
  if (effort === '') return t.modelSettings.effortDefault;
  const entry = value.models.find((item) => sameModel(item, route));
  return entry?.efforts?.find((item) => item.id === effort)?.name ?? effort;
}

export function routeEffortLabel(value: ModelSettingsState, route: ModelRoute | undefined): string {
  const name = routeLabel(value, route);
  return route?.reasoningEffort === undefined || route.reasoningEffort === ''
    ? name
    : `${name} · ${effortLabel(value, route)}`;
}

export function effortChoices(
  entry: Pick<ModelCatalogEntry, 'efforts'> | undefined,
  defaultLabel = t.modelSettings.effortDefault,
) {
  const efforts = (entry?.efforts ?? []).filter((item) => item.id !== '');
  return efforts.length === 0
    ? []
    : [
        { value: '', label: defaultLabel },
        ...efforts.map((item) => ({ value: item.id, label: item.name })),
      ];
}

export function groupEffortChoices(value: ModelSettingsState, group: ModelCatalogGroup) {
  const efforts = modelCatalogGroupEfforts(group, value.models);
  return efforts.length === 0
    ? []
    : [
        { value: '', label: t.modelSettings.effortDefault },
        ...efforts.map((item) => ({ value: item.id, label: item.name })),
      ];
}

export function groupEffortLabel(
  value: ModelSettingsState,
  group: ModelCatalogGroup,
  effort: string,
): string {
  return groupEffortChoices(value, group).find((item) => item.value === effort)?.label ?? effort;
}

export function keptGroupEffort(
  value: ModelSettingsState,
  group: ModelCatalogGroup,
  previous: string,
): string {
  return previous !== '' &&
    modelCatalogGroupEfforts(group, value.models).some((item) => item.id === previous)
    ? previous
    : '';
}

export function keptEffort(entry: ModelCatalogEntry, previous: ModelRoute | undefined) {
  const wanted = previous?.reasoningEffort ?? '';
  if (wanted !== '' && entry.efforts?.some((item) => item.id === wanted)) return wanted;
  if (sameModel(entry, previous ?? { provider: '', model: '' })) return wanted;
  return entry.defaultEffort ?? '';
}

export function shortModelName(entry: { provider: string; model: string; modelName: string }) {
  const { short } = modelEntryLabel(entry);
  return short.length > 3 && /^\p{L}/u.test(short) ? short : entry.modelName;
}

function presetSide(
  value: ModelSettingsState,
  groupId: string | undefined,
  route: ModelRoute | undefined,
): string {
  const group = value.groups?.find((entry) => entry.id === groupId);
  return group?.name ?? routeLabel(value, route);
}

export function presetDetail(value: ModelSettingsState, preset: ModelPreset): string {
  const main = presetSide(value, preset.orchestratorGroupId, preset.orchestrator);
  if (preset.assignmentDefault === undefined && preset.assignmentDefaultGroupId === undefined)
    return main;
  return t.modelSettings.presetRoutes(
    main,
    presetSide(value, preset.assignmentDefaultGroupId, preset.assignmentDefault),
  );
}

export function presetFront(
  value: ModelSettingsState,
  preset: ModelPreset,
): ModelRoute | undefined {
  const group = value.groups?.find((entry) => entry.id === preset.orchestratorGroupId);
  return group === undefined ? preset.orchestrator : modelCatalogGroupFront(group, value.models);
}
