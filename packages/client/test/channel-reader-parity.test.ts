import { describe, expect, it } from 'vitest';

import { HostAnswerInvalid } from '@botharness/host-client/bot-settings';
import {
  loadChannelChangeCursor,
  loadPrivateInputStatus,
  loadPrivateView,
  loadUnreadCounts,
  markAllChannelsRead,
  reactToMessage,
  readChannelChanges,
  readChannelJournal,
  readChannelTimeline,
  searchMessages,
  sendToChannel,
  wireMessage,
  type ChannelHost,
} from '@botharness/host-client/channel-messages';
import { bridgeHost, parseStoredChannelMessage, type BridgeCall } from '../src/client/bridge.js';

const message = {
  id: 'm1',
  channelId: 'dm-tob',
  at: '2026-11-18T00:00:00.000Z',
  author: { kind: 'human' },
  body: 'hello',
};

const localHost = (value: unknown): ChannelHost => {
  const call: BridgeCall = async () => ({ ok: true, value });
  return bridgeHost(call);
};

const remoteHost = (value: unknown): ChannelHost => ({ call: async () => value });

async function same<T>(read: (host: ChannelHost) => Promise<T>, answer: unknown): Promise<T> {
  const local = await read(localHost(answer));
  expect(await read(remoteHost(answer))).toEqual(local);
  return local;
}

async function refused(read: (host: ChannelHost) => Promise<unknown>, answer: unknown) {
  await expect(read(localHost(answer))).rejects.toBeInstanceOf(HostAnswerInvalid);
  await expect(read(remoteHost(answer))).rejects.toBeInstanceOf(HostAnswerInvalid);
}

describe('channel message readers', () => {
  it('read the timeline and journal the same on desktop and on a phone or remote Host', async () => {
    const timeline = (host: ChannelHost) =>
      readChannelTimeline(host, 'dm-tob', {}, parseStoredChannelMessage);
    const page = await same(timeline, {
      revision: 3,
      page: {
        entries: [message],
        olderCursor: null,
        newerCursor: 'n',
        hasOlder: false,
        hasNewer: true,
      },
    });
    expect(page.revision).toBe(3);
    expect(page.page.entries.map((entry) => entry.id)).toEqual(['m1']);
    await refused(timeline, { page: { entries: [message] } });
    await refused(timeline, {
      revision: 3,
      page: {
        entries: [{ body: 'no id' }],
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
      },
    });

    const journal = (host: ChannelHost) =>
      readChannelJournal(host, 'dm-tob', { through: 3 }, wireMessage);
    const entries = await same(journal, {
      entries: [{ channelId: 'dm-tob', revision: 3, message }],
      olderCursor: null,
      hasOlder: false,
    });
    expect(entries.entries[0]?.revision).toBe(3);
    await refused(journal, {
      entries: [{ channelId: 'dm-tob', revision: 0, message }],
      olderCursor: null,
      hasOlder: false,
    });

    const changes = (host: ChannelHost) =>
      readChannelChanges(host, 'dm-tob', { epoch: 'e', seq: 1 }, wireMessage);
    expect(await same(changes, { reset: true, cursor: { epoch: 'e', seq: 2 } })).toEqual({
      reset: true,
      cursor: { epoch: 'e', seq: 2 },
    });
    await refused(changes, { upserts: [], cursor: { epoch: 'e', seq: 2 } });
  });

  it('read sends, reactions and searches the same on both', async () => {
    const send = (host: ChannelHost) =>
      sendToChannel(host, { channelId: 'dm-tob', body: 'hello' }, wireMessage);
    expect((await same(send, { message })).id).toBe('m1');
    await refused(send, { accepted: true });

    const react = (host: ChannelHost) =>
      reactToMessage(host, { channelId: 'dm-tob', messageId: 'm1', emoji: '👍', active: true });
    expect(
      await same(react, { reactions: [{ emoji: '👍', actors: [{ kind: 'human', id: 'h' }] }] }),
    ).toEqual([{ emoji: '👍', actors: [{ kind: 'human', id: 'h' }] }]);
    await refused(react, { reactions: [{ emoji: '👍', actors: [] }] });

    const search = (host: ChannelHost) =>
      searchMessages(host, { text: 'hello', limit: 8 }, wireMessage);
    const found = await same(search, {
      hits: [
        { channelId: 'dm-tob', message, snippet: 'hello' },
        { channelId: 'dm-tob', message: { body: 'no id' }, snippet: 'x' },
      ],
    });
    expect(found.hits).toHaveLength(1);
    await refused(search, { hits: 'none' });
  });

  it('read read-state, cursors, private input and private views the same on both', async () => {
    expect(
      await same(loadUnreadCounts, { channels: [{ channelId: 'a', unreadCount: 2 }] }),
    ).toEqual([{ channelId: 'a', unreadCount: 2 }]);
    await refused(loadUnreadCounts, { channels: [{ channelId: 'a', unreadCount: -1 }] });

    expect(await same((host) => markAllChannelsRead(host), { channels: 4 })).toEqual({
      channels: 4,
    });
    await refused((host) => markAllChannelsRead(host), { channels: 1.5 });

    expect(await same(loadChannelChangeCursor, { epoch: 'e', seq: 0 })).toEqual({
      epoch: 'e',
      seq: 0,
    });
    await refused(loadChannelChangeCursor, { epoch: 'e' });

    const status = (host: ChannelHost) => loadPrivateInputStatus(host, 'dm-tob', 'm1');
    expect(await same(status, { status: 'configured' })).toBe('configured');
    await refused(status, { status: 'done' });

    const view = (host: ChannelHost) => loadPrivateView(host, 'dm-tob', 'm1', (state) => state);
    expect(await same(view, { version: 2, state: { open: true } })).toEqual({
      version: 2,
      state: { open: true },
    });
    await refused(view, { version: -1, state: {} });
  });
});
