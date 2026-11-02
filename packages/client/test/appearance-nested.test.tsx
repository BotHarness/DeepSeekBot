// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi } from 'vitest';
import { Appearance } from '../src/client/appearance.js';
import { AppearanceContext } from '../src/client/appearance-context.js';
import { AppearancePanelHeader } from '../src/client/appearance-panel-header.js';
import { panelMaterials, panelTargetId } from '../src/client/appearance-panels.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({}));
vi.mock('../src/client/ds/pointer-menu.js', () => ({
  PointerMenu: ({
    items,
    onSelect,
  }: {
    items: { id: string; label: ReactNode }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      { 'data-test-menu': '' },
      items.map((item) =>
        createElement('button', { key: item.id, onClick: () => onSelect(item.id) }, item.label),
      ),
    ),
}));
vi.mock('../src/client/appearance-panel-settings.js', () => ({
  PanelAppearanceSettings: ({ id, label }: { id: string; label: string }) =>
    createElement('div', { 'data-test-modal': id }, label),
}));
function fixture() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
  const registry = createDockPanelRegistry();
  const owner = new Appearance(storage, () => 'light');
  owner.setTargetSource(() =>
    registry.panels().map((panel) => ({ id: panelTargetId(panel.id), label: panel.title })),
  );
  const register = (id: string) =>
    registry.register({ id, title: id, scope: 'global', component: () => null });
  return { owner, storage, register };
}
describe('nested functional appearance', () => {
  it('resolves a child directly from global and preserves child/mode/registration state on parent reset', () => {
    const { owner, storage, register } = fixture();
    register('bh:channel-body');
    let dispose = register('memory-files');
    const parent = panelTargetId('bh:channel-body'),
      child = panelTargetId('memory-files');
    owner.update({
      mode: 'light',
      materials: { header: { color: '#123456', opacity: 65 }, body: { blur: 3 } },
    });
    owner.update({
      mode: 'light',
      panel: {
        id: parent,
        materials: { header: { color: '#abcdef', opacity: 10 }, body: { blur: 20 } },
      },
    });
    owner.update({ mode: 'light', panel: { id: child, materials: { header: { opacity: 47 } } } });
    owner.update({ mode: 'dark', panel: { id: child, materials: { body: { opacity: 53 } } } });
    const resolved = panelMaterials(owner.getSnapshot().config.modes.light, 'light', child);
    expect(resolved.header).toMatchObject({ color: '#123456', opacity: 47 });
    expect(resolved.body.blur).toBe(3);
    owner.update({ mode: 'light', panel: { id: parent, reset: true } });
    expect(panelMaterials(owner.getSnapshot().config.modes.light, 'light', child)).toEqual(
      resolved,
    );
    const saved = owner.getSnapshot().config;
    dispose();
    expect(() => owner.update({ mode: 'light', panel: { id: child, reset: true } })).toThrow(
      'appearance-target-unavailable',
    );
    expect(owner.getSnapshot().config).toEqual(saved);
    dispose = register('memory-files');
    expect(new Appearance(storage, () => 'light').getSnapshot().config).toEqual(saved);
    owner.update({ mode: 'light', panel: { id: child, reset: true } });
    expect(owner.getSnapshot().config.modes.dark).toEqual(saved.modes.dark);
    expect(owner.getSnapshot().config.modes.light.materials).toEqual(saved.modes.light.materials);
    dispose();
  });
  it('opens only the child header menu and keeps a single functional detail identity for any content', () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const { owner } = fixture();
    const parent = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const render = (content: string) =>
      act(() =>
        root.render(
          createElement(
            AppearanceContext.Provider,
            { value: owner },
            createElement(
              'div',
              { onContextMenu: parent },
              createElement(AppearancePanelHeader, {
                id: 'memory-details',
                label: 'Memory details',
                t: zhTranslate,
                children: content,
              }),
            ),
          ),
        ),
      );
    try {
      render('file.md');
      act(() =>
        host
          .querySelector('[data-appearance-header]')!
          .dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
      );
      expect(parent).not.toHaveBeenCalled();
      expect(host.querySelectorAll('[data-test-menu]')).toHaveLength(1);
      act(() => host.querySelector<HTMLButtonElement>('button')!.click());
      expect(host.querySelector('[data-test-modal]')?.getAttribute('data-test-modal')).toBe(
        'dock:memory-details',
      );
      render('commit 1234567');
      expect(host.querySelector('[data-test-modal]')?.getAttribute('data-test-modal')).toBe(
        'dock:memory-details',
      );
      render('working tree change');
      expect(host.querySelector('[data-test-modal]')?.getAttribute('data-test-modal')).toBe(
        'dock:memory-details',
      );
    } finally {
      act(() => root.unmount());
      host.remove();
    }
  });
});
