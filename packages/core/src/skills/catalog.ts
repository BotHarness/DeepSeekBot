import { realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import type { SkillCatalogEntry, SkillOwner } from './entries.js';

export {
  parseSkillOwnerKey,
  rankSkillEntries,
  skillOwnerKey,
  type SkillCatalogEntry,
  type SkillOwner,
} from './entries.js';

/** The subset of DSH's `ctx.skills` registry the catalog reads. */
export interface SkillRegistryPort {
  list(options?: { cwd?: string; scope?: object }): Promise<readonly SkillRegistrySummary[]>;
  get(
    name: string,
    options?: { cwd?: string; scope?: object },
  ): Promise<SkillRegistryDefinition | undefined>;
}

export interface SkillRegistryView extends AsyncDisposable {
  readonly registry: SkillRegistryPort;
  readonly scope?: object;
}

export type SkillViewPort = (
  botSlug: string,
  registry: SkillRegistryPort,
) => Promise<SkillRegistryView>;

export interface SkillRegistrySummary {
  readonly name: string;
  readonly description: string;
  readonly source: string;
  readonly path?: string;
  readonly invocation: { readonly userInvocable: boolean };
}

export interface SkillRegistryDefinition extends SkillRegistrySummary {
  readonly content: string;
}

export interface ResolvedSkill {
  name: string;
  owner: SkillOwner;
  path?: string;
  content: string;
}

export const MAX_SKILL_INVOCATION_CONTENT = 64_000;

const PROJECT_SOURCES = new Set(['project-agents', 'project-dsh']);

function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function inside(root: string, path: string | undefined): boolean {
  if (path === undefined) return false;
  const rel = relative(real(root), real(path));
  return rel.length > 0 && !rel.startsWith('..') && !isAbsolute(rel);
}

/**
 * Lists and resolves the Skills a Human can invoke in a conversation: Host
 * Skills plus the Project Skills of each PersonaBot's Memory Repository.
 * DSH discovery stays the authority; this module only labels owners and
 * keeps a Bot's same-named Skill from hiding the Host one in the menu.
 */
export class SkillCatalog {
  #registry: SkillRegistryPort | undefined;
  readonly #memoryDirFor: (botSlug: string) => string | undefined;
  readonly #viewFor: SkillViewPort | undefined;

  constructor(options: {
    memoryDirFor(botSlug: string): string | undefined;
    viewFor?: SkillViewPort;
  }) {
    this.#memoryDirFor = options.memoryDirFor;
    this.#viewFor = options.viewFor;
  }

  get available(): boolean {
    return this.#registry !== undefined;
  }

  attach(registry: SkillRegistryPort): () => void {
    this.#registry = registry;
    return () => {
      if (this.#registry === registry) this.#registry = undefined;
    };
  }

  async #withView<T>(
    botSlug: string,
    registry: SkillRegistryPort,
    read: (registry: SkillRegistryPort, options: { scope?: object }) => Promise<T>,
  ): Promise<T> {
    if (this.#viewFor === undefined) return read(registry, {});
    await using view = await this.#viewFor(botSlug, registry);
    return await read(view.registry, view.scope === undefined ? {} : { scope: view.scope });
  }

  async list(botSlugs: readonly string[]): Promise<SkillCatalogEntry[]> {
    const registry = this.#registry;
    if (registry === undefined) return [];
    const entries: SkillCatalogEntry[] = [];
    const hostEntries: SkillCatalogEntry[] = [];
    let hostListed = false;
    for (const botSlug of new Set(botSlugs)) {
      const root = this.#memoryDirFor(botSlug);
      if (root === undefined) continue;
      await this.#withView(botSlug, registry, async (registry, options) => {
        for (const skill of await registry.list({ ...options, cwd: root }))
          if (
            skill.invocation.userInvocable &&
            PROJECT_SOURCES.has(skill.source) &&
            inside(root, skill.path)
          )
            entries.push({
              name: skill.name,
              description: skill.description,
              owner: { kind: 'bot', botSlug },
              ...(skill.path === undefined ? {} : { path: skill.path }),
            });
        if (hostListed) return;
        for (const skill of await registry.list(options))
          if (skill.invocation.userInvocable && !PROJECT_SOURCES.has(skill.source))
            hostEntries.push({
              name: skill.name,
              description: skill.description,
              owner: { kind: 'host' },
              ...(skill.path === undefined ? {} : { path: skill.path }),
            });
        hostListed = true;
      });
    }
    return [...entries, ...hostEntries];
  }

  /** Reads the current text of one Skill so a message can keep a snapshot of it. */
  async resolve(
    name: string,
    owner: SkillOwner,
    viewerBotSlug: string,
  ): Promise<ResolvedSkill | undefined> {
    const registry = this.#registry;
    if (registry === undefined) return undefined;
    return this.#withView(
      owner.kind === 'bot' ? owner.botSlug : viewerBotSlug,
      registry,
      async (registry, options) => {
        if (owner.kind === 'host') {
          const skill = await registry.get(name, options);
          if (skill === undefined || !skill.invocation.userInvocable) return undefined;
          if (PROJECT_SOURCES.has(skill.source)) return undefined;
          return {
            name,
            owner,
            content: skill.content.slice(0, MAX_SKILL_INVOCATION_CONTENT),
            ...(skill.path === undefined ? {} : { path: skill.path }),
          };
        }
        const root = this.#memoryDirFor(owner.botSlug);
        if (root === undefined) return undefined;
        const skill = await registry.get(name, { ...options, cwd: root });
        if (
          skill === undefined ||
          !skill.invocation.userInvocable ||
          !PROJECT_SOURCES.has(skill.source) ||
          !inside(root, skill.path)
        )
          return undefined;
        return {
          name,
          owner,
          content: skill.content.slice(0, MAX_SKILL_INVOCATION_CONTENT),
          ...(skill.path === undefined ? {} : { path: skill.path }),
        };
      },
    );
  }
}
