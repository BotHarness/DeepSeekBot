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
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client';
import { effectiveShortcuts } from '@deepseek-ai/dsh-client-shortcuts/protocol';
import {
  INACTIVE_TOB_MODE,
  TOB_MODE_STORAGE_KEY,
  createTobModeControl,
  readTobMode,
  writeTobMode,
} from '../src/client/tob-mode.js';
import {
  TOB_MODE_SLOT,
  WORKSPACE_CHANNELS,
  WORKSPACE_RAIL,
  WorkspaceContext,
} from '../src/client/workspace-context.js';
import {
  registerWorkspaceShortcuts,
  workspaceShortcutId,
} from '../src/client/workspace-shortcuts.js';
import { PinnedPanelCards } from '../src/client/pinned-panel-cards.js';

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

function mountWorkspace(control?: ReturnType<typeof createTobModeControl>) {
  let dock: DockviewApi | undefined;
  let layoutMode: { mode: 'simple' | 'advanced'; setMode(mode: 'simple' | 'advanced'): void };
  let tobMode: { active: boolean; setActive(active: boolean): void } | undefined;
  let channel: DockPanelChannel = { id: 'dm-ada', type: 'dm', botSlug: 'ada' };
  const opened: string[] = [];
  const registry = createDockPanelRegistry();
  for (const [id, title] of [
    [CHANNEL_BODY_PANEL, 'Messages'],
    [WORKSPACE_CHANNELS, 'Channels'],
    ['market', 'Market'],
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
          tob: { channel: async () => 'dm-tob', openChannel, control },
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
    act(() => ws.registry.toggle('market'));
    await settle();
    expect(ws.tobMode().active).toBe(false);
    expect(ws.shown()).toEqual(['market']);
    expect(ws.channel().id).toBe('dm-ada');
  });

  it('hides every other Global panel in Advanced without rewriting the saved arrangement', async () => {
    values = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'advanced' })]]);
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.layoutMode().mode).toBe('advanced');
    act(() => {
      ws.registry.open('market');
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

describe('Tob Mode takes over the Home command and rail slot', () => {
  it('keeps the Home command ID and default keys, and toggles Tob Mode', async () => {
    values = new Map();
    const control = createTobModeControl();
    const commands = new Map<string, ShortcutCommand>();
    const registry = createDockPanelRegistry();
    const dispose = registerWorkspaceShortcuts(
      {
        register: (command) => {
          commands.set(command.id, command);
          return () => void commands.delete(command.id);
        },
      },
      registry,
      () => true,
      zhTranslate,
      control,
    );
    const id = workspaceShortcutId(TOB_MODE_SLOT);
    expect(id).toBe('botharness.panel.p62-68-3a-68-6f-6d-65');
    const command = commands.get(id)!;
    expect(command.defaults['desktop:macos']).toEqual({
      code: 'KeyH',
      modifiers: ['primary', 'alt', 'shift'],
    });
    expect(command.defaults['web:windows']?.code).toBe('KeyH');
    expect(command.defaults['desktop:linux']?.code).toBe('KeyO');
    expect(command.label()).toBe(zhTranslate('workspace.tobMode', { name: '托布' }));
    const context = { region: 'page' as const, modal: null, target: null };
    expect(command.resolve(context)).toEqual({ status: 'pass' });

    const custom = { code: 'KeyJ', modifiers: ['meta', 'alt', 'shift'] as const };
    const resolved = effectiveShortcuts(
      [...commands.values()],
      { schemaVersion: 2, profiles: { 'desktop:macos': { [id]: custom } } },
      'desktop',
      'macos',
    ).find((row) => row.id === id);
    expect(resolved).toMatchObject({ modified: true, binding: { code: 'KeyJ' }, conflicts: [] });

    const entered = vi.fn();
    control.onEnter(entered);
    const ws = mountWorkspace(control);
    await ws.render();
    const run = async () => {
      const result = command.resolve(context);
      expect(result.status).toBe('handled');
      if (result.status === 'handled') act(() => result.run());
      await settle();
      await settle();
    };
    await run();
    expect(ws.tobMode().active).toBe(true);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(entered).toHaveBeenCalledOnce();
    expect(command.resolve({ ...context, modal: 'settings' })).toEqual({ status: 'pass' });
    await run();
    expect(ws.tobMode().active).toBe(false);
    expect(entered).toHaveBeenCalledOnce();
    dispose();
    expect(commands.size).toBe(0);
  });

  it('puts the switch where Home sat in the saved rail order', async () => {
    const registry = createDockPanelRegistry();
    for (const id of [CHANNEL_BODY_PANEL, 'activity-center', 'market'])
      registry.register({ id, title: id, scope: 'global', component: () => null });
    const order = (ids: readonly string[]) => {
      act(() =>
        root.render(
          createElement(PinnedPanelCards, {
            registry,
            collapsed: true,
            order: ids,
            t: zhTranslate,
            extra: {
              id: 'bh:tob-mode',
              slot: TOB_MODE_SLOT,
              icon: 'bot',
              label: 'Tob',
              pressed: false,
              onClick: () => {},
            },
          }),
        ),
      );
      return [
        ...host.querySelectorAll<HTMLElement>('[data-pinned-panel],[data-pinned-switch]'),
      ].map((node) => node.dataset.pinnedPanel ?? node.dataset.pinnedSwitch);
    };
    expect(order([TOB_MODE_SLOT])).toEqual([
      'bh:tob-mode',
      'activity-center',
      CHANNEL_BODY_PANEL,
      'market',
    ]);
    expect(order(['activity-center', TOB_MODE_SLOT, 'market'])).toEqual([
      'activity-center',
      'bh:tob-mode',
      'market',
      CHANNEL_BODY_PANEL,
    ]);
    expect(order([CHANNEL_BODY_PANEL, 'activity-center', 'market', TOB_MODE_SLOT])).toEqual([
      CHANNEL_BODY_PANEL,
      'activity-center',
      'market',
      'bh:tob-mode',
    ]);
    expect(order([])).toEqual(['bh:tob-mode', 'activity-center', CHANNEL_BODY_PANEL, 'market']);
  });
});
