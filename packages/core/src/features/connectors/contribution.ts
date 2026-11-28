import type { Context } from '@deepseek-ai/cordis';

import { connectorCallback, mountConnectors } from '../../connectors/mount.js';
import { ConnectorService } from '../../connectors/service.js';
import { createConnectorStore } from '../../connectors/store.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { BotHarnessCore } from '../../plugin-types.js';
import { createConnectorsBridgeMethods } from './methods.js';
import { connectorsRpc } from './rpc.js';

export interface ConnectorsBridgeContext {
  deps: Parameters<typeof createConnectorsBridgeMethods>[0];
  isHostOwner: Parameters<typeof createConnectorsBridgeMethods>[1];
}

function connectorTools(
  ctx: Context,
  core: BotHarnessCore,
  approval: Parameters<typeof mountConnectors>[4],
) {
  if (core.operationalDatabase.mode !== 'ready') return;
  const callback = connectorCallback(core.team.publicOrigins);
  const connectors = new ConnectorService({
    store: createConnectorStore(attachOperationalModule(core.operationalDatabase, 'connectors')),
    credentials: () => ctx.get('credentials'),
    log: (phase, fields) => ctx.logger.info('connectors %j', { phase, ...fields }),
    redirectUri: callback.url,
  });
  core.connectors = connectors;
  mountConnectors(ctx, core, connectors, callback, approval);
}

export function createConnectorsContribution() {
  return {
    id: 'connectors',
    bridgeMethods: ({ deps, isHostOwner }) => createConnectorsBridgeMethods(deps, isHostOwner),
    rpc: connectorsRpc,
    host: { connectorTools },
  } satisfies FeatureContribution<
    ConnectorsBridgeContext,
    never,
    { connectorTools: typeof connectorTools }
  >;
}
