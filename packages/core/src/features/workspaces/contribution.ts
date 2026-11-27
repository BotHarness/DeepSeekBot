import type { HumanContext } from '../../humans/context.js';
import type { FeatureContribution } from '../../kernel/feature-contribution.js';
import {
  createWorkspacesAdapterMethods,
  createWorkspacesBridgeMethods,
  type WorkspacesBridgeDeps,
} from './methods.js';
import {
  mountFolders,
  mountPermissionTracking,
  mountWorkspaceFavicon,
  relocateMemoryOnStartup,
} from './plugin.js';
import { workspaceGrantRpc, workspacesRpcMethods } from './rpc.js';

export interface WorkspacesBridgeContext {
  human: HumanContext;
  deps: WorkspacesBridgeDeps;
  isHostOwner(): boolean;
}

export function createWorkspacesContribution() {
  return {
    id: 'workspaces',
    bridgeMethods: ({ human, deps, isHostOwner }) => ({
      ...createWorkspacesAdapterMethods(human, deps, isHostOwner),
      ...createWorkspacesBridgeMethods(human, deps),
    }),
    rpc: { ...workspacesRpcMethods, ...workspaceGrantRpc },
    host: {
      beforeRegistry: relocateMemoryOnStartup,
      workspacePermissionTracking: mountPermissionTracking,
      workspaceFolders: mountFolders,
      workspaceFavicon: mountWorkspaceFavicon,
    },
  } satisfies FeatureContribution<
    WorkspacesBridgeContext,
    never,
    {
      beforeRegistry: typeof relocateMemoryOnStartup;
      workspacePermissionTracking: typeof mountPermissionTracking;
      workspaceFolders: typeof mountFolders;
      workspaceFavicon: typeof mountWorkspaceFavicon;
    }
  >;
}
