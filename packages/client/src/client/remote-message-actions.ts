import { decideGrantRequest } from '../../../../apps/mobile/src/host/attention-actions.js';
import type { RequestRef } from '../../../../apps/mobile/src/host/requests.js';
import { createHostRequestActions, type HostRequestActions } from './host-activity-actions.js';
import {
  listHostFolders,
  resolveWorkspaceFolder,
} from '../../../../apps/mobile/src/host/bot-settings.js';
import type { BridgeActions } from './actions.js';
import type { MessageHost } from './message-host.js';
import type { FolderBrowserActions } from './workspace-grants-entry.js';

type RemoteMessageActions = Pick<
  BridgeActions,
  | 'privateInputStatus'
  | 'privateInputSubmit'
  | 'privateInputCancel'
  | 'pickWorkspaceFolder'
  | 'resolveWorkspaceGrantRequest'
> &
  FolderBrowserActions &
  HostRequestActions;

export function remoteMessageActions(
  host: MessageHost,
  target: RequestRef,
  requestUnavailable: string,
): RemoteMessageActions {
  const { client } = host;
  const { botSlug } = target;
  const check = (channelId: string) => {
    if (!host.current(channelId)) throw new Error('The conversation changed.');
  };
  const ref = (channelId: string, messageId: string): RequestRef => {
    check(channelId);
    if (channelId !== target.channelId || messageId !== target.messageId)
      throw new Error('The conversation changed.');
    return target;
  };
  return {
    ...createHostRequestActions({ client: () => client, ref, requestUnavailable }),
    async privateInputStatus(channelId, messageId) {
      const value = await client.call<{
        status: Awaited<ReturnType<NonNullable<BridgeActions['privateInputStatus']>>>;
      }>('privateInputStatus', { channelId, messageId });
      if (!['pending', 'configured', 'cancelled', 'expired'].includes(value.status))
        throw new Error('Invalid private input status');
      return value.status;
    },
    async privateInputSubmit(channelId, messageId, values) {
      ref(channelId, messageId);
      const value = await client.call<{ accepted: boolean }>('privateInputSubmit', {
        channelId,
        messageId,
        values,
      });
      if (value.accepted !== true) throw new Error('Private input was not accepted');
    },
    async privateInputCancel(channelId, messageId) {
      ref(channelId, messageId);
      const value = await client.call<{ accepted: boolean }>('privateInputCancel', {
        channelId,
        messageId,
      });
      if (value.accepted !== true) throw new Error('Private input cancellation was not accepted');
    },
    listHostFolders: (path) => listHostFolders(client, path),
    pickWorkspaceFolder: async () => null,
    async resolveWorkspaceGrantRequest(slug, messageId, path, _body, channelId) {
      if (slug !== botSlug || channelId === undefined) throw new Error('The conversation changed.');
      ref(channelId, messageId);
      const workspace = await resolveWorkspaceFolder(client, path);
      check(channelId);
      const { result } = await decideGrantRequest(client, ref(channelId, messageId), workspace.id);
      if (result !== 'accepted') throw new Error('The folder request is no longer pending.');
    },
  };
}
