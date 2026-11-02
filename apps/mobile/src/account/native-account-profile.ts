import { useSyncExternalStore } from 'react';

import { fetch } from 'expo/fetch';

import { createMarketplaceClient } from '../../../../packages/core/src/marketplace/client';
import { connectAccount } from '../host/native-connect-account';
import { createAccountProfile } from './account-profile';

export const accountProfile = createAccountProfile({
  connect: connectAccount,
  client: createMarketplaceClient({
    baseUrl: 'https://market.botharness.ai',
    fetchImpl: fetch as unknown as typeof globalThis.fetch,
  }),
});

export function useAccountProfile() {
  return useSyncExternalStore(
    accountProfile.subscribe,
    accountProfile.getSnapshot,
    accountProfile.getSnapshot,
  );
}
