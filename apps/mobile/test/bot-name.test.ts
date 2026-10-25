import { afterEach, expect, it } from 'vitest';

import { renameBot } from '../src/host/bot-name';
import { createHostClient, type HostClient } from '../src/host/client';
import { FakeHost } from './fake-host';

let client: HostClient | undefined;
afterEach(() => client?.stop());

it('changes only the Bot display name with an observed fingerprint and refreshes its shared identity', async () => {
  const fake = new FakeHost();
  const fingerprint = 'a'.repeat(64);
  let name = 'Nova';
  fake.methods.set('list', () => ({
    bots: [{ slug: 'nova', displayName: name, roles: [], aggregateState: 'idle' }],
  }));
  fake.methods.set('channels', () => ({ channels: [] }));
  fake.methods.set('rosterGet', () => ({ sections: [], pins: [], hidden: [], sectionOrder: [] }));
  fake.methods.set('get', () => ({ profileFingerprint: fingerprint }));
  fake.methods.set('update', () => {
    name = 'Nova Studio';
    return {};
  });
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  const target = client;
  target.start();
  await new Promise<void>((resolve) => {
    const stop = target.subscribe(() => {
      if (target.getSnapshot().roster !== undefined) {
        stop();
        resolve();
      }
    });
  });
  fake.calls.length = 0;
  await renameBot(target, 'nova', 'Nova Studio');
  expect(fake.calls.slice(0, 2)).toEqual([
    { method: 'get', args: { slug: 'nova' } },
    {
      method: 'update',
      args: { slug: 'nova', patch: { displayName: 'Nova Studio' }, expectedProfile: fingerprint },
    },
  ]);
  expect(target.getSnapshot().roster?.bots[0]).toMatchObject({
    slug: 'nova',
    displayName: 'Nova Studio',
  });
});

it('does not bypass an unavailable read or a refused update', async () => {
  const fake = new FakeHost();
  fake.methods.set('get', () => {
    throw Error('profile unavailable');
  });
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  await expect(renameBot(client, 'nova', 'Nova Studio')).rejects.toThrow('profile unavailable');
  expect(fake.calls).toHaveLength(1);
  fake.calls.length = 0;
  fake.methods.set('get', () => ({ profileFingerprint: 'b'.repeat(64) }));
  fake.methods.set('update', () => {
    throw Error('stale-profile');
  });
  await expect(renameBot(client, 'nova', 'Nova Studio')).rejects.toThrow('stale-profile');
  expect(fake.calls.map((call) => call.method)).toEqual(['get', 'update']);
});
