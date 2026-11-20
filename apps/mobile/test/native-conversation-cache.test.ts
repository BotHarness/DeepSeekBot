import { beforeEach, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => new Map<string, string>());

vi.mock('expo-file-system', () => {
  class Directory {
    get exists() {
      return true;
    }
    create() {}
  }
  class File {
    constructor(
      readonly parent: unknown,
      readonly name: string,
    ) {}
    get exists() {
      return disk.has(this.name);
    }
    async text() {
      return disk.get(this.name)!;
    }
    writeSync(text: string) {
      disk.set(this.name, text);
    }
  }
  return { Directory, File, Paths: { cache: 'cache' } };
});

const { nativeConversationCache } = await import('../src/host/native-cache');

beforeEach(() => disk.clear());

it('keeps the change cursor across an app restart', async () => {
  const key = JSON.stringify(['computer', 'mac-1', 'writer']);
  nativeConversationCache.write(key, {
    entries: [],
    hasOlder: false,
    changes: { epoch: 'e1', seq: 42 },
  });
  expect(await nativeConversationCache.read(key)).toEqual({
    entries: [],
    hasOlder: false,
    changes: { epoch: 'e1', seq: 42 },
  });
});

it('drops a malformed change cursor but keeps the tail', async () => {
  const key = JSON.stringify(['computer', 'mac-1', 'writer']);
  disk.set(
    `${encodeURIComponent(key)}.json`,
    JSON.stringify({ entries: [], hasOlder: true, changes: { epoch: 1, seq: '2' } }),
  );
  expect(await nativeConversationCache.read(key)).toEqual({ entries: [], hasOlder: true });
});
