import { Context } from '@deepseek-ai/cordis';
import type { Agent, ModelSelection } from '@deepseek-ai/dsh-agent';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it, vi } from 'vitest';
import { installNativeSubagentWake } from '../src/runtime/native-subagent-wake.js';
import type { BotRuntime } from '../src/runtime/bot-runtime.js';

describe('legacy Orchestrator child wake model-capture ordering', () => {
  it('captures the model at Inbox claim before asynchronous prompt preparation', async () => {
    const ctx = new Context();
    const agent = { session: { id: SessionId('parent') } } as Agent;
    const signal = new AbortController().signal;
    const selection: { current: ModelSelection; assembled: ModelSelection | undefined } = {
      current: { provider: 'old-provider', model: 'old-model' },
      assembled: undefined,
    };
    Object.assign(agent, {
      model: {
        current: () => selection.current,
        select: (value: ModelSelection) => {
          selection.current = value;
        },
      },
    });
    const capture = vi.fn(() => {
      agent.model.select({ provider: 'deepseek-official', model: 'deepseek-flash' });
    });
    const prepare = vi.fn(async () => {
      await Promise.resolve();
      return true;
    });
    installNativeSubagentWake(ctx, {
      prepareNativeOrchestratorStep: prepare,
      captureNativeOrchestratorModel: capture,
    } as unknown as BotRuntime);
    try {
      ctx.emit('agent/inbox/claimed', {
        agent,
        turn: 1,
        message: createUserMessage({
          content: [{ type: 'text', text: 'Child report' }],
          source: { kind: 'agent-message', form: 'relay', senderSessionId: SessionId('child') },
        }),
      });
      const captured = agent.model.current();
      expect(capture).toHaveBeenCalledWith('parent');
      expect(prepare).not.toHaveBeenCalled();
      await ctx.waterfall(
        'system-prompt/assemble',
        {} as never,
        { agent, signal } as never,
        async () => ({ variables: {} }) as never,
      );
      expect(prepare).toHaveBeenCalledWith('parent', ['child'], signal);
      expect(captured).toMatchObject({
        provider: 'deepseek-official',
        model: 'deepseek-flash',
      });
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
