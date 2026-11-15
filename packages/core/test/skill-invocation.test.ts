import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { skillInvocationTokens } from '../src/bots/cli-skills.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { markSkillTokens, skillInvocationPrompt } from '../src/runtime/bot-runtime.js';
import {
  SkillCatalog,
  rankSkillEntries,
  type SkillRegistryDefinition,
  type SkillRegistryPort,
} from '../src/skills/catalog.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

function skill(
  name: string,
  source: string,
  path: string,
  content = `Body of ${name}`,
  userInvocable = true,
): SkillRegistryDefinition {
  return {
    name,
    description: `${name} description`,
    source,
    path,
    content,
    invocation: { userInvocable },
  };
}

/** A DSH-shaped registry: project roots win over Host rows of the same name. */
function registry(
  host: SkillRegistryDefinition[],
  project: Map<string, SkillRegistryDefinition[]>,
) {
  const view = (cwd?: string) => {
    const local = cwd === undefined ? [] : (project.get(cwd) ?? []);
    const names = new Set(local.map((item) => item.name));
    return [...local, ...host.filter((item) => !names.has(item.name))];
  };
  const port: SkillRegistryPort = {
    async list(options) {
      return view(options?.cwd);
    },
    async get(name, options) {
      return view(options?.cwd).find((item) => item.name === name);
    },
  };
  return port;
}

describe('SkillCatalog', () => {
  it('lists Host Skills and each Bot Memory Skill, keeping same-named Host Skills visible', async () => {
    const memory = '/profiles/ada/memory';
    const catalog = new SkillCatalog({
      memoryDirFor: (slug) => (slug === 'ada' ? memory : undefined),
    });
    expect(await catalog.list(['ada'])).toEqual([]);
    catalog.attach(
      registry(
        [
          skill('pdf', 'user-agents', '/home/.agents/skills/pdf/SKILL.md'),
          skill('hidden', 'user-dsh', '/home/.dsh/skills/hidden/SKILL.md', 'x', false),
        ],
        new Map([
          [
            memory,
            [
              skill('pdf', 'project-agents', join(memory, '.agents/skills/pdf/SKILL.md')),
              skill('review', 'project-dsh', join(memory, '.dsh/skills/review/SKILL.md')),
              skill('outside', 'project-agents', '/elsewhere/.agents/skills/outside/SKILL.md'),
            ],
          ],
        ]),
      ),
    );
    const entries = await catalog.list(['ada', 'ghost']);
    expect(entries.map((entry) => [entry.name, entry.owner])).toEqual([
      ['pdf', { kind: 'bot', botSlug: 'ada' }],
      ['review', { kind: 'bot', botSlug: 'ada' }],
      ['pdf', { kind: 'host' }],
    ]);
    expect(await catalog.resolve('pdf', { kind: 'host' })).toMatchObject({
      content: 'Body of pdf',
      path: '/home/.agents/skills/pdf/SKILL.md',
    });
    expect(await catalog.resolve('pdf', { kind: 'bot', botSlug: 'ada' })).toMatchObject({
      path: join(memory, '.agents/skills/pdf/SKILL.md'),
    });
    expect(await catalog.resolve('outside', { kind: 'bot', botSlug: 'ada' })).toBeUndefined();
    expect(await catalog.resolve('review', { kind: 'host' })).toBeUndefined();
    expect(await catalog.resolve('hidden', { kind: 'host' })).toBeUndefined();
  });

  it('ranks name prefix, then name subsequence, then description', () => {
    const entries = [
      { name: 'zeta', description: 'about pr reviews' },
      { name: 'make-pr', description: '' },
      { name: 'pr-summary', description: '' },
      { name: 'other', description: '' },
    ];
    expect(rankSkillEntries(entries, 'pr').map((entry) => entry.name)).toEqual([
      'pr-summary',
      'make-pr',
      'zeta',
    ]);
    expect(rankSkillEntries(entries, '')).toHaveLength(4);
  });
});

describe('Skill Invocation in a Human DM', () => {
  it('snapshots the picked Skill and delivers it without a bare /name', async () => {
    const home = createTempRoot('botharness-skill-invocation-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      const memory = core.registry.memoryDirFor('ada')!;
      const skillPath = join(memory, '.agents/skills/summarize-pr/SKILL.md');
      const project = new Map([
        [
          memory,
          [skill('summarize-pr', 'project-agents', skillPath, 'Summarize the PR in 3 bullets.')],
        ],
      ]);
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
      });
      catalog.attach(registry([skill('pdf', 'user-agents', '/home/pdf/SKILL.md')], project));
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });

      expect(await methods.channelSkillCatalog({ channelId: dm.id })).toMatchObject({
        ok: true,
        value: {
          skills: [
            { name: 'summarize-pr', owner: { kind: 'bot', botSlug: 'ada' }, path: skillPath },
            { name: 'pdf', owner: { kind: 'host' } },
          ],
        },
      });

      const body = 'please /summarize-pr #42';
      const start = body.indexOf('/');
      const sent = await methods.channelSend({
        channelId: dm.id,
        body,
        skillInvocations: [
          {
            name: 'summarize-pr',
            owner: { kind: 'bot', botSlug: 'ada' },
            start,
            end: start + '/summarize-pr'.length,
          },
        ],
      });
      expect(sent.ok).toBe(true);
      const message = sent.ok ? sent.value.message : undefined;
      expect(message?.skillInvocations).toEqual([
        {
          name: 'summarize-pr',
          owner: { kind: 'bot', botSlug: 'ada' },
          start,
          end: start + 13,
          path: skillPath,
          content: 'Summarize the PR in 3 bullets.',
        },
      ]);

      project.set(memory, []);
      expect(core.channels.message(dm.id, message!.id)?.skillInvocations?.[0]?.content).toBe(
        'Summarize the PR in 3 bullets.',
      );

      if (runs.length === 0)
        core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
          channelId: dm.id,
          messageId: message!.id,
          body,
        });
      await core.runtime.whenIdle();
      const delivered = runs.find((run) => run.includes('<skill_invocation'));
      expect(delivered).toContain('please [/summarize-pr] #42');
      expect(delivered).toContain(
        `<skill_invocation name="summarize-pr" owner="bot:ada" path="${skillPath}">\nSummarize the PR in 3 bullets.\n</skill_invocation>`,
      );
      expect(delivered).not.toMatch(/(^|\s)\/summarize-pr(?=\s|$)/mu);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('refuses tokens that do not match the body, other Bots and Skills that are gone', async () => {
    const home = createTempRoot('botharness-skill-invocation-refuse-');
    const core = createCore({ dshHome: home, agents: adapter(async () => {}) });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
      });
      catalog.attach(registry([skill('pdf', 'user-agents', '/home/pdf/SKILL.md')], new Map()));
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      const send = (body: string, token: Record<string, unknown>) =>
        methods.channelSend({ channelId: dm.id, body, skillInvocations: [token] });

      expect(
        await send('/pdf', { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 3 }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await send('/pdf now', {
          name: 'pdf',
          owner: { kind: 'bot', botSlug: 'bob' },
          start: 0,
          end: 4,
        }),
      ).toMatchObject({ ok: false });
      expect(
        await send('/gone now', { name: 'gone', owner: { kind: 'host' }, start: 0, end: 5 }),
      ).toMatchObject({ ok: false, error: { code: 'skill-unavailable' } });
      expect(
        await send('/pdf now', { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 4 }),
      ).toMatchObject({
        ok: true,
        value: { message: { skillInvocations: [{ name: 'pdf', content: 'Body of pdf' }] } },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

describe('Skill Invocation text', () => {
  it('marks only picked tokens and escapes the path attribute', () => {
    const invocations = [
      {
        name: 'pdf',
        owner: { kind: 'host' } as const,
        start: 0,
        end: 4,
        path: '/a"b/SKILL.md',
        content: 'Do PDF things.',
      },
    ];
    expect(markSkillTokens('/pdf and /pdf-two and x/pdf', invocations)).toBe(
      '[/pdf] and /pdf-two and x/pdf',
    );
    expect(skillInvocationPrompt(invocations)).toContain(
      '<skill_invocation name="pdf" owner="host" path="/a&quot;b/SKILL.md">\nDo PDF things.\n</skill_invocation>',
    );
    expect(skillInvocationPrompt([])).toBe('');
  });
});

describe('deepseekbot send --skill', () => {
  it('maps owner/name to the first matching /name token', () => {
    expect(skillInvocationTokens('run /pdf then /review', ['bot:ada/review', 'host/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 4, end: 8 },
      { name: 'review', owner: { kind: 'bot', botSlug: 'ada' }, start: 14, end: 21 },
    ]);
    expect(() => skillInvocationTokens('no token', ['host/pdf'])).toThrow(/needs \/pdf/u);
    expect(() => skillInvocationTokens('/pdf', ['pdf'])).toThrow(/<owner>\/<name>/u);
  });
});
