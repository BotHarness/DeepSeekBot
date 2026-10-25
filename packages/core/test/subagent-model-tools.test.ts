import { describe, expect, it, vi } from 'vitest';
import type { Context } from '@deepseek-ai/cordis';
import type { Agent, AgentOptions } from '@deepseek-ai/dsh-agent';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';
import type { SessionId } from '@deepseek-ai/dsh-session';
import type { SubagentActivation, SubagentActivationSpec } from '@deepseek-ai/dsh-subagent';
import type { ToolDefinition } from '@deepseek-ai/dsh-tools';

import type { PersonaBotModelPlan } from '../src/models/presets.js';
import {
  installBotSubagentModelTools,
  type BotSubagentPresetConfig,
} from '../src/runtime/subagent-model-tools.js';

const CHILD_ID = 'child-1' as SessionId;

const plan: PersonaBotModelPlan = {
  revision: 1,
  sourcePresetId: 'preset',
  sourcePresetName: 'QA',
  appliedAt: '2026-09-30T00:00:00.000Z',
  orchestrator: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
  assignmentDefault: { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' },
  assignmentModels: [
    { provider: 'deepseek', model: 'pro', allowedEfforts: ['off', 'low'], defaultEffort: 'off' },
    { provider: 'openai', model: 'sol', allowedEfforts: ['high'], defaultEffort: 'high' },
  ],
};

const parentOptions: AgentOptions = {
  provider: 'deepseek',
  model: 'flash',
  reasoningEffort: ReasoningEffortId('low'),
  maxTokens: 4096,
};

const presetConfig: BotSubagentPresetConfig = {
  agentPreset: 'reviewer',
  allowedAgentPresets: ['reviewer', 'qa'],
};

function route(provider: string, model: string, reasoningEffort?: string) {
  return {
    provider,
    model,
    ...(reasoningEffort === undefined
      ? {}
      : { reasoningEffort: ReasoningEffortId(reasoningEffort) }),
  };
}

function presetRegistry(known: readonly string[]) {
  return {
    defaultId: 'system-default',
    readDocument: vi.fn(async (id: string) => {
      if (!known.includes(id)) throw new Error(`Agent preset "${id}" does not exist`);
      return { id };
    }),
  };
}

function createAgent(
  overrides: {
    options?: AgentOptions;
    requestHeader?: { provider: string; model: string; reasoningEffort?: string };
  } = {},
): Agent {
  const options = overrides.options ?? parentOptions;
  return {
    id: 'parent',
    options,
    session: {
      id: 'parent',
      header: { id: 'parent', cwd: 'C:/workspace' },
      requestHeader: () => {
        const header = overrides.requestHeader;
        if (header === undefined) return undefined;
        return {
          config: {
            provider: header.provider,
            model: header.model,
            ...(header.reasoningEffort === undefined
              ? {}
              : { reasoningEffort: ReasoningEffortId(header.reasoningEffort) }),
          },
        };
      },
    },
  } as unknown as Agent;
}

interface HarnessOptions {
  plan?: PersonaBotModelPlan;
  presets?: ReturnType<typeof presetRegistry>;
  config?: BotSubagentPresetConfig;
  subagents?: boolean;
  llm?: boolean;
  maxDepth?: number;
}

function createHarness(options: HarnessOptions = {}) {
  const definitions = new Map<string, ToolDefinition>();
  const guards: Array<(execution: { name: string }) => string | undefined> = [];
  const sections: Array<{ name: string; order: number; text: string }> = [];
  const services: Record<string, unknown> = {};
  const startActivation = vi.fn(
    async (_spec: SubagentActivationSpec): Promise<SubagentActivation> => ({
      childId: CHILD_ID,
      result: Promise.resolve({
        stopReason: 'completed' as const,
        output: [{ type: 'text' as const, text: 'done' }],
      }),
      dispose: vi.fn(async () => undefined),
    }),
  );
  const resolveMaxDepth = vi.fn(() => options.maxDepth ?? 1);
  const resolveCallConfig = vi.fn(async (_config: unknown, _signal: AbortSignal) => undefined);
  services['agentPresets'] = options.presets ?? presetRegistry(['system-default']);
  if (options.subagents !== false) {
    services['subagents'] = { resolveMaxDepth, startActivation };
  }
  if (options.llm !== false) services['llm'] = { resolveCallConfig };
  const ctx = {
    get(name: string) {
      return services[name];
    },
    logger: { warn: vi.fn() },
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
    systemPrompt: {
      section(section: { name: string; order: number; text: string }) {
        sections.push(section);
        return () => undefined;
      },
    },
  } as unknown as Context;
  return {
    ctx,
    services,
    definitions,
    guards,
    sections,
    startActivation,
    resolveMaxDepth,
    resolveCallConfig,
    install(config: BotSubagentPresetConfig = options.config ?? {}) {
      return installBotSubagentModelTools(ctx, () => options.plan, config);
    },
  };
}

type Harness = ReturnType<typeof createHarness>;

function toolExecution(agent: Agent, signal: AbortSignal = new AbortController().signal) {
  return { agent, signal } as Parameters<ToolDefinition['execute']>[1];
}

async function callTool(
  harness: Harness,
  name: string,
  args: Record<string, unknown>,
  agent: Agent = createAgent(),
): Promise<unknown> {
  const definition = harness.definitions.get(name);
  if (definition === undefined) throw new Error(`Tool ${name} is not registered`);
  return definition.execute(args, toolExecution(agent));
}

function startedActivation(harness: Harness, index = 0): SubagentActivationSpec {
  const spec = harness.startActivation.mock.calls[index]?.[0];
  if (spec === undefined) throw new Error(`Subagent activation #${index} was not started`);
  return spec;
}

function parameterNames(definition: ToolDefinition): string[] {
  const parameters = definition.parameters as { properties?: Record<string, unknown> };
  return Object.keys(parameters.properties ?? {});
}

function presetParameter(definition: ToolDefinition) {
  const parameters = definition.parameters as {
    properties?: Record<string, { type?: string; enum?: unknown[] }>;
  };
  return parameters.properties?.['agent_preset'];
}

describe('Bot-owned DSH Subagent tools', () => {
  it('registers its tool surface only after the asynchronous installation settles', async () => {
    const harness = createHarness();

    const installing = harness.install();
    expect(harness.definitions.size).toBe(0);
    expect(harness.guards).toHaveLength(0);
    expect(harness.sections).toHaveLength(0);

    await expect(installing).resolves.toBeUndefined();
    expect([...harness.definitions.keys()].sort()).toEqual([
      'bot_subagent',
      'bot_subagent_fork',
      'list_bot_subagent_models',
    ]);
    expect(harness.guards).toHaveLength(1);
    expect(harness.sections).toHaveLength(1);
    expect(harness.sections[0]?.name).toBe('botharness:subagent-model-route');
    expect(harness.sections[0]?.text).toContain('bot_subagent');
    expect(harness.sections[0]?.text).toContain('list_bot_subagent_models');
    expect(harness.sections[0]?.text).toContain(
      'Native Agent presets select child tools and persona, not the LLM route',
    );
    expect(harness.sections[0]?.text).toContain('A fork always inherits the parent preset');
  });

  it('inherits the parent route and explicitly selects the current system default preset', async () => {
    const harness = createHarness();
    await harness.install();
    const agent = createAgent({ requestHeader: { provider: 'deepseek', model: 'sol' } });

    const result = await callTool(
      harness,
      'bot_subagent',
      { description: 'Inherit', prompt: 'Do the inherited work' },
      agent,
    );
    expect(result).toContain(`Started Subagent ${CHILD_ID} on deepseek/sol`);

    const spec = startedActivation(harness);
    expect(spec.provider).toBe('spawn');
    expect(spec.delivery).toBe('parent');
    expect(spec.request.parent).toBe(agent);
    expect(spec.request.agentOptions).toEqual({
      provider: 'deepseek',
      model: 'sol',
      maxTokens: 4096,
    });
    expect(spec.request.maxDepth).toBe(1);
    expect(spec.request.agentPreset).toBe('system-default');
    expect(parameterNames(harness.definitions.get('bot_subagent')!)).not.toContain('agent_preset');
    expect(parameterNames(harness.definitions.get('bot_subagent_fork')!)).not.toContain(
      'agent_preset',
    );
    expect(harness.resolveCallConfig).toHaveBeenCalledWith(
      route('deepseek', 'sol'),
      expect.any(AbortSignal),
    );
  });

  it('reads the system default at each spawn and refuses a missing registry', async () => {
    const presets = presetRegistry(['system-default', 'new-default']);
    const harness = createHarness({ presets });
    await harness.install();
    await callTool(harness, 'bot_subagent', { description: 'First', prompt: 'Work' });
    presets.defaultId = 'new-default';
    await callTool(harness, 'bot_subagent', { description: 'Second', prompt: 'Work' });
    expect(startedActivation(harness, 0).request.agentPreset).toBe('system-default');
    expect(startedActivation(harness, 1).request.agentPreset).toBe('new-default');
    delete harness.services['agentPresets'];
    await expect(
      callTool(harness, 'bot_subagent', { description: 'Missing', prompt: 'Work' }),
    ).rejects.toThrow('system default preset requires the DSH agent-presets service');
    expect(harness.startActivation).toHaveBeenCalledTimes(2);
  });

  it('sends the configured default preset when a call omits agent_preset', async () => {
    const presets = presetRegistry(['reviewer', 'qa']);
    const harness = createHarness({ presets, config: presetConfig });
    await harness.install();

    expect(presets.readDocument.mock.calls.map(([id]) => id)).toEqual(['reviewer', 'qa']);

    const spawn = harness.definitions.get('bot_subagent')!;
    expect(spawn.description).toContain('configured native Agent preset reviewer');
    expect(spawn.description).not.toMatch(/system default/i);
    expect(presetParameter(spawn)?.type).toBe('string');
    expect(presetParameter(spawn)?.enum).toEqual(['reviewer', 'qa']);

    const result = await callTool(harness, 'bot_subagent', {
      description: 'Configured default',
      prompt: 'Use the configured default',
    });
    expect(result).toContain(`Started Subagent ${CHILD_ID}`);
    const spec = startedActivation(harness);
    expect(spec.request.agentPreset).toBe('reviewer');
    expect(spec.request.agentOptions).toEqual(parentOptions);
    expect(harness.resolveCallConfig).toHaveBeenCalledWith(
      route('deepseek', 'flash', 'low'),
      expect.any(AbortSignal),
    );
  });

  it('passes an explicit allowlisted agent_preset through to the native request', async () => {
    const presets = presetRegistry(['reviewer', 'qa']);
    const harness = createHarness({ presets, config: presetConfig });
    await harness.install();

    const result = await callTool(harness, 'bot_subagent', {
      description: 'Selected preset',
      prompt: 'Run under the selected preset',
      agent_preset: 'qa',
    });
    expect(result).toContain(`Started Subagent ${CHILD_ID}`);

    const spec = startedActivation(harness);
    expect(spec.request.agentPreset).toBe('qa');
    expect(spec.request.agentPreset).not.toBe('reviewer');
    expect(presets.readDocument).toHaveBeenCalledTimes(2);
    expect(harness.resolveCallConfig).toHaveBeenCalledWith(
      route('deepseek', 'flash', 'low'),
      expect.any(AbortSignal),
    );
  });

  it('does not invent a default preset from the allowlist', async () => {
    const presets = presetRegistry(['qa']);
    const harness = createHarness({ presets, config: { allowedAgentPresets: ['qa'] } });
    await harness.install();

    await callTool(harness, 'bot_subagent', { description: 'No default', prompt: 'Inherit' });
    expect(startedActivation(harness, 0).request.agentPreset).toBe('system-default');

    await callTool(harness, 'bot_subagent', {
      description: 'Explicit',
      prompt: 'Select',
      agent_preset: 'qa',
    });
    expect(startedActivation(harness, 1).request.agentPreset).toBe('qa');
  });

  it('rejects unauthorized, empty, and disabled agent_preset selection before starting a child', async () => {
    const presets = presetRegistry(['reviewer', 'qa']);
    const harness = createHarness({ presets, config: presetConfig });
    await harness.install();

    for (const agentPreset of ['intruder', '']) {
      await expect(
        callTool(harness, 'bot_subagent', {
          description: 'Forbidden preset',
          prompt: 'Do not run',
          agent_preset: agentPreset,
        }),
      ).rejects.toThrow(/"agent_preset" must be one of \["reviewer","qa"\]/);
    }
    expect(harness.startActivation).not.toHaveBeenCalled();
    expect(harness.resolveCallConfig).not.toHaveBeenCalled();

    const disabledPresets = presetRegistry(['reviewer']);
    const disabled = createHarness({
      presets: disabledPresets,
      config: { agentPreset: 'reviewer' },
    });
    await disabled.install();
    expect(presetParameter(disabled.definitions.get('bot_subagent')!)).toBeUndefined();
    await expect(
      callTool(disabled, 'bot_subagent', {
        description: 'Disabled selection',
        prompt: 'Do not run',
        agent_preset: 'qa',
      }),
    ).rejects.toThrow('agent_preset selection is disabled for this tool instance');
    expect(disabled.startActivation).not.toHaveBeenCalled();
  });

  it('rejects independent preset selection on forks while still inheriting the parent preset', async () => {
    const presets = presetRegistry(['reviewer', 'qa']);
    const harness = createHarness({ presets, config: presetConfig });
    await harness.install();

    await expect(
      callTool(harness, 'bot_subagent_fork', {
        description: 'Fork with preset',
        prompt: 'Do not run',
        agent_preset: 'reviewer',
      }),
    ).rejects.toThrow('agent_preset is not supported by bot_subagent_fork');
    expect(harness.startActivation).not.toHaveBeenCalled();
    expect(parameterNames(harness.definitions.get('bot_subagent_fork')!)).not.toContain(
      'agent_preset',
    );

    const result = await callTool(harness, 'bot_subagent_fork', {
      description: 'Inherited fork',
      prompt: 'Continue the task',
    });
    expect(result).toContain(`Subagent ${CHILD_ID} completed.`);
    const spec = startedActivation(harness);
    expect(spec.provider).toBe('fork');
    expect(spec.delivery).toBe('caller');
    expect('agentPreset' in spec.request).toBe(false);
  });

  it('keeps the LLM route independent from the Agent preset', async () => {
    const presets = presetRegistry(['reviewer', 'qa']);
    const harness = createHarness({ plan, presets, config: presetConfig });
    await harness.install();
    const agent = createAgent();

    const explicit = await callTool(
      harness,
      'bot_subagent',
      {
        description: 'Explicit route and preset',
        prompt: 'Do the work',
        provider: 'openai',
        model: 'sol',
        reasoning_effort: 'high',
        agent_preset: 'qa',
      },
      agent,
    );
    expect(explicit).toContain(`Started Subagent ${CHILD_ID} on openai/sol`);
    const explicitSpec = startedActivation(harness, 0);
    expect(explicitSpec.request.agentPreset).toBe('qa');
    expect(explicitSpec.request.agentOptions).toEqual({
      provider: 'openai',
      model: 'sol',
      reasoningEffort: ReasoningEffortId('high'),
      maxTokens: 4096,
    });
    expect(harness.resolveCallConfig).toHaveBeenCalledWith(
      route('openai', 'sol', 'high'),
      expect.any(AbortSignal),
    );
    expect(harness.resolveCallConfig.mock.calls[0]?.[0]).not.toHaveProperty('agentPreset');

    await expect(
      callTool(
        harness,
        'bot_subagent',
        {
          description: 'Disallowed route',
          prompt: 'Do not run',
          provider: 'deepseek',
          model: 'flash',
          agent_preset: 'qa',
        },
        agent,
      ),
    ).rejects.toThrow('Assignment model deepseek/flash is not allowed');
    expect(harness.startActivation).toHaveBeenCalledTimes(1);

    const inherited = await callTool(
      harness,
      'bot_subagent',
      { description: 'Assignment default', prompt: 'Do the work' },
      agent,
    );
    expect(inherited).toContain('outside the current Assignment set');
    const fallbackSpec = startedActivation(harness, 1);
    expect(fallbackSpec.request.agentPreset).toBe('reviewer');
    expect(fallbackSpec.request.agentOptions).toEqual({
      provider: 'deepseek',
      model: 'pro',
      reasoningEffort: ReasoningEffortId('off'),
      maxTokens: 4096,
    });
    expect(harness.resolveCallConfig).toHaveBeenNthCalledWith(
      2,
      route('deepseek', 'pro', 'off'),
      expect.any(AbortSignal),
    );
  });

  it('inherits parent authority without widening it and keeps native Subagent tools guarded', async () => {
    const harness = createHarness();
    await harness.install();

    await callTool(harness, 'bot_subagent', {
      description: 'Inherited authority',
      prompt: 'Do the work',
    });
    const spec = startedActivation(harness);
    expect(spec.request.agentOptions).toEqual(parentOptions);
    expect(Object.keys(spec.request).sort()).toEqual([
      'agentOptions',
      'agentPreset',
      'maxDepth',
      'parent',
      'prompt',
    ]);
    expect(spec.request.maxDepth).toBe(1);

    expect(harness.guards).toHaveLength(1);
    const guard = harness.guards[0]!;
    for (const nativeName of ['subagent', 'subagent_fork', 'list_subagent_models']) {
      expect(guard({ name: nativeName })).toContain('Bot-scoped');
    }
    for (const allowedName of ['bot_subagent', 'bot_subagent_fork', 'list_bot_subagent_models']) {
      expect(guard({ name: allowedName })).toBeUndefined();
    }
    expect(guard({ name: 'read_file' })).toBeUndefined();
  });

  it('refuses a preset configuration without the native services it needs', async () => {
    const noPresets = createHarness({ config: { agentPreset: 'reviewer' } });
    delete noPresets.services['agentPresets'];
    await expect(noPresets.install()).rejects.toThrow('requires the DSH agent-presets service');
    expect(noPresets.definitions.size).toBe(0);

    const presets = presetRegistry(['reviewer']);
    const noSubagents = createHarness({
      plan,
      presets,
      config: { agentPreset: 'reviewer' },
      subagents: false,
    });
    await expect(noSubagents.install()).rejects.toThrow('DSH Subagent service is unavailable');
    expect(noSubagents.definitions.size).toBe(0);
  });

  it('stays inert without the Subagent service when no preset is configured', async () => {
    const harness = createHarness({ subagents: false });
    await expect(harness.install()).resolves.toBeUndefined();
    expect(harness.definitions.size).toBe(0);
    expect(harness.guards).toHaveLength(0);
    expect(harness.sections).toHaveLength(0);
  });

  it('rejects execution when the LLM service is gone', async () => {
    const harness = createHarness();
    await harness.install();
    Reflect.deleteProperty(harness.services, 'llm');

    await expect(
      callTool(harness, 'bot_subagent', { description: 'No LLM', prompt: 'Do not run' }),
    ).rejects.toThrow('DSH LLM service is unavailable');
    expect(harness.startActivation).not.toHaveBeenCalled();
  });

  it('rejects preset ids that the native registry does not know', async () => {
    const presets = presetRegistry(['reviewer']);
    const harness = createHarness({ presets });

    await expect(harness.install({ agentPreset: 'ghost' })).rejects.toThrow(
      'Agent preset "ghost" does not exist',
    );
    expect(harness.definitions.size).toBe(0);

    await expect(harness.install({ allowedAgentPresets: ['reviewer', 'ghost'] })).rejects.toThrow(
      'Agent preset "ghost" does not exist',
    );
    expect(harness.definitions.size).toBe(0);
  });

  it('rejects invalid preset configuration at install time', async () => {
    const presets = presetRegistry(['reviewer']);
    const harness = createHarness({ presets });

    await expect(
      harness.install({ agentPreset: 'ghost', allowedAgentPresets: ['reviewer'] }),
    ).rejects.toThrow('agentPreset must be included in allowedAgentPresets');
    await expect(harness.install({ allowedAgentPresets: [] })).rejects.toThrow(
      'allowedAgentPresets must contain non-empty preset ids',
    );
    await expect(
      harness.install({ allowedAgentPresets: ['reviewer', 'reviewer'] }),
    ).rejects.toThrow('allowedAgentPresets contains duplicate preset ids');
    await expect(harness.install({ agentPreset: '' })).rejects.toThrow(
      'agentPreset must not be empty',
    );
    expect(harness.definitions.size).toBe(0);
  });

  it('fails before creating a child when the current default cannot resolve', async () => {
    const harness = createHarness({ plan });
    harness.resolveCallConfig.mockImplementationOnce(async () => {
      throw new Error('Selected model is unavailable');
    });
    await harness.install();

    await expect(
      callTool(harness, 'bot_subagent', {
        description: 'Unavailable default',
        prompt: 'Do not run',
      }),
    ).rejects.toThrow('Selected model is unavailable');
    expect(harness.resolveCallConfig).toHaveBeenCalledWith(
      route('deepseek', 'pro', 'off'),
      expect.any(AbortSignal),
    );
    expect(harness.startActivation).not.toHaveBeenCalled();
  });

  it('lists inheritance without a Model Preset and the Assignment set when one is applied', async () => {
    const inherit = createHarness();
    await inherit.install();
    expect(await callTool(inherit, 'list_bot_subagent_models', {})).toContain(
      'inherit the parent route',
    );

    const applied = createHarness({ plan });
    await applied.install();
    const listed = await callTool(applied, 'list_bot_subagent_models', {});
    expect(typeof listed).toBe('string');
    expect(JSON.parse(listed as string)).toEqual({
      default: plan.assignmentDefault,
      allowed: plan.assignmentModels,
      parentSession: 'parent',
    });
  });
});
