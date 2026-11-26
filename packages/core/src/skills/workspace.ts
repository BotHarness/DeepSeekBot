import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import type { SkillRegistryDefinition } from './catalog.js';
import { parseSkillDocument } from './skill-document.js';

export interface SkillWorkspace {
  workspaceId: string;
  name: string;
  path: string;
  botSlugs: string[];
}

const READ_CONCURRENCY = 32;

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function contained(root: string, path: string): boolean {
  const child = relative(root, path);
  return child.length > 0 && child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child);
}

function definition(
  raw: string,
  path: string,
  source: string,
): SkillRegistryDefinition | undefined {
  const document = parseSkillDocument(raw);
  return document === undefined ? undefined : { ...document, source, path };
}

export async function readWorkspaceSkills(root: string): Promise<SkillRegistryDefinition[]> {
  let canonical: string;
  try {
    canonical = await realpath(root);
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      ['ENOENT', 'ENOTDIR'].includes(String(error.code))
    )
      return [];
    throw error;
  }
  const skills = new Map<string, SkillRegistryDefinition>();
  for (const parent of ['.dsh', '.agents']) {
    const directory = join(root, parent, 'skills');
    let entries;
    try {
      if (!contained(canonical, await realpath(directory))) continue;
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        ['ENOENT', 'ENOTDIR'].includes(String(error.code))
      )
        continue;
      throw error;
    }
    const skillRoot = await realpath(directory);
    const sorted = entries.sort((a, b) => a.name.localeCompare(b.name));
    const found = await mapLimited(sorted, READ_CONCURRENCY, async (entry) => {
      try {
        const entryPath = join(directory, entry.name);
        const canonicalEntry = await realpath(entryPath);
        if (!contained(skillRoot, canonicalEntry)) return undefined;
        const info = await stat(canonicalEntry);
        const path = info.isDirectory()
          ? join(entryPath, 'SKILL.md')
          : info.isFile() && entry.name.endsWith('.md')
            ? entryPath
            : undefined;
        if (path === undefined) return undefined;
        const canonicalPath = await realpath(path);
        if (!contained(skillRoot, canonicalPath) || !contained(canonical, canonicalPath))
          return undefined;
        return definition(
          await readFile(canonicalPath, 'utf8'),
          canonicalPath,
          parent === '.dsh' ? 'project-dsh' : 'project-agents',
        );
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          !['ENOENT', 'ENOTDIR'].includes(String(error.code))
        )
          throw error;
        return undefined;
      }
    });
    for (const skill of found)
      if (skill !== undefined && !skills.has(skill.name)) skills.set(skill.name, skill);
  }
  return [...skills.values()];
}

export async function readWorkspaceSkillAt(
  root: string,
  path: string,
): Promise<SkillRegistryDefinition | undefined> {
  try {
    const canonical = await realpath(root);
    const canonicalPath = await realpath(path);
    if (!contained(canonical, canonicalPath)) return undefined;
    for (const parent of ['.dsh', '.agents'] as const) {
      let skillRoot: string;
      try {
        skillRoot = await realpath(join(root, parent, 'skills'));
      } catch {
        continue;
      }
      if (!contained(canonical, skillRoot) || !contained(skillRoot, canonicalPath)) continue;
      return definition(
        await readFile(canonicalPath, 'utf8'),
        canonicalPath,
        parent === '.dsh' ? 'project-dsh' : 'project-agents',
      );
    }
    return undefined;
  } catch (error) {
    if (
      error instanceof Error &&
      'code' in error &&
      !['ENOENT', 'ENOTDIR'].includes(String(error.code))
    )
      throw error;
    return undefined;
  }
}
