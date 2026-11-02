import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import { observeInbox, prefetchInbox } from '../src/host/inbox';
import { FakeHost } from './fake-host';

const clients: HostClient[] = [];
afterEach(() => {
  for (const client of clients.splice(0)) client.stop();
});

function host() {
  const fake = new FakeHost();
  let calls = 0;
  let refuse = false;
  fake.answers.set('humanAttention', () => {
    calls++;
    return refuse
      ? { ok: false, error: { code: 'unavailable', message: 'offline', details: {} } }
      : { ok: true, value: { items: [], queryVersion: 1 } };
  });
  const client = createHostClient({
    routes: ['https://studio.tailnet.ts.net'],
    credential: fake.credential,
    carrier: fake.carrier,
  });
  clients.push(client);
  client.start();
  return {
    client,
    calls: () => calls,
    refuse: () => {
      refuse = true;
    },
  };
}

async function settle() {
  for (let i = 0; i < 15; i++) await new Promise((r) => setTimeout(r, 5));
}

describe('Activity query observation', () => {
  it('prefetches without navigation, releases live observation and tolerates repeated cleanup', async () => {
    const target = host();
    const query = { activity: true, section: 'action' } as const;
    const cancel = prefetchInbox(target.client, query);
    await settle();
    const observed = observeInbox(target.client, query);
    expect(observed.getSnapshot().status).toBe('ready');
    expect(observed.getInbox()).toBeUndefined();
    cancel();
    cancel();
    const stop = observed.subscribe(() => {});
    expect(observed.getInbox()).toBeDefined();
    stop();
    expect(observed.getInbox()).toBeUndefined();
  });
  it('shows cached data immediately on return and refreshes without clearing it', async () => {
    const target = host();
    const query = { activity: true, section: 'action' } as const;
    const first = observeInbox(target.client, query);
    const off = first.subscribe(() => {});
    await settle();
    expect(first.getSnapshot().status).toBe('ready');
    const cached = first.getSnapshot();
    const calls = target.calls();
    off();
    const returned = observeInbox(target.client, { ...query });
    expect(returned.getSnapshot()).toBe(cached);
    const stop = returned.subscribe(() => {});
    expect(returned.getSnapshot()).toBe(cached);
    await settle();
    expect(target.calls()).toBeGreaterThan(calls);
    stop();
  });

  it('retains a successful snapshot on refresh failure and isolates Host and query identity', async () => {
    const first = host();
    const query = { activity: true, section: 'action' } as const;
    const observed = observeInbox(first.client, query);
    const off = observed.subscribe(() => {});
    await settle();
    off();
    first.refuse();
    const returned = observeInbox(first.client, query);
    const stop = returned.subscribe(() => {});
    await settle();
    expect(returned.getSnapshot()).toMatchObject({ status: 'ready', stale: 'offline' });
    expect(observeInbox(first.client, { ...query, search: 'different' }).getSnapshot().status).toBe(
      'loading',
    );
    expect(observeInbox(host().client, query).getSnapshot().status).toBe('loading');
    stop();
  });

  it('refreshes the loaded page window on return without discarding its tail', async () => {
    const fake = new FakeHost();
    const calls: Record<string, unknown>[] = [];
    let updated = false;
    fake.answers.set('humanAttention', (args) => {
      calls.push(args);
      const second = args.cursor === 'page-two';
      return {
        ok: true,
        value: {
          items: [{ id: second ? 'second' : 'first', summary: updated ? 'updated' : 'original' }],
          ...(second ? {} : { nextCursor: 'page-two' }),
          queryVersion: 1,
        },
      };
    });
    const client = createHostClient({
      routes: ['https://studio.tailnet.ts.net'],
      credential: fake.credential,
      carrier: fake.carrier,
    });
    clients.push(client);
    client.start();
    const observed = observeInbox(client, { activity: true, section: 'replies' });
    const off = observed.subscribe(() => {});
    await settle();
    await observed.getInbox()!.loadMore!('replies');
    const loaded = observed.getSnapshot();
    expect(loaded).toMatchObject({ sections: { replies: [{ id: 'first' }, { id: 'second' }] } });
    off();
    updated = true;
    calls.length = 0;
    const stop = observed.subscribe(() => {});
    expect(observed.getSnapshot()).toBe(loaded);
    await settle();
    expect(observed.getSnapshot()).toMatchObject({
      sections: {
        replies: [
          { id: 'first', summary: 'updated' },
          { id: 'second', summary: 'updated' },
        ],
      },
    });
    expect(calls.map((args) => args.cursor)).toEqual([undefined, 'page-two']);
    stop();
  });

  it('shares a query until its last observer leaves and bounds inactive search caches', async () => {
    const target = host();
    const query = { activity: true, section: 'action' } as const;
    const first = observeInbox(target.client, query);
    const second = observeInbox(target.client, query);
    const off = first.subscribe(() => {});
    const stop = second.subscribe(() => {});
    await settle();
    expect(second.getInbox()).toBe(first.getInbox());
    off();
    expect(second.getInbox()).toBeDefined();
    stop();
    expect(second.getInbox()).toBeUndefined();
    for (let i = 0; i < 40; i++) observeInbox(target.client, { ...query, search: `search-${i}` });
    expect(observeInbox(target.client, query).getSnapshot().status).toBe('loading');
  });
});
