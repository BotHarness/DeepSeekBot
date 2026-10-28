// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  MarkdownText: ({ text }: { text: string }) => createElement('span', null, text),
  IconChevronDownOutlineRegular: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Menu: ({ anchor }: { anchor: ReactNode }) => createElement('div', null, anchor),
}));

import type { DockviewApi } from 'dockview-react';
import { ChannelDock } from '../src/client/channel-dock.js';
import { CHANNEL_BODY_PANEL, CHANNEL_DOCK_STORAGE_KEY } from '../src/client/channel-dock-layout.js';
import type { ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';
import { createDockPanelRegistry, type DockPanelChannel } from '../src/client/dock-panels.js';
import { LAYOUT_MODE_STORAGE_KEY } from '../src/client/layout-mode.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  INACTIVE_TOB_MODE,
  TOB_MODE_STORAGE_KEY,
  readTobMode,
  writeTobMode,
} from '../src/client/tob-mode.js';
import {
  WORKSPACE_CHANNELS,
  WORKSPACE_HOME,
  WORKSPACE_RAIL,
  WorkspaceContext,
} from '../src/client/workspace-context.js';

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

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
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
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe('Tob Mode record', () => {
  it('reads inactive by default and on damaged records', () => {
    values = new Map();
    expect(readTobMode(storage)).toEqual(INACTIVE_TOB_MODE);
    values.set(TOB_MODE_STORAGE_KEY, 'not json');
    expect(readTobMode(storage)).toEqual(INACTIVE_TOB_MODE);
    values.set(TOB_MODE_STORAGE_KEY, JSON.stringify({ active: 'yes' }));
    expect(readTobMode(storage)).toEqual(INACTIVE_TOB_MODE);
  });

  it('round-trips the active state and the previous Channel', () => {
    values = new Map();
    expect(writeTobMode({ active: true, previousChannelId: 'dm-ada' }, storage)).toBe(true);
    expect(readTobMode(storage)).toEqual({ active: true, previousChannelId: 'dm-ada' });
    expect(values.has(LAYOUT_MODE_STORAGE_KEY)).toBe(false);
    expect(values.has(CHANNEL_DOCK_STORAGE_KEY)).toBe(false);
  });
});

function mountWorkspace() {
  let dock: DockviewApi | undefined;
  let layoutMode: { mode: 'simple' | 'advanced'; setMode(mode: 'simple' | 'advanced'): void };
  let tobMode: { active: boolean; setActive(active: boolean): void } | undefined;
  let channel: DockPanelChannel = { id: 'dm-ada', type: 'dm', botSlug: 'ada' };
  const opened: string[] = [];
  const registry = createDockPanelRegistry();
  for (const [id, title] of [
    [CHANNEL_BODY_PANEL, 'Messages'],
    [WORKSPACE_CHANNELS, 'Channels'],
    [WORKSPACE_HOME, 'Home'],
    ['activity-center', 'Activity'],
  ])
    registry.register({
      id: id!,
      title: title!,
      scope: 'global',
      component: () => createElement('input', { 'data-content': id, defaultValue: title }),
    });
  registry.registerEntry({
    id: 'sessions',
    label: 'sessions',
    scope: 'personabot',
    component: () => createElement('div', { 'data-body': 'sessions' }),
  });
  const openChannel = (id: string) => {
    opened.push(id);
    channel = { id, type: 'dm', botSlug: id === 'dm-tob' ? 'tob' : 'ada' };
    root.render(view());
  };
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      {
        value: {
          tob: { channel: async () => 'dm-tob', openChannel },
          rail: (api, _gap, _setGap, _reset, _order, _setOrder, _hidden, _visible, mode, tob) => {
            dock = api;
            layoutMode = mode;
            tobMode = tob;
            return createElement('nav');
          },
        },
      },
      createElement(ChannelDock, {
        body: createElement('input', { 'data-message-draft': '' }),
        panels: registry.panels(),
        registry,
        channel,
        entryProps,
        shows: () => true,
        t: zhTranslate,
        storage,
      }),
    );
  return {
    registry,
    opened,
    render: async () => {
      act(() => root.render(view()));
      await settle();
      act(() => dock!.layout(1500, 900));
      await settle();
    },
    dock: () => dock!,
    layoutMode: () => layoutMode!,
    tobMode: () => tobMode!,
    channel: () => channel,
    openChannel: async (id: string) => {
      act(() => openChannel(id));
      await settle();
    },
    shown: () =>
      dock!.groups
        .filter((group) => group.api.isVisible)
        .flatMap((group) => group.panels.map((panel) => panel.id))
        .filter((id) => id !== WORKSPACE_RAIL),
    saved: () => [values.get(LAYOUT_MODE_STORAGE_KEY), values.get(CHANNEL_DOCK_STORAGE_KEY)],
    setTob: async (active: boolean) => {
      act(() => tobMode!.setActive(active));
      await settle();
      await settle();
    },
  };
}

describe('Tob Mode in the workspace', () => {
  it('shows only Tob Messages in Simple and restores the previous view and Channel', async () => {
    values = new Map();
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.layoutMode().mode).toBe('simple');
    expect(ws.tobMode().active).toBe(false);
    act(() => ws.registry.open('activity-center'));
    await settle();
    expect(ws.shown()).toEqual(['activity-center']);
    const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
    draft.value = 'unsent message';
    const before = ws.saved();

    await ws.setTob(true);
    expect(ws.tobMode().active).toBe(true);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.channel().id).toBe('dm-tob');
    expect(ws.registry.isOpen(CHANNEL_BODY_PANEL)).toBe(true);
    expect(ws.registry.isOpen('activity-center')).toBe(false);
    expect(ws.registry.isOpen(WORKSPACE_CHANNELS)).toBe(false);
    expect(host.querySelector('[data-subpanel-column-toggle]')).not.toBeNull();
    expect(host.querySelector('[data-message-draft]')).toBe(draft);
    expect(readTobMode(storage)).toEqual({ active: true, previousChannelId: 'dm-ada' });
    expect(ws.saved()).toEqual(before);

    await ws.setTob(false);
    expect(ws.tobMode().active).toBe(false);
    expect(ws.shown()).toEqual(['activity-center']);
    expect(ws.channel().id).toBe('dm-ada');
    expect(ws.opened).toEqual(['dm-tob', 'dm-ada']);
    expect(host.querySelector('[data-message-draft]')).toBe(draft);
    expect(draft.value).toBe('unsent message');
    expect(readTobMode(storage)).toEqual(INACTIVE_TOB_MODE);
    expect(ws.saved()).toEqual(before);
  });

  it('hides the Channel list over Messages in Simple and leaves when another Channel is selected', async () => {
    values = new Map();
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.shown()).toEqual([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]);
    const before = ws.saved();
    await ws.setTob(true);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.saved()).toEqual(before);
    await ws.setTob(false);
    expect(ws.shown()).toEqual([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]);
    expect(ws.saved()).toEqual(before);

    await ws.setTob(true);
    expect(ws.channel().id).toBe('dm-tob');
    await ws.openChannel('dm-grace');
    expect(ws.tobMode().active).toBe(false);
    expect(ws.channel().id).toBe('dm-grace');
    expect(ws.shown()).toEqual([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]);
  });

  it('leaves Tob Mode when another Global panel is selected', async () => {
    values = new Map();
    const ws = mountWorkspace();
    await ws.render();
    await ws.setTob(true);
    act(() => ws.registry.toggle(WORKSPACE_HOME));
    await settle();
    expect(ws.tobMode().active).toBe(false);
    expect(ws.shown()).toEqual([WORKSPACE_HOME]);
    expect(ws.channel().id).toBe('dm-ada');
  });

  it('hides every other Global panel in Advanced without rewriting the saved arrangement', async () => {
    values = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'advanced' })]]);
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.layoutMode().mode).toBe('advanced');
    act(() => {
      ws.registry.open('activity-center');
      ws.registry.open(CHANNEL_BODY_PANEL);
      ws.dock().getPanel(WORKSPACE_CHANNELS)!.group.api.setSize({ width: 300 });
    });
    await settle();
    const panels = ws
      .dock()
      .panels.map((panel) => panel.id)
      .sort();
    expect(panels).toEqual(
      expect.arrayContaining([CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS, 'activity-center']),
    );
    const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
    draft.value = 'unsent message';
    const before = ws.saved();
    const widths = () =>
      Object.fromEntries(
        ws
          .dock()
          .groups.map((group) => [group.panels.map((panel) => panel.id).join(), group.api.width]),
      );
    const geometry = widths();

    await ws.setTob(true);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.channel().id).toBe('dm-tob');
    expect(ws.registry.isOpen(WORKSPACE_CHANNELS)).toBe(false);
    expect(ws.registry.isOpen('activity-center')).toBe(false);
    expect(host.querySelector('[data-message-draft]')).toBe(draft);
    expect(ws.saved()).toEqual(before);

    await ws.setTob(false);
    expect(ws.channel().id).toBe('dm-ada');
    expect(ws.dock().groups.every((group) => group.api.isVisible)).toBe(true);
    for (const [id, width] of Object.entries(widths()))
      expect(Math.abs(width - geometry[id]!)).toBeLessThanOrEqual(2);
    expect(host.querySelector('[data-message-draft]')).toBe(draft);
    expect(draft.value).toBe('unsent message');
    expect(ws.saved()).toEqual(before);

    await ws.setTob(true);
    act(() => ws.layoutMode().setMode('simple'));
    await settle();
    act(() => ws.dock().layout(1500, 900));
    await settle();
    expect(ws.tobMode().active).toBe(true);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    act(() => ws.layoutMode().setMode('advanced'));
    await settle();
    act(() => ws.dock().layout(1500, 900));
    await settle();
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(values.get(CHANNEL_DOCK_STORAGE_KEY)).toEqual(before[1]);

    await ws.setTob(false);
    expect(ws.tobMode().active).toBe(false);
    expect(ws.channel().id).toBe('dm-ada');
    expect(
      ws
        .dock()
        .panels.map((panel) => panel.id)
        .sort(),
    ).toEqual(panels);
    expect(ws.dock().groups.every((group) => group.api.isVisible)).toBe(true);
    for (const [id, width] of Object.entries(widths()))
      expect(Math.abs(width - geometry[id]!)).toBeLessThanOrEqual(2);
    expect(values.get(CHANNEL_DOCK_STORAGE_KEY)).toEqual(before[1]);
    expect(JSON.parse(values.get(LAYOUT_MODE_STORAGE_KEY)!)).toEqual({
      ...JSON.parse(before[0]!),
      mode: 'advanced',
    });
  });

  it('opens a closed Messages panel for Tob Mode in Advanced and closes it again on leave', async () => {
    values = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'advanced' })]]);
    const ws = mountWorkspace();
    await ws.render();
    act(() => ws.registry.open('activity-center'));
    await settle();
    act(() => ws.registry.close(CHANNEL_BODY_PANEL));
    await settle();
    expect(ws.dock().getPanel(CHANNEL_BODY_PANEL)).toBeUndefined();
    const before = ws.saved();
    await ws.setTob(true);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.saved()).toEqual(before);
    await ws.setTob(false);
    expect(ws.dock().getPanel(CHANNEL_BODY_PANEL)).toBeUndefined();
    expect(ws.dock().getPanel('activity-center')).toBeDefined();
    expect(ws.saved()).toEqual(before);
  });
});
