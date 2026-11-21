import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  SkillCatalog,
  MAX_SKILL_INVOCATION_CONTENT,
  rankSkillEntries,
  type SkillRegistryPort,
  type SkillViewPort,
} from '../src/skills/catalog.js';
import { createSkillViewPort } from '../src/skills/agent-view.js';
import { createTempRoot } from './helpers.js';
import { skill, registry, liveAgent, liveView } from './skill-invocation-fixtures.js';

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
