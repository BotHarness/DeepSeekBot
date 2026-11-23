// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  readChannelDock,
} from '../src/client/channel-dock-layout.js';
import { ChannelDock } from '../src/client/channel-dock.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
} from '../src/client/channel-sidebar.js';
import {
  createDockPanelRegistry,
  dockPanelsFromEntries,
  type DockPanel,
  type DockPanelChannel,
} from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { menuItem, queryMenuItem } from './primitive-mocks.js';
import {
  createChannelDockFixture,
  entry,
  entryProps,
  mountChannelDock,
  settle,
  unmountChannelDock,
} from './support/channel-dock.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/channel-dock-primitives.js')).mockChannelDockPrimitives(),
);

let root: Root;
let host: HTMLDivElement;
let values: Map<string, string>;
const { click, panels, render, storage } = createChannelDockFixture(() => ({ root, host, values }));

beforeEach(() => {
  ({ root, host, values } = mountChannelDock());
});

afterEach(() => unmountChannelDock(root, host));

describe('desktop Bot mode dock', () => {
  const builtins = [
    entry('sessions'),
    entry('bot-inbox'),
    entry('schedules'),
    entry('members', 'channel'),
  ];

  it('opens the Channel body with Sessions and keeps Bot Inbox out of the Dock', async () => {
    await render(builtins);
    expect(host.textContent).toContain('channel body');
    expect(host.querySelector('[data-body="sessions"]')).not.toBeNull();
    expect(host.querySelector('[data-body="bot-inbox"]')).toBeNull();
    expect(host.querySelector('[data-body="schedules"]')).toBeNull();
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions']);
    expect(
      JSON.stringify(readChannelDock(storage)!.layout.grid, (key, value) =>
        key === 'size' ? undefined : value,
      ),
    ).not.toContain('bot-inbox');
    expect(host.querySelector('[data-dock-close="sessions"]')).not.toBeNull();
    expect(host.querySelector(`[data-dock-close="${CHANNEL_BODY_PANEL}"]`)).toBeNull();
    expect(host.querySelector('[data-dock-float]')).toBeNull();
  });

  it('shows an empty state for a panel the active Channel has nothing for', async () => {
    await render(builtins, 'channel');
    expect(host.querySelector('[data-body="sessions"]')).toBeNull();
    expect(host.querySelectorAll('[data-panel-empty]')).toHaveLength(1);
  });

  it('restores the saved layout after a reload', async () => {
    await render(builtins);
    await click('[data-dock-close="sessions"]');
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL]);
    act(() => root.unmount());
    root = createRoot(host);
    await render(builtins);
    expect(host.querySelector('[data-body="bot-inbox"]')).toBeNull();
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL]);
  });

  it('reopens a closed panel where it was, from the Panels menu', async () => {
    await render(builtins);
    await click('[data-dock-close="sessions"]');
    expect(readChannelDock(storage)!.parked['sessions']).toMatchObject({
      neighbor: CHANNEL_BODY_PANEL,
      direction: 'right',
    });
    await click('[data-dock-menu] button');
    await act(async () => menuItem('sessions').click());
    await settle();
    expect(
      JSON.stringify(readChannelDock(storage)!.layout.grid, (key, value) =>
        key === 'size' ? undefined : value,
      ),
    ).not.toContain('bot-inbox');
  });

  it('parks a panel whose plugin is gone and brings it back when it registers again', async () => {
    const computer = entry('computer');
    await render(builtins);
    await render([...builtins, computer]);
    await click('[data-dock-menu] button');
    await act(async () => menuItem('computer').click());
    await settle();
    expect(Object.keys(panels())).toContain('computer');
    await render(builtins);
    expect(Object.keys(panels())).not.toContain('computer');
    expect(readChannelDock(storage)!.parked['computer']).toMatchObject({
      neighbor: 'sessions',
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
    await act(async () => menuItem('重置布局').click());
    await settle();
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions']);
    expect(values.has(CHANNEL_DOCK_STORAGE_KEY)).toBe(true);
  });

  it('dismisses the open menu when its trigger is hidden without a pointer click', async () => {
    await render(builtins);
    let notifyHidden: (() => void) | undefined;
    const disconnect = vi.fn();
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private notify: () => void) {}
        observe(node: Element) {
          if (node.matches('[data-dock-menu]')) notifyHidden = this.notify;
        }
        disconnect() {
          if (this.notify === notifyHidden) disconnect();
        }
      },
    );
    await click('[data-dock-menu] button');
    expect(queryMenuItem('sessions')).not.toBeNull();
    expect(notifyHidden).toBeDefined();
    act(() => notifyHidden!());
    await settle();
    expect(queryMenuItem('sessions')).toBeNull();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(Object.keys(panels())).toEqual([CHANNEL_BODY_PANEL, 'sessions']);
    await click('[data-dock-menu] button');
    expect(queryMenuItem('sessions')).not.toBeNull();
  });
});

describe('dock entry state per Bot or Channel', () => {
  const remember =
    (part: string) =>
    ({ botSlug, channelId }: ChannelSidebarEntryProps) => {
      const [first] = useState(botSlug ?? channelId);
      return createElement('span', { [`data-remembered-${part}`]: first });
    };
  const sessions = {
    id: 'sessions',
    label: 'sessions',
    scope: 'personabot',
    component: remember('body'),
    headerAction: remember('action'),
  } satisfies ChannelSidebarEntry;
  const show = (props: Partial<ChannelSidebarEntryProps>) =>
    act(() =>
      root.render(
        createElement(ChannelDock, {
          body: createElement('section', { className: 'bh-chat-pane' }, 'channel body'),
          panels: dockPanelsFromEntries([sessions]),
          entryProps: { ...entryProps, ...props },
          shows: (candidate: ChannelSidebarEntry) => candidate.scope === 'personabot',
          t: zhTranslate,
          storage,
        }),
      ),
    );
  const remembered = () =>
    ['body', 'action'].map((part) =>
      host.querySelector(`[data-remembered-${part}]`)?.getAttribute(`data-remembered-${part}`),
    );

  it('starts a docked entry and its header action fresh when another Bot is selected', async () => {
    show({});
    await settle();
    expect(remembered()).toEqual(['ada', 'ada']);
    show({ channelId: 'dm-bob', botSlug: 'bob' });
    await settle();
    expect(remembered()).toEqual(['bob', 'bob']);
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
    headerAction: ({ channel }) =>
      createElement('button', { 'data-todo-action': channel?.id ?? 'global' }, 'Filter todo'),
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
    expect(queryMenuItem('To-do')?.textContent).toBe('To-do');
    await act(async () => menuItem('To-do').click());
    await settle();
    expect(host.querySelector('[data-todo]')?.getAttribute('data-todo')).toBe('global');
    expect(
      host
        .querySelector('[data-dock-header="example:todo"] [data-todo-action]')
        ?.getAttribute('data-todo-action'),
    ).toBe('global');
    expect(host.querySelector('[data-dock-panel="example:todo"] [data-todo-action]')).toBeNull();
    expect(registry.isOpen('example:todo')).toBe(true);
    const layout = JSON.stringify(readChannelDock(storage)!.layout.grid, (key, value) =>
      key === 'size' ? undefined : value,
    );

    act(() => root.unmount());
    root = createRoot(host);
    await render(registry.panels(), 'channel', { channel: group, registry });
    expect(host.querySelector('[data-todo]')?.getAttribute('data-todo')).toBe('global');
    expect(
      host
        .querySelector('[data-dock-header="example:todo"] [data-todo-action]')
        ?.getAttribute('data-todo-action'),
    ).toBe('global');
    expect(host.querySelector('[data-dock-panel="example:todo"] [data-todo-action]')).toBeNull();
    expect(
      JSON.stringify(readChannelDock(storage)!.layout.grid, (key, value) =>
        key === 'size' ? undefined : value,
      ),
    ).toBe(layout);
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
      host.querySelector('[data-dock-panel="example:notes"] [data-panel-empty]'),
    ).not.toBeNull();
  });

  it('toggles panels through the Service and reports what is open', async () => {
    const registry = setup();
    const seen: string[][] = [];
    registry.subscribe(() => seen.push([...registry.openPanels()]));
    await render(registry.panels(), 'personabot', { channel: dm, registry });
    expect(registry.openPanels()).toEqual(['sessions']);
    act(() => registry.toggle('sessions'));
    await settle();
    expect(registry.isOpen('sessions')).toBe(false);
    act(() => registry.toggle('sessions'));
    await settle();
    expect(registry.isOpen('sessions')).toBe(true);
    act(() => root.unmount());
    root = createRoot(host);
    expect(registry.openPanels()).toEqual([]);
    expect(seen.length).toBeGreaterThan(2);
  });
});

it('refuses a newly registered Bot-bound Panel in a Group before the registry rerenders', async () => {
  const registry = createDockPanelRegistry();
  await render(registry.panels(), 'group', {
    channel: { id: 'group-qa', type: 'group', botSlug: undefined },
    registry,
  });
  registry.register({
    id: 'new-character',
    title: 'Character',
    scope: 'channel',
    binding: 'current-bot',
    component: () => createElement('div', { 'data-new-character': '' }),
  });
  expect(registry.canOpen?.('new-character')).toBe(false);
  act(() => registry.open('new-character'));
  await settle();
  expect(host.querySelector('[data-new-character]')).toBeNull();
  await render(registry.panels(), 'personabot', {
    channel: { id: 'dm-ada', type: 'dm', botSlug: 'ada' },
    registry,
  });
  expect(registry.canOpen?.('new-character')).toBe(true);
  act(() => registry.open('new-character'));
  await settle();
  expect(host.querySelector('[data-new-character]')).not.toBeNull();
});
