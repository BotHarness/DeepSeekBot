import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import { afterEach, expect, it } from 'vitest';
import { createTunnelOrigin } from '../src/devices/private-tunnel.js';

const servers: ReturnType<typeof createTunnelOrigin>[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function origin(): Promise<string> {
  const server = createTunnelOrigin({
    port: () => 1,
    phoneToken: () => 'a'.repeat(43),
    probe: () => undefined,
  });
  servers.push(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

it('tells an address-only sign-in that the route is private without revealing the Host', async () => {
  const base = await origin();
  const discovery = await fetch(`${base}${CONNECT_CHANNEL_PATH}`);
  expect(discovery.status).toBe(404);
  expect(discovery.headers.get('cache-control')).toBe('no-store');
  expect(await discovery.json()).toEqual({ code: 'private-route' });

  const other = await fetch(`${base}/api/botharness/teamMode`);
  expect(other.status).toBe(404);
  expect(await other.json()).toEqual({ code: 'not-found' });
});
