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
import type { ShortcutCommand } from '@deepseek-ai/dsh-client-shortcuts/client';
import { effectiveShortcuts } from '@deepseek-ai/dsh-client-shortcuts/protocol';
import { ChannelDock } from '../src/client/channel-dock.js';
import { CHANNEL_BODY_PANEL, CHANNEL_DOCK_STORAGE_KEY } from '../src/client/channel-dock-layout.js';
import type { ChannelSidebarEntryProps } from '../src/client/channel-sidebar.js';
import { createDockPanelRegistry, type DockPanelChannel } from '../src/client/dock-panels.js';
import { LAYOUT_MODE_STORAGE_KEY, readLayoutMode } from '../src/client/layout-mode.js';
import { zhTranslate } from '../src/client/locale.js';
import { PinnedPanelCards } from '../src/client/pinned-panel-cards.js';
import {
  HOME_SLOT,
  WORKSPACE_CHANNELS,
  WORKSPACE_RAIL,
  WorkspaceContext,
} from '../src/client/workspace-context.js';
import { railModeControls } from '../src/client/workspace-layout.js';
import {
  registerWorkspaceShortcuts,
  workspaceShortcutId,
} from '../src/client/workspace-shortcuts.js';

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

const observers = new Set<() => void>();

async function resize(api: DockviewApi, width: number): Promise<void> {
  act(() => api.layout(width, 900));
  for (const callback of observers) act(() => callback());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('PointerEvent', class extends MouseEvent {});
  observers.clear();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(private readonly callback: () => void) {}
      observe(target: Element) {
        if (target.classList.contains('bh-dock')) observers.add(this.callback);
      }
      unobserve() {}
      disconnect() {
        observers.delete(this.callback);
      }
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

function mountWorkspace() {
  let dock: DockviewApi | undefined;
  let layoutMode: { mode: 'simple' | 'advanced'; setMode(mode: 'simple' | 'advanced'): void };
  let channel: DockPanelChannel = { id: 'dm-ada', type: 'dm', botSlug: 'ada' };
  const registry = createDockPanelRegistry();
  for (const [id, title, order] of [
    [CHANNEL_BODY_PANEL, 'Messages', 0],
    [WORKSPACE_CHANNELS, 'Channels', -1],
    ['market', 'Market', 500],
    ['activity-center', 'Activity', -100],
  ] as const)
    registry.register({
      id,
      title,
      order,
      scope: 'global',
      component: () => createElement('input', { 'data-content': id, defaultValue: title }),
    });
  registry.registerEntry({
    id: 'sessions',
    label: 'sessions',
    scope: 'personabot',
    component: () => createElement('div', { 'data-body': 'sessions' }),
  });
  const view = () =>
    createElement(
      WorkspaceContext.Provider,
      {
        value: {
          rail: (api, _gap, _setGap, _reset, order, _setOrder, _hidden, _visible, mode) => {
            dock = api;
            layoutMode = mode;
            const controls = railModeControls(mode.mode, order);
            return createElement(PinnedPanelCards, {
              registry,
              collapsed: true,
              order: controls.order,
              hiddenIds: ['sessions', ...controls.hidden],
              t: zhTranslate,
            });
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
  const rail = () =>
    [...host.querySelectorAll<HTMLButtonElement>('[data-pinned-panel]')].map((node) => ({
      id: node.dataset.pinnedPanel!,
      pressed: node.getAttribute('aria-pressed') === 'true',
    }));
  return {
    registry,
    render: async () => {
      act(() => root.render(view()));
      await settle();
      await resize(dock!, 1500);
    },
    dock: () => dock!,
    layoutMode: () => layoutMode!,
    selectChannel: async (next: DockPanelChannel) => {
      channel = next;
      act(() => root.render(view()));
      await settle();
    },
    click: async (id: string) => {
      act(() => host.querySelector<HTMLButtonElement>(`[data-pinned-panel="${id}"]`)!.click());
      await settle();
    },
    rail,
    pressed: () => rail().flatMap((item) => (item.pressed ? [item.id] : [])),
    shown: () => {
      type Node = { type: string; data: unknown; visible?: boolean };
      const walk = (node: Node): string[] =>
        node.visible === false
          ? []
          : node.type === 'leaf'
            ? [...((node.data as { views: string[] }).views ?? [])]
            : (node.data as Node[]).flatMap(walk);
      return walk(dock!.toJSON().grid.root as Node).filter((id) => id !== WORKSPACE_RAIL);
    },
    sideColumn: () => readLayoutMode(storage).sideColumn,
  };
}

describe('Simple Side column', () => {
  it('starts with the Channel list beside Messages, and the rail has no Messages or Tob switch', async () => {
    values = new Map();
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.layoutMode().mode).toBe('simple');
    expect(ws.shown()).toEqual([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]);
    expect(ws.rail()).toEqual([
      { id: WORKSPACE_CHANNELS, pressed: true },
      { id: 'activity-center', pressed: false },
      { id: 'market', pressed: false },
    ]);
    expect(host.querySelector('[data-pinned-switch]')).toBeNull();
    expect(ws.sideColumn()).toBe(WORKSPACE_CHANNELS);
  });

  it('swaps the Side column, hides it on the active switch and always keeps Messages', async () => {
    values = new Map();
    const ws = mountWorkspace();
    await ws.render();
    const draft = host.querySelector<HTMLInputElement>('[data-message-draft]')!;
    draft.value = 'unsent message';

    await ws.click('activity-center');
    expect(ws.shown()).toEqual(['activity-center', CHANNEL_BODY_PANEL]);
    expect(ws.pressed()).toEqual(['activity-center']);
    expect(ws.sideColumn()).toBe('activity-center');
    const activity = host.querySelector<HTMLInputElement>('[data-content="activity-center"]')!;
    activity.value = 'activity filter';

    await ws.click('activity-center');
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.pressed()).toEqual([]);
    expect(ws.sideColumn()).toBeNull();

    await ws.click('market');
    expect(ws.shown()).toEqual(['market', CHANNEL_BODY_PANEL]);
    expect(ws.pressed()).toEqual(['market']);

    await ws.click('activity-center');
    expect(ws.shown()).toEqual(['activity-center', CHANNEL_BODY_PANEL]);
    expect(host.querySelector('[data-content="activity-center"]')).toBe(activity);
    expect(activity.value).toBe('activity filter');

    await ws.click(WORKSPACE_CHANNELS);
    expect(ws.shown()).toEqual([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]);
    expect(ws.pressed()).toEqual([WORKSPACE_CHANNELS]);
    await ws.click(WORKSPACE_CHANNELS);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);

    expect(host.querySelector('[data-message-draft]')).toBe(draft);
    expect(draft.value).toBe('unsent message');
    expect(values.get(CHANNEL_DOCK_STORAGE_KEY)).toBeDefined();
  });

  it('keeps the Side column when a Channel, Messages or a Subpanel opens', async () => {
    values = new Map();
    const ws = mountWorkspace();
    await ws.render();
    await ws.click(WORKSPACE_CHANNELS);
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    await ws.selectChannel({ id: 'dm-grace', type: 'dm', botSlug: 'grace' });
    act(() => ws.registry.open(CHANNEL_BODY_PANEL));
    await settle();
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.sideColumn()).toBeNull();

    await ws.click('activity-center');
    act(() => ws.registry.open('sessions'));
    await settle();
    expect(ws.shown()).toEqual(['activity-center', CHANNEL_BODY_PANEL]);
    expect(ws.registry.isOpen('sessions')).toBe(true);
    act(() => ws.registry.close(CHANNEL_BODY_PANEL));
    await settle();
    expect(ws.shown()).toEqual(['activity-center', CHANNEL_BODY_PANEL]);
    act(() => ws.registry.close('market'));
    await settle();
    expect(ws.shown()).toEqual(['activity-center', CHANNEL_BODY_PANEL]);
  });

  it('shares one persisted Side column width, clamped to 60%', async () => {
    values = new Map([
      [
        LAYOUT_MODE_STORAGE_KEY,
        JSON.stringify({ mode: 'simple', sideColumn: WORKSPACE_CHANNELS, channelsWidth: 0.3 }),
      ],
    ]);
    const ws = mountWorkspace();
    await ws.render();
    const width = (id: string) => ws.dock().getPanel(id)!.group.api.width;
    expect(Math.abs(width(WORKSPACE_CHANNELS) - 450)).toBeLessThanOrEqual(8);

    const drag = async (id: string, next: number) => {
      const sash = host.querySelector('.dv-sash')!;
      act(() => {
        sash.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
        ws.dock().getPanel(id)!.group.api.setSize({ width: next });
        window.dispatchEvent(new PointerEvent('pointerup'));
      });
      await settle();
    };
    await resize(ws.dock(), 1200);
    expect(readLayoutMode(storage).channelsWidth).toBe(0.3);
    expect(Math.abs(width(WORKSPACE_CHANNELS) - 360)).toBeLessThanOrEqual(8);
    await resize(ws.dock(), 1500);

    await drag(WORKSPACE_CHANNELS, 600);
    expect(readLayoutMode(storage).channelsWidth).toBeCloseTo(0.4, 2);

    await ws.click('market');
    expect(Math.abs(width('market') - 600)).toBeLessThanOrEqual(8);
    await drag('market', 1200);
    expect(readLayoutMode(storage).channelsWidth).toBeLessThanOrEqual(0.6);
  });

  it.each([
    [CHANNEL_BODY_PANEL, WORKSPACE_CHANNELS],
    [HOME_SLOT, WORKSPACE_CHANNELS],
    ['activity-center', 'activity-center'],
    ['market', 'market'],
  ])('opens an upgraded Simple %s view with %s in the Side column', async (view, side) => {
    values = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'simple', view })]]);
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.shown()).toEqual([side, CHANNEL_BODY_PANEL]);
    expect(ws.pressed()).toEqual([side]);
  });

  it('restores a hidden Side column', async () => {
    values = new Map([
      [LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'simple', sideColumn: null })],
    ]);
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    expect(ws.pressed()).toEqual([]);
  });

  it('toggles the Side column from Global panel shortcuts', async () => {
    values = new Map();
    const commands = new Map<string, ShortcutCommand>();
    const ws = mountWorkspace();
    const dispose = registerWorkspaceShortcuts(
      {
        register: (command) => {
          commands.set(command.id, command);
          return () => void commands.delete(command.id);
        },
      },
      ws.registry,
      () => true,
      zhTranslate,
    );
    await ws.render();
    const run = async (id: string) => {
      const result = commands
        .get(workspaceShortcutId(id))!
        .resolve({ region: 'page', modal: null, target: null });
      expect(result.status).toBe('handled');
      if (result.status === 'handled') act(() => result.run());
      await settle();
    };
    await run('activity-center');
    expect(ws.shown()).toEqual(['activity-center', CHANNEL_BODY_PANEL]);
    await run('activity-center');
    expect(ws.shown()).toEqual([CHANNEL_BODY_PANEL]);
    await run(WORKSPACE_CHANNELS);
    expect(ws.shown()).toEqual([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]);
    expect(commands.has(workspaceShortcutId(HOME_SLOT))).toBe(false);
    dispose();
  });
});

function openColumn(column: unknown) {
  values = new Map([
    [
      LAYOUT_MODE_STORAGE_KEY,
      JSON.stringify({ mode: 'simple', sideColumn: WORKSPACE_CHANNELS, column }),
    ],
  ]);
}
function defaultColumn() {
  return {
    open: true,
    width: 0.34,
    expanded: ['sessions', 'schedules', 'memory-files'],
    hidden: [],
    heights: {},
    order: [],
  };
}
async function mountWithSubpanels() {
  const ws = mountWorkspace();
  for (const [id, label] of [
    ['schedules', 'Schedules'],
    ['memory-files', 'Memory files'],
  ] as const)
    ws.registry.registerEntry({
      id,
      label,
      scope: 'personabot',
      component: () => createElement('div', { 'data-body': id }),
    });
  await ws.render();
  return ws;
}
const entryOrder = () =>
  [...host.querySelectorAll('[data-subpanel-entry]')].map((node) =>
    node.getAttribute('data-subpanel-entry')!,
  );
const subpanelHead = (id: string) =>
  host.querySelector<HTMLElement>(`[data-subpanel-entry="${id}"] [data-panel-head]`)!;
const press = async (id: string, key: string, alt = true) => {
  act(() => {
    subpanelHead(id).dispatchEvent(
      new KeyboardEvent('keydown', { key, altKey: alt, bubbles: true }),
    );
  });
  await settle();
};
function mockTransfer() {
  const data = new Map<string, string>();
  const mock = {
    dropEffect: 'none' as string,
    effectAllowed: 'none' as string,
    files: [],
    items: [],
    types: [] as string[],
    setData: (type: string, value: string) => {
      data.set(type, value);
      mock.types = [...data.keys()];
    },
    getData: (type: string) => data.get(type) ?? '',
    clearData: () => data.clear(),
    setDragImage: () => {},
  };
  return mock;
}
function withTransfer(mock: ReturnType<typeof mockTransfer>, type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientY?: number;
    dataTransfer?: unknown;
  };
  Object.defineProperty(event, 'dataTransfer', { value: mock });
  return event;
}
function stubRect(node: HTMLElement, top: number, height = 40) {
  node.getBoundingClientRect = () =>
    ({
      top,
      left: 0,
      bottom: top + height,
      right: 200,
      width: 200,
      height,
      x: 0,
      y: top,
    }) as DOMRect;
}

describe('Subpanel order', () => {
  const head = subpanelHead;

  it('makes the header itself draggable while keeping click-to-collapse', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const sessions = head('sessions');
    expect(sessions.draggable).toBe(true);
    expect(
      host.querySelector('[data-subpanel-entry="sessions"]')!.hasAttribute('data-expanded'),
    ).toBe(true);
    act(() => {
      sessions.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(
      host.querySelector('[data-subpanel-entry="sessions"]')!.hasAttribute('data-expanded'),
    ).toBe(false);
    expect(host.querySelector('#bh-subpanel-sessions')).toBeNull();
  });

  it('suppresses the toggle after a drag-like press', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const header = head('sessions');
    act(() => {
      header.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }),
      );
      header.dispatchEvent(
        new PointerEvent('pointermove', { bubbles: true, clientX: 30, clientY: 10 }),
      );
      header.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1, clientX: 30, clientY: 10 }),
      );
    });
    await settle();
    expect(
      host.querySelector('[data-subpanel-entry="sessions"]')!.hasAttribute('data-expanded'),
    ).toBe(true);
    expect(host.querySelector('[data-dragging]')).toBeNull();
  });

  it('renders subpanels in registration order by default', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    expect(entryOrder()).toEqual(['sessions', 'memory-files', 'schedules']);
  });

  it('honours a saved order', async () => {
    openColumn({ ...defaultColumn(), order: ['memory-files', 'sessions', 'schedules'] });
    await mountWithSubpanels();
    expect(entryOrder()).toEqual(['memory-files', 'sessions', 'schedules']);
  });

  it('moves a subpanel with Alt+Arrow and persists heights and expanded state', async () => {
    openColumn({ ...defaultColumn(), heights: { sessions: 260 } });
    await mountWithSubpanels();
    await press('sessions', 'ArrowDown');
    expect(entryOrder()).toEqual(['memory-files', 'sessions', 'schedules']);
    expect(readLayoutMode(storage).column).toMatchObject({
      order: ['memory-files', 'sessions', 'schedules'],
      heights: { sessions: 260 },
      expanded: ['sessions', 'schedules', 'memory-files'],
      hidden: [],
    });

    await press('sessions', 'ArrowUp');
    expect(entryOrder()).toEqual(['sessions', 'memory-files', 'schedules']);
  });

  it('ignores Alt+ArrowUp on the first subpanel', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    await press('sessions', 'ArrowUp');
    expect(entryOrder()).toEqual(['sessions', 'memory-files', 'schedules']);
    expect(readLayoutMode(storage).column.order).toEqual([]);
  });

  it('keeps a hidden subpanel in its order position', async () => {
    openColumn({
      ...defaultColumn(),
      hidden: ['schedules'],
      order: ['schedules', 'sessions', 'memory-files'],
    });
    await mountWithSubpanels();
    expect(entryOrder()).toEqual(['sessions', 'memory-files']);
    await press('sessions', 'ArrowDown');
    expect(entryOrder()).toEqual(['memory-files', 'sessions']);
    expect(readLayoutMode(storage).column.order).toEqual(['schedules', 'memory-files', 'sessions']);
  });

  it('drags a collapsed block without expanding it', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const section = () => host.querySelector('[data-subpanel-entry="sessions"]')!;
    act(() => {
      head('sessions').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(section().hasAttribute('data-expanded')).toBe(false);

    const headers = () => [...host.querySelectorAll<HTMLElement>('[data-subpanel-entry-header]')];
    stubRect(headers()[0]!, 0);
    stubRect(headers()[1]!, 40);
    stubRect(headers()[2]!, 80);
    const shared = mockTransfer();
    const transfer = (type: string) => withTransfer(shared, type);
    act(() => {
      head('sessions').dispatchEvent(transfer('dragstart'));
    });
    await settle();
    const over = transfer('dragover') as Event & { clientY?: number };
    over.clientY = 115;
    act(() => {
      headers()[2]!.closest('[data-subpanel-entry]')!.dispatchEvent(over);
    });
    await settle();
    act(() => {
      headers()[2]!.closest('[data-subpanel-entry]')!.dispatchEvent(transfer('drop'));
    });
    await settle();
    expect(entryOrder()).toEqual(['memory-files', 'schedules', 'sessions']);
    expect(section().hasAttribute('data-expanded')).toBe(false);
    expect(readLayoutMode(storage).column.order).toEqual(['memory-files', 'schedules', 'sessions']);
  });

  it('drags a subpanel to a new position and persists it', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const shared = mockTransfer();
    const transfer = (type: string) => withTransfer(shared, type);
    const sections = () => [...host.querySelectorAll<HTMLElement>('[data-subpanel-entry]')];
    const headers = () => [...host.querySelectorAll<HTMLElement>('[data-subpanel-entry-header]')];
    stubRect(headers()[0]!, 0);
    stubRect(headers()[1]!, 40);
    stubRect(headers()[2]!, 80);

    act(() => {
      head('sessions').dispatchEvent(transfer('dragstart'));
    });
    await settle();
    expect(
      host.querySelector('[data-subpanel-entry="sessions"]')!.hasAttribute('data-dragging'),
    ).toBe(true);

    const over = transfer('dragover') as Event & { clientY?: number };
    over.clientY = 115;
    act(() => {
      sections()[2]!.dispatchEvent(over);
    });
    await settle();
    expect(entryOrder()).toEqual(['memory-files', 'schedules', 'sessions']);
    expect(host.querySelector('[data-drop-line]')).not.toBeNull();

    act(() => {
      sections()[2]!.dispatchEvent(transfer('drop'));
    });
    await settle();
    expect(entryOrder()).toEqual(['memory-files', 'schedules', 'sessions']);
    expect(readLayoutMode(storage).column.order).toEqual(['memory-files', 'schedules', 'sessions']);
    expect(host.querySelector('[data-dragging]')).toBeNull();
    expect(host.querySelector('[data-drop-line]')).toBeNull();
  });

  it('ignores resize input during a drag', async () => {
    openColumn({ ...defaultColumn(), heights: { sessions: 260 } });
    await mountWithSubpanels();
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'dataTransfer', {
      value: { setData: () => {}, effectAllowed: 'none', setDragImage: () => {} },
    });
    act(() => {
      head('sessions').dispatchEvent(start);
    });
    await settle();
    const resize = host.querySelector<HTMLElement>(
      '[data-subpanel-entry="sessions"] .bh-subpanel-entry-resize',
    )!;
    act(() => {
      resize.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    await settle();
    expect(readLayoutMode(storage).column.heights).toEqual({ sessions: 260 });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    await settle();
    expect(host.querySelector('[data-dragging]')).toBeNull();
    expect(readLayoutMode(storage).column.order).toEqual([]);
  });

  it('cancels a drag on Escape without changing the order', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const start = new Event('dragstart', { bubbles: true, cancelable: true });
    Object.defineProperty(start, 'dataTransfer', {
      value: { setData: () => {}, effectAllowed: 'none', setDragImage: () => {} },
    });
    act(() => {
      head('sessions').dispatchEvent(start);
    });
    await settle();
    await press('sessions', 'Escape', false);
    expect(entryOrder()).toEqual(['sessions', 'memory-files', 'schedules']);
    expect(host.querySelector('[data-dragging]')).toBeNull();
    expect(readLayoutMode(storage).column.order).toEqual([]);
  });
});

describe('Subpanel auto-scroll and focus', () => {
  it('scrolls the column near its edges while dragging and stops outside', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const column = host.querySelector<HTMLElement>('[data-subpanel-column]')!;
    stubRect(column, 0, 400);
    const headers = () => [...host.querySelectorAll<HTMLElement>('[data-subpanel-entry-header]')];
    stubRect(headers()[1]!, 40);
    const shared = mockTransfer();
    act(() => {
      subpanelHead('sessions').dispatchEvent(withTransfer(shared, 'dragstart'));
    });
    await settle();
    const runFrames = () => {
      const pending = frames.splice(0);
      act(() => {
        for (const frame of pending) frame(0);
      });
    };
    const over = withTransfer(shared, 'dragover') as Event & { clientY?: number };
    over.clientY = 390;
    act(() => {
      headers()[1]!.closest('[data-subpanel-entry]')!.dispatchEvent(over);
    });
    await settle();
    runFrames();
    expect(column.scrollTop).toBeGreaterThan(0);
    const held = column.scrollTop;
    act(() => {
      column.dispatchEvent(new Event('dragleave', { bubbles: true, cancelable: true }));
    });
    await settle();
    runFrames();
    expect(column.scrollTop).toBe(held);
  });

  it('moves focus to the keyboard-moved header, scrolls it into view and announces the move', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    window.HTMLElement.prototype.scrollIntoView ??= () => {};
    const scrollSpy = vi
      .spyOn(window.HTMLElement.prototype, 'scrollIntoView')
      .mockImplementation(() => {});
    await press('sessions', 'ArrowDown');
    expect(document.activeElement).toBe(subpanelHead('sessions'));
    expect(scrollSpy).toHaveBeenCalled();
    expect(host.querySelector('[data-subpanel-announce]')?.textContent).toBe(
      'sessions，第 2 项，共 3 项',
    );
    scrollSpy.mockRestore();
  });

  it('moves focus to the dropped header and announces the move', async () => {
    openColumn(defaultColumn());
    await mountWithSubpanels();
    const headers = () => [...host.querySelectorAll<HTMLElement>('[data-subpanel-entry-header]')];
    stubRect(headers()[0]!, 0);
    stubRect(headers()[1]!, 40);
    stubRect(headers()[2]!, 80);
    const shared = mockTransfer();
    act(() => {
      subpanelHead('sessions').dispatchEvent(withTransfer(shared, 'dragstart'));
    });
    await settle();
    const sections = () => [...host.querySelectorAll<HTMLElement>('[data-subpanel-entry]')];
    const over = withTransfer(shared, 'dragover') as Event & { clientY?: number };
    over.clientY = 115;
    act(() => {
      sections()[2]!.dispatchEvent(over);
    });
    await settle();
    act(() => {
      sections()[2]!.dispatchEvent(withTransfer(shared, 'drop'));
    });
    await settle();
    expect(entryOrder()).toEqual(['memory-files', 'schedules', 'sessions']);
    expect(document.activeElement).toBe(subpanelHead('sessions'));
    expect(host.querySelector('[data-subpanel-announce]')?.textContent).toBe(
      'sessions，第 3 项，共 3 项',
    );
  });
});

describe('Subpanel group filtering', () => {
  it('orders group subpanels, excludes DM-only panels and retains their slots', async () => {
    openColumn({ ...defaultColumn(), order: ['members', 'sessions', 'schedules'] });
    const ws = mountWorkspace();
    for (const [id, label] of [
      ['members', 'Members'],
      ['schedules', 'Schedules'],
    ] as const)
      ws.registry.registerEntry({
        id,
        label,
        scope: 'personabot',
        component: () => createElement('div', { 'data-body': id }),
      });
    await ws.render();
    await ws.selectChannel({ id: 'group-1', type: 'group' });
    expect(entryOrder()).toEqual(['members', 'sessions']);
    await press('members', 'ArrowDown');
    expect(entryOrder()).toEqual(['sessions', 'members']);
    expect(readLayoutMode(storage).column.order).toEqual(['sessions', 'members', 'schedules']);
  });
});

describe('Advanced rail', () => {
  it('keeps the Messages and Channel list switches and has no Tob switch', async () => {
    values = new Map([[LAYOUT_MODE_STORAGE_KEY, JSON.stringify({ mode: 'advanced' })]]);
    const ws = mountWorkspace();
    await ws.render();
    expect(ws.layoutMode().mode).toBe('advanced');
    expect(ws.rail().map((item) => item.id)).toEqual([
      'activity-center',
      WORKSPACE_CHANNELS,
      CHANNEL_BODY_PANEL,
      'market',
    ]);
    expect(ws.pressed()).toEqual(expect.arrayContaining([WORKSPACE_CHANNELS, CHANNEL_BODY_PANEL]));
    expect(host.querySelector('[data-pinned-switch]')).toBeNull();
    await ws.click('market');
    expect(ws.pressed()).toContain('market');
    expect(ws.shown()).toEqual(expect.arrayContaining(['market', CHANNEL_BODY_PANEL]));
  });
});

describe('Home command opens the Tob DM', () => {
  it('keeps the stable Home command ID, default keys and custom bindings', () => {
    const commands = new Map<string, ShortcutCommand>();
    const openTob = vi.fn();
    const dispose = registerWorkspaceShortcuts(
      {
        register: (command) => {
          commands.set(command.id, command);
          return () => void commands.delete(command.id);
        },
      },
      createDockPanelRegistry(),
      () => true,
      zhTranslate,
      openTob,
    );
    const id = workspaceShortcutId(HOME_SLOT);
    expect(id).toBe('botharness.panel.p62-68-3a-68-6f-6d-65');
    const command = commands.get(id)!;
    expect(command.defaults['desktop:macos']).toEqual({
      code: 'KeyH',
      modifiers: ['primary', 'alt', 'shift'],
    });
    expect(command.defaults['web:windows']?.code).toBe('KeyH');
    expect(command.defaults['desktop:linux']?.code).toBe('KeyO');
    expect(command.label()).toBe(zhTranslate('workspace.openTob', { name: '托布' }));
    const custom = { code: 'KeyJ', modifiers: ['meta', 'alt', 'shift'] as const };
    const resolved = effectiveShortcuts(
      [...commands.values()],
      { schemaVersion: 2, profiles: { 'desktop:macos': { [id]: custom } } },
      'desktop',
      'macos',
    ).find((row) => row.id === id);
    expect(resolved).toMatchObject({ modified: true, binding: { code: 'KeyJ' }, conflicts: [] });
    const context = { region: 'page' as const, modal: null, target: null };
    const result = command.resolve(context);
    expect(result.status).toBe('handled');
    if (result.status === 'handled') result.run();
    expect(openTob).toHaveBeenCalledOnce();
    expect(command.resolve({ ...context, modal: 'settings' })).toEqual({ status: 'pass' });
    dispose();
    expect(commands.size).toBe(0);
  });
});
