import type { DockviewApi, SerializedDockview } from 'dockview-react';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { builtinEnvironments } from 'vitest/runtime';
import { CHANNEL_BODY_PANEL, readChannelDock } from '../src/client/channel-dock-layout.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { LAYOUT_MODE_STORAGE_KEY } from '../src/client/layout-mode.js';
import { zhTranslate } from '../src/client/locale.js';
import { WORKSPACE_CHANNELS, WorkspaceContext } from '../src/client/workspace-context.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/channel-dock-primitives.js')).mockChannelDockPrimitives(),
);

let environment: Awaited<ReturnType<typeof builtinEnvironments.jsdom.setup>>;
beforeAll(async () => {
  environment = await builtinEnvironments.jsdom.setup(globalThis, { jsdom: {} });
});
afterAll(async () => environment?.teardown(globalThis));

type GridNode = SerializedDockview['grid']['root'];

function panelGroups(node: GridNode): string[][] {
  return node.type === 'branch' ? node.data.flatMap(panelGroups) : [node.data.views];
}

async function defaultLayout(mode: 'legacy' | 'simple' | 'advanced') {
  const { act } = await import('react');
  const { ChannelDock } = await import('../src/client/channel-dock.js');
  const { createChannelDockFixture, entry, mountChannelDock, settle, unmountChannelDock } =
    await import('./support/channel-dock.js');
  const mounted = mountChannelDock();
  const { storage } = createChannelDockFixture(() => mounted);

  try {
    const registry = createDockPanelRegistry();
    for (const id of [CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS, 'activity-center']) {
      registry.register({ id, title: id, scope: 'global', component: () => null });
    }
    registry.registerEntry(entry('sessions', 'both'));
    let dock: DockviewApi | undefined;
    const view = (
      <ChannelDock
        body={<span>Messages</span>}
        entryProps={undefined}
        panels={registry.panels()}
        registry={registry}
        shows={() => true}
        storage={storage}
        t={zhTranslate}
      />
    );
    if (mode === 'legacy') {
      act(() => mounted.root.render(view));
    } else {
      storage.setItem(LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode }));
      act(() =>
        mounted.root.render(
          <WorkspaceContext.Provider
            value={{
              rail: (api) => {
                dock = api;
                return <nav />;
              },
            }}
          >
            {view}
          </WorkspaceContext.Provider>,
        ),
      );
    }
    await settle();
    const layout = mode === 'legacy' ? readChannelDock(storage)?.layout : dock?.toJSON();
    if (!layout) throw new Error(`Missing default ${mode} Dock layout`);
    return { ids: Object.keys(layout.panels), groups: panelGroups(layout.grid.root) };
  } finally {
    unmountChannelDock(mounted.root, mounted.host);
  }
}

it('preserves the default Legacy, Simple and Advanced panel layouts', async () => {
  expect({
    legacy: await defaultLayout('legacy'),
    simple: await defaultLayout('simple'),
    advanced: await defaultLayout('advanced'),
  }).toMatchInlineSnapshot(`
    {
      "advanced": {
        "groups": [
          [
            "bh:workspace-rail",
          ],
          [
            "bh:channel-body",
          ],
          [
            "bh:channels",
          ],
        ],
        "ids": [
          "bh:channel-body",
          "bh:channels",
          "bh:workspace-rail",
        ],
      },
      "legacy": {
        "groups": [
          [
            "bh:channel-body",
          ],
          [
            "sessions",
          ],
        ],
        "ids": [
          "bh:channel-body",
          "sessions",
        ],
      },
      "simple": {
        "groups": [
          [
            "bh:workspace-rail",
          ],
          [
            "bh:channels",
          ],
          [
            "bh:channel-body",
          ],
        ],
        "ids": [
          "bh:workspace-rail",
          "bh:channels",
          "bh:channel-body",
        ],
      },
    }
  `);
});
