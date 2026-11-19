import { installTypedLive, type TypedLive } from '../src/client/messaging-defaults-live.js';
import type { LiveResource } from '../../core/src/channels/resource-events.js';

export function resourceEvents() {
  let roster: Parameters<TypedLive['roster']>[0] | undefined;
  let revision = 0;
  const dispose = installTypedLive({
    roster(handlers) {
      roster = handlers;
      handlers.baseline([]);
      return () => {
        roster = undefined;
      };
    },
    activity: () => () => {},
  });
  return {
    emit(resource: LiveResource) {
      roster?.resource?.({ resource, revision: ++revision });
    },
    reconnect() {
      roster?.interrupted();
      roster?.baseline([]);
    },
    dispose,
  };
}
