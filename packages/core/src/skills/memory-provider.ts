import type { Context } from '@deepseek-ai/cordis';
import { dirname } from 'node:path';

import type { SkillRegistryDefinition } from './catalog.js';
import { readWorkspaceSkills } from './workspace.js';

export const MEMORY_SKILL_PROVIDER = 'botharness-bot-memory';
export const MEMORY_SKILL_SOURCE = 'bot-memory';

interface LookupOptions {
  readonly cwd?: string | undefined;
  readonly signal?: AbortSignal | undefined;
}

interface Candidate {
  readonly name: string;
  readonly description: string;
  readonly path: string;
  readonly source: string;
  readonly provider: string;
  readonly invocation: { readonly userInvocable: boolean; readonly modelInvocable: boolean };
  readonly resourceBase: { readonly kind: 'directory'; readonly path: string };
  readonly rank: number;
  readonly locator: SkillRegistryDefinition;
}

interface MemorySkillRegistry {
  list(options?: LookupOptions): Promise<readonly { name: string; source: string }[]>;
  registerProvider(
    create: () => {
      name: string;
      list(options: LookupOptions): Promise<readonly Candidate[]>;
      get(
        candidate: Candidate,
      ): Promise<(Omit<Candidate, 'rank' | 'locator'> & { content: string }) | undefined>;
    },
  ): () => void;
}

function candidate(skill: SkillRegistryDefinition & { path: string }): Candidate {
  return {
    name: skill.name,
    description: skill.description,
    path: skill.path,
    source: MEMORY_SKILL_SOURCE,
    provider: MEMORY_SKILL_PROVIDER,
    invocation: {
      userInvocable: skill.invocation.userInvocable,
      modelInvocable: skill.invocation.modelInvocable !== false,
    },
    resourceBase: { kind: 'directory', path: dirname(skill.path) },
    rank: 0,
    locator: skill,
  };
}

const installed = new WeakSet<Context>();

function agentSkillRegistry(agentCtx: Context): MemorySkillRegistry | undefined {
  const registry: unknown = Reflect.get(agentCtx, 'get')?.call(agentCtx, 'skills');
  return typeof registry === 'object' &&
    registry !== null &&
    typeof Reflect.get(registry, 'list') === 'function' &&
    typeof Reflect.get(registry, 'registerProvider') === 'function'
    ? (registry as MemorySkillRegistry)
    : undefined;
}

export function installMemorySkillProvider(
  agentCtx: Context,
  memoryDir: () => string | undefined,
): () => void {
  const registry = agentSkillRegistry(agentCtx);
  if (registry === undefined || installed.has(agentCtx)) return () => {};
  installed.add(agentCtx);
  const dispose = registry.registerProvider(() => ({
    name: MEMORY_SKILL_PROVIDER,
    async list(options) {
      const root = memoryDir();
      if (root === undefined) return [];
      const [own, outer] = await Promise.all([
        readWorkspaceSkills(root),
        registry.list({ cwd: options.cwd, signal: options.signal }),
      ]);
      const project = new Set(
        outer.filter((skill) => skill.source.startsWith('project-')).map((skill) => skill.name),
      );
      return own
        .filter(
          (skill): skill is SkillRegistryDefinition & { path: string } =>
            skill.path !== undefined && !project.has(skill.name),
        )
        .map(candidate);
    },
    async get(found) {
      const { rank: _rank, locator, ...summary } = found;
      return { ...summary, content: locator.content };
    },
  }));
  return () => {
    installed.delete(agentCtx);
    dispose();
  };
}
