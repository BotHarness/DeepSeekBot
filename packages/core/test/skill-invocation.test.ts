import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { parseImCommand } from '../src/messaging/im-commands.js';
import { skillInvocationTokens } from '../src/bots/cli-skills.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { markSkillTokens, skillInvocationPrompt } from '../src/runtime/bot-runtime.js';
import {
  SkillCatalog,
  MAX_SKILL_INVOCATION_CONTENT,
  rankSkillEntries,
  type SkillRegistryDefinition,
  type SkillRegistryPort,
  type SkillViewPort,
} from '../src/skills/catalog.js';
import { createSkillViewPort } from '../src/skills/agent-view.js';
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

function registry(
  host: SkillRegistryDefinition[],
  project: Map<string, SkillRegistryDefinition[]>,
) {
  const view = (cwd?: string, scope?: object) => {
    if (scope === undefined) return host.filter((item) => item.source === 'runtime');
    const local = cwd === undefined ? [] : (project.get(cwd) ?? []);
    const names = new Set(local.map((item) => item.name));
    return [...local, ...host.filter((item) => !names.has(item.name))];
  };
  const port: SkillRegistryPort = {
    async list(options) {
      return view(options?.cwd, options?.scope);
    },
    async get(name, options) {
      return view(options?.cwd, options?.scope).find((item) => item.name === name);
    },
  };
  return port;
}

const liveAgent = { session: { id: 'ada-orchestrator' } };
const liveView: SkillViewPort = async (_slug, registry) => ({
  registry,
  scope: liveAgent,
  async [Symbol.asyncDispose]() {},
});

describe('SkillCatalog', () => {
  it.each(['host', 'bot'] as const)(
    'rejects oversized %s Skills without truncating',
    async (kind) => {
      const memory = '/profiles/ada/memory';
      const definition = skill(
        'pdf',
        kind === 'host' ? 'user-agents' : 'project-agents',
        join(memory, '.agents/skills/pdf/SKILL.md'),
        'x'.repeat(MAX_SKILL_INVOCATION_CONTENT),
      );
      const catalog = new SkillCatalog({ memoryDirFor: () => memory, viewFor: liveView });
      const definitions = [definition];
      catalog.attach(
        registry(kind === 'host' ? definitions : [], new Map([[memory, definitions]])),
      );
      const owner = kind === 'host' ? { kind } : { kind, botSlug: 'ada' };
      expect((await catalog.resolve('pdf', owner, 'ada'))?.content).toBe(definition.content);
      definitions[0] = { ...definition, content: definition.content + 'x' };
      await expect(catalog.resolve('pdf', owner, 'ada')).rejects.toThrow(/Skill \/pdf.*64000/u);
    },
  );

  it('uses the live Orchestrator scope and its isolated registry for both lookups', async () => {
    const memory = '/profiles/ada/memory';
    const scoped = registry(
      [skill('host', 'custom', '/host/SKILL.md')],
      new Map([
        [memory, [skill('qa', 'project-agents', join(memory, '.agents/skills/qa/SKILL.md'))]],
      ]),
    );
    const list = vi.spyOn(scoped, 'list');
    const get = vi.spyOn(scoped, 'get');
    const acquireScope = vi.fn();
    const serviceFor = vi.fn(() => scoped);
    const viewFor = vi.fn(
      createSkillViewPort({
        agentFor: () => liveAgent,
        presetFor: () => 'bot-preset',
        agentPresets: () => ({ serviceFor, acquireScope }),
      }),
    );
    const catalog = new SkillCatalog({ memoryDirFor: () => memory, viewFor });
    catalog.attach(registry([], new Map()));
    expect((await catalog.list(['ada', 'ada'])).map((row) => row.name)).toEqual(['qa', 'host']);
    expect(list.mock.calls).toEqual([[{ cwd: memory, scope: liveAgent }], [{ scope: liveAgent }]]);
    expect(viewFor).toHaveBeenCalledTimes(1);
    expect(serviceFor).toHaveBeenCalledWith(liveAgent, 'skills');
    expect(acquireScope).not.toHaveBeenCalled();
    await catalog.resolve('qa', { kind: 'bot', botSlug: 'ada' }, 'bob');
    await catalog.resolve('host', { kind: 'host' }, 'bob');
    expect(viewFor.mock.calls.map(([slug]) => slug)).toEqual(['ada', 'ada', 'bob']);
    expect(get.mock.calls).toEqual([
      ['qa', { cwd: memory, scope: liveAgent }],
      ['host', { scope: liveAgent }],
    ]);
  });

  it('releases a standing scope after list and resolve, including failed lookups', async () => {
    const scope = {};
    let active = 0;
    const release = vi.fn(async () => {
      active--;
    });
    const port: SkillRegistryPort = {
      async list(options) {
        expect(active).toBe(1);
        expect(options?.scope).toBe(scope);
        return [skill('host', 'user-agents', '/host/SKILL.md')];
      },
      async get(name, options) {
        expect(active).toBe(1);
        expect(options?.scope).toBe(scope);
        if (name === 'host') return skill('host', 'user-agents', '/host/SKILL.md');
        throw new Error('lookup failed');
      },
    };
    const acquireScope = vi.fn(async (_id?: string) => {
      active++;
      return { key: scope, [Symbol.asyncDispose]: release };
    });
    const catalog = new SkillCatalog({
      memoryDirFor: () => '/memory',
      viewFor: createSkillViewPort({
        agentFor: () => undefined,
        presetFor: () => 'bot-preset',
        agentPresets: () => ({ serviceFor: vi.fn(), acquireScope }),
      }),
    });
    catalog.attach(port);
    await catalog.list(['ada']);
    expect(active).toBe(0);
    expect(await catalog.resolve('host', { kind: 'host' }, 'ada')).toMatchObject({ name: 'host' });
    expect(active).toBe(0);
    await expect(catalog.resolve('broken', { kind: 'host' }, 'ada')).rejects.toThrow(
      'lookup failed',
    );
    expect(active).toBe(0);
    catalog.invalidateBot('ada');
    vi.spyOn(port, 'list').mockRejectedValueOnce(new Error('list failed'));
    await expect(catalog.list(['ada'])).rejects.toThrow('list failed');
    expect(active).toBe(0);
    expect(release).toHaveBeenCalledTimes(4);
    expect(acquireScope.mock.calls).toEqual([
      ['bot-preset'],
      ['bot-preset'],
      ['bot-preset'],
      ['bot-preset'],
    ]);
  });

  it('keeps the live scope when its preset uses the Host registry', async () => {
    const catalog = new SkillCatalog({
      memoryDirFor: () => '/memory',
      viewFor: createSkillViewPort({
        agentFor: () => liveAgent,
        presetFor: () => 'default',
        agentPresets: () => ({ serviceFor: () => undefined, acquireScope: vi.fn() }),
      }),
    });
    catalog.attach(registry([skill('host', 'user-dsh', '/host/SKILL.md')], new Map()));
    expect(await catalog.resolve('host', { kind: 'host' }, 'ada')).toMatchObject({ name: 'host' });
  });

  it('keeps the plain global registry fallback when agent presets are absent', async () => {
    const catalog = new SkillCatalog({
      memoryDirFor: () => '/memory',
      viewFor: createSkillViewPort({
        agentFor: () => liveAgent,
        presetFor: () => 'default',
        agentPresets: () => undefined,
      }),
    });
    catalog.attach(
      registry(
        [
          skill('runtime', 'runtime', '/runtime/SKILL.md'),
          skill('filesystem', 'user-agents', '/host/SKILL.md'),
        ],
        new Map(),
      ),
    );
    expect((await catalog.list(['ada'])).map((row) => row.name)).toEqual(['runtime']);
    expect(await catalog.resolve('runtime', { kind: 'host' }, 'ada')).toMatchObject({
      name: 'runtime',
    });
    expect(await catalog.resolve('filesystem', { kind: 'host' }, 'ada')).toBeUndefined();
    expect(await catalog.list([])).toEqual([]);
  });

  it('lists Host Skills only from the first eligible Bot view', async () => {
    const viewFor = vi.fn<SkillViewPort>(async (slug) => ({
      registry: registry([skill(`host-${slug}`, 'bundled', '/host/SKILL.md')], new Map()),
      scope: {},
      async [Symbol.asyncDispose]() {},
    }));
    const catalog = new SkillCatalog({
      memoryDirFor: (slug) => (slug === 'ghost' ? undefined : `/memory/${slug}`),
      viewFor,
    });
    catalog.attach(registry([], new Map()));
    expect((await catalog.list(['ghost', 'ada', 'bob', 'ada'])).map((row) => row.name)).toEqual([
      'host-ada',
    ]);
    expect(viewFor.mock.calls.map(([slug]) => slug)).toEqual(['ada', 'bob']);
  });

  it('lists Host Skills and each Bot Memory Skill, keeping same-named Host Skills visible', async () => {
    const memory = '/profiles/ada/memory';
    const catalog = new SkillCatalog({
      viewFor: liveView,
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
    expect(await catalog.resolve('pdf', { kind: 'host' }, 'ada')).toMatchObject({
      content: 'Body of pdf',
      path: '/home/.agents/skills/pdf/SKILL.md',
    });
    expect(await catalog.resolve('pdf', { kind: 'bot', botSlug: 'ada' }, 'bob')).toMatchObject({
      path: join(memory, '.agents/skills/pdf/SKILL.md'),
    });
    expect(
      await catalog.resolve('outside', { kind: 'bot', botSlug: 'ada' }, 'bob'),
    ).toBeUndefined();
    expect(await catalog.resolve('review', { kind: 'host' }, 'ada')).toBeUndefined();
    expect(await catalog.resolve('hidden', { kind: 'host' }, 'ada')).toBeUndefined();
  });

  it('matches a Memory Repository reached through a symlink against DSH real paths', async () => {
    const root = createTempRoot('botharness-skill-symlink-');
    const real = join(root, 'real-memory');
    const link = join(root, 'linked-memory');
    mkdirSync(join(real, '.agents/skills/qa'), { recursive: true });
    writeFileSync(join(real, '.agents/skills/qa/SKILL.md'), 'x');
    symlinkSync(real, link);
    const skillPath = join(realpathSync(real), '.agents/skills/qa/SKILL.md');
    const catalog = new SkillCatalog({
      viewFor: liveView,
      memoryDirFor: () => link,
    });
    catalog.attach(registry([], new Map([[link, [skill('qa', 'project-agents', skillPath)]]])));
    expect((await catalog.list(['ada'])).map((entry) => entry.owner)).toEqual([
      { kind: 'bot', botSlug: 'ada' },
    ]);
  });

  it('ranks owner display names and slugs below name matches and above descriptions stably', () => {
    const entries = [
      { name: 'desc-first', description: 'Alice workflow', owners: [] },
      { name: 'review', description: '', owners: ['ALICE', 'reviewer'] },
      { name: 'alice-two', description: '', owners: [] },
      { name: 'a-l-i-c-e', description: '', owners: [] },
      { name: 'pdf', description: '', owners: ['Alice', 'reviewer'] },
      { name: 'alice-one', description: '', owners: [] },
      { name: 'desc-second', description: 'alice notes', owners: [] },
      { name: 'other', description: '', owners: ['Bob'] },
    ];
    expect(
      rankSkillEntries(entries, ' ALiCe ', (entry) => entry.owners).map((entry) => entry.name),
    ).toEqual([
      'alice-two',
      'alice-one',
      'a-l-i-c-e',
      'review',
      'pdf',
      'desc-first',
      'desc-second',
    ]);
    expect(
      rankSkillEntries(entries, 'VIEWER', (entry) => entry.owners).map((entry) => entry.name),
    ).toEqual(['review', 'pdf']);
    expect(
      rankSkillEntries(entries, 'lice', (entry) => entry.owners).map((entry) => entry.name),
    ).toContain('pdf');
    expect(rankSkillEntries(entries, '', (entry) => entry.owners)).toEqual(entries);
    expect(rankSkillEntries(entries, 'missing', (entry) => entry.owners)).toEqual([]);
    expect(entries[0]?.name).toBe('desc-first');
  });

  it('bounds owner lookups to one per unmatched Skill and skips them for an empty query', () => {
    const entries = Array.from({ length: 1000 }, (_, index) => ({
      name: `skill-${index}`,
      description: '',
    }));
    const owners = vi.fn(() => ['Alice', 'reviewer']);
    expect(rankSkillEntries(entries, 'alice', owners)).toEqual(entries);
    expect(owners).toHaveBeenCalledTimes(entries.length);
    owners.mockClear();
    expect(rankSkillEntries(entries, '  ', owners)).toEqual(entries);
    expect(owners).not.toHaveBeenCalled();
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
  it.each(['host', 'bot'] as const)(
    'refuses an oversized %s Skill before storing or delivering a message',
    async (kind) => {
      const runs = vi.fn(async (_run: OrchestratorAgentRun) => {});
      const core = createCore({
        dshHome: createTempRoot('botharness-skill-too-large-'),
        agents: adapter(runs),
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        const memory = core.registry.memoryDirFor('ada')!;
        const definition = skill(
          'pdf',
          kind === 'host' ? 'user-agents' : 'project-agents',
          join(memory, '.agents/skills/pdf/SKILL.md'),
          'x'.repeat(MAX_SKILL_INVOCATION_CONTENT + 1),
        );
        const catalog = new SkillCatalog({ memoryDirFor: () => memory, viewFor: liveView });
        catalog.attach(
          registry(kind === 'host' ? [definition] : [], new Map([[memory, [definition]]])),
        );
        const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
        const before = core.channels.readMessages(dm.id);
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        expect(
          await methods.channelSend({
            channelId: dm.id,
            body: '/pdf',
            skillInvocations: [
              {
                name: 'pdf',
                owner: kind === 'host' ? { kind } : { kind, botSlug: 'ada' },
                start: 0,
                end: 4,
              },
            ],
          }),
        ).toMatchObject({
          ok: false,
          error: { code: 'skill-too-large', message: expect.stringMatching(/Skill \/pdf.*64000/u) },
        });
        await core.runtime.whenIdle();
        expect(core.channels.readMessages(dm.id)).toEqual(before);
        expect(runs).not.toHaveBeenCalled();
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it.each(['dm', 'group'] as const)(
    'keeps selected Skill spans and defangs mentions in a %s prompt',
    async (type) => {
      const runs: string[] = [];
      const core = createCore({
        dshHome: createTempRoot('botharness-skill-mention-spans-'),
        agents: adapter(async (run) => {
          runs.push(run.message);
        }),
      });
      try {
        core.registry.create({ slug: 'ada', displayName: 'Ada' });
        core.registry.create({ slug: 'bob', displayName: 'Bob' });
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(registry([skill('pdf', 'user-agents', '/host/pdf/SKILL.md')], new Map()));
        const channel =
          type === 'dm'
            ? core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!
            : core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
                name: 'Team',
                members: ['ada', 'bob'],
              });
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const cases: [string, string][] = [
          ['/pdf, next @Bob and /pdf', '[/pdf], next \u2060@Bob and /pdf'],
          ['@Bob /pdf, next /pdf', '\u2060@Bob [/pdf], next /pdf'],
          ['/pdf @Bob /pdf, next /pdf', '[/pdf] \u2060@Bob [/pdf], next /pdf'],
        ];
        for (const [body, expected] of cases) {
          const mentionStart = body.indexOf('@Bob');
          const starts = [body.indexOf('/pdf')];
          if (body.startsWith('/pdf @')) starts.push(body.indexOf('/pdf', 4));
          const sent = await methods.channelSend({
            channelId: channel.id,
            body,
            mentions: [
              { botSlug: 'bob', label: 'Bob', start: mentionStart, end: mentionStart + 4 },
            ],
            skillInvocations: starts.map((start) => ({
              name: 'pdf',
              owner: { kind: 'host' },
              start,
              end: start + 4,
            })),
          });
          expect(sent.ok).toBe(true);
          if (!sent.ok) throw new Error(sent.error.message);
          if (type === 'group') core.runtime.admitGroupMessage(channel.id, sent.value.message.id);
          else
            core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
              channelId: channel.id,
              messageId: sent.value.message.id,
              body,
            });
          await core.runtime.whenIdle();
          const delivered = runs.filter((run) =>
            run.includes(`Message ID: ${sent.value.message.id}`),
          );
          expect(delivered.length).toBeGreaterThan(0);
          for (const prompt of delivered) {
            expect(prompt).toContain(expected);
            expect(prompt).toContain('<skill_invocation name="pdf"');
          }
        }
      } finally {
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('uses the DM Bot and first eligible Group Bot when resolving Host Skills', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-skill-viewer-'),
      agents: adapter(async () => {}),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      core.registry.setPaused('ada', true);
      const viewFor = vi.fn(liveView);
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor,
      });
      catalog.attach(registry([skill('host', 'user-agents', '/host/SKILL.md')], new Map()));
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['ada', 'bob'],
      });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob')!;
      for (const channelId of [group.id, dm.id]) {
        expect(
          await methods.channelSend({
            channelId,
            body: '/host',
            skillInvocations: [{ name: 'host', owner: { kind: 'host' }, start: 0, end: 5 }],
          }),
        ).toMatchObject({ ok: true });
      }
      expect(viewFor.mock.calls.map(([slug]) => slug)).toEqual(['bob', 'bob']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

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
        viewFor: liveView,
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
        viewFor: liveView,
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

describe('Skill Invocation in a Group Channel', () => {
  it.each(['mention-b', 'ordinary-b', 'mentions-only', 'pending-context'] as const)(
    'keeps the Skill owner independent from routing: %s',
    async (routing) => {
      const runs: OrchestratorAgentRun[] = [];
      const core = createCore({
        dshHome: createTempRoot('botharness-group-skill-'),
        agents: adapter(async (run) => {
          runs.push(run);
        }),
      });
      try {
        core.registry.create({ slug: 'a', displayName: 'Alice' });
        core.registry.create({ slug: 'b', displayName: 'Bob' });
        const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
          name: 'Team',
          members: ['a', 'b'],
        });
        for (const slug of group.members)
          core.channels.setGroupWakePolicy(
            group.id,
            slug,
            {
              mode: routing === 'ordinary-b' && slug === 'b' ? 'all' : 'mentions',
              count: 5,
              intervalSeconds: 30,
            },
            { kind: 'human' },
          );
        const memory = core.registry.memoryDirFor('a')!;
        const path = join(memory, '.agents/skills/review/SKILL.md');
        const content = 'Use this exact snapshot from Alice.'.repeat(40);
        const definitions = [skill('review', 'project-agents', path, content)];
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(
          registry(
            [skill('pdf', 'user-agents', '/host/pdf/SKILL.md')],
            new Map([
              [memory, definitions],
              [
                core.registry.memoryDirFor('b')!,
                [
                  skill(
                    'notes',
                    'project-agents',
                    join(core.registry.memoryDirFor('b')!, '.agents/skills/notes/SKILL.md'),
                  ),
                ],
              ],
            ]),
          ),
        );
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const listed = await methods.channelSkillCatalog({ channelId: group.id });
        expect(listed).toMatchObject({
          ok: true,
          value: {
            skills: [
              { name: 'review', owner: { kind: 'bot', botSlug: 'a' } },
              { name: 'notes', owner: { kind: 'bot', botSlug: 'b' } },
              { name: 'pdf', owner: { kind: 'host' } },
            ],
          },
        });
        const body = routing === 'mention-b' ? '/review @Bob' : '/review';
        const sent = await methods.channelSend({
          channelId: group.id,
          body,
          ...(routing === 'mention-b'
            ? { mentions: [{ botSlug: 'b', label: 'Bob', start: 8, end: 12 }] }
            : {}),
          skillInvocations: [
            { name: 'review', owner: { kind: 'bot', botSlug: 'a' }, start: 0, end: 7 },
          ],
        });
        expect(sent.ok).toBe(true);
        if (!sent.ok) throw new Error(sent.error.message);
        definitions.splice(0);
        await core.runtime.whenIdle();
        if (routing === 'pending-context') {
          expect(runs).toEqual([]);
          expect(
            await methods.channelSend({
              channelId: group.id,
              body: '@Bob check pending context',
              mentions: [{ botSlug: 'b', label: 'Bob', start: 0, end: 4 }],
            }),
          ).toMatchObject({ ok: true });
          await core.runtime.whenIdle();
        }
        expect(runs.map((run) => run.bot.slug)).toEqual(routing === 'mentions-only' ? [] : ['b']);
        const stored = core.channels.message(group.id, sent.value.message.id)!;
        expect(stored.skillInvocations).toEqual([
          { name: 'review', owner: { kind: 'bot', botSlug: 'a' }, start: 0, end: 7, path, content },
        ]);
        if (routing !== 'mentions-only') {
          expect(runs[0]?.message).toContain('[/review]');
          expect(runs[0]?.message).toContain(
            `<skill_invocation name="review" owner="bot:a" path="${path}">\n${content}\n</skill_invocation>`,
          );
        }
      } finally {
        core.externalMessaging.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it.each(['discord', 'feishu'] as const)(
    'mirrors the persisted Human body through %s as plain /name without snapshot metadata',
    async (platform) => {
      const core = createCore({ dshHome: createTempRoot('botharness-skill-im-') });
      try {
        core.registry.create({ slug: 'a', displayName: 'Alice' });
        const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
          name: 'Team',
          members: ['a'],
        });
        const catalog = new SkillCatalog({
          memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
          viewFor: liveView,
        });
        catalog.attach(
          registry(
            [skill('pdf', 'user-agents', '/host/pdf/SKILL.md', 'PRIVATE_SNAPSHOT_CONTENT')],
            new Map(),
          ),
        );
        const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
        const sent = await methods.channelSend({
          channelId: group.id,
          body: 'please /pdf now',
          skillInvocations: [{ name: 'pdf', owner: { kind: 'host' }, start: 7, end: 11 }],
        });
        if (!sent.ok) throw new Error(sent.error.message);
        const message = core.channels.message(group.id, sent.value.message.id)!;
        expect(message.skillInvocations?.[0]?.content).toBe('PRIVATE_SNAPSHOT_CONTENT');
        const sendChecked = vi.fn<DshImOutboundService['sendChecked']>(async () => ({
          sent: true,
        }));
        const fingerprint = 'a'.repeat(64);
        const service: DshImOutboundService = {
          contractVersion: 1,
          listBots: async () => [{ botId: 'app', channel: platform }],
          listTargets: async () => [{ targetId: 'team', kind: 'group', route: { chatId: 'team' } }],
          describeBot: async () => ({
            version: 1,
            botId: 'app',
            channel: platform,
            connected: true,
            account: { fingerprint },
            capabilities: ['proactive-text-checked'],
          }),
          sendChecked,
        };
        const provider = createDshImProvider(service, platform)!;
        core.externalMessaging.register(provider);
        const target = (await core.externalMessaging.targets(provider.id, 'app'))[0]!;
        const grant = await core.externalMessaging.authorize({
          botSlug: 'a',
          providerId: provider.id,
          accountRef: 'app',
          targetRef: target.ref,
          fingerprint,
          targetDigest: target.digest,
        });
        const mirrored = await core.externalMessaging.send('a', grant.id, message.id, message.body);
        expect(mirrored.state).toBe('provider-accepted');
        expect(sendChecked).toHaveBeenCalledTimes(1);
        const text = sendChecked.mock.calls[0]?.[2];
        expect(text).toBe('please /pdf now');
        expect(text).not.toMatch(/\[\/pdf\]|<|>|PRIVATE_SNAPSHOT_CONTENT/u);
        expect(sendChecked.mock.calls[0]?.[3].format).toBe('plain');
      } finally {
        core.externalMessaging.close();
        await core.runtime.close();
        core.operationalDatabase.close();
      }
    },
  );

  it('keeps a same-named bare IM command reserved without turning bare Channel text into a Skill', async () => {
    expect(parseImCommand('/status')).toMatchObject({ name: 'status' });
    expect(skillInvocationTokens('/status', undefined)).toEqual([]);
    const core = createCore({ dshHome: createTempRoot('botharness-skill-command-') });
    try {
      core.registry.create({ slug: 'a', displayName: 'Alice' });
      const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
        name: 'Team',
        members: ['a'],
      });
      const catalog = new SkillCatalog({
        memoryDirFor: (slug) => core.registry.memoryDirFor(slug),
        viewFor: liveView,
      });
      catalog.attach(
        registry([skill('status', 'user-agents', '/host/status/SKILL.md')], new Map()),
      );
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: catalog });
      expect(await methods.channelSkillCatalog({ channelId: group.id })).toMatchObject({
        ok: true,
        value: { skills: [{ name: 'status' }] },
      });
      expect(await methods.channelSend({ channelId: group.id, body: '/status' })).toMatchObject({
        ok: true,
        value: { message: { body: '/status' } },
      });
      expect(core.channels.readMessages(group.id)[0]?.skillInvocations).toBeUndefined();
      expect(
        await methods.channelSend({
          channelId: group.id,
          body: '/status',
          skillInvocations: [{ name: 'status', owner: { kind: 'host' }, start: 0, end: 7 }],
        }),
      ).toMatchObject({ ok: true, value: { message: { skillInvocations: [{ name: 'status' }] } } });
    } finally {
      core.externalMessaging.close();
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
    expect(markSkillTokens('/pdf, next', invocations)).toBe('[/pdf], next');
    expect(markSkillTokens('/pdf and /pdf', invocations)).toBe('[/pdf] and /pdf');
    expect(markSkillTokens('/pdf and /pdf', [{ ...invocations[0]!, start: 9, end: 13 }])).toBe(
      '/pdf and [/pdf]',
    );
    expect(
      markSkillTokens('/pdf /pdf', [{ ...invocations[0]!, start: 5, end: 9 }, invocations[0]!]),
    ).toBe('[/pdf] [/pdf]');
    expect(skillInvocationPrompt(invocations)).toContain(
      '<skill_invocation name="pdf" owner="host" path="/a&quot;b/SKILL.md">\nDo PDF things.\n</skill_invocation>',
    );
    expect(skillInvocationPrompt([])).toBe('');
  });
});

describe('deepseekbot send --skill', () => {
  it('assigns repeated names to unused occurrences in flag order', () => {
    expect(skillInvocationTokens('/pdf /pdf', ['host/pdf', 'bot:ada/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 0, end: 4 },
      { name: 'pdf', owner: { kind: 'bot', botSlug: 'ada' }, start: 5, end: 9 },
    ]);
    expect(skillInvocationTokens('x/pdf /pdf-two /pdf /pdf', ['bot:ada/pdf', 'host/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'bot', botSlug: 'ada' }, start: 15, end: 19 },
      { name: 'pdf', owner: { kind: 'host' }, start: 20, end: 24 },
    ]);
    expect(() => skillInvocationTokens('/pdf', ['host/pdf', 'bot:ada/pdf'])).toThrow();
    expect(() =>
      skillInvocationTokens('/pdf /pdf', ['host/pdf', 'bot:ada/pdf', 'host/pdf']),
    ).toThrow();
  });

  it('maps owner/name to the first matching /name token', () => {
    expect(skillInvocationTokens('run /pdf then /review', ['bot:ada/review', 'host/pdf'])).toEqual([
      { name: 'pdf', owner: { kind: 'host' }, start: 4, end: 8 },
      { name: 'review', owner: { kind: 'bot', botSlug: 'ada' }, start: 14, end: 21 },
    ]);
    expect(() => skillInvocationTokens('no token', ['host/pdf'])).toThrow(/needs \/pdf/u);
    expect(() => skillInvocationTokens('/pdf', ['pdf'])).toThrow(/<owner>\/<name>/u);
  });
});
