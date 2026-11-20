import {
  approveWorkspaceGrantRequest,
  loadWorkspaceOptions,
  loadHostFolders,
  loadWorkspaceGrants,
  loadAssignmentAccess,
  setAssignmentAccess,
  type AssignmentAccessPresetView,
  createWorkspaceGrant,
  createGroupWorkspaceGrant,
  readGroupWorkspaceGrant,
  revokeWorkspaceGrant,
  setWorkspaceGrantWrite,
  type WorkspaceOption,
  type WorkspaceGrantView,
  type BridgeCall,
} from './bridge.js';
import { publishWorkspaceGrantChange } from './workspace-grant-events.js';
import type { ActionFolderAccess, BridgeActions, HostDirectoryListing } from './actions.js';
import type { createActivityActions } from './actions-activity.js';

export interface WorkspaceActions {
  listHostFolders(
    path?: string,
    signal?: AbortSignal,
    offset?: number,
  ): Promise<HostDirectoryListing>;
  pickWorkspaceFolder(): Promise<string | null>;
  addWorkspaceFolder(slug: string): Promise<WorkspaceGrantView | undefined>;
  authorizeWorkspacePath(slug: string, path: string): Promise<WorkspaceGrantView>;
  resolveWorkspaceFolder(path: string): Promise<WorkspaceOption>;
  authorizeGroupWorkspacePath(
    channelId: string,
    slug: string,
    path: string,
  ): Promise<{ grant: WorkspaceGrantView; created: boolean }>;
  readGroupWorkspaceGrant(
    channelId: string,
    slug: string,
    path: string,
  ): Promise<WorkspaceGrantView | undefined>;
  resolveWorkspaceGrantRequest(
    slug: string,
    messageId: string,
    path: string,
    body: (workspaceTitle: string) => string,
    channelId?: string,
  ): Promise<void>;
  listWorkspaceOptions(): Promise<WorkspaceOption[]>;
  listWorkspaceGrants(slug: string): Promise<WorkspaceGrantView[]>;
  createWorkspaceGrant(slug: string, workspaceId: string): Promise<WorkspaceGrantView>;
  revokeWorkspaceGrant(slug: string, grantId: string): Promise<WorkspaceGrantView>;
  setWorkspaceGrantWrite(
    slug: string,
    grantId: string,
    enabled: boolean,
  ): Promise<WorkspaceGrantView>;
  assignmentAccess(slug: string): Promise<AssignmentAccessPresetView>;
  setAssignmentAccess(
    slug: string,
    mode: AssignmentAccessPresetView['mode'],
    acknowledgeRisk: boolean,
    scope?: 'chat' | 'assignments',
  ): Promise<AssignmentAccessPresetView>;
}

export function createWorkspaceActions(
  call: BridgeCall,
  folderAccess: ActionFolderAccess | undefined,
  getActions: () => BridgeActions,
  settleNativeInboxAction: ReturnType<typeof createActivityActions>['settleNativeInboxAction'],
) {
  return {
    listHostFolders: (path, signal, offset) => loadHostFolders(call, path, signal, offset),
    async addWorkspaceFolder(slug) {
      if (folderAccess === undefined) throw new Error('DSH folder picker is unavailable');
      const path = await folderAccess.pickDirectory();
      if (path === null) return undefined;
      const workspace = await folderAccess.createWorkspace({ path });
      return createWorkspaceGrant(call, slug, workspace.workspaceId);
    },
    async authorizeWorkspacePath(slug, path) {
      if (folderAccess === undefined) throw new Error('DSH Workspace controller is unavailable');
      const workspace = await folderAccess.createWorkspace({ path });
      return createWorkspaceGrant(call, slug, workspace.workspaceId);
    },
    async resolveWorkspaceFolder(path) {
      if (folderAccess === undefined) throw new Error('DSH Workspace controller is unavailable');
      const workspace = await folderAccess.createWorkspace({ path });
      const resolved = (await loadWorkspaceOptions(call)).find(
        (row) => row.id === workspace.workspaceId,
      );
      if (resolved === undefined) throw new Error('Resolved DSH Workspace is unavailable');
      return resolved;
    },
    async authorizeGroupWorkspacePath(channelId, slug, path) {
      if (folderAccess === undefined) throw new Error('DSH Workspace controller is unavailable');
      const workspace = await folderAccess.createWorkspace({ path });
      return createGroupWorkspaceGrant(call, slug, workspace.workspaceId, channelId, path);
    },
    readGroupWorkspaceGrant: (channelId, slug, path) =>
      readGroupWorkspaceGrant(call, slug, channelId, path),
    listWorkspaceOptions: () => loadWorkspaceOptions(call),
    listWorkspaceGrants: (slug) => loadWorkspaceGrants(call, slug),
    createWorkspaceGrant: (slug, workspaceId) => createWorkspaceGrant(call, slug, workspaceId),
    revokeWorkspaceGrant: (slug, grantId) => revokeWorkspaceGrant(call, slug, grantId),
    setWorkspaceGrantWrite: (slug, grantId, enabled) =>
      setWorkspaceGrantWrite(call, slug, grantId, enabled),
    assignmentAccess: (slug) => loadAssignmentAccess(call, slug),
    setAssignmentAccess: (slug, mode, acknowledgeRisk, scope) =>
      setAssignmentAccess(call, slug, mode, acknowledgeRisk, scope),
    pickWorkspaceFolder() {
      if (folderAccess === undefined) throw new Error('DSH folder picker is unavailable');
      return folderAccess.pickDirectory();
    },
    async resolveWorkspaceGrantRequest(slug, messageId, path, _body, sourceChannelId) {
      const channelId = sourceChannelId ?? 'dm-' + slug;
      const readRequest = async () => {
        const messages = await getActions().activityListContext(channelId, messageId);
        return messages.find((message) => message.id === messageId);
      };
      await settleNativeInboxAction(
        'workspace-grant-request',
        channelId,
        messageId,
        async () => {
          const request = await readRequest();
          if (
            request?.grantRequest !== true ||
            request.grantRequestResolved === true ||
            request.author.kind !== 'bot' ||
            request.author.slug !== slug
          )
            throw new Error('Workspace request is no longer pending for this Bot');
          if (folderAccess === undefined)
            throw new Error('DSH Workspace controller is unavailable');
          const workspace = await folderAccess.createWorkspace({ path });
          await approveWorkspaceGrantRequest(
            call,
            slug,
            channelId,
            messageId,
            workspace.workspaceId,
          );
          publishWorkspaceGrantChange(slug, getActions());
        },
        async () => ((await readRequest())?.grantRequestResolved === true ? 'expired' : 'pending'),
      );
      getActions().telemetryEvent('activity:grant_request_submit');
    },
  } satisfies WorkspaceActions;
}
