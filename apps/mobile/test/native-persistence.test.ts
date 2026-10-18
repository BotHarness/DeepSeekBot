import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fail: false,
  wait: undefined as Promise<void> | undefined,
}));
vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    delete() {
      disk.files.delete(this.uri);
    }
    get exists() {
      return disk.files.has(this.uri);
    }
    create() {
      if (disk.fail) throw new Error('disk unavailable');
      disk.files.set(this.uri, '');
    }
    async text() {
      const value = disk.files.get(this.uri);
      await disk.wait;
      return value;
    }
    writeSync(value: string) {
      if (disk.fail) throw new Error('disk unavailable');
      disk.files.set(this.uri, value);
    }
    async write(value: string) {
      await Promise.resolve();
      this.writeSync(value);
    }
  }
  class Directory extends File {
    override create() {}
    override get exists() {
      return [...disk.files.keys()].some((key) => key.startsWith(`${this.uri}/`));
    }
    list() {
      return [...disk.files.keys()]
        .filter((key) => key.startsWith(`${this.uri}/`))
        .map((key) => new File(key));
    }
  }
  return { File, Directory, Paths: { document: 'documents', cache: 'cache' } };
});
vi.mock('expo-image-picker', () => ({}));

beforeEach(() => {
  disk.files.clear();
  disk.fail = false;
  disk.wait = undefined;
  vi.resetModules();
});
afterEach(() => vi.resetModules());

const snapshot = (path: string) => JSON.parse(disk.files.get(path) ?? 'null');

async function preferences() {
  const { hostLooks } = await import('../src/host/native-host-look');
  const { sectionCollapse } = await import('../src/host/native-section-collapse');
  const { dmActivityPreferences } = await import('../src/host/native-dm-activity');
  await dmActivityPreferences.ready;
  return { hostLooks, sectionCollapse, dmActivityPreferences };
}

describe('native persistence across SDK upgrades', () => {
  it('does not hydrate a pre-revocation read after the same identity is authorized again', async () => {
    const { retainedCache } = await import('../src/host/native-cache');
    const source = { hostId: 'stale', deviceId: 'device' };
    const target = { kind: 'channel' as const, id: 'chat', name: 'Chat' };
    const cache = retainedCache.conversation(source, () => target);
    cache.write('', { entries: [], hasOlder: false });
    let release!: () => void;
    disk.wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const pending = cache.read('');
    retainedCache.forget(source);
    retainedCache.authorize(source);
    release();
    expect(await pending).toBeUndefined();
    retainedCache.conversation(source, () => target).write('', { entries: [], hasOlder: true });
    expect(await cache.read('')).toBeUndefined();
    disk.wait = undefined;
  });
  it('catalogues by paired identity, restores after restart and fences writes after refusal', async () => {
    const a = { hostId: 'a', deviceId: 'first' };
    const b = { hostId: 'b', deviceId: 'second' };
    const target = { kind: 'channel' as const, id: 'same', name: 'Project' };
    const { retainedCache } = await import('../src/host/native-cache');
    const old = retainedCache.conversation(a, () => target);
    old.write('ignored', { entries: [], hasOlder: false });
    retainedCache.conversation(b, () => target).write('ignored', { entries: [], hasOlder: true });
    expect(await retainedCache.list({ ...a, deviceId: 'repaired' })).toEqual([]);
    expect(await retainedCache.list(a)).toHaveLength(1);
    vi.resetModules();
    const restarted = (await import('../src/host/native-cache')).retainedCache;
    expect((await restarted.list(a))[0]?.target.name).toBe('Project');
    const pending = restarted.conversation(a, () => target);
    restarted.forget(a);
    restarted.authorize(a);
    pending.write('ignored', { entries: [], hasOlder: true });
    expect(await restarted.list(a)).toEqual([]);
    expect(await restarted.list(b)).toHaveLength(1);
  });
  it('saves message display synchronously, restores it and contains write failures', async () => {
    const path = 'documents/deepseekbot-message-display.json';
    const { messageDisplayPreferences: first } = await import('../src/host/native-message-display');
    await first.ready;
    first.setMode('complete');
    expect(snapshot(path)).toBe('complete');
    vi.resetModules();
    const { messageDisplayPreferences: restarted } =
      await import('../src/host/native-message-display');
    await restarted.ready;
    expect(restarted.getSnapshot().mode).toBe('complete');
    disk.fail = true;
    expect(() => restarted.setMode('streaming')).not.toThrow();
    expect(restarted.getSnapshot().storageError).toBe(true);
    expect(snapshot(path)).toBe('complete');
  });

  it('preserves existing settings, commits changes synchronously and restores per-Host values', async () => {
    disk.files.set(
      'documents/deepseekbot-host-looks.json',
      JSON.stringify({ a: { name: 'Studio' } }),
    );
    disk.files.set('documents/deepseekbot-sections.json', JSON.stringify({ a: ['work'] }));
    disk.files.set(
      'documents/deepseekbot-dm-activity.json',
      JSON.stringify({ a: { ada: ['posts'] } }),
    );
    const first = await preferences();
    expect(first.hostLooks.look('a').name).toBe('Studio');
    expect([...first.sectionCollapse.collapsed('a')]).toEqual(['work']);
    expect(first.dmActivityPreferences.hidden('a', 'ada')).toEqual(['posts']);
    first.hostLooks.set('b', { ...first.hostLooks.look('b'), name: 'Laptop' });
    first.sectionCollapse.toggle('b', 'personal');
    first.dmActivityPreferences.setHidden('b', 'ada', 'memory', true);
    expect(snapshot('documents/deepseekbot-host-looks.json').b.name).toBe('Laptop');
    expect(snapshot('documents/deepseekbot-sections.json')).toEqual({
      a: ['work'],
      b: ['personal'],
    });
    expect(snapshot('documents/deepseekbot-dm-activity.json')).toEqual({
      a: { ada: ['posts'] },
      b: { ada: ['memory'] },
    });
    vi.resetModules();
    const restarted = await preferences();
    expect(restarted.hostLooks.look('a').name).toBe('Studio');
    expect(restarted.hostLooks.look('b').name).toBe('Laptop');
    expect([...restarted.sectionCollapse.collapsed('b')]).toEqual(['personal']);
    expect(restarted.dmActivityPreferences.hidden('b', 'ada')).toEqual(['memory']);
  });

  it('contains write failures and retains the last saved values', async () => {
    const first = await preferences();
    const { retainedCache } = await import('../src/host/native-cache');
    const cache = retainedCache.conversation({ hostId: 'a', deviceId: 'phone' }, () => ({
      kind: 'channel',
      id: 'one',
      name: 'One',
    }));
    first.hostLooks.set('a', { ...first.hostLooks.look('a'), name: 'Saved' });
    first.sectionCollapse.toggle('a', 'work');
    first.dmActivityPreferences.setHidden('a', 'ada', 'posts', true);
    cache.write('a', { entries: [], hasOlder: true });
    const saved = new Map(disk.files);
    disk.fail = true;
    expect(() =>
      first.hostLooks.set('a', { ...first.hostLooks.look('a'), name: 'Unsaved' }),
    ).not.toThrow();
    expect(() => first.sectionCollapse.toggle('a', 'work')).not.toThrow();
    expect(() => first.dmActivityPreferences.setHidden('a', 'ada', 'posts', false)).not.toThrow();
    expect(() => cache.write('a', { entries: [], hasOlder: false })).not.toThrow();
    expect(disk.files).toEqual(saved);
    disk.fail = false;
    vi.resetModules();
    const restarted = await preferences();
    expect(restarted.hostLooks.look('a').name).toBe('Saved');
    expect([...restarted.sectionCollapse.collapsed('a')]).toEqual(['work']);
    expect(restarted.dmActivityPreferences.hidden('a', 'ada')).toEqual(['posts']);
  });
});

it('invalidates all adapters and late reads for one target without invalidating another', async () => {
  const { retainedCache } = await import('../src/host/native-cache');
  const source = { hostId: 'a', deviceId: 'phone' };
  const target = { kind: 'channel' as const, id: 'one', name: 'One' };
  const live = retainedCache.conversation(source, () => target);
  const retained = retainedCache.conversation(source, () => target);
  const other = retainedCache.conversation(source, () => ({ ...target, id: 'two' }));
  const invalidated = vi.fn();
  const otherInvalidated = vi.fn();
  const off = retained.onInvalidated!(invalidated);
  const offOther = other.onInvalidated!(otherInvalidated);
  live.write('', { entries: [], hasOlder: false });
  let release!: () => void;
  disk.wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const pending = retained.read('');
  live.remove!();
  release();
  expect(await pending).toBeUndefined();
  expect(invalidated).toHaveBeenCalledOnce();
  expect(otherInvalidated).not.toHaveBeenCalled();
  retained.write('', { entries: [], hasOlder: true });
  expect(await retainedCache.list(source)).toEqual([]);
  retainedCache.conversation(source, () => target).write('', { entries: [], hasOlder: true });
  expect(await retained.read('')).toBeUndefined();
  expect(await retainedCache.list(source)).toHaveLength(1);
  off();
  offOther();
});
