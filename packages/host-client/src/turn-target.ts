import {
  ENGINE_DEFINITIONS,
  engineEffortName,
} from '@botharness/host-protocol/subscription-engine';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import {
  routingGroupEnginePresentation,
  type ModelCatalogEntry,
  type RoutingGroupEngineCopy,
} from './model-catalog';
import { modelBrand, modelShortName } from './shared/model-brand';

export function turnTargetLabel(
  target: TurnTarget,
  catalog: readonly ModelCatalogEntry[] = [],
  copy?: Pick<RoutingGroupEngineCopy, 'effort'>,
) {
  if (target.kind === 'engine') {
    const { brand, title, name } = routingGroupEnginePresentation(target, {
      defaultModel: (engine) => engine,
      subscription: (source) => source,
    });
    const engine = ENGINE_DEFINITIONS[target.engine].displayName;
    const effort = target.reasoningEffort;
    const effortName =
      effort === undefined || copy === undefined ? effort : engineEffortName(effort, copy.effort);
    return {
      brand,
      short: title,
      effort: effortName,
      name: [name, name === engine ? undefined : engine, effortName].filter(Boolean).join(' · '),
      external: true as const,
    };
  }
  const entry = catalog.find(
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
