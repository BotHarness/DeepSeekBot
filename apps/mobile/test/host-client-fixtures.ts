import { type HostClient, type HostSnapshot } from '@botharness/host-client/client';
import wire from '../../../packages/host-client/test/fixtures/host-wire.json';

export const ROUTE = 'https://studio.tailnet-example.ts.net';

export const [thinking, , idle] = wire.mux.activity.slice(1);

export const latest = wire.mux.roster.filter((frame) => frame.type === 'latest');

export const LOOPBACK = 'http://127.0.0.1:4100';

export async function until(
  target: HostClient,
  accept: (snapshot: HostSnapshot) => boolean,
  limit = 200,
): Promise<HostSnapshot> {
  for (let tries = 0; tries < limit; tries += 1) {
    const snapshot = target.getSnapshot();
    if (accept(snapshot)) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out; last state ${JSON.stringify(target.getSnapshot().connection)}`);
}
