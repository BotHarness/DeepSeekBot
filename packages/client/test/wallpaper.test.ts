import { describe, it, expect, vi } from 'vitest';
import { Wallpaper } from '../src/client/wallpaper.js';
import {
  DEFAULT_CROP,
  WallpaperError,
  rotationStep,
  wallpaperPlacement,
} from '../src/client/wallpaper-store.js';
import { memoryWallpaperStore } from './wallpaper-memory.js';
import { createWallpaperControl } from '../src/client/wallpaper-control.js';
function fixture(now = () => Date.now()) {
  const memory = memoryWallpaperStore();
  const releases: string[] = [];
  let n = 0;
  const decode = vi.fn(async (blob: Blob) => {
    if ((await blob.text()) === 'invalid') throw new WallpaperError('wallpaper-decode-failed');
    const url = `blob:fixture-${++n}`;
    return {
      blob,
      url,
      width: 1200,
      height: 800,
      release: () => {
        releases.push(url);
      },
    };
  });
  const owner = new Wallpaper(memory.store, decode, now);
  return {
    owner,
    store: memory.store,
    decode,
    releases,
    fail: () => memory.fail(),
    saved: () => memory.active(),
    library: memory.library,
  };
}
describe('local wallpaper owner', () => {
  it('persists original bytes and crop together, restores a fresh owner and removes the only asset', async () => {
    const f = fixture();
    await f.owner.refresh();
    const input = new Blob(['original pixels']);
    const crop = { x: 0.7, y: 0.2, zoom: 1.5 };
    await f.owner.save(input, crop, 'empty');
    expect(await f.saved()!.blob.text()).toBe('original pixels');
    const restored = new Wallpaper(f.store, f.decode);
    await restored.refresh();
    expect(restored.describe()).toEqual(f.owner.describe());
    const revision = restored.getSnapshot().revision;
    await restored.crop({ ...crop, zoom: 2 }, revision);
    expect(await f.saved()!.blob.text()).toBe('original pixels');
    expect(f.saved()!.crop.zoom).toBe(2);
    await restored.remove(restored.getSnapshot().revision);
    expect(f.saved()).toBeUndefined();
    expect(f.library().items).toEqual([]);
    expect(restored.getSnapshot().current).toBeUndefined();
    f.owner.dispose();
    restored.dispose();
  });
  it('retains the accepted bytes, crop and live URL when decoding, saving or revision checks fail', async () => {
    const f = fixture();
    await f.owner.save(new Blob(['first']), DEFAULT_CROP, 'empty');
    const saved = f.saved();
    const revision = f.library().revision;
    const current = f.owner.getSnapshot().current;
    await expect(f.owner.save(new Blob(['invalid']), DEFAULT_CROP, revision)).rejects.toMatchObject(
      { code: 'wallpaper-decode-failed' },
    );
    await expect(f.owner.save(new Blob(['second']), DEFAULT_CROP, 'stale')).rejects.toMatchObject({
      code: 'wallpaper-revision-conflict',
    });
    f.fail();
    await expect(f.owner.save(new Blob(['third']), DEFAULT_CROP, revision)).rejects.toMatchObject({
      code: 'wallpaper-storage-unavailable',
    });
    await expect(f.owner.crop({ x: 0, y: 0, zoom: 2 }, revision)).rejects.toMatchObject({
      code: 'wallpaper-storage-unavailable',
    });
    expect(f.saved()).toBe(saved);
    expect(f.owner.getSnapshot().current).toEqual(current);
    expect(f.releases).not.toContain(current!.url);
    expect(f.releases).toHaveLength(2);
    f.owner.dispose();
    expect(f.releases).toContain(current!.url);
  });
  it('refuses expired imports and invalid crops before replacing the current asset', async () => {
    const f = fixture();
    await expect(f.owner.save(new Blob(['x']), DEFAULT_CROP, 'empty', 0)).rejects.toMatchObject({
      code: 'appearance-request-stale',
    });
    await expect(
      f.owner.save(new Blob(['x']), { x: -1, y: 0.5, zoom: 1 }, 'empty'),
    ).rejects.toMatchObject({ code: 'wallpaper-crop-invalid' });
    expect(f.saved()).toBeUndefined();
    f.owner.dispose();
  });
  it('bounds and orders directed import chunks without touching persistence until commit', async () => {
    const f = fixture();
    const control = createWallpaperControl(f.owner);
    const deadline = Date.now() + 10000;
    const begin = await control.execute({ action: 'begin', size: 6 }, 'empty', deadline);
    const id = 'uploadId' in begin ? begin.uploadId : undefined;
    await expect(
      control.execute(
        { action: 'append', uploadId: id, offset: 1, data: btoa('first!') },
        'empty',
        deadline,
      ),
    ).rejects.toMatchObject({ code: 'wallpaper-chunk-invalid' });
    await control.execute(
      { action: 'append', uploadId: id, offset: 0, data: btoa('first!') },
      'empty',
      deadline,
    );
    expect(f.saved()).toBeUndefined();
    await control.execute({ action: 'commit', uploadId: id }, 'empty', deadline);
    expect(await f.saved()!.blob.text()).toBe('first!');
    await expect(
      control.execute({ action: 'commit', uploadId: id }, 'empty', deadline),
    ).rejects.toMatchObject({ code: 'wallpaper-upload-stale' });
    control.dispose();
    f.owner.dispose();
  });
  it.each([
    [1800, 600],
    [600, 1800],
    [800, 800],
  ])('covers %s by %s without stretching or exposing blank edges', (w, h) => {
    for (const crop of [DEFAULT_CROP, { x: 0, y: 1, zoom: 1 }, { x: 0.7, y: 0.2, zoom: 3 }]) {
      const p = wallpaperPlacement(1200, 800, w, h, crop);
      expect(p.width / p.height).toBeCloseTo(1.5);
      expect(p.left).toBeLessThanOrEqual(0);
      expect(p.top).toBeLessThanOrEqual(0);
      expect(p.left + p.width).toBeGreaterThanOrEqual(w);
      expect(p.top + p.height).toBeGreaterThanOrEqual(h);
    }
  });
  it('keeps several items, shows the chosen one and deletes without losing the rest', async () => {
    const f = fixture();
    await f.owner.refresh();
    await f.owner.add(new Blob(['one']), DEFAULT_CROP, 'empty');
    await f.owner.add(new Blob(['two']), DEFAULT_CROP, f.library().revision);
    const [one, two] = f.library().items;
    expect(f.owner.getSnapshot().current?.id).toBe(two!.id);
    expect(f.owner.getSnapshot().library.items.map((item) => item.id)).toEqual([one!.id, two!.id]);
    await f.owner.select(one!.id, f.library().revision);
    expect(f.owner.getSnapshot().current?.id).toBe(one!.id);
    await f.owner.crop({ x: 0.1, y: 0.9, zoom: 2 }, f.library().revision, Infinity, two!.id);
    expect(f.library().items[1]!.crop).toEqual({ x: 0.1, y: 0.9, zoom: 2 });
    expect(f.owner.getSnapshot().current?.id).toBe(one!.id);
    await f.owner.select(undefined, f.library().revision);
    expect(f.owner.getSnapshot().current).toBeUndefined();
    expect(f.library().items).toHaveLength(2);
    await f.owner.select(one!.id, f.library().revision);
    await f.owner.remove(f.library().revision);
    expect(f.library().items.map((item) => item.id)).toEqual([two!.id]);
    expect(f.owner.getSnapshot().current?.id).toBe(two!.id);
    await f.owner.clear(f.library().revision);
    expect(f.library().items).toEqual([]);
    expect(f.owner.getSnapshot().current).toBeUndefined();
    f.owner.dispose();
  });
  it('rotates on the clock in order or shuffled, and refuses unknown intervals', async () => {
    let now = 1_000_000;
    const f = fixture(() => now);
    await f.owner.refresh();
    for (const text of ['a', 'b', 'c'])
      await f.owner.add(new Blob([text]), DEFAULT_CROP, f.library().revision);
    const ids = f.library().items.map((item) => item.id);
    await f.owner.select(ids[0], f.library().revision);
    await f.owner.setRotation({ interval: 60_000 }, f.library().revision);
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(f.owner.getSnapshot().current?.id);
      now += 60_000;
      await f.owner.refresh();
    }
    expect(seen).toEqual([ids[0], ids[1], ids[2], ids[0]]);
    await expect(f.owner.setRotation({ interval: 7 }, f.library().revision)).rejects.toMatchObject({
      code: 'wallpaper-rotation-invalid',
    });
    const library = { ...f.library(), shuffle: true, since: 0, interval: 60_000 };
    let previous = rotationStep(library, 0).id;
    for (let minute = 1; minute < 40; minute++) {
      const { id } = rotationStep(library, minute * 60_000);
      expect(ids).toContain(id);
      expect(id).not.toBe(previous);
      previous = id;
    }
    f.owner.dispose();
  });
});
