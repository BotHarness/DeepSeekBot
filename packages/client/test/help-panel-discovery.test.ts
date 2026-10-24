// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { createHelpService } from '../src/client/help-service.js';
import { panelDiscoveryGuide } from '../src/client/help-panel-discovery.js';
import type { HelpStep } from '../src/help-api.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function setup(id = 'sessions') {
  document.body.innerHTML = '<button data-pinned-panel="bh:channel-body"></button>';
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(() =>
    Object.assign([new DOMRect(0, 0, 300, 200)], { item: () => null }),
  );
  const panels = createDockPanelRegistry();
  const remove = panels.register({
    id,
    title: id,
    scope: 'channel',
    component: () => null,
  });
  const release = vi.fn();
  let applicable = true;
  panels.attach({
    beginGuide: () => release,
    open: (target) => panels.reportOpen([target]),
    close: () => panels.reportOpen([]),
    canOpen: () => applicable,
  });
  let steps: readonly HelpStep[] = [];
  const help = createHelpService((next) => {
    steps = next;
    return () => {};
  });
  const guide = panelDiscoveryGuide(panels, panels.panels()[0]!, () =>
    help.cancel('context-changed'),
  );
  help.register({
    id: 'test:discovery',
    topics: [
      {
        id: 'test:topic',
        title: { en: 'Discovery' },
        overview: { en: '' },
        questions: [{ id: 'test:find', title: { en: 'Find' }, answer: { en: 'Find' }, guide }],
      },
    ],
  });
  return {
    panels,
    help,
    remove,
    release,
    steps: () => steps,
    setApplicable: (value: boolean) => {
      applicable = value;
    },
  };
}

it('requires the real parent and child to open, and restores visible-parent lessons too', async () => {
  const scenario = setup();
  await scenario.help.start('test:find');
  const [parent, open, inspect] = scenario.steps();
  expect(parent!.resolve()).toBe(document.querySelector('button'));
  expect(parent!.complete!()).toBe(false);
  expect(open!.complete!()).toBe(false);
  document.body.insertAdjacentHTML(
    'beforeend',
    '<header data-dock-header="bh:channel-body"><button data-help-panel-control="sessions"></button></header>',
  );
  expect(parent!.complete!()).toBe(true);
  expect(open!.resolve()?.getAttribute('data-help-panel-control')).toBe('sessions');
  scenario.panels.open('sessions');
  expect(open!.complete!()).toBe(true);
  expect(inspect!.complete!()).toBe(true);
  scenario.help.cancel();
  expect(scenario.release).toHaveBeenCalledOnce();
  await scenario.help.start('test:find');
  expect(scenario.steps()).toHaveLength(2);
  scenario.help.cancel();
  expect(scenario.release).toHaveBeenCalledTimes(2);
});

it('ends the lease when a target is removed and does not adopt its replacement', async () => {
  const scenario = setup();
  await scenario.help.start('test:find');
  scenario.remove();
  scenario.panels.register({
    id: 'sessions',
    title: 'New',
    scope: 'channel',
    component: () => null,
  });
  expect(scenario.help.state()).toMatchObject({ phase: 'idle', reason: 'context-changed' });
  expect(scenario.help.availability('test:find').status).toBe('unavailable');
  expect(scenario.release).toHaveBeenCalledOnce();
});

it.each(['members', 'bot-inbox', 'sessions'])(
  'keeps %s readable but refuses the wrong context',
  async (id) => {
    const scenario = setup(id);
    scenario.setApplicable(false);
    expect(scenario.help.search('Find')).toHaveLength(1);
    expect(scenario.help.availability('test:find')).toMatchObject({
      status: 'unavailable',
      reason: {
        en: expect.stringContaining(
          id === 'members' ? 'group' : id === 'sessions' ? 'conversation' : 'Bot',
        ),
      },
    });
    await expect(scenario.help.start('test:find')).rejects.toThrow('help_target_unavailable');
    expect(scenario.release).not.toHaveBeenCalled();
  },
);

it('releases on abort exactly once without leaving a target listener', async () => {
  const scenario = setup();
  await scenario.help.start('test:find');
  scenario.help.cancel();
  scenario.remove();
  expect(scenario.help.state().reason).toBe('closed');
  expect(scenario.release).toHaveBeenCalledOnce();
});
