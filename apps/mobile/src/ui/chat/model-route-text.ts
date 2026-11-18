import { sameModel, type ModelPreset, type ModelRoute } from '@botharness/host-client/bot-settings';
import { modelCatalogGroupFront } from '@botharness/host-client/model-catalog';
import type { ModelSettingsState } from '@botharness/host-client/model-settings';
import { t } from '../strings';
import { modelEntryLabel } from './composer-labels';

export function routeLabel(value: ModelSettingsState, route: ModelRoute | undefined): string {
  if (route === undefined) return t.modelSettings.inherited;
  const entry = value.models.find((item) => sameModel(item, route));
  if (entry === undefined) return route.model;
  const { short } = modelEntryLabel(entry);
  return /\p{L}/u.test(short) ? short : entry.modelName;
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
