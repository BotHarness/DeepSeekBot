import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { createWorkspace } from '../../../../apps/mobile/src/host/bot-settings.js';
import type { createActions } from './actions.js';
import { BridgeCallError } from './bridge.js';

export function remoteFolderAccess(
  client: HostClient,
  current: () => boolean,
): NonNullable<Parameters<typeof createActions>[2]> {
  const check = () => {
    if (!current() || client.getSnapshot().connection.status !== 'connected')
      throw new BridgeCallError('connection-host-changed', 'This connection changed.');
  };
  return {
    async pickDirectory() {
      throw new BridgeCallError(
        'directory-picker/unavailable',
        'Choose a folder from the target computer’s folder list.',
      );
    },
    async createWorkspace({ path }) {
      check();
      const workspaceId = await createWorkspace(client, path);
      check();
      return { workspaceId };
    },
  };
}
