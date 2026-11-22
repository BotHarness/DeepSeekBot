import type { EngineHost } from '../src/engines/engine-host.js';
import { createEngineSelectionBridge } from '../src/engines/engine-selection-bridge.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';

export function ownerEngineSelection(
  host: EngineHost,
  botExists: (slug: string) => boolean,
  releaseEngineQuotaHold?: (slug: string) => void,
) {
  return createEngineSelectionBridge(OWNER_HUMAN_CONTEXT, {
    engineSelection: host,
    registry: {
      get: (slug) =>
        botExists(slug)
          ? {
              slug,
              displayName: slug,
              roles: [],
              workspaces: [],
              createdAt: '2026-09-21T00:00:00.000Z',
            }
          : undefined,
    },
    ...(releaseEngineQuotaHold === undefined ? {} : { releaseEngineQuotaHold }),
  });
}
