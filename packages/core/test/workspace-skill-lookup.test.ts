import { mkdirSync, renameSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SkillCatalog } from '../src/skills/catalog.js';
import { readWorkspaceSkillAt, readWorkspaceSkills } from '../src/skills/workspace.js';
import type { WorkspaceGrant } from '../src/workspaces/grants.js';
import { createTempRoot } from './helpers.js';

function put(
  root: string,
  folder: string,
  name = folder,
  body = `Body of ${name}`,
  parent = '.agents',
) {
  const path = join(root, parent, 'skills', folder, 'SKILL.md');
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\ndescription: Project ${name}\n---\n${body}\n`);
  return path;
}

function catalogFor(root: string): SkillCatalog {
  const grants = [
    { workspaceId: 'w1', workspaceTitle: 'Project', workspacePath: root },
  ] as unknown as WorkspaceGrant[];
  const catalog = new SkillCatalog({ memoryDirFor: () => undefined, grantsFor: () => grants });
  catalog.attach({ list: async () => [], get: async () => undefined });
  return catalog;
}

const owner = { kind: 'workspace' as const, workspaceId: 'w1', name: 'Project' };

describe('Workspace Skill lookup', () => {
  it('reads one Skill file only from inside the project Skill folders', async () => {
    const root = createTempRoot();
    const inside = put(root, 'review');
    const dsh = put(root, 'legacy', 'legacy', 'Legacy', '.dsh');
    const loose = join(root, 'README.md');
    writeFileSync(loose, '---\nname: loose\ndescription: x\n---\nLoose\n');
    const outside = put(createTempRoot(), 'escape');
    symlinkSync(dirname(outside), join(root, '.agents/skills/escape'));
    expect(await readWorkspaceSkillAt(root, inside)).toMatchObject({
      name: 'review',
      content: 'Body of review',
      source: 'project-agents',
    });
    expect((await readWorkspaceSkillAt(root, dsh))?.source).toBe('project-dsh');
    expect(await readWorkspaceSkillAt(root, loose)).toBeUndefined();
    expect(
      await readWorkspaceSkillAt(root, join(root, '.agents/skills/escape/SKILL.md')),
    ).toBeUndefined();
    expect(
      await readWorkspaceSkillAt(root, join(root, '.agents/skills/missing/SKILL.md')),
    ).toBeUndefined();
  });

  it('keeps many Skills in name order with .dsh taking precedence', async () => {
    const root = createTempRoot();
    for (let i = 0; i < 120; i++) put(root, `skill-${String(i).padStart(3, '0')}`);
    put(root, 'skill-007', 'skill-007', 'From dsh', '.dsh');
    const skills = await readWorkspaceSkills(root);
    expect(skills).toHaveLength(120);
    expect(skills[0]?.content).toBe('From dsh');
    expect(skills.slice(1).map((skill) => skill.name)).toEqual(
      Array.from({ length: 120 }, (_, i) => `skill-${String(i).padStart(3, '0')}`).filter(
        (name) => name !== 'skill-007',
      ),
    );
  });

  it('resolves a listed Workspace Skill with its current content and falls back after a rename', async () => {
    const root = createTempRoot();
    const path = put(root, 'review');
    put(root, 'notes');
    const catalog = catalogFor(root);
    expect((await catalog.list(['ada'])).map((entry) => entry.name)).toEqual(['notes', 'review']);
    writeFileSync(path, '---\nname: review\ndescription: Project review\n---\nEdited body\n');
    expect(await catalog.resolve('review', owner, 'ada')).toMatchObject({
      name: 'review',
      owner,
      content: 'Edited body',
      path,
    });
    renameSync(dirname(path), join(root, '.agents/skills/review-moved'));
    expect((await catalog.resolve('review', owner, 'ada'))?.content).toBe('Edited body');
    writeFileSync(
      join(root, '.agents/skills/review-moved/SKILL.md'),
      '---\nname: renamed\ndescription: x\n---\nRenamed\n',
    );
    expect(await catalog.resolve('review', owner, 'ada')).toBeUndefined();
  });
});
