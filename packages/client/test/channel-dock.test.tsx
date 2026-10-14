// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({
    open,
    anchor,
    items,
    onSelect,
  }: {
    open: boolean;
    anchor: ReactNode;
    items: { id: string; label?: ReactNode; type?: string }[];
    onSelect(id: string): void;
  }) =>
    createElement(
      'div',
      null,
      anchor,
      open
        ? items
            .filter((item) => item.type === undefined)
            .map((item) =>
              createElement(
                'button',
                { key: item.id, 'data-menu-item': item.id, onClick: () => onSelect(item.id) },
                item.label,
              ),
            )
        : null,
    ),
}));

import { ChannelDock } from '../src/client/channel-dock.js';
import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  readChannelDock,
} from '../src/client/channel-dock-layout.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  createDockPanelRegistry,
  dockPanelsFromEntries,
  type DockPanel,
  type DockPanelChannel,
  type DockPanelHost,
  type DockPanelRegistration,
} from '../src/client/dock-panels.js';

const entry = (id: string, scope: ChannelSidebarEntry['scope'] = 'personabot') =>
  ({
    id,
    label: id,
    scope,
    component: () => createElement('div', { 'data-body': id }, `body-${id}`),
  }) satisfies ChannelSidebarEntry;

const entryProps = {
  scope: 'personabot',
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: {},
  t: zhTranslate,
} as unknown as ChannelSidebarEntryProps;

let root: Root;
let host: HTMLDivElement;
let values: Map<string, string>;
const storage = {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => void values.set(key, value),
  removeItem: (key: string) => void values.delete(key),
};

async function render(
  entries: readonly ChannelSidebarEntry[] | readonly DockPanelRegistration[],
  scope = 'personabot',
  options: { channel?: DockPanelChannel; registry?: DockPanelHost } = {},
) {
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
}

const panels = () => readChannelDock(storage)!.layout.panels;

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function click(selector: string): Promise<void> {
  act(() => host.querySelector<HTMLButtonElement>(selector)!.click());
  await settle();
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  values = new Map();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('desktop Bot mode dock', () => {
  const builtins = [
    entry('sessions'),
    entry('bot-inbox'),
    entry('schedules'),
    entry('members', 'channel'),
  ];

  it('opens the Channel body with Sessions above Bot Inbox, and the rest closed', async () => {
    await render(builtins);
    expect(host.textContent).toContain('channel body');
    expect(host.querySelector('[data-body="sessions"]')).not.toBeNull();
    expect(host.querySelector('[data-body="bot-inbox"]')).not.toBeNull();
    expect(host.querySelector('[data-body="schedules"]')).toBeNull();
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions', 'bot-inbox']);
    const column = (readChannelDock(storage)!.layout.grid.root.data as { data: unknown }[])[1]!;
    expect((column.data as { data: { views: string[] } }[]).map((node) => node.data.views)).toEqual(
      [['sessions'], ['bot-inbox']],
    );
    expect(host.querySelector('[data-dock-close="sessions"]')).not.toBeNull();
    expect(host.querySelector(`[data-dock-close="${CHANNEL_BODY_PANEL}"]`)).toBeNull();
    expect(host.querySelector('[data-dock-float]')).toBeNull();
  });

  it('shows an empty state for a panel the active Channel has nothing for', async () => {
    await render(builtins, 'channel');
    expect(host.querySelector('[data-body="sessions"]')).toBeNull();
    expect(host.querySelectorAll('[data-dock-empty]')).toHaveLength(2);
  });

  it('restores the saved layout after a reload', async () => {
    await render(builtins);
    await click('[data-dock-close="bot-inbox"]');
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions']);
    act(() => root.unmount());
    root = createRoot(host);
    await render(builtins);
    expect(host.querySelector('[data-body="bot-inbox"]')).toBeNull();
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions']);
  });

  it('reopens a closed panel where it was, from the Panels menu', async () => {
    await render(builtins);
    await click('[data-dock-close="sessions"]');
    expect(readChannelDock(storage)!.parked['sessions']).toEqual({
      neighbor: 'bot-inbox',
      direction: 'above',
    });
    await click('[data-dock-menu] button');
    await click('[data-menu-item="sessions"]');
    const column = (readChannelDock(storage)!.layout.grid.root.data as { data: unknown }[])[1]!;
    expect((column.data as { data: { views: string[] } }[]).map((node) => node.data.views)).toEqual(
      [['sessions'], ['bot-inbox']],
    );
  });

  it('parks a panel whose plugin is gone and brings it back when it registers again', async () => {
    const computer = entry('computer');
    await render(builtins);
    await render([...builtins, computer]);
    await click('[data-dock-menu] button');
    await click('[data-menu-item="computer"]');
    expect(Object.keys(panels())).toContain('computer');
    await render(builtins);
    expect(Object.keys(panels())).not.toContain('computer');
    expect(readChannelDock(storage)!.parked['computer']).toMatchObject({
      neighbor: 'bot-inbox',
      direction: 'below',
      missing: true,
    });
    await render([...builtins, computer]);
    expect(Object.keys(panels())).toContain('computer');
    expect(readChannelDock(storage)!.parked['computer']).toBeUndefined();
  });

  it('resets to the default layout', async () => {
    await render(builtins);
    await click('[data-dock-close="sessions"]');
    await click('[data-dock-menu] button');
    await click('[data-menu-item="bh:dock-reset"]');
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions', 'bot-inbox']);
    expect(values.has(CHANNEL_DOCK_STORAGE_KEY)).toBe(true);
  });
});

describe('dockPanels Service in the dock', () => {
  const dm: DockPanelChannel = { id: 'dm-ada', type: 'dm', botSlug: 'ada' };
  const group: DockPanelChannel = { id: 'group-1', type: 'group', botSlug: undefined };
  const todo: DockPanel = {
    id: 'example:todo',
    title: 'To-do',
    icon: 'list-todo',
    scope: 'global',
    component: ({ channel }) =>
      createElement('div', { 'data-todo': channel?.id ?? 'global' }, 'todo body'),
  };
  const notes: DockPanel = {
    id: 'example:notes',
    title: 'Notes',
    scope: 'channel',
    defaultPosition: { zone: 'bottom' },
    component: ({ channel }) => createElement('div', { 'data-notes': channel?.id }, 'notes'),
  };

  function setup() {
    const registry = createDockPanelRegistry();
    for (const id of ['sessions', 'bot-inbox', 'schedules']) registry.registerEntry(entry(id));
    registry.register(todo);
    registry.register(notes);
    return registry;
  }

  it('lists a plugin panel in the Panels menu and keeps a global panel when the Channel changes', async () => {
    const registry = setup();
    await render(registry.panels(), 'personabot', { channel: dm, registry });
    await click('[data-dock-menu] button');
    expect(host.querySelector('[data-menu-item="example:todo"]')?.textContent).toBe('To-do');
    await click('[data-menu-item="example:todo"]');
    expect(host.querySelector('[data-todo]')?.getAttribute('data-todo')).toBe('global');
    expect(registry.isOpen('example:todo')).toBe(true);
    const layout = JSON.stringify(readChannelDock(storage)!.layout.grid);

    act(() => root.unmount());
    root = createRoot(host);
    await render(registry.panels(), 'channel', { channel: group, registry });
    expect(host.querySelector('[data-todo]')?.getAttribute('data-todo')).toBe('global');
    expect(JSON.stringify(readChannelDock(storage)!.layout.grid)).toBe(layout);
  });

  it('hands a channel panel the active Channel and opens it at its default position', async () => {
    const registry = setup();
    await render(registry.panels(), 'personabot', { channel: dm, registry });
    act(() => registry.open('example:notes'));
    await settle();
    expect(host.querySelector('[data-notes]')?.getAttribute('data-notes')).toBe('dm-ada');
    const grid = readChannelDock(storage)!.layout.grid;
    expect(grid.orientation).toBe('VERTICAL');
    const rows = (grid.root.data as { data: unknown }[]).map((node) => JSON.stringify(node));
    expect(rows.at(-1)).toContain('example:notes');
  });

  it('shows an empty state for a channel panel while no Channel is active', async () => {
    const registry = setup();
    await render(registry.panels(), 'personabot', { registry });
    act(() => registry.open('example:notes'));
    await settle();
    expect(host.querySelector('[data-notes]')).toBeNull();
    expect(
      host.querySelector('[data-dock-panel="example:notes"] [data-dock-empty]'),
    ).not.toBeNull();
  });

  it('toggles panels through the Service and reports what is open', async () => {
    const registry = setup();
    const seen: string[][] = [];
    registry.subscribe(() => seen.push([...registry.openPanels()]));
    await render(registry.panels(), 'personabot', { channel: dm, registry });
    expect(registry.openPanels()).toEqual(['sessions', 'bot-inbox']);
    act(() => registry.toggle('bot-inbox'));
    await settle();
    expect(registry.isOpen('bot-inbox')).toBe(false);
    act(() => registry.toggle('bot-inbox'));
    await settle();
    expect(registry.isOpen('bot-inbox')).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    expect(registry.openPanels()).toEqual([]);
    expect(seen.length).toBeGreaterThan(2);
  });
});
