// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { panelLayoutGuide } from '../src/client/help-panel-layout.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { createHelpService } from '../src/client/help-service.js';
import type { HelpStep } from '../src/help-api.js';
import { Orientation, type SerializedDockview } from 'dockview-react';
import {
  channelPanelLayoutState,
  createDockPanelLayoutTracker,
} from '../src/client/channel-dock-layout.js';
import {
  moveChannelSplit,
  resizeChannelSplit,
  type ChannelSplit,
} from '../src/client/channel-split-layout.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function setup(id = 'example', nested = false, bound = false) {
  document.body.innerHTML = `<main data-workspace-dock>${nested ? '<section data-channel-workspace="dm-ada">' : ''}<div ${nested ? `data-channel-leaf="${id}"` : 'class="dv-groupview"'}><header data-dock-header="${id}"></header></div>${nested ? '</section>' : ''}</main>`;
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([new DOMRect(0, 0, 400, 300)], { item: () => null }),
  );
  let rect = new DOMRect(0, 0, 400, 300);
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => rect);
  const panels = createDockPanelRegistry();
  const remove = panels.register({
    id,
    title: 'Example',
    scope: 'global',
    ...(bound ? { binding: 'current-bot' as const } : {}),
    component: () => null,
  });
  const release = vi.fn();
  let tree: ChannelSplit = {
    axis: 'horizontal',
    ratio: 0.5,
    first: { panel: 'messages' },
    second: { panel: id },
  };
  let ownerLayout: SerializedDockview = {
    panels: {},
    grid: {
      width: 800,
      height: 600,
      orientation: Orientation.HORIZONTAL,
      root: {
        type: 'branch',
        data: [
          { type: 'leaf', size: 400, data: { id: 'target', views: [id] } },
          { type: 'leaf', size: 400, data: { id: 'other', views: ['other'] } },
        ],
      },
    },
  };
  const track = createDockPanelLayoutTracker();
  panels.attach({
    layoutState: (panelId) =>
      nested ? channelPanelLayoutState(tree, panelId) : track(ownerLayout).get(panelId),
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
    movePanel() {
      if (nested) tree = moveChannelSplit(tree, id, 'messages', 'above');
      else {
        const root = ownerLayout.grid.root;
        if (Array.isArray(root.data))
          ownerLayout = {
            ...ownerLayout,
            grid: { ...ownerLayout.grid, root: { ...root, data: [...root.data].reverse() } },
          };
      }
    },
    resizePanel() {
      if (nested) tree = resizeChannelSplit(tree, '', 0.6);
      else {
        const root = ownerLayout.grid.root;
        if (Array.isArray(root.data))
          ownerLayout = {
            ...ownerLayout,
            grid: {
              ...ownerLayout.grid,
              root: {
                ...root,
                data: root.data.map((child, index) => ({ ...child, size: index ? 300 : 500 })),
              },
            },
          };
      }
    },
    resizeViewport() {
      const root = ownerLayout.grid.root;
      ownerLayout = {
        ...ownerLayout,
        grid: {
          ...ownerLayout.grid,
          width: 1000,
          height: 700,
          root: Array.isArray(root.data)
            ? {
                ...root,
                data: root.data.map((child, index) => ({ ...child, size: index ? 525 : 475 })),
              }
            : root,
        },
      };
      rect = new DOMRect(100, 100, 500, 400);
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
  expect(move!.complete!()).toBe(false);
  s.movePanel();
  expect(move!.complete!()).toBe(true);
  resize!.resolve();
  expect(resize!.complete!()).toBe(false);
  s.setRect(new DOMRect(200, 0, 500, 300));
  expect(resize!.complete!()).toBe(false);
  s.resizePanel();
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
it('uses nested docking placement and ratios rather than its outer Messages group', async () => {
  const scenario = setup('sessions', true);
  await scenario.help.start('test:practice');
  const [find, move, resize] = scenario.steps();
  expect(find!.resolve()).toBe(document.querySelector('header'));
  expect(move!.resolve()).toBe(document.querySelector('[data-channel-workspace]'));
  expect(move!.complete!()).toBe(false);
  scenario.setRect(new DOMRect(0, 100, 400, 300));
  expect(move!.complete!()).toBe(false);
  scenario.movePanel();
  expect(move!.complete!()).toBe(true);
  resize!.resolve();
  expect(resize!.complete!()).toBe(false);
  scenario.setRect(new DOMRect(0, 100, 350, 300));
  expect(resize!.complete!()).toBe(false);
  scenario.resizePanel();
  expect(resize!.complete!()).toBe(true);
  expect(scenario.steps()[4]!.resolve()).toBe(document.querySelector('[data-workspace-dock]'));
  expect(scenario.steps()[4]!.resolve()).not.toBe(
    document.querySelector('[data-channel-workspace]'),
  );
  scenario.help.cancel();
  expect(scenario.release).toHaveBeenCalledOnce();
});
it.each([false, true])(
  'does not count divider or viewport movement as a docking move (nested=%s)',
  async (nested) => {
    const scenario = setup(nested ? 'sessions' : 'example', nested);
    await scenario.help.start('test:practice');
    const move = scenario.steps()[1]!;
    move.resolve();
    scenario.resizePanel();
    scenario.setRect(new DOMRect(200, 100, 500, 350));
    expect(move.complete!()).toBe(false);
    scenario.resizeViewport();
    expect(move.complete!()).toBe(false);
    scenario.movePanel();
    expect(move.complete!()).toBe(true);
    scenario.help.cancel();
  },
);
it.each([false, true])(
  'requires an owner ratio change rather than viewport resize (nested=%s)',
  async (nested) => {
    const scenario = setup(nested ? 'sessions' : 'example', nested);
    await scenario.help.start('test:practice');
    const resize = scenario.steps()[2]!;
    resize.resolve();
    scenario.resizeViewport();
    expect(resize.complete!()).toBe(false);
    scenario.resizePanel();
    expect(resize.complete!()).toBe(true);
    scenario.help.cancel();
  },
);
it.each([false, true])(
  'does not count docking as resize and accepts a subsequent divider change (nested=%s)',
  async (nested) => {
    const scenario = setup(nested ? 'sessions' : 'example', nested);
    await scenario.help.start('test:practice');
    const resize = scenario.steps()[2]!;
    resize.resolve();
    scenario.movePanel();
    expect(resize.complete!()).toBe(false);
    scenario.resizePanel();
    expect(resize.complete!()).toBe(true);
    scenario.help.cancel();
  },
);
it('requires explicit selection when several live instances apply', async () => {
  const s = setup('example', false, true);
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
