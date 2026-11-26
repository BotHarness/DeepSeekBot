import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createComputerBridgeMethods } from './methods.js';
import { computerServiceRpc } from './rpc.js';

export interface ComputerBridgeContext {
  deps: Parameters<typeof createComputerBridgeMethods>[0];
  detailOf: Parameters<typeof createComputerBridgeMethods>[1];
}

export function createComputerContribution() {
  return {
    id: 'computer',
    bridgeMethods: ({ deps, detailOf }) => createComputerBridgeMethods(deps, detailOf),
    rpc: computerServiceRpc,
  } satisfies FeatureContribution<ComputerBridgeContext>;
}
