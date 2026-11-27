import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import {
  createMarketplaceBridgeMethods,
  type MarketplaceBridgeContext,
  type MarketplaceBridgeMethods,
} from './methods.js';
import { mountZipRoutes } from './plugin.js';
import { marketplaceServiceRpc, zipImportRpc } from './rpc.js';
import { marketplaceSkillRpc } from './skill-rpc.js';

export function createMarketplaceContribution() {
  return {
    id: 'marketplace',
    bridgeMethods: (context): MarketplaceBridgeMethods => {
      const { marketplaceZip, marketplaceReads, marketplaceSharing } =
        createMarketplaceBridgeMethods(context);
      return { ...marketplaceZip, ...marketplaceReads, ...marketplaceSharing };
    },
    rpc: { ...zipImportRpc, ...marketplaceServiceRpc, ...marketplaceSkillRpc },
    host: { afterConnectionRoutes: mountZipRoutes },
  } satisfies FeatureContribution<
    MarketplaceBridgeContext,
    never,
    { afterConnectionRoutes: typeof mountZipRoutes }
  >;
}
