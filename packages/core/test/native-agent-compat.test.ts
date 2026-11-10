import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolRuntime, defineTool } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { describe, expect, it, vi } from 'vitest';
import {
  HostIncompatibleError,
  executeNativeTool,
  installNativeTools,
  installAgentNativeTools,
  probeHostCapabilities,
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
          expect(probeHostCapabilities(ctx)).toEqual({
            toolPresentation: 'current',
            toolExecution: 'current',
          });
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

  it('passes Agent identity and cancellation only to the selected batch API', async () => {
    const result = { isError: false, value: 'written', content: [] };
    const execute = vi.fn(async () => ({ results: [{ callId: ToolCallId('direct'), result }] }));
    const presentAs = vi.fn();
    const agent = { session: { id: 'direct-agent' } } as Agent;
    const ctx = { tools: { setExecutor: vi.fn(), presentAs, execute } } as unknown as Context;
    const call = { ...input(), agent };
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
      agent,
      signal: call.signal,
    });
    expect(presentAs).not.toHaveBeenCalled();
  });

  it('propagates a legacy refusal without repeating the operation', async () => {
    const refusal = new Error('legacy execution authority unavailable');
    const execute = vi.fn(async () => {
      throw refusal;
    });
    const ctx = { tools: { presentAs: vi.fn(), execute } } as unknown as Context;
    await expect(executeNativeTool(ctx, input())).rejects.toBe(refusal);
    expect(execute).toHaveBeenCalledOnce();
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

  it('reports each Host generation and a Host with neither API', () => {
    const fn = vi.fn();
    expect(
      probeHostCapabilities({ tools: { setExecutor: fn, execute: fn } } as unknown as Context),
    ).toEqual({ toolPresentation: 'current', toolExecution: 'current' });
    expect(
      probeHostCapabilities({ tools: { presentAs: fn, execute: fn } } as unknown as Context),
    ).toEqual({ toolPresentation: 'legacy', toolExecution: 'legacy' });
    expect(probeHostCapabilities({} as Context)).toEqual({
      toolPresentation: 'missing',
      toolExecution: 'missing',
    });
  });

  it('keeps the turn running and warns once when tool presentation is unavailable', async () => {
    const warn = vi.fn();
    const ctx = { tools: { execute: vi.fn() }, logger: { warn } } as unknown as Context;
    const dispose = await installNativeTools(ctx);
    expect(dispose()).toBeUndefined();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toMatch(
      /^botharness\.host_capability\.degraded capability=tools\.presentAs .*reason=missing$/u,
    );
  });

  it('degrades a presentation call whose signature changed and keeps the original error', async () => {
    const warn = vi.fn();
    const presentAs = vi.fn(() => {
      throw new TypeError('mode.toUpperCase is not a function');
    });
    const ctx = { tools: { presentAs }, logger: { warn } } as unknown as Context;
    await expect(installNativeTools(ctx)).resolves.toBeTypeOf('function');
    expect(warn.mock.calls[0]?.[0]).toContain('TypeError: mode.toUpperCase is not a function');
  });

  it('still propagates a presentation refusal', async () => {
    const refusal = new Error('presentation refused');
    const ctx = {
      tools: {
        presentAs: () => {
          throw refusal;
        },
      },
    } as unknown as Context;
    await expect(installNativeTools(ctx)).rejects.toBe(refusal);
  });

  it('fails a direct call with an actionable code and the missing capability when execution is gone', async () => {
    const ctx = { tools: { presentAs: vi.fn() } } as unknown as Context;
    const failure = executeNativeTool(ctx, input());
    await expect(failure).rejects.toBeInstanceOf(HostIncompatibleError);
    await expect(failure).rejects.toThrow(
      /^HOST_INCOMPATIBLE: This Tobs version does not support DSH .+: tools\.execute is unavailable\. Update Tobs, then retry\.$/u,
    );
  });

  it('keeps the original error in a compatibility failure', () => {
    const cause = new TypeError('NativeToolExecutor is not a constructor');
    const error = new HostIncompatibleError('the native tool executor', '0.3.0-rc.1', cause);
    expect(error.code).toBe('HOST_INCOMPATIBLE');
    expect(error.cause).toBe(cause);
    expect(error.message).toBe(
      'HOST_INCOMPATIBLE: This Tobs version does not support DSH 0.3.0-rc.1: the native tool executor is unavailable. Update Tobs, then retry. Original error: TypeError: NativeToolExecutor is not a constructor',
    );
  });
});
