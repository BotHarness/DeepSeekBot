import { mkdirSync, watch } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SkillCatalog } from '../src/skills/catalog.js';
import { watchSkillCatalog } from '../src/skills/refresh.js';
import { createTempRoot } from './helpers.js';

vi.mock('node:fs', async (original) => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, watch: vi.fn(fs.watch) };
});

const stops: (() => void)[] = [];
afterEach(() => {
  for (const stop of stops.splice(0)) stop();
  vi.useRealTimers();
  vi.mocked(watch).mockClear();
});

function fixture() {
  vi.useFakeTimers();
  const root = createTempRoot();
  const bots = new Map([['ada', { slug: 'ada', memoryDir: root }]]);
  let name = 'before';
  const catalog = new SkillCatalog({ memoryDirFor: (slug) => bots.get(slug)?.memoryDir });
  catalog.attach({
    async list(options) {
      return options?.cwd === undefined
        ? []
        : [
            {
              name,
              description: name,
              path: join(root, '.agents/skills', name, 'SKILL.md'),
              source: 'project-agents',
              invocation: { userInvocable: true },
            },
          ];
    },
    async get() {
      return undefined;
    },
  });
  const changed = vi.fn();
  const diagnostic = vi.fn();
  const refresh = watchSkillCatalog({
    catalog,
    bots: () => [...bots.values()],
    changed,
    diagnostic,
  });
  stops.push(() => refresh.close());
  changed.mockClear();
  const watcher = () => {
    const result = vi.mocked(watch).mock.results.at(-1);
    if (result?.type !== 'return') throw new Error('Watcher unavailable');
    return result.value;
  };
  return {
    bots,
    catalog,
    changed,
    diagnostic,
    refresh,
    watcher,
    rename: (value: string) => {
      name = value;
    },
  };
}

describe('Skill watcher recovery', () => {
  it('reattaches after a watcher error and refreshes subsequent edits', async () => {
    const f = fixture();
    expect((await f.catalog.list(['ada']))[0]?.name).toBe('before');
    f.watcher().emit('error', new Error('temporary watcher failure'));
    await vi.advanceTimersByTimeAsync(100);
    expect(watch).toHaveBeenCalledTimes(2);
    f.rename('after');
    f.changed.mockClear();
    f.watcher().emit('change', 'rename', '.agents');
    await vi.advanceTimersByTimeAsync(25);
    expect(f.changed).toHaveBeenCalledExactlyOnceWith(['ada']);
    expect((await f.catalog.list(['ada']))[0]?.name).toBe('after');
    await vi.advanceTimersByTimeAsync(10000);
    expect(watch).toHaveBeenCalledTimes(2);
  });

  it('backs off and stops retrying after three failed recovery attempts', async () => {
    const f = fixture();
    for (const delay of [100, 200, 400]) {
      f.watcher().emit('error', new Error('unavailable'));
      const calls = vi.mocked(watch).mock.calls.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(watch).toHaveBeenCalledTimes(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(watch).toHaveBeenCalledTimes(calls + 1);
    }
    f.watcher().emit('error', new Error('still unavailable'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(watch).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
    expect((await f.catalog.list(['ada']))[0]?.name).toBe('before');
    f.rename('after-exhaustion');
    f.refresh.reconcile();
    expect(watch).toHaveBeenCalledTimes(5);
    expect((await f.catalog.list(['ada']))[0]?.name).toBe('after-exhaustion');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('retries a failed watcher creation and invalidates edits made during the outage', async () => {
    vi.mocked(watch).mockImplementationOnce(() => {
      throw new Error('temporarily unavailable');
    });
    const f = fixture();
    expect((await f.catalog.list(['ada']))[0]?.name).toBe('before');
    f.rename('during-outage');
    await vi.advanceTimersByTimeAsync(100);
    expect(watch).toHaveBeenCalledTimes(2);
    expect((await f.catalog.list(['ada']))[0]?.name).toBe('during-outage');
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(['remove', 'move', 'close'] as const)('cancels a retry on %s', async (action) => {
    const f = fixture();
    f.watcher().emit('error', new Error('temporary failure'));
    if (action === 'close') f.refresh.close();
    else {
      if (action === 'remove') f.bots.delete('ada');
      else f.bots.set('ada', { slug: 'ada', memoryDir: createTempRoot() });
      f.refresh.reconcile();
    }
    const calls = vi.mocked(watch).mock.calls.length;
    f.changed.mockClear();
    await vi.advanceTimersByTimeAsync(60000);
    expect(watch).toHaveBeenCalledTimes(calls);
    expect(f.changed).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Workspace Skill watcher recovery', () => {
  function workspaceFixture() {
    vi.useFakeTimers();
    const memory = createTempRoot();
    const project = createTempRoot();
    let granted = true;
    const invalidateWorkspace = vi.fn();
    const catalog = {
      workspaces: () =>
        granted ? [{ workspaceId: 'grant-1', name: 'Shop', path: project, botSlugs: ['ada'] }] : [],
      invalidateWorkspace,
      invalidateMemory: vi.fn(),
      invalidateBot: vi.fn(),
      refreshHost: async () => false,
    } as unknown as SkillCatalog;
    const changed = vi.fn();
    const refresh = watchSkillCatalog({
      catalog,
      bots: () => [{ slug: 'ada', memoryDir: memory }],
      changed,
      diagnostic: () => {},
    });
    stops.push(() => refresh.close());
    const projectWatches = () =>
      vi.mocked(watch).mock.calls.filter(([path]) => path === project).length;
    const projectWatcher = () => {
      const index = vi.mocked(watch).mock.calls.findLastIndex(([path]) => path === project);
      const result = vi.mocked(watch).mock.results[index];
      if (result?.type !== 'return') throw new Error('Workspace watcher unavailable');
      return result.value;
    };
    return {
      refresh,
      changed,
      invalidateWorkspace,
      projectWatches,
      projectWatcher,
      revoke: () => {
        granted = false;
      },
    };
  }

  it('retries a failed Workspace watcher with backoff and resets the budget on explicit reconcile', async () => {
    const f = workspaceFixture();
    expect(f.projectWatches()).toBe(1);
    for (const delay of [100, 200, 400]) {
      f.projectWatcher().emit('error', new Error('unavailable'));
      const calls = f.projectWatches();
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(f.projectWatches()).toBe(calls);
      await vi.advanceTimersByTimeAsync(1);
      expect(f.projectWatches()).toBe(calls + 1);
    }
    f.projectWatcher().emit('error', new Error('still unavailable'));
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.projectWatches()).toBe(4);
    expect(vi.getTimerCount()).toBe(0);
    f.invalidateWorkspace.mockClear();
    f.refresh.reconcile();
    expect(f.projectWatches()).toBe(5);
    expect(f.invalidateWorkspace).toHaveBeenCalledWith('grant-1');
    f.projectWatcher().emit('error', new Error('again'));
    await vi.advanceTimersByTimeAsync(100);
    expect(f.projectWatches()).toBe(6);
  });

  it.each(['revoke', 'close'] as const)('cancels a Workspace retry on %s', async (action) => {
    const f = workspaceFixture();
    f.projectWatcher().emit('error', new Error('temporary failure'));
    if (action === 'close') f.refresh.close();
    else {
      f.revoke();
      f.refresh.reconcile();
    }
    const calls = f.projectWatches();
    await vi.advanceTimersByTimeAsync(60000);
    expect(f.projectWatches()).toBe(calls);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Skill watcher edge recovery', () => {
  function hostFixture(memoryDir: string) {
    vi.useFakeTimers();
    const bots = new Map<string, { slug: string; memoryDir: string; agent?: object }>([
      ['ada', { slug: 'ada', memoryDir }],
    ]);
    let host = 'host-before';
    const catalog = new SkillCatalog({ memoryDirFor: (slug) => bots.get(slug)?.memoryDir });
    catalog.attach({
      async list(options) {
        return options?.cwd === undefined
          ? [
              {
                name: host,
                description: host,
                path: `/host/${host}/SKILL.md`,
                source: 'user',
                invocation: { userInvocable: true },
              },
            ]
          : [];
      },
      async get() {
        return undefined;
      },
    });
    const changed = vi.fn();
    const diagnostic = vi.fn();
    const refresh = watchSkillCatalog({
      catalog,
      bots: () => [...bots.values()],
      changed,
      diagnostic,
    });
    stops.push(() => refresh.close());
    changed.mockClear();
    return {
      bots,
      catalog,
      changed,
      refresh,
      setHost: (value: string) => {
        host = value;
      },
    };
  }

  it('drops the previous Agent view, Host entries included, when the selected Agent changes', async () => {
    const f = hostFixture(createTempRoot());
    expect((await f.catalog.list(['ada'])).map((skill) => skill.name)).toEqual(['host-before']);
    f.setHost('host-other-agent');
    f.bots.set('ada', { ...f.bots.get('ada')!, agent: {} });
    f.refresh.reconcile();
    expect(f.changed).toHaveBeenCalledExactlyOnceWith(['ada']);
    expect((await f.catalog.list(['ada'])).map((skill) => skill.name)).toEqual([
      'host-other-agent',
    ]);
  });

  it('retries until a missing Memory Repository appears instead of watching nothing', async () => {
    const memoryDir = join(createTempRoot(), 'memory');
    hostFixture(memoryDir);
    expect(watch).not.toHaveBeenCalled();
    mkdirSync(memoryDir);
    await vi.advanceTimersByTimeAsync(100);
    expect(vi.mocked(watch).mock.calls.map(([path]) => path)).toContain(memoryDir);
  });

  it('invalidates Host entries and notifies Clients when a Host refresh fails', async () => {
    const f = hostFixture(createTempRoot());
    expect((await f.catalog.list(['ada'])).map((skill) => skill.name)).toEqual(['host-before']);
    f.setHost('host-after');
    vi.spyOn(f.catalog, 'refreshHost').mockRejectedValueOnce(new Error('registry busy'));
    await expect(f.refresh.hostChanged()).resolves.toBeUndefined();
    expect(f.changed).toHaveBeenCalledExactlyOnceWith(['ada']);
    expect((await f.catalog.list(['ada'])).map((skill) => skill.name)).toEqual(['host-after']);
  });
});
