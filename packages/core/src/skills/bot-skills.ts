import { realpath, rm } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, sep } from 'node:path';

import { commitMemoryPathsAsync, ignoredMemoryPathsAsync } from '../memory/git.js';
import { readWorkspaceSkills } from './workspace.js';

export interface BotSkill {
  name: string;
  description: string;
  path: string;
  userInvocable: boolean;
}

export interface BotSkillDetail extends BotSkill {
  content: string;
}

export class BotSkillNotFoundError extends Error {
  constructor(name: string) {
    super(`Skill not found in this Bot's Memory Repository: ${name}`);
    this.name = 'BotSkillNotFoundError';
  }
}

export class BotSkillIgnoredFilesError extends Error {
  constructor(
    name: string,
    readonly files: readonly string[],
  ) {
    super(
      `Skill ${name} has files git ignores, so removing it could not be undone: ${files.join(', ')}`,
    );
    this.name = 'BotSkillIgnoredFilesError';
  }
}

function inside(root: string, path: string): boolean {
  const child = relative(root, path);
  return child.length > 0 && child !== '..' && !child.startsWith('..' + sep) && !isAbsolute(child);
}

async function canonicalRoot(memoryDir: string): Promise<string | undefined> {
  try {
    return await realpath(memoryDir);
  } catch {
    return undefined;
  }
}

async function readBotSkills(
  memoryDir: string,
): Promise<{ root: string; skills: BotSkillDetail[] }> {
  const root = await canonicalRoot(memoryDir);
  if (root === undefined) return { root: memoryDir, skills: [] };
  const skills = (await readWorkspaceSkills(memoryDir))
    .filter((skill) => skill.path !== undefined && inside(root, skill.path))
    .map((skill) => ({
      name: skill.name,
      description: skill.description,
      path: relative(root, skill.path!).split(sep).join('/'),
      userInvocable: skill.invocation.userInvocable,
      content: skill.content,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { root, skills };
}

export async function listBotSkills(memoryDir: string): Promise<BotSkill[]> {
  return (await readBotSkills(memoryDir)).skills.map(({ content: _content, ...skill }) => skill);
}

export async function readBotSkill(
  memoryDir: string,
  name: string,
): Promise<BotSkillDetail | undefined> {
  return (await readBotSkills(memoryDir)).skills.find((skill) => skill.name === name);
}

export async function removeBotSkill(
  memoryDir: string,
  name: string,
): Promise<{ name: string; removed: string }> {
  const { root, skills } = await readBotSkills(memoryDir);
  const skill = skills.find((entry) => entry.name === name);
  if (skill === undefined) throw new BotSkillNotFoundError(name);
  const absolute = `${root}${sep}${skill.path.split('/').join(sep)}`;
  const folder = basename(absolute) === 'SKILL.md' && basename(dirname(absolute)) !== 'skills';
  const target = folder ? dirname(absolute) : absolute;
  const skillsRoot = dirname(target);
  if (!inside(root, target) || basename(skillsRoot) !== 'skills')
    throw new BotSkillNotFoundError(name);
  const removed = relative(root, target).split(sep).join('/');
  const ignored = await ignoredMemoryPathsAsync(root, [removed]);
  if (ignored.length > 0) throw new BotSkillIgnoredFilesError(name, ignored);
  await commitMemoryPathsAsync(root, [removed], `skills: save ${name} before removal`);
  await rm(target, { recursive: true, force: true });
  await commitMemoryPathsAsync(root, [removed], `skills: remove ${name}`);
  return { name, removed };
}
