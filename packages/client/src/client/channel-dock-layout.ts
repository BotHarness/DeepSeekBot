import { WORKSPACE_HOME, WORKSPACE_RAIL } from './workspace-context.js';
import {
  BOT_WORKSPACE_PANELS,
  parseChannelSplit,
  type ChannelSplit,
} from './channel-split-layout.js';
import type {
  AddPanelPositionOptions,
  DockviewApi,
  SerializedDockview,
  SerializedGridObject,
} from 'dockview-react';

import type { DockPanelPosition, DockPanelInstance } from './dock-panels.js';

export const CHANNEL_DOCK_STORAGE_KEY = 'botharness.bot-mode-layout';
export const CHANNEL_DOCK_LAYOUT_VERSION = 8;
export const DEFAULT_WORKSPACE_GAP = 4;
export const CHANNEL_BODY_PANEL = 'bh:channel-body';
export const CHANNEL_DOCK_QUERY = '(min-width: 961px)';
export const CHANNEL_BODY_COMPONENT = 'channel-body';
export const CHANNEL_ENTRY_COMPONENT = 'channel-entry';
export const DEFAULT_DOCK_PANELS = ['sessions'] as const;
export { BOT_WORKSPACE_PANELS, CHANNEL_WORKSPACE_PANELS } from './channel-split-layout.js';
export type BotWorkspaceStates = Readonly<Record<string, ChannelWorkspaceState>>;

export type DockDirection = 'left' | 'right' | 'above' | 'below';

export interface DockPosition {
  readonly neighbor?: string | undefined;
  readonly direction: DockDirection;
  readonly size?: { readonly width: number; readonly height: number } | undefined;
}

export interface ChannelWorkspaceState {
  readonly open: boolean;
  readonly direction: DockDirection;
  readonly ratio: number;
  readonly hiddenControl: boolean;
}

export const DEFAULT_CHANNEL_WORKSPACE: ChannelWorkspaceState = {
  open: true,
  direction: 'right',
  ratio: 0.3,
  hiddenControl: false,
};

export interface StoredChannelDock {
  readonly version: typeof CHANNEL_DOCK_LAYOUT_VERSION;
  readonly instances?: readonly DockPanelInstance[] | undefined;
  readonly gap?: number | undefined;
  readonly order?: readonly string[] | undefined;
  readonly hiddenControls?: readonly string[] | undefined;
  readonly members?: { open: boolean; ratio: number } | undefined;
  readonly botPanelSeeds?: BotWorkspaceStates | undefined;
  readonly botWorkspaces?: Readonly<Record<string, BotWorkspaceStates>> | undefined;
  readonly sessionSeed?: ChannelWorkspaceState | undefined;
  readonly channelWorkspaces?: Readonly<Record<string, ChannelWorkspaceState>> | undefined;
  readonly channelSplits?: Readonly<Record<string, ChannelSplit>> | undefined;
  readonly layout: SerializedDockview;
  readonly parked: Readonly<Record<string, DockPosition>>;
  readonly visibilityLayout?: SerializedDockview | undefined;
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
  const size = isRecord(value) ? value['size'] : undefined;
  return (
    isRecord(value) &&
    (value['neighbor'] === undefined || typeof value['neighbor'] === 'string') &&
    ['left', 'right', 'above', 'below'].includes(value['direction'] as string) &&
    (size === undefined ||
      (isRecord(size) &&
        ['width', 'height'].every((axis) => {
          const fraction = size[axis];
          return (
            typeof fraction === 'number' &&
            Number.isFinite(fraction) &&
            fraction > 0 &&
            fraction <= 1
          );
        })))
  );
}

export function readChannelDock(
  storage: ChannelDockStorage | undefined = browserStorage(),
  workspace = false,
): StoredChannelDock | undefined {
  try {
    const raw = storage?.getItem(CHANNEL_DOCK_STORAGE_KEY);
    if (raw === null || raw === undefined) return undefined;
    const value: unknown = JSON.parse(raw);
    if (
      !isRecord(value) ||
      ![1, 2, 3, 4, 5, 6, 7, CHANNEL_DOCK_LAYOUT_VERSION].includes(value['version'] as number)
    )
      return undefined;
    if (!isLayout(value['layout'])) return undefined;
    const parked = isRecord(value['parked'])
      ? Object.fromEntries(Object.entries(value['parked']).filter(([, entry]) => isPosition(entry)))
      : {};
    const restored: StoredChannelDock = {
      version: CHANNEL_DOCK_LAYOUT_VERSION,
      instances: Array.isArray(value['instances'])
        ? value['instances']
            .slice(0, 16)
            .filter(
              (item): item is DockPanelInstance =>
                isRecord(item) &&
                ['id', 'definitionId', 'botId', 'label'].every(
                  (key) => typeof item[key] === 'string' && item[key].length > 0,
                ) &&
                String(item['id']).startsWith('instance:'),
            )
        : [],
      gap:
        typeof value['gap'] === 'number' && Number.isFinite(value['gap'])
          ? Math.min(16, Math.max(0, Math.round(value['gap'])))
          : DEFAULT_WORKSPACE_GAP,
      order: Array.isArray(value['order'])
        ? [...new Set(value['order'].filter((id): id is string => typeof id === 'string'))]
        : [],
      hiddenControls: Array.isArray(value['hiddenControls'])
        ? [...new Set(value['hiddenControls'].filter((id): id is string => typeof id === 'string'))]
        : [],
      members: isRecord(value['members'])
        ? {
            open: value['members']['open'] === true,
            ratio:
              typeof value['members']['ratio'] === 'number' &&
              Number.isFinite(value['members']['ratio'])
                ? Math.min(0.6, Math.max(0.2, value['members']['ratio']))
                : 0.3,
          }
        : { open: false, ratio: 0.3 },
      botPanelSeeds: parseBotWorkspaces(value['botPanelSeeds']),
      botWorkspaces: isRecord(value['botWorkspaces'])
        ? Object.fromEntries(
            Object.entries(value['botWorkspaces']).map(([id, state]) => [
              id,
              parseBotWorkspaces(state),
            ]),
          )
        : {},
      sessionSeed: parseChannelWorkspace(value['sessionSeed']),
      channelWorkspaces: isRecord(value['channelWorkspaces'])
        ? Object.fromEntries(
            Object.entries(value['channelWorkspaces']).flatMap(([id, state]) => {
              const parsed = parseChannelWorkspace(state);
              return parsed ? [[id, parsed]] : [];
            }),
          )
        : {},
      channelSplits: isRecord(value['channelSplits'])
        ? Object.fromEntries(
            Object.entries(value['channelSplits']).flatMap(([id, raw]) => {
              const tree = parseChannelSplit(raw);
              return tree ? [[id, tree]] : [];
            }),
          )
        : {},
      layout: value['layout'],
      ...(isLayout(value['visibilityLayout'])
        ? { visibilityLayout: value['visibilityLayout'] }
        : {}),
      parked: parked as Record<string, DockPosition>,
    };
    const fallback =
      workspace &&
      Number(value['version']) >= 4 &&
      !restored.layout.panels[WORKSPACE_RAIL] &&
      ['sessions', ...BOT_WORKSPACE_PANELS].some(
        (id) => restored.layout.panels[id] || restored.parked[id],
      );
    const normalized = migrateWorkPanel(fallback ? migrateFallbackWorkspace(restored) : restored);
    const sessions =
      Number(value['version']) < 4 ? migrateSessionsWorkspace(normalized) : normalized;
    const children = Number(value['version']) >= 6 ? sessions : migrateBotWorkspaces(sessions);
    const migrated =
      Number(value['version']) < 8
        ? {
            ...children,
            order: [
              ...new Set([
                ...(children.order ?? []),
                'bh:channels',
                CHANNEL_BODY_PANEL,
                'activity-center',
                'generated-files',
                WORKSPACE_HOME,
              ]),
            ],
          }
        : children;
    if (value['version'] !== CHANNEL_DOCK_LAYOUT_VERSION || fallback) {
      try {
        const backups = fallback ? ['before-workspace-shell'] : ['before-home-v8'];
        if (Number(value['version']) < 7) backups.push('before-channel-splits-v7');
        if (Number(value['version']) < 6) backups.push('before-bot-workspace-v6');
        if (Number(value['version']) < 5) backups.push('before-bot-workspace-v5');
        if (Number(value['version']) < 4) backups.push('before-channel-workspace-v4');
        if (Number(value['version']) < 3) backups.push('before-sessions-v3');
        for (const suffix of backups) {
          const key = `${CHANNEL_DOCK_STORAGE_KEY}.${suffix}`;
          if (storage?.getItem(key) == null) storage?.setItem(key, raw);
        }
        storage?.setItem(CHANNEL_DOCK_STORAGE_KEY, JSON.stringify(migrated));
      } catch {}
    }
    return migrated;
  } catch {
    return undefined;
  }
}

function migrateFallbackWorkspace(stored: StoredChannelDock): StoredChannelDock {
  let next = stored;
  const seeds = { ...stored.botPanelSeeds };
  for (const id of ['sessions', ...BOT_WORKSPACE_PANELS]) {
    if (!next.layout.panels[id] && !next.parked[id]) continue;
    const moved = movePanelIntoWorkspace(next, id);
    const parked = next.parked[id];
    const fraction =
      parked?.size?.[
        parked.direction === 'left' || parked.direction === 'right' ? 'width' : 'height'
      ];
    const seed = {
      ...moved.seed,
      ...(!moved.seed.open && fraction ? { ratio: Math.min(0.8, Math.max(0.2, fraction)) } : {}),
    };
    next = moved.stored;
    if (id === 'sessions') next = { ...next, sessionSeed: seed };
    else seeds[id] = seed;
  }
  return { ...next, botPanelSeeds: seeds };
}

export function writeChannelDock(
  value: Omit<StoredChannelDock, 'version'>,
  storage: ChannelDockStorage | undefined = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const raw = storage?.getItem(CHANNEL_DOCK_STORAGE_KEY);
    if (raw) {
      let previous: unknown;
      try {
        previous = JSON.parse(raw);
      } catch {
        return false;
      }
      if (
        !isRecord(previous) ||
        !isLayout(previous['layout']) ||
        typeof previous['version'] !== 'number' ||
        ![1, 2, 3, 4, 5, 6, 7, CHANNEL_DOCK_LAYOUT_VERSION].includes(previous['version'])
      ) {
        return false;
      }
      if (previous['version'] !== CHANNEL_DOCK_LAYOUT_VERSION) {
        const backupKey = `${CHANNEL_DOCK_STORAGE_KEY}.before-home-v8`;
        if (storage?.getItem(backupKey) == null) storage?.setItem(backupKey, raw);
      }
    }
    storage?.setItem(
      CHANNEL_DOCK_STORAGE_KEY,
      JSON.stringify({ version: CHANNEL_DOCK_LAYOUT_VERSION, ...value }),
    );
    return true;
  } catch {
    return false;
  }
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

export function dockPanelGap(
  layout: SerializedDockview,
  panelId: string,
  gap: number,
): { width: number; height: number } {
  const visit = (
    node: GridNode,
    horizontal: boolean,
    width: number,
    height: number,
  ): { width: number; height: number } | undefined => {
    if (node.type === 'leaf')
      return (node.data as { views: string[] }).views.includes(panelId)
        ? { width, height }
        : undefined;
    const children = node.data as GridNode[];
    const offset = (gap * (children.length - 1)) / Math.max(1, children.length);
    for (const child of children) {
      const found = visit(
        child,
        !horizontal,
        horizontal ? offset : width,
        horizontal ? height : offset,
      );
      if (found) return found;
    }
    return undefined;
  };
  return (
    visit(layout.grid.root as GridNode, layout.grid.orientation === 'HORIZONTAL', 0, 0) ?? {
      width: 0,
      height: 0,
    }
  );
}

export function pruneChannelDock(
  layout: SerializedDockview,
  keep: (panelId: string) => boolean,
  requireAnchor = true,
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
  if (
    root === undefined ||
    (requireAnchor &&
      !collectPanels(root).some((id) => id === CHANNEL_BODY_PANEL || id === 'bh:workspace-rail'))
  )
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

export function restoreDockVisibility(
  remembered: SerializedDockview | undefined,
  current: SerializedDockview,
  panelId: string,
): SerializedDockview | undefined {
  if (!remembered?.panels[panelId]) return undefined;
  const visible = new Set([...Object.keys(current.panels), panelId]);
  if ([...visible].some((id) => !remembered.panels[id])) return undefined;
  const restored = pruneChannelDock(remembered, (id) => visible.has(id), false).layout;
  if (!restored) return undefined;
  return {
    ...restored,
    panels: { ...restored.panels, ...current.panels },
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
    (panel) =>
      panel.id !== CHANNEL_BODY_PANEL &&
      panel.id !== 'bh:workspace-rail' &&
      panel.api.location.type === 'grid',
  );
  const last = column.at(-1);
  if (last !== undefined) return { referencePanel: last.id, direction: 'below' };
  return api.getPanel(CHANNEL_BODY_PANEL)
    ? { referencePanel: CHANNEL_BODY_PANEL, direction: 'right' }
    : { direction: 'right' };
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
  if (zone === 'bottom' && !api.getPanel('bh:workspace-rail')) return { direction: 'below' };
  if (zone === 'bottom' || zone === 'center') {
    const target =
      api.getPanel(CHANNEL_BODY_PANEL) ??
      api.panels.find((panel) => panel.id !== 'bh:workspace-rail');
    return target ? { referencePanel: target.id, direction: 'below' } : { direction: 'right' };
  }
  return resolveDockPosition(api, undefined);
}

export function allowsDockDrop(kind: string, position: string): boolean {
  if (kind === 'tab' || kind === 'header_space') return false;
  return position !== 'center';
}

export function migrateWorkPanel(stored: StoredChannelDock): StoredChannelDock {
  const old = 'group-work';
  const next = 'sessions';
  const hasSessions = !!stored.layout.panels[next];
  const hasWork = !!stored.layout.panels[old];
  const mapId = (id: string) => (id === old ? next : id);
  const panels = Object.fromEntries(
    Object.entries(stored.layout.panels)
      .filter(([id]) => id !== old || !hasSessions)
      .map(([id, panel]) => [
        mapId(id),
        id === old
          ? { ...panel, id: next, title: next, params: { ...panel.params, entryId: next } }
          : panel,
      ]),
  );
  const walk = (node: GridNode): GridNode | undefined => {
    if (node.type === 'leaf') {
      const data = node.data as { views: string[]; activeView?: string; id: string };
      const views = [...new Set(data.views.filter((id) => id !== old || !hasSessions).map(mapId))];
      if (!views.length) return undefined;
      return {
        ...node,
        data: {
          ...data,
          views,
          activeView: views.includes(mapId(data.activeView ?? ''))
            ? mapId(data.activeView!)
            : views[0]!,
        },
      };
    }
    const data = (node.data as GridNode[]).flatMap((child) => {
      const result = walk(child);
      return result ? [result] : [];
    });
    return data.length ? { ...node, data } : undefined;
  };
  const root = walk(stored.layout.grid.root as GridNode) ?? {
    ...stored.layout.grid.root,
    type: 'branch' as const,
    data: [],
  };
  const order = stored.order ?? [];
  const hidden = stored.hiddenControls ?? [];
  const explicitSessions = order.includes(next) || hidden.includes(next) || hasSessions;
  const hiddenControls = [
    ...new Set(hidden.filter((id) => id !== old || !explicitSessions).map(mapId)),
  ];
  if (hasWork && !hasSessions) {
    const index = hiddenControls.indexOf(next);
    if (index >= 0) hiddenControls.splice(index, 1);
  }
  const parked = Object.fromEntries(
    Object.entries(stored.parked)
      .filter(([id]) => id !== old || !stored.parked[next])
      .map(([id, position]) => [
        mapId(id),
        { ...position, ...(position.neighbor ? { neighbor: mapId(position.neighbor) } : {}) },
      ]),
  );
  for (const [id, position] of Object.entries(parked))
    if (position.neighbor === id) delete position.neighbor;
  const groups = new Set(collectGroups(root));
  const { activeGroup, ...layout } = stored.layout;
  return {
    ...stored,
    order: [...new Set(order.filter((id) => id !== old || !order.includes(next)).map(mapId))],
    hiddenControls,
    parked,
    layout: {
      ...layout,
      panels,
      grid: { ...layout.grid, root },
      ...(activeGroup && groups.has(activeGroup) ? { activeGroup } : {}),
    },
  };
}

function parseChannelWorkspace(value: unknown): ChannelWorkspaceState | undefined {
  if (
    !isRecord(value) ||
    typeof value['open'] !== 'boolean' ||
    !['left', 'right', 'above', 'below'].includes(value['direction'] as string) ||
    typeof value['ratio'] !== 'number' ||
    !Number.isFinite(value['ratio'])
  )
    return undefined;
  return {
    open: value['open'],
    direction: value['direction'] as DockDirection,
    ratio: Math.min(0.8, Math.max(0.2, value['ratio'])),
    hiddenControl: value['hiddenControl'] === true,
  };
}

function movePanelIntoWorkspace(
  stored: StoredChannelDock,
  panelId: string,
): { stored: StoredChannelDock; seed: ChannelWorkspaceState } {
  let geometry: Pick<ChannelWorkspaceState, 'direction' | 'ratio'> = DEFAULT_CHANNEL_WORKSPACE;
  const walk = (node: GridNode, horizontal: boolean): GridNode | undefined => {
    if (node.type === 'leaf') {
      const data = node.data as { views: string[]; activeView?: string; id: string };
      const views = data.views.filter((id) => id !== panelId);
      if (!views.length) return undefined;
      return {
        ...node,
        data: {
          ...data,
          views,
          activeView: views.includes(data.activeView ?? '') ? data.activeView! : views[0]!,
        },
      };
    }
    const children = node.data as GridNode[];
    const messageIndex = children.findIndex((child) =>
      collectPanels(child).includes(CHANNEL_BODY_PANEL),
    );
    const sessionIndex = children.findIndex((child) => collectPanels(child).includes(panelId));
    if (
      messageIndex >= 0 &&
      sessionIndex >= 0 &&
      messageIndex !== sessionIndex &&
      collectPanels(children[sessionIndex]!).length === 1 &&
      collectPanels(children[messageIndex]!).length === 1
    ) {
      const sessionSize = children[sessionIndex]!.size ?? 0;
      const messageSize = children[messageIndex]!.size ?? 0;
      geometry = {
        direction: horizontal
          ? sessionIndex < messageIndex
            ? 'left'
            : 'right'
          : sessionIndex < messageIndex
            ? 'above'
            : 'below',
        ratio:
          sessionSize > 0 && messageSize > 0
            ? Math.min(0.8, Math.max(0.2, sessionSize / (sessionSize + messageSize)))
            : 0.3,
      };
    }
    const data = children.flatMap((child, index) => {
      const absorbsSession =
        index === messageIndex &&
        sessionIndex >= 0 &&
        sessionIndex !== messageIndex &&
        collectPanels(children[sessionIndex]!).length === 1;
      const sized = absorbsSession
        ? { ...child, size: (child.size ?? 0) + (children[sessionIndex]!.size ?? 0) }
        : child;
      const next = walk(sized, !horizontal);
      return next ? [next] : [];
    });
    return data.length ? { ...node, data } : undefined;
  };
  const root = walk(
    stored.layout.grid.root as GridNode,
    stored.layout.grid.orientation === 'HORIZONTAL',
  ) ?? { ...stored.layout.grid.root, type: 'branch' as const, data: [] };
  const panels = Object.fromEntries(
    Object.entries(stored.layout.panels).filter(([id]) => id !== panelId),
  );
  const groups = new Set(collectGroups(root));
  const { activeGroup, ...layout } = stored.layout;
  return {
    seed: {
      ...geometry,
      direction: stored.layout.panels[panelId]
        ? geometry.direction
        : (stored.parked[panelId]?.direction ?? geometry.direction),
      open: !!stored.layout.panels[panelId],
      hiddenControl: stored.hiddenControls?.includes(panelId) ?? false,
    },
    stored: {
      ...stored,
      order: stored.order?.filter((id) => id !== panelId),
      hiddenControls: stored.hiddenControls?.filter((id) => id !== panelId),
      parked: Object.fromEntries(
        Object.entries(stored.parked)
          .filter(([id]) => id !== panelId)
          .map(([id, position]) => [
            id,
            position.neighbor === panelId
              ? { ...position, neighbor: CHANNEL_BODY_PANEL }
              : position,
          ]),
      ),
      layout: {
        ...layout,
        panels,
        grid: { ...layout.grid, root },
        ...(activeGroup && groups.has(activeGroup) ? { activeGroup } : {}),
      },
    },
  };
}

function parseBotWorkspaces(value: unknown): BotWorkspaceStates {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.keys(value)
      .slice(0, 32)
      .flatMap((id) => {
        const state = parseChannelWorkspace(value[id]);
        return state ? [[id, state]] : [];
      }),
  );
}

export function migrateSessionsWorkspace(stored: StoredChannelDock): StoredChannelDock {
  const moved = movePanelIntoWorkspace(stored, 'sessions');
  return {
    ...moved.stored,
    sessionSeed: stored.sessionSeed ?? moved.seed,
    channelWorkspaces: stored.channelWorkspaces ?? {},
  };
}

export function migrateBotWorkspaces(stored: StoredChannelDock): StoredChannelDock {
  const seeds = { ...stored.botPanelSeeds };
  let next = stored;
  for (const id of BOT_WORKSPACE_PANELS) {
    const moved = movePanelIntoWorkspace(next, id);
    seeds[id] ??= moved.seed;
    next = moved.stored;
  }
  return { ...next, botPanelSeeds: seeds, botWorkspaces: stored.botWorkspaces ?? {} };
}
