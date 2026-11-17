import { useSyncExternalStore } from 'react';

import { fetch } from 'expo/fetch';

import { createMarketplaceClient } from '../../../../packages/core/src/marketplace/client';
import { connectAccount } from '../host/native-connect-account';
import { createAccountProfile } from './account-profile';
import { createUploadedBots } from './uploaded-bots';

const client = createMarketplaceClient({
  baseUrl: 'https://market.botharness.ai',
  fetchImpl: fetch as unknown as typeof globalThis.fetch,
});

export const accountProfile = createAccountProfile({ connect: connectAccount, client });

export const uploadedBots = createUploadedBots({ connect: connectAccount, client });

export function useUploadedBots() {
  return useSyncExternalStore(
    uploadedBots.subscribe,
    uploadedBots.getSnapshot,
    uploadedBots.getSnapshot,
  );
}

export function useAccountProfile() {
  return useSyncExternalStore(
    accountProfile.subscribe,
    accountProfile.getSnapshot,
    accountProfile.getSnapshot,
  );
}
