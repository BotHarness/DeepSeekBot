import { Context } from '@deepseek-ai/cordis';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createScope } from '@deepseek-ai/dsh-scope';
import { mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { runSkillCommand } from '../src/bots/cli-skills.js';
import { createChannelLiveHub } from '../src/channels/live.js';
import { createChannelStore } from '../src/channels/store.js';
import { OWNER_HUMAN_CONTEXT, humanContext } from '../src/humans/context.js';
import {
  installHostSkillInvalidation,
  hostSkillRegistry,
  onHostSkillsChange,
} from '../src/runtime/native-agent-compat.js';
import {
  SkillCatalog,
  type SkillRegistryDefinition,
  type SkillRegistryPort,
} from '../src/skills/catalog.js';
import { watchSkillCatalog } from '../src/skills/refresh.js';
import { createSkillViewPort } from '../src/skills/agent-view.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
});

function definition(name: string, path: string, description = name): SkillRegistryDefinition {
  return {
    name,
    path,
    description,
    content: description,
    source: 'project-agents',
    invocation: { userInvocable: true },
  };
}

function fixture() {
  const roots = new Map(['ada', 'bob'].map((slug) => [slug, createTempRoot()]));
  const host = [{ ...definition('host', '/host/SKILL.md'), source: 'runtime' }];
  const list = vi.fn(async (options?: { cwd?: string }) => {
    if (options?.cwd === undefined) return host;
    return ['.agents', '.dsh'].flatMap((parent) => {
      const root = join(options.cwd!, parent, 'skills');
      try {
        return readdirSync(root).flatMap((name) => {
          const path = join(root, name, 'SKILL.md');
          try {
            return [definition(name, path, readFileSync(path, 'utf8'))];
          } catch {
            return [];
          }
        });
      } catch {
        return [];
      }
    });
  });
  const registry: SkillRegistryPort = {
    list,
    async get(name, options) {
      return (await list(options)).find((skill) => skill.name === name);
    },
  };
  const catalog = new SkillCatalog({ memoryDirFor: (slug) => roots.get(slug) });
  catalog.attach(registry);
  const changed = vi.fn<(slugs: string[]) => void>();
  const diagnostic = vi.fn();
  const refresh = watchSkillCatalog({
    catalog,
    bots: () => [...roots].map(([slug, memoryDir]) => ({ slug, memoryDir })),
    changed,
    diagnostic,
  });
  stops.push(() => refresh.close());
  changed.mockClear();
  return { roots, host, catalog, changed, diagnostic, refresh, list };
}

async function mutate(f: ReturnType<typeof fixture>, write: () => void) {
  let finish: (() => void) | undefined;
  const changed = new Promise<void>((resolve) => {
    finish = resolve;
  });
  f.changed.mockImplementation(() => finish?.());
  await new Promise((resolve) => setTimeout(resolve, 50));
  write();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      changed,
      new Promise<void>((_resolve, reject) => {
        timeout = setTimeout(
          () =>
            reject(new Error('watch event missing: ' + JSON.stringify(f.diagnostic.mock.calls))),
          2000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
  f.changed.mockImplementation(() => {});
}

function put(root: string, name: string, body: string, parent = '.agents') {
  const folder = join(root, parent, 'skills', name);
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'SKILL.md'), body);
}

describe('live Skill catalog', () => {
  it.each(['.agents', '.dsh'])(
    'refreshes add/modify/delete under %s while preserving unrelated Bot and Host reads',
    async (parent) => {
      const f = fixture();
      await f.catalog.list(['ada']);
      await f.catalog.list(['bob']);
      f.list.mockClear();
      await mutate(f, () => put(f.roots.get('ada')!, 'qa', 'first', parent));
      expect(await f.catalog.list(['ada', 'bob'])).toMatchObject([
        { name: 'qa', description: 'first' },
        { name: 'host' },
      ]);
      await mutate(f, () => put(f.roots.get('ada')!, 'qa', 'edited', parent));
      expect(await f.catalog.list(['ada'])).toMatchObject([
        { description: 'edited' },
        { name: 'host' },
      ]);
      await mutate(f, () => rmSync(join(f.roots.get('ada')!, parent), { recursive: true }));
      expect((await f.catalog.list(['ada'])).map((skill) => skill.name)).toEqual(['host']);
      await f.catalog.list(['bob']);
      expect(f.list.mock.calls.map(([options]) => options?.cwd)).toEqual(
        Array(3).fill(f.roots.get('ada')),
      );
      expect(
        f.changed.mock.calls.every(([slugs]) => slugs.length === 1 && slugs[0] === 'ada'),
      ).toBe(true);
    },
  );

  it('emits scoped live frames for each real Skill file addition, modification and deletion', async () => {
    const f = fixture();
    const store = createChannelStore({ rootDir: createTempRoot() });
    const dm = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const hub = createChannelLiveHub(store);
    stops.push(() => hub.close());
    f.changed.mockImplementation((botSlugs) =>
      hub.publishSkillCatalogChanged({ botSlugs, channelIds: [dm.id] }),
    );
    const reader = hub
      .open(OWNER_HUMAN_CONTEXT, new Request('http://localhost/api/botharness/stream?scope=roster'))
      .body!.getReader();
    try {
      await reader.read();
      await f.catalog.list(['ada']);
      for (const description of ['added', 'modified', undefined]) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        if (description === undefined)
          rmSync(join(f.roots.get('ada')!, '.agents/skills/qa/SKILL.md'));
        else put(f.roots.get('ada')!, 'qa', description);
        const frame = new TextDecoder().decode((await reader.read()).value);
        expect(frame).toContain('event: skills/catalog-changed');
        expect(JSON.parse(frame.split('data: ')[1]!.trim())).toEqual({
          botSlugs: ['ada'],
          channelIds: [dm.id],
        });
        expect(
          (await f.catalog.list(['ada']))
            .filter((entry) => entry.name === 'qa')
            .map((entry) => entry.description),
        ).toEqual(description === undefined ? [] : [description]);
      }
    } finally {
      await reader.cancel();
    }
  });

  it('does not broadcast an unfiltered DSH Project notification to unrelated channels', async () => {
    const f = fixture();
    await f.catalog.list(['ada']);
    await f.catalog.list(['bob']);
    await mutate(f, () => put(f.roots.get('ada')!, 'qa', 'added'));
    await f.catalog.list(['ada']);
    f.changed.mockClear();
    f.list.mockClear();
    await f.refresh.hostChanged();
    expect(f.changed).not.toHaveBeenCalled();
    expect(f.list.mock.calls.every(([options]) => options?.cwd === undefined)).toBe(true);
    await f.catalog.list(['bob']);
    expect(f.list.mock.calls.every(([options]) => options?.cwd === undefined)).toBe(true);
  });

  it('reattaches when a Skill root is replaced at the same path', async () => {
    const f = fixture();
    const memory = f.roots.get('ada')!;
    await mutate(f, () => put(memory, 'qa', 'before'));
    await f.catalog.list(['ada']);
    await mutate(f, () => {
      renameSync(join(memory, '.agents/skills'), join(memory, 'previous-skills'));
      put(memory, 'qa', 'replaced');
    });
    expect((await f.catalog.list(['ada']))[0]?.description).toBe('replaced');
    await mutate(f, () => put(memory, 'qa', 'edited after replacement'));
    expect((await f.catalog.list(['ada']))[0]?.description).toBe('edited after replacement');
  });

  it('shares a cold Bot catalog read across concurrent channel requests', async () => {
    const list = vi.fn(async () => []);
    const catalog = new SkillCatalog({ memoryDirFor: () => '/memory/ada' });
    catalog.attach({
      list,
      async get() {
        return undefined;
      },
    });
    await Promise.all([catalog.list(['ada']), catalog.list(['ada'])]);
    expect(list).toHaveBeenCalledTimes(2);
    await catalog.list(['ada']);
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('does not retain or return an observation invalidated while a read is in flight', async () => {
    let release: ((skills: SkillRegistryDefinition[]) => void) | undefined;
    const first = new Promise<SkillRegistryDefinition[]>((resolve) => {
      release = resolve;
    });
    const fresh = definition('fresh', '/memory/ada/.agents/skills/fresh/SKILL.md');
    const list = vi.fn(async (options?: { cwd?: string }) =>
      options?.cwd === undefined ? [] : [fresh],
    );
    list.mockImplementationOnce(() => first);
    const catalog = new SkillCatalog({ memoryDirFor: () => '/memory/ada' });
    catalog.attach({
      list,
      async get() {
        return undefined;
      },
    });
    const pending = catalog.list(['ada']);
    catalog.invalidateMemory('ada');
    release!([]);
    expect(await pending).toMatchObject([{ name: 'fresh' }]);
    const calls = list.mock.calls.length;
    expect(await catalog.list(['ada'])).toMatchObject([{ name: 'fresh' }]);
    expect(list).toHaveBeenCalledTimes(calls);
  });

  it('invalidates Host portions across bots without recomputing Project portions', async () => {
    const f = fixture();
    put(f.roots.get('ada')!, 'qa', 'first');
    await f.catalog.list(['ada']);
    await f.catalog.list(['bob']);
    f.list.mockClear();
    f.host[0]!.description = 'host edited';
    await f.refresh.hostChanged();
    expect(f.changed).toHaveBeenCalledWith(['ada', 'bob']);
    for (const slug of ['ada', 'bob'])
      expect((await f.catalog.list([slug])).at(-1)?.description).toBe('host edited');
    expect(f.list.mock.calls.map(([options]) => options?.cwd)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it.each([false, true])(
    'discards a cold Host observation during a Host change (warm cache: %s)',
    async (warm) => {
      const f = fixture();
      if (warm) await f.catalog.list(['bob']);
      f.list.mockClear();
      const old = { ...f.host[0]!, name: 'old' };
      let release: (skills: SkillRegistryDefinition[]) => void = () => {};
      const deferred = new Promise<SkillRegistryDefinition[]>((resolve) => {
        release = resolve;
      });
      f.list.mockImplementationOnce(async () => []);
      f.list.mockImplementationOnce(() => deferred);
      const pending = f.catalog.list(['ada']);
      await vi.waitFor(() => expect(f.list).toHaveBeenCalledTimes(2));
      f.host[0] = { ...old, name: 'new' };
      await f.refresh.hostChanged();
      expect(f.changed).toHaveBeenCalledWith(['ada', 'bob']);
      const notified = f.catalog.list(['ada']);
      release([old]);
      expect((await pending).map((entry) => entry.name)).toEqual(['new']);
      expect((await notified).map((entry) => entry.name)).toEqual(['new']);
      expect((await f.catalog.list(['ada'])).map((entry) => entry.name)).toEqual(['new']);
    },
  );

  it('detects Host Skill body changes even when the catalog description is unchanged', async () => {
    const f = fixture();
    const path = join(createTempRoot(), 'SKILL.md');
    writeFileSync(path, 'before');
    f.host[0]!.path = path;
    await f.catalog.list(['ada']);
    f.changed.mockClear();
    writeFileSync(path, 'after with a different size');
    await f.refresh.hostChanged();
    expect(f.changed).toHaveBeenCalledWith(['ada', 'bob']);
  });

  it('reloads only the selected Bot, both catalog portions, on Agent attach, replacement and detach', async () => {
    const root = createTempRoot();
    let selected: object | undefined;
    const first = {};
    const replacement = {};
    const project = (name: string) =>
      definition(name, join(root, '.agents/skills', name, 'SKILL.md'));
    const host = { ...definition('host', '/host/SKILL.md'), source: 'runtime' };
    const global: SkillRegistryPort = {
      list: vi.fn<SkillRegistryPort['list']>(async (options) =>
        options?.cwd === undefined ? [host] : [project('preset')],
      ),
      async get() {
        return undefined;
      },
    };
    const scoped: SkillRegistryPort = {
      list: vi.fn<SkillRegistryPort['list']>(async (options) =>
        options?.cwd === undefined
          ? [host]
          : [project(options.scope === first ? 'live' : 'replacement')],
      ),
      async get() {
        return undefined;
      },
    };
    const catalog = new SkillCatalog({
      memoryDirFor: () => root,
      viewFor: createSkillViewPort({
        agentFor: (slug) => (slug === 'ada' ? selected : undefined),
        presetFor: () => 'default',
        agentPresets: () => ({
          serviceFor: () => scoped,
          async acquireScope() {
            return { key: {}, async [Symbol.asyncDispose]() {} };
          },
        }),
      }),
    });
    catalog.attach(global);
    const changed = vi.fn();
    const refresh = watchSkillCatalog({
      catalog,
      bots: () =>
        ['ada', 'bob'].map((slug) => ({
          slug,
          memoryDir: root,
          agent: slug === 'ada' ? selected : undefined,
        })),
      changed,
      diagnostic: vi.fn(),
    });
    stops.push(() => refresh.close());
    expect((await catalog.list(['ada'])).map((entry) => entry.name)).toEqual(['preset', 'host']);
    await catalog.list(['bob']);
    for (const [agent, expected] of [
      [first, 'live'],
      [replacement, 'replacement'],
      [undefined, 'preset'],
    ] as const) {
      changed.mockClear();
      vi.mocked(global.list).mockClear();
      vi.mocked(scoped.list).mockClear();
      selected = agent;
      refresh.reconcile();
      refresh.reconcile();
      expect(changed.mock.calls).toEqual([[['ada']]]);
      expect((await catalog.list(['ada'])).map((entry) => entry.name)).toEqual([expected, 'host']);
      expect((await catalog.list(['bob'])).map((entry) => entry.name)).toEqual(['preset', 'host']);
      const calls = [...vi.mocked(global.list).mock.calls, ...vi.mocked(scoped.list).mock.calls];
      expect(calls.map(([options]) => options?.cwd).sort()).toEqual([root, undefined].sort());
    }
  });

  it('detects pathless runtime Host Skill content changes without broadening Project notifications', async () => {
    const f = fixture();
    delete f.host[0]!.path;
    await f.catalog.list(['ada']);
    f.changed.mockClear();
    await f.refresh.hostChanged();
    expect(f.changed).not.toHaveBeenCalled();
    f.host[0]!.content = 'new runtime instructions';
    await f.refresh.hostChanged();
    expect(f.changed).toHaveBeenCalledWith(['ada', 'bob']);
  });

  it('rewatches moved Memory and releases removed bots and Host disposal', async () => {
    const f = fixture();
    const from = f.roots.get('ada')!;
    put(from, 'qa', 'before');
    await f.catalog.list(['ada']);
    const moved = join(createTempRoot(), 'moved');
    renameSync(from, moved);
    f.roots.set('ada', moved);
    f.refresh.reconcile();
    await mutate(f, () => put(moved, 'qa', 'after'));
    expect((await f.catalog.list(['ada']))[0]?.description).toBe('after');
    f.roots.delete('ada');
    f.refresh.reconcile();
    expect(f.diagnostic).toHaveBeenCalledWith('unwatch', { botSlug: 'ada' });
    expect(await f.catalog.list(['ada'])).toEqual([]);
    f.refresh.close();
    f.changed.mockClear();
    put(moved, 'qa', 'removed');
    put(f.roots.get('bob')!, 'qa', 'closed');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(f.changed).not.toHaveBeenCalled();
    expect(f.diagnostic).toHaveBeenCalledWith('closed', { count: 1 });
  });

  it('keeps skills-list and the menu RPC fresh after filesystem mutations', async () => {
    const f = fixture();
    const core = createCore({ dshHome: createTempRoot() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...core, skills: f.catalog });
      const rpc = async (method: string, payload: Record<string, unknown>) => {
        expect(method).toBe('channelSkillCatalog');
        const result = await methods.channelSkillCatalog(payload);
        if (!result.ok) throw new Error(result.error.message);
        return result.value;
      };
      const cli = () => runSkillCommand('skills-list', [], { bot: 'ada' }, async () => rpc);
      await cli();
      for (const body of ['added', 'modified', undefined]) {
        await mutate(f, () =>
          body === undefined
            ? rmSync(join(f.roots.get('ada')!, '.agents'), { recursive: true })
            : put(f.roots.get('ada')!, 'qa', body),
        );
        const result = await methods.channelSkillCatalog({ channelId: dm.id });
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error(result.error.message);
        expect(await cli()).toEqual({ channelId: dm.id, skills: result.value.skills });
        expect(
          result.value.skills
            .filter((skill) => skill.name === 'qa')
            .map((skill) => skill.description),
        ).toEqual(body === undefined ? [] : [body]);
      }
    } finally {
      core.externalMessaging.close();
      core.live.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('pushes the affected channels through existing SSE and typed roster carriers with access filtering', async () => {
    const store = createChannelStore({ rootDir: createTempRoot() });
    const ada = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const bob = store.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'bob', 'Bob')!;
    const group = store.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Shared',
      members: ['ada', 'bob'],
    });
    const hub = createChannelLiveHub(
      store,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (_human, channelId) => channelId !== bob.id,
    );
    stops.push(() => hub.close());
    const controller = new AbortController();
    const follow = hub
      .followRoster(humanContext('member'), controller.signal)
      [Symbol.asyncIterator]();
    await follow.next();
    const response = hub.open(
      humanContext('member'),
      new Request('http://localhost/api/botharness/stream?scope=roster'),
    );
    const reader = response.body!.getReader();
    await reader.read();
    const change = { botSlugs: ['ada', 'bob'], channelIds: [ada.id, bob.id, group.id] };
    hub.publishSkillCatalogChanged(change);
    const expected = { botSlugs: ['ada', 'bob'], channelIds: [ada.id, group.id] };
    expect((await follow.next()).value).toEqual({ type: 'skills', change: expected });
    const frame = new TextDecoder().decode((await reader.read()).value);
    expect(frame).toContain('event: skills/catalog-changed');
    expect(JSON.parse(frame.split('data: ')[1]!.trim())).toEqual(expected);
    controller.abort();
    await follow.return?.();
    await reader.cancel();
  });

  it('invalidates through the Host registration control while preserving original Agent visibility', async () => {
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
          const agent = {};
          const scope = createScope(injected, agent);
          let description = 'before';
          const list = vi.fn(async () => [
            {
              name: 'qa',
              description,
              source: 'custom',
              provider: 'test',
              invocation: { userInvocable: true, modelInvocable: true },
              rank: 1,
              locator: {},
            },
          ]);
          const scoped = hostSkillRegistry<
            SkillRegistryPort & {
              registerProvider(
                create: () => { name: string; list: typeof list; get(): Promise<undefined> },
              ): () => void;
            }
          >(scope.ctx)!;
          const global = hostSkillRegistry<
            SkillRegistryPort & {
              register(skill: {
                name: string;
                description: string;
                content: string;
                source: string;
              }): () => void;
            }
          >(injected)!;
          try {
            scoped.registerProvider(() => ({
              name: 'test',
              list,
              async get() {
                return undefined;
              },
            }));
            const changed = vi.fn();
            const off = onHostSkillsChange(injected, changed);
            global.register({
              name: 'host',
              description: 'host',
              content: 'host',
              source: 'runtime',
            });
            expect(changed).toHaveBeenCalledTimes(1);
            let invalidate = (): void => {};
            const stopInvalidation = installHostSkillInvalidation(injected, (next) => {
              invalidate = next;
              return () => {};
            });
            const before = await scoped.list({ scope: agent });
            description = 'after';
            expect(await scoped.list({ scope: agent })).toEqual(before);
            invalidate();
            expect(
              (await scoped.list({ scope: agent })).find((skill) => skill.name === 'qa')
                ?.description,
            ).toBe('after');
            expect((await global.list()).some((skill) => skill.name === 'qa')).toBe(false);
            stopInvalidation();
            changed.mockClear();
            invalidate();
            expect(changed).not.toHaveBeenCalled();
            off();
          } finally {
            await scope.dispose();
          }
        })
        .await();
    } finally {
      await ctx.fiber.dispose();
    }
  });
});
