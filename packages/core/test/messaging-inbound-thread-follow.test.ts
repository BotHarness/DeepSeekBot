import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  event,
  fixture,
  sharedTarget,
  ordinaryEvent,
  reception,
  ordinaryThread,
  externalAnchor,
  botEditor,
  cleanup,
} from './messaging-inbound-fixtures.js';

afterEach(cleanup);

it('follows only an Inbox-anchored verified Thread, harvests ordinary replies and retains exact admission policy revisions', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = externalAnchor(fx);
  expect(fx.core.externalMessaging.inbound.threads('ada', fx.grant.id)[0]).toMatchObject({
    mode: 'inherit',
    revision: 0,
    ordinaryDelivery: 'unverified',
  });
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'follow', expectedRevision: 0, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('thread-delivery-unverified');
  await fx.receive(ordinaryThread('delivery-probe'));
  await fx.idle();
  expect(fx.query("SELECT body FROM source_events WHERE body = 'Ordinary delivery-probe'")).toEqual(
    [],
  );
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    {
      mode: 'follow',
      expectedRevision: 0,
      wake: { wake: 'digest', count: 2, intervalSeconds: 60 },
    },
    botEditor,
  );
  const mismatch = ordinaryThread('mismatched-root');
  await expect(
    fx.receive({ ...mismatch, reply: { ...mismatch.reply, rootId: 'wrong-root' } }),
  ).rejects.toThrow('thread-route-mismatch');
  await fx.receive(ordinaryThread('wrong-topic', 'omt-other'));
  await fx.receive(ordinaryEvent('main-group'));
  await fx.receive(ordinaryThread('followed-one'));
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT body FROM source_events WHERE body IN ('Ordinary main-group', 'Ordinary wrong-topic')",
    ),
  ).toEqual([]);
  expect(
    fx.query(
      "SELECT external_thread_policy_revision, wake_count, wake_mode FROM inbox_admissions WHERE reason = 'group-ordinary'",
    ),
  ).toEqual([{ external_thread_policy_revision: 1, wake_count: 2, wake_mode: 'digest' }]);
  await fx.receive(ordinaryThread('followed-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(2);
  expect(fx.runs[1]?.inbox).toContain('Ordinary followed-one');
  expect(fx.runs[1]?.inbox).toContain('omt-topic');
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'inherit', expectedRevision: 1, wake: null },
    botEditor,
  );
  await fx.receive(ordinaryThread('after-unfollow'));
  await fx.idle();
  expect(fx.query("SELECT body FROM source_events WHERE body = 'Ordinary after-unfollow'")).toEqual(
    [],
  );
  expect(
    fx.query(
      "SELECT external_thread_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary'",
    ),
  ).toEqual([{ external_thread_policy_revision: 1 }, { external_thread_policy_revision: 1 }]);
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'follow', expectedRevision: 1, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('thread-policy-conflict');
});

it('persists follow across restart, deduplicates redelivery and unfollows back to all-group reception', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = externalAnchor(fx);
  await fx.receive(ordinaryThread('proof'));
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'follow', expectedRevision: 0, wake: null },
    botEditor,
  );
  await fx.restart();
  expect(fx.core.externalMessaging.inbound.threads('ada', fx.grant.id)[0]).toMatchObject({
    revision: 1,
    mode: 'follow',
    editor: botEditor,
    ordinaryDelivery: 'unverified',
  });
  const ordinary = ordinaryThread('after-restart');
  await fx.receive(ordinary);
  await fx.receive(ordinary);
  await fx.idle();
  expect(fx.query("SELECT * FROM inbox_admissions WHERE reason = 'group-ordinary'")).toHaveLength(
    1,
  );
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'inherit', expectedRevision: 1, wake: null },
    botEditor,
  );
  await fx.receive(ordinaryThread('inherits-all'));
  await fx.idle();
  expect(
    fx.query(
      "SELECT external_thread_policy_revision, wake_policy_revision, wake_count FROM inbox_admissions WHERE reason = 'group-ordinary' ORDER BY external_thread_policy_revision",
    ),
  ).toEqual([
    { external_thread_policy_revision: 1, wake_policy_revision: 0, wake_count: 10 },
    { external_thread_policy_revision: 2, wake_policy_revision: 1, wake_count: 2 },
  ]);
});

it('gives Human override precedence, rejects stale revisions and foreign/stale anchors, and preserves immutable history', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchor = externalAnchor(fx);
  await fx.receive(ordinaryThread('proof'));
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'exclude', expectedRevision: 0, wake: null },
    { kind: 'human' },
  );
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'follow', expectedRevision: 1, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('human-thread-override');
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  await fx.receive(ordinaryThread('human-excluded'));
  await fx.idle();
  expect(fx.query("SELECT body FROM source_events WHERE body = 'Ordinary human-excluded'")).toEqual(
    [],
  );
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'inherit', expectedRevision: 1, wake: null },
    { kind: 'human' },
  );
  await fx.core.externalMessaging.inbound.setThread(
    'ada',
    anchor,
    { mode: 'follow', expectedRevision: 2, wake: null },
    botEditor,
  );
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'eve',
      anchor,
      { mode: 'follow', expectedRevision: 3, wake: null },
      { kind: 'bot', botSlug: 'eve' },
    ),
  ).rejects.toThrow();
  expect(
    fx.query('SELECT revision FROM messaging_thread_policy_revisions ORDER BY revision'),
  ).toEqual([{ revision: 1 }, { revision: 2 }, { revision: 3 }]);
  await fx.core.externalMessaging.inbound.setEnabled('ada', fx.grant.id, false);
  await expect(
    fx.core.externalMessaging.inbound.setThread(
      'ada',
      anchor,
      { mode: 'inherit', expectedRevision: 3, wake: null },
      botEditor,
    ),
  ).rejects.toThrow('grant-unavailable');
  expect(fx.query('SELECT revision FROM messaging_thread_policy_revisions')).toHaveLength(3);
});

it('counts followed Thread digests independently and never lets another Thread reach its threshold', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const anchorA = externalAnchor(fx);
  const mentionB = event({
    messageId: 'mention-b',
    eventId: 'ev-mention-b',
    text: 'Mention B',
    reply: {
      ...event().reply,
      messageId: 'mention-b',
      threadId: 'omt-other',
      rootId: 'root-omt-other',
    },
  });
  await fx.receive(mentionB);
  await fx.idle();
  const anchorB = fx.core.attention
    .list({ botSlug: 'ada' })
    .items.find((item) => item.summary === 'Mention B')!.id;
  await fx.receive(ordinaryThread('probe-a'));
  await fx.receive(ordinaryThread('probe-b', 'omt-other'));
  const input = {
    mode: 'follow',
    expectedRevision: 0,
    wake: { wake: 'digest', count: 2, intervalSeconds: 600 },
  } as const;
  await fx.core.externalMessaging.inbound.setThread('ada', anchorA, input, botEditor);
  await fx.core.externalMessaging.inbound.setThread('ada', anchorB, input, botEditor);
  const before = fx.runs.length;
  await fx.receive(ordinaryThread('a-one'));
  await fx.receive(ordinaryThread('b-one', 'omt-other'));
  await fx.idle();
  expect(fx.runs).toHaveLength(before);
  await fx.receive(ordinaryThread('a-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(before + 1);
  expect(fx.runs.at(-1)?.inbox).toContain('Ordinary a-one');
  expect(fx.runs.at(-1)?.inbox).toContain('Ordinary a-two');
  expect(fx.runs.at(-1)?.inbox).not.toContain('Ordinary b-one');
  expect(
    fx.query(
      "SELECT a.attempt_state FROM inbox_admissions a JOIN source_events s USING(source_event_id) WHERE s.body = 'Ordinary b-one'",
    ),
  ).toEqual([{ attempt_state: 'pending' }]);
});

it.each([
  ['Alex', 'Alex'],
  [undefined, 'ou-human'],
])('counts a bridged Channel Source Event once with actor name %s', async (name, label) => {
  const fx = await fixture();
  const channelId = await sharedTarget(fx);
  await fx.enable();
  const inbound = event({
    at: new Date().toISOString(),
    actor: { kind: 'user', id: 'ou-human', ...(name === undefined ? {} : { name }) },
  });
  await fx.receive(inbound);
  await fx.receive(inbound);
  await fx.idle();
  expect(
    createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core }).channelActivityToday({}),
  ).toMatchObject({
    ok: true,
    value: {
      total: 1,
      channels: expect.arrayContaining([
        {
          channelId,
          name: 'Shared Lark work',
          type: 'group',
          total: 1,
          human: 0,
          bot: 0,
          other: 1,
          senders: [{ author: { kind: 'bridged', source: label }, displayName: label, count: 1 }],
        },
      ]),
    },
  });
});
