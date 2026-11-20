import { ENGINE_DEFINITIONS } from '@botharness/host-protocol/subscription-engine';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { routingGroupEnginePresentation, type ModelCatalogEntry } from './model-catalog';
import { modelBrand, modelShortName } from './shared/model-brand';

export function turnTargetLabel(target: TurnTarget, catalog: readonly ModelCatalogEntry[] = []) {
  if (target.kind === 'engine') {
    const { brand, title, name } = routingGroupEnginePresentation(target, {
      defaultModel: (engine) => engine,
      subscription: (source) => source,
    });
    const engine = ENGINE_DEFINITIONS[target.engine].displayName;
    return {
      brand,
      short: title,
      effort: target.reasoningEffort,
      name: [name, name === engine ? undefined : engine, target.reasoningEffort]
        .filter(Boolean)
        .join(' · '),
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
