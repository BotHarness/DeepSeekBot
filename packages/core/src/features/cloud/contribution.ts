import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createCloudBridgeMethods } from './methods.js';
import { installCloudWorkLifetime, mount } from './plugin.js';
import { cloudServiceRpc } from './rpc.js';

export interface CloudBridgeContext {
  deps: Parameters<typeof createCloudBridgeMethods>[0];
}

export interface CloudHostHooks {
  beforeEngineTools(...input: Parameters<typeof installCloudWorkLifetime>): void;
  beforeMessagingProviders(...input: Parameters<typeof mount>): void;
}

export function createCloudContribution() {
  return {
    id: 'cloud',
    bridgeMethods: ({ deps }) => createCloudBridgeMethods(deps),
    rpc: cloudServiceRpc,
    host: { beforeEngineTools: installCloudWorkLifetime, beforeMessagingProviders: mount },
  } satisfies FeatureContribution<CloudBridgeContext, never, CloudHostHooks>;
}
