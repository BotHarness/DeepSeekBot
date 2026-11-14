import { expect, it, vi } from 'vitest';
import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import { FakeHost } from '../../../apps/mobile/test/fake-host.js';
import {
  createHostChannelFollow,
  hostChannelItems,
} from '../src/client/remote-native-conversation.js';
import type { ChannelFollow } from '../src/client/channel-live.js';

it('uses the native journal to retain raw Human identity and repair missing remote entries', async () => {
  const host = new FakeHost();
  const channel = host.channel('same-channel');
  channel.append({ id: 'first', author: { kind: 'human', humanId: 'member-b' }, body: 'Member B' });
  const client = createHostClient({
    routes: ['https://target.test.ts.net'],
    hostId: 'target',
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
  let journal: ReturnType<ChannelFollow> | undefined;
  try {
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    const changes: Parameters<Parameters<ChannelFollow>[1]['change']>[0][] = [];
    const interrupted = vi.fn();
    journal = createHostChannelFollow(client, async (method, args) => ({
      ok: true,
      value: await client.call(method, args),
    }))('same-channel', { change: (value) => changes.push(value), interrupted });
    await vi.waitFor(() => expect(changes[0]?.type).toBe('replace'));
    expect(changes[0]).toMatchObject({
      entries: [{ message: { author: { kind: 'human', humanId: 'member-b' }, body: 'Member B' } }],
    });
    channel.append({ id: 'missing', body: 'missing' }, false);
    channel.append({ id: 'next', body: 'next' });
    await vi.waitFor(() =>
      expect(changes.at(-1)).toMatchObject({
        type: 'replace',
        entries: [{ revision: 1 }, { revision: 2 }, { revision: 3 }],
      }),
    );
    expect(interrupted).not.toHaveBeenCalled();
    const count = changes.length;
    journal.stop();
    channel.append({ id: 'after-stop', body: 'invisible' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(changes).toHaveLength(count);
  } finally {
    journal?.stop();
    client.stop();
  }
});

it('wakes a pending remote follow on abort and releases its owned subscription', async () => {
  const host = new FakeHost();
  host.channel('empty');
  const client = createHostClient({
    routes: ['https://target.test.ts.net'],
    credential: host.credential,
    carrier: host.carrier,
  });
  client.start();
  const controller = new AbortController();
  try {
    await vi.waitFor(() => expect(client.getSnapshot().connection.status).toBe('connected'));
    const iterator = hostChannelItems(
      client,
      { channelId: 'empty', limit: 50, drafts: 'append' },
      controller.signal,
    );
    await iterator.next();
    await iterator.next();
    const pending = iterator.next();
    controller.abort(new Error('source left'));
    await expect(pending).rejects.toThrow('source left');
    expect((await iterator.next()).done).toBe(true);
  } finally {
    controller.abort();
    client.stop();
  }
});
