import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { vi } from 'vitest';
import { ChannelDock } from '../../src/client/channel-dock.js';
import {
  readChannelDock,
  type ChannelDockStorage,
  type StoredChannelDock,
} from '../../src/client/channel-dock-layout.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../../src/client/channel-sidebar.js';
import {
  dockPanelsFromEntries,
  type DockPanelChannel,
  type DockPanelHost,
  type DockPanelRegistration,
} from '../../src/client/dock-panels.js';
import { LAYOUT_MODE_STORAGE_KEY } from '../../src/client/layout-mode.js';
import { zhTranslate } from '../../src/client/locale.js';

export const GLOBAL_PANEL: 'market' = 'market';

export const entry = (
  id: string,
  scope: ChannelSidebarEntry['scope'] = 'personabot',
): ChannelSidebarEntry =>
  ({
    id,
    label: id,
    scope,
    component: () => createElement('div', { 'data-body': id }, `body-${id}`),
  }) satisfies ChannelSidebarEntry;

export const entryProps: ChannelSidebarEntryProps = {
  scope: 'personabot',
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: {},
  t: zhTranslate,
} as unknown as ChannelSidebarEntryProps;

interface ChannelDockEnvironment {
  root: Root;
  host: HTMLDivElement;
  values: Map<string, string>;
}

interface ChannelDockFixture {
  storage: ChannelDockStorage;
  render(
    entries: readonly ChannelSidebarEntry[] | readonly DockPanelRegistration[],
    scope?: string,
    options?: { channel?: DockPanelChannel; registry?: DockPanelHost },
  ): Promise<void>;
  panels(): StoredChannelDock['layout']['panels'];
  click(selector: string): Promise<void>;
}

export function createChannelDockFixture(
  environment: () => ChannelDockEnvironment,
): ChannelDockFixture {
  const storage: ChannelDockStorage = {
    getItem: (key: string) => environment().values.get(key) ?? null,
    setItem: (key: string, value: string) => void environment().values.set(key, value),
    removeItem: (key: string) => void environment().values.delete(key),
  };

  const render: ChannelDockFixture['render'] = async (
    entries,
    scope = 'personabot',
    options = {},
  ) => {
    const { root } = environment();
    const panels = entries.every((item) => 'title' in item)
      ? (entries as readonly DockPanelRegistration[])
      : dockPanelsFromEntries(entries as readonly ChannelSidebarEntry[]);
    act(() =>
      root.render(
        createElement(ChannelDock, {
          body: createElement('section', { className: 'bh-chat-pane' }, 'channel body'),
          panels,
          channel: options.channel,
          registry: options.registry,
          entryProps,
          shows: (candidate: ChannelSidebarEntry) => candidate.scope === scope,
          t: zhTranslate,
          storage,
        }),
      ),
    );
    await settle();
  };

  const panels = () => readChannelDock(storage)!.layout.panels;

  async function click(selector: string): Promise<void> {
    const { host } = environment();
    act(() => host.querySelector<HTMLButtonElement>(selector)!.click());
    await settle();
  }

  return { storage, render, panels, click };
}

export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function mountChannelDock(): ChannelDockEnvironment {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  const values = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'advanced' })]]);
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  return { root, host, values };
}

export function unmountChannelDock(root: Root, host: HTMLDivElement): void {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
}
