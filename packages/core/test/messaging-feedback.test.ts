import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'c'.repeat(64);
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});
function dm(id: string, platform: 'feishu' | 'slack' = 'feishu'): MessagingInboundEvent {
  return {
    version: 1,
    channel: platform,
    botId: platform === 'slack' ? 'slack-app' : 'lark-app',
    fingerprint,
    eventId: `ev-${id}`,
    messageId: `om-${id}`,
    actor: { kind: 'user', id: 'ou_owner' },
    conversation: { kind: 'dm', id: 'oc_owner' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text: `hello ${id}`,
    reply: { messageId: `om-${id}`, conversationId: 'oc_owner', actorId: 'ou_owner' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
}
async function fixture(
  options: { capability?: boolean; version?: boolean; platform?: 'feishu' | 'slack' } = {},
) {
  const platform = options.platform ?? 'feishu';
  const botId = platform === 'slack' ? 'slack-app' : 'lark-app';
  const home = createTempRoot('botharness-feedback-');
  const reactions: { messageId: string; reaction: string }[] = [];
  const replies: string[] = [];
  let runs = 0;
  let core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator() {
        runs++;
      },
      async runAssignment() {},
      requestAssignment: () => ({ delivery: 'steer' }),
      async stopAssignment() {},
      async close() {},
    },
  });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer;
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    ...(options.version === false ? {} : { reactionVersion: 1 as const }),
    listBots: async () => [{ botId, channel: platform }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: platform,
      connected: true,
      account: { fingerprint, name: 'QA' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
        ...(options.capability === false ? [] : ['reaction-write-checked']),
      ],
    }),
    consumeInbound: async (_id, input) => {
      consumer = input;
      return () => {};
    },
    qualifyReplyChecked: async (_id, route) => route,
    sendChecked: async () => ({ sent: true }),
    replyChecked: async (_id, route, _text, input) => {
      expect(input.beforeSend?.()).toBe(true);
      replies.push(route.messageId);
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: `answer-${route.messageId}`,
          conversationId: route.conversationId,
        },
      };
    },
    reactionChecked: vi.fn(async (_id, route, reaction, input) => {
      expect(input.beforeSend()).toBe(true);
      const source = core.attention
        .list({ botSlug: 'ada' })
        .items.find(
          (item) =>
            core.externalMessaging.inbound.read('ada', item.id).event.messageId === route.messageId,
        );
      expect(source).toBeDefined();
      if (reaction === 'answered')
        expect(core.externalMessaging.history('ada')).toContainEqual(
          expect.objectContaining({ sourceEventId: source!.id, state: 'provider-accepted' }),
        );
      reactions.push({ messageId: route.messageId, reaction });
      return { accepted: true as const };
    }),
  };
  const register = () => core.externalMessaging.register(createDshImProvider(transport, platform)!);
  let dispose = register();
  const idle = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: `dsh-im/${platform}`,
    accountRef: botId,
    fingerprint,
  });
  await idle();
  const sourceId = (messageId: string) =>
    core.attention
      .list({ botSlug: 'ada' })
      .items.find(
        (item) => core.externalMessaging.inbound.read('ada', item.id).event.messageId === messageId,
      )!.id;
  return {
    get core() {
      return core;
    },
    transport,
    reactions,
    replies,
    idle,
    sourceId,
    get runs() {
      return runs;
    },
    receive: (event: MessagingInboundEvent) => consumer.onEvent(event, { signal: consumer.signal }),
    async restart() {
      dispose();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = createCore({ dshHome: home });
      cores.push(core);
      dispose = register();
      await idle();
    },
  };
}

it('checked DM admission and accepted source reply produce two source-specific reactions, retained across replay/reconnect', async () => {
  const fx = await fixture();
  const event = dm('one');
  await fx.receive(event);
  await fx.idle();
  expect(fx.reactions).toEqual([{ messageId: 'om-one', reaction: 'received' }]);
  expect(
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-one'), 'Answer'),
  ).toMatchObject({ state: 'provider-accepted' });
  await fx.idle();
  expect(fx.reactions).toEqual([
    { messageId: 'om-one', reaction: 'received' },
    { messageId: 'om-one', reaction: 'answered' },
  ]);
  await fx.receive({ ...event, eventId: 'redelivery' });
  await fx.idle();
  await fx.restart();
  await fx.receive({ ...event, eventId: 'reconnect' });
  await fx.idle();
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-one'), 'Answer');
  expect(fx.reactions).toHaveLength(2);
  expect(fx.replies).toHaveLength(1);
  const methods = createBridgeMethods(fx.core);
  expect(await methods.messagingSnapshot({ slug: 'ada' })).toMatchObject({
    ok: true,
    value: {
      feedback: [
        {
          sourceEventId: fx.sourceId('om-one'),
          attempts: {
            received: { state: 'accepted' },
            answered: { state: 'accepted', outboxId: expect.any(String) },
          },
        },
      ],
    },
  });
});

it.each(['dm', 'group'] as const)(
  'Slack %s feedback follows admission and the accepted original-source reply, without replay',
  async (kind) => {
    const fx = await fixture({ platform: 'slack' });
    const event = {
      ...dm('slack-source', 'slack'),
      conversation: { kind, id: 'oc_owner' },
      mentionedAccount: kind === 'group',
      reply: {
        messageId: 'om-slack-source',
        conversationId: 'oc_owner',
        actorId: 'ou_owner',
        ...(kind === 'group' ? { rootId: 'slack-thread-root' } : {}),
      },
    };
    expect(
      (await createDshImProvider(fx.transport, 'slack')!.accounts())[0]?.reactionSupported,
    ).toBe(true);
    await fx.receive(event);
    await fx.idle();
    expect(fx.reactions).toEqual([{ messageId: 'om-slack-source', reaction: 'received' }]);
    expect(
      await fx.core.externalMessaging.reply('ada', fx.sourceId(event.messageId), 'Answer'),
    ).toMatchObject({ state: 'provider-accepted' });
    await fx.idle();
    expect(fx.transport.reactionChecked).toHaveBeenLastCalledWith(
      'slack-app',
      event.reply,
      'answered',
      expect.objectContaining({ expectedFingerprint: fingerprint }),
    );
    await fx.receive({ ...event, eventId: 'slack-redelivery' });
    await fx.restart();
    await fx.receive({ ...event, eventId: 'slack-reconnect' });
    await fx.idle();
    expect(fx.reactions).toEqual([
      { messageId: 'om-slack-source', reaction: 'received' },
      { messageId: 'om-slack-source', reaction: 'answered' },
    ]);
    expect(fx.replies).toEqual(['om-slack-source']);
  },
);

it.each([{ version: false }, { capability: false }])(
  'Slack without checked reaction support retains intake and replies: %j',
  async (options) => {
    const fx = await fixture({ ...options, platform: 'slack' });
    await fx.receive(dm('slack-source', 'slack'));
    await fx.idle();
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-slack-source'), 'Answer');
    await fx.idle();
    expect(fx.runs).toBe(1);
    expect(fx.replies).toEqual(['om-slack-source']);
    expect(fx.reactions).toEqual([]);
    expect((await fx.core.externalMessaging.snapshot('ada')).feedback?.[0]?.attempts).toMatchObject(
      {
        received: { state: 'unavailable' },
        answered: { state: 'unavailable' },
      },
    );
  },
);

it('Slack muted and context-only sources have no feedback, including explicit muted replies', async () => {
  const fx = await fixture({ platform: 'slack' });
  await fx.receive(dm('first', 'slack'));
  await fx.idle();
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  await fx.receive(dm('muted', 'slack'));
  await fx.idle();
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-muted'), 'Explicit reply');
  await fx.receive({
    ...dm('ordinary', 'slack'),
    conversation: { kind: 'group', id: 'context-only-channel' },
    reply: {
      messageId: 'om-ordinary',
      conversationId: 'context-only-channel',
      actorId: 'ou_owner',
    },
  });
  await fx.idle();
  expect(fx.runs).toBe(1);
  expect(fx.reactions).toEqual([{ messageId: 'om-first', reaction: 'received' }]);
});

it('Slack feedback rechecks mute at dispatch after a pending capability call', async () => {
  const fx = await fixture({ platform: 'slack' });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  fx.transport.reactionChecked = vi.fn(async (_id, _route, _reaction, input) => {
    await gate;
    expect(input.beforeSend()).toBe(false);
    throw Object.assign(new Error('source muted'), { code: 'stale-route' });
  });
  await fx.receive(dm('slack-source', 'slack'));
  await fx.idle();
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  release();
  await fx.idle();
  expect(fx.reactions).toEqual([]);
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).feedback?.[0]?.attempts.received,
  ).toMatchObject({ state: 'failed' });
});

it('Slack silence, failed or uncertain replies and proactive sends never claim an answer', async () => {
  const fx = await fixture({ platform: 'slack' });
  for (const name of ['silence', 'failed', 'unknown', 'notice']) {
    await fx.receive(dm(name, 'slack'));
  }
  await fx.idle();
  fx.transport.replyChecked = async (_id, route) => {
    if (route.messageId === 'om-failed')
      throw Object.assign(new Error('denied'), { code: 'stale-route' });
    throw new Error('unknown transport result');
  };
  for (const name of ['failed', 'unknown']) {
    await fx.core.externalMessaging.reply('ada', fx.sourceId(`om-${name}`), 'Answer');
  }
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.send(
    'ada',
    grant.id,
    'slack-notice',
    'Notice',
    fx.sourceId('om-notice'),
  );
  await fx.idle();
  expect(fx.reactions).toHaveLength(4);
  expect(fx.reactions.every((reaction) => reaction.reaction === 'received')).toBe(true);
});

it('Slack reaction failure is isolated and is not retried after redelivery or restart', async () => {
  const fx = await fixture({ platform: 'slack' });
  fx.transport.reactionChecked = vi.fn(async () => {
    throw Object.assign(new Error('scope denied'), { code: 'reaction-permission-denied' });
  });
  const event = dm('slack-source', 'slack');
  await fx.receive(event);
  await fx.idle();
  expect(
    await fx.core.externalMessaging.reply('ada', fx.sourceId(event.messageId), 'Answer'),
  ).toMatchObject({ state: 'provider-accepted' });
  await fx.idle();
  expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(2);
  await fx.receive({ ...event, eventId: 'slack-redelivery' });
  await fx.restart();
  await fx.receive({ ...event, eventId: 'slack-reconnect' });
  await fx.idle();
  expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(2);
  expect(fx.replies).toHaveLength(1);
});

it('retains the first admission notification while its new reply connection is still starting', async () => {
  const fx = await fixture();
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const describe = fx.transport.describeBot;
  fx.transport.describeBot = async (id) => {
    await ready;
    return describe(id);
  };
  try {
    await fx.receive(dm('slow-first'));
    await tick();
    expect(fx.reactions).toEqual([]);
  } finally {
    release();
  }
  await fx.idle();
  expect(fx.reactions).toEqual([{ messageId: 'om-slow-first', reaction: 'received' }]);
});

it('parallel sources cannot exchange accepted, silent, failed or unknown answers', async () => {
  const fx = await fixture();
  await Promise.all(['ok', 'silent', 'failed', 'unknown'].map((id) => fx.receive(dm(id))));
  await fx.idle();
  fx.transport.replyChecked = async (_id, route) => {
    if (route.messageId === 'om-failed')
      throw Object.assign(new Error('denied'), { code: 'stale-route' });
    if (route.messageId === 'om-unknown') throw new Error('private error must not leak');
    return {
      sent: true,
      receipt: { version: 1, messageId: 'answer', conversationId: route.conversationId },
    };
  };
  const results = await Promise.all(
    ['ok', 'failed', 'unknown'].map((id) =>
      fx.core.externalMessaging.reply('ada', fx.sourceId(`om-${id}`), `answer ${id}`),
    ),
  );
  expect(results.map((result) => result.state)).toEqual([
    'provider-accepted',
    'failed',
    'unknown-outcome',
  ]);
  await fx.idle();
  expect(fx.reactions.filter((item) => item.reaction === 'received')).toHaveLength(4);
  expect(fx.reactions.filter((item) => item.reaction === 'answered')).toEqual([
    { messageId: 'om-ok', reaction: 'answered' },
  ]);
});

it.each([{ version: false }, { capability: false }])(
  'unavailable checked capability cannot block admission or answer: %j',
  async (options) => {
    const fx = await fixture(options);
    await fx.receive(dm('one'));
    await fx.idle();
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-one'), 'Answer');
    await fx.idle();
    expect(fx.runs).toBe(1);
    expect(fx.replies).toEqual(['om-one']);
    expect(fx.reactions).toEqual([]);
    expect((await fx.core.externalMessaging.snapshot('ada')).feedback?.[0]?.attempts).toMatchObject(
      {
        received: { state: 'unavailable' },
        answered: { state: 'unavailable' },
      },
    );
  },
);

it('reaction rejection is isolated and never retried by redelivery or restart', async () => {
  const fx = await fixture();
  fx.transport.reactionChecked = vi.fn(async () => {
    throw Object.assign(new Error('private details'), { code: 'reaction-permission-denied' });
  });
  const event = dm('one');
  await fx.receive(event);
  await fx.idle();
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-one'), 'Answer');
  await fx.idle();
  expect(fx.runs).toBe(1);
  expect(fx.replies).toHaveLength(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).feedback?.[0]?.attempts).toMatchObject({
    received: { state: 'failed' },
    answered: { state: 'failed' },
  });
  await fx.restart();
  await fx.receive({ ...event, eventId: 'again' });
  await fx.idle();
  expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(2);
});

it('a pending reaction cannot hold an answer, and a pending answer cannot produce completion', async () => {
  const fx = await fixture();
  let releaseReaction!: () => void;
  const reactionGate = new Promise<void>((resolve) => {
    releaseReaction = resolve;
  });
  fx.transport.reactionChecked = vi.fn(async () => {
    await reactionGate;
    return { accepted: true as const };
  });
  await fx.receive(dm('one'));
  await fx.idle();
  let releaseAnswer!: () => void;
  const answerGate = new Promise<void>((resolve) => {
    releaseAnswer = resolve;
  });
  fx.transport.replyChecked = async (_id, route) => {
    await answerGate;
    return {
      sent: true,
      receipt: { version: 1, messageId: 'answer', conversationId: route.conversationId },
    };
  };
  const answer = fx.core.externalMessaging.reply('ada', fx.sourceId('om-one'), 'Answer');
  await tick();
  expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(1);
  releaseAnswer();
  expect(await answer).toMatchObject({ state: 'provider-accepted' });
  expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(2);
  releaseReaction();
  await fx.idle();
});

it('an unmentioned ordinary group event has no admission and no receipt', async () => {
  const fx = await fixture();
  const event = dm('ordinary');
  await fx.receive({ ...event, conversation: { kind: 'group', id: 'oc_owner' } });
  await fx.idle();
  expect(fx.core.attention.list({ botSlug: 'ada' }).items).toHaveLength(0);
  expect(fx.reactions).toHaveLength(0);
});

it('timed-out reactions retain concurrency slots until their underlying calls settle', async () => {
  const fx = await fixture();
  const pending: { resolve(): void; reject(): void }[] = [];
  fx.transport.reactionChecked = vi.fn(
    () =>
      new Promise<{ accepted: true }>((resolve, reject) => {
        pending.push({
          resolve: () => resolve({ accepted: true }),
          reject: () => reject(new Error('late provider failure')),
        });
      }),
  );
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  try {
    await fx.receive(dm('slow-0'));
    await fx.idle();
    const sourceEventId = fx.sourceId('om-slow-0');
    await Promise.all(Array.from({ length: 31 }, (_, i) => fx.receive(dm(`slow-${i + 1}`))));
    await fx.idle();
    expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(32);
    await vi.advanceTimersByTimeAsync(4_000);
    await fx.idle();
    expect(
      (await fx.core.externalMessaging.snapshot('ada')).feedback?.[0]?.attempts.received,
    ).toMatchObject({ state: 'unknown' });
    await fx.receive(dm('overflow'));
    await fx.idle();
    expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(32);
    pending[0]!.resolve();
    await fx.idle();
    await fx.receive(dm('after-late-success'));
    await fx.idle();
    expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(33);
    pending[1]!.reject();
    await fx.idle();
    await fx.receive(dm('after-late-failure'));
    await fx.idle();
    expect(fx.transport.reactionChecked).toHaveBeenCalledTimes(34);
    const source = attachOperationalModule(fx.core.operationalDatabase, 'test').read((db) =>
      db
        .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
        .get(sourceEventId),
    ) as { payload_json: string };
    expect(JSON.parse(source.payload_json).feedback.received.state).toBe('unknown');
  } finally {
    for (const call of pending) call.resolve();
    await fx.idle();
    vi.useRealTimers();
  }
});

it('a separately accepted send referencing the source does not claim its answer completed', async () => {
  const fx = await fixture();
  await fx.receive(dm('one'));
  await fx.idle();
  const sourceEventId = fx.sourceId('om-one');
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  expect(
    await fx.core.externalMessaging.send('ada', grant.id, 'status-notice', 'Status', sourceEventId),
  ).toMatchObject({ state: 'provider-accepted' });
  await fx.idle();
  expect(fx.reactions).toEqual([{ messageId: 'om-one', reaction: 'received' }]);
});

it('mute retains receipt without wake, explicit accepted replies may complete, and block denies admission', async () => {
  const fx = await fixture();
  await fx.receive(dm('first'));
  await fx.idle();
  const grant = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  await fx.receive(dm('muted'));
  await fx.idle();
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-muted'), 'Explicit answer');
  await fx.idle();
  expect(fx.runs).toBe(1);
  expect(fx.reactions).toEqual([
    { messageId: 'om-first', reaction: 'received' },
    { messageId: 'om-muted', reaction: 'received' },
    { messageId: 'om-muted', reaction: 'answered' },
  ]);
  const latest = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: latest.id,
    expectedRevision: latest.revision,
  });
  await fx.receive(dm('blocked'));
  await fx.idle();
  expect(
    attachOperationalModule(fx.core.operationalDatabase, 'test').read((db) =>
      db.prepare('SELECT count(*) AS total FROM inbox_admissions').get(),
    ),
  ).toEqual({ total: 2 });
  expect(fx.reactions).toHaveLength(3);
});
