import { executeNativeTool, installNativeTools } from '../src/runtime/native-agent-compat.js';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolRuntime, defineTool, type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import {
  TOB_GROUP_TOOL_CASES,
  TOB_CLI_TOOL_NAMES,
  reportRun,
} from './support/dsh-bot-agent-adapter.js';

describe('DSH Bot Agent adapter', () => {
  it('updates guidance and tool visibility on the same Session as Steward authority changes', async () => {
    const expected = [false, true, false];
    let turns = 0;
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          const steward = expected[turns++];
          const scope = host.scopes.get(reportRun.sessionId)!;
          const role = scope.sections.find(
            (section) => section.name === 'botharness:orchestrator-role',
          )?.text;
          expect(role?.includes('deepseekbot capabilities')).toBe(steward);
          expect(role?.includes('Create a new PersonaBot with bot_create')).toBe(!steward);
          expect(scope.sections.some((section) => section.name === 'botharness:tob-cli')).toBe(
            false,
          );
          const names = tools.map((tool) => tool.name);
          for (const name of TOB_CLI_TOOL_NAMES) {
            expect(names.includes(name)).toBe(!steward);
            expect(
              scope.guards.some((guard) => guard({ name })?.includes('scoped deepseekbot CLI')),
            ).toBe(steward);
          }
          expect(names).toContain('bot_send_message');
          expect(names).toContain('channel_read');
          expect(names).toContain('list_bot_contacts');
          expect(names).toContain('create_assignment');
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    try {
      for (const [index, tobCli] of expected.entries())
        await adapter.runOrchestrator({
          ...reportRun,
          resume: index > 0,
          stewardActive: () => tobCli,
        });
      expect(turns).toBe(expected.length);
      expect(host.createOptions).toHaveLength(1);
    } finally {
      await adapter.close();
    }
  });

  it('rejects a retained ordinary Bot creation callback during a Tob run', async () => {
    let invokeLegacy: (() => Promise<unknown>) | undefined;
    let turn = 0;
    const createBot = vi.fn(() => ({
      botId: 'created',
      displayName: 'Created',
      dmChannelId: 'dm-created',
      memoryDir: '/memory/created',
      model: 'host-default' as const,
    }));
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          if (turn++ === 0) {
            const tool = tools.find((candidate) => candidate.name === 'bot_create')!;
            invokeLegacy = async () =>
              tool.execute({ display_name: 'Created' }, {} as ToolRunContext);
            await invokeLegacy();
          } else {
            await expect(invokeLegacy!()).rejects.toThrow(
              'The Steward must use the scoped deepseekbot CLI',
            );
          }
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    const run = { ...reportRun, channels: { ...reportRun.channels, createBot } };
    try {
      await adapter.runOrchestrator({ ...run, stewardActive: () => false });
      await adapter.runOrchestrator({ ...run, resume: true, stewardActive: () => true });
      expect(createBot).toHaveBeenCalledOnce();
    } finally {
      await adapter.close();
    }
  });

  it.each(TOB_GROUP_TOOL_CASES)(
    'rejects retained ordinary %s callbacks during a Tob run',
    async (name, args, method) => {
      let invokeLegacy!: () => Promise<unknown>;
      let turn = 0;
      const action = vi.fn(() => {
        throw new Error('ordinary Group method reached');
      });
      const host = new FakeAgentHost(
        { kind: 'completed' },
        {
          onTurn: async (_session, tools) => {
            if (turn++ === 0) {
              const tool = tools.find((candidate) => candidate.name === name)!;
              invokeLegacy = async () => tool.execute(args, {} as ToolRunContext);
              await expect(invokeLegacy()).rejects.toThrow('ordinary Group method reached');
            } else
              await expect(invokeLegacy()).rejects.toThrow(
                'The Steward must use the scoped deepseekbot CLI',
              );
          },
        },
      );
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      const run = { ...reportRun, channels: { ...reportRun.channels, [method]: action } };
      try {
        await adapter.runOrchestrator({ ...run, stewardActive: () => false });
        await adapter.runOrchestrator({ ...run, resume: true, stewardActive: () => true });
        expect(action).toHaveBeenCalledOnce();
      } finally {
        await adapter.close();
      }
    },
  );

  it.each(TOB_CLI_TOOL_NAMES)(
    'uses the pinned ToolRuntime guard for local-only %s without global restriction lookup',
    async (toolName) => {
      let started!: () => void;
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const working = new Promise<void>((resolve) => {
        release = resolve;
      });
      const host = new FakeAgentHost(
        { kind: 'completed' },
        {
          onTurn: async () => {
            started();
            await working;
          },
        },
      );
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      const running = adapter.runOrchestrator({ ...reportRun, stewardActive: () => true });
      await ready;
      const fence = host.scopes
        .get(reportRun.sessionId)!
        .guards.find((guard) => guard({ name: toolName })?.includes('scoped deepseekbot CLI'))!;
      const ctx = new Context();
      const providers = ctx.plugin({
        name: 'test-tob-creation-native-tools',
        apply(c: Context) {
          c.provide('systemPrompt', {
            tools: () => () => undefined,
            section: () => () => undefined,
            getSectionOrder: () => 1,
          });
        },
      });
      await providers.await();
      const runtime = ctx.plugin(ToolRuntime, {});
      await runtime.await();
      const tob = { session: { id: 'tob-creation', header: { cwd: '/memory/tob' } } } as Agent;
      const ordinary = {
        session: { id: 'ordinary-creation', header: { cwd: '/memory/ordinary' } },
      } as Agent;
      const tobScope = createScope(ctx, tob);
      const ordinaryScope = createScope(ctx, ordinary);
      Object.assign(tob, { ctx: tobScope.ctx });
      Object.assign(ordinary, { ctx: ordinaryScope.ctx });
      const effects = vi.fn(async () => 'created');
      const tool = defineTool({
        name: toolName,
        description: 'Local-only creation',
        parameters: {},
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: effects,
      });
      tobScope.ctx.get('tools')!.register(tool);
      ordinaryScope.ctx.get('tools')!.register(tool);
      await tobScope.ctx.inject(['tools'], (ctx) => installNativeTools(ctx)).await();
      await ordinaryScope.ctx.inject(['tools'], (ctx) => installNativeTools(ctx)).await();
      try {
        expect(() => tobScope.ctx.get('tools')!.restrict({ deny: [toolName] })).toThrow(
          'unknown global tool',
        );
        expect(() => tobScope.ctx.get('tools')!.guard(fence)).not.toThrow();
        const execute = (agent: Agent) =>
          executeNativeTool(ctx, {
            agent,
            callId: ToolCallId(agent.session.id),
            name: toolName,
            arguments: {},
            signal: new AbortController().signal,
          });
        expect((await execute(tob)).isError).toBe(true);
        expect(effects).not.toHaveBeenCalled();
        expect((await execute(ordinary)).isError).not.toBe(true);
        expect(effects).toHaveBeenCalledOnce();
      } finally {
        await tobScope.dispose();
        await ordinaryScope.dispose();
        await runtime.dispose();
        await providers.dispose();
        release();
        await running;
        await adapter.close();
      }
    },
  );
});

describe('model-free Tob preparation cancellation', () => {
  it.each([
    { operation: 'create', cancellation: 'signal' },
    { operation: 'resume', cancellation: 'signal' },
    { operation: 'create', cancellation: 'session-stop' },
    { operation: 'resume', cancellation: 'session-stop' },
  ] satisfies { operation: 'create' | 'resume'; cancellation: 'signal' | 'session-stop' }[])(
    'cancels pending native $operation through $cancellation and disposes its late handle before execution',
    async ({ operation, cancellation }) => {
      const agents = new FakeAgentHost();
      let release: (() => void) | undefined;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const originalCreate = agents.create.bind(agents);
      const originalResume = agents.resume.bind(agents);
      const pending =
        operation === 'create'
          ? vi.spyOn(agents, 'create').mockImplementation(async (options) => {
              const handle = await originalCreate(options);
              await gate;
              return handle;
            })
          : vi.spyOn(agents, 'resume').mockImplementation(async (options) => {
              const handle = await originalResume(options);
              await gate;
              return handle;
            });
      const adapter = createDshBotAgentAdapter({
        agents,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      const controller = new AbortController();
      const complete = vi.fn();
      let settled = false;
      const running = adapter
        .runOrchestrator({
          ...reportRun,
          resume: operation === 'resume',
          stewardActive: () => true,
          tobCliTurn: {
            command: { argv: ['approval-templates'], stdin: '' },
            signal: controller.signal,
            complete,
          },
        })
        .then(
          () => {
            settled = true;
          },
          () => {
            settled = true;
          },
        );
      try {
        await vi.waitFor(() => expect(pending).toHaveBeenCalledOnce());
        expect(adapter.steerOrchestrator?.(reportRun.bot.slug, 'interruption')).toBe(false);
        if (cancellation === 'signal') controller.abort();
        else expect(adapter.stopOrchestratorTurn?.(reportRun.bot.slug)).toBe(reportRun.sessionId);
        await vi.waitFor(() => expect(settled).toBe(true), { timeout: 500, interval: 5 });
        expect(complete).not.toHaveBeenCalled();
        release?.();
        await vi.waitFor(() => expect(agents.disposed).toContain(reportRun.sessionId));
        expect(agents.received.get(reportRun.sessionId) ?? []).toEqual([]);
      } finally {
        release?.();
        await running;
        await adapter.close();
      }
    },
  );
});
