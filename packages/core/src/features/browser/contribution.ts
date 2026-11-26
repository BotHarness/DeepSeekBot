import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createBrowserBridgeMethods } from './methods.js';
import { browserServiceRpc } from './rpc.js';

export interface BrowserBridgeContext {
  deps: Parameters<typeof createBrowserBridgeMethods>[0];
  detailOf: Parameters<typeof createBrowserBridgeMethods>[1];
}

export function createBrowserContribution() {
  return {
    id: 'browser',
    bridgeMethods: ({ deps, detailOf }) => createBrowserBridgeMethods(deps, detailOf),
    rpc: browserServiceRpc,
  } satisfies FeatureContribution<BrowserBridgeContext>;
}
