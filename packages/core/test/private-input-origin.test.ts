import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { readFile } from 'node:fs/promises';
import { setImmediate as tick } from 'node:timers/promises';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { join, resolve } from 'node:path';
import { createServer } from 'node:http';
import { expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import { createTempRoot } from './helpers.js';
import { mountPrivateInputs } from '../src/credentials/mount.js';
import { PrivateInputRefusal } from '../src/credentials/im-origin.js';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

const declaration = {
  account: 'synthetic-origin',
  purpose: 'Verify current turn authority',
  fields: [{ id: 'token', label: 'Token', required: true }],
};

async function fixture(mounted = false, platform: 'feishu' | 'qq' = 'feishu') {
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
  const steered: string[] = [];
  const core = createCore({
    dshHome: home,
    agents: {
      async runOrchestrator(run) {
        ready(run);
        await held;
      },
      steerOrchestrator(_botSlug, body) {
        steered.push(body);
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
  core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  const tools: ToolDefinition[] = [];
  let liveAgent: Agent | undefined;
  if (mounted) {
    ctx.provide('tools', { guard: () => () => {}, register: () => () => {} } as never);
    ctx.provide('agents', { get: () => liveAgent } as never);
    ctx.provide('sandbox', { confine: async (argv: string[]) => ({ argv }) } as never);
  }
  const privateInputs = mounted
    ? mountPrivateInputs(ctx, core, undefined, undefined, home)
    : new PrivateInputs({
        channels: core.channels,
        ownership: core.ownership,
        registry: core.registry,
        credentials: () => ctx.credentials,
        isLive: () => true,
        qualified: async () => true,
        canRequest: (agent, id) =>
          core.runtime.canRequestPrivateInput?.(agent.session.id, id) === true,
        origin: (agent, id) => core.runtime.bindPrivateInputOrigin?.(agent.session.id, id),
        notify: async () => {},
        replyAuthority: (bot, id, authority) =>
          core.externalMessaging.privateInputReplyAuthority(bot, id, authority),
        log: () => {},
      });
  const fingerprint = 'a'.repeat(64);
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  const replies: string[] = [];
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'synthetic-im', channel: platform }],
    listTargets: async () => [
      {
        targetId: 'team',
        name: 'Synthetic group',
        kind: 'group',
        route:
          platform === 'qq' ? { groupOpenId: 'synthetic-group' } : { chatId: 'synthetic-group' },
      },
    ],
    describeBot: async () => ({
      version: 1,
      botId: 'synthetic-im',
      channel: platform,
      connected: true,
      account: { fingerprint, name: 'Synthetic IM' },
      capabilities: [
        'proactive-text-checked',
        ...(platform === 'qq' ? ['ordinary-text-consumer' as const] : []),
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
    replyChecked: async (_account, route, text, options) => {
      if (options.beforeSend?.() === false) throw new Error('stale-route');
      replies.push(text);
      return {
        sent: true,
        receipt: { version: 1, messageId: 'synthetic-reply', conversationId: route.conversationId },
      };
    },
  };
  const providerId = 'dsh-im/' + platform;
  core.externalMessaging.register(createDshImProvider(transport, platform)!);
  const target = (await core.externalMessaging.targets(providerId, 'synthetic-im'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId,
    accountRef: 'synthetic-im',
    targetRef: 'team',
    fingerprint,
    targetDigest: target.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  let next = 0;
  return {
    home,
    core,
    privateInputs,
    grant,
    replies,
    steered,
    mount(agent: Agent) {
      liveAgent = agent;
      const root = new Context();
      root.provide('tools', {
        schemas: () => tools.map((tool) => ({ name: tool.name })),
        register: (tool: ToolDefinition) => {
          tools.push(tool);
          return () => {};
        },
      } as never);
      const scope = createScope(root, agent);
      core.runBotAgentSetups(scope.ctx, agent, { botSlug: 'ada', rootRole: 'orchestrator' });
      return {
        async call(name: string, args: Record<string, unknown>) {
          const tool = tools.find((candidate) => candidate.name === name);
          if (tool === undefined) throw new Error('Missing registered tool: ' + name);
          return tool.execute(args, { signal: new AbortController().signal } as ToolRunContext);
        },
        async close() {
          await scope.dispose();
          await root.fiber.dispose();
        },
      };
    },
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
    async local(body = 'Use the configured account') {
      const id = 'local-' + ++next;
      await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', {
        id,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body,
      });
      return core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
        channelId: 'dm-ada',
        messageId: id,
        body,
      });
    },
    async im(body = 'Use the configured account', mentioned = true) {
      const before = new Set(core.attention.list({ botSlug: 'ada' }).items.map((item) => item.id));
      const id = 'synthetic-' + ++next;
      await consumer!.onEvent(
        {
          version: 1,
          channel: platform,
          botId: 'synthetic-im',
          fingerprint,
          eventId: id,
          messageId: id,
          actor: { kind: 'user', id: 'synthetic-human' },
          conversation: { kind: 'group', id: 'synthetic-group' },
          mentions: mentioned ? [{ id: 'synthetic-bot', key: '@bot' }] : [],
          mentionedAccount: mentioned,
          at: new Date(Date.now() + 1000).toISOString(),
          text: mentioned ? '@bot ' + body : body,
          reply: { messageId: id, conversationId: 'synthetic-group', actorId: 'synthetic-human' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
        { signal: consumer!.signal },
      );
      await tick();
      const sources = core.attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.sourceKind === 'bridge-message');
      const source = sources.find((item) => !before.has(item.id));
      if (mentioned) expect(source).toBeDefined();
      return source?.id ?? '';
    },
    async configure(
      agent: Agent,
      request = declaration,
      values: Record<string, string> = { token: 'SYNTHETIC-2290' },
    ) {
      const waiting = privateInputs.ask(agent, request, new AbortController().signal);
      await vi.waitFor(() =>
        expect(core.channels.readMessages('dm-ada').some((m) => m.privateInputRequest)).toBe(true),
      );
      const card = core.channels.readMessages('dm-ada').find((m) => m.privateInputRequest)!;
      expect(
        await privateInputs.submit(true, {
          channelId: 'dm-ada',
          messageId: card.id,
          values,
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

it('reproduces a credential reuse miss and refuses repeat collection after cancellation in synthetic QQ', async () => {
  const f = await fixture(true, 'qq');
  let mounted: ReturnType<typeof f.mount> | undefined;
  try {
    await f.local();
    const run = await f.started();
    const agent = {
      id: run.sessionId,
      session: { id: run.sessionId, header: { cwd: f.home } },
    } as Agent;
    const tools = f.mount(agent);
    mounted = tools;
    await f.configure(agent);
    await f.nextTurn();
    const ordinaryBeforeRequest = await f.im('ordinary-before-request', false);
    const source = await f.im();
    await f.started();
    const request = {
      ...declaration,
      account: 'wrong-cloudflare-account',
      purpose: '复用已配置的 Cloudflare 凭据',
      source_event_id: source,
    };
    const cards = () =>
      f.core.channels
        .readMessages('dm-ada')
        .filter((message) => message.privateInputRequest?.account === request.account);

    const miss = JSON.parse((await mounted.call('ask_secret', request)) as string);
    expect(miss.status).toBe('not-found');
    expect(miss.account).toBe(request.account);
    expect(JSON.stringify(miss.accounts)).toBe(JSON.stringify([declaration.account]));
    expect(Object.keys(miss).sort().join(',')).toBe('account,accounts,message,status');
    expect(cards()).toHaveLength(0);
    expect(f.replies).toHaveLength(0);
    const listed = await mounted.call('list_secret_accounts', {});
    expect(listed).toBe(JSON.stringify({ accounts: [declaration.account] }));

    const collection = {
      ...request,
      mode: 'collect',
      purpose: '请填写新的 Cloudflare API 令牌以更新 DNS 记录。',
    };
    const ask = mounted.call('ask_secret', collection);
    await vi.waitFor(
      () => {
        expect(cards()).toHaveLength(1);
        expect(f.privateInputs.status('dm-ada', cards()[0]!.id)).toBe('pending');
        expect(f.replies).toHaveLength(1);
      },
      { timeout: 45_000 },
    );
    const card = cards()[0]!;
    expect(card.privateInputRequest?.purpose).toBe(collection.purpose);
    const ordinaryDefault = await f.im('ordinary-default', false);
    await f.core.externalMessaging.inbound.setPolicy(
      'ada',
      f.grant.id,
      { collection: 'all', wake: 'immediate', count: 1, intervalSeconds: 30 },
      { kind: 'human' },
    );
    const ordinaryWithCollection = await f.im('ordinary-with-collection', false);
    const ordinaryWithMention = await f.im('ordinary-with-mention');
    const channel = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...f.core });
    const sent = await channel.channelSend({ channelId: 'dm-ada', body: 'ordinary-app-chat' });
    const reply = await channel.channelSend({
      channelId: 'dm-ada',
      body: 'ordinary-app-reply',
      replyTo: card.id,
    });
    const ordinaryLocal = f.core.channels
      .readMessages('dm-ada')
      .find((message) => message.body === 'ordinary-app-chat');
    const cancelled = await f.privateInputs.cancel(true, 'dm-ada', card.id);
    const result = JSON.parse((await ask) as string);
    const privateInputRefusal = async (args: typeof collection) => {
      try {
        await tools.call('ask_secret', args);
      } catch (error) {
        if (error instanceof PrivateInputRefusal) return error.code;
        throw error;
      }
      throw new Error('Repeated request opened after cancellation');
    };
    const repeat = await privateInputRefusal(collection);
    expect(repeat).toBe('private-input-declined');
    expect(cards()).toHaveLength(1);
    expect(f.replies).toHaveLength(1);
    await f.nextTurn();
    const nextSource = await f.im('next-turn');
    await f.started();
    const later = await privateInputRefusal({
      ...collection,
      source_event_id: nextSource,
      purpose: '为 DNS 更新填写新的 Cloudflare API 令牌。',
    });
    expect(later).toBe('private-input-declined');
    expect(cards()).toHaveLength(1);
    expect(f.replies).toHaveLength(1);

    console.info('5097 synthetic QQ candidate', {
      lookupStatus: miss.status,
      lookupAccounts: miss.accounts,
      missOpenedCard: false,
      collectionOpenedCard: true,
      collectionPurpose: card.privateInputRequest?.purpose,
      ordinaryBeforeRequestAdmitted: ordinaryBeforeRequest !== '',
      ordinaryDefaultAdmitted: ordinaryDefault !== '',
      ordinaryWithCollectionAdmitted: ordinaryWithCollection !== '',
      ordinaryWithMentionAdmitted: ordinaryWithMention !== '',
      ordinaryAppMessageStored: ordinaryLocal !== undefined,
      ordinaryAppMessageIsPrivateInput:
        ordinaryLocal?.privateInputResolution !== undefined ||
        ordinaryLocal?.privateInputRequest !== undefined,
      ordinaryAppMessageSteered: f.steered.some((body) => body.includes('ordinary-app-chat')),
      acceptedAppSend: sent.ok,
      acceptedReplyToCard: reply.ok,
      ordinaryAppReplySteered: f.steered.some((body) => body.includes('ordinary-app-reply')),
      cancelled,
      toolStatus: result.status,
      repeatRefusal: repeat,
      nextTurnRefusal: later,
      repeatOpenedCard: false,
    });
    expect(cancelled).toBe(true);
    expect(result.status).toBe('cancelled');
  } finally {
    await mounted?.close();
    await f.close();
  }
}, 60_000);

it('keeps the cancellation cooldown when saving the cancelled resolution fails', async () => {
  const f = await fixture(true, 'qq');
  let mounted: ReturnType<typeof f.mount> | undefined;
  try {
    await f.local();
    const run = await f.started();
    const agent = {
      id: run.sessionId,
      session: { id: run.sessionId, header: { cwd: f.home } },
    } as Agent;
    mounted = f.mount(agent);
    await f.configure(agent);
    await f.nextTurn();
    const source = await f.im();
    await f.started();
    const collection = {
      ...declaration,
      account: 'new-cloudflare-account',
      purpose: '请填写新的 Cloudflare API 令牌以更新 DNS 记录。',
      source_event_id: source,
      mode: 'collect',
    };
    const cards = () =>
      f.core.channels
        .readMessages('dm-ada')
        .filter((message) => message.privateInputRequest?.account === collection.account);
    const ask = mounted.call('ask_secret', collection);
    await vi.waitFor(() => expect(cards()).toHaveLength(1), { timeout: 45_000 });
    const append = f.core.channels.appendMessageOnce.bind(f.core.channels);
    const save = vi
      .spyOn(f.core.channels, 'appendMessageOnce')
      .mockImplementation((...args: Parameters<typeof append>) =>
        args[2].privateInputResolution === undefined
          ? append(...args)
          : Promise.reject(new Error('disk full')),
      );
    try {
      await f.privateInputs.cancel(true, 'dm-ada', cards()[0]!.id);
      expect(JSON.parse((await ask) as string).status).toBe('expired');
    } finally {
      save.mockRestore();
    }
    const repeat = await mounted.call('ask_secret', collection).then(
      () => 'opened',
      (error: unknown) => (error instanceof PrivateInputRefusal ? error.code : String(error)),
    );
    expect(repeat).toBe('private-input-declined');
    expect(cards()).toHaveLength(1);
  } finally {
    await mounted?.close();
    await f.close();
  }
}, 60_000);

it('opens an IM-started card in Web Chat and accepts the Owner key without a configured Web URL', async () => {
  const f = await fixture(true);
  let mounted: ReturnType<typeof f.mount> | undefined;
  try {
    const source = await f.im();
    const run = await f.started();
    const agent = {
      id: run.sessionId,
      session: { id: run.sessionId, header: { cwd: f.home } },
    } as Agent;
    mounted = f.mount(agent);
    const asked = mounted.call('ask_secret', {
      ...declaration,
      source_event_id: source,
      mode: 'collect',
    });
    await vi.waitFor(() =>
      expect(f.core.channels.readMessages('dm-ada').some((m) => m.privateInputRequest)).toBe(true),
    );
    const card = f.core.channels.readMessages('dm-ada').find((m) => m.privateInputRequest)!;
    await vi.waitFor(() => expect(f.replies).toHaveLength(1));
    expect(f.replies[0]).toContain('Owner action needed');
    expect(f.replies[0]).not.toContain('#botharness-private-input=');
    expect(f.privateInputs.status('dm-ada', card.id)).toBe('pending');
    expect(
      await f.privateInputs.submit(true, {
        channelId: 'dm-ada',
        messageId: card.id,
        values: { token: 'SYNTHETIC-3340' },
      }),
    ).toBe(true);
    const result = JSON.parse((await asked) as string);
    expect(result).toMatchObject({ status: 'configured', account: declaration.account });
    await expect(
      f.privateInputs.consume(agent, declaration.account, result.references, async (values) =>
        values.token === 'SYNTHETIC-3340' ? 'authenticated' : 'refused',
      ),
    ).resolves.toBe('authenticated');
    expect(JSON.stringify([f.replies, f.core.channels.readMessages('dm-ada')])).not.toContain(
      'SYNTHETIC-3340',
    );
  } finally {
    await mounted?.close();
    await f.close();
  }
});

it('recovers a registered secret_cli multi-IM refusal by selecting the configured account source without a Web notice', async () => {
  const f = await fixture(true);
  let mounted: ReturnType<typeof f.mount> | undefined;
  try {
    await f.local();
    const run = await f.started();
    const agent = {
      id: run.sessionId,
      session: { id: run.sessionId, header: { cwd: f.home } },
    } as Agent;
    mounted = f.mount(agent);
    const { result } = await f.configure(agent);
    await f.nextTurn();
    const source = await f.im();
    await f.started();
    await f.im();
    const marker = join(f.home, 'command-starts.txt');
    const args = {
      account: declaration.account,
      references: Object.values(result.references),
      program: 'git',
      args: ['config', '--file', marker, '--add', 'qa.started', 'once'],
      env: [{ name: 'GH_TOKEN', value: '{{token}}' }],
    };
    await expect(mounted.call('secret_cli', args)).rejects.toMatchObject({
      code: 'private-source-required',
      message: expect.stringContaining('ask_secret'),
    });
    await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const cards = f.core.channels
      .readMessages('dm-ada')
      .filter((message) => message.privateInputRequest).length;
    await expect(
      mounted.call('ask_secret', { ...declaration, source_event_id: source }),
    ).resolves.toContain('configured');
    await expect(mounted.call('secret_cli', args)).resolves.toContain('"exitCode":0');
    expect((await readFile(marker, 'utf8')).match(/started = once/g)).toHaveLength(1);
    expect(
      f.core.channels.readMessages('dm-ada').filter((message) => message.privateInputRequest),
    ).toHaveLength(cards);
  } finally {
    await mounted?.close();
    await f.close();
  }
});

it.each(['secret_http', 'protected_cli', 'secret_mcp_connect'])(
  'recovers the registered %s consumer without issuing duplicate external requests',
  async (name) => {
    let requests = 0;
    const server = createServer((request, response) => {
      expect(request.headers['x-api-key']).toBe('SYNTHETIC-key');
      expect(request.headers['x-api-secret']).toBe('SYNTHETIC-secret');
      requests++;
      response.end('ok');
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing test endpoint');
    const f = await fixture(true);
    let mounted: ReturnType<typeof f.mount> | undefined;
    try {
      await f.local();
      const run = await f.started();
      const agent = {
        id: run.sessionId,
        session: { id: run.sessionId, header: { cwd: f.home } },
      } as Agent;
      mounted = f.mount(agent);
      const request = {
        ...declaration,
        fields: ['endpoint', 'api_key', 'api_secret'].map((id) => ({
          id,
          label: id,
          required: true,
        })),
      };
      const { result } = await f.configure(agent, request, {
        endpoint: `http://127.0.0.1:${address.port}`,
        api_key: 'SYNTHETIC-key',
        api_secret: 'SYNTHETIC-secret',
      });
      await f.nextTurn();
      const source = await f.im();
      await f.started();
      await f.im();
      const common = { account: declaration.account, references: Object.values(result.references) };
      const args =
        name === 'secret_http'
          ? {
              ...common,
              method: 'GET',
              path: '',
              headers: [
                { name: 'x-api-key', value: '{{api_key}}' },
                { name: 'x-api-secret', value: '{{api_secret}}' },
              ],
            }
          : name === 'protected_cli'
            ? { account: declaration.account, consumer: 'http-status-v1', ...result.references }
            : {
                ...common,
                server_name: 'originqa',
                program: 'node',
                args: [resolve('scripts/secret-mcp-fixture.mjs')],
                env: [
                  { name: 'STATUS_ENDPOINT', value: '{{endpoint}}' },
                  { name: 'STATUS_API_KEY', value: '{{api_key}}' },
                  { name: 'STATUS_API_SECRET', value: '{{api_secret}}' },
                ],
              };
      await expect(mounted.call(name, args)).rejects.toMatchObject({
        code: 'private-source-required',
      });
      expect(requests).toBe(0);
      await expect(
        mounted.call('ask_secret', { ...request, source_event_id: source }),
      ).resolves.toContain('configured');
      const value = await mounted.call(name, args);
      expect(value).not.toContain('SYNTHETIC-key');
      if (name === 'secret_mcp_connect') {
        expect(value).toContain('"connected":true');
        await mounted.call('mcp__originqa__check_status', {});
        await mounted.call('secret_mcp_disconnect', { server_name: 'originqa' });
      } else expect(value).toContain('200');
      expect(requests).toBe(1);
    } finally {
      await mounted?.close();
      await f.close();
      server.closeAllConnections();
      await new Promise<void>((done) => server.close(() => done()));
    }
  },
);

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
    expect(await approvals.decide(OWNER_HUMAN_CONTEXT, 'ada', card.messageId, 'allowed-once')).toBe(
      true,
    );
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
    ).rejects.toMatchObject({ code: 'private-account-unavailable' });
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
    const group = f.core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Synthetic local group',
      members: ['ada'],
    });
    await f.core.channels.appendMessage(OWNER_HUMAN_CONTEXT, group.id, {
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
    await f.core.channels.appendMessage(OWNER_HUMAN_CONTEXT, 'dm-ada', {
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

it('a turn started by a bridged IM message asks for tool approval in the Bot DM', async () => {
  const f = await fixture(true);
  try {
    await f.im();
    const run = await f.started();
    expect(
      f.core.runtime.toolApprovalOrigin?.({
        sessionId: SessionId(run.sessionId),
        callId: ToolCallId('call'),
      }),
    ).toEqual({
      kind: 'turn',
      channelId: 'dm-ada',
    });
    expect(
      f.core.runtime.toolApprovalOrigin?.({
        sessionId: SessionId('other-session'),
        callId: ToolCallId('call'),
      }),
    ).toBeUndefined();
  } finally {
    await f.close();
  }
});
