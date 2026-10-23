import { beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';

const state = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  pick: vi.fn(),
  reads: [] as number[],
  copies: [] as string[],
}));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: state.pick }));
vi.mock('expo-crypto', () => ({ randomUUID: () => '12345678-1234-1234-1234-123456789abc' }));
vi.mock('expo-file-system', () => {
  class Directory {
    uri: string;
    constructor(...parts: (string | Directory)[]) {
      this.uri = parts.map((part) => (typeof part === 'string' ? part : part.uri)).join('/');
    }
    create() {}
    get exists() {
      return [...state.files.keys()].some((path) => path.startsWith(`${this.uri}/`));
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    list() {
      return [...state.files.keys()]
        .filter((path) => path.startsWith(`${this.uri}/`))
        .map((path) => new File(path));
    }
  }
  class File extends Directory {
    get exists() {
      return state.files.has(this.uri);
    }
    get size() {
      return state.files.get(this.uri)?.length ?? 0;
    }
    async copy(target: File) {
      await Promise.resolve();
      state.files.set(target.uri, state.files.get(this.uri)!.slice());
      state.copies.push(target.uri);
    }
    delete() {
      state.files.delete(this.uri);
    }
    open() {
      const data = state.files.get(this.uri)!;
      return {
        offset: 0,
        size: data.length,
        async readBytes(length: number) {
          state.reads.push(length);
          const chunk = data.slice(this.offset, this.offset + length);
          this.offset += chunk.length;
          return chunk;
        },
        close() {},
      };
    }
  }
  return { Directory, File, FileMode: { ReadOnly: 1 }, Paths: { document: 'documents' } };
});
import { nativeZipFiles, pruneZipFiles } from '../src/host/native-zip-import-file';

beforeEach(() => {
  state.files.clear();
  state.reads.length = 0;
  state.copies.length = 0;
  state.pick.mockReset();
});

it('copies the picked archive to persistent documents before hashing and can reopen it', async () => {
  const bytes = new Uint8Array(300000).fill(7);
  state.files.set('cache/picked.zip', bytes);
  state.pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'cache/picked.zip', name: 'Example.zip' }],
  });
  const picked = await nativeZipFiles.pick();
  expect(picked).toMatchObject({
    fileName: 'Example.zip',
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
  expect(state.copies[0]).toMatch(/^documents\/bot-imports\//u);
  expect(Math.max(...state.reads)).toBe(262144);
  state.files.delete('cache/picked.zip');
  const reader = await nativeZipFiles.open(picked!);
  expect(await reader.read(299990, 10)).toEqual(bytes.slice(299990));
  reader.close();
});

it('leaves the existing retained file alone when the picker is cancelled', async () => {
  state.files.set('documents/bot-imports/saved.zip', new Uint8Array(30));
  state.pick.mockResolvedValue({ canceled: true, assets: null });
  expect(await nativeZipFiles.pick()).toBeNull();
  expect(state.files.size).toBe(1);
  expect(state.copies).toEqual([]);
});

it('reports a missing retained file without picking a replacement', async () => {
  await expect(
    nativeZipFiles.open({
      fileId: '12345678-1234-1234-1234-123456789abc',
      fileName: 'Bot.zip',
      sha256: 'a'.repeat(64),
      sizeBytes: 30,
    }),
  ).rejects.toMatchObject({ code: 'zip-file-missing' });
  expect(state.pick).not.toHaveBeenCalled();
});

it('keeps an active selection during an older record write and prunes only after its durable reference is removed', async () => {
  state.files.set('cache/picked.zip', new Uint8Array(30));
  state.pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'cache/picked.zip', name: 'Bot.zip' }],
  });
  const picked = (await nativeZipFiles.pick())!;
  const path = `documents/bot-imports/${picked.fileId}.zip`;
  pruneZipFiles([]);
  expect(state.files.has(path)).toBe(true);
  pruneZipFiles([picked.fileId]);
  nativeZipFiles.discard?.(picked);
  expect(state.files.has(path)).toBe(true);
  pruneZipFiles([]);
  expect(state.files.has(path)).toBe(false);
});

it('discards only an unclaimed picked file when persistence or original-file matching fails', async () => {
  state.files.set('cache/picked.zip', new Uint8Array(30));
  state.pick.mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'cache/picked.zip', name: 'Bot.zip' }],
  });
  const picked = (await nativeZipFiles.pick())!;
  nativeZipFiles.discard?.(picked);
  await expect(nativeZipFiles.open(picked)).rejects.toMatchObject({ code: 'zip-file-missing' });
});
