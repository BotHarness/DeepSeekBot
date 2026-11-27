import { createHash, randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type {
  MarketplaceSkill,
  MarketplaceSkillFile,
  MarketplaceSkillFinding,
} from '@botharness/host-protocol/marketplace-skill';
import {
  SKILL_NAME,
  MAX_SKILL_NAME,
  parseSkillFrontmatter,
  renameSkill,
  scanSkillFiles,
  withSkillMetadata,
} from '../../../market/src/skill-scan.js';
import { uploadFileKind } from '../../../market/src/upload-files.js';

export interface StagedSkill {
  skill: MarketplaceSkill;
  name: string;
  files: Map<string, Uint8Array>;
  verdict: 'clean' | 'warning' | 'blocked';
  findings: MarketplaceSkillFinding[];
  scripts: string[];
  hash: string;
}

export class SkillStageError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'SkillStageError';
  }
}

export function safeSkillPath(path: string): boolean {
  if (path.length === 0 || path.length > 300 || path.includes('\\') || path.includes('\0'))
    return false;
  const parts = path.split('/');
  return parts.every(
    (part) => part.length > 0 && part !== '.' && part !== '..' && !part.startsWith('.git'),
  );
}

export function stageSkill(skill: MarketplaceSkill, files: Map<string, Uint8Array>): StagedSkill {
  if (![...files.keys()].every(safeSkillPath)) throw new SkillStageError('unsafe-skill-path');
  const skillMd = files.get('SKILL.md');
  if (skillMd === undefined) throw new SkillStageError('skill-md-missing');
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const frontmatter = parseSkillFrontmatter(decoder.decode(skillMd));
  if (frontmatter === undefined) throw new SkillStageError('invalid-skill-md');
  const scan = scanSkillFiles(
    [...files].map(([path, bytes]) => {
      const kind = uploadFileKind(path);
      return {
        path,
        text: kind === 'text' || kind === 'script' ? decoder.decode(bytes) : null,
      };
    }),
  );
  const digest = createHash('sha256');
  for (const path of [...files.keys()].sort()) {
    digest.update(`${path}\0${files.get(path)!.byteLength}\0`);
    digest.update(files.get(path)!);
  }
  return {
    skill,
    name: frontmatter.name,
    files,
    verdict: scan.verdict,
    findings: scan.findings,
    scripts: scan.scripts,
    hash: digest.digest('hex'),
  };
}

export function stagedFiles(staged: StagedSkill): MarketplaceSkillFile[] {
  return [...staged.files]
    .map(([path, bytes]) => ({ path, size: bytes.byteLength }))
    .sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
}

export function freeSkillName(name: string, taken: (candidate: string) => boolean): string {
  for (let index = 2; index < 100; index += 1) {
    const suffix = `-${index}`;
    const candidate = `${name.slice(0, MAX_SKILL_NAME - suffix.length)}${suffix}`;
    if (SKILL_NAME.test(candidate) && !taken(candidate)) return candidate;
  }
  return `${name.slice(0, MAX_SKILL_NAME - 9)}-${randomUUID().slice(0, 8)}`;
}

export function skillFolder(skillsDir: string, name: string): string {
  return join(skillsDir, name);
}

export function skillExists(skillsDir: string, name: string): boolean {
  return existsSync(skillFolder(skillsDir, name));
}

function isAlreadyThere(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}

async function publish(temporary: string, target: string, replace: boolean): Promise<void> {
  if (!replace) {
    try {
      await mkdir(target);
    } catch (error) {
      if (isAlreadyThere(error)) throw new SkillStageError('skill-exists');
      throw error;
    }
    try {
      for (const entry of await readdir(temporary))
        await rename(join(temporary, entry), join(target, entry));
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      throw error;
    }
    await rm(temporary, { recursive: true, force: true });
    return;
  }
  const backup = `${temporary}.previous`;
  const hadPrevious = existsSync(target);
  if (hadPrevious) await rename(target, backup);
  try {
    await rename(temporary, target);
  } catch (error) {
    if (hadPrevious) await rename(backup, target);
    throw error;
  }
  if (hadPrevious) await rm(backup, { recursive: true, force: true });
}

export async function writeSkill(
  staged: StagedSkill,
  skillsDir: string,
  name: string,
  options: { replace: boolean },
): Promise<string> {
  const target = skillFolder(skillsDir, name);
  const temporary = join(skillsDir, `.${name}.${randomUUID()}.tmp`);
  await mkdir(temporary, { recursive: true });
  try {
    for (const [path, bytes] of staged.files) {
      const file = join(temporary, ...path.split('/'));
      await mkdir(dirname(file), { recursive: true });
      if (path === 'SKILL.md') {
        const original = new TextDecoder().decode(bytes);
        const renamed = name === staged.name ? original : renameSkill(original, name);
        await writeFile(
          file,
          withSkillMetadata(renamed, {
            source: staged.skill.id,
            ...(staged.skill.upload === undefined ? { repository: staged.skill.htmlUrl } : {}),
            hash: staged.hash,
          }),
        );
      } else {
        await writeFile(file, bytes);
      }
    }
    await publish(temporary, target, options.replace);
  } catch (error) {
    await rm(temporary, { recursive: true, force: true });
    throw error;
  }
  return target;
}
