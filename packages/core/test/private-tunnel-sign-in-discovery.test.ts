import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { CONNECT_CHANNEL_PATH } from '@botharness/host-protocol/noise/channel';
import { afterEach, expect, it } from 'vitest';
import { createPrivateRelay } from '../../../deploy/private-relay/server.mjs';
import { createTunnelOrigin } from '../src/devices/private-tunnel.js';
import { createTempRoot } from './helpers.js';

const closers: Array<() => void> = [];
afterEach(() => {
  for (const close of closers.splice(0)) close();
});

async function listen(server: import('node:http').Server): Promise<string> {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const routes = {
  'tunnel origin': async () => {
    const server = createTunnelOrigin({
      port: () => 1,
      phoneToken: () => 'a'.repeat(43),
      probe: () => undefined,
    });
    closers.push(() => server.close());
    return listen(server);
  },
  'Docker private relay': async () => {
    const relay = createPrivateRelay({
      directory: createTempRoot('private-route-relay-'),
      bootstrap: 'a'.repeat(64),
    });
    closers.push(() => relay.close());
    return listen(relay.server);
  },
};

it.each(Object.entries(routes))(
  '%s tells an address-only sign-in that the route is private without revealing the Host',
  async (_name, start) => {
    const base = await start();
    const discovery = await fetch(`${base}${CONNECT_CHANNEL_PATH}`, {
      headers: { origin: 'https://app.example' },
    });
    expect(discovery.status).toBe(404);
    expect(discovery.headers.get('cache-control')).toBe('no-store');
    expect(discovery.headers.get('access-control-allow-origin')).toBe('*');
    expect(await discovery.json()).toEqual({ code: 'private-route' });

    const other = await fetch(`${base}/api/botharness/teamMode`);
    expect(other.status).toBe(404);
    expect(other.headers.get('access-control-allow-origin')).toBeNull();
    expect(await other.json()).toEqual({ code: 'not-found' });
  },
);
