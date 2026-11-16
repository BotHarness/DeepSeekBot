import { Context } from '@deepseek-ai/cordis';
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hostSkillRegistry } from '../src/runtime/native-agent-compat.js';
import { installMemorySkillProvider } from '../src/skills/memory-provider.js';
import { createTempRoot } from './helpers.js';

interface Summary {
  name: string;
  source: string;
  provider: string;
  path?: string;
  invocation: { userInvocable: boolean; modelInvocable: boolean };
}

interface Registry {
  list(options?: { cwd?: string; scope?: object }): Promise<Summary[]>;
  get(
    name: string,
    options?: { cwd?: string; scope?: object },
  ): Promise<(Summary & { content: string; resourceBase?: unknown }) | undefined>;
  registerProvider(create: () => unknown): () => void;
}

function skill(root: string, folder: string, name: string, body: string, extra = ''): string {
  const directory = join(root, folder, 'skills', name);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, 'SKILL.md');
  writeFileSync(
    path,
    `---\nname: ${name}\ndescription: ${name} from ${folder}\n${extra}---\n${body}\n`,
  );
  return path;
}

async function withRegistry(
  run: (registry: Registry, scoped: (key: object, parent?: object) => Context) => Promise<void>,
): Promise<void> {
  const ctx = new Context();
  const dshRequire = createRequire(
    createRequire(import.meta.url).resolve('@deepseek-ai/dsh/package.json'),
  );
  const { SkillRegistry } = await import(
    pathToFileURL(dshRequire.resolve('@deepseek-ai/dsh-skill')).href
  );
  const runtime = ctx.plugin(SkillRegistry, {});
  await runtime.await();
  try {
    await ctx
      .inject(['skills'], async (injected) => {
        await run(
          hostSkillRegistry<Registry>(injected)!,
          (key, parent) => createScope(ctx, key, parent === undefined ? {} : { parent }).ctx,
        );
      })
      .await();
  } finally {
    await runtime.dispose();
  }
}

describe('Memory Skills in Assignment Sessions', () => {
  it('shows only the Assignment Bot its Memory Skills, loadable by name, with Workspace Project Skills winning a clash', async () => {
    const repository = createTempRoot();
    mkdirSync(join(repository, '.git'));
    skill(repository, '.agents', 'deploy', 'Project deploy.');
    const workspace = join(repository, 'packages', 'shop');
    mkdirSync(workspace, { recursive: true });
    const adaMemory = createTempRoot();
    const bobMemory = createTempRoot();
    skill(adaMemory, '.agents', 'release-notes', 'Group merged PRs.');
    skill(adaMemory, '.dsh', 'house-style', 'Write in Ada house style.');
    skill(adaMemory, '.agents', 'deploy', 'Ada private deploy.');
    skill(adaMemory, '.agents', 'quiet', 'Only for Humans.', 'disable-model-invocation: true\n');
    skill(bobMemory, '.agents', 'bob-only', 'Bob knows this.');
    await withRegistry(async (registry, scoped) => {
      const preset = {};
      (scoped(preset).get('skills') as Registry).registerProvider(() => ({
        name: 'workspace-and-user',
        async list(options: { cwd?: string }) {
          return [
            ...(options.cwd === workspace
              ? [
                  {
                    name: 'deploy',
                    description: 'Project deploy',
                    source: 'project-agents',
                    provider: 'workspace-and-user',
                    invocation: { userInvocable: true, modelInvocable: true },
                    rank: 100,
                    locator: 'deploy',
                  },
                ]
              : []),
            {
              name: 'house-style',
              description: 'Host house style',
              source: 'user-agents',
              provider: 'workspace-and-user',
              invocation: { userInvocable: true, modelInvocable: true },
              rank: 300,
              locator: 'house-style',
            },
          ];
        },
        async get() {
          return undefined;
        },
      }));
      const ada = {};
      const bob = {};
      const stopAda = installMemorySkillProvider(scoped(ada), () => adaMemory);
      installMemorySkillProvider(scoped(bob), () => bobMemory);
      expect(
        (await registry.list({ cwd: workspace, scope: ada })).map((entry) => [
          entry.name,
          entry.source,
        ]),
      ).not.toContainEqual(['deploy', 'bot-memory']);
      bindScopeParent(ada, preset);
      bindScopeParent(bob, preset);

      const seen = await registry.list({ cwd: workspace, scope: ada });
      expect(seen.map((entry) => [entry.name, entry.source])).toEqual([
        ['deploy', 'project-agents'],
        ['house-style', 'bot-memory'],
        ['quiet', 'bot-memory'],
        ['release-notes', 'bot-memory'],
      ]);
      expect(seen.find((entry) => entry.name === 'quiet')?.invocation.modelInvocable).toBe(false);
      expect(seen.some((entry) => entry.name === 'bob-only')).toBe(false);

      const loaded = await registry.get('release-notes', { cwd: workspace, scope: ada });
      expect(loaded?.content).toBe('Group merged PRs.');
      expect(loaded?.path).toBe(join(adaMemory, '.agents/skills/release-notes/SKILL.md'));
      expect(loaded?.resourceBase).toEqual({
        kind: 'directory',
        path: join(adaMemory, '.agents/skills/release-notes'),
      });
      expect((await registry.get('house-style', { cwd: workspace, scope: ada }))?.content).toBe(
        'Write in Ada house style.',
      );

      const bobSees = (await registry.list({ cwd: workspace, scope: bob })).map((e) => e.name);
      expect(bobSees).toContain('bob-only');
      expect(bobSees).not.toContain('release-notes');
      expect((await registry.list({ cwd: workspace, scope: preset })).map((e) => e.name)).toEqual([
        'deploy',
        'house-style',
      ]);

      stopAda();
      expect(
        (await registry.list({ cwd: workspace, scope: ada })).some(
          (e) => e.source === 'bot-memory',
        ),
      ).toBe(false);
    });
  });

  it('lists nothing when the Memory Repository is unavailable', async () => {
    await withRegistry(async (registry, scoped) => {
      const agent = {};
      installMemorySkillProvider(scoped(agent), () => undefined);
      expect(await registry.list({ cwd: createTempRoot(), scope: agent })).toEqual([]);
    });
  });
});
