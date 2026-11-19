import {
  ENGINE_IDS,
  type RoutingGroupEngineOptions,
} from '@botharness/host-protocol/subscription-engine';

import type { EngineHost } from '../engines/engine-host.js';

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
      const models = await host.models(engine).catch(() => []);
      return {
        engine,
        available: true,
        models: models.map(({ id, name }) => ({ id, name })),
      };
    }),
  );
}
