import type {
  AddPanelPositionOptions,
  DockviewApi,
  SerializedDockview,
  SerializedGridObject,
} from 'dockview-react';

import type { DockPanelPosition } from './dock-panels.js';

export const CHANNEL_DOCK_STORAGE_KEY = 'botharness.bot-mode-layout';
export const CHANNEL_DOCK_LAYOUT_VERSION = 1;
export const CHANNEL_BODY_PANEL = 'bh:channel-body';
export const CHANNEL_DOCK_QUERY = '(min-width: 961px)';
export const CHANNEL_BODY_COMPONENT = 'channel-body';
export const CHANNEL_ENTRY_COMPONENT = 'channel-entry';
export const DEFAULT_DOCK_PANELS = ['sessions', 'bot-inbox'] as const;

export type DockDirection = 'left' | 'right' | 'above' | 'below';

export interface DockPosition {
  readonly neighbor?: string | undefined;
  readonly direction: DockDirection;
}

export interface StoredChannelDock {
  readonly version: typeof CHANNEL_DOCK_LAYOUT_VERSION;
  readonly layout: SerializedDockview;
  readonly parked: Readonly<Record<string, DockPosition>>;
}

export interface ChannelDockStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): ChannelDockStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isLayout(value: unknown): value is SerializedDockview {
  if (!isRecord(value) || !isRecord(value['panels']) || !isRecord(value['grid'])) return false;
  const root = value['grid']['root'];
  return isRecord(root) && root['type'] === 'branch' && Array.isArray(root['data']);
}

function isPosition(value: unknown): value is DockPosition {
  return (
    isRecord(value) &&
    (value['neighbor'] === undefined || typeof value['neighbor'] === 'string') &&
    ['left', 'right', 'above', 'below'].includes(value['direction'] as string)
  );
}

export function readChannelDock(
  storage: ChannelDockStorage | undefined = browserStorage(),
): StoredChannelDock | undefined {
  try {
    const raw = storage?.getItem(CHANNEL_DOCK_STORAGE_KEY);
    if (raw === null || raw === undefined) return undefined;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value['version'] !== CHANNEL_DOCK_LAYOUT_VERSION) return undefined;
    if (!isLayout(value['layout'])) return undefined;
    const parked = isRecord(value['parked'])
      ? Object.fromEntries(Object.entries(value['parked']).filter(([, entry]) => isPosition(entry)))
      : {};
    return {
      version: CHANNEL_DOCK_LAYOUT_VERSION,
      layout: value['layout'],
      parked: parked as Record<string, DockPosition>,
    };
  } catch {
    return undefined;
  }
}

export function writeChannelDock(
  value: Omit<StoredChannelDock, 'version'>,
  storage: ChannelDockStorage | undefined = browserStorage(),
): void {
  try {
    storage?.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({ version: CHANNEL_DOCK_LAYOUT_VERSION, ...value }),
    );
  } catch {}
}

export function clearChannelDock(storage: ChannelDockStorage | undefined = browserStorage()): void {
  try {
    storage?.removeItem(CHANNEL_DOCK_STORAGE_KEY);
  } catch {}
}

type GridNode = SerializedGridObject<{ views: string[]; activeView?: string; id: string }>;

function firstPanel(node: GridNode): string | undefined {
  if (node.type === 'leaf') return (node.data as { views: string[] }).views[0];
  for (const child of node.data as GridNode[]) {
    const id = firstPanel(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

function lastPanel(node: GridNode): string | undefined {
  if (node.type === 'leaf') return (node.data as { views: string[] }).views.at(-1);
  for (const child of [...(node.data as GridNode[])].reverse()) {
    const id = lastPanel(child);
    if (id !== undefined) return id;
  }
  return undefined;
}

export function pruneChannelDock(
  layout: SerializedDockview,
  keep: (panelId: string) => boolean,
): { layout: SerializedDockview | undefined; parked: Record<string, DockPosition> } {
  const parked: Record<string, DockPosition> = {};
  const prune = (node: GridNode, horizontal: boolean): GridNode | undefined => {
    if (node.type === 'leaf') {
      const data = node.data as { views: string[]; activeView?: string; id: string };
      const views = data.views.filter(keep);
      if (views.length === 0) return undefined;
      return {
        ...node,
        data: {
          ...data,
          views,
          activeView:
            data.activeView !== undefined && views.includes(data.activeView)
              ? data.activeView
              : views[0]!,
        },
      };
    }
    const children = node.data as GridNode[];
    const kept: GridNode[] = [];
    children.forEach((child, index) => {
      const next = prune(child, !horizontal);
      if (next !== undefined) {
        kept.push(next);
        return;
      }
      const removed = collectPanels(child);
      const before = children
        .slice(0, index)
        .map((sibling) => lastPanel(sibling))
        .filter((id): id is string => id !== undefined && keep(id))
        .at(-1);
      const after = children
        .slice(index + 1)
        .map((sibling) => firstPanel(sibling))
        .find((id): id is string => id !== undefined && keep(id));
      for (const id of removed)
        parked[id] =
          before !== undefined
            ? { neighbor: before, direction: horizontal ? 'right' : 'below' }
            : after !== undefined
              ? { neighbor: after, direction: horizontal ? 'left' : 'above' }
              : { direction: horizontal ? 'right' : 'below' };
    });
    if (kept.length === 0) return undefined;
    return { ...node, data: kept };
  };
  const horizontal = layout.grid.orientation === 'HORIZONTAL';
  const root = prune(layout.grid.root as GridNode, horizontal);
  for (const id of Object.keys(layout.panels))
    if (!keep(id) && parked[id] === undefined) parked[id] = { direction: 'right' };
  if (root === undefined || !collectPanels(root).includes(CHANNEL_BODY_PANEL))
    return { layout: undefined, parked };
  for (const group of layout.floatingGroups ?? [])
    for (const id of group.data?.views ?? []) parked[id] ??= { direction: 'right' };
  const docked = new Set(collectPanels(root));
  const panels = Object.fromEntries(Object.entries(layout.panels).filter(([id]) => docked.has(id)));
  const groups = new Set(collectGroups(root));
  return {
    layout: {
      grid: { ...layout.grid, root },
      panels,
      ...(layout.activeGroup !== undefined && groups.has(layout.activeGroup)
        ? { activeGroup: layout.activeGroup }
        : {}),
    },
    parked,
  };
}

function collectPanels(node: GridNode): string[] {
  if (node.type === 'leaf') return [...(node.data as { views: string[] }).views];
  return (node.data as GridNode[]).flatMap(collectPanels);
}

function collectGroups(node: GridNode): string[] {
  if (node.type === 'leaf') return [(node.data as { id: string }).id];
  return (node.data as GridNode[]).flatMap(collectGroups);
}

export function resolveDockPosition(
  api: Pick<DockviewApi, 'getPanel' | 'panels'>,
  remembered: DockPosition | undefined,
): AddPanelPositionOptions {
  if (remembered?.neighbor !== undefined && api.getPanel(remembered.neighbor) !== undefined)
    return { referencePanel: remembered.neighbor, direction: remembered.direction };
  const column = api.panels.filter(
    (panel) => panel.id !== CHANNEL_BODY_PANEL && panel.api.location.type === 'grid',
  );
  const last = column.at(-1);
  if (last !== undefined) return { referencePanel: last.id, direction: 'below' };
  return { referencePanel: CHANNEL_BODY_PANEL, direction: 'right' };
}

export function resolveDefaultPosition(
  api: Pick<DockviewApi, 'getPanel' | 'panels'>,
  position: DockPanelPosition | undefined,
): AddPanelPositionOptions {
  const zone = position?.zone ?? 'right';
  const anchor = position?.relativeTo;
  if (anchor !== undefined && api.getPanel(anchor) !== undefined)
    return { referencePanel: anchor, direction: zone === 'bottom' ? 'right' : 'below' };
  if (zone === 'left') return { direction: 'left' };
  if (zone === 'bottom') return { direction: 'below' };
  if (zone === 'center') return { referencePanel: CHANNEL_BODY_PANEL, direction: 'below' };
  return resolveDockPosition(api, undefined);
}

export function allowsDockDrop(kind: string, position: string): boolean {
  if (kind === 'tab' || kind === 'header_space') return false;
  return position !== 'center';
}
