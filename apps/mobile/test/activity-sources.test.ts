import { createActivityCountPreferences } from '../src/host/activity-count';
import { afterEach, expect, it } from 'vitest';
import { createHostClient, type HostClient } from '../src/host/client';
import { createInbox, type Inbox } from '../src/host/inbox';
import {
  observeActivitySources,
  observeActivitySourceCount,
  activityKey,
  activitySelection,
  type ActivitySource,
} from '../src/host/activity-sources';
import { FakeHost } from './fake-host';

const clients: HostClient[] = [];
const inboxes: Inbox[] = [];
const stops: Array<() => void> = [];
afterEach(() => {
  stops.splice(0).forEach((stop) => stop());
  inboxes.splice(0).forEach((i) => i.stop());
  clients.splice(0).forEach((c) => c.stop());
});
async function source(id: string) {
  const fake = new FakeHost(id);
  fake.methods.set('humanAttention', (args) => ({
    queryVersion: 1,
    items:
      args['category'] === 'action'
        ? [
            {
              id: args['cursor'] ? 'second' : 'same',
              kind: 'user-question',
              category: 'action',
              botSlug: 'same-bot',
              summary: id,
              createdAt: id === 'a' ? '2026-10-20T00:00:00Z' : '2026-10-21T00:00:00Z',
            },
          ]
        : [],
    ...(args['category'] === 'action' && !args['cursor'] ? { nextCursor: 'next' } : {}),
  }));
  const client = createHostClient({
    hostId: id,
    credential: fake.credential,
    routes: [`https://${id}.tailnet.ts.net`],
    carrier: fake.carrier,
  });
  clients.push(client);
  client.start();
  await expect.poll(() => client.getSnapshot().connection.status).toBe('connected');
  const inbox = createInbox(client);
  inboxes.push(inbox);
  const result: ActivitySource = { hostId: id, label: id, client, inbox, roster: undefined };
  return { fake, source: result };
}
it('merges matching local IDs, sorts recent first and keeps each source cursor', async () => {
  const a = await source('a');
  const b = await source('b');
  const feed = observeActivitySources([a.source, b.source], { activity: true, section: 'action' });
  stops.push(feed.subscribe(() => {}));
  await expect
    .poll(() => feed.getSnapshot().status === 'ready' && feed.getSnapshot())
    .toMatchObject({ sections: { action: [{ summary: 'b' }, { summary: 'a' }] } });
  const first = feed.getSnapshot();
  if (first.status !== 'ready') throw new Error('not ready');
  expect(new Set(first.sections.action.map(activityKey)).size).toBe(2);
  await feed.getInbox().loadMore?.('action');
  const next = feed.getSnapshot();
  if (next.status !== 'ready') throw new Error('not ready');
  expect(next.sections.action).toHaveLength(4);
  expect(next.cursors?.action).toBeUndefined();
});
it('a qualified Bot filter queries only its owning Host', async () => {
  const a = await source('a');
  const b = await source('b');
  const feed = observeActivitySources([a.source, b.source], {
    activity: true,
    botSlug: activitySelection('b', 'same-bot'),
  });
  stops.push(feed.subscribe(() => {}));
  await expect
    .poll(() => feed.getSnapshot())
    .toMatchObject({ status: 'ready', sections: { action: [{ summary: 'b' }] } });
});
it('one unsupported Host leaves healthy activity visible', async () => {
  const a = await source('a');
  const b = await source('b');
  a.fake.methods.set('humanAttention', () => ({ items: [] }));
  const feed = observeActivitySources([a.source, b.source], { activity: true, section: 'action' });
  stops.push(feed.subscribe(() => {}));
  await expect
    .poll(() => feed.getSnapshot())
    .toMatchObject({
      status: 'ready',
      sections: { action: [{ summary: 'b' }] },
      stale: expect.stringContaining('a'),
    });
});

it('counts colliding IDs independently through every page and preserves preferences', async () => {
  const a = await source('a');
  const b = await source('b');
  const preferences = createActivityCountPreferences({ read: async () => undefined, write() {} });
  const count = observeActivitySourceCount([a.source, b.source], preferences);
  stops.push(count.subscribe(() => {}));
  await expect.poll(() => count.getSnapshot()).toEqual({ count: 4, stale: false });
  preferences.setKinds([]);
  await expect.poll(() => count.getSnapshot()).toEqual({ count: 0, stale: false });
});
