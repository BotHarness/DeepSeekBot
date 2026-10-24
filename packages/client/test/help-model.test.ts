import { expect, it, vi } from 'vitest';
import { modelHelp } from '../src/client/help-model.js';
import { createHelpService } from '../src/client/help-service.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import type { BridgeActions } from '../src/client/actions.js';

vi.mock('../src/client/store.js', () => ({
  store: { getSnapshot: () => ({ bots: [{ slug: 'bot-a', displayName: 'Example' }] }) },
}));
vi.mock('../src/client/channel-sidebar.js', () => ({
  resolveChannelSidebarContext: () => ({ botSlug: 'bot-a' }),
}));

it('restores the layout immediately when cancelled during a pending model read', async () => {
  let finish!: (value: undefined) => void;
  const release = vi.fn();
  const present = vi.fn(() => () => {});
  const help = createHelpService(present);
  const panels = createDockPanelRegistry();
  panels.attach({ open: vi.fn(), close: vi.fn(), beginGuide: () => release });
  const actions = {
    modelPlanState: () =>
      new Promise<undefined>((resolve) => {
        finish = resolve;
      }),
  } as unknown as BridgeActions;
  help.register(modelHelp(help, panels, actions, (key) => key));
  const started = help.start('botharness:change-model');
  expect(help.state().phase).toBe('preparing');
  help.cancel('context-changed');
  expect(release).toHaveBeenCalledTimes(1);
  expect(help.state().phase).toBe('idle');
  finish(undefined);
  await started;
  expect(release).toHaveBeenCalledTimes(1);
  expect(present).not.toHaveBeenCalled();
});
