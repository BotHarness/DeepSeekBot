import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import {
  fingerprint,
  dm,
  mention,
  fixture,
  ordinaryRole,
  fresh,
  asActor,
  grantFor,
  cleanup,
} from './messaging-default-traffic-fixtures.js';

afterEach(cleanup);

it('explicit open groups admit visitors without powers, close to reviewed pairing, and preserve scope across restart', async () => {
  const fx = await fixture();
  await fx.receive(fresh(mention('open-bootstrap')));
  await ordinaryRole(fx);
  const grant = await grantFor(fx, 'oc_team');
  const open = { kind: 'open-group' as const, grantId: grant.id, expectedRevision: 0, open: true };
  await fx.core.externalMessaging.conversation('ada', open);
  await expect(fx.core.externalMessaging.conversation('ada', open)).rejects.toThrow(
    'conversation-stale',
  );
  await expect(fx.core.externalMessaging.conversation('other-bot', open)).rejects.toThrow();
  await fx.receive(fresh(asActor(mention('visitor-open'), 'ou_visitor')));
  const source = fx.sourceId('om-visitor-open');
  expect(fx.core.externalMessaging.senderPermissions('ada', source)).toMatchObject({
    status: 'visitor',
  });
  expect(fx.core.externalMessaging.senderPermissions('ada', source).role).toBeUndefined();
  expect(fx.core.externalMessaging.pairing.list('ada')).toHaveLength(0);
  expect(() =>
    fx.core.externalMessaging.pairing.assert('ada', fx.identity.id, 'ou_visitor', 'approve'),
  ).toThrow();
  await fx.core.externalMessaging.reply('ada', source, 'Visitor answer');
  await fx.settle();
  expect(fx.replies.at(-1)?.route.conversationId).toBe('oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    ...open,
    expectedRevision: 1,
    open: false,
  });
  const runs = fx.runs.length;
  await fx.receive(fresh(asActor(mention('visitor-closed'), 'ou_visitor')));
  expect(fx.runs).toHaveLength(runs);
  expect(fx.core.externalMessaging.pairing.list('ada')[0]?.status).toBe('pending');
  await fx.core.externalMessaging.conversation('ada', { ...open, expectedRevision: 2 });
  await fx.restart();
  await fx.receive(fresh(asActor(mention('visitor-reopened'), 'ou_visitor')));
  expect(fx.runs.length).toBe(runs + 1);
  await fx.receive(fresh(asActor(dm('visitor-dm'), 'ou_visitor')));
  expect(fx.runs.length).toBe(runs + 1);
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await expect(
    fx.core.externalMessaging.conversation('ada', { ...open, expectedRevision: 3 }),
  ).rejects.toThrow();
  await fx.receive(fresh(asActor(mention('visitor-blocked'), 'ou_visitor')));
  expect(fx.runs.length).toBe(runs + 1);
});

it('unpaired collected authors remain context-only and cannot fill a paired digest threshold', async () => {
  const fx = await fixture();
  await fx.receive(fresh(mention('passive-bootstrap')));
  const role = await ordinaryRole(fx);
  await fx.receive(fresh(dm('paired-person')));
  const pairing = fx.core.externalMessaging.pairing.list('ada')[0]!;
  fx.core.externalMessaging.pairing.review('ada', {
    kind: 'approve',
    id: pairing.id,
    expectedRevision: pairing.revision,
    roleId: role.id,
    expectedRoleRevision: role.revision,
  });
  const grant = await grantFor(fx, 'oc_team');
  await fx.receive(fresh(mention('verify-ordinary-delivery', false)));
  await fx.core.externalMessaging.inbound.setPolicy(
    'ada',
    grant.id,
    {
      inheritance: 'custom',
      expectedRevision: 0,
      expectedDefaultRevision: 0,
      collection: 'all',
      wake: 'digest',
      count: 2,
      intervalSeconds: 86400,
    },
    { kind: 'human' },
  );
  const runs = fx.runs.length;
  for (let n = 0; n < 6; n++)
    await fx.receive(fresh(asActor(mention(`passive-${n}`, false), 'ou_visitor')));
  expect(fx.runs).toHaveLength(runs);
  expect(fx.core.externalMessaging.pairing.list('ada')).toHaveLength(1);
  expect(
    fx.query(
      "SELECT wake_mode, wake_count, wake_interval_ms FROM inbox_admissions WHERE source_policy_wake_mode = 'context'",
    ),
  ).toHaveLength(6);
  for (const row of fx.query(
    "SELECT wake_count, wake_interval_ms FROM inbox_admissions WHERE source_policy_wake_mode = 'context'",
  ))
    expect(row).toMatchObject({ wake_count: null, wake_interval_ms: null });
  await fx.receive(fresh(mention('one-eligible', false)));
  expect(fx.runs).toHaveLength(runs);
  await fx.restart();
  expect(fx.runs).toHaveLength(runs);
  await fx.receive(fresh(mention('eligible-question')));
  expect(fx.runs.length).toBe(runs + 1);
  expect(fx.runs.at(-1)?.inbox).toContain('chatter passive-0');
  expect(fx.runs.at(-1)?.inbox).toContain('ou_visitor');
  expect(fx.runs.at(-1)?.inbox).not.toContain(role.behavior);
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-passive-0')),
  ).toMatchObject({ status: 'unpaired' });
  expect(
    fx.core.externalMessaging.senderPermissions('ada', fx.sourceId('om-eligible-question')),
  ).toMatchObject({ status: 'paired', role: { id: role.id } });
});

it('blocking an entry stops admission and survives restart and rebind; allowing again admits only new messages', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  const grant = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await fx.receive(mention('after-block'));
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-ask' }]);
  await fx.restart();
  await fx.receive(mention('after-restart'));
  expect(fx.admissions()).toHaveLength(1);
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.blockedConversations).toEqual([
    expect.objectContaining({
      conversation: { kind: 'group', id: 'oc_team' },
      bindingId: snapshot.identities![0]!.id,
      revision: 1,
    }),
  ]);
  const identity = snapshot.identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  await fx.settle();
  const rebound = await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive(mention('after-rebind'));
  expect(fx.admissions()).toHaveLength(1);
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: rebound.id,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  await fx.settle();
  expect((await fx.core.externalMessaging.snapshot('ada')).blockedConversations).toEqual([]);
  await fx.receive({ ...mention('allowed'), at: new Date(Date.now() + 1000).toISOString() });
  expect(
    fx
      .admissions()
      .map((row) => (row as { messageId: string }).messageId)
      .sort(),
  ).toEqual(['om-allowed', 'om-ask']);
});

it('a stale revision is refused and blocking revokes the old reply route', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  const grant = await grantFor(fx, 'oc_owner');
  await expect(
    fx.core.externalMessaging.conversation('ada', {
      kind: 'block',
      grantId: grant.id,
      expectedRevision: grant.revision + 5,
    }),
  ).rejects.toMatchObject({ code: 'conversation-stale' });
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'too late'),
  ).rejects.toThrow();
  expect(fx.replies).toEqual([]);
});

it('a muted entry is admitted silently without a run and can still be answered', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  expect(fx.runs).toHaveLength(1);
  const grant = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  await fx.settle();
  expect(await grantFor(fx, 'oc_team')).toMatchObject({ muted: true, revision: grant.revision });
  await fx.receive(mention('muted'));
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT a.wake_mode FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE json_extract(e.payload_json, '$.external.event.messageId') = 'om-muted'",
    ),
  ).toEqual([{ wake_mode: 'silent' }]);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-muted'), 'Seen');
  await fx.settle();
  expect(fx.replies.map((item) => item.text)).toEqual(['Seen']);
  const muted = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: muted.id,
    expectedRevision: muted.preferenceRevision ?? 0,
    muted: false,
  });
  await fx.settle();
  await fx.receive(mention('loud'));
  expect(fx.runs).toHaveLength(2);
});

it('ask mode holds a new conversation without a Source Event until it is allowed', async () => {
  const fx = await fixture();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(mention('first'));
  await fx.receive(mention('second'));
  expect(fx.query('SELECT count(*) AS n FROM source_events')).toEqual([{ n: 0 }]);
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.heldConversations).toEqual([
    expect.objectContaining({
      conversation: { kind: 'group', id: 'oc_team' },
      reason: 'ask',
      count: 2,
    }),
  ]);
  const held = snapshot.heldConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: held.bindingId,
    conversation: held.conversation,
    from: 'held',
    expectedRevision: held.revision,
  });
  await fx.settle();
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive({ ...mention('third'), at: new Date(Date.now() + 1000).toISOString() });
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-third' }]);
});

it('a held conversation permits an explicit reachable post without replaying held traffic', async () => {
  const fx = await fixture();
  const describeBot = fx.service.describeBot;
  fx.service.reachableConversationVersion = 1;
  fx.service.describeBot = async (botId) => {
    const description = await describeBot!(botId);
    return {
      ...description,
      capabilities: [...description.capabilities, 'reachable-conversations-checked'],
    };
  };
  fx.service.listReachableConversations = async () => ({
    version: 1,
    conversations: [{ id: 'oc_team', kind: 'group', name: 'Team' }],
    hasMore: false,
  });
  const posts: string[] = [];
  fx.service.postConversationChecked = async (_account, conversationId, text, options) => {
    expect(options.beforeSend()).toBe(true);
    posts.push(text);
    return { sent: true, receipt: { version: 1, messageId: 'om_explicit', conversationId } };
  };
  fx.replaceProvider();
  await fx.settle();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(mention('held'));
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toHaveLength(1);
  expect(
    await fx.core.externalMessaging.postConversation(
      'ada',
      fx.identity.id,
      'oc_team',
      'explicit-held-post',
      'Explicit report',
    ),
  ).toMatchObject({ state: 'provider-accepted' });
  expect(posts).toEqual(['Explicit report']);
  expect(fx.query('SELECT count(*) AS n FROM source_events')).toEqual([{ n: 0 }]);
  expect(fx.admissions()).toEqual([]);
  expect(fx.runs).toEqual([]);
});

it('blocking a held conversation keeps it out of the Inbox', async () => {
  const fx = await fixture();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(dm('1'));
  const held = (await fx.core.externalMessaging.snapshot('ada')).heldConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block-held',
    bindingId: held.bindingId,
    conversation: held.conversation,
    expectedRevision: held.revision,
  });
  await fx.update({ newConversations: 'auto' });
  await fx.receive(dm('2'));
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.heldConversations).toEqual([]);
  expect(snapshot.blockedConversations).toEqual([
    expect.objectContaining({ conversation: { kind: 'dm', id: 'oc_owner' }, name: 'Owner' }),
  ]);
  expect(fx.admissions()).toEqual([]);
});

it('holds new conversations past the hourly limit instead of creating entries', async () => {
  const fx = await fixture();
  for (let i = 0; i < 21; i++)
    await fx.receive(
      dm(`n${i}`, {
        conversation: { kind: 'dm', id: `oc_${i}` },
        reply: { messageId: `om-n${i}`, conversationId: `oc_${i}`, actorId: 'ou_owner' },
      }),
    );
  expect(fx.entries()).toHaveLength(20);
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toEqual([
    expect.objectContaining({ conversation: { kind: 'dm', id: 'oc_20' }, reason: 'hourly-limit' }),
  ]);
});

it('syncs an implicit group entry into a Channel, which then receives its later mentions', async () => {
  const fx = await fixture();
  await fx.receive(mention('first'));
  const entry = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const room = fx.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
    name: 'Team room',
    members: ['ada'],
  });
  await fx.core.externalMessaging.inbound.channelBridge(room.id, {
    kind: 'add',
    grantId: entry.id,
    expectedGrantRevision: entry.revision,
    delivery: 'channel',
    name: 'Team',
    enabled: true,
    collection: 'mentions',
    collectionInheritance: 'inherit',
  });
  await fx.receive({ ...mention('second'), at: new Date(Date.now() + 1000).toISOString() });
  const placed = fx.query(
    `SELECT json_extract(e.payload_json, '$.external.event.messageId') AS messageId FROM channel_placements p JOIN source_events e USING(source_event_id) WHERE p.channel_id = '${room.id}'`,
  );
  expect(placed).toEqual([{ messageId: 'om-second' }]);
  const routes = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!.bridgeRoutes;
  expect(routes?.map((route) => route.channelId)).toContain(room.id);
  const synced = await fx.core.externalMessaging.channelBridges(room.id);
  expect(synced.bridges.map((row) => [row.name, row.delivery])).toEqual([['Team', 'channel']]);
  const dm = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  expect((await fx.core.externalMessaging.channelBridges(dm.id)).bridges).toEqual([]);
});
