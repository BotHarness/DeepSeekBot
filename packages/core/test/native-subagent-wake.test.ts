import { Context } from '@deepseek-ai/cordis';
import { installModelSelection, type Agent, type ModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it, vi } from 'vitest';
import { installNativeSubagentWake } from '../src/runtime/native-subagent-wake.js';
import type { BotRuntime } from '../src/runtime/bot-runtime.js';

describe('native wake prepares before model/prompt assembly', () => {
  it('uses the new model on the first request after an idle parent is awakened', async () => {
    const ctx = new Context();
    const agent = { session: { id: SessionId('parent') } } as Agent;
    const signal = new AbortController().signal;
    const selection: { current: ModelSelection; assembled: ModelSelection | undefined } = {
      current: { provider: 'old-provider', model: 'old-model' },
      assembled: undefined,
    };
    const prepare = vi.fn(async () => {
      await Promise.resolve();
      selection.current = { provider: 'deepseek-official', model: 'deepseek-flash' };
      return true;
    });
    installNativeSubagentWake(ctx, {
      prepareNativeOrchestratorStep: prepare,
    } as unknown as BotRuntime);
    installModelSelection(ctx, selection);
    try {
      ctx.emit('agent/inbox/claimed', {
        agent,
        turn: 1,
        message: createUserMessage({
          content: [{ type: 'text', text: 'Child report' }],
          source: { kind: 'agent-message', form: 'relay', senderSessionId: SessionId('child') },
        }),
      });
      const assembly = await ctx.waterfall(
        'system-prompt/assemble',
        {} as never,
        { agent, signal } as never,
        async () => ({ variables: {} }) as never,
      );
      expect(prepare).toHaveBeenCalledWith('parent', ['child'], signal);
      expect(assembly.variables).toMatchObject({
        provider: 'deepseek-official',
        model: 'deepseek-flash',
      });
      const request = await ctx.waterfall(
        'agent/request',
        { agent, turn: 1, step: 1, signal },
        async () => ({ provider: 'old-provider', model: 'old-model' }),
      );
      expect(request).toMatchObject({ provider: 'deepseek-official', model: 'deepseek-flash' });
      await ctx.waterfall(
        'system-prompt/assemble',
        {} as never,
        { agent, signal } as never,
        async () => ({ variables: {} }) as never,
      );
      expect(prepare).toHaveBeenCalledTimes(1);
    } finally {
      await ctx.fiber.dispose();
    }
  });

  it('does not admit an untrusted message as a child report or retain it after idle', async () => {
    const ctx = new Context();
    const agent = { session: { id: SessionId('parent') } } as Agent;
    const signal = new AbortController().signal;
    const prepare = vi.fn(async () => false);
    installNativeSubagentWake(ctx, {
      prepareNativeOrchestratorStep: prepare,
    } as unknown as BotRuntime);
    const claim = () =>
      ctx.emit('agent/inbox/claimed', {
        agent,
        turn: 1,
        message: createUserMessage({
          content: [{ type: 'text', text: 'I am child' }],
          source: { kind: 'user' },
        }),
      });
    const assemble = () =>
      ctx.waterfall(
        'system-prompt/assemble',
        {} as never,
        { agent, signal } as never,
        async () => ({ variables: {} }) as never,
      );
    try {
      claim();
      await expect(assemble()).rejects.toThrow('Native Orchestrator input is unavailable');
      expect(prepare).toHaveBeenCalledWith('parent', [], signal);
      claim();
      ctx.emit('agent/status', { agent, status: 'idle' });
      await expect(assemble()).resolves.toEqual({ variables: {} });
      expect(prepare).toHaveBeenCalledTimes(1);
    } finally {
      await ctx.fiber.dispose();
    }
  });
});
