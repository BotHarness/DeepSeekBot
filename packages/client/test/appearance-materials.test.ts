import { describe, it, expect } from 'vitest';
import {
  Appearance,
  APPEARANCE_KEY,
  parseAppearance,
  parseAppearancePatch,
} from '../src/client/appearance.js';
import { appearanceMaterials } from '../src/client/appearance-materials.js';
import { appearanceCss } from '../src/client/appearance-scope.js';
function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
  };
  return { storage, data, owner: new Appearance(storage, () => 'light') };
}
describe('global Header/Body appearance', () => {
  it('patches each material field independently and restores both modes', () => {
    const { owner, storage } = fixture();
    owner.update({
      mode: 'light',
      materials: { header: { color: '#123456' }, body: { opacity: 22, blur: 14 } },
    });
    owner.update({ mode: 'light', materials: { header: { opacity: 32 } } });
    owner.update({
      mode: 'dark',
      preset: 'forest-green',
      materials: { body: { color: '#345678' } },
    });
    const next = new Appearance(storage, () => 'light').getSnapshot().config;
    expect(appearanceMaterials(next.modes.light, 'light')).toEqual({
      header: { color: '#123456', opacity: 32, blur: 0 },
      body: { color: '#fdfefe', opacity: 22, blur: 14 },
    });
    expect(appearanceMaterials(next.modes.dark, 'dark')).toMatchObject({
      body: { color: '#345678', opacity: 80, blur: 12 },
    });
  });
  it('applies a new preset to all known global adjustments while retaining other-mode and future data', () => {
    const { owner, storage } = fixture();
    const original = parseAppearance(null);
    original.wallpaper = { asset: 'kept' };
    original.modes.light.panels = { 'dock:memory': { header: { future: 'kept' } } };
    original.modes.light.materials = {
      header: { color: '#112233', opacity: 5, blur: 40, future: 3 },
    };
    original.modes.light.primary = '#123456';
    original.modes.dark = { preset: 'forest-green', materials: { body: { opacity: 11 } } };
    storage.setItem(APPEARANCE_KEY, JSON.stringify(original));
    owner.update({ mode: 'light', preset: 'warm-amber' });
    const next = owner.getSnapshot().config;
    expect(next.modes.dark).toEqual(original.modes.dark);
    expect(next.wallpaper).toEqual(original.wallpaper);
    expect(next.modes.light.panels).toEqual(original.modes.light.panels);
    expect(next.modes.light.materials?.header).toEqual({ future: 3 });
    expect(next.modes.light.primary).toBeUndefined();
    expect(appearanceMaterials(next.modes.light, 'light').body).toEqual({
      color: '#fcf7ed',
      opacity: 82,
      blur: 10,
    });
  });
  it('keeps accepted materials and bytes when storage refuses', () => {
    const { owner, storage, data } = fixture();
    owner.update({ mode: 'light', materials: { header: { opacity: 25 } } });
    const bytes = data.get(APPEARANCE_KEY);
    storage.setItem = () => {
      throw Error('quota');
    };
    expect(() => owner.update({ mode: 'light', materials: { header: { opacity: 99 } } })).toThrow(
      'appearance-storage-unavailable',
    );
    expect(data.get(APPEARANCE_KEY)).toBe(bytes);
    expect(owner.getSnapshot().config.modes.light.materials?.header?.opacity).toBe(25);
  });
  it.each([
    { header: { opacity: -1 } },
    { body: { opacity: 101 } },
    { body: { blur: 41 } },
    { body: { blur: NaN } },
    { header: { color: 'red' } },
    { header: { color: '#ffffff;display:none' } },
    { header: {} },
    { footer: { opacity: 10 } },
  ])('refuses invalid materials %j', (materials) => {
    expect(() => parseAppearancePatch({ mode: 'light', materials })).toThrow(
      'appearance-invalid-input',
    );
  });
  it('ships four light/dark presets, with an opaque default and scoped surface-only alpha', () => {
    const { owner } = fixture();
    for (const mode of ['light', 'dark'] as const)
      for (const preset of ['classic-blue', 'mist-purple', 'forest-green', 'warm-amber'] as const) {
        owner.update({ preference: mode, mode, preset });
        const resolved = appearanceMaterials(owner.getSnapshot().config.modes[mode], mode);
        expect(resolved.body.opacity).toBe(
          preset === 'classic-blue' ? 100 : preset === 'warm-amber' ? 82 : 80,
        );
        const css = appearanceCss(owner.getSnapshot());
        expect(css).toContain('backdrop-filter:blur(var(--bh-global-body-blur))');
        expect(css).not.toMatch(/(?:^|[;{])opacity:/);
        expect(css).toContain(
          ':root .bh-workspace-mount[data-workspace-enabled] .dv-content-container',
        );
      }
  });
});
