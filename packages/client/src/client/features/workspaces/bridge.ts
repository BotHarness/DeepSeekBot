import { bridgeHost, unwrap, type BridgeCall } from '../../bridge-transport.js';
import * as accessReaders from '@botharness/host-client/access-readers';
import type { WireWorkspaceGrant } from '@botharness/host-protocol/wire';
import type { WorkspaceOption } from '../../bridge.js';

export interface WorkspaceGrantView extends WorkspaceOption {
  botSlug: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  createdAt: string;
  revokedAt?: string;
  orchestratorWrite?: boolean;
  writeRevision?: number;
}

function workspaceGrantView(grant: WireWorkspaceGrant): WorkspaceGrantView {
  return {
    ...grant,
    path: grant.workspacePath,
    title: grant.workspaceTitle,
    orchestratorWrite: grant.orchestratorWrite === true,
    writeRevision: grant.writeRevision ?? 0,
  };
}

export async function loadWorkspaceGrants(
  call: BridgeCall,
  slug: string,
): Promise<WorkspaceGrantView[]> {
  return (await accessReaders.readWorkspaceGrants(bridgeHost(call), { slug })).grants.map(
    workspaceGrantView,
  );
}

export async function createWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  workspaceId: string,
): Promise<WorkspaceGrantView> {
  return workspaceGrantView(
    (await accessReaders.createGrant(bridgeHost(call), { slug, workspaceId })).grant,
  );
}

export async function createGroupWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  workspaceId: string,
  channelId: string,
  path: string,
): Promise<{ grant: WorkspaceGrantView; created: boolean }> {
  const { grant, created } = await accessReaders.createGrant(bridgeHost(call), {
    slug,
    workspaceId,
    scope: { channelId, path },
  });
  return { grant: workspaceGrantView(grant), created: created! };
}

export async function readGroupWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  channelId: string,
  path: string,
): Promise<WorkspaceGrantView | undefined> {
  const { grants } = await accessReaders.readWorkspaceGrants(bridgeHost(call), {
    slug,
    scope: { channelId, path },
  });
  const grant = grants[0];
  return grant === undefined ? undefined : workspaceGrantView(grant);
}

export async function approveWorkspaceGrantRequest(
  call: BridgeCall,
  slug: string,
  channelId: string,
  requestMessageId: string,
  workspaceId: string,
): Promise<WorkspaceGrantView> {
  const { grant } = await accessReaders.approveGrantRequest(bridgeHost(call), {
    slug,
    channelId,
    requestMessageId,
    workspaceId,
  });
  return workspaceGrantView(grant);
}

export async function setWorkspaceGrantWrite(
  call: BridgeCall,
  slug: string,
  grantId: string,
  enabled: boolean,
): Promise<WorkspaceGrantView> {
  const value = await unwrap(call, 'grantWriteSet', { slug, grantId, enabled });
  return workspaceGrantView(accessReaders.readGrantReceipt(value, 'grantWriteSet', slug));
}

export async function revokeWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<WorkspaceGrantView> {
  return workspaceGrantView(
    (await accessReaders.revokeGrant(bridgeHost(call), { slug, grantId })).grant,
  );
}
