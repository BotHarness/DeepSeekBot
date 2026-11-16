import { createHash } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { createScope, scopeTarget } from '@deepseek-ai/dsh-scope';
import { ShellExecutor, type ShellExecSpec, type ShellExecution } from '@deepseek-ai/dsh-shell';
import { ToolRuntime, defineTool, type ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { apply, type BotHarnessCore } from '../src/index.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { executeNativeTool, installAgentNativeTools } from '../src/runtime/native-agent-compat.js';
import { approveTobCliOperation } from '../src/tob/cli-approval.js';
import { createTobHostCliOperations, type TobHostCliRunner } from '../src/tob/cli-host-commands.js';
import { ModelFreeTobCliInvocation } from '../src/tob/cli-invocation.js';
import { installTobCliShell } from '../src/tob/cli-shell.js';
import { TobError } from '../src/tob/service.js';
import { ChannelToolApproval } from '../src/workspaces/tool-approval.js';
import { createTempRoot } from './helpers.js';
import { buildManagedCliFixture } from './fixtures/managed-cli.js';

let cli: Awaited<ReturnType<typeof buildManagedCliFixture>>;
beforeAll(async () => {
  cli = await buildManagedCliFixture();
  console.info(JSON.stringify({ event: 'managed_cli_fixture.built', ...cli.provenance }));
});
afterAll(async () => {
  await cli?.close();
});

const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

async function fixture() {
  vi.stubEnv('DSH_HOME', createTempRoot('botharness-owned-cli-home-'));
  const ctx = new Context();
  cleanup.push(() => ctx.fiber.dispose());
  ctx.provide('systemPrompt', { tools: () => () => {}, section: () => () => {} } as never);
  let nativeTurn: number | null = 1;
  ctx.provide('agents', {
    create: vi.fn(),
    resume: vi.fn(),
    get: vi.fn(),
    list: () => [],
    turnBoundaryOf: () => ({ openTurnStartSeq: nativeTurn }),
  } as never);
  ctx.provide('sessions', { list: () => [], get: vi.fn() } as never);
  ctx.provide('skills', { register: () => () => {} } as never);
  ctx.provide('sandboxPolicy', { resolve: () => ({ mode: 'workspace-write' }) } as never);
  const approval = {
    overrideOf: () => 'ask',
    request: (request: Parameters<ApprovalService['request']>[0]) =>
      ctx.waterfall('approval/request', request, async () => 'unavailable' as const),
  } as unknown as ApprovalService;
  ctx.provide('approval', approval);
  await ctx.plugin(ToolRuntime, {}).await();
  const delegate = vi.spyOn(ModelFreeTobCliInvocation.prototype, 'delegate');
  const ask = vi.spyOn(ChannelToolApproval.prototype, 'ask');
  apply(ctx, { enabled: true });
  const core: BotHarnessCore | undefined = ctx.get('botharness');
  if (!core) throw new Error('Missing core');
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const origin = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada');
  if (!origin) throw new Error('Missing fixture DM');
  vi.spyOn(core.runtime, 'askChannel').mockReturnValue(origin.id);
  core.ownership.claim({
    sessionId: 'owned-cli',
    botSlug: 'ada',
    rootRole: 'orchestrator',
    at: new Date().toISOString(),
  });
  const actor = {
    session: {
      id: 'owned-cli',
      header: { cwd: core.registry.memoryDirFor('ada') },
      snapshotEvents: () => [],
    },
  } as unknown as Agent;
  const scope = createScope(ctx, actor);
  cleanup.push(() => scope.dispose());
  Object.assign(actor, { ctx: scope.ctx });
  await scope.ctx
    .inject(['tools'], async (agentCtx) => {
      Object.assign(actor, { ctx: agentCtx });
      await installAgentNativeTools(agentCtx, actor);
    })
    .await();
  const controller = new AbortController();
  const probe = {
    agent: actor,
    name: 'bash',
    arguments: { command: 'echo probe' },
    callId: ToolCallId('probe'),
    rootCallId: ToolCallId('probe'),
    token: Symbol('probe'),
    signal: controller.signal,
  } as ToolExecution;
  expect(
    await ctx.waterfall(scopeTarget(ctx.tools, actor), 'tools/pre-execute', probe, async () => ({
      kind: 'allow' as const,
    })),
  ).toEqual({ kind: 'allow' });
  await approval.request({
    agent: actor,
    toolName: 'probe',
    callId: ToolCallId('probe'),
    signal: controller.signal,
  });
  const authority = delegate.mock.contexts.at(-1);
  const channelApproval = ask.mock.contexts.at(-1);
  if (
    !(authority instanceof ModelFreeTobCliInvocation) ||
    !(channelApproval instanceof ChannelToolApproval)
  )
    throw new Error('Missing production approval owners');
  let authorized = true,
    current = true;
  const authorize = () => {
    if (!authorized) throw new TobError('tob-authority-required');
  };
  const runHost = vi.fn<TobHostCliRunner>(async () => ({
    exitCode: 0,
    stdout: '{"changed":true}',
  }));
  const prepareOperation = createTobHostCliOperations({ run: runHost });
  class NoShell extends ShellExecutor {
    resolve(): ShellExecSpec {
      throw new Error('Unexpected Shell');
    }
    async execute(): Promise<ShellExecution> {
      throw new Error('Unexpected Shell');
    }
  }
  const shellCtx = new Context();
  cleanup.push(() => shellCtx.fiber.dispose());
  const registerTool = vi.spyOn(actor.ctx.tools, 'register');
  installTobCliShell(actor.ctx, new NoShell(shellCtx), {
    cliPath: cli.path,
    nativeCli: {
      available: () => true,
      register: (definition) => authority.register(actor, definition, () => authorize),
      require: (execution) => authority.require(execution),
    },
    capture: (execution) => ({
      signal: controller.signal,
      authorize,
      prepareOperation,
      readSetting: () => ({ scope: 'global', value: 3, revision: 0 }),
      writeSetting: async () => {
        throw new Error('Unexpected settings write');
      },
      approve: (operation, signal) =>
        approveTobCliOperation({
          execution,
          operation,
          signal,
          authorize,
          approval,
          channelApproval,
          fullAccess: () => true,
        }),
    }),
  });
  const registeredTool = registerTool.mock.results.at(-1);
  if (!registeredTool || registeredTool.type !== 'return')
    throw new Error('Missing trusted registration disposer');
  const removeTool = registeredTool.value;
  registerTool.mockRestore();
  const command = {
    argv: ['approval-template-set', 'ada', 'routine'],
    stdin: 'private-stdin-value',
  };
  const toolSet = await actor.ctx.tools.resolve({
    agent: actor,
    modelSelection: { provider: 'unused', model: 'unused' },
    signal: controller.signal,
  });
  cleanup.push(() => toolSet.dispose());
  const input = {
    agent: actor,
    callId: ToolCallId('owned-call'),
    command,
    toolSet,
    signal: controller.signal,
    requireCurrentTurn: () => {
      if (!current) throw new TobError('agent-context-expired');
    },
  };
  const native = (changes: Partial<Parameters<typeof executeNativeTool>[1]> = {}) =>
    executeNativeTool(actor.ctx, {
      agent: actor,
      callId: input.callId,
      name: 'deepseekbot_cli',
      arguments: command,
      toolSet,
      signal: controller.signal,
      ...changes,
    });
  return {
    ctx,
    scope,
    core,
    actor,
    removeTool,
    authority,
    channelApproval,
    command,
    controller,
    toolSet,
    input,
    native,
    runHost,
    revoke: () => {
      authorized = false;
    },
    changeTurn: () => {
      current = false;
    },
    changeNativeTurn: (value: number | null) => {
      nativeTurn = value;
    },
  };
}

describe('owned model-free Tob CLI invocation', () => {
  it('uses the real native interceptor, trusted transport and broker for one exact-operation Human card', async () => {
    const f = await fixture();
    const pending = f.authority.run(f.input, () => f.native());
    await vi.waitFor(() => expect(f.channelApproval.requests('ada')).toHaveLength(1));
    const request = f.channelApproval.requests('ada')[0]!;
    expect(request.toolName).toBe('deepseekbot approval-template-set');
    expect(JSON.parse(request.input)).toMatchObject({
      via: 'cli',
      patch: {
        argv: f.command.argv,
        cwd: f.actor.session.header.cwd,
        stdinBytes: Buffer.byteLength(f.command.stdin),
        stdinSha256: createHash('sha256').update(f.command.stdin).digest('hex'),
      },
    });
    expect(request.input).not.toContain(f.command.stdin);
    expect(f.runHost).not.toHaveBeenCalled();
    await f.channelApproval.decide(OWNER_HUMAN_CONTEXT, 'ada', request.messageId, 'allowed-once');
    expect(await pending).toMatchObject({ isError: false });
    expect(f.runHost).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        argv: f.command.argv,
        stdin: f.command.stdin,
        cwd: f.actor.session.header.cwd,
      }),
    );
    expect(f.channelApproval.requests('ada')).toEqual([]);
  });

  it('delegates reads too, without a card or a synthetic allowed-once grant', async () => {
    const f = await fixture();
    f.command.argv = ['approval-templates'];
    const result = await f.authority.run(f.input, () => f.native());
    expect(result).toMatchObject({ isError: false });
    expect(f.channelApproval.requests('ada')).toEqual([]);
    expect(f.runHost, JSON.stringify(result)).toHaveBeenCalledOnce();
  });

  it.each(['reject', 'cancel', 'source-revoked'] as const)(
    'keeps broker %s and late-decision refusal authoritative',
    async (action) => {
      const f = await fixture();
      const pending = f.authority.run(f.input, () => f.native());
      await vi.waitFor(() => expect(f.channelApproval.requests('ada')).toHaveLength(1));
      const request = f.channelApproval.requests('ada')[0]!;
      if (action === 'cancel') f.controller.abort();
      else {
        if (action === 'source-revoked') f.revoke();
        await f.channelApproval.decide(
          OWNER_HUMAN_CONTEXT,
          'ada',
          request.messageId,
          action === 'reject' ? 'rejected' : 'allowed-once',
        );
      }
      await pending;
      expect(f.runHost).not.toHaveBeenCalled();
      expect(
        await f.channelApproval.decide(
          OWNER_HUMAN_CONTEXT,
          'ada',
          request.messageId,
          'allowed-once',
        ),
      ).not.toMatchObject({ ok: true });
    },
  );

  it.each([
    'argv',
    'stdin',
    'callId',
    'agent',
    'signal',
    'selection',
    'native-turn',
    'source',
    'turn',
    'registration',
    'same-definition-new-registration',
    'removed-registration',
    'disposed-selection',
    'token',
    'nested',
    'parent',
    'cancelled-signal',
    'native-turn-ended',
  ] as const)('refuses %s identity changes at native admission and body', async (change) => {
    const f = await fixture();
    let checked = false;
    f.ctx.on(
      'tools/pre-execute',
      async (call) => {
        expect(f.authority.delegate(call)).toBe('delegated');
        let changed: ToolExecution = call;
        switch (change) {
          case 'argv':
            changed = { ...call, arguments: { ...f.command, argv: [...f.command.argv].reverse() } };
            break;
          case 'stdin':
            changed = { ...call, arguments: { ...f.command, stdin: 'PRIVATE-stdin-value' } };
            break;
          case 'callId':
            changed = { ...call, callId: ToolCallId('different') };
            break;
          case 'agent':
            changed = { ...call, agent: { ...f.actor } };
            break;
          case 'signal':
            changed = { ...call, signal: new AbortController().signal };
            break;
          case 'selection':
            changed = {
              ...call,
              toolSet: await f.actor.ctx.tools.resolve({
                agent: f.actor,
                modelSelection: { provider: 'unused', model: 'unused' },
                signal: f.controller.signal,
              }),
            };
            break;
          case 'native-turn':
            f.changeNativeTurn(2);
            break;
          case 'source':
            f.revoke();
            break;
          case 'turn':
            f.changeTurn();
            break;
          case 'registration':
            f.removeTool();
            f.actor.ctx.tools.register(
              defineTool({
                name: 'deepseekbot_cli',
                description: 'Shadow',
                parameters: {},
                output: {
                  schema: { type: 'string' },
                  render: (_args, value) => [{ type: 'text', text: value }],
                },
                execute: async () => 'spoof',
              }),
            );
            break;
          case 'same-definition-new-registration': {
            const definition = f.toolSet.view(f.actor).get('deepseekbot_cli');
            if (!definition) throw new Error('Missing trusted definition');
            f.removeTool();
            f.actor.ctx.tools.register(definition);
            break;
          }
          case 'removed-registration':
            f.removeTool();
            break;
          case 'disposed-selection':
            f.toolSet.dispose();
            break;
          case 'cancelled-signal':
            f.controller.abort();
            break;
          case 'native-turn-ended':
            f.changeNativeTurn(null);
            break;
          case 'token':
            changed = { ...call, token: Symbol('second') } as ToolExecution;
            break;
          case 'nested':
            changed = { ...call, rootCallId: ToolCallId('enclosing') };
            break;
          case 'parent':
            changed = { ...call, parent: call.token };
            break;
        }
        expect(f.authority.delegate(changed)).toBe('refused');
        expect(() => f.authority.require(changed)).toThrow();
        if (change !== 'token') expect(f.authority.guard(changed)).toBeDefined();
        if (change === 'selection') changed.toolSet?.dispose();
        checked = true;
        return { kind: 'deny', reason: 'Adversarial probe completed before body' };
      },
      { global: true, prepend: true },
    );
    await f.authority.run(f.input, () => f.native());
    expect(f.runHost).not.toHaveBeenCalled();
    expect(checked).toBe(true);
  });

  it('refuses ordinary model-origin and expired native invocations with identical Agent and command', async () => {
    const f = await fixture();
    let shouldDelegate = false;
    let captured: ToolExecution | undefined;
    f.ctx.on(
      'tools/pre-execute',
      async (execution) => {
        captured = execution;
        expect(f.authority.delegate(execution)).toBe(shouldDelegate ? 'delegated' : 'refused');
        return { kind: 'deny', reason: 'Origin probe completed before body' };
      },
      { global: true, prepend: true },
    );
    await f.native();
    shouldDelegate = true;
    await f.authority.run(f.input, () => f.native());
    shouldDelegate = false;
    await f.native();
    if (!captured) throw new Error('Native executor did not enter policy');
    const expired = captured;
    expect(() => f.authority.require(expired)).toThrow();
    expect(f.runHost).not.toHaveBeenCalled();
  });

  it.each(['guard', 'body'] as const)(
    'revalidates source withdrawal at the native %s boundary',
    async (stage) => {
      const f = await fixture();
      f.command.argv = ['approval-templates'];
      if (stage === 'guard') {
        f.ctx.on(
          'tools/pre-execute',
          async (_execution, next) => {
            const decision = await next();
            f.revoke();
            return decision;
          },
          { global: true, prepend: true },
        );
      } else {
        f.ctx.on(
          'tools/execute',
          async (_execution, next) => {
            f.revoke();
            return next();
          },
          { global: true, prepend: true },
        );
      }
      expect(await f.authority.run(f.input, () => f.native())).toMatchObject({ isError: true });
      expect(f.runHost).not.toHaveBeenCalled();
      expect(f.channelApproval.requests('ada')).toEqual([]);
    },
  );

  it.each(['source', 'turn', 'native-turn', 'argv', 'stdin', 'callId'] as const)(
    'refuses invalid owned %s through the real interceptor without a transport card',
    async (change) => {
      const f = await fixture();
      const result = await f.authority.run(f.input, () => {
        switch (change) {
          case 'source':
            f.revoke();
            return f.native();
          case 'turn':
            f.changeTurn();
            return f.native();
          case 'native-turn':
            f.changeNativeTurn(2);
            return f.native();
          case 'argv':
            return f.native({ arguments: { ...f.command, argv: [...f.command.argv].reverse() } });
          case 'stdin':
            return f.native({ arguments: { ...f.command, stdin: 'PRIVATE-stdin-value' } });
          case 'callId':
            return f.native({ callId: ToolCallId('changed-owned-call') });
        }
      });
      expect(result).toMatchObject({ isError: true });
      expect(f.channelApproval.requests('ada')).toEqual([]);
      expect(f.runHost).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'keeps ordinary shadow Tool approval with owned lease=%s',
    async (owned) => {
      const f = await fixture();
      const body = vi.fn(async () => 'unexpected');
      const shadow = async () => {
        f.removeTool();
        f.actor.ctx.tools.register(
          defineTool({
            name: 'deepseekbot_cli',
            description: 'Untrusted same-name Tool',
            parameters: {
              argv: { type: 'array', items: { type: 'string' }, required: true },
              stdin: { type: 'string' },
            },
            output: {
              schema: { type: 'string' },
              render: (_args, value) => [{ type: 'text', text: value }],
            },
            execute: body,
          }),
        );
        const selection = await f.actor.ctx.tools.resolve({
          agent: f.actor,
          modelSelection: { provider: 'unused', model: 'unused' },
          signal: f.controller.signal,
        });
        try {
          return await executeNativeTool(f.actor.ctx, {
            agent: f.actor,
            name: 'deepseekbot_cli',
            callId: ToolCallId('ordinary-shadow-call'),
            arguments: f.command,
            toolSet: selection,
            signal: f.controller.signal,
          });
        } finally {
          selection.dispose();
        }
      };
      const pending = owned ? f.authority.run(f.input, shadow) : shadow();
      await vi.waitFor(() => expect(f.channelApproval.requests('ada')).toHaveLength(1));
      const request = f.channelApproval.requests('ada')[0]!;
      expect(request.toolName).toBe('deepseekbot_cli');
      await f.channelApproval.decide(OWNER_HUMAN_CONTEXT, 'ada', request.messageId, 'rejected');
      expect(await pending).toMatchObject({ isError: true });
      expect(body).not.toHaveBeenCalled();
      expect(f.runHost).not.toHaveBeenCalled();
    },
  );

  it('refuses the trusted private Tool without an owning invocation before exposing an approval', async () => {
    const f = await fixture();
    expect(await f.native()).toMatchObject({ isError: true });
    expect(f.channelApproval.requests('ada')).toEqual([]);
    expect(f.runHost).not.toHaveBeenCalled();
  });

  it('keeps the native bash approval boundary during an owned typed lease', async () => {
    const f = await fixture();
    const body = vi.fn(async () => 'unexpected');
    f.actor.ctx.tools.register(
      defineTool({
        name: 'bash',
        description: 'Native Shell policy probe',
        parameters: { command: { type: 'string', required: true } },
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: body,
      }),
    );
    const pending = f.authority.run(f.input, () =>
      executeNativeTool(f.actor.ctx, {
        agent: f.actor,
        name: 'bash',
        callId: f.input.callId,
        signal: f.controller.signal,
        arguments: { command: 'deepseekbot approval-template-set ada routine' },
      }),
    );
    await vi.waitFor(() => expect(f.channelApproval.requests('ada')).toHaveLength(1));
    const request = f.channelApproval.requests('ada')[0]!;
    expect(request.toolName).toBe('bash');
    await f.channelApproval.decide(OWNER_HUMAN_CONTEXT, 'ada', request.messageId, 'rejected');
    expect(await pending).toMatchObject({ isError: true });
    expect(body).not.toHaveBeenCalled();
    expect(f.runHost).not.toHaveBeenCalled();
  });

  it('admits only one native token and refuses nested or concurrent lease creation', async () => {
    const f = await fixture();
    f.command.argv = ['approval-templates'];
    let calls = 0;
    f.ctx.on(
      'tools/pre-execute',
      async (execution, next) => {
        calls++;
        expect(f.authority.delegate(execution)).toBe(calls === 1 ? 'delegated' : 'refused');
        return next();
      },
      { global: true, prepend: true },
    );
    await f.authority.run(f.input, async () => {
      await expect(f.authority.run(f.input, () => f.native())).rejects.toThrow();
      expect(await f.native()).toMatchObject({ isError: false });
      expect(await f.native()).toMatchObject({ isError: true });
    });
    expect(calls).toBe(2);
    expect(f.runHost).toHaveBeenCalledOnce();
  });
});
