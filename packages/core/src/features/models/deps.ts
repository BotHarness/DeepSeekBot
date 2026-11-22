import type { RoutingGroupEngineOptions } from '@botharness/host-protocol/subscription-engine';
import type { EngineAccountOperations } from '../../engines/engine-account-bridge.js';
import type { EngineHost } from '../../engines/engine-host.js';
import type { EngineSelectionOperations } from '../../engines/engine-selection-bridge.js';
import type { ModelCatalog } from '../../models/catalog.js';
import type { ModelFavoriteStore } from '../../models/favorites.js';
import type { ModelPresetStore, ModelRoute } from '../../models/presets.js';
import type { ModelProviders } from '../../models/providers.js';
import type { ModelRouteReadiness } from '../../models/readiness.js';
import type { RoutingGroupStore } from '../../models/routing-groups.js';

export interface ModelsBridgeDeps {
  modelPresets?: ModelPresetStore;
  subscriptionEngines?: Pick<EngineHost, 'validateChoice' | 'use' | 'fallsBack'> & {
    store: Pick<EngineHost['store'], 'selection'>;
  };
  engineAccounts?: EngineAccountOperations;
  engineSelection?: EngineSelectionOperations;
  localSubscriptionEngines?: boolean;
  routingGroupEngineOptions?(
    allowed: (id: string) => boolean,
  ): Promise<RoutingGroupEngineOptions[]>;
  releaseEngineQuotaHold?(slug: string): void;
  modelFavorites?: ModelFavoriteStore;
  routingGroups?: RoutingGroupStore;
  routeRests?: Pick<import('../../models/route-rest.js').RouteRests, 'list'>;
  modelCatalog?: ModelCatalog;
  modelProviders?: ModelProviders;
  modelReadiness?: ModelRouteReadiness;
  defaultModel?: {
    currentSelection(role?: 'assignment' | 'orchestrator'): ModelRoute;
  };
}
