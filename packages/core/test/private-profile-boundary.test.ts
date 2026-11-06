import { Context } from '@deepseek-ai/cordis';
import { resolve } from 'node:path';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';
import { describe, expect, it, vi } from 'vitest';
import { mountPrivateInputs } from '../src/credentials/mount.js';
import type { BotHarnessCore } from '../src/plugin.js';

async function fixture(keys: string[] = []) {
  const ctx = new Context();
  let guard!: (call: { name: string; agent?: Agent; arguments?: unknown }) => string | undefined;
  ctx.provide('tools', {
    register: vi.fn(),
    get: vi.fn(),
    guard: (callback: typeof guard) => {
      guard = callback;
      return () => undefined;
    },
  });
  ctx.provide('credentials', { listRecords: async () => keys.map((key) => ({ key })) } as never);
  const contribute = vi.fn<BotHarnessCore['contributeBotAgentSetup']>(
    (_callback) => () => undefined,
  );
  const core = {
    ownership: {
      resolve: (id: string) =>
        id === 'owned'
          ? { botSlug: 'ada', rootRole: 'orchestrator' }
          : id === 'assignment'
            ? { botSlug: 'ada', rootRole: 'assignment' }
            : undefined,
    },
    contributeBotAgentSetup: contribute,
  } as unknown as BotHarnessCore;
  mountPrivateInputs(ctx, core, undefined, undefined, '/qa/dsh-home');
  await vi.waitFor(() => expect(guard({ name: 'read' })).toBeUndefined());
  return { ctx, guard, contribute };
}

describe('secret input capability boundary', () => {
  it('keeps ordinary Host tools, with secret input registered and stored grants not locking Shell', async () => {
    for (const keys of [[], ['botharness-private/grant-synthetic']]) {
      const ordinary = await fixture(keys);
      expect(ordinary.guard({ name: 'mcp_example' })).toBeUndefined();
      expect(
        ordinary.guard({ name: 'read', arguments: { path: '/qa/project/a.txt' } }),
      ).toBeUndefined();
      expect(
        ordinary.guard({ name: 'bash', arguments: { command: 'ls /qa/project' } }),
      ).toBeUndefined();
      expect(ordinary.contribute).toHaveBeenCalledOnce();
      await ordinary.ctx.fiber.dispose();
    }
  });

  it('refuses Agent access to the native credential store', async () => {
    const f = await fixture();
    const denied = 'native credential store';
    expect(
      f.guard({ name: 'read', arguments: { path: '/qa/dsh-home/.credentials.yaml' } }),
    ).toContain(denied);
    expect(
      f.guard({ name: 'edit', arguments: { file_path: '/qa/dsh-home/.credentials.yaml' } }),
    ).toContain(denied);
    expect(
      f.guard({ name: 'grep', arguments: { pattern: 'key', path: '/qa/dsh-home' } }),
    ).toContain(denied);
    expect(f.guard({ name: 'glob', arguments: { pattern: '**/.credentials.yaml' } })).toContain(
      denied,
    );
    expect(
      f.guard({ name: 'bash', arguments: { command: 'cat /qa/dsh-home/.credentials.yaml' } }),
    ).toContain(denied);
    expect(f.guard({ name: 'bash', arguments: { command: 'cat ~/.dsh/.cred*' } })).toContain(
      denied,
    );
    expect(
      f.guard({ name: 'bash', arguments: { command: `ls -la '${resolve('/qa/dsh-home')}'` } }),
    ).toContain(denied);
    for (const name of ['bash', 'pwsh']) {
      expect(
        f.guard({ name, arguments: { command: `echo '${resolve('/qa/dsh-home')}'` } }),
      ).toBeUndefined();
    }
    expect(
      f.guard({ name: 'bash', arguments: { command: 'ls /qa/dsh-home/botharness/bots' } }),
    ).toBeUndefined();
    expect(
      f.guard({
        name: 'read',
        arguments: { path: '/qa/dsh-home/botharness/bots/ada/memory/MEMORY.md' },
      }),
    ).toBeUndefined();
    await f.ctx.fiber.dispose();
  });

  it('compiles the dynamic field declaration with the pinned native schema DSL', async () => {
    const f = await fixture();
    const agentRoot = new Context();
    const agent = { session: { id: 'owned' } } as Agent;
    const tools: ToolDefinition[] = [];
    agentRoot.provide('tools', {
      register: (tool: ToolDefinition) => {
        tools.push(tool);
        return () => undefined;
      },
    } as never);
    const scope = createScope(agentRoot, agent);
    const agentCtx = scope.ctx;
    const setup = f.contribute.mock.calls[0]![0] as unknown as (
      ctx: Context,
      agent: Agent,
      info: { rootRole: string },
    ) => void;
    setup(agentCtx, agent, { rootRole: 'orchestrator' });
    const request = tools.find((tool) => tool.name === 'ask_secret')!;
    expect(request.parameters).toMatchObject({
      properties: {
        fields: { items: { required: ['id', 'label', 'required'], additionalProperties: false } },
      },
    });
    await scope.dispose();
    await agentRoot.fiber.dispose();
    await f.ctx.fiber.dispose();
  });
});
