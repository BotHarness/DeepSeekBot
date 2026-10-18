import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CliLiveError } from './cli-live-error.js';

const SKILLS = [
  {
    id: 'bot-management',
    description:
      'Discover installed commands, inspect targets and perform reviewed Bot management.',
    commands: ['capabilities', 'list', 'show'],
  },
  {
    id: 'avatar-management',
    description: 'Create or change a Bot or Group avatar from a local PNG, JPEG or WebP image.',
    commands: ['create', 'bot-avatar-set', 'group-avatar-set'],
  },
] as const;

function installedPackage(): { root: string; packageName: string; packageVersion: string } {
  let root = dirname(fileURLToPath(import.meta.url));
  for (let depth = 0; depth < 4; depth++, root = dirname(root)) {
    let manifest: Record<string, unknown>;
    try {
      manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    } catch {
      continue;
    }
    if (
      manifest !== null &&
      typeof manifest === 'object' &&
      manifest['name'] === '@botharness/core' &&
      typeof manifest['version'] === 'string' &&
      manifest['version'].length > 0
    )
      return { root, packageName: manifest['name'], packageVersion: manifest['version'] };
  }
  throw new CliLiveError('skills-unavailable', 'The installed CLI package metadata is missing.');
}

export function runCliSkills(rest: readonly string[], values: Record<string, unknown>): unknown {
  const usage = (): never => {
    throw new CliLiveError('usage', 'Use deepseekbot skills list or skills show <skill-id>.');
  };
  if (Object.entries(values).some(([key, value]) => value !== undefined && key !== 'compact'))
    usage();
  const [action, id] = rest;
  if (!((action === 'list' && rest.length === 1) || (action === 'show' && rest.length === 2)))
    usage();
  const { root, ...identity } = installedPackage();
  const metadata = { schemaVersion: 1, ...identity };
  if (action === 'list') return { ...metadata, skills: SKILLS };
  const skill = SKILLS.find((entry) => entry.id === id);
  if (!skill)
    throw new CliLiveError(
      'unknown-skill',
      'Unknown installed skill; use deepseekbot skills list.',
    );
  let body: string;
  try {
    body = readFileSync(join(root, 'skills', skill.id, 'SKILL.md'), 'utf8');
  } catch {
    throw new CliLiveError('skills-unavailable', 'The installed CLI skill content is missing.');
  }
  return { ...metadata, skill: { ...skill, format: 'markdown', body } };
}
