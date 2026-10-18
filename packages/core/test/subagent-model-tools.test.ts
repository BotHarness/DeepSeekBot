import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

import type { PersonaBotModelPlan } from '../src/models/presets.js';
import { installBotSubagentModelTools } from '../src/runtime/subagent-model-tools.js';

const plan: PersonaBotModelPlan = {
  revision: 1,
  sourcePresetId: 'preset',
  sourcePresetName: 'QA',
  appliedAt: '2026-09-30T00:00:00.000Z',
  orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
  assignmentDefault: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
  assignmentModels: [
    { provider: 'deepseek', model: 'pro', allowedEfforts: ['off'], defaultEffort: 'off' },
  ],
};

describe('Bot-owned DSH Subagent tools', () => {
  it('fails before creating a child when the current default cannot resolve', async () => {
    const definitions = new Map<string, ToolDefinition>();
    const startActivation = vi.fn();
    const resolveCallConfig = vi.fn().mockRejectedValue(new Error('Selected model is unavailable'));
    const guards: Array<(execution: { name: string }) => string | undefined> = [];
    const context = {
      get(name: string) {
        if (name === 'subagents') return { resolveMaxDepth: () => 1, startActivation };
        if (name === 'llm') return { resolveCallConfig };
        return undefined;
      },
      tools: {
        register(definition: ToolDefinition) {
          definitions.set(definition.name, definition);
          return () => undefined;
        },
        guard(check: (execution: { name: string }) => string | undefined) {
          guards.push(check);
          return () => undefined;
        },
      },
      systemPrompt: { section: () => () => undefined },
    } as unknown as Context;
    const agent = {
      id: 'parent',
      options: {
        provider: 'old-provider',
        model: 'old-model',
        reasoningEffort: ReasoningEffortId('high'),
      },
      session: { id: 'parent', requestHeader: () => undefined },
    } as unknown as Agent;
    installBotSubagentModelTools(context, agent, () => plan);

    const tool = definitions.get('bot_subagent');
    expect(tool).toBeDefined();
    await expect(
      tool!.execute({ description: 'Unavailable default', prompt: 'Do not run' }, {
        agent,
        signal: new AbortController().signal,
      } as Parameters<ToolDefinition['execute']>[1]),
    ).rejects.toThrow('Selected model is unavailable');
    expect(resolveCallConfig).toHaveBeenCalledWith(
      { provider: 'deepseek', model: 'pro', reasoningEffort: ReasoningEffortId('off') },
      expect.any(AbortSignal),
    );
    expect(startActivation).not.toHaveBeenCalled();
    expect(guards[0]?.({ name: 'subagent' })).toContain('Bot-scoped');
    expect(guards[0]?.({ name: 'bot_subagent' })).toBeUndefined();
  });
});
