import { createHash } from 'node:crypto';
import { realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

import type { SkillCatalogEntry, SkillOwner } from './entries.js';
import { readWorkspaceSkills, type SkillWorkspace } from './workspace.js';
import type { WorkspaceGrant } from '../workspaces/grants.js';

export {
  parseSkillOwnerKey,
  rankSkillEntries,
  skillOwnerKey,
  type SkillCatalogEntry,
  type SkillOwner,
} from './entries.js';

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

export class SkillContentTooLargeError extends Error {
  readonly code = 'skill-too-large';

  constructor(name: string) {
    super(
      `Skill /${name} exceeds the ${MAX_SKILL_INVOCATION_CONTENT}-character invocation limit. Shorten the Skill and try again.`,
    );
    this.name = 'SkillContentTooLargeError';
  }
}

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

async function hostVersion(
  entries: SkillCatalogEntry[],
  load: (name: string) => Promise<SkillRegistryDefinition | undefined>,
): Promise<string> {
  return JSON.stringify(
    await Promise.all(
      entries.map(async (entry) => {
        if (entry.path === undefined) {
          const skill = await load(entry.name);
          return [
            entry,
            skill === undefined ? null : createHash('sha256').update(skill.content).digest('hex'),
          ];
        }
        try {
          const stat = statSync(entry.path, { bigint: true });
          return [entry, stat.mtimeNs.toString(), stat.size.toString()];
        } catch {
          return [entry];
        }
      }),
    ),
  );
}

function hostEntriesFrom(skills: readonly SkillRegistrySummary[]): SkillCatalogEntry[] {
  return skills
    .filter((skill) => skill.invocation.userInvocable && !PROJECT_SOURCES.has(skill.source))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      owner: { kind: 'host' },
      ...(skill.path === undefined ? {} : { path: skill.path }),
    }));
}

interface CachedCatalog {
  root: string;
  project?: SkillCatalogEntry[];
  host?: SkillCatalogEntry[];
  hostVersion?: string;
  loading?: Promise<void>;
}

export class SkillCatalog {
  #registry: SkillRegistryPort | undefined;
  readonly #memoryDirFor: (botSlug: string) => string | undefined;
  readonly #viewFor: SkillViewPort | undefined;
  readonly #grantsFor: ((botSlug: string) => readonly WorkspaceGrant[]) | undefined;
  readonly #workspaces = new Map<
    string,
    { path: string; entries: Promise<SkillRegistryDefinition[]> }
  >();
  readonly #cache = new Map<string, CachedCatalog>();

  constructor(options: {
    memoryDirFor(botSlug: string): string | undefined;
    viewFor?: SkillViewPort;
    grantsFor?(botSlug: string): readonly WorkspaceGrant[];
  }) {
    this.#memoryDirFor = options.memoryDirFor;
    this.#viewFor = options.viewFor;
    this.#grantsFor = options.grantsFor;
  }

  get available(): boolean {
    return this.#registry !== undefined;
  }

  attach(registry: SkillRegistryPort): () => void {
    this.#registry = registry;
    this.#cache.clear();
    this.#workspaces.clear();
    return () => {
      if (this.#registry === registry) {
        this.#registry = undefined;
        this.#cache.clear();
        this.#workspaces.clear();
      }
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

  workspaces(botSlugs: readonly string[]): SkillWorkspace[] {
    const workspaces = new Map<string, SkillWorkspace>();
    for (const botSlug of new Set(botSlugs)) {
      for (const grant of this.#grantsFor?.(botSlug) ?? []) {
        if (grant.revokedAt !== undefined) continue;
        const entry = workspaces.get(grant.workspaceId);
        if (entry !== undefined) {
          if (entry.path === grant.workspacePath && !entry.botSlugs.includes(botSlug))
            entry.botSlugs.push(botSlug);
          continue;
        }
        workspaces.set(grant.workspaceId, {
          workspaceId: grant.workspaceId,
          name: grant.workspaceTitle,
          path: grant.workspacePath,
          botSlugs: [botSlug],
        });
      }
    }
    return [...workspaces.values()];
  }

  invalidateWorkspace(workspaceId: string): void {
    this.#workspaces.delete(workspaceId);
  }

  async #workspaceEntries(workspace: SkillWorkspace): Promise<SkillRegistryDefinition[]> {
    let cached = this.#workspaces.get(workspace.workspaceId);
    if (cached?.path !== workspace.path) {
      cached = { path: workspace.path, entries: readWorkspaceSkills(workspace.path) };
      this.#workspaces.set(workspace.workspaceId, cached);
    }
    try {
      const entries = await cached.entries;
      return this.#workspaces.get(workspace.workspaceId) === cached
        ? entries
        : this.#workspaceEntries(workspace);
    } catch (error) {
      if (this.#workspaces.get(workspace.workspaceId) === cached)
        this.invalidateWorkspace(workspace.workspaceId);
      throw error;
    }
  }

  invalidateBot(botSlug: string): void {
    this.#cache.delete(botSlug);
  }

  invalidateMemory(botSlug: string): void {
    const cached = this.#cache.get(botSlug);
    if (cached !== undefined)
      this.#cache.set(botSlug, {
        root: cached.root,
        ...(cached.host === undefined
          ? {}
          : {
              host: cached.host,
              ...(cached.hostVersion === undefined ? {} : { hostVersion: cached.hostVersion }),
            }),
      });
  }

  invalidateHost(): void {
    for (const [slug, cached] of this.#cache)
      this.#cache.set(slug, {
        root: cached.root,
        ...(cached.project === undefined ? {} : { project: cached.project }),
      });
  }

  async refreshHost(): Promise<boolean> {
    const registry = this.#registry;
    if (registry === undefined) return false;
    const observed = [...this.#cache].filter(([, entry]) => entry.host !== undefined);
    if (
      observed.length === 0 ||
      [...this.#cache.values()].some(
        (entry) => entry.host === undefined && entry.loading !== undefined,
      )
    ) {
      this.invalidateHost();
      return true;
    }
    for (const [slug, entry] of observed) {
      const version = await this.#withView(slug, registry, async (view, options) =>
        hostVersion(hostEntriesFrom(await view.list(options)), (name) => view.get(name, options)),
      );
      if (this.#registry !== registry) return false;
      if (version !== entry.hostVersion) {
        this.invalidateHost();
        return true;
      }
    }
    return false;
  }

  async list(botSlugs: readonly string[]): Promise<SkillCatalogEntry[]> {
    const registry = this.#registry;
    if (registry === undefined) return [];
    const entries: SkillCatalogEntry[] = [];
    const observed = new Map<string, CachedCatalog>();
    let hostEntries: SkillCatalogEntry[] | undefined;
    for (const botSlug of new Set(botSlugs)) {
      const root = this.#memoryDirFor(botSlug);
      if (root === undefined) continue;
      let cached = this.#cache.get(botSlug);
      if (cached?.root !== root) {
        cached = { root };
        this.#cache.set(botSlug, cached);
      }
      const entry = cached;
      observed.set(botSlug, entry);
      while (entry.project === undefined || (hostEntries === undefined && entry.host === undefined))
        await (entry.loading ??= this.#withView(botSlug, registry, async (registry, options) => {
          if (entry.project === undefined)
            entry.project = (await registry.list({ ...options, cwd: root }))
              .filter(
                (skill) =>
                  skill.invocation.userInvocable &&
                  PROJECT_SOURCES.has(skill.source) &&
                  inside(root, skill.path),
              )
              .map((skill) => ({
                name: skill.name,
                description: skill.description,
                owner: { kind: 'bot', botSlug },
                ...(skill.path === undefined ? {} : { path: skill.path }),
              }));
          if (hostEntries === undefined && entry.host === undefined) {
            const host = hostEntriesFrom(await registry.list(options));
            const version = await hostVersion(host, (name) => registry.get(name, options));
            entry.host = host;
            entry.hostVersion = version;
          }
        }).finally(() => {
          delete entry.loading;
        }));
      if (this.#cache.get(botSlug) !== entry || this.#registry !== registry)
        return this.list(botSlugs);
      entries.push(...(entry.project ?? []));
      hostEntries ??= entry.host;
    }
    if ([...observed].some(([slug, entry]) => this.#cache.get(slug) !== entry))
      return this.list(botSlugs);
    const workspaceEntries = [];
    for (const workspace of this.workspaces(botSlugs))
      workspaceEntries.push({ workspace, skills: await this.#workspaceEntries(workspace) });
    const activeWorkspaces = new Map(
      this.workspaces(botSlugs).map((workspace) => [workspace.workspaceId, workspace]),
    );
    for (const { workspace, skills } of workspaceEntries) {
      const current = activeWorkspaces.get(workspace.workspaceId);
      if (current?.path !== workspace.path) continue;
      entries.push(
        ...skills
          .filter((skill) => skill.invocation.userInvocable)
          .map((skill): SkillCatalogEntry => ({
            name: skill.name,
            description: skill.description,
            owner: { kind: 'workspace', workspaceId: current.workspaceId, name: current.name },
            ...(skill.path === undefined ? {} : { path: skill.path }),
          })),
      );
    }
    if (
      this.#registry !== registry ||
      [...observed].some(([slug, entry]) => this.#cache.get(slug) !== entry)
    )
      return this.list(botSlugs);
    return [...entries, ...(hostEntries ?? [])];
  }

  async resolve(
    name: string,
    owner: SkillOwner,
    viewerBotSlug: string,
    botSlugs: readonly string[] = [viewerBotSlug],
  ): Promise<ResolvedSkill | undefined> {
    const registry = this.#registry;
    if (registry === undefined) return undefined;
    if (owner.kind === 'workspace') {
      const workspace = this.workspaces(botSlugs).find(
        (entry) => entry.workspaceId === owner.workspaceId,
      );
      if (workspace === undefined) return undefined;
      const skill = (await readWorkspaceSkills(workspace.path)).find(
        (entry) => entry.name === name && entry.invocation.userInvocable,
      );
      if (
        skill === undefined ||
        !this.workspaces(botSlugs).some(
          (entry) => entry.workspaceId === workspace.workspaceId && entry.path === workspace.path,
        )
      )
        return undefined;
      if (skill.content.length > MAX_SKILL_INVOCATION_CONTENT)
        throw new SkillContentTooLargeError(name);
      return {
        name,
        owner: { kind: 'workspace', workspaceId: workspace.workspaceId, name: workspace.name },
        content: skill.content,
        ...(skill.path === undefined ? {} : { path: skill.path }),
      };
    }
    const resolved = await this.#withView(
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
            content: skill.content,
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
          content: skill.content,
          ...(skill.path === undefined ? {} : { path: skill.path }),
        };
      },
    );
    if (resolved !== undefined && resolved.content.length > MAX_SKILL_INVOCATION_CONTENT)
      throw new SkillContentTooLargeError(name);
    return resolved;
  }
}
