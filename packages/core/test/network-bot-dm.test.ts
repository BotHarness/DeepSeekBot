import { expect, it } from 'vitest';
import { join } from 'node:path';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot } from './helpers.js';

it('commits a remote Bot DM to the existing Channel and recipient Inbox exactly once', async () => {
  const root = createTempRoot('network-bot-dm-');
  const owner = registryDatabase(root);
  const registry = createTestRegistry({ rootDir: join(root, 'bots'), database: owner });
  registry.create({ slug: 'ios', displayName: 'Local iOS' });
  const channels = createSqliteChannelStore({
    rootDir: join(root, 'channels'),
    database: attachOperationalModule(owner, 'channels'),
    isBotActive: (slug) => registry.get(slug) !== undefined && registry.get(slug)?.paused !== true,
  });
  const dm = channels.getOrCreateRemoteBotDm('ios', {
    hostId: 'remote-host',
    botSlug: 'ios',
    displayName: 'Remote iOS',
  });
  expect(dm.members).toEqual(['ios']);
  const key = 'a'.repeat(64);
  channels.trustRemoteHostKey!('remote-host', key);
  expect(channels.remoteHostKey!('remote-host')).toBe(key);
  registry.create({ slug: 'other', displayName: 'Other' });
  expect(() =>
    channels.getOrCreateRemoteBotDm('other', {
      hostId: 'remote-host',
      botSlug: 'another',
      displayName: 'Another',
      hostKey: 'b'.repeat(64),
    }),
  ).toThrow();
  expect(() => channels.trustRemoteHostKey!('remote-host', 'b'.repeat(64))).toThrow();
  expect(channels.remoteHostKey!('remote-host')).toBe(key);
  expect(channels.list()).toHaveLength(1);
  expect(
    channels.getOrCreateRemoteBotDm('other', {
      hostId: 'remote-host',
      botSlug: 'another',
      displayName: 'Another',
      hostKey: key,
    }).remoteBot?.hostKey,
  ).toBe(key);

  expect(dm.remoteBot).toEqual({
    hostId: 'remote-host',
    botSlug: 'ios',
    displayName: 'Remote iOS',
  });
  const message = {
    id: 'origin-message',
    at: '2026-11-01T00:00:00.000Z',
    author: { kind: 'remote-bot' as const, hostId: 'remote-host', slug: 'ios' },
    body: 'Check this iOS bug',
    botCausation: {
      rootSourceEventId: 'remote-root',
      parentSourceEventId: 'remote-parent',
      hop: 1,
    },
  };
  expect((await channels.appendMessageOnce(dm.id, message)).status).toBe('appended');
  expect((await channels.appendMessageOnce(dm.id, message)).status).toBe('existing');
  expect((await channels.appendMessageOnce(dm.id, { ...message, body: 'Changed' })).status).toBe(
    'conflict',
  );
  const history = channels.readMessages(dm.id);
  expect(history).toHaveLength(1);
  expect(history[0]?.author).toEqual(message.author);
  expect(history[0]?.deliveries).toEqual([{ botSlug: 'ios', state: 'pending' }]);
  expect(
    registry
      .list()
      .map((bot) => bot.slug)
      .sort(),
  ).toEqual(['ios', 'other']);
  expect(channels.get('dm-ios')).toBeUndefined();
  await expect(
    channels.appendMessageOnce(dm.id, {
      ...message,
      id: 'spoofed-host',
      author: { ...message.author, hostId: 'other-host' },
    }),
  ).rejects.toThrow('does not own');
  await expect(
    channels.appendMessageOnce(dm.id, {
      ...message,
      id: 'spoofed-bot',
      author: { ...message.author, slug: 'other-bot' },
    }),
  ).rejects.toThrow('does not own');
  expect(channels.readMessages(dm.id)).toHaveLength(1);
  await channels.appendMessageOnce(dm.id, {
    ...message,
    id: 'hop-limit',
    botCausation: { ...message.botCausation, hop: 33 },
  });
  expect(channels.message(dm.id, 'hop-limit')?.deliveries).toBeUndefined();
  expect(channels.message(dm.id, 'hop-limit')?.body).toBe(message.body);
});
