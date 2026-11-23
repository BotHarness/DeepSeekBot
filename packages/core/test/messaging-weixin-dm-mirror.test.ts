import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createDshImProvider } from '../src/messaging/dsh-im.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { cores, fixture, setForwarding } from './support/messaging-weixin-dm-mirror.js';

afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('mirrors an accepted WeChat DM into the local DM once and mirrors accepted replies as Bot messages', async () => {
  const { core, transport, grant, dm, receive, runs, sources } = await fixture();
  await receive('one');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toHaveLength(1);
  const bridged = core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bridged');
  expect(bridged).toHaveLength(1);
  expect(bridged[0]).toMatchObject({
    author: { kind: 'bridged', source: 'Owner' },
    body: 'WeChat one',
    bridgeOrigin: { platform: 'weixin', senderName: 'Owner' },
  });
  const sourceEventId = bridged[0]!.bridgeOrigin!.sourceEventId;
  expect(bridged[0]!.id).toBe(sourceEventId);
  expect(
    attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
      db
        .prepare('SELECT channel_id FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId),
    ),
  ).toEqual({ channel_id: dm.id });
  const intent = await core.externalMessaging.reply(
    'ada',
    bridged[0]!.bridgeOrigin!.sourceEventId,
    'DM answer',
  );
  expect(intent.state).toBe('provider-accepted');
  await tick();
  expect(transport.replyChecked).toHaveBeenCalledTimes(1);
  const botMessages = core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bot');
  expect(botMessages).toHaveLength(1);
  expect(botMessages[0]).toMatchObject({
    author: { kind: 'bot', slug: 'ada' },
    body: 'DM answer',
  });
  await receive('one');
  await tick();
  await core.runtime.whenIdle();
  expect(runs).toHaveLength(1);
  expect(sources()).toHaveLength(1);
  expect(core.channels.readMessages(dm.id).filter((m) => m.author.kind === 'bridged')).toHaveLength(
    1,
  );
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: (await core.externalMessaging.snapshot('ada')).grants[0]!.revision,
    name: 'Local DM',
    enabled: true,
    collection: 'all',
  });
  await receive('two');
  expect(core.channels.readMessages(dm.id).filter((m) => m.body === 'WeChat two')).toHaveLength(1);
});

it('mirrors nothing when dmMirror is off, including accepted replies', async () => {
  const { core, transport, dm, receive, runs, sources } = await fixture();
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const snapshot = await core.externalMessaging.snapshot('ada');
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: snapshot.grants[0]!.revision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: false,
  });
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmMirror).toBe(false);
  await receive('quiet');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toHaveLength(1);
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
  const intent = await core.externalMessaging.reply(
    'ada',
    String(sources()[0]!.source_event_id),
    'Quiet answer',
  );
  expect(intent.state).toBe('provider-accepted');
  expect(transport.replyChecked).toHaveBeenCalledTimes(1);
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
});

it('preserves checked canonical media references without copying resource keys', async () => {
  const { core, dm, receive } = await fixture();
  await receive('pic', {
    text: 'Look at this',
    attachments: [
      {
        id: 'c'.repeat(64),
        messageId: 'pic',
        resourceKey: 'pic-resource',
        name: 'image',
        mediaType: 'image/unknown',
      },
    ],
  });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const mirror = core.channels
    .readMessages(dm.id)
    .find((message) => message.author.kind === 'bridged');
  expect(mirror?.body).toBe('Look at this\nimage');
  expect(mirror?.bridgeMedia).toBeUndefined();
  expect(JSON.stringify(mirror)).not.toContain('pic-resource');
});

it('rejects a stale dialog that would re-enable a switch another dialog turned off', async () => {
  const { core, dm } = await fixture();
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const stale = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  const update = (row: typeof stale, dmForward: boolean) =>
    core.externalMessaging.inbound.channelBridge(dm.id, {
      kind: 'update',
      routeId: row.routeId,
      delivery: row.delivery,
      grantId: row.grantId,
      expectedGrantRevision: row.grantRevision,
      expectedRevision: row.revision,
      name: row.name,
      enabled: row.enabled,
      collection: 'all',
      collectionInheritance: 'custom',
      dmMirror: row.dmMirror,
      dmForward,
    });
  await update(stale, false);
  await expect(update(stale, true)).rejects.toThrow();
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmForward).toBe(false);
});

it('keeps reply authority for accepted messages after a sync switch changes', async () => {
  const { core, dm, receive } = await fixture();
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  await receive('keep');
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const mirror = core.channels
    .readMessages(dm.id)
    .find((message) => message.author.kind === 'bridged' && message.body === 'WeChat keep')!;
  const grantRevision = (await core.externalMessaging.snapshot('ada')).grants[0]!.revision;
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    routeId: row.routeId,
    delivery: row.delivery,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: false,
    dmForward: false,
  });
  expect((await core.externalMessaging.snapshot('ada')).grants[0]!.revision).toBe(grantRevision);
  const intent = await core.externalMessaging.reply(
    'ada',
    mirror.bridgeOrigin!.sourceEventId,
    'Still answerable',
  );
  expect(intent.state).toBe('provider-accepted');
});

it('purging a canonical WeChat source also removes its DM mirror body', async () => {
  const { core, grant, dm, receive } = await fixture();
  const created = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelCreate({
    name: 'Review purge source',
    members: ['ada'],
  });
  if (!created.ok) throw new Error(created.error.message);
  const group = created.value.channel;
  const snapshot = await core.externalMessaging.snapshot('ada');
  await core.externalMessaging.inbound.channelBridge(group.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: snapshot.grants[0]!.revision,
    delivery: 'channel',
    name: 'Review paired-owner DM',
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
  });
  const secret = 'review-only-wechat-body-to-purge';
  await receive('purge-review', { text: secret });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  const original = core.channels.readMessages(group.id).find((message) => message.body === secret)!;
  expect(original).toBeDefined();
  expect(core.channels.readMessages(dm.id).some((message) => message.body === secret)).toBe(true);
  const sourceEventId = original.bridgeOrigin!.sourceEventId;
  await core.externalMessaging.reply('ada', sourceEventId, 'Reply quoting ' + secret);
  await tick();
  expect(
    core.channels.readMessages(dm.id).some((message) => message.body === 'Reply quoting ' + secret),
  ).toBe(true);
  core.channels.deleteGroup(group.id);
  const preview = core.contentPurge.preview(OWNER_HUMAN_CONTEXT, group.id, [sourceEventId]);
  expect(
    core.contentPurge.confirm(OWNER_HUMAN_CONTEXT, group.id, preview.sourceEventIds, preview.token),
  ).toEqual({
    accepted: 1,
  });
  expect(
    core.contentPurge
      .sources(OWNER_HUMAN_CONTEXT, group.id)
      .sources.find((source) => source.sourceEventId === sourceEventId)?.body,
  ).toBe('');
  expect(core.channels.readMessages(dm.id).some((message) => message.body.includes(secret))).toBe(
    false,
  );
});

it('defaults both directions off for a new grant and does not backfill when enabled', async () => {
  const { core, transport, dm, receive, sources } = await fixture(false, false);
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  expect(row).toMatchObject({ dmMirror: false, dmForward: false });
  const at = new Date(Date.now() + 10).toISOString();
  await receive('old', { at });
  await tick();
  await core.runtime.whenIdle();
  expect(sources()).toHaveLength(1);
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: { id: randomUUID(), at, body: 'local only', author: { kind: 'human' } },
  });
  expect(transport.sendChecked).not.toHaveBeenCalled();
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    grantId: row.grantId,
    routeId: row.routeId,
    delivery: row.delivery,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: true,
  });
  await receive('old', { at });
  expect(core.channels.readMessages(dm.id)).toHaveLength(0);
  await receive('new');
  expect(core.channels.readMessages(dm.id).map((m) => m.body)).toEqual(['WeChat new']);
  expect((await core.externalMessaging.channelBridges(dm.id)).bridges[0]!.dmForward).toBe(false);
});

it('allows disabling both directions while the provider is offline', async () => {
  const { core, transport, dm } = await fixture();
  const row = (await core.externalMessaging.channelBridges(dm.id)).bridges[0]!;
  transport.describeBot = vi.fn(async () => {
    throw new Error('offline');
  });
  await core.externalMessaging.inbound.channelBridge(dm.id, {
    kind: 'update',
    grantId: row.grantId,
    routeId: row.routeId,
    delivery: row.delivery,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: row.enabled,
    collection: 'all',
    collectionInheritance: 'custom',
    dmMirror: false,
    dmForward: false,
  });
  const stored = attachOperationalModule(core.operationalDatabase, 'test').read((db) =>
    db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(row.grantId),
  );
  expect(JSON.parse(String(stored!.body))).toMatchObject({ dmMirror: false, dmForward: false });
});

it('shares opt-in and opt-out with a later explicit receiver in the same Binding', async () => {
  const { core, transport, dm, authorize } = await fixture(true);
  const target = await authorize();
  expect(
    (await core.externalMessaging.snapshot('ada')).grants
      .filter((g) => g.bindingId === target.bindingId)
      .every((g) => g.dmMirror && g.dmForward),
  ).toBe(true);
  await setForwarding(core, dm.id, false);
  expect(
    (await core.externalMessaging.snapshot('ada')).grants
      .filter((g) => g.bindingId === target.bindingId)
      .every((g) => g.dmForward === false),
  ).toBe(true);
  await core.externalMessaging.forwardWebDm({
    channelId: dm.id,
    revision: 1,
    message: {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'no alias bypass',
    },
  });
  expect(transport.sendChecked).not.toHaveBeenCalled();
});

it('keeps original connector media and reduces only the additional mirror placement', async () => {
  const { core, grant, dm, receive } = await fixture();
  const created = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core }).channelCreate({
    name: 'Media group',
    members: ['ada'],
  });
  if (!created.ok) throw new Error(created.error.message);
  const group = created.value.channel;
  await core.externalMessaging.inbound.channelBridge(group.id, {
    kind: 'add',
    grantId: grant.id,
    expectedGrantRevision: (await core.externalMessaging.snapshot('ada')).grants[0]!.revision,
    name: 'Media source',
    enabled: true,
    collection: 'all',
    collectionInheritance: 'custom',
  });
  await receive('media-route', {
    attachments: [
      {
        id: 'c'.repeat(64),
        messageId: 'media-route',
        resourceKey: 'private-resource',
        name: 'photo',
        mediaType: 'image/png',
      },
    ],
  });
  expect(core.channels.readMessages(group.id)[0]!.bridgeMedia?.items).toHaveLength(1);
  expect(core.channels.readMessages(dm.id)[0]!.bridgeMedia).toBeUndefined();
  expect(core.channels.readMessages(dm.id)[0]!.body).toContain('photo');
});

it('recovers missing eligible projections on provider restart without resending or resurrecting purged content', async () => {
  const { core, transport, dm, receive, sources } = await fixture();
  await receive('recover');
  await tick();
  await core.runtime.whenIdle();
  const source = String(sources()[0]!.source_event_id);
  const reply = await core.externalMessaging.reply('ada', source, 'Recovered reply');
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  database.transaction((db) => {
    db.prepare('DELETE FROM channel_placements WHERE channel_id = ?').run(dm.id);
    db.prepare('DELETE FROM source_events WHERE source_event_id = ?').run('dm-mirror-' + reply.id);
  });
  core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  await vi.waitFor(() =>
    expect(
      core.channels
        .readMessages(dm.id)
        .map((m) => m.body)
        .sort(),
    ).toEqual(['Recovered reply', 'WeChat recover']),
  );
  expect(transport.replyChecked).toHaveBeenCalledTimes(1);
  expect(transport.sendChecked).not.toHaveBeenCalled();
  expect(sources()).toHaveLength(1);
});

it('recovers in ascending order beyond an ineligible batch without retrying sends', async () => {
  const { core, transport, dm, grant } = await fixture();
  const accepted = await core.externalMessaging.post('ada', grant.id, 'recovery-seed', 'Seed');
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  database.transaction((db) => {
    const row = db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(accepted.id)!;
    const seed = JSON.parse(String(row.body));
    for (let i = 0; i < 103; i++) {
      const id = randomUUID();
      const next = {
        ...seed,
        id,
        requestId: 'recovery-' + i,
        text: 'Recovered ' + i,
        dmMirror: { ...seed.dmMirror, ...(i < 101 ? { epoch: 'obsolete' } : {}) },
      };
      db.prepare(
        'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        id,
        'ada',
        grant.id,
        next.requestId,
        'provider-accepted',
        next.createdAt,
        JSON.stringify(next),
      );
    }
  });
  core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
  await vi.waitFor(() =>
    expect(core.channels.messagesAfter(dm.id, 0)!.map((c) => c.message.body)).toEqual([
      'Seed',
      'Recovered 101',
      'Recovered 102',
    ]),
  );
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
});

it('replays a projection-ready notification received during an active recovery pass', async () => {
  const { core, transport, dm, receive, sources, grant } = await fixture();
  await receive('overlap');
  await tick();
  await core.runtime.whenIdle();
  const source = String(sources()[0]!.source_event_id);
  const accepted = await core.externalMessaging.reply('ada', source, 'Overlapping recovery reply');
  const database = attachOperationalModule(core.operationalDatabase, 'test');
  database.transaction((db) => {
    db.prepare('DELETE FROM channel_placements WHERE channel_id = ?').run(dm.id);
    db.prepare('DELETE FROM source_events WHERE source_event_id = ?').run(
      'dm-mirror-' + accepted.id,
    );
    const seed = JSON.parse(
      String(db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(accepted.id)!.body),
    );
    for (let i = 0; i < 101; i++) {
      const next = {
        ...seed,
        id: randomUUID(),
        requestId: 'overlap-' + i,
        dmMirror: { ...seed.dmMirror, epoch: 'obsolete' },
      };
      db.prepare(
        'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        next.id,
        'ada',
        grant.id,
        next.requestId,
        'provider-accepted',
        next.createdAt,
        JSON.stringify(next),
      );
    }
  });
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const consume = transport.consumeInbound!;
  transport.consumeInbound = async (...args) => {
    await ready;
    return consume(...args);
  };
  const getDm = core.channels.getOrCreateDm.bind(core.channels);
  let released = false;
  const spy = vi.spyOn(core.channels, 'getOrCreateDm').mockImplementation((...args) => {
    if (!released) {
      released = true;
      queueMicrotask(release);
    }
    return getDm(...args);
  });
  try {
    core.externalMessaging.register(createDshImProvider(transport, 'weixin')!);
    await vi.waitFor(() =>
      expect(core.channels.messagesAfter(dm.id, 0)!.map((c) => c.message.body)).toEqual([
        'WeChat overlap',
        'Overlapping recovery reply',
      ]),
    );
    expect(transport.replyChecked).toHaveBeenCalledTimes(1);
    expect(transport.sendChecked).not.toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
