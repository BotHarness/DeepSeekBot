import { afterEach, expect, it } from 'vitest';
import { createHostClient, type HostClient } from '../src/client.js';
import { FakeHost } from './fake-host.js';

let client: HostClient | undefined;
afterEach(() => client?.stop());

async function until(accept: () => boolean) {
  for (let i = 0; i < 300; i++) {
    if (accept()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Timed out');
}

it('tells phones which Host resource changed and when a fresh baseline arrives', async () => {
  const host = new FakeHost();
  client = createHostClient({
    routes: ['https://studio.tailnet-example.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  const seen: Array<string | undefined> = [];
  const live: string[] = [];
  const changes: unknown[] = [];
  const off = client.onResource!((resource, change) => {
    seen.push(resource);
    changes.push(change);
  });
  client.onLive((source) => live.push(source));
  client.start();
  await until(() => seen.length > 0);
  expect(seen).toEqual([undefined]);
  host.push('botharness/followRoster', {
    type: 'resource',
    change: { resource: 'private-inputs', revision: 4 },
  });
  await until(() => seen.length > 1);
  expect(seen).toEqual([undefined, 'private-inputs']);
  const scoped = {
    resource: 'tool-approval',
    revision: 1,
    channelId: 'dm-ada',
    messageId: 'request',
  };
  host.push('botharness/followRoster', { type: 'resource', change: scoped });
  await until(() => seen.length > 2);
  expect(changes.at(-1)).toEqual(scoped);
  expect(live).toEqual([]);
  off();
  host.push('botharness/followRoster', {
    type: 'resource',
    change: { resource: 'private-inputs', revision: 5 },
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(seen).toHaveLength(3);
});
