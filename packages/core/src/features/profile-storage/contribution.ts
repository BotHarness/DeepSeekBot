import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createProfileStorageAdapterMethods, type ProfileStorageBridgeDeps } from './methods.js';
import { apply, mountFetch, mountStorageMaintenance } from './plugin.js';
import { dataResetRpc, profileStorageRpc } from './rpc.js';

interface ProfileStorageHostHooks {
  profileStartup: typeof apply;
  profileStorageMaintenance: typeof mountStorageMaintenance;
  beforeConnectionRoutes: typeof mountFetch;
}

export function createProfileStorageContribution() {
  return {
    id: 'profile-storage',
    bridgeMethods: ({ human, deps }) => createProfileStorageAdapterMethods(human, deps),
    rpc: { ...dataResetRpc, ...profileStorageRpc },
    host: {
      profileStartup: apply,
      profileStorageMaintenance: mountStorageMaintenance,
      beforeConnectionRoutes: mountFetch,
    },
  } satisfies FeatureContribution<
    { human: HumanContext; deps: ProfileStorageBridgeDeps },
    never,
    ProfileStorageHostHooks
  >;
}
