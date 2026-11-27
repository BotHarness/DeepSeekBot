import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createPromptBridgeMethods, createPromptsAdapterMethods } from './methods.js';
import { promptsRpc } from './rpc.js';

export interface PromptsBridgeContext {
  deps: Parameters<typeof createPromptBridgeMethods>[0] &
    Parameters<typeof createPromptsAdapterMethods>[0];
  globalRegistry: Parameters<typeof createPromptBridgeMethods>[1];
}

export function createPromptsContribution() {
  return {
    id: 'prompts',
    bridgeMethods: ({ deps, globalRegistry }) => ({
      ...createPromptBridgeMethods(deps, globalRegistry),
      ...createPromptsAdapterMethods(deps),
    }),
    rpc: promptsRpc,
  } satisfies FeatureContribution<PromptsBridgeContext>;
}
