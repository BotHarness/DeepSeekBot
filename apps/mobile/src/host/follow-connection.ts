import type { HostClient } from '@botharness/host-client/client';

export function followConnection(client: HostClient, run: () => Promise<unknown>): () => void {
  let loaded = false;
  let pending = false;
  let again = false;
  const load = (): void => {
    if (loaded) return;
    if (pending) {
      again = true;
      return;
    }
    pending = true;
    again = false;
    run().then(
      () => {
        loaded = true;
        pending = false;
      },
      () => {
        pending = false;
        if (again) load();
      },
    );
  };
  load();
  return client.subscribe(() => {
    if (client.getSnapshot().connection.status === 'connected') load();
  });
}
