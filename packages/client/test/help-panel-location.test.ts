// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { panelLocationGuide } from '../src/client/help-panel-location.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';

const panel = {
  id: 'example',
  title: 'Example',
  scope: 'global' as const,
  icon: 'info',
  component: () => null,
};
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup(markup: string) {
  document.body.innerHTML = markup;
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(function (this: Element) {
    const rects = this.hasAttribute('hidden') ? [] : [new DOMRect(0, 0, 32, 32)];
    return Object.assign(rects, { item: (index: number) => rects[index] ?? null });
  });
  const panels = createDockPanelRegistry();
  panels.register(panel);
  const open = vi.fn();
  panels.attach({ open, close: vi.fn(), canOpen: () => true });
  return { panels, open, guide: panelLocationGuide(panels, panel) };
}
it('locates the visible header without opening or resizing a panel', async () => {
  const { guide, open } = setup(
    '<div data-dock-header="example"></div><button data-pinned-panel="example"></button>',
  );
  expect(guide.availability().status).toBe('ready');
  const prepared = await guide.prepare('example', new AbortController().signal);
  expect(prepared.steps[0]!.resolve()).toBe(document.querySelector('[data-dock-header]'));
  expect(prepared.steps[0]!.description.en).toContain('panel header');
  prepared.dispose();
  expect(open).not.toHaveBeenCalled();
});
it('ignores hidden controls and falls back to the visible panel switcher', async () => {
  const { guide } = setup(
    '<button data-pinned-panel="example" hidden></button><span data-dock-menu><button aria-haspopup="menu"></button></span>',
  );
  const prepared = await guide.prepare('example', new AbortController().signal);
  expect(prepared.steps[0]!.description.en).toContain('panel switcher');
  expect(prepared.steps[0]!.resolve()).toBe(document.querySelector('[aria-haspopup]'));
  document.body.replaceChildren();
  expect(prepared.steps[0]!.resolve()).toBeUndefined();
  expect(guide.availability().status).toBe('unavailable');
});
it('locates the corresponding control and respects cancellation and applicability', async () => {
  const { guide, panels } = setup(
    '<button data-pinned-panel="other"></button><button data-pinned-panel="example"></button>',
  );
  const prepared = await guide.prepare('example', new AbortController().signal);
  expect(prepared.steps[0]!.resolve()?.getAttribute('data-pinned-panel')).toBe('example');
  const controller = new AbortController();
  controller.abort();
  await expect(guide.prepare('example', controller.signal)).rejects.toThrow();
  panels.attach({ open: vi.fn(), close: vi.fn(), canOpen: () => false });
  expect(guide.availability().status).toBe('unavailable');
});
