import { useSyncExternalStore } from 'react';
import { createMarketplaceClient } from '../../../../packages/core/src/marketplace/client';
import { createMobileMarketplace, type CatalogueResource } from './catalogue';

export const marketplace = createMobileMarketplace(
  createMarketplaceClient({ baseUrl: 'https://market.botharness.ai' }),
);

export function useCatalogueResource<T>(resource: CatalogueResource<T>) {
  return useSyncExternalStore(resource.subscribe, resource.getSnapshot, resource.getSnapshot);
}
