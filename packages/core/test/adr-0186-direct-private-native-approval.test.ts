import { Context } from '@deepseek-ai/cordis';
import { AgentRegistry } from '@deepseek-ai/dsh-agent';
import { AgentLoop } from '@deepseek-ai/dsh-agent-loop';
import {
  createUserMessage,
  LlmAdapter,
  LlmRuntime,
  ToolCallId,
  type StreamChunk,
  type ToolCallBlock,
} from '@deepseek-ai/dsh-llm';
import { SessionId, SessionStore } from '@deepseek-ai/dsh-session';
import { SessionProjectionRegistry } from '@deepseek-ai/dsh-session-projection';
import { SystemPrompt } from '@deepseek-ai/dsh-system-prompt';
import { SandboxPolicyService } from '@deepseek-ai/dsh-sandbox-policy';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { humanContext, OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { apply, type BotHarnessCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const contexts: Context[] = [];
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const selection = { provider: 'fixture', model: 'fixture' };
const http = {
  account: 'synthetic-missing',
  references: [],
  method: 'GET',
  path: '/audit/approval-reviewer.json',
};
const secretCli = {
  account: 'synthetic-missing',
  references: ['token'],
  program: 'git',
  args: ['--version'],
  env: [{ name: 'TOKEN', value: '{{token}}' }],
};

const protectedCli = {
  consumer: 'http-status-v1',
  account: 'synthetic-missing/approval-reviewer.json',
  endpoint: 'synthetic-endpoint',
  api_key: 'synthetic-key',
  api_secret: 'synthetic-secret',
};

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

class FixtureModel extends LlmAdapter {
  #next: (() => Promise<ToolCallBlock | undefined>) | undefined;

  override async resolveModel(provider: string, id: string) {
    return { provider, id, name: id, context: { contextWindow: 200_000 } };
  }

  holdNextResponse() {
    const response = deferred();
    const started = deferred();
    this.#next = async () => {
      started.resolve();
      await response.promise;
      return undefined;
    };
    return { started: started.promise, release: response.resolve };
  }

  callTool(id: ToolCallId, name: string, args: unknown, onRequest?: () => void) {
    this.#next = async () => {
      onRequest?.();
      return { type: 'tool-call', id, name, arguments: JSON.stringify(args) };
    };
  }

  override async *stream(): AsyncGenerator<StreamChunk> {
    const next = this.#next;
    this.#next = undefined;
    const call = await next?.();
    const block = call ?? { type: 'text' as const, text: 'Done' };
    yield { type: 'block-start', index: 0, blockType: block.type };
    yield { type: 'block-end', index: 0, block };
    yield { type: 'finish', reason: { kind: call ? 'tool-calls' : 'stop' } };
  }
}

async function fixture() {
  vi.stubEnv('DSH_HOME', createTempRoot('native-direct-approval-'));
  const ctx = new Context().extend({ invocation: { peer: { principal: { kind: 'owner' } } } });
  contexts.push(ctx);
  const created: SessionId[] = [];
  ctx.on(
    'agent/created',
    ({ agent }) => {
      created.push(agent.session.id);
    },
    { global: true },
  );
  const model = new FixtureModel();
  await ctx.plugin(LlmRuntime).await();
  ctx.get('llm')!.registerAdapter([selection.provider], model);
  await ctx.plugin(SessionStore).await();
  ctx.provide('agentDefaultModel', { currentSelection: () => selection } as never);
  await ctx.plugin(SystemPrompt, {}).await();
  ctx.provide('fs', {} as never);
  ctx.provide('shell', {} as never);
  new SessionProjectionRegistry(ctx);
  await ctx.plugin(AgentRegistry).await();
  await ctx
    .plugin(SandboxPolicyService, { mode: 'workspace-write', workspaceRoot: process.env.DSH_HOME! })
    .await();
  await ctx.plugin(ApprovalService, { policy: 'ask' }).await();
  const native = ctx.get('approval')!;
  await ctx.plugin(ToolRuntime, {}).await();
  await ctx.plugin(AgentLoop, {}).await();
  apply(ctx, { enabled: true });
  const core: BotHarnessCore | undefined = ctx.get('botharness');
  if (!core) throw new Error('Missing core');
  const caller = humanContext('caller');
  const database = attachOperationalModule(core.operationalDatabase, 'native-approval-test');
  database.transaction((db) => {
    db.prepare('UPDATE team_settings SET enabled=1').run();
    db.prepare("INSERT INTO humans VALUES ('caller','Caller','active','now')").run();
    db.prepare("INSERT INTO human_roles VALUES ('caller','member')").run();
  });
  core.spaces.ensureAccount(caller.humanId);
  expect(
    core.registry.create({ slug: 'helper', displayName: 'Helper', ownerHumanId: caller.humanId })
      .ok,
  ).toBe(true);
  const approver = core.team.roles.create(OWNER_HUMAN_CONTEXT, 'Tool approver', [
    'approvals.opaqueTools',
  ]).role;
  core.team.roles.set(OWNER_HUMAN_CONTEXT, caller.humanId, [approver.roleId]);
  core.team.bots.setVisibility(OWNER_HUMAN_CONTEXT, 'helper', {
    kind: 'public',
    audience: { kind: 'everyone' },
  });
  const ownerDm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'helper', 'Helper')!;
  const admission = core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
    channelId: ownerDm.id,
    messageId: 'initialize',
    body: 'Initialize the test Agent',
  });
  if (!admission.admitted) throw new Error('Initialization refused');
  await admission.settled;
  await core.runtime.whenIdle();
  const id = core.runtime.currentOrchestratorSessionId?.('helper');
  const agent = id && ctx.get('agents')!.get(SessionId(id));
  if (!agent) throw new Error('Missing initialized Orchestrator Agent');
  expect(core.runtime.directBotTools?.().map((tool) => tool.name)).toContain('secret_http');
  const tracked = vi.spyOn(ChannelToolApproval.prototype, 'track');
  const broker = () => {
    const owner = tracked.mock.contexts.at(-1);
    if (!(owner instanceof ChannelToolApproval))
      throw new Error('Registered Tool did not enter approval tracking');
    return owner;
  };
  expect(agent.status).toBe('idle');
  expect(agent.session.snapshotEvents().at(-1)).toMatchObject({
    type: 'turn/end',
    data: { reason: { kind: 'completed' } },
  });
  return { core, agent, native, ownerDm, caller, broker, model, created };
}

async function rememberSecretCli({ core, caller, broker }: Awaited<ReturnType<typeof fixture>>) {
  const dm = core.channels.getOrCreateDm(caller, 'helper', 'Helper')!;
  const controller = new AbortController();
  const seed = core.runtime.runDirectBotTool!(
    'helper',
    'secret_cli',
    secretCli,
    controller.signal,
    undefined,
    undefined,
    caller,
  ).catch(() => undefined);
  try {
    const card = await vi.waitFor(() => {
      const message = core.channels
        .readMessages(dm.id)
        .find((message) => message.toolApprovalRequest);
      if (!message) throw new Error('Missing seed approval');
      return message;
    });
    expect(await broker().decide(caller, 'helper', card.id, 'allowed-always-exact')).toBe(true);
  } finally {
    controller.abort();
    await seed;
  }
  const [rule] = core.toolRules.list('helper').filter((rule) => rule.revokedAt === undefined);
  if (!rule) throw new Error('The real Human card did not save an active rule');
  return { dm, rule };
}

describe('Private tool approval through the registered native executor', () => {
  it.each([
    { tool: 'secret_http', args: http },
    { tool: 'protected_cli', args: protectedCli },
  ])(
    'posts a direct $tool card to the caller while the Orchestrator is idle',
    async ({ tool, args }) => {
      const { core, agent, native, ownerDm, caller, broker } = await fixture();
      const dm = core.channels.getOrCreateDm(caller, 'helper', 'Helper')!;
      const controller = new AbortController();
      const nativeRequest = vi.spyOn(native, 'request');
      const run = core.runtime.runDirectBotTool!(
        'helper',
        tool,
        args,
        controller.signal,
        undefined,
        undefined,
        caller,
      );
      const settled = run.then(
        () => 'completed',
        (error: unknown) => String(error),
      );
      try {
        const card = await Promise.race([
          vi.waitFor(() => {
            const card = core.channels.readMessages(dm.id).find((m) => m.toolApprovalRequest);
            if (!card?.toolApprovalRequest) throw new Error('Missing caller approval');
            return { ...card.toolApprovalRequest, messageId: card.id };
          }),
          settled.then(async (result) => {
            const invocation = nativeRequest.mock.results[0];
            if (invocation?.type === 'return') await invocation.value;
            throw new Error('Tool finished before caller approval: ' + result);
          }),
        ]);
        expect(card).toMatchObject({ sessionId: agent.session.id, toolName: tool });
        expect(
          core.runtime.toolApprovalOrigin?.({
            sessionId: agent.session.id,
            callId: ToolCallId(card.callId),
          }),
        ).toEqual({ kind: 'direct', channelId: dm.id });
        const sibling = SessionId('other-orchestrator');
        core.ownership.claim({
          sessionId: sibling,
          botSlug: 'helper',
          rootRole: 'orchestrator',
          at: '2020-01-01T00:00:00.000Z',
        });
        expect(
          core.runtime.toolApprovalOrigin?.({
            sessionId: sibling,
            callId: ToolCallId(card.callId),
          }),
        ).toBeUndefined();
        expect(
          core.runtime.toolApprovalOrigin?.({
            sessionId: agent.session.id,
            callId: ToolCallId('another-call'),
          }),
        ).toBeUndefined();
        expect(core.channels.readMessages(ownerDm.id).some((m) => m.toolApprovalRequest)).toBe(
          false,
        );
        expect(
          agent.session
            .snapshotEvents()
            .filter((e) => e.type === 'approval/asked' || e.type === 'approval/decided'),
        ).toEqual([]);
        await expect(
          broker().decide(OWNER_HUMAN_CONTEXT, 'helper', card.messageId, 'rejected'),
        ).rejects.toMatchObject({ code: 'approval-not-allowed' });
        expect(await broker().decide(caller, 'helper', card.messageId, 'rejected')).toBe(true);
        await expect(run).rejects.toThrow('Human approval was rejected');
        expect(core.ownership.resolve(card.callId)).toBeUndefined();
      } finally {
        controller.abort();
        await settled;
      }
    },
  );
  it('keeps direct refusal and cancellation out of an unrelated open Group audit', async () => {
    const { core, agent, native, broker, model, caller } = await fixture();
    const group = core.channels.createGroup(caller, { name: 'Active Group', members: ['helper'] });
    const { started, release } = model.holdNextResponse();
    const controller = new AbortController();
    const nativeRequest = vi.spyOn(native, 'request');
    let run: ReturnType<NonNullable<typeof core.runtime.runDirectBotTool>> | undefined;
    try {
      await core.channels.appendMessage(caller, group.id, {
        id: 'held-group-turn',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Helper hold this Group task',
        mentions: [{ botSlug: 'helper', label: 'Helper', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, 'held-group-turn');
      await started;
      expect(core.runtime.askChannel?.(agent.session.id)).toBe(group.id);
      await expect(
        core.runtime.runDirectBotTool!('helper', 'secret_http', http, new AbortController().signal),
      ).rejects.toThrow('Human approval was unavailable');
      expect(nativeRequest.mock.calls.length).toBe(0);
      expect(
        agent.session
          .snapshotEvents()
          .filter((event) => event.type === 'approval/asked' || event.type === 'approval/decided'),
      ).toEqual([]);
      const dm = core.channels.getOrCreateDm(caller, 'helper', 'Helper')!;
      run = core.runtime.runDirectBotTool!(
        'helper',
        'secret_http',
        http,
        controller.signal,
        undefined,
        undefined,
        caller,
      );
      const card = await vi.waitFor(() => {
        const message = core.channels
          .readMessages(dm.id)
          .find((message) => message.toolApprovalRequest);
        if (!message?.toolApprovalRequest) throw new Error('Missing direct caller approval');
        return message;
      });
      expect(nativeRequest.mock.calls.length).toBe(0);
      expect(
        core.channels.readMessages(group.id).some((message) => message.toolApprovalRequest),
      ).toBe(false);
      expect(core.runtime.askChannel?.(agent.session.id)).toBe(group.id);
      controller.abort();
      await run.catch(() => undefined);
      expect(await broker().decide(caller, 'helper', card.id, 'allowed-once')).toBe(false);
      expect(
        agent.session
          .snapshotEvents()
          .filter((event) => event.type === 'approval/asked' || event.type === 'approval/decided'),
      ).toEqual([]);
    } finally {
      controller.abort();
      release();
      await run?.catch(() => undefined);
      await core.runtime.whenIdle();
    }
  });

  it('refuses a callerless saved rule without consuming it and keeps authenticated reuse', async () => {
    const state = await fixture();
    const { core, native, caller } = state;
    const { dm, rule } = await rememberSecretCli(state);
    const nativeRequest = vi.spyOn(native, 'request');
    const firstController = new AbortController();
    const secondController = new AbortController();
    let firstResult: string | undefined;
    const first = core.runtime.runDirectBotTool!(
      'helper',
      'secret_cli',
      secretCli,
      firstController.signal,
    ).then(
      () => {
        firstResult = 'completed';
      },
      (error: unknown) => {
        firstResult = String(error);
      },
    );
    let second: Promise<unknown> | undefined;
    const count = () =>
      core.toolRules.list('helper').find((row) => row.id === rule.id)?.autoApprovedCount;
    try {
      await vi.waitFor(() => expect(firstResult !== undefined || count() === 1).toBe(true));
      expect(count()).toBe(0);
      expect(firstResult).toContain('Human approval was unavailable');
      second = core.runtime.runDirectBotTool!(
        'helper',
        'secret_cli',
        secretCli,
        secondController.signal,
        undefined,
        undefined,
        caller,
      ).catch(() => undefined);
      await vi.waitFor(() => expect(count()).toBe(1));
      expect(nativeRequest.mock.calls.length).toBe(0);
      expect(
        core.channels.readMessages(dm.id).filter((message) => message.toolApprovalRequest),
      ).toHaveLength(1);
    } finally {
      firstController.abort();
      secondController.abort();
      await first;
      await second;
    }
  });

  it('honors a saved rule when child settlement wakes the Orchestrator without an inbound Channel', async () => {
    const state = await fixture();
    const { core, agent, model } = state;
    const { dm, rule } = await rememberSecretCli(state);
    const child = SessionId('settled-child');
    core.ownership.claim({
      sessionId: child,
      botSlug: 'helper',
      rootRole: 'orchestrator',
      provenance: 'subagent',
      parentSessionId: agent.session.id,
      at: '2020-01-01T00:00:00.000Z',
    });
    const callId = ToolCallId('resumed-native');
    const originAtRequest = vi.fn(() =>
      core.runtime.toolApprovalOrigin?.({ sessionId: agent.session.id, callId }),
    );
    model.callTool(callId, 'secret_cli', secretCli, originAtRequest);
    agent.followup(
      createUserMessage({
        content: [{ type: 'text', text: 'Child finished' }],
        source: {
          kind: 'subagent-settled',
          form: 'notice',
          summary: 'Child finished',
          senderSessionId: child,
        },
      }),
    );
    await agent.whenIdle();
    await core.runtime.whenIdle();
    expect(originAtRequest).toHaveReturnedWith(undefined);
    const result = agent.session
      .snapshotEvents()
      .find((event) => event.type === 'tool/result' && event.data.message.toolCallId === callId);
    expect(result).toBeDefined();
    expect(core.toolRules.list('helper').find((row) => row.id === rule.id)?.autoApprovedCount).toBe(
      1,
    );
    expect(
      core.channels.readMessages(dm.id).filter((message) => message.toolApprovalRequest),
    ).toHaveLength(1);
    expect(agent.session.snapshotEvents().at(-1)).toMatchObject({
      type: 'turn/end',
      data: { reason: { kind: 'completed' } },
    });
  });

  it('does not create a DM for an ungoverned direct read', async () => {
    const { core, caller } = await fixture();
    const channelsBefore = core.channels.list().map((channel) => channel.id);
    await expect(
      core.runtime.runDirectBotTool!(
        'helper',
        'secret_http',
        { ...http, path: '/ordinary-read' },
        new AbortController().signal,
        undefined,
        undefined,
        caller,
      ),
    ).rejects.toThrow('references must include the endpoint field');
    expect(core.channels.list().map((channel) => channel.id)).toEqual(channelsBefore);
  });

  it('keeps a registered direct request out of native Group audit during shutdown', async () => {
    const { core, agent, native, caller, model } = await fixture();
    const group = core.channels.createGroup(caller, { name: 'Closing Group', members: ['helper'] });
    const { started, release } = model.holdNextResponse();
    const identify = core.runtime.hasDirectToolInvocation!.bind(core.runtime);
    let closing: Promise<void> | undefined;
    const nativeRequest = vi.spyOn(native, 'request');
    try {
      await core.channels.appendMessage(caller, group.id, {
        id: 'closing-group-turn',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Helper hold this Group task',
        mentions: [{ botSlug: 'helper', label: 'Helper', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, 'closing-group-turn');
      await started;
      expect(core.runtime.askChannel?.(agent.session.id)).toBe(group.id);
      vi.spyOn(core.runtime, 'hasDirectToolInvocation').mockImplementation((query) => {
        closing ??= core.runtime.close();
        return identify(query);
      });
      await expect(
        core.runtime.runDirectBotTool!(
          'helper',
          'secret_http',
          http,
          new AbortController().signal,
          undefined,
          undefined,
          caller,
        ),
      ).rejects.toThrow('Human approval was unavailable');
      expect(nativeRequest.mock.calls.length).toBe(0);
      expect(
        agent.session
          .snapshotEvents()
          .filter((event) => event.type === 'approval/asked' || event.type === 'approval/decided'),
      ).toEqual([]);
    } finally {
      release();
      await closing;
      await core.runtime.whenIdle();
    }
  });

  it('keeps an ordinary Group tool call and its native audit pair in the open Group turn', async () => {
    const { core, agent, broker, model, ownerDm, caller } = await fixture();
    const group = core.channels.createGroup(caller, { name: 'Group', members: ['helper'] });
    const callId = ToolCallId('ordinary-group');
    model.callTool(callId, 'secret_http', http);
    try {
      await core.channels.appendMessage(caller, group.id, {
        id: 'group-turn',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Helper hello',
        mentions: [{ botSlug: 'helper', label: 'Helper', start: 0, end: 7 }],
      });
      core.runtime.admitGroupMessage(group.id, 'group-turn');
      const card = await vi.waitFor(() => {
        const message = core.channels
          .readMessages(group.id)
          .find((m) => m.toolApprovalRequest?.callId === callId);
        if (!message) throw new Error('Expected the Group approval');
        return message;
      });
      expect(core.runtime.toolApprovalOrigin?.({ sessionId: agent.session.id, callId })).toEqual({
        kind: 'turn',
        channelId: group.id,
      });
      expect(core.channels.readMessages(ownerDm.id).some((m) => m.toolApprovalRequest)).toBe(false);
      const { openTurnStartSeq } = agent.ctx.agents.turnBoundaryOf(agent.session);
      if (openTurnStartSeq === null) throw new Error('Group approval was outside a native turn');
      expect(await broker().decide(caller, 'helper', card.id, 'rejected')).toBe(true);
      await core.runtime.whenIdle();
      const tail = agent.session.snapshotEvents().filter((event) => event.seq >= openTurnStartSeq);
      const end = tail.findIndex((event) => event.type === 'turn/end');
      const events = tail.slice(0, end + 1);
      const audit = events.filter(
        (event) => event.type === 'approval/asked' || event.type === 'approval/decided',
      );
      expect(
        events.filter((event) =>
          ['turn/start', 'approval/asked', 'approval/decided', 'tool/result', 'turn/end'].includes(
            event.type,
          ),
        ),
      ).toMatchObject([
        { type: 'turn/start' },
        { type: 'approval/asked', data: { toolName: 'secret_http', callId } },
        { type: 'approval/decided', data: { outcome: 'rejected' } },
        { type: 'tool/result', data: { message: { toolCallId: callId, isError: true } } },
        { type: 'turn/end', data: { reason: { kind: 'completed' } } },
      ]);
      expect(audit[0]?.data.id).toBe(audit[1]?.data.id);
    } finally {
      agent.cancel({ kind: 'user' });
      await core.runtime.whenIdle();
    }
  });

  it('does not claim a Session for a private call refused before an Agent exists', async () => {
    const { core, caller, created } = await fixture();
    expect(
      core.registry.create({
        slug: 'unstarted',
        displayName: 'Unstarted',
        ownerHumanId: caller.humanId,
      }).ok,
    ).toBe(true);
    const before = [...created];
    const channelsBefore = core.channels.list().map((channel) => channel.id);
    await expect(
      core.runtime.runDirectBotTool!(
        'unstarted',
        'secret_http',
        http,
        new AbortController().signal,
        undefined,
        undefined,
        caller,
      ),
    ).rejects.toMatchObject({ code: 'parent-unavailable' });
    const [call] = core.runtime.directBotToolCalls!('unstarted');
    if (!call) throw new Error('Missing direct call trace');
    expect(created).toEqual(before);
    expect(core.channels.list().map((channel) => channel.id)).toEqual(channelsBefore);
    expect(core.ownership.resolve(call.callId)).toBeUndefined();
  });

  it('retains ownership when the direct executor actually creates a Session', async () => {
    const { core, caller, created } = await fixture();
    await expect(
      core.runtime.runDirectBotTool!(
        'helper',
        'bot_send_message',
        { body: [] },
        new AbortController().signal,
        undefined,
        undefined,
        caller,
      ),
    ).rejects.toThrow();
    const [call] = core.runtime.directBotToolCalls!('helper');
    if (!call) throw new Error('Missing direct call trace');
    expect(created).toContain(SessionId(call.callId));
    expect(core.ownership.resolve(call.callId)).toMatchObject({
      botSlug: 'helper',
      provenance: 'created',
      rootRole: 'orchestrator',
    });
  });
});
