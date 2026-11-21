import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { WorkspaceGrant } from '../../workspaces/grants.js';
import type { WorkspacesBridgeMethods } from './methods.js';
import type { FolderListing } from '../../workspaces/folder-browse.js';
import type { WorkspacesAdapterMethods } from './methods.js';

export function grants(
  methods: WorkspacesBridgeMethods,
  slug: string,
  scope?: { channelId: string; path: string },
): { grants: WorkspaceGrant[] } {
  return unwrap(methods.grants({ slug, ...(scope === undefined ? {} : { scope }) }));
}

export function grantCreate(
  methods: WorkspacesBridgeMethods,
  slug: string,
  workspaceId: string,
  scope?: { channelId: string; path: string },
): Promise<{ grant: WorkspaceGrant; created?: boolean }> {
  return unwrapAsync(
    methods.grantCreate({
      slug,
      workspaceId,
      ...(scope === undefined ? {} : { scope }),
    }),
  );
}

export function grantRevoke(
  methods: WorkspacesBridgeMethods,
  slug: string,
  grantId: string,
): { grant: WorkspaceGrant } {
  return unwrap(methods.grantRevoke({ slug, grantId }));
}

export function grantRequestApprove(
  methods: WorkspacesBridgeMethods,
  slug: string,
  channelId: string,
  requestMessageId: string,
  workspaceId: string,
  acknowledgeReadWrite: boolean,
) {
  return unwrapAsync(
    methods.grantRequestApprove({
      slug,
      channelId,
      requestMessageId,
      workspaceId,
      acknowledgeReadWrite,
    }),
  );
}

export function grantWriteSet(
  methods: WorkspacesBridgeMethods,
  slug: string,
  grantId: string,
  enabled: boolean,
): { grant: WorkspaceGrant } {
  return unwrap(methods.grantWriteSet({ slug, grantId, enabled }));
}

export function workspaceOptions(methods: WorkspacesAdapterMethods): {
  workspaces: { id: string; path: string; title: string }[];
} {
  return unwrap(methods.workspaceOptions({}));
}

export function folderBrowse(
  methods: WorkspacesAdapterMethods,
  path?: string,
  offset?: number,
): Promise<FolderListing> {
  return unwrapAsync(
    methods.folderBrowse({
      ...(path === undefined ? {} : { path }),
      ...(offset === undefined ? {} : { offset }),
    }),
  );
}

export function workspaceFileTarget(
  methods: WorkspacesAdapterMethods,
  slug: string,
  grantId: string,
): { target: { path: string; relativePath: ''; kind: 'directory' } } {
  return unwrap(methods.workspaceFileTarget({ slug, grantId }));
}
