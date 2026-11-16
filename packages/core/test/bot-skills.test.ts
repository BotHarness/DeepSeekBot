import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSkillCommand } from '../src/bots/cli-skills.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { initializeMemoryGit } from '../src/memory/git.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { listBotSkills, readBotSkill, removeBotSkill } from '../src/skills/bot-skills.js';
import { SkillCatalog } from '../src/skills/catalog.js';
import { createTempRoot } from './helpers.js';

const closes: (() => Promise<void>)[] = [];
afterEach(async () => {
  for (const close of closes.splice(0).reverse()) await close();
});

function put(root: string, relativePath: string, name: string, extra = '', body = `Do ${name}`) {
  const path = join(root, relativePath);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `---\nname: ${name}\ndescription: Skill ${name}\n${extra}---\n${body}\n`);
}

function git(root: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
}

function memory() {
  const root = createTempRoot('botharness-s6-memory-');
  initializeMemoryGit(root);
  put(root, '.agents/skills/review/SKILL.md', 'review');
  put(root, '.agents/skills/review/checklist.md', 'not-a-skill');
  put(root, '.agents/skills/notes.md', 'notes', 'user-invocable: false\n');
  put(root, '.dsh/skills/review/SKILL.md', 'review', '', 'DSH copy wins');
  put(root, 'docs/.agents/skills/nested/SKILL.md', 'nested');
  git(root, 'add', '-A');
  git(root, 'commit', '-q', '--no-gpg-sign', '-m', 'seed');
  return root;
}

describe('PersonaBot Memory Skills on the profile', () => {
  it('lists root .dsh and .agents Skills with DSH precedence, including model-only ones', async () => {
    const root = memory();
    expect(await listBotSkills(root)).toEqual([
      {
        name: 'notes',
        description: 'Skill notes',
        path: '.agents/skills/notes.md',
        userInvocable: false,
      },
      {
        name: 'review',
        description: 'Skill review',
        path: '.dsh/skills/review/SKILL.md',
        userInvocable: true,
      },
    ]);
    expect((await readBotSkill(root, 'review'))?.content).toBe('DSH copy wins');
    expect(await listBotSkills(join(root, 'missing'))).toEqual([]);
  });

  it('removes a folder Skill or a flat Skill file and commits each deletion', async () => {
    const root = memory();
    expect(await removeBotSkill(root, 'review')).toEqual({
      name: 'review',
      removed: '.dsh/skills/review',
    });
    expect(existsSync(join(root, '.dsh/skills/review'))).toBe(false);
    expect(git(root, 'log', '-1', '--format=%s')).toBe('skills: remove review');
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await readBotSkill(root, 'review'))?.path).toBe('.agents/skills/review/SKILL.md');
    git(root, 'checkout', 'HEAD~1', '--', '.dsh/skills/review');
    expect((await readBotSkill(root, 'review'))?.content).toBe('DSH copy wins');
    git(root, 'commit', '-q', '--no-gpg-sign', '-am', 'restore');
    await removeBotSkill(root, 'notes');
    expect(existsSync(join(root, '.agents/skills/notes.md'))).toBe(false);
    expect(existsSync(join(root, '.agents/skills/review/checklist.md'))).toBe(true);
    await expect(removeBotSkill(root, 'nested')).rejects.toThrow(/not found/);
  });
});

describe('Skill profile bridge methods and CLI', () => {
  function fixture() {
    const agents: BotAgentAdapter = {
      async runOrchestrator() {},
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: createTempRoot('botharness-s6-home-'), agents });
    closes.push(async () => {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const root = core.registry.memoryDirFor('ada')!;
    put(root, '.agents/skills/review/SKILL.md', 'review');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--no-gpg-sign', '-m', 'add review');
    const catalog = new SkillCatalog({ memoryDirFor: (slug) => core.registry.memoryDirFor(slug) });
    catalog.attach({
      list: async (options) =>
        options?.cwd === undefined
          ? [
              {
                name: 'pdf',
                description: 'Host pdf',
                source: 'user',
                path: '/host/pdf/SKILL.md',
                invocation: { userInvocable: true },
              },
            ]
          : [],
      get: async (name) =>
        name === 'pdf'
          ? {
              name: 'pdf',
              description: 'Host pdf',
              source: 'user',
              path: '/host/pdf/SKILL.md',
              content: 'Read PDFs',
              invocation: { userInvocable: true },
            }
          : undefined,
    });
    const invalidate = vi.spyOn(catalog, 'invalidateMemory');
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
    const rpc = async (method: string, payload: Record<string, unknown>) => {
      const result = await (methods as unknown as Record<string, (p: unknown) => unknown>)[method]!(
        payload,
      );
      const settled = (await result) as { ok: boolean; value?: unknown; error?: unknown };
      if (!settled.ok) throw Object.assign(new Error('refused'), { error: settled.error });
      return settled.value;
    };
    return { core, root, methods, rpc, invalidate };
  }

  it('checkpoints uncommitted Skill edits before removing them, so git history can restore them', async () => {
    const root = memory();
    put(root, '.dsh/skills/review/SKILL.md', 'review', '', 'Unsaved edit');
    writeFileSync(join(root, '.dsh/skills/review/extra.md'), 'untracked helper\n');
    await removeBotSkill(root, 'review');
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'show', 'HEAD~1:.dsh/skills/review/SKILL.md')).toContain('Unsaved edit');
    expect(git(root, 'show', 'HEAD~1:.dsh/skills/review/extra.md')).toBe('untracked helper');
  });

  it('refuses to remove a Skill whose folder holds git-ignored files, which history could not restore', async () => {
    const root = memory();
    writeFileSync(join(root, '.gitignore'), '*.secret\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--no-gpg-sign', '-m', 'ignore secrets');
    writeFileSync(join(root, '.dsh/skills/review/token.secret'), 'private\n');
    await expect(removeBotSkill(root, 'review')).rejects.toThrow(/token\.secret/);
    expect(existsSync(join(root, '.dsh/skills/review/SKILL.md'))).toBe(true);
    expect(git(root, 'log', '-1', '--format=%s')).toBe('ignore secrets');
  });

  it('removes a flat SKILL.md that sits directly in the skills folder', async () => {
    const root = memory();
    put(root, '.agents/skills/SKILL.md', 'loose');
    git(root, 'add', '-A');
    git(root, 'commit', '-q', '--no-gpg-sign', '-m', 'add loose');
    expect((await readBotSkill(root, 'loose'))?.path).toBe('.agents/skills/SKILL.md');
    expect(await removeBotSkill(root, 'loose')).toEqual({
      name: 'loose',
      removed: '.agents/skills/SKILL.md',
    });
    expect(existsSync(join(root, '.agents/skills/review/SKILL.md'))).toBe(true);
  });

  it('lists, shows and removes through the same bridge path as the profile card', async () => {
    const f = fixture();
    expect(await runSkillCommand('skills-memory', [], { bot: 'ada' }, async () => f.rpc)).toEqual({
      skills: [
        {
          name: 'review',
          description: 'Skill review',
          path: '.agents/skills/review/SKILL.md',
          userInvocable: true,
        },
      ],
    });
    expect(
      await runSkillCommand('skills-show', ['review'], { owner: 'bot:ada' }, async () => f.rpc),
    ).toEqual({
      skill: {
        name: 'review',
        description: 'Skill review',
        owner: { kind: 'bot', botSlug: 'ada' },
        path: '.agents/skills/review/SKILL.md',
        content: 'Do review',
      },
    });
    expect(
      await runSkillCommand('skills-show', ['pdf'], { owner: 'host' }, async () => f.rpc),
    ).toMatchObject({ skill: { name: 'pdf', description: 'Host pdf', content: 'Read PDFs' } });
    await expect(
      runSkillCommand('skills-remove', ['review'], { bot: 'ada' }, async () => f.rpc),
    ).rejects.toThrow(/--confirm/);
    expect(
      await runSkillCommand(
        'skills-remove',
        ['review'],
        { bot: 'ada', confirm: true },
        async () => f.rpc,
      ),
    ).toEqual({ name: 'review', removed: '.agents/skills/review' });
    expect(f.invalidate).toHaveBeenCalledWith('ada');
    expect(git(f.root, 'log', '-1', '--format=%s')).toBe('skills: remove review');
    expect(await f.methods.botSkills({ slug: 'ada' })).toEqual({ ok: true, value: { skills: [] } });
  });

  it('refuses unknown Bots, missing Skills and malformed owners with coded results', async () => {
    const f = fixture();
    expect(await f.methods.botSkills({ slug: 'nobody' })).toMatchObject({ ok: false });
    expect(await f.methods.skillShow({ name: 'gone', owner: 'bot:ada' })).toMatchObject({
      ok: false,
      error: { code: 'skill-not-found' },
    });
    expect(await f.methods.skillShow({ name: 'review', owner: 'nobody' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(await f.methods.botSkillRemove({ slug: 'ada', name: 'gone' })).toMatchObject({
      ok: false,
      error: { code: 'skill-not-found' },
    });
    await expect(
      runSkillCommand('skills-show', ['review'], { owner: 'bad' }, async () => f.rpc),
    ).rejects.toThrow(/--owner/);
  });
});
