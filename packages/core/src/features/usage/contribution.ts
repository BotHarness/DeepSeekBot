import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createUsageAdapterMethods } from './methods.js';
import { bindParentTurnUsage, mountReconciliation } from './plugin.js';
import { usageRpc } from './rpc.js';

export interface UsageBridgeContext {
  deps: Parameters<typeof createUsageAdapterMethods>[0];
  isHostOwner: Parameters<typeof createUsageAdapterMethods>[1];
  dmMemory: Parameters<typeof createUsageAdapterMethods>[2];
}

export interface UsageHostHooks {
  beforeSessionLifecycle(...input: Parameters<typeof bindParentTurnUsage>): void;
  afterSessionLifecycle(...input: Parameters<typeof mountReconciliation>): void;
}

export function createUsageContribution() {
  return {
    id: 'usage',
    bridgeMethods: ({ deps, isHostOwner, dmMemory }) =>
      createUsageAdapterMethods(deps, isHostOwner, dmMemory),
    rpc: usageRpc,
    host: {
      beforeSessionLifecycle: bindParentTurnUsage,
      afterSessionLifecycle: mountReconciliation,
    },
  } satisfies FeatureContribution<UsageBridgeContext, never, UsageHostHooks>;
}
