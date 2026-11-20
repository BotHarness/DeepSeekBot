import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { AgentRegistry } from '@deepseek-ai/dsh-agent';
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop';
import {
  createUserMessage,
  LlmAdapter,
  LlmError,
  LlmRuntime,
  ToolCallId,
  type GenerateOptions,
  type StreamChunk,
} from '@deepseek-ai/dsh-llm';
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { afterEach, expect, it, vi } from 'vitest';

import { dmChannelId } from '../src/channels/channel.js';
import { createEngineGateway } from '../src/engines/engine-gateway.js';
import { EngineHost } from '../src/engines/engine-host.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createGroupFallback } from '../src/models/group-fallback.js';
import { createRouteRests } from '../src/models/route-rest.js';
import type { RoutingGroupMember } from '../src/models/routing-groups.js';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { engineWorkspaceMode } from '../src/workspaces/grant-execution.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { claudeReplay, readClaudeRecording } from './fixtures/claude-replay.js';
import { codexReplay, readCodexRecording, type CodexReplay } from './fixtures/codex-replay.js';
import { memoryDsh } from './fixtures/engine-dsh.js';
import { executeFixtureNativeTool } from './fixtures/native-tools.js';
import { createTempRoot } from './helpers.js';

const START = 1_795_010_000_000;
const RESETS_AT = new Date(1_795_027_200_000).toISOString();
const API = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
const CODEX = { kind: 'engine', engine: 'codex', model: 'gpt-6-astra' } as const;
const CLAUDE = { kind: 'engine', engine: 'claude', model: 'claude-opus-5-5' } as const;
const LIMIT = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-limit-turn.jsonl'));
const CODEX_DM = readCodexRecording(join(import.meta.dirname, 'fixtures', 'codex-dm-turn.jsonl'));
const CLAUDE_REPLY = readClaudeRecording(
  join(import.meta.dirname, 'fixtures', 'claude-dm-turn.jsonl'),
).filter(
  (line) =>
    line.kind === 'account' ||
    line.kind === 'await-input' ||
    (line.kind === 'message' && ['system', 'result'].includes(String(line.msg['type']))),
);
const CLAUDE_LIMIT: typeof CLAUDE_REPLY = [
  ...CLAUDE_REPLY.slice(0, -1),
  {
    kind: 'message',
    msg: {
      type: 'rate_limit_event',
      rate_limit_info: { status: 'rejected', resetsAt: Date.parse(RESETS_AT) / 1000 + 60 },
    },
  },
  { kind: 'message', msg: { type: 'result', subtype: 'error_during_execution', is_error: true } },
];

function limitAfter(tool: 'channel_read' | 'bot_send_message'): typeof LIMIT {
  const lines = CODEX_DM.flatMap((line) => {
    const params = line.msg['params'];
    if (params === null || typeof params !== 'object' || !('item' in params)) return [];
    const item = params.item;
    if (item === null || typeof item !== 'object' || !('tool' in item) || item.tool !== tool)
      return [];
    return tool === 'bot_send_message'
      ? [
          {
            ...line,
            msg: {
              ...line.msg,
              params: {
                ...params,
                item: {
                  ...item,
                  arguments: { body: 'Hello from Codex', channel_id: dmChannelId('ada') },
                },
              },
            },
          },
        ]
      : [line];
  });
  const firstLimit = LIMIT.findIndex((line) => line.msg['method'] === 'account/rateLimits/updated');
  return [...LIMIT.slice(0, firstLimit), ...lines, ...LIMIT.slice(firstLimit)];
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

class NativeReplay extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];

  constructor(private readonly hitQuota: boolean) {
    super();
  }

  override async resolveModel(provider: string, id: string) {
    return { provider, id, name: id, context: { contextWindow: 200_000 } };
  }

  override async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    this.requests.push(options);
    if (this.hitQuota && this.requests.length === 2)
      throw new LlmError('Fixture quota', 'QUOTA_EXHAUSTED');
    if (this.requests.length > 1) {
      yield { type: 'finish', reason: { kind: 'stop' } };
      return;
    }
    const block = {
      type: 'tool-call' as const,
      id: ToolCallId('native-read'),
      name: 'channel_read',
      arguments: JSON.stringify({ channel_id: dmChannelId('ada') }),
    };
    yield { type: 'block-start', index: 0, blockType: block.type };
    yield { type: 'block-end', index: 0, block };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}

async function nativeRuntime(model: NativeReplay, beforeWriterClose?: () => Promise<void>) {
  const ctx = new Context();
  cleanups.push(() => ctx.fiber.dispose());
  await ctx.plugin(LlmRuntime).await();
  ctx.get('llm')!.registerAdapter([API.provider], model);
  const store = new SessionStore(ctx);
  const dsh = memoryDsh();
  const persistence = {
    ...dsh.persistence,
    create: async (...args: Parameters<typeof dsh.persistence.create>) => {
      const handle = await dsh.persistence.create(...args);
      return {
        ...handle,
        close: async () => {
          await beforeWriterClose?.();
          await handle.close();
        },
      };
    },
  };
  ctx.provide('sessionPersistence', persistence as never);
  ctx.on(
    'session/event',
    (session, event) => {
      const entry = dsh.stored.get(session.id);
      if (entry === undefined || entry.events.length !== Number(event.seq))
        throw new Error('The replay expects one writer with a contiguous Session log');
      entry.events.push(structuredClone(event));
    },
    { global: true },
  );
  await ctx.plugin(SystemPrompt, {}).await();
  new SessionProjectionRegistry(ctx);
  await ctx.plugin(AgentRegistry).await();
  await ctx.plugin(ToolRuntime, {}).await();
  await ctx.plugin(AgentLoop, {}).await();
  return {
    ctx,
    agents: ctx.agents,
    dsh: { ...dsh, store },
    releaseNativeAgent: (agent: Parameters<typeof ctx.agentLoop.releaseIdleAgent>[0]) =>
      ctx.agentLoop.releaseIdleAgent(agent),
  };
}

const CODEX_REPLY = CODEX_DM.map((line) => {
  const params = line.msg['params'];
  if (params === null || typeof params !== 'object' || !('item' in params)) return line;
  const item = params.item;
  if (
    item === null ||
    typeof item !== 'object' ||
    !('tool' in item) ||
    item.tool !== 'bot_send_message'
  )
    return line;
  return {
    ...line,
    msg: {
      ...line.msg,
      params: {
        ...params,
        item: { ...item, arguments: { body: 'Hello from Codex', channel_id: dmChannelId('ada') } },
      },
    },
  };
});

function setup(options: {
  members: RoutingGroupMember[];
  allowed?: (route: typeof API) => void;
  enginesAllowed?: boolean;
  codexRecording?: typeof LIMIT;
  claudeRecording?: typeof CLAUDE_REPLY;
  nativeReply?: string;
  beforeEngineLimit?(engine: string, clock: { now: number }): void;
  inherited?: boolean;
  nativeFirst?: boolean;
  nativeRuntime?: Pick<
    Awaited<ReturnType<typeof nativeRuntime>>,
    'agents' | 'dsh' | 'releaseNativeAgent'
  >;
  beforeNativeHandle?(sessionId: string, cwd: string): Promise<void>;
}) {
  const clock = { now: START };
  const root = createTempRoot('routing-group-engine-');
  const workspace = {
    id: 'project',
    path: createTempRoot('routing-group-granted-workspace-'),
    title: 'Fixture',
    status: async () => 'ok' as const,
  };
  const dsh = options.nativeRuntime?.dsh ?? memoryDsh();
  const replies = vi.fn();
  const native = new FakeAgentHost(undefined, {
    restoreSession: (id) =>
      (dsh.stored.get(id)?.events ?? []).map((event) => ({
        ...event,
        seq: Number(event.seq),
      })),
    onTurn: async (_session, tools) => {
      if (options.nativeReply === undefined) return;
      replies(
        await executeFixtureNativeTool(
          {
            name: 'bot_send_message',
            arguments: { body: options.nativeReply, channel_id: dmChannelId('ada') },
            callId: ToolCallId('native-reply'),
            signal: new AbortController().signal,
          },
          tools,
          [],
        ),
      );
    },
  });
  const gateway = createEngineGateway();
  const codex: CodexReplay[] = [];
  const claude = claudeReplay([options.claudeRecording ?? CLAUDE_REPLY]);
  const host = new EngineHost({
    root: join(root, 'engines'),
    local: true,
    gateway,
    now: () => clock.now,
    sessions: () => dsh.store,
    persistence: () => dsh.persistence,
    openCodex: (params) => {
      const replay = codexReplay(options.codexRecording ?? LIMIT, params);
      codex.push(replay);
      return replay.transport;
    },
    claudeCommand: process.execPath,
    detectClaude: async () => ({ installed: true, version: '2.1.327', login: 'subscription' }),
    openClaude: claude.factory,
  });
  const routeRests = createRouteRests({ now: () => clock.now });
  const groupFallback = createGroupFallback({
    plan: (slug) => core.registry.get(slug)?.modelPlan,
    inheritedGroup: (): string | undefined => core.routingGroups.defaultGroup().groupId,
    routes: (id): (typeof API)[] => core.routingGroups.routes(id),
    engines: {
      targets: (id) => core.routingGroups.targets(id),
      canRoute: (slug) => host.engineFor(slug) === undefined,
      allowed: () => options.enginesAllowed ?? true,
      limit: (engine) => {
        options.beforeEngineLimit?.(engine, clock);
        return host.limit(engine);
      },
    },
    rests: routeRests,
    requireAllowed: (_slug, route) => options.allowed?.(route),
    validate: async () => undefined,
  });
  const memoryDirectory = join(root, 'memory', 'ada');
  const prepareModelRoute = vi.fn(async () => {
    const id = core.runtime.currentOrchestratorSessionId?.('ada');
    if (id !== undefined) await options.beforeNativeHandle?.(id, memoryDirectory);
  });
  const adapter = createDshBotAgentAdapter({
    agents: options.nativeRuntime?.agents ?? native,
    ...(options.nativeRuntime === undefined
      ? {}
      : { releaseNativeAgent: options.nativeRuntime.releaseNativeAgent }),
    engines: host,
    engineWorkspaceMode: (slug): ReturnType<typeof engineWorkspaceMode> =>
      engineWorkspaceMode(core, slug),
    orchestratorCwd: () => memoryDirectory,
    ensureWorkspace: () => {},
    prepareModelRoute,
    observeTurnFailure: (provider, code) => {
      if (provider === API.provider && code === 'QUOTA_EXHAUSTED')
        routeRests.rest(API, clock.now + 1_000, 'quota');
    },
    hasSession: async (id) =>
      dsh.stored.has(id) || native.sessions.some((session) => session.id === id),
    defaultModel: { currentSelection: () => API },
    orchestratorRoute: (id) => groupFallback.route(id),
  });
  const core = createCore({
    dshHome: root,
    agents: adapter,
    workspaces: () => ({
      get: (id) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    }),
    groupFallback,
    routeRests,
    sessionRoute: (_slug, id) => groupFallback.route(id) ?? adapter.modelSelection(id) ?? API,
  });
  cleanups.push(async () => {
    await core.runtime.close();
    await host.close();
    await gateway.close();
    core.operationalDatabase.close();
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const nativeMember = { kind: 'model', ...API } as const;
  const group = core.routingGroups.create({
    name: 'Fallback',
    members: options.nativeFirst
      ? [nativeMember, ...options.members]
      : [...options.members, nativeMember],
  });
  if (options.inherited) core.routingGroups.setDefaultGroup(group.id, 0);
  else expect(core.registry.customizeModelPlan('ada', API, 0, group.id).ok).toBe(true);
  const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
  async function message(id: string, body: string) {
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channel.id, {
      id,
      at: new Date(clock.now).toISOString(),
      author: { kind: 'human' },
      body,
    });
    core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
      channelId: channel.id,
      messageId: id,
      body,
    });
    await core.runtime.whenIdle();
  }
  return {
    host,
    adapter,
    dsh,
    codex,
    claude,
    native,
    clock,
    routeRests,
    prepareModelRoute,
    replies,
    memoryDirectory,
    grantWorkspace: () => core.grants.create('ada', workspace.id),
    message,
    sessionId: () => core.runtime.currentOrchestratorSessionId?.('ada')!,
    channelMessages: () => core.channels.readMessages(channel.id),
    sendStatus: (messageId: string) => core.channels.humanSendStatus?.(channel.id, messageId),
    held: () => core.runtime.heldCause?.('ada'),
  };
}

it('continues a native quota turn on an engine, then resumes DSH on the same Session', async () => {
  const model = new NativeReplay(true);
  const writerClosing = vi.fn();
  let allowClose!: () => void;
  const release = new Promise<void>((resolve) => {
    allowClose = resolve;
  });
  const runtime = await nativeRuntime(model, async () => {
    writerClosing();
    await release;
  });
  const { ctx, dsh } = runtime;
  const bot = setup({
    members: [CODEX],
    nativeFirst: true,
    codexRecording: CODEX_REPLY,
    nativeRuntime: runtime,
    beforeNativeHandle: async (id, cwd) => {
      if (dsh.stored.has(id)) return;
      await ctx.agents.create({ sessionId: SessionId(id), meta: { cwd }, agentOptions: API });
    },
  });
  expect(await bot.grantWorkspace()).toMatchObject({ orchestratorWrite: false });
  const first = bot.message('first', 'Read the DM before replying. My lucky word is orchid.');
  try {
    await vi.waitFor(() => expect(writerClosing).toHaveBeenCalledTimes(1));
    const old = ctx.agents.get(SessionId(bot.sessionId()));
    expect(old).toBeDefined();
    expect(bot.adapter.steerOrchestrator?.('ada', 'Arrived during the handoff')).toBe(false);
    expect(() =>
      old?.followup(
        createUserMessage({
          content: [{ type: 'text', text: 'Native concurrent input' }],
          source: { kind: 'user' },
        }),
      ),
    ).toThrow('releasing its Session');
    expect(bot.codex).toHaveLength(0);
  } finally {
    allowClose();
    await first;
  }
  const id = bot.sessionId();
  expect(bot.channelMessages().flatMap((message) => message.sessionFailure ?? [])).toEqual([]);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { sandbox: 'read-only', approvalPolicy: 'never' },
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: {
      input: [
        {
          text: expect.stringMatching(
            /Tool result \(native-read\)[\s\S]+orchid[\s\S]+Continue from where you stopped/u,
          ),
        },
      ],
      sandboxPolicy: { type: 'readOnly', networkAccess: false },
      approvalPolicy: 'never',
    },
  });
  expect(ctx.agents.get(SessionId(id))).toBeUndefined();
  expect(bot.host.isLive(id)).toBe(true);
  expect(bot.channelMessages().filter((message) => message.modelSwitch)).toMatchObject([
    { modelSwitch: { sessionId: id, from: API, to: { provider: 'codex' } } },
  ]);

  bot.clock.now += 1_001;
  await bot.message('second', 'Continue on DSH');
  expect(bot.sessionId()).toBe(id);
  expect(bot.host.isLive(id)).toBe(false);
  expect(ctx.agents.get(SessionId(id))?.session).toBe(dsh.store.get(SessionId(id)));
  expect(model.requests[2]?.messages).toContainEqual(
    expect.objectContaining({
      role: 'assistant',
      content: expect.arrayContaining([{ type: 'text', text: 'I replied in the DM.' }]),
    }),
  );
  expect(
    dsh.stored
      .get(id)
      ?.events.flatMap((event) => (event.type === 'turn/start' ? [event.data.turn] : [])),
  ).toEqual([1, 2, 3]);
});

it('keeps the manual engine use switch working after a native turn', async () => {
  const model = new NativeReplay(false);
  const runtime = await nativeRuntime(model);
  const { ctx } = runtime;
  const bot = setup({ members: [], codexRecording: CODEX_REPLY, nativeRuntime: runtime });
  await bot.message('first', 'Remember orchid');
  const id = bot.sessionId();
  expect(ctx.agents.get(SessionId(id))).toBeDefined();

  bot.host.use('ada', 'orchestrator', 'codex');
  await bot.message('second', 'Use the selected engine');
  expect(bot.sessionId()).toBe(id);
  expect(bot.sendStatus('second')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
  expect(ctx.agents.get(SessionId(id))).toBeUndefined();

  bot.host.use('ada', 'orchestrator', undefined);
  await bot.message('third', 'Return to DSH');
  expect(bot.sessionId()).toBe(id);
  expect(ctx.agents.get(SessionId(id))).toBeDefined();
  expect(model.requests[2]?.messages).toContainEqual(
    expect.objectContaining({
      role: 'assistant',
      content: expect.arrayContaining([{ type: 'text', text: 'I replied in the DM.' }]),
    }),
  );
});

it('answers the first Human message on DSH when the engine hits quota before output', async () => {
  const bot = setup({ members: [CODEX], nativeReply: 'Orchid noted.' });
  await bot.message('first', 'My lucky word is orchid');
  const sessionId = bot.sessionId();
  expect(bot.codex).toHaveLength(1);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { model: CODEX.model },
  });
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.native.received.get(sessionId)?.[0]?.content).toContainEqual({
    type: 'text',
    text: expect.stringContaining('Continue from where you stopped'),
  });
  expect(bot.held()).toBeUndefined();
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Orchid noted.' }],
  });
  expect(
    bot.channelMessages().filter((message) => message.turnStop || message.sessionFailure),
  ).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.modelSwitch)).toMatchObject([
    { modelSwitch: { sessionId, from: { provider: 'codex' }, to: API, until: RESETS_AT } },
  ]);
  expect(bot.dsh.stored.get(sessionId)?.header.cwd).toBe(bot.memoryDirectory);
  expect(bot.codex[0]?.closed).toBe(true);
  expect(bot.prepareModelRoute).toHaveBeenCalledExactlyOnceWith('ada', 'orchestrator', API);
  expect(bot.host.store.selections()).toEqual([]);
  expect(bot.host.quota('codex')?.limitedUntil).toBe(RESETS_AT);
});

it('passes the model and effort to a mixed-group engine before falling back to DSH', async () => {
  const member = { ...CODEX, reasoningEffort: 'high' };
  const bot = setup({ members: [member], nativeReply: 'Orchid noted.' });

  await bot.message('with-effort', 'My lucky word is orchid');

  expect(bot.codex).toHaveLength(1);
  expect(bot.codex[0]?.mismatches).toEqual([]);
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { model: member.model },
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: { model: member.model, effort: member.reasoningEffort },
  });
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: bot.sessionId(), agentOptions: API },
  ]);
  expect(bot.sendStatus('with-effort')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Orchid noted.' }],
  });
});

it('continues from the completed engine tool call and result in the same DSH Session', async () => {
  const bot = setup({
    members: [CODEX],
    codexRecording: limitAfter('channel_read'),
    nativeReply: 'I used the Channel read.',
  });
  await bot.message('first', 'Read the Channel before replying');
  const sessionId = bot.sessionId();
  expect(bot.codex[0]?.gatewayCalls.map((call) => call.tool)).toEqual(['channel_read']);
  const events = bot.native.sessions.find((session) => session.id === sessionId)?.snapshotEvents();
  expect(events?.filter((event) => event.type === 'tool/result')).toMatchObject([
    {
      data: {
        message: {
          toolCallId: 'item-mcp-read',
          content: [
            { type: 'text', text: expect.stringContaining('Read the Channel before replying') },
          ],
        },
      },
    },
  ]);
  expect(bot.native.received.get(sessionId)?.[0]?.content).not.toContainEqual({
    type: 'text',
    text: expect.stringContaining('Read the Channel before replying'),
  });
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'I used the Channel read.' }],
  });
});

it('carries Session context through Codex to Claude Code to DSH in the same turn chain', async () => {
  const bot = setup({
    members: [CODEX, CLAUDE],
    codexRecording: limitAfter('channel_read'),
    claudeRecording: CLAUDE_LIMIT,
    nativeReply: 'The lucky word is orchid.',
  });
  await bot.message('first', 'My lucky word is orchid');
  const sessionId = bot.sessionId();
  expect(bot.claude.options).toMatchObject([{ model: CLAUDE.model }]);
  expect(bot.claude.prompts).toEqual([
    expect.stringMatching(
      /My lucky word is orchid[\s\S]+Tool result \(item-mcp-read\)[\s\S]+Current input:[\s\S]+Continue from where you stopped/u,
    ),
  ]);
  expect([...bot.dsh.stored.keys()]).toEqual([sessionId]);
  expect(
    bot.dsh.stored
      .get(sessionId)
      ?.events.filter((event) => event.type === 'turn/start')
      .map((event) => event.data.turn),
  ).toEqual([1, 2]);
  expect(bot.native.createOptions).toEqual([]);
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'The lucky word is orchid.' }],
  });
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
  expect(
    bot
      .channelMessages()
      .filter((message) => message.modelSwitch)
      .reverse(),
  ).toMatchObject([
    { modelSwitch: { sessionId, from: { provider: 'codex' }, to: { provider: 'claude' } } },
    { modelSwitch: { sessionId, from: { provider: 'claude' }, to: API } },
  ]);
});

it('starts mixed-group engines in read-only mode across quota continuation', async () => {
  const bot = setup({ members: [CODEX, CLAUDE] });
  expect(await bot.grantWorkspace()).toMatchObject({ orchestratorWrite: false });

  await bot.message('first', 'Check the granted workspace');

  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'thread/start')).toMatchObject({
    params: { sandbox: 'read-only', approvalPolicy: 'never' },
  });
  expect(bot.codex[0]?.sent.find((request) => request['method'] === 'turn/start')).toMatchObject({
    params: { sandboxPolicy: { type: 'readOnly', networkAccess: false }, approvalPolicy: 'never' },
  });
  expect(bot.claude.options).toMatchObject([
    {
      model: CLAUDE.model,
      permissionMode: 'default',
      tools: ['Read', 'Glob', 'Grep'],
      disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'PowerShell'],
    },
  ]);
  expect(bot.claude.prompts).toEqual([expect.stringContaining('Check the granted workspace')]);
});

it('blocks a second reply when the engine delivered one before quota', async () => {
  const bot = setup({
    members: [CODEX],
    codexRecording: limitAfter('bot_send_message'),
    nativeReply: 'Duplicate reply from DSH',
  });
  await bot.message('first', 'Please say hello');
  expect(bot.codex[0]?.gatewayCalls.map((call) => call.tool)).toEqual(['bot_send_message']);
  expect(bot.native.received.get(bot.sessionId())?.[0]?.content).toContainEqual({
    type: 'text',
    text: expect.stringContaining('already delivered a reply'),
  });
  expect(bot.replies).toHaveBeenCalledWith(expect.objectContaining({ isError: true }));
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Hello from Codex' }],
  });
});

it('does not revisit an engine whose rest ends during the same quota chain', async () => {
  const bot = setup({
    members: [CODEX, { ...CODEX, model: 'gpt-6-mini' }, CLAUDE],
    claudeRecording: CLAUDE_LIMIT,
    beforeEngineLimit: (engine, clock) => {
      if (engine === 'claude') clock.now = Date.parse(RESETS_AT) + 1;
    },
    nativeReply: 'Finished without looping.',
  });
  await bot.message('first', 'Continue when limits change');
  expect(bot.codex).toHaveLength(1);
  expect(bot.claude.prompts).toHaveLength(1);
  expect(bot.sendStatus('first')).toMatchObject({
    state: 'handled',
    replies: [{ body: 'Finished without looping.' }],
  });
});

it('posts one limit card when every target rests and retries the first available target after reset', async () => {
  const bot = setup({ members: [CODEX] });
  const apiReset = START + 90_000;
  bot.routeRests.rest(API, apiReset, 'quota');
  await bot.message('first', 'Use the first target');
  const sessionId = bot.sessionId();
  expect(bot.held()).toBe('quota');
  expect(bot.channelMessages().filter((message) => message.turnStop)).toMatchObject([
    {
      turnStop: {
        sessionId,
        cause: 'quota',
        routingGroup: true,
        engine: { engine: 'codex', account: 'ChatGPT pro', until: RESETS_AT },
        rests: [
          { ...API, until: new Date(apiReset).toISOString() },
          { provider: 'codex', model: 'ChatGPT pro', until: RESETS_AT },
        ],
      },
    },
  ]);
  expect(
    bot.channelMessages().filter((message) => message.modelSwitch || message.sessionFailure),
  ).toEqual([]);
  expect(bot.native.resumeOptions).toEqual([]);
  bot.clock.now = apiReset + 1;
  await bot.message('second', 'Use whichever target recovered');
  expect(bot.native.resumeOptions).toMatchObject([
    { resumeSessionId: sessionId, agentOptions: API },
  ]);
  expect(bot.held()).toBeUndefined();
  expect(bot.codex).toHaveLength(1);
});

it('keeps an explicit engine selection in charge of a Bot with a mixed group', async () => {
  const bot = setup({ members: [CODEX, CLAUDE] });
  bot.routeRests.rest(API, START + 90_000, 'quota');
  bot.host.use('ada', 'orchestrator', 'claude', { model: CLAUDE.model });
  await bot.message('first', 'Explicit engine');
  expect(bot.codex).toEqual([]);
  expect(bot.claude.prompts).toEqual([expect.stringContaining('Explicit engine')]);
  expect(bot.host.store.selections()).toMatchObject([{ engine: 'claude', role: 'orchestrator' }]);
});

it('does not show a limit card for a DSH candidate that is unavailable without resting', async () => {
  const bot = setup({
    members: [CODEX],
    allowed: () => {
      throw new Error('Not allowed');
    },
  });
  await bot.message('first', 'Exhaust Codex');
  expect(bot.held()).toBeUndefined();
  expect(bot.native.resumeOptions).toEqual([]);
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
  expect(
    bot.channelMessages().find((message) => message.sessionFailure)?.sessionFailure,
  ).toMatchObject({ code: 'ROUTING_GROUP_UNAVAILABLE' });
});

it('skips engines for a role limited to explicitly allowed DSH models', async () => {
  const bot = setup({ members: [CODEX], enginesAllowed: false });
  await bot.message('first', 'Use an allowed model');
  expect(bot.native.createOptions).toMatchObject([{ agentOptions: API }]);
  expect(bot.codex).toEqual([]);
});

it('applies the default quota rest when Codex has no reset time', async () => {
  const recording = LIMIT.filter((line) => line.msg['method'] !== 'account/rateLimits/updated');
  const bot = setup({ members: [CODEX], codexRecording: recording });
  await bot.message('first', 'Use Codex');
  expect(bot.host.quota('codex')?.limitedUntil).toBe(new Date(START + 3_600_000).toISOString());
  expect(bot.channelMessages().filter((message) => message.turnStop)).toEqual([]);
});

it('continues using the existing ordered DSH-only default group', async () => {
  const fallbackRoute = { provider: 'next', model: 'ready' };
  const bot = setup({ members: [{ kind: 'model', ...fallbackRoute }], inherited: true });
  await bot.message('first', 'Use a DSH model');
  expect(bot.native.createOptions).toMatchObject([{ agentOptions: fallbackRoute }]);
  expect(bot.codex).toEqual([]);
  expect(bot.claude.prompts).toEqual([]);
});
