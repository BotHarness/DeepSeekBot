import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => new Map<string, string | Uint8Array>());

vi.mock('expo-sharing', () => ({ shareAsync: vi.fn() }));
vi.mock('expo-file-system', () => {
  const pathOf = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : (part as { path: string }).path))
      .join('/')
      .replace(/^file:\/\//u, '');
  const children = (path: string) => {
    const names = new Map<string, boolean>();
    for (const key of disk.keys()) {
      if (!key.startsWith(`${path}/`)) continue;
      const rest = key.slice(path.length + 1).split('/');
      names.set(rest[0]!, rest.length > 1 || names.get(rest[0]!) === true);
    }
    return names;
  };
  class Directory {
    readonly path: string;
    constructor(...parts: unknown[]) {
      this.path = pathOf(parts);
    }
    get name() {
      return this.path.split('/').pop()!;
    }
    get exists() {
      return children(this.path).size > 0;
    }
    create() {}
    list() {
      return [...children(this.path)].map(([name, directory]) =>
        directory ? new Directory(this.path, name) : new File(this.path, name),
      );
    }
    delete() {
      for (const key of [...disk.keys()]) if (key.startsWith(`${this.path}/`)) disk.delete(key);
    }
  }
  class File {
    readonly path: string;
    constructor(...parts: unknown[]) {
      this.path = pathOf(parts);
    }
    get name() {
      return this.path.split('/').pop()!;
    }
    get uri() {
      return `file://${this.path}`;
    }
    get exists() {
      return disk.has(this.path);
    }
    get size() {
      return 1;
    }
    write(bytes: Uint8Array) {
      disk.set(this.path, bytes);
    }
    writeSync(text: string) {
      disk.set(this.path, text);
    }
    textSync() {
      return String(disk.get(this.path));
    }
    async text() {
      return String(disk.get(this.path));
    }
    delete() {
      disk.delete(this.path);
    }
    copy(target: File) {
      disk.set(target.path, disk.get(this.path)!);
    }
    static async downloadFileAsync(_uri: string, target: File) {
      disk.set(target.path, new Uint8Array([1]));
      return target;
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

const { installMediaStore, cacheMedia } = await import('../src/host/media-cache');
const { nativeMediaStore } = await import('../src/host/native-media-store');
const { cachedAttachmentUri } = await import('../src/host/share-attachment');
const { nativeConversationCache } = await import('../src/host/native-cache');
const { createPurgeCaches, purgedPlacements } = await import('../src/host/purge-caches');
const { nativePurgeTargets } = await import('../src/host/native-purge-targets');
const { mediaCacheKey } = await import('../src/host/conversation');
installMediaStore(nativeMediaStore);

const signal = new AbortController().signal;
const media = (hostId: string, fileId: string, variant?: string) =>
  mediaCacheKey(hostId, fileId, 'v1', variant);
const download = (cacheKey: string) =>
  cacheMedia({ uri: `https://host/${cacheKey}`, headers: {}, cacheKey }, signal);
const mediaKeys = () =>
  [...disk.keys()]
    .filter((key) => key.startsWith('cache/deepseekbot-media/'))
    .map((key) => decodeURIComponent(key.split('/').pop()!))
    .sort();
const shared = () => [...disk.keys()].filter((key) => key.startsWith('cache/attachments/')).length;
const tail = (hostId: string, channelId: string, ids: string[]) => {
  nativeConversationCache.write(JSON.stringify(['computer', hostId, `channel:${channelId}`]), {
    hasOlder: false,
    entries: ids.map((id, index) => ({
      channelId,
      revision: index + 1,
      message: {
        id,
        at: '2026-11-05T00:00:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: `secret ${id}`,
        attachments: [{ fileId: `file:${id}`, name: 'p.png', mime: 'image/png', size: 1 }],
      },
    })) as never,
  });
};
const read = async (hostId: string, channelId: string) =>
  (await nativeConversationCache.read(
    JSON.stringify(['computer', hostId, `channel:${channelId}`]),
  ))!.entries;
const placement = (messageId: string, fileIds: string[], channelId = 'c1') => ({
  sourceEventId: `src-${messageId}`,
  channelId,
  messageId,
  fileIds,
});

beforeEach(() => disk.clear());

describe('purges reach the phone’s caches', () => {
  it('removes a purged message from the tail cache, its media versions and shared copies on reconnect', async () => {
    const caches = createPurgeCaches(() => nativePurgeTargets);
    tail('mac-a', 'c1', ['m1', 'm2']);
    await download(media('mac-a', 'file:m1'));
    await download(media('mac-a', 'file:m1', '320'));
    await download(media('mac-a', 'file:m2'));
    await cachedAttachmentUri({
      key: 'k',
      kind: 'image',
      name: 'p.png',
      local: false,
      source: { uri: 'https://host/x', headers: {}, cacheKey: media('mac-a', 'file:m1') },
    });
    expect(shared()).toBe(1);

    const fresh = caches.apply('mac-a', [placement('m1', ['file:m1'])]);
    expect(fresh.map((item) => item.messageId)).toEqual(['m1']);
    expect(mediaKeys()).toEqual([media('mac-a', 'file:m2')]);
    expect(shared()).toBe(0);
    const entries = await read('mac-a', 'c1');
    expect(entries[0]!.message).toMatchObject({ id: 'm1', body: '', contentPurge: {} });
    expect(entries[0]!.message.attachments).toBeUndefined();
    expect(entries[1]!.message).toMatchObject({ id: 'm2', body: 'secret m2' });
  });

  it('applies each purge once even though every reconnect baseline repeats it', async () => {
    const forgetMedia = vi.fn();
    const caches = createPurgeCaches(() => ({
      forgetMedia,
      forgetShared: vi.fn(),
      redactTail: vi.fn(),
    }));
    caches.apply('mac-a', [placement('m1', ['file:m1'])]);
    expect(caches.apply('mac-a', [placement('m1', ['file:m1'])])).toEqual([]);
    caches.apply('mac-a', [placement('m1', ['file:m1']), placement('m2', [])]);
    expect(forgetMedia).toHaveBeenCalledTimes(2);
    expect(forgetMedia).toHaveBeenLastCalledWith([]);
  });

  it('never touches another paired Computer’s cache', async () => {
    const caches = createPurgeCaches(() => nativePurgeTargets);
    tail('mac-a', 'c1', ['m1']);
    tail('mac-b', 'c1', ['m1']);
    await download(media('mac-a', 'file:same'));
    await download(media('mac-b', 'file:same'));
    caches.apply('mac-a', [placement('m1', ['file:same'])]);
    expect(mediaKeys()).toEqual([media('mac-b', 'file:same')]);
    expect((await read('mac-b', 'c1'))[0]!.message.body).toBe('secret m1');
    expect((await read('mac-a', 'c1'))[0]!.message.body).toBe('');
  });

  it('wipes one Computer’s media and shared copies when it is unpaired or revokes the phone', async () => {
    const caches = createPurgeCaches(() => nativePurgeTargets);
    await download(media('mac-a', 'file:x'));
    await download(media('mac-b', 'file:y'));
    caches.forgetHost('mac-a');
    expect(mediaKeys()).toEqual([media('mac-b', 'file:y')]);
  });

  it('ignores malformed placements', () => {
    expect(
      purgedPlacements([null, 1, { sourceEventId: 's' }, { ...placement('m', ['file:a', 3]) }]),
    ).toEqual([placement('m', ['file:a'])]);
    expect(purgedPlacements('nope')).toEqual([]);
  });
});
