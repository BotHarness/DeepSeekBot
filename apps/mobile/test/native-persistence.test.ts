import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({ files: new Map<string, string>(), fail: false }));
vi.mock('expo-file-system', () => {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    get exists() {
      return disk.files.has(this.uri);
    }
    create() {
      if (disk.fail) throw new Error('disk unavailable');
      disk.files.set(this.uri, '');
    }
    async text() {
      return disk.files.get(this.uri);
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
  }
  return { File, Directory, Paths: { document: 'documents', cache: 'cache' } };
});
vi.mock('expo-image-picker', () => ({}));

beforeEach(() => {
  disk.files.clear();
  disk.fail = false;
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

  it('commits cached conversations before returning and reads them after restart', async () => {
    const { nativeConversationCache: cache } = await import('../src/host/native-cache');
    cache.write('host-a/channel', { entries: [], hasOlder: true });
    cache.write('host-b/channel', { entries: [], hasOlder: false });
    expect(snapshot('cache/deepseekbot-conversations/host-a%2Fchannel.json')).toEqual({
      entries: [],
      hasOlder: true,
    });
    vi.resetModules();
    const { nativeConversationCache: restarted } = await import('../src/host/native-cache');
    expect(await restarted.read('host-a/channel')).toEqual({ entries: [], hasOlder: true });
    expect(await restarted.read('host-b/channel')).toEqual({ entries: [], hasOlder: false });
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
    const { nativeConversationCache: cache } = await import('../src/host/native-cache');
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
