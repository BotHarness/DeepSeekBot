import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it, vi } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  event,
  fixture,
  managedEvent,
  addManagedBridge,
  bridgeRow,
  addRoute,
  createRouteGroup,
  cleanup,
} from './messaging-inbound-fixtures.js';

afterEach(cleanup);

it('Channel Bridge pause survives reconnect, retains accepted reply authority and resumes without replay or duplicate consumers', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  const first = managedEvent(fx);
  await fx.receive(first);
  await fx.idle();
  const sourceId = fx.core.channels.readMessages(channelId)[0]!.id;
  let row = await bridgeRow(fx, channelId);
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'update',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: 'Paused intake',
    enabled: false,
    collection: 'mentions',
  });
  expect(fx.subscriptions).toBe(1);
  expect((await bridgeRow(fx, channelId)).reception).toBe('off');
  await fx.receive(
    managedEvent(fx, {
      eventId: 'off',
      messageId: 'off',
      reply: { ...event().reply, messageId: 'off' },
    }),
  );
  await fx.core.externalMessaging.reply('ada', sourceId, 'Accepted before pause');
  expect(fx.replies).toHaveLength(1);
  await fx.restart();
  expect(fx.subscriptions).toBe(1);
  await fx.receive(
    managedEvent(fx, {
      eventId: 'off-restart',
      messageId: 'off-restart',
      reply: { ...event().reply, messageId: 'off-restart' },
    }),
  );
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'")).toHaveLength(
    1,
  );
  row = await bridgeRow(fx, channelId);
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'update',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'mentions',
  });
  await fx.receive(first);
  await fx.receive(
    managedEvent(fx, {
      eventId: 'new',
      messageId: 'new',
      reply: { ...event().reply, messageId: 'new' },
    }),
  );
  await fx.idle();
  expect(fx.subscriptions).toBe(1);
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(2);
  expect(fx.runs).toHaveLength(2);
});

it('deleting a Channel Bridge retains history and Bot identity, removes Channel intake, leaves later mentions to the bound app default traffic and fences old source replies', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  await fx.receive(managedEvent(fx));
  await fx.idle();
  const sourceId = fx.core.channels.readMessages(channelId)[0]!.id;
  const row = await bridgeRow(fx, channelId);
  const oldCallback = fx.callback!;
  await fx.core.externalMessaging.inbound.channelBridge(channelId, {
    kind: 'delete',
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
  });
  expect(fx.subscriptions).toBe(0);
  expect(fx.core.externalMessaging.inbound.read('ada', sourceId).body).toBe(event().text);
  await expect(fx.core.externalMessaging.reply('ada', sourceId, 'Removed route')).rejects.toThrow(
    'source-unavailable',
  );
  await expect(oldCallback(event(), { signal: new AbortController().signal })).rejects.toThrow();
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.identities?.[0]).toMatchObject({ enabled: true, grantCount: 1 });
  expect(snapshot.grants[0]).not.toHaveProperty('receiveScope');
  expect(snapshot.grants[0]).not.toHaveProperty('channelBridge');
  expect(snapshot.grants[0]).not.toHaveProperty('receiveTargetChannelId');
  expect((await fx.core.externalMessaging.channelBridges(channelId)).sources).toHaveLength(1);
  await fx.restart();
  expect(fx.subscriptions).toBe(1);
  await expect(
    fx.receive(
      event({
        messageId: 'after-route-removal',
        reply: { ...event().reply, messageId: 'after-route-removal' },
      }),
    ),
  ).resolves.toEqual({ accepted: true });
  expect(
    attachOperationalModule(fx.core.operationalDatabase, 'messaging').read((db) =>
      db
        .prepare("SELECT count(*) AS n FROM source_events WHERE source_kind = 'bridge-message'")
        .get(),
    ),
  ).toMatchObject({ n: 2 });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  expect(
    fx.query(
      "SELECT a.reason FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE json_extract(e.payload_json, '$.external.event.messageId') = 'after-route-removal'",
    ),
  ).toEqual([{ reason: 'group-mention' }]);
});

it.each(['pause', 'delete'] as const)(
  'refuses delayed messages sent during %s after reactivation and restart, while accepting fresh messages',
  async (mode) => {
    const fx = await fixture();
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date('2026-10-03T10:00:00.000Z'));
      const channelId = await addManagedBridge(fx);
      await fx.receive(managedEvent(fx));
      await fx.idle();
      let row = await bridgeRow(fx, channelId);
      vi.setSystemTime(new Date('2026-10-03T10:00:05.000Z'));
      const version = {
        grantId: row.grantId,
        expectedGrantRevision: row.grantRevision,
        expectedRevision: row.revision,
      };
      await fx.core.externalMessaging.inbound.channelBridge(
        channelId,
        mode === 'delete'
          ? { ...version, kind: 'delete' }
          : { ...version, kind: 'update', name: row.name, enabled: false, collection: 'mentions' },
      );
      const delayed = event({
        eventId: 'delayed',
        messageId: 'delayed',
        at: '2026-10-03T10:00:10.000Z',
        reply: { ...event().reply, messageId: 'delayed' },
      });
      vi.setSystemTime(new Date('2026-10-03T10:00:20.000Z'));
      if (mode === 'delete') {
        const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
        await fx.core.externalMessaging.inbound.channelBridge(channelId, {
          kind: 'add',
          grantId: grant.id,
          expectedGrantRevision: grant.revision,
          name: row.name,
          enabled: true,
          collection: 'mentions',
        });
      } else {
        row = await bridgeRow(fx, channelId);
        await fx.core.externalMessaging.inbound.channelBridge(channelId, {
          kind: 'update',
          grantId: row.grantId,
          expectedGrantRevision: row.grantRevision,
          expectedRevision: row.revision,
          name: row.name,
          enabled: true,
          collection: 'mentions',
        });
      }
      await fx.restart();
      await fx.receive(delayed);
      await fx.idle();
      expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
      expect(
        fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'"),
      ).toHaveLength(1);
      expect(fx.subscriptions).toBe(1);
      await fx.receive(
        managedEvent(fx, {
          eventId: 'fresh',
          messageId: 'fresh',
          reply: { ...event().reply, messageId: 'fresh' },
        }),
      );
      await fx.idle();
      expect(fx.core.channels.readMessages(channelId)).toHaveLength(2);
      expect(
        fx.query("SELECT * FROM source_events WHERE source_kind='bridge-message'"),
      ).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  },
);

it('Bridge writes reject stale configuration and departed Humans, and expose explicit DM targets', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx, false);
  const row = await bridgeRow(fx, channelId);
  const update = {
    kind: 'update' as const,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: false,
    collection: 'mentions' as const,
  };
  await fx.core.externalMessaging.inbound.channelBridge(channelId, update);
  await expect(fx.core.externalMessaging.inbound.channelBridge(channelId, update)).rejects.toThrow(
    'bridge-stale',
  );
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  expect((await fx.core.externalMessaging.channelBridges(dm.id)).canTargetInbox).toBe(true);
  attachOperationalModule(fx.core.operationalDatabase, 'test').transaction((db) => {
    db.prepare(
      "UPDATE channel_human_members SET left_at = '2026-10-03T00:00:00Z' WHERE channel_id = ?",
    ).run(channelId);
  });
  await expect(fx.core.externalMessaging.channelBridges(channelId)).rejects.toThrow(
    'channel-unavailable',
  );
  await expect(
    fx.core.externalMessaging.inbound.channelBridge(channelId, {
      ...update,
      expectedRevision: row.revision + 1,
    }),
  ).rejects.toThrow('channel-unavailable');
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.bridgeRoutes?.[0]?.enabled,
  ).toBe(false);
});

it('all-message Bridge intake requires observed ordinary delivery and preserves per-Bot wake policy', async () => {
  const fx = await fixture();
  const channelId = await addManagedBridge(fx);
  let row = await bridgeRow(fx, channelId);
  const update = () => ({
    kind: 'update' as const,
    grantId: row.grantId,
    expectedGrantRevision: row.grantRevision,
    expectedRevision: row.revision,
    name: row.name,
    enabled: true,
    collection: 'all' as const,
  });
  await expect(
    fx.core.externalMessaging.inbound.channelBridge(channelId, update()),
  ).rejects.toThrow('ordinary-delivery-unverified');
  const ordinary = managedEvent(fx, {
    mentionedAccount: false,
    mentions: [],
    reply: { messageId: 'om-1', conversationId: 'oc-team', actorId: 'ou-human' },
  });
  await fx.receive(ordinary);
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(0);
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    fx.grant.id,
    { collection: 'mentions', wake: 'digest', count: 2, intervalSeconds: 300 },
    { kind: 'human' },
  );
  await fx.core.externalMessaging.inbound.channelBridge(channelId, update());
  row = await bridgeRow(fx, channelId);
  expect(row.collection).toBe('all');
  expect(fx.core.externalMessaging.inbound.policy('ada', fx.grant.id)).toMatchObject({
    collection: 'mentions',
    wake: 'digest',
    count: 2,
    intervalSeconds: 300,
  });
  await fx.receive({
    ...ordinary,
    eventId: 'ordinary-new',
    messageId: 'ordinary-new',
    reply: { ...ordinary.reply, messageId: 'ordinary-new' },
  });
  expect(fx.core.channels.readMessages(channelId)).toHaveLength(1);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
});

it('ends only one local Channel route and purges its shared external source without provider replay refill', async () => {
  const fx = await fixture();
  const first = createRouteGroup(fx, 'Ended route');
  const second = createRouteGroup(fx, 'Retained route');
  await addRoute(fx, first);
  await addRoute(fx, second);
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  await addRoute(fx, dm.id, 'inbox');
  const message = event({ at: new Date(Date.now() + 100).toISOString() });
  await fx.receive(message);
  await fx.idle();
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  expect(methods.channelGroupDelete({ channelId: first }).ok).toBe(true);
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.bridgeRoutes?.map(
      (route) => route.channelId,
    ),
  ).toEqual([second, null]);
  expect(fx.core.channels.readMessages(second)[0]?.body).toBe(message.text);
  const source = fx.core.contentPurge.sources(OWNER_HUMAN_CONTEXT, first).sources[0]!;
  expect(source.refusal).toBeUndefined();
  const preview = fx.core.contentPurge.preview(OWNER_HUMAN_CONTEXT, first, [source.sourceEventId]);
  expect(preview.placements).toHaveLength(2);
  expect(preview.admissions).toHaveLength(1);
  fx.core.contentPurge.confirm(OWNER_HUMAN_CONTEXT, first, preview.sourceEventIds, preview.token);
  expect(fx.core.channels.readMessages(second)[0]?.body).toBe('');
  expect(() => fx.core.externalMessaging.inbound.read('ada', source.sourceEventId)).toThrow(
    'content-purged',
  );
  const count = fx.runs.length;
  await fx.receive(message).catch(() => undefined);
  await fx.idle();
  expect(fx.runs).toHaveLength(count);
  expect(fx.query('SELECT body FROM source_events')).toEqual([{ body: '' }]);
  await fx.restart();
  expect(fx.core.contentPurge.sources(OWNER_HUMAN_CONTEXT, first).sources[0]?.body).toBe('');
});

it('keeps an already issued reply in flight and settles the actual receipt after purge without restoring text', async () => {
  const fx = await fixture();
  const channel = createRouteGroup(fx, 'Issued reply purge');
  await addRoute(fx, channel);
  await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
  await fx.idle();
  const sourceId = String(
    fx.query('SELECT source_event_id FROM source_events')[0]!.source_event_id,
  );
  let finish!: () => void;
  fx.setReply(
    () =>
      new Promise((resolve) => {
        finish = () => resolve({ sent: true });
      }),
  );
  const sending = fx.core.externalMessaging.reply('ada', sourceId, 'synthetic outgoing body');
  await expect.poll(() => fx.replies.length).toBe(1);
  expect(
    createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).channelGroupDelete({
      channelId: channel,
    }).ok,
  ).toBe(true);
  const preview = fx.core.contentPurge.preview(OWNER_HUMAN_CONTEXT, channel, [sourceId]);
  expect(preview.effects).toMatchObject([{ kind: 'outbox', state: 'in-flight' }]);
  fx.core.contentPurge.confirm(OWNER_HUMAN_CONTEXT, channel, preview.sourceEventIds, preview.token);
  expect(fx.core.externalMessaging.history('ada')[0]).toMatchObject({
    state: 'in-flight',
    text: '',
  });
  finish();
  expect(await sending).toMatchObject({ state: 'provider-accepted', text: '' });
  await expect(
    fx.core.externalMessaging.reply('ada', sourceId, 'stale new effect'),
  ).rejects.toThrow();
  expect(fx.replies).toHaveLength(1);
});

it('fences running Bot admissions and retained tool callbacks after accepted source purge', async () => {
  let resume!: () => void;
  let active: OrchestratorAgentRun | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const fx = await fixture({
    onRun: async (run) => {
      active = run;
      await paused;
    },
  });
  const channel = createRouteGroup(fx, 'Running admission purge');
  const other = createRouteGroup(fx, 'Still joined');
  await addRoute(fx, channel);
  await addRoute(fx, other);
  try {
    await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
    await expect.poll(() => active !== undefined).toBe(true);
    expect(
      createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).channelGroupDelete({
        channelId: channel,
      }).ok,
    ).toBe(true);
    const source = fx.core.contentPurge.sources(OWNER_HUMAN_CONTEXT, channel).sources[0]!;
    const preview = fx.core.contentPurge.preview(OWNER_HUMAN_CONTEXT, channel, [
      source.sourceEventId,
    ]);
    expect(preview.admissions).toMatchObject([{ state: 'running' }]);
    fx.core.contentPurge.confirm(
      OWNER_HUMAN_CONTEXT,
      channel,
      preview.sourceEventIds,
      preview.token,
    );
    expect(() => active!.requireContent!()).toThrow();
    await expect(
      active!.channels.send({ channelId: other, body: 'stale outgoing body' }),
    ).rejects.toThrow();
    expect(
      fx.core.channels
        .readMessages(other)
        .every((message) => message.body !== 'stale outgoing body'),
    ).toBe(true);
  } finally {
    resume();
    await fx.idle();
  }
});

it('ends running Channel effects only after its last reception path ends while retaining history', async () => {
  let resume!: () => void;
  let active: OrchestratorAgentRun | undefined;
  const paused = new Promise<void>((resolve) => {
    resume = resolve;
  });
  const fx = await fixture({
    onRun: async (run) => {
      active = run;
      await paused;
    },
  });
  const first = createRouteGroup(fx, 'First running route');
  const second = createRouteGroup(fx, 'Last running route');
  await addRoute(fx, first);
  await addRoute(fx, second);
  try {
    await fx.receive(event({ at: new Date(Date.now() + 100).toISOString() }));
    await expect.poll(() => active !== undefined).toBe(true);
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
    expect(methods.channelGroupDelete({ channelId: first }).ok).toBe(true);
    expect(() => active!.requireContent!()).not.toThrow();
    expect(methods.channelGroupDelete({ channelId: second }).ok).toBe(true);
    expect(() => active!.requireContent!()).toThrow('Channel has ended');
    expect(fx.core.contentPurge.sources(OWNER_HUMAN_CONTEXT, first).sources[0]?.body).toBe(
      event().text,
    );
    expect(fx.query('SELECT attempt_state FROM inbox_admissions')[0]?.attempt_state).toBe(
      'needs-repair',
    );
  } finally {
    resume();
    await fx.idle();
  }
});
