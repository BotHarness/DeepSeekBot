import { describe, expect, it } from 'vitest';

import { createHostClient, type HostClient, type HostSnapshot } from '../src/host/client';
import { pairWithLiveHost } from './live-pairing';
import { nodeCarrier } from './node-carrier';

const live = process.env['MOBILE_LIVE_HOST_URL'];

async function until(client: HostClient, accept: (s: HostSnapshot) => boolean, ms = 20_000) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (accept(client.getSnapshot())) return client.getSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out in ${JSON.stringify(client.getSnapshot().connection)}`);
}

describe.skipIf(live === undefined)('Host client against a live isolated Host', () => {
  it('pairs, reads the Roster through the device gateway and follows a real state change', async () => {
    const { route, operator, host } = await pairWithLiveHost(live!, 'mobile live test');
    const client = createHostClient({
      routes: host.routes,
      credential: host.credential,
      carrier: nodeCarrier(),
    });
    client.start();
    try {
      const connected = await until(client, (s) => s.connection.status === 'connected');
      const bot = connected.roster?.bots[0];
      expect(bot).toBeDefined();

      const send = await operator.request(`${route}/api/botharness/channelSend`, {
        method: 'POST',
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: 'botharness/channelSend',
          payload: {
            args: {
              channelId: `dm-${bot!.slug}`,
              body: `mobile live test ${Date.now()}`,
              messageId: `human-${crypto.randomUUID()}`,
            },
          },
        }),
      });
      expect(send.status).toBe(200);
      await until(client, (s) => s.roster?.bots[0]?.state !== 'idle');
      await until(
        client,
        (s) =>
          s.roster?.bots[0]?.preview?.startsWith('mobile live test') === true ||
          s.roster?.bots[0]?.state === 'idle',
      );
    } finally {
      client.stop();
    }
  }, 60_000);
});
