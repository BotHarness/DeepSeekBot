import { beforeEach, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => new Map<string, Uint8Array>());
const network = vi.hoisted(() => ({ downloads: 0, share: vi.fn() }));

vi.mock('expo-sharing', () => ({ shareAsync: network.share }));
vi.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : (part as { path: string }).path))
      .join('/');
  class Directory {
    readonly path: string;
    constructor(...parts: unknown[]) {
      this.path = join(parts);
    }
    get exists() {
      return true;
    }
    create() {}
    list() {
      return [...disk.keys()]
        .filter((key) => key.startsWith(`${this.path}/`))
        .map((key) => new File(key));
    }
  }
  class File {
    readonly path: string;
    constructor(...parts: unknown[]) {
      this.path = join(parts).replace(/^file:\/\//u, '');
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
      return disk.get(this.path)?.length ?? 0;
    }
    async write(bytes: Uint8Array) {
      disk.set(this.path, bytes);
    }
    async move(target: File) {
      disk.set(target.path, disk.get(this.path)!);
      disk.delete(this.path);
    }
    delete() {
      disk.delete(this.path);
    }
    async copy(target: File) {
      disk.set(target.path, disk.get(this.path)!);
    }
    static async downloadFileAsync(_uri: string, target: File) {
      network.downloads += 1;
      disk.set(target.path, new Uint8Array([9, 9, 9]));
      return target;
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

const { installMediaStore } = await import('../src/host/media-cache');
const { nativeMediaStore } = await import('../src/host/native-media-store');
const { cachedAttachmentUri, shareAttachment } = await import('../src/host/share-attachment');
installMediaStore(nativeMediaStore);

const base = {
  key: 'computer:channel:message:0',
  kind: 'file' as const,
  name: 'clip.m4a',
  mime: 'audio/mp4',
  local: false,
};

beforeEach(() => {
  disk.clear();
  network.downloads = 0;
  network.share.mockReset();
});

it('downloads a versioned original once and reuses it for share, open and voice', async () => {
  const attachment = {
    ...base,
    source: { uri: 'https://host/a?v=v1', headers: {}, cacheKey: 'file:a:v1' },
  };
  const first = await cachedAttachmentUri(attachment);
  await shareAttachment(attachment);
  const again = await cachedAttachmentUri({ ...attachment, key: 'other-message:0' });
  expect(again).toBe(first);
  expect(network.downloads).toBe(1);
  expect(network.share).toHaveBeenCalledWith(first, expect.anything());
});

it('downloads again after an edit gives the file a new version', async () => {
  const source = { uri: 'https://host/a?v=v1', headers: {}, cacheKey: 'file:a:v1' };
  await cachedAttachmentUri({ ...base, source });
  await cachedAttachmentUri({
    ...base,
    source: { ...source, uri: 'https://host/a?v=v2', cacheKey: 'file:a:v2' },
  });
  expect(network.downloads).toBe(2);
});

it('copies a carrier download from the media cache without reading it twice', async () => {
  const read = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]), mime: 'audio/mp4' }));
  const attachment = {
    ...base,
    source: { uri: 'private-resource', headers: {}, cacheKey: 'file:b:v1', read },
  };
  const shared = await cachedAttachmentUri(attachment);
  await cachedAttachmentUri({ ...attachment, key: 'elsewhere:0' });
  expect(read).toHaveBeenCalledTimes(1);
  expect(disk.get(shared.replace('file://', ''))).toEqual(new Uint8Array([1, 2, 3]));
});

it('keeps downloading unversioned files each time unless asked to reuse', async () => {
  const attachment = { ...base, source: { uri: 'https://host/a', headers: {} } };
  await cachedAttachmentUri(attachment);
  await cachedAttachmentUri(attachment);
  expect(network.downloads).toBe(2);
  await cachedAttachmentUri(attachment, { reuse: true });
  expect(network.downloads).toBe(2);
});
