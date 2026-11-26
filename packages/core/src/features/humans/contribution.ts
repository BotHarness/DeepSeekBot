import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HumanContext } from '../../humans/context.js';
import { createHumansAdapterMethods, createHumansBridgeMethods } from './methods.js';
import { humansRpc } from './rpc.js';

export interface HumansBridgeContext {
  human: HumanContext;
  deps: Parameters<typeof createHumansBridgeMethods>[1] &
    Parameters<typeof createHumansAdapterMethods>[0];
  channelView: Parameters<typeof createHumansBridgeMethods>[2];
}

export function createHumansContribution() {
  return {
    id: 'humans',
    bridgeMethods: ({ human, deps, channelView }) => ({
      ...createHumansBridgeMethods(human, deps, channelView),
      ...createHumansAdapterMethods(deps),
    }),
    rpc: humansRpc,
  } satisfies FeatureContribution<HumansBridgeContext>;
}
