import type { SkillRegistryPort, SkillViewPort } from './catalog.js';

export interface SkillAgentPresetsPort<AgentScope extends object> {
  serviceFor(agent: AgentScope, name: 'skills'): SkillRegistryPort | undefined;
  acquireScope(id?: string): Promise<{ key: object } & AsyncDisposable>;
}

export function createSkillViewPort<AgentScope extends object>(options: {
  agentFor(botSlug: string): AgentScope | undefined;
  presetFor(botSlug: string): string;
  agentPresets(): SkillAgentPresetsPort<AgentScope> | undefined;
}): SkillViewPort {
  return async (slug, registry) => {
    const presets = options.agentPresets();
    if (presets === undefined) return { registry, async [Symbol.asyncDispose]() {} };
    const agent = options.agentFor(slug);
    if (agent !== undefined)
      return {
        registry: presets.serviceFor(agent, 'skills') ?? registry,
        scope: agent,
        async [Symbol.asyncDispose]() {},
      };
    const lease = await presets.acquireScope(options.presetFor(slug));
    return {
      registry,
      scope: lease.key,
      [Symbol.asyncDispose]: () => lease[Symbol.asyncDispose](),
    };
  };
}
