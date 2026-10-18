import { describe, expect, it } from 'vitest';
import { createChatBackgrounds, type BackgroundDocument } from '../src/host/chat-background';

describe('chat background preferences', () => {
  it('normalizes persisted missing fields and finite ranges while refusing invalid live edits', async () => {
    const owner = createChatBackgrounds({
      read: async () => ({
        version: 1,
        default: { kind: 'image', id: 'old.jpg', width: 800, height: 1200, x: 1.01, y: -0.2 },
        overrides: {},
      }),
      write: async () => {},
      importImage: async () => {
        throw Error('unused');
      },
      listImages: async () => ['old.jpg'],
      removeImage: async () => {
        throw Error('saved picture must stay');
      },
    });
    await owner.ready;
    expect(owner.resolve()).toEqual({
      kind: 'image',
      id: 'old.jpg',
      width: 800,
      height: 1200,
      fit: 'cover',
      x: 1,
      y: 0,
      fade: 60,
    });
    const edit = owner.edit();
    expect(() =>
      edit.choose({
        kind: 'image',
        id: 'old.jpg',
        width: 800,
        height: 1200,
        fit: 'cover',
        x: 1.01,
        y: 0,
        fade: 60,
      }),
    ).toThrow('background-invalid-choice');
  });
  it('inherits device defaults without crossing stable Host/Channel overrides', async () => {
    let stored: BackgroundDocument | undefined;
    const owner = createChatBackgrounds({
      read: async () => stored,
      write: async (value) => {
        stored = structuredClone(value);
      },
      importImage: async () => {
        throw Error('unused');
      },
      listImages: async () => [],
      removeImage: async () => {},
    });
    await owner.ready;
    const a = { hostId: 'a', channelId: 'same-channel' };
    const b = { hostId: 'b', channelId: 'same-channel' };
    const global = owner.edit();
    global.choose({ kind: 'color', color: '#abcdef' });
    await global.save();
    const override = owner.edit(a);
    override.choose({ kind: 'color', color: '#123456' });
    await override.save();
    const nextGlobal = owner.edit();
    nextGlobal.choose({ kind: 'default' });
    await nextGlobal.save();
    expect(owner.resolve(a)).toEqual({ kind: 'color', color: '#123456' });
    expect(owner.resolve(b)).toEqual({ kind: 'default' });
    const restore = owner.edit(a);
    restore.choose(undefined);
    expect(owner.resolve(a)).toEqual({ kind: 'color', color: '#123456' });
    await restore.save();
    expect(owner.resolve(a)).toEqual({ kind: 'default' });
    expect(stored?.overrides).toEqual({});
  });

  it('discards an image finishing after dismissal and cleans its owned asset', async () => {
    let finish: ((image: { id: string; width: number; height: number }) => void) | undefined;
    const assets = new Set<string>();
    const owner = createChatBackgrounds({
      read: async () => undefined,
      write: async () => {},
      importImage: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      listImages: async () => [...assets],
      removeImage: async (id) => {
        assets.delete(id);
      },
    });
    await owner.ready;
    const edit = owner.edit();
    const picking = edit.pick('temporary');
    await edit.cancel();
    assets.add('abandoned.jpg');
    finish!({ id: 'abandoned.jpg', width: 100, height: 200 });
    await picking;
    expect(owner.resolve()).toEqual({ kind: 'default' });
    expect([...assets]).toEqual([]);
    await expect(edit.save()).rejects.toThrow('background-busy');
  });
  it('retains the saved picture on failed replacement, then permits retry', async () => {
    const assets = new Set<string>();
    let stored: BackgroundDocument | undefined;
    let fail = false;
    let sequence = 0;
    const owner = createChatBackgrounds({
      read: async () => stored,
      write: async (value) => {
        if (fail) throw Error('disk full');
        stored = structuredClone(value);
      },
      importImage: async () => {
        const id = `image-${++sequence}.jpg`;
        assets.add(id);
        return { id, width: 400, height: 600 };
      },
      listImages: async () => [...assets],
      removeImage: async (id) => {
        assets.delete(id);
      },
    });
    await owner.ready;
    const old = owner.edit();
    await old.pick('first');
    await old.save();
    const replacement = owner.edit();
    await replacement.pick('second');
    fail = true;
    await expect(replacement.save()).rejects.toThrow();
    expect(owner.resolve()).toMatchObject({ id: 'image-1.jpg' });
    expect([...assets]).toEqual(['image-1.jpg', 'image-2.jpg']);
    fail = false;
    await replacement.save();
    expect(owner.resolve()).toMatchObject({ id: 'image-2.jpg' });
    expect([...assets]).toEqual(['image-2.jpg']);
  });

  it.each(['read', 'parse'])(
    'does not overwrite metadata or reclaim files after a %s failure',
    async (failure) => {
      const removed: string[] = [];
      let writes = 0;
      const owner = createChatBackgrounds({
        read: async () => {
          if (failure === 'read') throw Error('unavailable');
          return { version: 99 };
        },
        write: async () => {
          writes++;
        },
        importImage: async () => {
          throw Error('unused');
        },
        listImages: async () => ['saved.jpg'],
        removeImage: async (id) => {
          removed.push(id);
        },
      });
      await owner.ready;
      expect(owner.resolve()).toEqual({ kind: 'default' });
      expect(owner.getSnapshot().storageError).toBe(true);
      const edit = owner.edit();
      edit.choose({ kind: 'color', color: '#abcdef' });
      await expect(edit.save()).rejects.toThrow('background-save-failed');
      expect(edit.getSnapshot()).toMatchObject({ error: true, closed: false });
      await edit.cancel();
      expect(writes).toBe(0);
      expect(removed).toEqual([]);
    },
  );

  it('protects an import that completes while an older cleanup is listing files', async () => {
    let finishList: ((ids: string[]) => void) | undefined;
    let defer = false;
    const removed: string[] = [];
    const owner = createChatBackgrounds({
      read: async () => undefined,
      write: async () => {},
      importImage: async () => ({ id: 'new.jpg', width: 100, height: 200 }),
      listImages: () =>
        defer
          ? new Promise((resolve) => {
              defer = false;
              finishList = resolve;
            })
          : Promise.resolve([]),
      removeImage: async (id) => {
        removed.push(id);
      },
    });
    await owner.ready;
    defer = true;
    const abandoned = owner.edit();
    const cleanup = abandoned.cancel();
    const active = owner.edit();
    await active.pick('new');
    finishList!(['new.jpg']);
    await cleanup;
    expect(removed).toEqual([]);
    await active.save();
    expect(owner.resolve()).toMatchObject({ id: 'new.jpg' });
  });
  it('keeps a picked image in preview until saved, then retains it on a cold start', async () => {
    let stored: BackgroundDocument | undefined;
    const assets = new Set<string>();
    const ports = {
      read: async () => stored,
      write: async (value: BackgroundDocument) => {
        stored = structuredClone(value);
      },
      importImage: async (_uri: string) => {
        assets.add('picture.jpg');
        return { id: 'picture.jpg', width: 800, height: 1200 };
      },
      listImages: async () => [...assets],
      removeImage: async (id: string) => {
        assets.delete(id);
      },
    };
    const backgrounds = createChatBackgrounds(ports);
    await backgrounds.ready;
    const scope = { hostId: 'computer-a', channelId: 'dm-a' };
    const edit = backgrounds.edit(scope);
    await edit.pick('picker://temporary');
    expect(backgrounds.resolve(scope)).toEqual({ kind: 'default' });
    expect(edit.getSnapshot().choice).toMatchObject({ kind: 'image', id: 'picture.jpg', fade: 60 });
    await edit.save();
    const restarted = createChatBackgrounds(ports);
    await restarted.ready;
    expect(restarted.resolve(scope)).toMatchObject({ kind: 'image', id: 'picture.jpg', fade: 60 });
    expect(assets.has('picture.jpg')).toBe(true);
  });
});
