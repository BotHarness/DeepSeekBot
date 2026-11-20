import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import {
  event,
  fixture,
  sharedTarget,
  ordinaryEvent,
  reception,
  ordinaryThread,
  botEditor,
  cleanup,
} from './messaging-inbound-fixtures.js';

afterEach(cleanup);

async function collectSharedOrdinary(fx: Awaited<ReturnType<typeof fixture>>) {
  const channelId = await sharedTarget(fx);
  await fx.enable();
  await fx.receive(ordinaryEvent('shared-probe'));
  await fx.core.externalMessaging.inbound.setPolicy('ada', fx.grant.id, reception, {
    kind: 'human',
  });
  return channelId;
}

it('commits shared ordinary facts once and gives each member an independent effective policy before ACK', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'digest', count: 2, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'digest', count: 3, intervalSeconds: 60 });
  const first = {
    ...ordinaryEvent('shared-one'),
    actor: { kind: 'user' as const, id: 'ou-human', name: 'Alex' },
  };
  await fx.receive(first);
  expect(fx.core.channels.queryMessages(id, { text: 'shared-one' }).messages).toHaveLength(1);
  expect(
    fx.query('SELECT bot_slug, wake_count, reason FROM inbox_admissions ORDER BY bot_slug'),
  ).toEqual([
    { bot_slug: 'ada', wake_count: 2, reason: 'group-ordinary' },
    { bot_slug: 'bea', wake_count: 3, reason: 'group-ordinary' },
  ]);
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.receive(ordinaryEvent('shared-two'));
  await fx.idle();
  expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada']);
  expect(fx.runs[0]?.message).toContain(
    'Alex (feishu, sender ou-human, external message shared-one)',
  );
  expect(fx.runs[0]?.message).toContain('[Source Event ');
  expect(fx.runs[0]?.inboundChannelId).toBe(id);
  await fx.receive(ordinaryEvent('shared-three'));
  await fx.idle();
  expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada', 'bea']);
  expect(fx.runs[1]?.message).toContain('shared-one');
  expect(fx.runs[1]?.message).toContain('shared-three');
  const sourceId = fx.core.channels.readMessages(id)[0]!.id;
  expect(() => fx.core.externalMessaging.inbound.read('bea', sourceId)).toThrow(
    'source-unavailable',
  );
  await fx.receive(first);
  await fx.idle();
  expect(fx.core.channels.readMessages(id)).toHaveLength(3);
  expect(fx.query('SELECT * FROM inbox_admissions')).toHaveLength(6);
  expect(fx.runs).toHaveLength(2);
  expect(fx.replies).toHaveLength(0);
});

it('uses each Bot default and effective channel override in the Human query and refuses nonmember channels', async () => {
  const fx = await fixture();
  const id = await sharedTarget(fx);
  fx.core.sourcePolicy.setGroupOrdinary('bea', 'silent', 5, 30, { kind: 'human' });
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  expect(methods.channelGroupWakePolicies({ channelId: id })).toMatchObject({
    ok: true,
    value: {
      members: [
        {
          botSlug: 'ada',
          inherited: true,
          policy: { mode: 'digest', count: 10, intervalSeconds: 30 },
        },
        { botSlug: 'bea', inherited: true, policy: { mode: 'silent' } },
      ],
    },
  });
  expect(
    methods.channelGroupWakeSet({
      channelId: id,
      botSlug: 'ada',
      mode: 'digest',
      count: 2,
      intervalSeconds: 60,
    }),
  ).toMatchObject({ ok: true });
  expect(methods.channelGroupWakePolicies({ channelId: id })).toMatchObject({
    ok: true,
    value: { members: [{ inherited: false, policy: { count: 2 } }, { inherited: true }] },
  });
  const privateGroup = fx.core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  expect(methods.channelGroupWakePolicies({ channelId: privateGroup.id })).toMatchObject({
    ok: false,
  });
  expect(
    methods.channelGroupWakeSet({
      channelId: privateGroup.id,
      botSlug: 'ada',
      mode: 'all',
      count: 1,
      intervalSeconds: 1,
    }),
  ).toMatchObject({ ok: false });
});

it('queues immediate ordinary traffic behind the active turn without steer and independently admits a timed member', async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const busy = new Promise<void>((r) => {
    finish = r;
  });
  const steer = vi.fn(() => true);
  const fx = await fixture({
    steer,
    onRun: async (run) => {
      if (run.bot.slug === 'ada' && fx.runs.filter((r) => r.bot.slug === 'ada').length === 1) {
        entered();
        await busy;
      }
    },
  });
  const id = await collectSharedOrdinary(fx);
  vi.useFakeTimers({ toFake: ['Date'] });
  const clock = Date.now();
  try {
    fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'all', count: 1, intervalSeconds: 60 });
    fx.core.channels.setGroupWakePolicy(id, 'bea', {
      mode: 'digest',
      count: 100,
      intervalSeconds: 1,
    });
    await fx.receive(ordinaryEvent('busy-one'));
    await started;
    await fx.receive(ordinaryEvent('busy-two'));
    await tick();
    expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada']);
    expect(steer).not.toHaveBeenCalled();
    vi.setSystemTime(clock + 1100);
    await new Promise((r) => setTimeout(r, 1100));
    expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada', 'bea']);
    finish();
    await fx.idle();
    expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada', 'bea', 'ada']);
    expect(fx.runs[2]?.message).toContain('busy-two');
  } finally {
    finish();
    await fx.idle();
    vi.useRealTimers();
  }
});

it('retains pending ordinary facts across restart, policy revisions, silent collection and membership removal', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'digest', count: 2, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 2, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('restart-one'));
  await fx.idle();
  await fx.restart();
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'digest', count: 3, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('revision-two'));
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  expect(
    fx.query(
      "SELECT wake_policy_revision, wake_count FROM inbox_admissions WHERE bot_slug = 'ada' ORDER BY rowid",
    ),
  ).toEqual([
    { wake_policy_revision: 1, wake_count: 2 },
    { wake_policy_revision: 2, wake_count: 3 },
  ]);
  fx.core.channels.removeGroupMember(id, 'bea');
  await fx.receive(ordinaryEvent('after-departure'));
  expect(fx.query("SELECT * FROM inbox_admissions WHERE bot_slug = 'bea'")).toHaveLength(2);
  expect(fx.core.channels.readMessages(id).filter((m) => m.author.kind === 'bridged')).toHaveLength(
    3,
  );
});

it('catches up a busy shared Channel in bounded oldest-first harvests rather than one run per external event', async () => {
  let finish!: () => void;
  let entered!: () => void;
  const started = new Promise<void>((r) => {
    entered = r;
  });
  const busy = new Promise<void>((r) => {
    finish = r;
  });
  const fx = await fixture({
    onRun: async (run) => {
      if (run.bot.slug === 'ada' && fx.runs.length === 1) {
        entered();
        await busy;
      }
    },
  });
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'all', count: 1, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 1, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('catchup-000'));
  await started;
  for (let i = 1; i <= 105; ++i)
    await fx.receive(ordinaryEvent(`catchup-${String(i).padStart(3, '0')}`));
  expect(fx.core.channels.readMessages(id, { limit: 200 })).toHaveLength(106);
  finish();
  await fx.idle();
  expect(fx.runs.length).toBeGreaterThan(2);
  expect(fx.runs.length).toBeLessThan(10);
  expect(fx.runs[1]?.message).toContain('catchup-001');
  expect(fx.runs[1]?.message).toContain('further messages');
  expect(fx.runs.at(-1)?.message).toContain('catchup-105');
  expect(
    fx.query(
      "SELECT * FROM inbox_admissions WHERE bot_slug = 'ada' AND attempt_state != 'handled'",
    ),
  ).toHaveLength(0);
});

it('brings mentions-only shared ordinary context into the next addressed external turn without waking silent members', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', {
    mode: 'mentions',
    count: 5,
    intervalSeconds: 30,
  });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 5, intervalSeconds: 30 });
  await fx.receive(ordinaryEvent('context-only'));
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.receive(
    event({
      eventId: 'ev-context-trigger',
      messageId: 'context-trigger',
      at: new Date().toISOString(),
      reply: { messageId: 'context-trigger', conversationId: 'oc-team', actorId: 'ou-human' },
    }),
  );
  await fx.idle();
  expect(fx.runs.map((r) => r.bot.slug)).toEqual(['ada']);
  expect(fx.runs[0]?.message).toContain('context-only');
  expect(
    fx.query("SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'ada' ORDER BY rowid"),
  ).toEqual([{ attempt_state: 'handled' }, { attempt_state: 'handled' }]);
  expect(fx.query("SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'bea'")).toEqual([
    { attempt_state: 'pending' },
  ]);
});

it('settles shared mention context for only the steered Bot and keeps other members pending', async () => {
  let finish!: () => void;
  let began!: () => void;
  const started = new Promise<void>((resolve) => {
    began = resolve;
  });
  const held = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const steer = vi.fn((_bot: string, _text: string) => true);
  const fx = await fixture({
    steer,
    onRun: async () => {
      began();
      await held;
    },
  });
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', {
    mode: 'mentions',
    count: 5,
    intervalSeconds: 30,
  });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'silent', count: 5, intervalSeconds: 30 });
  try {
    await fx.receive();
    await started;
    await fx.receive(ordinaryEvent('shared-steer-context'));
    await tick();
    expect(steer).not.toHaveBeenCalled();
    await fx.receive(
      event({
        eventId: 'steer-shared',
        messageId: 'steer-shared',
        text: '@_user_1 next mention',
        reply: { ...event().reply, messageId: 'steer-shared' },
      }),
    );
    await tick();
    expect(steer).toHaveBeenCalledTimes(1);
    expect(steer.mock.calls[0]?.[1]).toContain('shared-steer-context');
  } finally {
    finish();
  }
  await fx.idle();
  expect(
    fx.query(
      "SELECT attempt_state, observed_at IS NOT NULL AS seen FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'ada'",
    ),
  ).toEqual([{ attempt_state: 'handled', seen: 1 }]);
  expect(
    fx.query("SELECT attempt_state, observed_at FROM inbox_admissions WHERE bot_slug = 'bea'"),
  ).toEqual([{ attempt_state: 'pending', observed_at: null }]);
});

it('keeps receiving-Bot Thread thresholds separate while other members use their Channel rule', async () => {
  const fx = await fixture();
  const id = await sharedTarget(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'silent', count: 5, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'digest', count: 3, intervalSeconds: 60 });
  await fx.enable();
  for (const threadId of ['omt-topic', 'omt-second']) {
    const route = ordinaryThread('route-' + threadId, threadId);
    await fx.receive({ ...route, mentionedAccount: true, mentions: event().mentions });
    await fx.idle();
    const anchor = fx.core.channels
      .readMessages(id)
      .find((m) => m.bridgeOrigin?.threadId === threadId)!.id;
    await fx.receive(ordinaryThread('probe-' + threadId, threadId));
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
  }
  await fx.receive(ordinaryThread('partition-first', 'omt-topic'));
  await fx.receive(ordinaryThread('partition-second', 'omt-second'));
  await fx.idle();
  expect(fx.runs).toHaveLength(2);
  await fx.receive(ordinaryThread('partition-third', 'omt-topic'));
  await fx.idle();
  expect(fx.runs.filter((r) => r.bot.slug === 'ada')).toHaveLength(3);
  expect(fx.runs.filter((r) => r.bot.slug === 'bea')).toHaveLength(1);
  expect(
    fx.query(
      "SELECT wake_count, external_thread_policy_revision FROM inbox_admissions WHERE reason = 'group-ordinary' AND bot_slug = 'bea'",
    ),
  ).toEqual(
    Array.from({ length: 3 }, () => ({ wake_count: 3, external_thread_policy_revision: null })),
  );
});

it('handles a local member reply after shared external harvest without granting ordinary bot traffic Memory authority', async () => {
  const fx = await fixture();
  const id = await collectSharedOrdinary(fx);
  fx.core.channels.setGroupWakePolicy(id, 'ada', { mode: 'all', count: 1, intervalSeconds: 60 });
  fx.core.channels.setGroupWakePolicy(id, 'bea', { mode: 'all', count: 1, intervalSeconds: 60 });
  await fx.receive(ordinaryEvent('external-start'));
  await fx.idle();
  await fx.runs
    .find((run) => run.bot.slug === 'ada')!
    .channels.send({ body: 'Local shared result' });
  await fx.idle();
  const local = fx.core.channels.readMessages(id).find((m) => m.body === 'Local shared result')!;
  expect(local).toBeDefined();
  expect(
    fx.query(
      `SELECT a.attempt_state, a.last_error FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE e.message_id = '${local.id}' AND a.bot_slug = 'bea'`,
    ),
  ).toEqual([{ attempt_state: 'handled', last_error: null }]);
  const peerReplyTurn = fx.runs.find(
    (r) => r.bot.slug === 'bea' && r.message.includes('Local shared result'),
  );
  expect(peerReplyTurn).toBeDefined();
  expect(peerReplyTurn!.memory).toBeUndefined();
  expect(fx.core.channels.readMessages(id).some((m) => m.sessionFailure)).toBe(false);
});
