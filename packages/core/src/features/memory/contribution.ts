import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createMemoryBridgeMethods } from './methods.js';
import { mountEngineTools, mountFetch } from './plugin.js';
import { MEMORY_BRANCH_PROMPT, MEMORY_WORKING_TREE_PROMPT } from './prompt.js';
import { memoryRpcMethods, memoryServiceRpc } from './rpc.js';
import { createMemoryEvents } from './events.js';
import { createRuntimeMemoryChanges } from './runtime-changes.js';

export interface MemoryBridgeContext {
  human: HumanContext;
  deps: Parameters<typeof createMemoryBridgeMethods>[1];
  dmMemory: Parameters<typeof createMemoryBridgeMethods>[2];
}

export function createMemoryContribution() {
  return {
    id: 'memory',
    bridgeMethods: ({ human, deps, dmMemory }) => ({
      ...createMemoryBridgeMethods(human, deps, dmMemory),
    }),
    rpc: { ...memoryRpcMethods, ...memoryServiceRpc },
    runtimeServices: { createMemoryEvents, createRuntimeMemoryChanges },
    host: { engineTools: mountEngineTools, memoryRoutes: mountFetch },
    promptSections: () => [
      { placement: 'slot', slot: 'memory-working-tree', text: () => MEMORY_WORKING_TREE_PROMPT },
      { placement: 'slot', slot: 'memory-branch', text: () => MEMORY_BRANCH_PROMPT },
    ],
  } satisfies FeatureContribution<
    MemoryBridgeContext,
    unknown,
    { engineTools: typeof mountEngineTools; memoryRoutes: typeof mountFetch }
  >;
}
