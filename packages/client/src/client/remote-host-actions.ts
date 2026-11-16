import type { HostClient } from '../../../../apps/mobile/src/host/client.js';
import { createActions, type BridgeActions } from './actions.js';
import type { BridgeCall } from './bridge.js';
import { hostBridgeCall } from './host-bridge-call.js';
import { createStore, type ClientStore } from './store.js';

export interface RemoteHostSettings {
  readonly call: BridgeCall;
  readonly actions: BridgeActions;
  readonly store: ClientStore;
}

const owned = new WeakMap<HostClient, RemoteHostSettings>();

export function remoteHostSettings(client: HostClient): RemoteHostSettings {
  let settings = owned.get(client);
  if (settings === undefined) {
    const call = hostBridgeCall(
      client,
      () => client.getSnapshot().connection.status === 'connected',
    );
    const store = createStore();
    settings = { call, store, actions: createActions(call, store) };
    owned.set(client, settings);
  }
  return settings;
}

export function remoteHostActions(client: HostClient): BridgeActions {
  return remoteHostSettings(client).actions;
}
