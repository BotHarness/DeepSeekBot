import { beforeEach, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => ({
  files: new Map<string, string>(),
  dirs: new Set<string>(),
  root: 'file:///container-a',
  writeFailure: 'none' as 'none' | 'partial' | 'after',
  copyFailure: false,
  readFailure: '',
  steps: [] as string[],
  source: { width: 900, height: 1600 },
}));
vi.mock('expo-file-system', () => {
  const join = (...parts: Array<string | { uri: string }>) =>
    parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = join(...parts);
    }
    get name() {
      return this.uri.split('/').at(-1)!;
    }
    get exists() {
      return disk.files.has(this.uri);
    }
    get size() {
      return disk.files.get(this.uri)?.length ?? 0;
    }
    create() {
      disk.files.set(this.uri, '');
    }
    writeSync(body: string) {
      disk.files.set(this.uri, disk.writeFailure === 'partial' ? body.slice(0, 12) : body);
      if (disk.writeFailure !== 'none') throw Error('injected write failure');
    }
    textSync() {
      return disk.files.get(this.uri)!;
    }
    async text() {
      if (this.uri === disk.readFailure) throw Error('injected read failure');
      return this.textSync();
    }
    async copy(target: File) {
      disk.files.set(target.uri, 'normalized JPEG');
      if (disk.copyFailure) throw Error('copy failed');
    }
    delete() {
      disk.files.delete(this.uri);
    }
  }
  class Directory {
    uri: string;
    constructor(...parts: Array<string | { uri: string }>) {
      this.uri = join(...parts);
    }
    get exists() {
      return disk.dirs.has(this.uri);
    }
    create() {
      disk.dirs.add(this.uri);
    }
    list() {
      return [...disk.files.keys()]
        .filter(
          (uri) => uri.startsWith(`${this.uri}/`) && !uri.slice(this.uri.length + 1).includes('/'),
        )
        .map((uri) => new File(uri));
    }
  }
  return {
    File,
    Directory,
    Paths: {
      get document() {
        return disk.root;
      },
    },
  };
});
vi.mock('expo-image-picker', () => ({}));
vi.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg' },
  ImageManipulator: {
    manipulate: () => ({
      resize(size: { width?: number; height?: number }) {
        disk.steps.push('resize');
        const scale = size.width
          ? size.width / disk.source.width
          : size.height! / disk.source.height;
        disk.source = {
          width: Math.round(disk.source.width * scale),
          height: Math.round(disk.source.height * scale),
        };
      },
      release() {},
      renderAsync: async () => {
        disk.steps.push('render');
        return {
          ...disk.source,
          release() {},
          saveAsync: async () => {
            disk.files.set('file:///cache/photo.jpg', 'photo');
            return { uri: 'file:///cache/photo.jpg', ...disk.source };
          },
        };
      },
    }),
  },
}));
import { createChatBackgrounds } from '../src/host/chat-background';
import { backgroundImageUri, nativeBackgroundPorts } from '../src/host/native-chat-background';

beforeEach(() => {
  disk.files.clear();
  disk.dirs.clear();
  disk.root = 'file:///container-a';
  disk.writeFailure = 'none';
  disk.copyFailure = false;
  disk.readFailure = '';
  disk.steps = [];
  disk.source = { width: 900, height: 1600 };
});

it('retains every owned image and refuses writes when one journal record cannot be read', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const first = owner.edit();
  await first.pick('first', disk.source);
  await first.save();
  const second = owner.edit({ hostId: 'host', channelId: 'chat' });
  await second.pick('second', disk.source);
  await second.save();
  const before = [...disk.files];
  disk.readFailure = `${disk.root}/chat-backgrounds/settings/record-2.json`;
  const restarted = createChatBackgrounds(nativeBackgroundPorts());
  await restarted.ready;
  expect(restarted.getSnapshot().storageError).toBe(true);
  const edit = restarted.edit();
  edit.choose({ kind: 'default' });
  await expect(edit.save()).rejects.toThrow('background-save-failed');
  await edit.cancel();
  expect([...disk.files]).toEqual(before);
  disk.readFailure = '';
  const recovered = createChatBackgrounds(nativeBackgroundPorts());
  await recovered.ready;
  expect(recovered.getSnapshot().storageError).toBe(false);
  expect(recovered.resolve({ hostId: 'host', channelId: 'chat' })).toEqual(
    owner.resolve({ hostId: 'host', channelId: 'chat' }),
  );
});

it('rejects oversized sources before decoding and schedules accepted resizing before the first render', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const edit = owner.edit();
  await expect(edit.pick('huge', { width: 8000, height: 6000 })).rejects.toThrow();
  expect(disk.steps).toEqual([]);
  expect([...disk.files]).toEqual([]);
  disk.source = { width: 4000, height: 3000 };
  await edit.pick('large', disk.source);
  expect(disk.steps).toEqual(['resize', 'render']);
  expect(edit.getSnapshot().choice).toMatchObject({ width: 2048, height: 1536 });
});

it('keeps the last complete native record across an interrupted write and a process restart', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const first = owner.edit();
  await first.pick('picker://photo', { width: 900, height: 1600 });
  await first.save();
  const old = owner.resolve();
  const next = owner.edit();
  next.choose({ kind: 'color', color: '#abcdef' });
  disk.writeFailure = 'partial';
  await expect(next.save()).rejects.toThrow();
  expect(owner.resolve()).toEqual(old);
  const restarted = createChatBackgrounds(nativeBackgroundPorts());
  await restarted.ready;
  expect(restarted.resolve()).toEqual(old);
  expect([...disk.files.keys()].filter((key) => key.includes('/images/'))).toHaveLength(1);
  disk.writeFailure = 'none';
  await next.save();
  expect(owner.resolve()).toEqual({ kind: 'color', color: '#abcdef' });
});

it('reconciles a completed write error and rebases owned image references after container relocation', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const edit = owner.edit();
  await edit.pick('picker://photo', { width: 900, height: 1600 });
  disk.writeFailure = 'after';
  await edit.save();
  const image = owner.resolve();
  expect(image.kind).toBe('image');
  if (image.kind !== 'image') throw Error('expected imported image');
  for (const [path, body] of [...disk.files]) {
    disk.files.delete(path);
    disk.files.set(path.replace('container-a', 'container-b'), body);
  }
  disk.dirs = new Set([...disk.dirs].map((path) => path.replace('container-a', 'container-b')));
  disk.root = 'file:///container-b';
  const restarted = createChatBackgrounds(nativeBackgroundPorts());
  await restarted.ready;
  expect(restarted.resolve()).toEqual(image);
  expect(disk.files.has(backgroundImageUri(image.id))).toBe(true);
});

it('rejects a failed native image copy and removes its partial owned file', async () => {
  const owner = createChatBackgrounds(nativeBackgroundPorts());
  await owner.ready;
  const edit = owner.edit();
  disk.copyFailure = true;
  await expect(edit.pick('picker://photo', { width: 900, height: 1600 })).rejects.toThrow();
  expect(owner.resolve()).toEqual({ kind: 'default' });
  expect([...disk.files.keys()]).toEqual([]);
});
