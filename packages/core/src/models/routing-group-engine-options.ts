import {
  ENGINE_IDS,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';

import type { EngineHost } from '../engines/engine-host.js';

export async function routingGroupEngineOptions(
  host: Pick<EngineHost, 'status' | 'models'>,
): Promise<RoutingGroupEngineOptions[]> {
  const report = await host.status();
  if (report.length === 0)
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
      const models = await host.models(engine, accountId).catch(() => []);
      return { ...base, available: true, models: models.map(({ id, name }) => ({ id, name })) };
    }),
  );
}
