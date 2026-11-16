import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, sep } from 'node:path';
import { parse } from 'yaml';
import type { SkillRegistryDefinition } from './catalog.js';

export interface SkillWorkspace {
  workspaceId: string;
  name: string;
  path: string;
  botSlugs: string[];
}

function contained(root: string, path: string): boolean {
  const child = relative(root, path);
  return child.length > 0 && child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child);
}

function booleanField(data: Record<string, unknown>, key: string): boolean | undefined {
  if (!Object.hasOwn(data, key)) return undefined;
  const value = data[key];
  if (typeof value === 'boolean') return value;
  if (value === 1 || value === '1') return true;
  if (value === 0 || value === '0') return false;
  if (typeof value === 'string') {
    if (['true', 'yes', 'on'].includes(value.toLowerCase())) return true;
    if (['false', 'no', 'off'].includes(value.toLowerCase())) return false;
  }
  throw new TypeError('Invalid Skill invocation policy');
}

function definition(
  raw: string,
  path: string,
  source: string,
): SkillRegistryDefinition | undefined {
  const frontmatter = /^---\r?\n([\s\S]*?)^---\r?$(?:\n|$)/mu.exec(raw);
  if (frontmatter?.index !== 0) return undefined;
  let data: unknown;
  try {
    data = parse(frontmatter[1]!);
  } catch {
    return undefined;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined;
  const fields: Record<string, unknown> = Object.fromEntries(Object.entries(data));
  const { name, description } = fields;
  if (
    typeof name !== 'string' ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name) ||
    typeof description !== 'string' ||
    description.length === 0 ||
    ['disableModelInvocation', 'modelInvocable', 'userInvocable'].some((key) =>
      Object.hasOwn(fields, key),
    )
  )
    return undefined;
  const disableModelInvocation = booleanField(fields, 'disable-model-invocation');
  return {
    name,
    description,
    source,
    path,
    content: raw.slice(frontmatter[0].length).trim(),
    invocation: {
      userInvocable: booleanField(fields, 'user-invocable') !== false,
      modelInvocable: disableModelInvocation !== true,
    },
  };
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
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      try {
        const entryPath = join(directory, entry.name);
        const canonicalEntry = await realpath(entryPath);
        if (!contained(skillRoot, canonicalEntry)) continue;
        const info = await stat(canonicalEntry);
        const path = info.isDirectory()
          ? join(entryPath, 'SKILL.md')
          : info.isFile() && entry.name.endsWith('.md')
            ? entryPath
            : undefined;
        if (path === undefined) continue;
        const canonicalPath = await realpath(path);
        if (!contained(skillRoot, canonicalPath) || !contained(canonical, canonicalPath)) continue;
        const skill = definition(
          await readFile(canonicalPath, 'utf8'),
          canonicalPath,
          parent === '.dsh' ? 'project-dsh' : 'project-agents',
        );
        if (skill !== undefined && !skills.has(skill.name)) skills.set(skill.name, skill);
      } catch (error) {
        if (
          error instanceof Error &&
          'code' in error &&
          !['ENOENT', 'ENOTDIR'].includes(String(error.code))
        )
          throw error;
      }
    }
  }
  return [...skills.values()];
}
