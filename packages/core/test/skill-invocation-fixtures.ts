import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import {
  type SkillRegistryDefinition,
  type SkillRegistryPort,
  type SkillViewPort,
} from '../src/skills/catalog.js';

export function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

export function skill(
  name: string,
  source: string,
  path: string,
  content = `Body of ${name}`,
  userInvocable = true,
): SkillRegistryDefinition {
  return {
    name,
    description: `${name} description`,
    source,
    path,
    content,
    invocation: { userInvocable },
  };
}

export function registry(
  host: SkillRegistryDefinition[],
  project: Map<string, SkillRegistryDefinition[]>,
) {
  const view = (cwd?: string, scope?: object) => {
    if (scope === undefined) return host.filter((item) => item.source === 'runtime');
    const local = cwd === undefined ? [] : (project.get(cwd) ?? []);
    const names = new Set(local.map((item) => item.name));
    return [...local, ...host.filter((item) => !names.has(item.name))];
  };
  const port: SkillRegistryPort = {
    async list(options) {
      return view(options?.cwd, options?.scope);
    },
    async get(name, options) {
      return view(options?.cwd, options?.scope).find((item) => item.name === name);
    },
  };
  return port;
}

export const liveAgent = { session: { id: 'ada-orchestrator' } };
export const liveView: SkillViewPort = async (_slug, registry) => ({
  registry,
  scope: liveAgent,
  async [Symbol.asyncDispose]() {},
});
