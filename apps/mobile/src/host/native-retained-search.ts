import { useSyncExternalStore } from 'react';
import { hostSession } from './host-session';
import { retainedCache } from './native-cache';
import { hostLooks } from './native-host-look';
import { shownHostName } from '../ui/design/host-look';
import { createRetainedSearch } from './retained-search';

export const retainedSearch = createRetainedSearch({
  sources: () =>
    hostSession
      .getState()
      .hosts.filter((host) => retainedCache.allowed(host))
      .map((host) => ({
        hostId: host.hostId,
        deviceId: host.deviceId,
        name: shownHostName(hostLooks.look(host.hostId), host.hostName),
      })),
  list: (source) => retainedCache.list(source),
  read: (source, target) => retainedCache.read(source, target),
});

retainedSearch.setActive(false);

hostSession.subscribe(() => {
  void retainedSearch.refresh();
});
retainedCache.subscribe((removed) => {
  if (removed) retainedSearch.remove(removed.source, removed.target);
  else void retainedSearch.refresh();
});
hostLooks.subscribe(() => {
  void retainedSearch.refresh();
});

export function useRetainedSearch() {
  return useSyncExternalStore(retainedSearch.subscribe, retainedSearch.getSnapshot);
}
