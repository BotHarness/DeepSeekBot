import { currentModel, sameModel } from '@botharness/host-client/bot-settings';
import {
  modelCatalogGroupEfforts,
  modelEffortChoices,
} from '@botharness/host-client/model-catalog';
import {
  DEFAULT_MODEL_PRESET_ID,
  type ModelPreset,
  type ModelSlot,
} from '@botharness/host-client/model-plans';
import type { ModelScope, ModelSettingsState } from '@botharness/host-client/model-settings';
import type { SubChoice } from '@botharness/host-client/preset-sub';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';

import type { SessionModelCatalog } from './session-model-label';

export type SlotEffortOption = { id: string; label: string };

export function linkedPreset(state: ModelSettingsState): ModelPreset | undefined {
  const id = state.presetId ?? DEFAULT_MODEL_PRESET_ID;
  return (
    state.presets.find((preset) => preset.id === id) ??
    state.presets.find((preset) => preset.id === DEFAULT_MODEL_PRESET_ID)
  );
}

export function ownSlots(state: ModelSettingsState): ModelSlot[] {
  return state.overrides ?? [];
}

export function presetMainChoice(preset: ModelPreset): SessionModelChoice {
  const engine = preset.orchestratorEngine;
  if (engine !== undefined && engine.model !== undefined)
    return {
      kind: 'engine',
      engine: engine.engine,
      model: engine.model,
      ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
      ...(engine.effort === undefined ? {} : { effort: engine.effort }),
    };
  if (preset.orchestratorGroupId !== undefined)
    return {
      kind: 'group',
      id: preset.orchestratorGroupId,
      ...(preset.orchestratorGroupEffort === undefined
        ? {}
        : { effort: preset.orchestratorGroupEffort }),
    };
  return {
    kind: 'model',
    provider: preset.orchestrator.provider,
    model: preset.orchestrator.model,
    ...(preset.orchestrator.reasoningEffort === undefined
      ? {}
      : { effort: preset.orchestrator.reasoningEffort }),
  };
}

export function mainChoice(
  state: ModelSettingsState,
  scope: ModelScope,
): SessionModelChoice | undefined {
  if (scope.kind === 'preset') return state.preset && presetMainChoice(state.preset);
  if (scope.kind === 'bot') {
    const target = state.currentTarget;
    const preset = linkedPreset(state);
    if (!ownSlots(state).includes('main') && preset !== undefined) return presetMainChoice(preset);
    if (target?.kind === 'engine' && target.model !== undefined)
      return {
        kind: 'engine',
        engine: target.engine,
        model: target.model,
        ...(target.account === undefined ? {} : { accountId: target.account }),
      };
  }
  const plan = state.plan;
  if (plan?.orchestratorGroupId !== undefined)
    return {
      kind: 'group',
      id: plan.orchestratorGroupId,
      ...(plan.orchestratorGroupEffort === undefined
        ? {}
        : { effort: plan.orchestratorGroupEffort }),
    };
  const route = plan?.orchestrator ?? currentModel(state).route;
  return route === undefined
    ? undefined
    : {
        kind: 'model',
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined ? {} : { effort: route.reasoningEffort }),
      };
}

export function slotEffortOptions(
  catalog: SessionModelCatalog | undefined,
  choice: SessionModelChoice | undefined,
  providerDefault: string,
): SlotEffortOption[] {
  if (catalog === undefined || choice === undefined) return [];
  const named = (list: readonly { id: string; name: string }[]) =>
    list.length === 0
      ? []
      : [
          { id: '', label: providerDefault },
          ...list.filter((entry) => entry.id !== '').map((e) => ({ id: e.id, label: e.name })),
        ];
  if (choice.kind === 'model')
    return named(catalog.models?.find((entry) => sameModel(entry, choice))?.efforts ?? []);
  if (choice.kind === 'group') {
    const group = catalog.groups?.find((entry) => entry.id === choice.id);
    return group === undefined ? [] : named(modelCatalogGroupEfforts(group, catalog.models ?? []));
  }
  const engine = catalog.engines?.find(
    (entry) =>
      entry.available &&
      entry.engine === choice.engine &&
      (entry.accountId ?? '') === (choice.accountId ?? ''),
  );
  const model =
    engine?.available === true
      ? engine.models.find((entry) => entry.id === choice.model)
      : undefined;
  return named(model?.efforts ?? []);
}

export function withEffort(choice: SessionModelChoice, effort: string): SessionModelChoice {
  const { effort: _previous, ...rest } = choice;
  return effort === '' ? rest : { ...rest, effort };
}

export function subChoiceOf(
  state: ModelSettingsState,
  choice: SessionModelChoice,
): SubChoice | undefined {
  if (choice.kind === 'group') return { kind: 'group', group: choice.id };
  if (choice.kind === 'engine')
    return {
      kind: 'engine',
      engine: choice.engine,
      model: choice.model,
      ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
      ...(choice.effort === undefined ? {} : { effort: choice.effort }),
    };
  const entry = state.models.find((item) => sameModel(item, choice));
  if (entry === undefined || entry.credential !== undefined) return undefined;
  const efforts = modelEffortChoices(entry);
  const picked = choice.effort ?? efforts.defaultEffort;
  return {
    kind: 'model',
    provider: entry.provider,
    model: entry.model,
    allowedEfforts: efforts.allowedEfforts,
    defaultEffort: efforts.allowedEfforts.includes(picked) ? picked : efforts.defaultEffort,
  };
}

export function sessionChoiceOfSub(choice: SubChoice): SessionModelChoice | undefined {
  if (choice.kind === 'group') return { kind: 'group', id: choice.group };
  if (choice.kind === 'model')
    return { kind: 'model', provider: choice.provider, model: choice.model };
  return choice.model === undefined
    ? undefined
    : {
        kind: 'engine',
        engine: choice.engine,
        model: choice.model,
        ...(choice.accountId === undefined ? {} : { accountId: choice.accountId }),
      };
}
