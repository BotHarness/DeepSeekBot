import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import { createReleaseAdapterMethods, type ReleaseBridgeDeps } from './methods.js';
import { mountInstaller } from './plugin.js';
import { releaseRpc } from './rpc.js';

export function createReleaseContribution() {
  return {
    id: 'release',
    bridgeMethods: ({ deps }) => createReleaseAdapterMethods(deps),
    rpc: releaseRpc,
    host: { releaseInstaller: mountInstaller },
  } satisfies FeatureContribution<
    { deps: ReleaseBridgeDeps },
    never,
    { releaseInstaller: typeof mountInstaller }
  >;
}
