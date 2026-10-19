import { setImmediate as tick } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createTempRoot } from './helpers.js';

const declaration = {
  account: 'synthetic-origin',
  purpose: 'Verify current turn authority',
  fields: [{ id: 'token', label: 'Token', required: true }],
};

async function fixture() {
  const home = createTempRoot('bh-private-origin-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(home, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  let ready!: (run: OrchestratorAgentRun) => void;
  let release!: () => void;
  let started = new Promise<OrchestratorAgentRun>((resolve) => {
    ready = resolve;
  });
  let held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator(run) {
        ready(run);
        await held;
      },
      steerOrchestrator() {
        return true;
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    },
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.channels.getOrCreateDm('ada', 'Ada');
  const privateInputs = new PrivateInputs({
    channels: core.channels,
    ownership: core.ownership,
    registry: core.registry,
    credentials: () => ctx.credentials,
    isLive: () => true,
    qualified: async () => true,
    canRequest: (agent, id) => core.runtime.canRequestPrivateInput?.(agent.session.id, id) === true,
    origin: (agent, id) => core.runtime.bindPrivateInputOrigin?.(agent.session.id, id),
    notify: async () => {},
    replyAuthority: (bot, id, authority) =>
      core.externalMessaging.privateInputReplyAuthority(bot, id, authority),
    log: () => {},
  });
  const fingerprint = 'a'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'synthetic-im', channel: 'feishu' }],
    listTargets: async () => [
      {
        targetId: 'team',
        name: 'Synthetic group',
        kind: 'group',
        route: { chatId: 'synthetic-group' },
      },
    ],
    describeBot: async () => ({
      version: 1,
      botId: 'synthetic-im',
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'Synthetic IM' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true }),
    consumeInbound: async (_account, input) => {
      consumer = input;
      return () => {};
    },
    qualifyReplyChecked: async (_account, route) => route,
    replyChecked: async (_account, route, _text, options) => {
      if (options.beforeSend?.() === false) throw new Error('stale-route');
      return {
        sent: true,
        receipt: { version: 1, messageId: 'synthetic-reply', conversationId: route.conversationId },
      };
    },
  };
  core.externalMessaging.register(createDshImProvider(transport)!);
  const target = (await core.externalMessaging.targets('dsh-im/feishu', 'synthetic-im'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: 'dsh-im/feishu',
    accountRef: 'synthetic-im',
    targetRef: 'team',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  let next = 0;
  return {
    core,
    privateInputs,
    grant,
    started: () => started,
    async nextTurn() {
      release();
      await core.runtime.whenIdle();
      started = new Promise((resolve) => {
        ready = resolve;
      });
      held = new Promise((resolve) => {
        release = resolve;
      });
    },
    startQueuedTurn() {
      const previous = release;
      started = new Promise((resolve) => {
        ready = resolve;
      });
      held = new Promise((resolve) => {
        release = resolve;
      });
      previous();
      return started;
    },
    async local() {
      const id = 'local-' + ++next;
      await core.channels.appendMessage('dm-ada', {
        id,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Use the configured account',
      });
      return core.runtime.admitDmMessage({
        channelId: 'dm-ada',
        messageId: id,
        body: 'Use the configured account',
      });
    },
    async im() {
      const before = new Set(core.attention.list({ botSlug: 'ada' }).items.map((item) => item.id));
      const id = 'synthetic-' + ++next;
      await consumer!.onEvent(
        {
          version: 1,
          channel: 'feishu',
          botId: 'synthetic-im',
          fingerprint,
          eventId: id,
          messageId: id,
          actor: { kind: 'user', id: 'synthetic-human' },
          conversation: { kind: 'group', id: 'synthetic-group' },
          mentions: [{ id: 'synthetic-bot', key: '@bot' }],
          mentionedAccount: true,
          at: new Date().toISOString(),
          text: '@bot Use the configured account',
          reply: { messageId: id, conversationId: 'synthetic-group', actorId: 'synthetic-human' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
        { signal: consumer!.signal },
      );
      await tick();
      const sources = core.attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.sourceKind === 'bridge-message');
      expect(sources.length).toBeGreaterThan(0);
      return sources.find((item) => !before.has(item.id))!.id;
    },
    async configure(agent: Agent) {
      const waiting = privateInputs.ask(agent, declaration, new AbortController().signal);
      await vi.waitFor(() =>
        expect(core.channels.readMessages('dm-ada').some((m) => m.privateInputRequest)).toBe(true),
      );
      const card = core.channels.readMessages('dm-ada').find((m) => m.privateInputRequest)!;
      expect(
        await privateInputs.submit(true, {
          channelId: 'dm-ada',
          messageId: card.id,
          values: { token: 'SYNTHETIC-2290' },
        }),
      ).toBe(true);
      return { result: await waiting, cardId: card.id };
    },
    async close() {
      release();
      await privateInputs.close();
      core.schedules.close();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      await fiber.dispose();
    },
  };
}

it.each([0, 1, 2])(
  'consumes a local DM account with %i accepted IM steering inputs',
  async (count) => {
    const f = await fixture();
    try {
      await f.local();
      const run = await f.started();
      const agent = { session: { id: run.sessionId } } as Agent;
      const { result } = await f.configure(agent);
      for (let i = 0; i < count; i++) await f.im();
      expect(f.core.runtime.bindPrivateInputOrigin?.(run.sessionId)).toBeUndefined();
      const consume = vi.fn(async (values) =>
        values.token === 'SYNTHETIC-2290' ? 'authenticated' : 'refused',
      );
      await expect(
        f.privateInputs.consume(agent, declaration.account, result.references, consume),
      ).resolves.toBe('authenticated');
      expect(consume).toHaveBeenCalledOnce();
    } finally {
      await f.close();
    }
  },
);

it('keeps local authority across a pending secret_cli approval and IM steering', async () => {
  const f = await fixture();
  try {
    await f.local();
    const run = await f.started();
    const agent = {
      session: { id: run.sessionId, header: { cwd: f.core.registry.memoryDirFor('ada') } },
    } as Agent;
    const { result } = await f.configure(agent);
    const approvals = new ChannelToolApproval(f.core.channels, f.core.ownership);
    approvals.track({
      agent,
      name: 'secret_cli',
      callId: 'synthetic-call',
      arguments: { account: declaration.account, program: 'gh' },
      token: Symbol('call'),
    } as ToolExecution);
    const pending = approvals.ask({ agent, toolName: 'secret_cli', callId: 'synthetic-call' });
    await vi.waitFor(() => expect(approvals.requests('ada')).toHaveLength(1));
    await f.im();
    await f.im();
    const card = approvals.requests('ada')[0]!;
    expect(await approvals.decide('ada', card.messageId, 'allowed-once')).toBe(true);
    expect(await pending).toBe('allowed-once');
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'authenticated',
      ),
    ).resolves.toBe('authenticated');
  } finally {
    await f.close();
  }
});

it('accepts local Human steering into an IM turn but keeps explicit source leases and account ambiguity', async () => {
  const f = await fixture();
  try {
    await f.local();
    const run = await f.started();
    const agent = { session: { id: run.sessionId } } as Agent;
    const { result } = await f.configure(agent);
    await f.nextTurn();
    const first = await f.im();
    await f.started();
    const second = await f.im();
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'unexpected',
      ),
    ).rejects.toThrow('Select one live accepted IM source_event_id');
    await f.local();
    await expect(
      f.privateInputs.consume(agent, declaration.account, result.references, async () => 'local'),
    ).resolves.toBe('local');
    await expect(
      f.privateInputs.ask(agent, declaration, new AbortController().signal, first),
    ).resolves.toMatchObject({ status: 'configured' });
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'selected',
      ),
    ).resolves.toBe('selected');
    await f.privateInputs.ask(agent, declaration, new AbortController().signal, second);
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'unexpected',
      ),
    ).rejects.toThrow('source is ambiguous');
  } finally {
    await f.close();
  }
});

it('rejects revoked explicit IM authority even after local steering, then reuses the account in a later Schedule', async () => {
  const f = await fixture();
  try {
    await f.local();
    const run = await f.started();
    const agent = { session: { id: run.sessionId } } as Agent;
    const { result, cardId } = await f.configure(agent);
    await f.nextTurn();
    const source = await f.im();
    await f.started();
    const lease = f.core.runtime.bindPrivateInputOrigin?.(run.sessionId, source);
    expect(lease?.current()).toBe(true);
    await f.privateInputs.ask(agent, declaration, new AbortController().signal, source);
    await f.local();
    await f.core.externalMessaging.revoke('ada', f.grant.id);
    expect(lease?.current()).toBe(false);
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'unexpected',
      ),
    ).rejects.toThrow('IM authority changed');
    await f.nextTurn();
    const schedule = f.core.schedules.create(
      'ada',
      {
        title: 'Synthetic reuse',
        prompt: 'Use saved account',
        trigger: { kind: 'every', everySeconds: 3600 },
        enabled: false,
      },
      'human',
    );
    f.core.schedules.runNow('ada', schedule.id);
    await f.started();
    expect(lease?.applies()).toBe(false);
    expect(f.core.runtime.canRequestPrivateInput?.(run.sessionId)).toBe(false);
    for (const id of [source, 'unknown-source']) {
      expect(() => f.core.runtime.bindPrivateInputOrigin?.(run.sessionId, id)).toThrow();
    }
    await expect(
      f.privateInputs.ask(agent, declaration, new AbortController().signal),
    ).resolves.toMatchObject({ references: result.references });
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'scheduled',
      ),
    ).resolves.toBe('scheduled');
    await f.privateInputs.revoke(true, 'dm-ada', cardId);
    await expect(
      f.privateInputs.consume(
        agent,
        declaration.account,
        result.references,
        async () => 'unexpected',
      ),
    ).rejects.toThrow();
  } finally {
    await f.close();
  }
});

it('uses a local Group Human admission when IM context is present and refuses explicit unknown selectors', async () => {
  const f = await fixture();
  try {
    await f.local();
    const run = await f.started();
    const agent = { session: { id: run.sessionId } } as Agent;
    const { result } = await f.configure(agent);
    await f.nextTurn();
    const group = f.core.channels.createGroup({ name: 'Synthetic local group', members: ['ada'] });
    await f.core.channels.appendMessage(group.id, {
      id: 'local-mention',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '@Ada use saved account',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
    });
    f.core.runtime.admitGroupMessage(group.id, 'local-mention');
    await f.started();
    await f.im();
    await f.im();
    expect(f.core.runtime.canRequestPrivateInput?.(run.sessionId)).toBe(true);
    expect(f.core.runtime.canRequestPrivateInput?.(run.sessionId, 'unknown-source')).toBe(false);
    await expect(
      f.privateInputs.consume(agent, declaration.account, result.references, async () => 'group'),
    ).resolves.toBe('group');
  } finally {
    await f.close();
  }
});

it('does not turn unaccepted local history into authority for a multi-IM batch', async () => {
  const f = await fixture();
  try {
    await f.local();
    const run = await f.started();
    const agent = { session: { id: run.sessionId } } as Agent;
    const { result } = await f.configure(agent);
    await f.nextTurn();
    await f.core.channels.appendMessage('dm-ada', {
      id: 'history-only',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'This message was not admitted',
    });
    await f.im();
    await f.started();
    await f.im();
    const execute = vi.fn(async () => 'unexpected');
    expect(f.core.runtime.canRequestPrivateInput?.(run.sessionId)).toBe(false);
    await expect(
      f.privateInputs.consume(agent, declaration.account, result.references, execute),
    ).rejects.toThrow('Select one live accepted IM source_event_id');
    expect(execute).not.toHaveBeenCalled();
  } finally {
    await f.close();
  }
});

it('consumes local DM credentials when its queued turn collects a pending IM batch', async () => {
  const f = await fixture();
  try {
    await f.local();
    const run = await f.started();
    const agent = { session: { id: run.sessionId } } as Agent;
    const { result } = await f.configure(agent);
    for (const kind of ['human-dm', 'group-mention'] as const)
      f.core.sourcePolicy.setImmediateDelivery('ada', kind, 'turn', { kind: 'human' });
    await f.local();
    const first = await f.im();
    const second = await f.im();
    await f.startQueuedTurn();
    for (const id of [first, second])
      expect(f.core.runtime.bindPrivateInputOrigin?.(run.sessionId, id)?.current()).toBe(true);
    expect(f.core.runtime.bindPrivateInputOrigin?.(run.sessionId)).toBeUndefined();
    await expect(
      f.privateInputs.consume(agent, declaration.account, result.references, async () => 'batched'),
    ).resolves.toBe('batched');
  } finally {
    await f.close();
  }
});
