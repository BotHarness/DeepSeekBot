import { installTypedLive, type TypedLive } from '../src/client/messaging-defaults-live.js';
import type { ScopedResource, UnscopedResource } from '../../core/src/channels/resource-events.js';

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
    emit(change: UnscopedResource | ScopedResource) {
      roster?.resource?.({
        ...(typeof change === 'string' ? { resource: change } : change),
        revision: ++revision,
      });
    },
    reconnect() {
      roster?.interrupted();
      roster?.baseline([]);
    },
    dispose,
  };
}
