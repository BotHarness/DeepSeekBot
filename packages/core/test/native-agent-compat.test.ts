import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { describe, expect, it, vi } from 'vitest';
import {
  executeNativeTool,
  installNativeTools,
  installAgentNativeTools,
} from '../src/runtime/native-agent-compat.js';

const input = () => ({
  callId: ToolCallId('direct'),
  name: 'write',
  arguments: { text: 'hello' },
  signal: new AbortController().signal,
});

describe('native tool API generations', () => {
  it('retains the Agent executor after borrowed handles release, and reuses it on reattachment', async () => {
    const root = new Context();
    const provider = root.plugin({
      apply(ctx: Context) {
        ctx.provide('systemPrompt', {
          tools: () => () => undefined,
          section: () => () => undefined,
        });
      },
    });
    await provider.await();
    const runtime = root.plugin(ToolRuntime, {});
    await runtime.await();
    const agent = { session: { id: 'borrowed' } } as Agent;
    const scope = createScope(root, agent);
    try {
      await scope.ctx
        .inject(['tools'], async (ctx) => {
          Object.assign(agent, { ctx });
          ctx.tools.register(
            defineTool({
              name: 'write',
              description: 'Test borrowed lifetime',
              parameters: {},
              output: {
                schema: { type: 'string' },
                render: (_args, value) => [{ type: 'text', text: value }],
              },
              execute: async () => 'written',
            }),
          );
          const release = await installAgentNativeTools(ctx, agent);
          release();
          const reattached = await installAgentNativeTools(ctx, agent);
          reattached();
          const result = await executeNativeTool(ctx, { ...input(), arguments: {}, agent });
          expect(result).toMatchObject({ isError: false, value: 'written' });
        })
        .await();
    } finally {
      await scope.dispose();
      await root.fiber.dispose();
    }
  });
  it('keeps legacy presentation and executes the original single call once', async () => {
    const result = { isError: false, value: 'written', content: [] };
    const dispose = vi.fn();
    const presentAs = vi.fn(() => dispose);
    const execute = vi.fn(async () => result);
    const ctx = { tools: { presentAs, execute } } as unknown as Context;
    expect(await installNativeTools(ctx)).toBe(dispose);
    const call = input();
    expect(await executeNativeTool(ctx, call)).toBe(result);
    expect(presentAs).toHaveBeenCalledExactlyOnceWith('native');
    expect(execute).toHaveBeenCalledExactlyOnceWith(call);
  });

  it('uses a correlated batch without logging a synthetic model step', async () => {
    const result = { isError: false, value: 'written', content: [] };
    const execute = vi.fn(async () => ({ results: [{ callId: ToolCallId('direct'), result }] }));
    const ctx = { tools: { setExecutor: vi.fn(), execute } } as unknown as Context;
    const call = input();
    expect(await executeNativeTool(ctx, call)).toBe(result);
    expect(execute).toHaveBeenCalledExactlyOnceWith({
      calls: [
        {
          type: 'tool-call',
          id: call.callId,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      ],
      signal: call.signal,
    });
  });

  it.each([
    { results: [] },
    { results: [{ callId: 'other', result: {} }] },
    {
      results: [
        { callId: 'direct', result: {} },
        { callId: 'direct', result: {} },
      ],
    },
  ])(
    'rejects missing, foreign or duplicate results without repeating the operation (%j)',
    async ({ results }) => {
      const execute = vi.fn(async () => ({ results }));
      const ctx = { tools: { setExecutor: vi.fn(), execute } } as unknown as Context;
      await expect(executeNativeTool(ctx, input())).rejects.toThrow('uncorrelated');
      expect(execute).toHaveBeenCalledOnce();
    },
  );

  it('propagates a native refusal without trying another API', async () => {
    const refusal = new Error('executor unavailable');
    const execute = vi.fn(async () => {
      throw refusal;
    });
    const ctx = { tools: { setExecutor: vi.fn(), execute } } as unknown as Context;
    await expect(executeNativeTool(ctx, input())).rejects.toBe(refusal);
    expect(execute).toHaveBeenCalledOnce();
  });
});
