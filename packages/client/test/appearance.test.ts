import { describe, it, expect } from 'vitest';
import {
  Appearance,
  APPEARANCE_KEY,
  APPEARANCE_PRIMARY,
  parseAppearance,
  parseAppearancePatch,
} from '../src/client/appearance.js';
import { appearanceCss } from '../src/client/appearance-scope.js';
import { TOBS_ACCENT_ROLES, TOBS_TOKENS } from '../src/client/ds/tobs-tokens.generated.js';
function fixture() {
  const data = new Map<string, string>();
  let n = 0;
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const owner = new Appearance(
    storage,
    () => 'light',
    () => String(++n),
  );
  return { owner, data, storage };
}
describe('device-local appearance authority', () => {
  it('defaults to system and opaque Classic Blue without persisting a Host preference', () => {
    const { owner, data } = fixture();
    expect(owner.getSnapshot()).toEqual({ config: parseAppearance(null), mode: 'light' });
    expect(data.size).toBe(0);
  });
  it('restores independently chosen mode palettes and Primary after restart', () => {
    const { owner, storage, data } = fixture();
    owner.update({ mode: 'dark', preset: 'mist-purple', primary: '#AABBCC' });
    owner.update({ preference: 'dark' });
    expect(new Appearance(storage, () => 'light').getSnapshot()).toEqual(owner.getSnapshot());
    expect(owner.getSnapshot().config.modes.light).toEqual({ preset: 'classic-blue' });
    expect([...data.keys()]).toEqual([APPEARANCE_KEY]);
  });
  it('preserves future fields and unrelated preferences, resets only the chosen mode Primary on preset selection', () => {
    const { owner, storage, data } = fixture();
    const config = {
      ...parseAppearance(null),
      wallpaper: { asset: 'future' },
      modes: {
        light: { preset: 'classic-blue', primary: '#123456', future: true },
        dark: { preset: 'mist-purple', primary: '#abcdef' },
      },
    };
    storage.setItem(APPEARANCE_KEY, JSON.stringify(config));
    data.set('locale', 'zh-CN');
    owner.update({ mode: 'light', preset: 'mist-purple' });
    expect(owner.getSnapshot().config).toMatchObject({
      wallpaper: { asset: 'future' },
      modes: { light: { preset: 'mist-purple', future: true }, dark: config.modes.dark },
    });
    expect(owner.getSnapshot().config.modes.light.primary).toBeUndefined();
    expect(data.get('locale')).toBe('zh-CN');
  });
  it('stores the style per device, applies its tokens and refuses an unknown style', () => {
    const { owner, storage } = fixture();
    expect(appearanceCss(owner.getSnapshot())).toContain(
      '--tobs-style-surface-list-backdrop:var(--tobs-layer-sheet)',
    );
    owner.update({ style: 'b' });
    expect(new Appearance(storage, () => 'light').getSnapshot().config.style).toBe('b');
    const css = appearanceCss(owner.getSnapshot());
    expect(css).toContain('--tobs-style-surface-list-backdrop:var(--tobs-layer-raised)');
    expect(css).toContain('--tobs-style-nav-selected-fill:var(--tobs-accent-selection)');
    owner.update({ style: 'c' });
    const tonal = appearanceCss(owner.getSnapshot());
    expect(tonal).toContain('--tobs-style-nav-selected-fill:var(--tobs-accent-container)');
    expect(tonal).toContain('--tobs-style-list-gap:2px');
    expect(() => parseAppearancePatch({ style: 'z' })).toThrow('appearance-invalid-input');
    expect(() =>
      parseAppearance(JSON.stringify({ ...owner.getSnapshot().config, style: 'z' })),
    ).toThrow('appearance-storage-invalid');
  });
  it('rereads concurrent same-origin writes and refuses a stale expected revision', () => {
    const { owner, storage } = fixture();
    const other = new Appearance(
      storage,
      () => 'dark',
      () => 'other',
    );
    other.update({ mode: 'dark', preset: 'mist-purple' });
    expect(() => owner.update({ preference: 'dark' }, 'initial')).toThrow(
      'appearance-revision-conflict',
    );
    owner.update({ preference: 'light' });
    expect(owner.getSnapshot().config.modes.dark.preset).toBe('mist-purple');
  });
  it('never reports a failed write as saved or loses the accepted snapshot', () => {
    const { owner, storage } = fixture();
    owner.update({ preference: 'dark' });
    storage.setItem = () => {
      throw new Error('quota');
    };
    expect(() => owner.update({ preference: 'light' })).toThrow('appearance-storage-unavailable');
    expect(owner.getSnapshot()).toMatchObject({
      mode: 'dark',
      error: 'appearance-storage-unavailable',
    });
  });
  it('preserves unreadable or future storage rather than overwriting it', () => {
    for (const raw of ['{broken', JSON.stringify({ ...parseAppearance(null), version: 2 })]) {
      const { owner, storage, data } = fixture();
      storage.setItem(APPEARANCE_KEY, raw);
      expect(() => owner.update({ preference: 'dark' })).toThrow('appearance-storage-invalid');
      expect(data.get(APPEARANCE_KEY)).toBe(raw);
    }
    expect(new Appearance(undefined, () => 'light').getSnapshot().error).toBe(
      'appearance-storage-unavailable',
    );
  });
  it('follows system changes only in system mode', () => {
    const { storage } = fixture();
    let dark = false;
    const owner = new Appearance(storage, () => (dark ? 'dark' : 'light'));
    dark = true;
    owner.refresh();
    expect(owner.getSnapshot().mode).toBe('dark');
    owner.update({ preference: 'light' });
    owner.refresh();
    expect(owner.getSnapshot().mode).toBe('light');
  });
  it.each([
    {},
    null,
    { preference: 'blue' },
    { primary: '#ffffff' },
    { mode: 'dark' },
    { mode: 'light', primary: 'red' },
    { mode: 'light', primary: '#123456; color:red' },
    { wallpaper: 'later' },
  ])('rejects invalid/unsupported patch %j', (value) => {
    expect(() => parseAppearancePatch(value)).toThrow('appearance-invalid-input');
  });
  it('scopes an independent complete palette, changes accents without changing semantic status colors', () => {
    const { owner } = fixture();
    const before = appearanceCss(owner.getSnapshot());
    owner.update({ preference: 'dark', mode: 'dark', primary: '#123456' });
    const after = appearanceCss(owner.getSnapshot());
    expect(after).toContain('--tobs-accent-solid:#123456');
    expect(after).toContain('color:var(--tobs-ink-primary)');
    expect(after).not.toMatch(/--dsw-|data-ds-dark-theme/);
    expect(after).toContain('color-scheme:dark');
    expect(after).toContain(`--tobs-layer-canvas:${TOBS_TOKENS.dark['--tobs-layer-canvas']}`);
    expect(before).toContain('color-scheme:light');
    const status = (css: string) => /--tobs-status-danger-base:([^;}]+)/.exec(css)?.[1];
    owner.update({ mode: 'dark', primary: '#abcdef' });
    expect(status(appearanceCss(owner.getSnapshot()))).toBe(status(after));
  });
  it('shows the same preset primary in the picker and generated accent palette', () => {
    const { owner } = fixture();
    for (const mode of ['light', 'dark'] as const) {
      for (const preset of Object.keys(APPEARANCE_PRIMARY) as (keyof typeof APPEARANCE_PRIMARY)[]) {
        owner.update({ preference: mode, mode, preset });
        const solid = APPEARANCE_PRIMARY[preset][mode];
        expect(solid).toBe(TOBS_ACCENT_ROLES[preset][mode]['--tobs-accent-solid']);
        expect(appearanceCss(owner.getSnapshot())).toContain(`--tobs-accent-solid:${solid}`);
      }
    }
  });
});
