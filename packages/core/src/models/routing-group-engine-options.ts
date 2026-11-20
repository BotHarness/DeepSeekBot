import {
  ENGINE_IDS,
  type RoutingGroupEngineModel,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';

import type { EngineHost } from '../engines/engine-host.js';
import type { EngineModel } from '../engines/engine-session.js';

function concreteModels(models: readonly EngineModel[]): RoutingGroupEngineModel[] {
  const choices = new Map<string, RoutingGroupEngineModel>();
  for (const model of models) {
    const id = model.resolvedModel ?? model.id;
    if (model.id === 'default' && id === 'default') continue;
    const prior = choices.get(id);
    const aliases = [...(prior?.aliases ?? []), ...(model.id === id ? [] : [model.id])];
    const defaultEffort = model.defaultEffort ?? prior?.defaultEffort;
    choices.set(id, {
      id,
      name: model.id === 'default' ? (prior?.name ?? id) : model.name,
      efforts: model.id === 'default' ? (prior?.efforts ?? model.efforts) : model.efforts,
      ...(model.isDefault || prior?.isDefault ? { isDefault: true } : {}),
      ...(defaultEffort === undefined ? {} : { defaultEffort }),
      ...(aliases.length > 0 ? { aliases } : {}),
    });
  }
  return [...choices.values()];
}

export async function routingGroupEngineOptions(
  host: Pick<EngineHost, 'status' | 'models'>,
): Promise<RoutingGroupEngineOptions[]> {
  const report = await host.status();
  return Promise.all(
    ENGINE_IDS.map(async (engine): Promise<RoutingGroupEngineOptions> => {
      const status = report.find((entry) => entry.engine === engine);
      if (status === undefined) return { engine, available: false, reason: 'host-not-local' };
      if (!status.available || !status.installed)
        return { engine, available: false, reason: status.reason ?? 'login-unknown' };
      try {
        const models = await host.models(engine);
        return {
          engine,
          available: true,
          models: concreteModels(models),
        };
      } catch {
        return { engine, available: false, reason: 'models-unavailable' };
      }
    }),
  );
}
