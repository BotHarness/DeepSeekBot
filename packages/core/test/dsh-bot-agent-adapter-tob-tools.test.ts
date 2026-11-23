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
  it.each([true, false])(
    'installs trusted CLI guidance only for Host-resolved Tob identity (%s)',
    async (tobCli) => {
      const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      try {
        await adapter.runOrchestrator({ ...reportRun, tobCli });
        const scope = host.scopes.get(reportRun.sessionId)!;
        const rolePrompt = scope.sections.find(
          (section) => section.name === 'botharness:orchestrator-role',
        )?.text;
        const prompt = scope.sections.find(
          (section) => section.name === 'botharness:tob-cli',
        )?.text;
        if (tobCli) {
          expect(rolePrompt).toContain('scoped deepseekbot CLI');
          expect(rolePrompt).not.toContain('Create a new PersonaBot with bot_create');
          expect(scope.tools.map((tool) => tool.name)).not.toContain('bot_create');
          expect(
            scope.guards.some((guard) =>
              guard({ name: 'bot_create' })?.includes('scoped deepseekbot CLI'),
            ),
          ).toBe(true);
          expect(prompt).toContain('deepseekbot capabilities');
          expect(prompt).toContain('deepseekbot settings botharness-client');
          expect(prompt).toContain('--patch-stdin --expected-revision');
          expect(prompt).toContain('What can you do?');
          expect(prompt).toContain('read-only discovery');
          expect(prompt).toContain('THIS installed version');
          expect(prompt).toContain('does not need to know commands');
          expect(prompt).not.toContain('only assignmentConcurrencyLimit');
          expect(prompt).toContain('private steward and secretary');
          expect(prompt).toContain('never replace a required Human decision with your own');
        } else {
          expect(prompt).toBeUndefined();
          expect(rolePrompt).toContain('Create a new PersonaBot with bot_create');
          expect(scope.tools.map((tool) => tool.name)).toContain('bot_create');
          expect(
            scope.guards.some((guard) =>
              guard({ name: 'bot_create' })?.includes('scoped deepseekbot CLI'),
            ),
          ).toBe(false);
        }
        for (const [name] of TOB_GROUP_TOOL_CASES) {
          expect(scope.tools.some((tool) => tool.name === name)).toBe(!tobCli);
          expect(
            scope.guards.some((guard) => guard({ name })?.includes('scoped deepseekbot CLI')),
          ).toBe(tobCli);
        }
        expect(scope.tools.map((tool) => tool.name)).toContain('bot_send_message');
        expect(scope.tools.map((tool) => tool.name)).not.toContain('channel_send');
        expect(scope.tools.map((tool) => tool.name)).toContain('channel_read');
        expect(
          rolePrompt?.includes("Tob is the Human's private steward, never a Group participant"),
        ).toBe(tobCli);
        expect(rolePrompt?.includes('You may create a Group with group_create')).toBe(!tobCli);
        expect(rolePrompt?.includes('Tob Delegation:')).toBe(tobCli);
        expect(scope.tools.map((tool) => tool.name)).toContain('list_bot_contacts');
        expect(scope.tools.map((tool) => tool.name)).not.toContain('tob_assignment_limit_read');
        expect(scope.tools.map((tool) => tool.name)).not.toContain('tob_assignment_limit_set');
        expect(scope.tools.map((tool) => tool.name)).toContain('create_assignment');
      } finally {
        await adapter.close();
      }
    },
  );

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
              'Tob must use the scoped deepseekbot CLI',
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
      await adapter.runOrchestrator({ ...run, tobCli: false });
      await adapter.runOrchestrator({ ...run, resume: true, tobCli: true });
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
                'Tob must use the scoped deepseekbot CLI',
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
        await adapter.runOrchestrator({ ...run, tobCli: false });
        await adapter.runOrchestrator({ ...run, resume: true, tobCli: true });
        expect(action).toHaveBeenCalledOnce();
      } finally {
        await adapter.close();
      }
    },
  );

  it.each(TOB_CLI_TOOL_NAMES)(
    'uses the pinned ToolRuntime guard for local-only %s without global restriction lookup',
    async (toolName) => {
      const host = new FakeAgentHost({ kind: 'completed' }, { onTurn: async () => undefined });
      const adapter = createDshBotAgentAdapter({
        agents: host,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
        orchestratorCwd: () => '/memory/ada',
        ensureWorkspace: () => undefined,
      });
      await adapter.runOrchestrator({ ...reportRun, tobCli: true });
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
          tobCli: true,
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
