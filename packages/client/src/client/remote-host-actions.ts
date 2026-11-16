import type { HostClient } from '@botharness/host-client/client';
import { createActions, type BridgeActions } from './actions.js';
import { hostBridgeCall } from './host-bridge-call.js';
import { createStore } from './store.js';

const owned = new WeakMap<HostClient, BridgeActions>();

export function remoteHostActions(client: HostClient): BridgeActions {
  let actions = owned.get(client);
  if (actions === undefined) {
    actions = createActions(
      hostBridgeCall(client, () => client.getSnapshot().connection.status === 'connected'),
      createStore(),
    );
    owned.set(client, actions);
  }
  return actions;
}
