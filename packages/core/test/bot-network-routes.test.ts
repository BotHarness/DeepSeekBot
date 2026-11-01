import { expect, it } from 'vitest';
import { createBotNetworkRoutes } from '../src/devices/bot-network-routes.js';
import {
  BotNetworkDeliveryError,
  type BotNetworkPort,
  type NetworkBotMessage,
} from '../src/runtime/bot-network.js';

it('selects an available route before sending but never resends an unknown delivery over another network', async () => {
  const sent: string[] = [];
  const message: NetworkBotMessage = {
    id: 'one-request',
    at: '2026-11-01T00:00:00.000Z',
    senderBotSlug: 'developer',
    recipientBotSlug: 'ios',
    body: 'Investigate the iOS bug',
    causation: { rootSourceEventId: 'human-request', parentSourceEventId: 'human-request', hop: 1 },
  };
  const contact = {
    hostId: 'mac-host',
    botSlug: 'ios',
    displayName: 'iOS developer',
    device: { model: null, platform: 'darwin' },
    capabilities: [],
  };
  const provider = (name: string, online: boolean): BotNetworkPort => ({
    contacts: () => (online ? [contact] : []),
    availability: () => (online ? 'available' : 'unavailable'),
    membership: async () => 'member',
    async send(_host, accepted) {
      expect(accepted).toBe(message);
      sent.push(name);
      throw new BotNetworkDeliveryError('delivery-unknown');
    },
  });
  const routes = createBotNetworkRoutes();
  routes.attach(provider('offline-tailnet', false));
  routes.attach(provider('connect', true));
  routes.attach(provider('second-network', true));
  expect(routes.contacts()).toEqual([contact]);
  await expect(routes.send('mac-host', message)).rejects.toMatchObject({
    code: 'delivery-unknown',
  });
  expect(sent).toEqual(['connect']);
});

it('keeps an eligible colleague reachable through Connect when the tailnet route withdraws, then detaches it with its owner', async () => {
  const routes = createBotNetworkRoutes();
  let refreshed = false;
  routes.attach({
    contacts: () => [],
    membership: async () => 'withdrawn',
    availability: () => 'withdrawn',
    async send() {
      throw new Error('withdrawn route must not send');
    },
  });
  const detach = routes.attach({
    contacts: () => [],
    refresh: async () => {
      refreshed = true;
    },
    membership: async () => 'member',
    availability: () => 'available',
    async send() {},
  });
  await routes.refresh?.();
  expect(refreshed).toBe(true);
  expect(await routes.membership?.('mac-host')).toBe('member');
  expect(routes.availability?.('mac-host', 'ios')).toBe('available');
  detach();
  expect(await routes.membership?.('mac-host')).toBe('withdrawn');
  expect(routes.availability?.('mac-host', 'ios')).toBe('withdrawn');
});

it('refuses conflicting Host identities across networks without exposing either colleague or sending', async () => {
  const routes = createBotNetworkRoutes();
  const sent: string[] = [];
  for (const key of ['a'.repeat(64), 'b'.repeat(64)]) {
    routes.attach({
      contacts: () => [
        {
          hostId: 'mac-host',
          hostKey: key,
          botSlug: 'ios',
          displayName: 'iOS developer',
          device: { model: null, platform: 'darwin' },
          capabilities: [],
        },
      ],
      availability: () => 'available',
      membership: async () => 'member',
      async send() {
        sent.push(key);
      },
    });
  }
  expect(routes.contacts()).toEqual([]);
  expect(routes.availability?.('mac-host', 'ios')).toBe('unavailable');
  expect(await routes.membership?.('mac-host')).toBe('unavailable');
  await expect(
    routes.send('mac-host', {
      id: 'conflicted-request',
      at: '2026-11-01T00:00:00.000Z',
      senderBotSlug: 'developer',
      recipientBotSlug: 'ios',
      body: 'Investigate',
      causation: { rootSourceEventId: 'human', parentSourceEventId: 'human', hop: 1 },
    }),
  ).rejects.toMatchObject({ code: 'network-denied' });
  expect(sent).toEqual([]);
});
