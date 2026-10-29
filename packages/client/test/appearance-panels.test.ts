import { describe, it, expect } from 'vitest';
import { Appearance, APPEARANCE_KEY, parseAppearancePatch } from '../src/client/appearance.js';
import { panelMaterials } from '../src/client/appearance-panels.js';
import { appearanceCss } from '../src/client/appearance-scope.js';
function fixture() {
  const bytes = new Map<string, string>();
  const storage = {
    getItem: (key: string) => bytes.get(key) ?? null,
    setItem: (key: string, value: string) => {
      bytes.set(key, value);
    },
  };
  const owner = new Appearance(storage, () => 'light');
  const targets = [
    { id: 'dock:bh:channel-body', label: 'Messages' },
    { id: 'dock:bh:home', label: 'Home' },
  ];
  owner.setTargetSource(() => targets);
  return { owner, targets, storage, bytes };
}
const messages = 'dock:bh:channel-body';
const home = 'dock:bh:home';
describe('functional Panel appearance owner', () => {
  it('resolves each property independently and retains other targets/modes across global edits and presets', () => {
    const { owner } = fixture();
    owner.update({
      mode: 'light',
      panel: { id: messages, materials: { header: { color: '#123456' } } },
    });
    owner.update({ mode: 'light', panel: { id: home, materials: { body: { opacity: 28 } } } });
    owner.update({ mode: 'dark', panel: { id: messages, materials: { body: { blur: 9 } } } });
    owner.update({ mode: 'light', materials: { body: { opacity: 64 }, header: { blur: 8 } } });
    let config = owner.getSnapshot().config;
    expect(panelMaterials(config.modes.light, 'light', messages)).toMatchObject({
      header: { color: '#123456', blur: 8 },
      body: { opacity: 64 },
    });
    expect(panelMaterials(config.modes.light, 'light', home).body.opacity).toBe(28);
    owner.update({ mode: 'light', preset: 'warm-amber' });
    config = owner.getSnapshot().config;
    expect(panelMaterials(config.modes.light, 'light', messages)).toMatchObject({
      header: { color: '#123456', blur: 14 },
      body: { opacity: 82 },
    });
    expect(config.modes.dark.panels?.[messages]).toEqual({ body: { blur: 9 } });
    expect(config.modes.light.panels?.[home]).toEqual({ body: { opacity: 28 } });
  });
  it('clears only a requested property, then only the selected mode and target', () => {
    const { owner } = fixture();
    for (const mode of ['light', 'dark'] as const)
      for (const id of [messages, home])
        owner.update({
          mode,
          panel: {
            id,
            materials: { header: { color: '#123456', blur: 11 }, body: { opacity: 26 } },
          },
        });
    owner.update({
      mode: 'light',
      panel: { id: messages, materials: { header: { color: null } } },
    });
    expect(owner.getSnapshot().config.modes.light.panels?.[messages]).toEqual({
      header: { blur: 11 },
      body: { opacity: 26 },
    });
    const before = structuredClone(owner.getSnapshot().config);
    owner.update({ mode: 'light', panel: { id: messages, reset: true } });
    const after = owner.getSnapshot().config;
    expect(after.modes.light.panels?.[messages]).toBeUndefined();
    expect(after.modes.light.panels?.[home]).toEqual(before.modes.light.panels?.[home]);
    expect(after.modes.dark).toEqual(before.modes.dark);
  });
  it('restores stable functional identity after a new owner and rejects stale or duplicate registration without writing', () => {
    const { owner, storage, targets, bytes } = fixture();
    owner.update({
      mode: 'light',
      panel: { id: messages, materials: { body: { color: '#246810' } } },
    });
    const restored = new Appearance(storage, () => 'light');
    restored.setTargetSource(() => targets);
    expect(restored.getSnapshot().config).toEqual(owner.getSnapshot().config);
    const saved = bytes.get(APPEARANCE_KEY);
    targets.shift();
    expect(() => restored.update({ mode: 'light', panel: { id: messages, reset: true } })).toThrow(
      'appearance-target-unavailable',
    );
    expect(bytes.get(APPEARANCE_KEY)).toBe(saved);
    targets.push({ ...targets[0]! });
    expect(() => restored.targets()).toThrow('appearance-target-duplicate');
    expect(() => restored.update({ mode: 'light', panel: { id: home, reset: true } })).toThrow(
      'appearance-target-duplicate',
    );
    expect(bytes.get(APPEARANCE_KEY)).toBe(saved);
  });
  it('preserves accepted material state on revision conflict and refused storage', () => {
    const { owner, storage, bytes } = fixture();
    owner.update({ mode: 'light', panel: { id: home, materials: { body: { opacity: 45 } } } });
    const saved = bytes.get(APPEARANCE_KEY);
    expect(() =>
      owner.update({ mode: 'light', panel: { id: home, reset: true } }, 'initial'),
    ).toThrow('appearance-revision-conflict');
    storage.setItem = () => {
      throw Error('quota');
    };
    expect(() => owner.update({ mode: 'light', panel: { id: home, reset: true } })).toThrow(
      'appearance-storage-unavailable',
    );
    expect(bytes.get(APPEARANCE_KEY)).toBe(saved);
    expect(owner.getSnapshot().config.modes.light.panels?.[home]).toEqual({
      body: { opacity: 45 },
    });
  });
  it('scopes paint to the active functional Dock group without inheritable per-panel variables', () => {
    const { owner } = fixture();
    owner.update({
      mode: 'light',
      panel: { id: messages, materials: { header: { color: '#abcdef' } } },
    });
    const css = appearanceCss(owner.getSnapshot());
    expect(css).toContain('.dv-active-tab [data-dock-header="bh:channel-body"]');
    expect(css).toContain('background:color-mix(in srgb, #abcdef 100%, transparent)');
    expect(css).not.toContain('--bh-panel-');
  });
  it.each([
    { id: messages, materials: { header: { opacity: 101 } } },
    { id: messages, materials: { body: { blur: -1 } } },
    { id: messages, materials: { header: { unknown: 3 } } },
    { id: messages, reset: true, materials: { body: { blur: 0 } } },
    { id: 'dock:x"] body{', reset: true },
    { id: messages },
  ])('refuses malformed panel operation %j', (panel) => {
    expect(() => parseAppearancePatch({ mode: 'light', panel })).toThrow(
      'appearance-invalid-input',
    );
  });
});
