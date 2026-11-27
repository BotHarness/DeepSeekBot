import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createTobCliRuntime } from './cli-runtime.js';
import { createTobAdapterMethods, type TobBridgeDeps } from './methods.js';
import { createAgentHooks, mountOperations, mountSettingsOperations } from './plugin.js';
import { directBotToolRpc, tobRpcMethods } from './rpc.js';

export interface TobBridgeContext {
  human: HumanContext;
  deps: TobBridgeDeps;
  isHostOwner(): boolean;
}

export function createTobContribution() {
  return {
    id: 'tob',
    bridgeMethods: ({ human, deps, isHostOwner }) => ({
      ...createTobAdapterMethods(human, deps, isHostOwner),
    }),
    rpc: { ...tobRpcMethods, ...directBotToolRpc },
    runtimeServices: { createTobCliRuntime },
    host: {
      tobOperations: mountOperations,
      tobSettingsOperations: mountSettingsOperations,
      tobAgentHooks: createAgentHooks,
    },
  } satisfies FeatureContribution<
    TobBridgeContext,
    never,
    {
      tobOperations: typeof mountOperations;
      tobSettingsOperations: typeof mountSettingsOperations;
      tobAgentHooks: typeof createAgentHooks;
    }
  >;
}
