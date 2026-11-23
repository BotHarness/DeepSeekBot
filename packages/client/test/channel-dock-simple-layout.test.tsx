// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CHANNEL_BODY_PANEL, readChannelDock } from '../src/client/channel-dock-layout.js';
import { ChannelDock } from '../src/client/channel-dock.js';
import { createDockPanelRegistry } from '../src/client/dock-panels.js';
import { LAYOUT_MODE_STORAGE_KEY } from '../src/client/layout-mode.js';
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
const { click, storage } = createChannelDockFixture(() => ({ root, host, values }));

beforeEach(() => {
  ({ root, host, values } = mountChannelDock());
});

afterEach(() => unmountChannelDock(root, host));

it('keeps only general Channel files in the Human-only conversation column', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  values.set(LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'simple' }));
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.registerEntry(entry('sessions', 'both'));
  registry.registerEntry(entry('schedules'));
  registry.registerEntry(entry('botharness-browser'));
  let filesOpen = false;
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: { rail: () => createElement('nav') } },
      createElement(ChannelDock, {
        hasBots: false,
        body: createElement('input', { 'data-human-draft': '' }),
        files: {
          open: filesOpen,
          setOpen(open) {
            filesOpen = open;
            root.render(view());
          },
          content: createElement('div', { 'data-human-files': '' }, 'general files'),
        },
        panels: registry.panels(),
        registry,
        channel: { id: 'human-dm', type: 'dm', botSlug: undefined },
        entryProps: { ...entryProps, scope: 'channel', channelId: 'human-dm', botSlug: undefined },
        shows: () => false,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  const draft = host.querySelector<HTMLInputElement>('[data-human-draft]')!;
  draft.value = 'unsent Human message';
  await click('[data-subpanel-column-toggle]');
  expect(
    [...host.querySelectorAll('[data-subpanel-entry]')].map((node) =>
      node.getAttribute('data-subpanel-entry'),
    ),
  ).toEqual(['generated-files']);
  await click('[data-subpanel-entry="generated-files"] [data-panel-head]');
  expect(host.querySelector('[data-human-files]')?.textContent).toBe('general files');
  expect(host.querySelector('[data-human-draft]')).toBe(draft);
  expect(draft.value).toBe('unsent Human message');
});

it('switches the Simple Side column without adding panels and restores the Advanced arrangement', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS, WORKSPACE_RAIL } =
    await import('../src/client/workspace-context.js');
  values = new Map();
  let dock: import('dockview-react').DockviewApi | undefined;
  let layoutMode: { mode: 'simple' | 'advanced'; setMode(mode: 'simple' | 'advanced'): void };
  const registry = createDockPanelRegistry();
  for (const [id, title] of [
    [CHANNEL_BODY_PANEL, 'Messages'],
    [WORKSPACE_CHANNELS, 'Channels'],
    [GLOBAL_PANEL, 'Market'],
    ['activity-center', 'Activity'],
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
          rail: (api, _gap, _setGap, _reset, _order, _setOrder, _hidden, _setVisible, mode) => {
            dock = api;
            layoutMode = mode;
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
  act(() => dock!.layout(1500, 900));
  await settle();
  const shown = () =>
    dock!.groups
      .filter((group) => group.api.isVisible)
      .flatMap((group) => group.panels.map((panel) => panel.id))
      .filter((id) => id !== WORKSPACE_RAIL)
      .sort();
  expect(layoutMode!.mode).toBe('simple');
  expect(shown()).toEqual([CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS].sort());
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
  expect(registry.isOpen(GLOBAL_PANEL)).toBe(false);

  const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
  draft.value = 'unsent message';
  act(() => registry.toggle(GLOBAL_PANEL));
  await settle();
  expect(shown()).toEqual([CHANNEL_BODY_PANEL, GLOBAL_PANEL].sort());
  expect(registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
  expect(registry.isOpen(WORKSPACE_CHANNELS)).toBe(false);
  act(() => registry.toggle(GLOBAL_PANEL));
  await settle();
  expect(shown()).toEqual([CHANNEL_BODY_PANEL]);
  act(() => registry.open('activity-center'));
  await settle();
  expect(shown()).toEqual([CHANNEL_BODY_PANEL, 'activity-center'].sort());
  act(() => registry.open(CHANNEL_BODY_PANEL));
  await settle();
  expect(shown()).toEqual([CHANNEL_BODY_PANEL, 'activity-center'].sort());
  act(() => registry.open(WORKSPACE_CHANNELS));
  await settle();
  expect(shown()).toEqual([CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS].sort());
  expect(host.querySelector('[data-message-draft]')).toBe(draft);
  expect(draft.value).toBe('unsent message');
  expect(readChannelDock(storage)?.layout.panels).toEqual({});

  act(() => registry.open(GLOBAL_PANEL));
  act(() => layoutMode!.setMode('advanced'));
  await settle();
  act(() => dock!.layout(1500, 900));
  await settle();
  expect(layoutMode!.mode).toBe('advanced');
  act(() => {
    registry.open(GLOBAL_PANEL);
    registry.open(CHANNEL_BODY_PANEL);
    dock!.getPanel(WORKSPACE_CHANNELS)!.group.api.setSize({ width: 300 });
  });
  await settle();
  const advanced = readChannelDock(storage)!.layout;
  expect(Object.keys(advanced.panels)).toEqual(
    expect.arrayContaining([GLOBAL_PANEL, CHANNEL_BODY_PANEL]),
  );

  act(() => layoutMode!.setMode('simple'));
  await settle();
  act(() => dock!.layout(1500, 900));
  await settle();
  expect(shown()).toEqual([CHANNEL_BODY_PANEL, GLOBAL_PANEL].sort());
  expect(readChannelDock(storage)!.layout).toEqual(advanced);
  act(() => layoutMode!.setMode('advanced'));
  await settle();
  expect(dock!.getPanel(GLOBAL_PANEL)).toBeDefined();
  expect(dock!.getPanel(CHANNEL_BODY_PANEL)).toBeDefined();
  expect(dock!.groups.every((group) => group.api.isVisible)).toBe(true);
});

it('shows Channel subpanels as one Simple column with global collapse state', async () => {
  const { WorkspaceContext, WORKSPACE_CHANNELS } =
    await import('../src/client/workspace-context.js');
  const { readLayoutMode } = await import('../src/client/layout-mode.js');
  values = new Map();
  const registry = createDockPanelRegistry();
  for (const [id, title] of [
    [CHANNEL_BODY_PANEL, 'Messages'],
    [WORKSPACE_CHANNELS, 'Channels'],
  ])
    registry.register({ id: id!, title: title!, scope: 'global', component: () => null });
  for (const id of ['sessions', 'schedules', 'botharness-browser', 'bot-inbox'])
    registry.registerEntry(entry(id));
  registry.registerEntry(entry('members', 'channel'));
  let inboxOpen = false;
  let group = false;
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: { rail: () => createElement('nav') } },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        inbox: group
          ? undefined
          : {
              open: inboxOpen,
              setOpen: (open: boolean) => {
                inboxOpen = open;
                root.render(view());
              },
            },
        files: {
          open: false,
          setOpen: () => {},
          content: createElement('div', { 'data-files': '' }),
        },
        panels: registry.panels(),
        registry,
        channel: group
          ? { id: 'group', type: 'group', botSlug: undefined }
          : { id: 'dm', type: 'dm', botSlug: 'ada' },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  const entries = () =>
    [...host.querySelectorAll('[data-subpanel-entry]')].map((node) =>
      node.getAttribute('data-subpanel-entry'),
    );
  const toggle = host.querySelector<HTMLButtonElement>('[data-subpanel-column-toggle]')!;
  expect(toggle.getAttribute('aria-pressed')).toBe('false');
  expect(host.querySelector('[data-subpanel-column]')).toBeNull();
  expect(registry.isOpen('sessions')).toBe(false);

  await click('[data-subpanel-column-toggle]');
  expect(entries()).toEqual([
    'sessions',
    'schedules',
    'botharness-browser',
    'generated-files',
    'bot-inbox',
  ]);
  expect(host.querySelector('[data-subpanel-entry="sessions"] [data-body]')).not.toBeNull();
  expect(host.querySelector('[data-subpanel-entry="schedules"] [data-body]')).toBeNull();
  expect(registry.isOpen('sessions')).toBe(true);
  expect(readLayoutMode(storage).column.open).toBe(true);

  act(() => registry.toggle('botharness-browser'));
  await settle();
  expect(
    host.querySelector('[data-subpanel-entry="botharness-browser"] [data-body]'),
  ).not.toBeNull();
  expect(registry.isOpen('botharness-browser')).toBe(true);
  act(() => registry.toggle('botharness-browser'));
  await settle();
  expect(host.querySelector('[data-subpanel-entry="botharness-browser"] [data-body]')).toBeNull();
  expect(host.querySelector('[data-subpanel-column]')).not.toBeNull();

  await click('[data-subpanel-entry="bot-inbox"] [data-panel-head]');
  expect(inboxOpen).toBe(true);
  await click('[data-subpanel-entry="bot-inbox"] [data-panel-head]');
  expect(inboxOpen).toBe(false);

  const resize = host.querySelector<HTMLElement>(
    '[data-subpanel-entry="sessions"] .bh-subpanel-entry-resize',
  )!;
  act(() => {
    resize.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  });
  await settle();
  expect(readLayoutMode(storage).column.heights['sessions']).toBe(336);

  const header = host.querySelector<HTMLElement>(
    '[data-subpanel-entry="schedules"] .bh-subpanel-entry-header',
  )!;
  act(() => {
    header.dispatchEvent(
      new MouseEvent('contextmenu', { bubbles: true, clientX: 30, clientY: 40 }),
    );
  });
  act(() => queryMenuItem('隐藏 schedules')!.click());
  await settle();
  expect(entries()).not.toContain('schedules');

  group = true;
  act(() => root.render(view()));
  await settle();
  expect(entries()).toEqual(['sessions', 'members', 'generated-files']);
  act(() => registry.open('botharness-browser'));
  await settle();
  expect(entries()).toEqual(['sessions', 'members', 'generated-files']);
  expect(readLayoutMode(storage).column.expanded).toEqual(['sessions']);

  act(() => registry.toggle('members'));
  await settle();
  expect(host.querySelector('[data-subpanel-entry="members"] [data-body]')).not.toBeNull();
  await click('[data-subpanel-column-toggle]');
  expect(host.querySelector('[data-subpanel-column]')).toBeNull();
  expect(registry.isOpen('members')).toBe(false);
  act(() => registry.open('schedules'));
  await settle();
  expect(host.querySelector('[data-subpanel-column]')).toBeNull();
});

it('docks Session detail as a movable panel in the advanced layout and keeps it beside messages in the simple one', async () => {
  const { WorkspaceContext } = await import('../src/client/workspace-context.js');
  const registry = createDockPanelRegistry();
  registry.register({
    id: CHANNEL_BODY_PANEL,
    title: 'Messages',
    scope: 'global',
    component: () => null,
  });
  registry.registerEntry({ ...entry('sessions'), label: '会话' });
  const close = vi.fn();
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      { value: { rail: () => createElement('nav') } },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        session: {
          title: '补单元测试',
          close,
          content: createElement('div', { 'data-session-body': '' }, 'transcript'),
        },
        panels: registry.panels(),
        registry,
        channel: { id: 'ada', type: 'dm', botSlug: 'ada' },
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  act(() => root.render(view()));
  await settle();
  const docked = host.querySelector('[data-channel-subpanel="session-detail"]')!;
  expect(docked.querySelector('[data-session-body]')).not.toBeNull();
  expect(docked.querySelector('[data-panel-hide]')?.getAttribute('draggable')).toBe('true');
  expect(host.querySelector('[data-session-aside]')).toBeNull();
  const target = host.querySelector('[data-channel-leaf="messages"]')!;
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 100, 100));
  const data = new Map<string, string>();
  const transfer = {
    types: [] as string[],
    setData(type: string, value: string) {
      data.set(type, value);
      this.types.push(type);
    },
    getData: (type: string) => data.get(type) ?? '',
    effectAllowed: 'none',
    dropEffect: 'none',
  };
  const dragEvent = (type: string, x = 0, y = 0) =>
    Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }), {
      dataTransfer: transfer,
    });
  act(() => {
    docked.querySelector('[data-panel-hide]')!.dispatchEvent(dragEvent('dragstart'));
  });
  act(() => {
    target.dispatchEvent(dragEvent('dragover', 5, 50));
    target.dispatchEvent(dragEvent('drop', 5, 50));
  });
  await settle();
  const tree = readChannelDock(storage)?.channelSplits?.ada;
  expect(JSON.stringify(tree)).toContain('"first":{"panel":"session-detail"}');
  act(() => root.unmount());
  root = createRoot(host);
  values.set(LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'simple' }));
  act(() => root.render(view()));
  await settle();
  expect(host.querySelector('[data-session-aside] [data-session-body]')).not.toBeNull();
  expect(host.querySelector('[data-channel-subpanel="session-detail"]')).toBeNull();
});
