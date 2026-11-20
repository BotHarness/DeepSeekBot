import { summarizeSessionTranscript } from '../../src/runtime/session-transcript.js';
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
import { afterEach, expect, vi, type Mock } from 'vitest';

import { dmChannelId } from '../../src/channels/channel.js';
import { attachOperationalModule } from '../../src/database/owner.js';
import { createEngineGateway } from '../../src/engines/engine-gateway.js';
import { EngineHost } from '../../src/engines/engine-host.js';
import { OWNER_HUMAN_CONTEXT } from '../../src/humans/context.js';
import { createGroupFallback } from '../../src/models/group-fallback.js';
import { createRouteRests } from '../../src/models/route-rest.js';
import type { RoutingGroupMember } from '../../src/models/routing-groups.js';
import { createCore } from '../../src/plugin.js';
import { createDshBotAgentAdapter } from '../../src/runtime/dsh-bot-agent-adapter.js';
import { readTurnTargets } from '../../src/runtime/turn-targets.js';
import { engineWorkspaceMode } from '../../src/workspaces/grant-execution.js';
import { FakeAgentHost } from '../dsh-agent-host-fixture.js';
import { claudeReplay, readClaudeRecording } from './claude-replay.js';
import { codexReplay, readCodexRecording, type CodexReplay } from './codex-replay.js';
import { memoryDsh } from './engine-dsh.js';
import { executeFixtureNativeTool } from './native-tools.js';
import { createTempRoot } from '../helpers.js';

export const START = 1_795_010_000_000;
export const RESETS_AT = new Date(1_795_027_200_000).toISOString();
export const API = { provider: 'deepseek-official', model: 'deepseek-v4-pro' };
export const CODEX = { kind: 'engine', engine: 'codex', model: 'gpt-6-astra' } as const;
export const CLAUDE = { kind: 'engine', engine: 'claude', model: 'claude-opus-5-5' } as const;
export const LIMIT: ReturnType<typeof readCodexRecording> = readCodexRecording(
  join(import.meta.dirname, 'codex-limit-turn.jsonl'),
);
const CODEX_DM = readCodexRecording(join(import.meta.dirname, 'codex-dm-turn.jsonl'));
export const CLAUDE_REPLY = readClaudeRecording(
  join(import.meta.dirname, 'claude-dm-turn.jsonl'),
).filter(
  (line) =>
    line.kind === 'account' ||
    line.kind === 'await-input' ||
    (line.kind === 'message' && ['system', 'result'].includes(String(line.msg['type']))),
);
export const CLAUDE_LIMIT: typeof CLAUDE_REPLY = [
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

export function limitAfter(tool: 'channel_read' | 'bot_send_message'): typeof LIMIT {
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

export class NativeReplay extends LlmAdapter {
  readonly requests: GenerateOptions[] = [];

  constructor(
    private readonly hitQuota: boolean,
    private readonly reply?: string,
  ) {
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
    const reply = this.reply;
    if (reply !== undefined) {
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'block-end', index: 0, block: { type: 'text', text: reply } };
    }
    const block = {
      type: 'tool-call' as const,
      id: ToolCallId('native-read'),
      name: reply === undefined ? 'channel_read' : 'bot_send_message',
      arguments: JSON.stringify({
        channel_id: dmChannelId('ada'),
        ...(reply === undefined ? {} : { body: reply }),
      }),
    };
    const index = reply === undefined ? 0 : 1;
    yield { type: 'block-start', index, blockType: block.type };
    yield { type: 'block-end', index, block };
    yield { type: 'finish', reason: { kind: 'tool-calls' } };
  }
}

export class AssignmentReplay extends NativeReplay {
  constructor(private readonly quota: boolean) {
    super(false);
  }

  override async *stream(options: GenerateOptions): AsyncGenerator<StreamChunk> {
    this.requests.push(options);
    if (this.quota) throw new LlmError('Fixture quota', 'QUOTA_EXHAUSTED');
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield {
      type: 'block-end',
      index: 0,
      block: { type: 'text', text: 'The native Assignment finished.' },
    };
    yield { type: 'finish', reason: { kind: 'stop' } };
  }
}

export async function nativeRuntime(model: NativeReplay, beforeWriterClose?: () => Promise<void>) {
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

export const CODEX_REPLY: ReturnType<typeof readCodexRecording> = CODEX_DM.map((line) => {
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

export function setup(options: {
  members: RoutingGroupMember[];
  allowed?: (route: typeof API) => void;
  enginesAllowed?: boolean;
  codexRecording?: typeof LIMIT;
  claudeRecording?: typeof CLAUDE_REPLY;
  idleMs?: number;
  nativeReply?: string;
  beforeEngineLimit?(engine: string, clock: { now: number }): void;
  inherited?: boolean;
  nativeFirst?: boolean;
  nativeRuntime?: Pick<
    Awaited<ReturnType<typeof nativeRuntime>>,
    'agents' | 'ctx' | 'dsh' | 'releaseNativeAgent'
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
  const replies: Mock<(reply: unknown) => void> = vi.fn();
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
    ...(options.idleMs === undefined ? {} : { idleMs: options.idleMs }),
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
    assignmentGroups: {
      pick: async (slug, id, effort) =>
        (await groupFallback.pickMixedAssignment(slug, id, effort)) ??
        groupFallback.pick(slug, id, effort),
      describe: (id) => ({
        name: group.name,
        routes: core.routingGroups.routes(id),
        targets: core.routingGroups.targets(id),
      }),
      restingUntil: (route) => routeRests.restingUntil(route),
      engineRestingUntil: (engine) => host.limit(engine)?.until,
      inherited: () => core.routingGroups.defaultGroup().groupId,
    },
  });
  options.nativeRuntime?.ctx.on(
    'agent/assistant-stream',
    ({ agent, frame }) => adapter.acceptAssistantStream(agent.session.id, frame, agent),
    { global: true },
  );
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
    current: () => core.runtime.currentTurnTarget?.('ada'),
    async reopen(id: string) {
      await core.runtime.close();
      await host.close();
      core.operationalDatabase.close();
      const reopened = createCore({ dshHome: root });
      try {
        const writer = await dsh.persistence.open(SessionId(id), 'write');
        const { events } = await writer.read();
        await writer.close();
        const segments = readTurnTargets(
          attachOperationalModule(reopened.operationalDatabase, 'bot-runtime'),
          id,
        );
        return {
          events,
          segments,
          messages: reopened.channels.readMessages(channel.id),
          current: reopened.runtime.currentTurnTarget?.('ada'),
          transcript: summarizeSessionTranscript({ sessionId: id, events, segments }).items,
        };
      } finally {
        await reopened.runtime.close();
        reopened.operationalDatabase.close();
      }
    },
    tool: (name: string, args: Record<string, unknown> = {}) =>
      core.runtime.runDirectBotTool?.('ada', name, args, AbortSignal.timeout(10_000)),
    assignment: (id: string) => core.runtime.getAssignment('ada', id),
    idle: () => core.runtime.whenIdle(),
    groupId: group.id,
  };
}
