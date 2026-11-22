import {
  ENGINE_DEFINITIONS,
  engineEffortName,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import {
  engineCatalogModel,
  type ModelCatalogEntry,
  type RoutingGroupEngineCopy,
} from './model-catalog';
import { modelBrand, modelShortName } from './shared/model-brand';

export interface TurnTargetCatalog {
  models?: readonly ModelCatalogEntry[] | undefined;
  engines?: readonly RoutingGroupEngineOptions[] | undefined;
}

export function turnTargetLabel(
  target: TurnTarget,
  catalog?: TurnTargetCatalog,
  copy?: Pick<RoutingGroupEngineCopy, 'effort'>,
) {
  if (target.kind === 'engine') {
    const engine = ENGINE_DEFINITIONS[target.engine].displayName;
    const { model } = target;
    const entry =
      model === undefined || catalog?.engines === undefined
        ? undefined
        : engineCatalogModel(catalog.engines, { ...target, model });
    const name = entry?.name ?? model ?? engine;
    const brand = modelBrand({ model, name }) ?? (target.engine === 'codex' ? 'openai' : 'claude');
    const short = entry === undefined ? name : modelShortName(name, brand);
    const effort = target.reasoningEffort;
    const effortName =
      effort === undefined || copy === undefined ? effort : engineEffortName(effort, copy.effort);
    return {
      brand,
      short: /^[0-9]|^$/u.test(short) ? name : short,
      effort: effortName,
      name: [name, name === engine ? undefined : engine, effortName].filter(Boolean).join(' · '),
      external: true as const,
    };
  }
  const entry = catalog?.models?.find(
    (item) => item.provider === target.provider && item.model === target.model,
  );
  const model = entry?.modelName ?? target.model;
  const brand = modelBrand({ provider: target.provider, model: target.model, name: model });
  return {
    brand,
    short: entry === undefined ? model : modelShortName(model, brand),
    name: `${model} · ${entry?.providerName ?? target.provider}`,
    external: false as const,
  };
}

export function sessionHeaderTargetLabel(target: TurnTarget, catalog?: TurnTargetCatalog) {
  const model = turnTargetLabel(target, catalog);
  if (target.kind === 'dsh') return model;
  const account = target.account
    ?.replace(/^Claude (?=(?:Pro|Max)\b)/iu, '')
    .replace(
      /\b(plus|pro|max)\b/giu,
      (plan) => plan.charAt(0).toUpperCase() + plan.slice(1).toLowerCase(),
    );
  const engineAccount = [ENGINE_DEFINITIONS[target.engine].displayName, account]
    .filter(Boolean)
    .join(' · ');
  return {
    ...model,
    short: target.model === undefined ? engineAccount : `${model.short} · ${engineAccount}`,
    name: target.model === undefined ? engineAccount : `${engineAccount} · ${model.short}`,
  };
}
