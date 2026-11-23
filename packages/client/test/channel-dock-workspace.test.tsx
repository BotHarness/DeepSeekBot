// @vitest-environment jsdom
import { act, createElement, type ContextType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  readChannelDock,
} from '../src/client/channel-dock-layout.js';
import { ChannelDock } from '../src/client/channel-dock.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { zhTranslate } from '../src/client/locale.js';
import { queryMenuItem } from './primitive-mocks.js';
import {
  createChannelDockFixture,
  entry,
  entryProps,
  GLOBAL_PANEL,
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
const { storage } = createChannelDockFixture(() => ({ root, host, values }));

beforeEach(() => {
  ({ root, host, values } = mountChannelDock());
});

afterEach(() => unmountChannelDock(root, host));

it('keeps live portal content during rail/panel movement and remembers a closed Messages panel', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  const { moveWorkspaceRail } = await import('../src/client/workspace-layout.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    icon: 'messages-square',
    scope: 'global',
    component: () => null,
  });
  registry.register({
    id: WORKSPACE_CHANNELS,
    title: 'Channels',
    scope: 'global',
    component: () => createElement('input', { 'data-roster-search': '' }),
  });
  let api: import('dockview-react').DockviewApi | undefined;
  const workspace = {
    rail: (current: import('dockview-react').DockviewApi) => {
      api = current;
      return createElement('nav');
    },
  };
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        panels: registry.panels(),
        registry,
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  expect(host.querySelector('[data-dock-close]')).toBeNull();
  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  const search = host.querySelector<HTMLInputElement>('[data-roster-search]')!;
  draft.value = 'unsent draft';
  search.value = 'Ada';
  act(() => moveWorkspaceRail(api!, 'right'));
  await settle();
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(host.querySelector('[data-roster-search]')).toBe(search);
  act(() =>
    api!
      .getPanel(WORKSPACE_CHANNELS)!
      .api.moveTo({ group: api!.getPanel(CHANNEL_BODY_PANEL)!.group, position: 'right' }),
  );
  await settle();
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(search.value).toBe('Ada');
  act(() => registry.close(CHANNEL_BODY_PANEL));
  await settle();
  expect(host.querySelector('[data-message-draft]')).toBeNull();
  expect(readChannelDock(storage)?.layout.panels[CHANNEL_BODY_PANEL]).toBeUndefined();
  act(() => root.render(null));
  await settle();
  act(() => root.render(view()));
  await settle();
  expect(host.querySelector('[data-message-draft]')).toBeNull();
  act(() => registry.open(CHANNEL_BODY_PANEL));
  await settle();
  expect(host.querySelectorAll('[data-message-draft]')).toHaveLength(1);
  act(() => {
    registry.close(CHANNEL_BODY_PANEL);
    registry.close(WORKSPACE_CHANNELS);
  });
  await settle();
  act(() => root.render(null));
  await settle();
  act(() => root.render(view()));
  await settle();
  expect(registry.openPanels()).toEqual([]);
  act(() => registry.open(CHANNEL_BODY_PANEL));
  await settle();
  expect(host.querySelectorAll('[data-message-draft]')).toHaveLength(1);
});

it('persists hidden rail controls, closes only the hidden Panel and supports header close', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.register({
    id: WORKSPACE_CHANNELS,
    title: 'Channels',
    scope: 'global',
    component: () => createElement('input', { 'data-roster-search': '' }),
  });
  let hidden: readonly string[] = [];
  let visible: (id: string, shown: boolean) => void = () => {};
  const workspace: NonNullable<ContextType<typeof WorkspaceContext>> = {
    rail: (_api, _gap, _setGap, _reset, _order, _setOrder, ids, setVisible) => {
      hidden = ids;
      visible = setVisible;
      return createElement('nav');
    },
  };
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        panels: registry.panels(),
        registry,
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  draft.value = 'keep this';
  act(() => visible(WORKSPACE_CHANNELS, false));
  await settle();
  expect(hidden).toEqual([WORKSPACE_CHANNELS]);
  expect(host.querySelector('[data-roster-search]')).toBeNull();
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(draft.value).toBe('keep this');
  expect(readChannelDock(storage)?.hiddenControls).toEqual([WORKSPACE_CHANNELS]);
  act(() => root.render(null));
  await settle();
  act(() => root.render(view()));
  await settle();
  expect(hidden).toEqual([WORKSPACE_CHANNELS]);
  expect(host.querySelector('[data-roster-search]')).toBeNull();
  act(() => visible(WORKSPACE_CHANNELS, true));
  await settle();
  expect(hidden).toEqual([]);
  expect(host.querySelector('[data-roster-search]')).toBeNull();
  act(() => registry.open(WORKSPACE_CHANNELS));
  await settle();
  const title = () =>
    host.querySelector<HTMLButtonElement>(
      `[data-dock-header="${WORKSPACE_CHANNELS}"] [data-panel-hide]`,
    )!;
  act(() => {
    title().dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 30, clientY: 40 }),
    );
    title().dispatchEvent(
      new MouseEvent('pointermove', { bubbles: true, clientX: 100, clientY: 40 }),
    );
    title().dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1, clientX: 30, clientY: 40 }),
    );
  });
  expect(registry.isOpen(WORKSPACE_CHANNELS)).toBe(true);
  act(() => title().click());
  await settle();
  expect(registry.isOpen(WORKSPACE_CHANNELS)).toBe(false);
  expect(readChannelDock(storage)?.hiddenControls).toEqual([]);
  act(() => registry.open(WORKSPACE_CHANNELS));
  await settle();
  const header = host.querySelector<HTMLElement>(`[data-dock-header="${WORKSPACE_CHANNELS}"]`)!;
  act(() => {
    header.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 }),
    );
  });
  act(() => queryMenuItem('关闭 Channels')!.click());
  await settle();
  expect(registry.isOpen(WORKSPACE_CHANNELS)).toBe(false);
  expect(readChannelDock(storage)?.hiddenControls).toEqual([]);
});

it('imports fallback panel sizes when workspace ownership is enabled after mounting', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.register({ id: 'sessions', title: 'Sessions', scope: 'global', component: () => null });
  const view = (enabled: boolean) =>
    createElement(
      WorkspaceContext.Provider,
      { value: enabled ? { rail: () => createElement('nav') } : undefined },
      createElement(ChannelDock, {
        body: createElement('div'),
        panels: registry.panels(),
        registry,
        channel: { id: 'dm', type: 'dm', botSlug: 'ada' },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view(false)));
  await settle();
  const fallback = readChannelDock(storage)!;
  const nodes = fallback.layout.grid.root.data as { size: number }[];
  nodes[0]!.size = 570;
  nodes[1]!.size = 430;
  storage.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify(fallback));
  act(() => root.render(view(true)));
  await settle();
  expect(readChannelDock(storage)?.sessionSeed?.ratio).toBeCloseTo(0.43);
  expect(host.querySelector('[data-workspace-dock]')).not.toBeNull();
});

it('routes Sessions through its parent, remembers each Channel and preserves content on rearrangement', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.registerEntry({ ...entry('sessions'), label: '会话' });
  const botOnly = [
    'memory-files',
    'memory-evolution',
    'schedules',
    'botharness-browser',
    'botharness-computer',
  ];
  for (const id of botOnly) registry.registerEntry(entry(id));
  const workspace = { rail: () => createElement('nav') };
  const view = (id: string) =>
    createElement(
      WorkspaceContext.Provider,
      { value: workspace },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        panels: registry.panels(),
        registry,
        channel: {
          id,
          type: id === 'group' ? 'group' : 'dm',
          botSlug: id === 'group' ? undefined : id,
        },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view('ada')));
  await settle();
  expect(readChannelDock(storage)?.layout.panels.sessions).toBeUndefined();
  expect(registry.isOpen('sessions')).toBe(true);
  const draft = host.querySelector('[data-message-draft]');
  const session = host.querySelector('[data-body="sessions"]');
  const separator = host.querySelector('[role="separator"][aria-label="会话"]')!;
  act(() => {
    separator.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  });
  await settle();
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(host.querySelector('[data-body="sessions"]')).toBe(session);
  expect(readChannelDock(storage)?.channelSplits?.ada).toMatchObject({
    ratio: expect.closeTo(0.68),
  });
  act(() => registry.close(CHANNEL_BODY_PANEL));
  await settle();
  expect(registry.isOpen('sessions')).toBe(false);
  act(() => registry.toggle('sessions'));
  await settle();
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
  expect(registry.isOpen('sessions')).toBe(true);
  expect(readChannelDock(storage)?.channelSplits?.ada).toMatchObject({
    ratio: expect.closeTo(0.68),
  });
  act(() => registry.toggle('sessions'));
  await settle();
  expect(registry.isOpen('sessions')).toBe(false);
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
  for (const id of botOnly) {
    expect(registry.canOpen?.(id)).toBe(true);
    act(() => registry.open(id));
  }
  await settle();
  act(() => root.render(view('group')));
  await settle();
  expect(registry.isOpen('sessions')).toBe(true);
  for (const id of botOnly) {
    expect(registry.canOpen?.(id)).toBe(false);
    act(() => registry.open(id));
    expect(registry.isOpen(id)).toBe(false);
  }
  act(() => root.render(view('ada')));
  await settle();
  expect(registry.isOpen('sessions')).toBe(false);
  act(() => root.render(null));
  await settle();
  act(() => root.render(view('ada')));
  await settle();
  expect(registry.isOpen('sessions')).toBe(false);
  expect(readChannelDock(storage)?.channelSplits?.ada).toMatchObject({
    ratio: expect.closeTo(0.68),
  });
  act(() => registry.close(CHANNEL_BODY_PANEL));
  await settle();
  act(() => root.render(null));
  await settle();
  act(() => root.render(view('ada')));
  await settle();
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(false);
  expect(registry.isOpen('sessions')).toBe(false);
  act(() => registry.toggle('sessions'));
  await settle();
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
  expect(registry.isOpen('sessions')).toBe(true);
  const context = () => host.querySelector('[data-dock-header="bh:channel-body"]')!;
  act(() => {
    context().dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 40, clientY: 30 }),
    );
  });
  await settle();
  const item = queryMenuItem('会话')!;
  expect(item).not.toBeNull();
  act(() => item.click());
  await settle();
  expect(registry.isOpen('sessions')).toBe(false);
  expect(readChannelDock(storage)?.channelWorkspaces?.ada?.hiddenControl).toBe(true);
  expect(context().querySelector('button[aria-label="会话"]')).toBeNull();
  act(() => root.render(null));
  await settle();
  act(() => root.render(view('ada')));
  await settle();
  expect(context().querySelector('button[aria-label="会话"]')).toBeNull();
  act(() => {
    context().dispatchEvent(
      new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
    );
  });
  await settle();
  act(() => queryMenuItem('会话')!.click());
  await settle();
  expect(readChannelDock(storage)?.channelWorkspaces?.ada?.hiddenControl).toBe(false);
  expect(context().querySelector('button[aria-label="会话"]')).not.toBeNull();
  expect(registry.isOpen('sessions')).toBe(false);
  for (const id of botOnly) {
    act(() => registry.open(id));
    await settle();
    expect(
      host.querySelector(`[data-channel-subpanel="${id}"] [data-body="${id}"]`),
    ).not.toBeNull();
    expect(readChannelDock(storage)?.layout.panels[id]).toBeUndefined();
    const body = host.querySelector(`[data-body="${id}"]`);
    const divider = host
      .querySelector(`[data-channel-leaf="${id}"]`)!
      .closest('.bh-channel-branch')!
      .parentElement!.querySelector(':scope > [role="separator"]')!;
    act(() => {
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    await settle();
    expect(host.querySelector(`[data-body="${id}"]`)).toBe(body);
    const savedTree = readChannelDock(storage)?.channelSplits?.ada;
    expect(divider.getAttribute('aria-valuenow')).toBe('68');
    act(() => registry.close(CHANNEL_BODY_PANEL));
    await settle();
    act(() => registry.toggle(id));
    await settle();
    expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
    expect(registry.isOpen(id)).toBe(true);
    act(() => registry.toggle(id));
    await settle();
    expect(registry.isOpen(id)).toBe(false);
    expect(readChannelDock(storage)?.channelSplits?.ada).toEqual(savedTree);
    act(() => registry.open(id));
    await settle();
    expect(
      host
        .querySelector(`[data-channel-leaf="${id}"]`)!
        .closest('.bh-channel-branch')!
        .parentElement!.querySelector(':scope > [role="separator"]')
        ?.getAttribute('aria-valuenow'),
    ).toBe('68');
    act(() => registry.close(id));
    await settle();
  }
  act(() => root.render(view('bob')));
  await settle();
  for (const id of botOnly) {
    expect(registry.isOpen(id)).toBe(false);
    act(() => registry.open(id));
  }
  await settle();
  act(() => root.render(view('ada')));
  await settle();
  for (const id of botOnly) expect(registry.isOpen(id)).toBe(false);
  act(() => root.render(null));
  await settle();
  act(() => root.render(view('bob')));
  await settle();
  for (const id of botOnly) expect(registry.isOpen(id)).toBe(true);
});

it('does not reapply Dockview options while geometry changes', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  let dock: import('dockview-react').DockviewApi | undefined;
  let changeGap: (value: number) => void = () => {};
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.register({
    id: WORKSPACE_CHANNELS,
    title: 'Channels',
    scope: 'global',
    component: () => null,
  });
  const workspace: NonNullable<ContextType<typeof WorkspaceContext>> = {
    rail: (api, _gap, setGap) => {
      dock = api;
      changeGap = setGap;
      return createElement('nav');
    },
  };
  act(() =>
    root.render(
      createElement(
        WorkspaceContext.Provider,
        { value: workspace },
        createElement(ChannelDock, {
          body: createElement('div'),
          panels: registry.panels(),
          registry,
          entryProps,
          shows: () => true,
          t: zhTranslate,
          storage,
        }),
      ),
    ),
  );
  await settle();
  const update = vi.spyOn(dock!, 'updateOptions');
  act(() => dock!.layout(1200, 800));
  await settle();
  act(() => dock!.getPanel(WORKSPACE_CHANNELS)!.group.api.setSize({ width: 370 }));
  await settle();
  expect(update).not.toHaveBeenCalled();
  act(() => changeGap(12));
  await settle();
  expect(update).toHaveBeenCalledWith(
    expect.objectContaining({ theme: expect.objectContaining({ gap: 12 }) }),
  );
});

it('restores a global panel and nested global panel geometry without remounting surviving content', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  let dock: import('dockview-react').DockviewApi | undefined;
  const registry = createDockPanelRegistry();
  for (const [id, title] of [
    [CHANNEL_BODY_PANEL, 'Messages'],
    [WORKSPACE_CHANNELS, 'Channels'],
    [GLOBAL_PANEL, 'Market'],
    ['computer', 'Computer'],
  ])
    registry.register({
      id: id!,
      title: title!,
      scope: 'global',
      component: () => createElement('input', { 'data-content': id, defaultValue: title }),
    });
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      {
        value: {
          rail: (api) => {
            dock = api;
            return createElement('nav');
          },
        },
      },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        panels: registry.panels(),
        registry,
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  act(() => {
    dock!.layout(1500, 900);
    registry.open(GLOBAL_PANEL);
    registry.open(CHANNEL_BODY_PANEL);
    dock!.getPanel(CHANNEL_BODY_PANEL)!.api.moveTo({ position: 'right' });
    registry.open('computer');
  });
  await settle();
  act(() => {
    dock!.getPanel('computer')!.api.moveTo({
      group: dock!.getPanel(CHANNEL_BODY_PANEL)!.group,
      position: 'bottom',
    });
    dock!.getPanel(WORKSPACE_CHANNELS)!.group.api.setSize({ width: 265 });
    dock!.getPanel(GLOBAL_PANEL)!.group.api.setSize({ width: 550 });
    dock!.getPanel('computer')!.group.api.setSize({ height: 330 });
  });
  await settle();
  const grid = () =>
    JSON.parse(
      JSON.stringify(dock!.toJSON().grid, (_key, value) =>
        typeof value === 'number' ? Math.round(value * 1e6) / 1e6 : value,
      ),
    );
  const before = grid();
  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  draft.value = 'unsent message';
  const computer = dock!.getPanel('computer');
  act(() => registry.close(GLOBAL_PANEL));
  await settle();
  expect(registry.isOpen(GLOBAL_PANEL)).toBe(false);
  act(() => registry.open(GLOBAL_PANEL));
  await settle();
  expect(grid()).toEqual(before);
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(draft.value).toBe('unsent message');
  expect(dock!.getPanel('computer')).toBe(computer);

  act(() => {
    registry.close(GLOBAL_PANEL);
    registry.close(CHANNEL_BODY_PANEL);
    registry.open(GLOBAL_PANEL);
    registry.open(CHANNEL_BODY_PANEL);
  });
  await settle();
  expect(grid()).toEqual(before);

  act(() => registry.close(GLOBAL_PANEL));
  await settle();
  expect(readChannelDock(storage)?.visibilityLayout).toBeDefined();
  act(() => root.unmount());
  root = createRoot(host);
  act(() => root.render(view()));
  await settle();
  act(() => {
    dock!.layout(1500, 900);
    registry.open(GLOBAL_PANEL);
  });
  await settle();
  expect(grid()).toEqual(before);
  expect(readChannelDock(storage)?.visibilityLayout).toBeUndefined();
  act(() => registry.close(GLOBAL_PANEL));
  await settle();
  const fromJSON = dock!.fromJSON.bind(dock!);
  const restore = vi.spyOn(dock!, 'fromJSON').mockImplementationOnce((layout, options) => {
    fromJSON(layout, options);
    throw Error('restore interrupted after partial mutation');
  });
  act(() => registry.open(GLOBAL_PANEL));
  await settle();
  expect(dock!.panels.filter((x) => x.id === GLOBAL_PANEL)).toHaveLength(1);
  expect(dock!.getPanel(CHANNEL_BODY_PANEL)).toBeDefined();
  expect(readChannelDock(storage)?.visibilityLayout).toBeUndefined();
  restore.mockRestore();
});

it('keeps a newly resized column when a hidden lower panel is reopened', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  let dock: import('dockview-react').DockviewApi | undefined;
  const registry = createDockPanelRegistry();
  for (const id of [CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS, GLOBAL_PANEL])
    registry.register({ id, title: id, scope: 'global', component: () => createElement('div') });
  act(() =>
    root.render(
      createElement(
        WorkspaceContext.Provider,
        {
          value: {
            rail: (api) => {
              dock = api;
              return createElement('nav');
            },
          },
        },
        createElement(ChannelDock, {
          body: createElement('div'),
          panels: registry.panels(),
          registry,
          entryProps,
          shows: () => true,
          t: zhTranslate,
          storage,
        }),
      ),
    ),
  );
  await settle();
  act(() => {
    dock!.layout(1500, 900);
    registry.open(GLOBAL_PANEL);
    registry.open(CHANNEL_BODY_PANEL);
    dock!.getPanel(CHANNEL_BODY_PANEL)!.api.moveTo({
      group: dock!.getPanel(GLOBAL_PANEL)!.group,
      position: 'bottom',
    });
    dock!.getPanel(WORKSPACE_CHANNELS)!.group.api.setSize({ width: 500 });
  });
  await settle();
  act(() => registry.close(CHANNEL_BODY_PANEL));
  await settle();
  act(() => {
    host.querySelector('.dv-sash')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    dock!.getPanel(WORKSPACE_CHANNELS)!.group.api.setSize({ width: 280 });
    window.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
  });
  await settle();
  const width = dock!.getPanel(WORKSPACE_CHANNELS)!.group.width;
  expect(readChannelDock(storage)?.visibilityLayout).toBeUndefined();
  act(() => registry.open(CHANNEL_BODY_PANEL));
  await settle();
  expect(Math.abs(dock!.getPanel(WORKSPACE_CHANNELS)!.group.width - width)).toBeLessThanOrEqual(4);
});
