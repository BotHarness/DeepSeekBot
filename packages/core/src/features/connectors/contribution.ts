import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createConnectorsBridgeMethods } from './methods.js';
import { connectorsRpc } from './rpc.js';

export interface ConnectorsBridgeContext {
  deps: Parameters<typeof createConnectorsBridgeMethods>[0];
  isHostOwner: Parameters<typeof createConnectorsBridgeMethods>[1];
}

export function createConnectorsContribution() {
  return {
    id: 'connectors',
    bridgeMethods: ({ deps, isHostOwner }) => createConnectorsBridgeMethods(deps, isHostOwner),
    rpc: connectorsRpc,
  } satisfies FeatureContribution<ConnectorsBridgeContext>;
}
