import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = new Map<string, Uint8Array>();

vi.mock('expo-file-system', () => {
  class Directory {
    constructor(
      readonly parent: unknown,
      readonly name: string,
    ) {}
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...disk.keys()].map((name) => new File(this, name));
    }
  }
  class File {
    constructor(
      readonly parent: unknown,
      readonly name: string,
    ) {}
    get exists() {
      return disk.has(this.name);
    }
    get uri() {
      return `file:///cache/${this.name}`;
    }
    async write(bytes: Uint8Array) {
      disk.set(this.name, bytes);
    }
    async move(target: File) {
      disk.set(target.name, disk.get(this.name)!);
      disk.delete(this.name);
    }
    delete() {
      disk.delete(this.name);
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

const { cachedMediaUri, cacheMedia, forgetMedia, installMediaStore } =
  await import('../src/host/media-cache');
const { nativeMediaStore } = await import('../src/host/native-media-store');
installMediaStore(nativeMediaStore);
const { attachmentsOf } = await import('../src/host/conversation');

const source = (
  cacheKey: string,
  read = vi.fn(async () => ({ bytes: new Uint8Array([1]), mime: 'image/webp' })),
) => ({
  uri: `https://host/a?${cacheKey}`,
  headers: {},
  cacheKey,
  read,
});

beforeEach(() => disk.clear());

describe('versioned media cache on the phone', () => {
  it('downloads a version once and then serves it from disk', async () => {
    const first = source('file:a:v1:320');
    const uri = await cacheMedia(first, new AbortController().signal);
    expect(uri).toBe(`file:///cache/${encodeURIComponent('file:a:v1:320')}`);
    expect(cachedMediaUri('file:a:v1:320')).toBe(uri);
    const again = source('file:a:v1:320');
    expect(await cacheMedia(again, new AbortController().signal)).toBe(uri);
    expect(first.read).toHaveBeenCalledTimes(1);
    expect(again.read).not.toHaveBeenCalled();
  });

  it('shares one download between concurrent requests and runs at most three at once', async () => {
    let running = 0;
    let peak = 0;
    const read = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return { bytes: new Uint8Array([2]), mime: 'image/webp' };
    });
    const signal = new AbortController().signal;
    await Promise.all([
      cacheMedia(source('same', read), signal),
      cacheMedia(source('same', read), signal),
      ...Array.from({ length: 6 }, (_, index) =>
        cacheMedia(source(`other-${index}`, read), signal),
      ),
    ]);
    expect(read).toHaveBeenCalledTimes(7);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('forgets every cached variant of a file', async () => {
    const signal = new AbortController().signal;
    await cacheMedia(source('file:a:v1'), signal);
    await cacheMedia(source('file:a:v1:320'), signal);
    await cacheMedia(source('file:b:v1:320'), signal);
    forgetMedia('file:a:');
    expect(cachedMediaUri('file:a:v1')).toBeUndefined();
    expect(cachedMediaUri('file:a:v1:320')).toBeUndefined();
    expect(cachedMediaUri('file:b:v1:320')).toBeDefined();
  });
});

describe('attachment sources', () => {
  const resolve = (path: string) => ({ uri: `https://host${path}`, headers: {} });
  const entry = (ref: Record<string, unknown>) =>
    ({
      channelId: 'c1',
      revision: 1,
      message: {
        id: 'm1',
        at: '2026-11-04T00:00:00Z',
        author: { kind: 'bot', slug: 'ada' },
        body: '',
        attachments: [ref],
      },
    }) as never;

  it('requests a versioned thumbnail and original, keyed by version on every route', () => {
    const [attachment] = attachmentsOf(
      entry({
        fileId: 'file:x',
        name: 'p.png',
        mime: 'image/png',
        size: 10,
        version: 'v9',
        width: 1200,
        height: 800,
        thumbhash: 'abc',
      }),
      resolve,
    );
    expect(attachment).toMatchObject({ thumbhash: 'abc', width: 1200, height: 800 });
    expect(attachment!.thumbnail).toMatchObject({ cacheKey: 'file:x:v9:320' });
    expect(attachment!.thumbnail!.uri).toContain('variant=320');
    expect(attachment!.thumbnail!.uri).toContain('v=v9');
    expect(attachment!.preview).toMatchObject({ cacheKey: 'file:x:v9:800' });
    expect(attachment!.preview!.uri).toContain('variant=800');
    expect(attachment!.source).toMatchObject({ cacheKey: 'file:x:v9' });
    expect(attachment!.source!.uri).not.toContain('variant=');
  });

  it('keeps the unversioned original for a Host that sends no version', () => {
    const [attachment] = attachmentsOf(
      entry({ fileId: 'file:x', name: 'p.png', mime: 'image/png', size: 10 }),
      resolve,
    );
    expect(attachment!.thumbnail).toBeUndefined();
    expect(attachment!.preview).toBeUndefined();
    expect(attachment!.source!.cacheKey).toBeUndefined();
    expect(attachment!.source!.uri).not.toContain('v=');
  });
});
