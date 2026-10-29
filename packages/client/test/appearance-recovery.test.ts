import { describe, it, expect, vi } from 'vitest';
import { Appearance, APPEARANCE_KEY, parseAppearance } from '../src/client/appearance.js';
import { Wallpaper } from '../src/client/wallpaper.js';
import { memoryWallpaperStore } from './wallpaper-memory.js';
import { resetAppearance } from '../src/client/appearance-recovery.js';
function fixture() {
  const original = {
    ...parseAppearance(null),
    revision: 'prefs-0',
    preference: 'dark' as const,
    modes: {
      light: {
        preset: 'forest-green' as const,
        primary: '#112233',
        materials: { body: { opacity: 3 } },
        panels: {
          'dock:bh:channel-body': { header: { color: '#334455' } },
          'dock:memory-files': { body: { opacity: 0 } },
          'dock:removed-plugin': { body: { blur: 40 } },
        },
      },
      dark: {
        preset: 'mist-purple' as const,
        primary: '#abcdef',
        panels: { 'dock:memory-details': { body: { opacity: 7 } } },
      },
    },
  };
  let raw = JSON.stringify(original),
    failPrefs = false,
    failMedia = false,
    n = 0;
  const appearance = new Appearance(
    {
      getItem: () => raw,
      setItem: (key, value) => {
        expect(key).toBe(APPEARANCE_KEY);
        if (failPrefs) throw Error('blocked');
        raw = value;
      },
    },
    () => 'light',
    () => `prefs-${++n}`,
  );
  const media = memoryWallpaperStore({
    version: 1,
    revision: 'media-0',
    kind: 'image',
    blob: new Blob(['original']),
    width: 1200,
    height: 800,
    crop: { x: 0.6, y: 0.4, zoom: 1.2 },
  });
  const replace = media.write;
  const wallpaper = new Wallpaper(media.store, async (blob) => ({
    blob,
    url: 'blob:accepted',
    width: 1200,
    height: 800,
    release: () => {},
  }));
  return {
    appearance,
    wallpaper,
    replace,
    original,
    read: () => JSON.parse(raw),
    record: () => media.active(),
    revision: () => media.library().revision,
    failPrefs: (v: boolean) => {
      failPrefs = v;
    },
    failMedia: (v: boolean) => media.fail(v),
  };
}
const command = (revision = 'media-0') => ({
  action: 'reset-all',
  confirmed: true,
  wallpaperRevision: revision,
});
describe('scoped appearance recovery', () => {
  it('clears every current-mode functional override including unregistered targets, preserving all other choices', () => {
    const f = fixture();
    f.appearance.update({ mode: 'light', clearPanels: true }, 'prefs-0');
    const next = f.read();
    expect(next.modes.light.panels).toBeUndefined();
    const { panels: _panels, ...global } = f.original.modes.light;
    expect(next.modes.light).toEqual(global);
    expect(next.modes.dark).toEqual(f.original.modes.dark);
    expect(next.preference).toBe('dark');
    expect(f.replace).not.toHaveBeenCalled();
    f.wallpaper.dispose();
  });
  it('requires explicit confirmation and both current revisions before any write', async () => {
    const f = fixture();
    await expect(
      resetAppearance(f.appearance, f.wallpaper, { ...command(), confirmed: false }, 'prefs-0'),
    ).rejects.toMatchObject({ code: 'appearance-reset-confirmation-required' });
    await expect(
      resetAppearance(f.appearance, f.wallpaper, command(), 'stale'),
    ).rejects.toMatchObject({ code: 'appearance-revision-conflict' });
    await expect(
      resetAppearance(f.appearance, f.wallpaper, command('stale'), 'prefs-0'),
    ).rejects.toMatchObject({ code: 'wallpaper-revision-conflict' });
    await expect(
      resetAppearance(f.appearance, f.wallpaper, command(), 'prefs-0', 0),
    ).rejects.toMatchObject({ code: 'appearance-request-stale' });
    expect(f.read()).toEqual(f.original);
    expect(f.replace).not.toHaveBeenCalled();
    f.wallpaper.dispose();
  });
  it('does not clear media if preferences cannot be persisted', async () => {
    const f = fixture();
    f.failPrefs(true);
    await expect(
      resetAppearance(f.appearance, f.wallpaper, command(), 'prefs-0'),
    ).rejects.toMatchObject({ code: 'appearance-storage-unavailable' });
    expect(f.read()).toEqual(f.original);
    expect(f.revision()).toBe('media-0');
    expect(f.replace).not.toHaveBeenCalled();
    f.wallpaper.dispose();
  });
  it('reports a partial reset when media deletion fails and retries from the real saved revisions', async () => {
    const f = fixture();
    f.failMedia(true);
    await expect(
      resetAppearance(f.appearance, f.wallpaper, command(), 'prefs-0'),
    ).rejects.toMatchObject({ code: 'appearance-reset-wallpaper-failed' });
    expect(f.read().modes).toEqual(parseAppearance(null).modes);
    expect(f.read().preference).toBe('system');
    expect(f.revision()).toBe('media-0');
    f.failMedia(false);
    const result = await resetAppearance(f.appearance, f.wallpaper, command(), f.read().revision);
    expect(result.complete).toBe(true);
    expect(f.record()).toBeUndefined();
    expect(result.wallpaper.current).toBeUndefined();
    f.wallpaper.dispose();
  });
  it('invalidates an uncommitted preview even if there was no saved wallpaper', async () => {
    const f = fixture();
    await f.wallpaper.refresh();
    await f.wallpaper.remove('media-0');
    const before = f.wallpaper.getSnapshot().resourceVersion;
    await resetAppearance(f.appearance, f.wallpaper, command(f.revision()), 'prefs-0');
    expect(f.wallpaper.getSnapshot().resourceVersion).toBeGreaterThan(before);
    f.wallpaper.dispose();
  });
  it('rejects mixing bulk clear with unrelated edits or passing reset through the ordinary patch route', () => {
    const f = fixture();
    for (const patch of [
      { mode: 'light', clearPanels: true, primary: '#ffffff' },
      { clearPanels: true },
      { resetAll: true },
      { mode: 'light', clearPanels: false },
    ])
      expect(() => f.appearance.update(patch)).toThrow();
    expect(f.read()).toEqual(f.original);
    f.wallpaper.dispose();
  });
});
