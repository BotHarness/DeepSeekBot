import { expect, it } from 'vitest';
import { isBotNetworkMembership } from '../src/channels/channel.js';
import { join } from 'node:path';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

it('retains authenticated network membership with the remote Channel across owner restart', () => {
  const root = createTempRoot('network-membership-');
  let owner = registryDatabase(root);
  let registry = createTestRegistry({ rootDir: join(root, 'bots'), database: owner });
  registry.create({ slug: 'local', displayName: 'Local' });
  const open = () =>
    createSqliteChannelStore({
      rootDir: join(root, 'channels'),
      database: attachOperationalModule(owner, 'channels'),
      isBotActive: (slug) => registry.get(slug) !== undefined,
    });
  const membership = {
    kind: 'tailnet' as const,
    localNodeId: 'local-node',
    remoteNodeId: 'peer-node',
  };
  const channel = open().getOrCreateRemoteBotDm('local', {
    hostId: 'peer',
    botSlug: 'remote',
    displayName: 'Remote',
    hostKey: 'a'.repeat(64),
    membership,
  });
  owner.close();
  owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  registry = createTestRegistry({ rootDir: join(root, 'bots'), database: owner });
  expect(open().get(channel.id)?.remoteBot?.membership).toEqual(membership);
});

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

it('keeps one remote conversation and both verified network bindings across route changes and restart', () => {
  const root = createTempRoot('network-scopes-');
  let owner = registryDatabase(root);
  const registry = createTestRegistry({ rootDir: join(root, 'bots'), database: owner });
  registry.create({ slug: 'local', displayName: 'Local' });
  const open = () =>
    createSqliteChannelStore({
      rootDir: join(root, 'channels'),
      database: attachOperationalModule(owner, 'channels'),
      isBotActive: () => true,
    });
  const remote = {
    hostId: 'mac-host',
    botSlug: 'ios',
    displayName: 'iOS',
    hostKey: 'a'.repeat(64),
  };
  const tailnet = { kind: 'tailnet' as const, localNodeId: 'local-node', remoteNodeId: 'mac-node' };
  const connect = {
    kind: 'connect' as const,
    accountId: 'user_qa',
    localHostId: 'hlocal',
    remoteHostId: 'hmac',
  };
  const store = open();
  const first = store.getOrCreateRemoteBotDm('local', { ...remote, membership: tailnet });
  const second = store.getOrCreateRemoteBotDm('local', { ...remote, membership: connect });
  expect(second.id).toBe(first.id);
  expect(second.remoteBot?.membership).toEqual({ kind: 'scopes', scopes: [tailnet, connect] });
  const changedTailnet = { ...tailnet, remoteNodeId: 'new-mac-node' };
  store.trustRemoteHostKey!('mac-host', remote.hostKey, changedTailnet);
  owner.close();
  owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  expect(open().list()).toHaveLength(1);
  expect(open().get(first.id)?.remoteBot).toMatchObject({
    hostId: 'mac-host',
    hostKey: remote.hostKey,
    membership: { kind: 'scopes', scopes: [changedTailnet, connect] },
  });
});

it('rejects incomplete, duplicate or nested collaboration scope provenance', () => {
  const tailnet = { kind: 'tailnet', localNodeId: 'local', remoteNodeId: 'peer' };
  const connect = {
    kind: 'connect',
    accountId: 'user_qa',
    localHostId: 'local',
    remoteHostId: 'peer',
  };
  expect(isBotNetworkMembership(tailnet)).toBe(true);
  expect(isBotNetworkMembership(connect)).toBe(true);
  for (const invalid of [
    { ...connect, accountId: '' },
    { ...connect, remoteHostId: undefined },
    { kind: 'scopes', scopes: [tailnet, tailnet] },
    { kind: 'scopes', scopes: [tailnet, { kind: 'scopes', scopes: [tailnet, connect] }] },
  ])
    expect(isBotNetworkMembership(invalid)).toBe(false);
});
