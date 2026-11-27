import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import type { HostFetchConnection, BotHarnessCore } from '../../plugin-types.js';
import { createAvatarsBridgeMethods } from './methods.js';
import { mountRoutes } from './plugin.js';
import { avatarRpc } from './rpc.js';

export interface AvatarsBridgeContext {
  deps: Parameters<typeof createAvatarsBridgeMethods>[0];
  dmMemory: Parameters<typeof createAvatarsBridgeMethods>[1];
  detailOf: Parameters<typeof createAvatarsBridgeMethods>[2];
}

export interface AvatarsHostHooks {
  beforeWorkspaceFavicon(
    ctx: Parameters<typeof mountRoutes>[0],
    connection: HostFetchConnection,
    core: Pick<BotHarnessCore, 'registry'>,
  ): void;
}

export function createAvatarsContribution() {
  return {
    id: 'avatars',
    bridgeMethods: ({ deps, dmMemory, detailOf }) =>
      createAvatarsBridgeMethods(deps, dmMemory, detailOf),
    rpc: avatarRpc,
    host: {
      beforeWorkspaceFavicon: (ctx, connection, core) =>
        mountRoutes(ctx, () => connection.fetch, core.registry),
    },
  } satisfies FeatureContribution<AvatarsBridgeContext, never, AvatarsHostHooks>;
}
