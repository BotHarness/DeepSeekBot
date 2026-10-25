import { expect, it } from 'vitest';
import { learnedRoutes } from '../src/host/learned-routes';
import type { SavedHost } from '../src/host/hosts';

const host: Pick<SavedHost, 'hostId' | 'routes' | 'encryption'> = {
  hostId: 'one',
  routes: ['https://studio.ts.net'],
  encryption: { protocol: 'connect-noise-xk-v1', hostKey: 'pinned', deviceKey: 'device' },
};
const advertisement = (id = 'one', key = 'pinned') => ({
  host: { id },
  connect: { encryption: { publicKey: key } },
  routes: {
    routes: [
      { ready: true, url: 'http://192.168.1.2:18000' },
      { ready: true, url: 'https://studio.ts.net:8443' },
      { ready: true, url: 'http://localhost:18000' },
      { ready: false, url: 'https://absent.ts.net' },
    ],
  },
});
it('learns usable routes from the same pinned Host, preferring LAN without adding loopback', () => {
  expect(learnedRoutes(host, advertisement())).toEqual([
    'http://192.168.1.2:18000',
    'https://studio.ts.net:8443',
    'https://studio.ts.net',
  ]);
});
it('retains pairing routes when the Host identity changes', () => {
  expect(learnedRoutes(host, advertisement('other'))).toEqual(host.routes);
  expect(learnedRoutes(host, advertisement('one', 'changed'))).toEqual(host.routes);
});
it('never silently upgrades legacy pairing to an encrypted route', () => {
  expect(learnedRoutes({ hostId: host.hostId, routes: host.routes }, advertisement())).toEqual([
    'https://studio.ts.net:8443',
    'https://studio.ts.net',
  ]);
});
