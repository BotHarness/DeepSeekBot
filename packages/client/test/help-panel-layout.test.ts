// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { panelLayoutGuide } from '../src/client/help-panel-layout.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { createHelpService } from '../src/client/help-service.js';
import type { HelpStep } from '../src/help-api.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup() {
  document.body.innerHTML =
    '<main data-workspace-dock><div class="dv-groupview"><header data-dock-header="example"></header></div></main>';
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([new DOMRect(0, 0, 400, 300)], { item: () => null }),
  );
  let rect = new DOMRect(0, 0, 400, 300);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => rect);
  const panels = createDockPanelRegistry();
  const remove = panels.register({
    id: 'example',
    title: 'Example',
    scope: 'global',
    binding: 'current-bot',
    component: () => null,
  });
  const release = vi.fn();
  panels.attach({
    beginGuide: () => release,
    open: (id) => panels.reportOpen([id]),
    close: () => panels.reportOpen([]),
    canOpen: () => true,
  });
  let steps: readonly HelpStep[] = [];
  const help = createHelpService((next) => {
    steps = next;
    return () => {};
  });
  const guide = panelLayoutGuide(panels, panels.panels()[0]!, () => help.cancel('context-changed'));
  help.register({
    id: 'test:layout',
    topics: [
      {
        id: 'test:topic',
        title: { en: 'Layout' },
        overview: { en: '' },
        questions: [
          { id: 'test:practice', title: { en: 'Practice' }, answer: { en: 'Practice' }, guide },
        ],
      },
    ],
  });
  return {
    panels,
    help,
    remove,
    release,
    steps: () => steps,
    setRect: (value: DOMRect) => {
      rect = value;
    },
  };
}
it('gates each real layout operation and releases presentation exactly once on cancellation', async () => {
  const s = setup();
  await s.help.start('test:practice');
  const [find, move, resize, hide, reopen] = s.steps();
  expect(find!.resolve()).toBe(document.querySelector('header'));
  move!.resolve();
  expect(move!.complete!()).toBe(false);
  s.setRect(new DOMRect(200, 0, 400, 300));
  expect(move!.complete!()).toBe(true);
  resize!.resolve();
  expect(resize!.complete!()).toBe(false);
  s.setRect(new DOMRect(200, 0, 500, 300));
  expect(resize!.complete!()).toBe(true);
  expect(hide!.complete!()).toBe(false);
  s.panels.close('example');
  expect(hide!.complete!()).toBe(true);
  expect(reopen!.complete!()).toBe(false);
  s.panels.open('example');
  expect(reopen!.complete!()).toBe(true);
  s.help.cancel();
  s.help.cancel();
  expect(s.release).toHaveBeenCalledTimes(1);
});
it('ends a running lesson when its registered target is removed', async () => {
  const s = setup();
  await s.help.start('test:practice');
  s.remove();
  expect(s.help.state()).toMatchObject({ phase: 'idle', reason: 'context-changed' });
  expect(s.release).toHaveBeenCalledTimes(1);
});
it('requires explicit selection when several live instances apply', async () => {
  const s = setup();
  const instanceId = s.panels.createInstance('example', 'bot-a', 'Bot A');
  expect(s.help.availability('test:practice')).toMatchObject({
    status: 'select',
    targets: [{ id: 'example' }, { id: instanceId }],
  });
  await expect(s.help.start('test:practice')).rejects.toThrow();
  await s.help.start('test:practice', instanceId);
  expect(s.panels.isOpen(instanceId)).toBe(true);
  s.help.cancel();
});
