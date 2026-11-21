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
  allowed?: (accountId: string) => boolean,
): Promise<RoutingGroupEngineOptions[]> {
  const report = await host.status(undefined, allowed);
  if (report.length === 0 && allowed === undefined)
    return ENGINE_IDS.map((engine) => ({ engine, available: false, reason: 'host-not-local' }));
  return Promise.all(
    report.map(async (status): Promise<RoutingGroupEngineOptions> => {
      const { engine, accountId, accountName } = status;
      const base = {
        engine,
        ...(accountId === undefined ? {} : { accountId }),
        ...(accountName === undefined ? {} : { accountName }),
      };
      if (!status.available || !status.installed)
        return { ...base, available: false, reason: status.reason ?? 'login-unknown' };
      try {
        const models = await host.models(engine, accountId);
        return { ...base, available: true, models: concreteModels(models) };
      } catch {
        return { ...base, available: false, reason: 'models-unavailable' };
      }
    }),
  );
}
