import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  type ChannelDockStorage,
} from './channel-dock-layout.js';
import { HOME_SLOT, WORKSPACE_CHANNELS } from './workspace-context.js';

export const LAYOUT_MODE_STORAGE_KEY = 'botharness.bot-mode-layout-mode';
export const DEFAULT_SIMPLE_CHANNELS_WIDTH = 0.22;
export const MAX_SIDE_COLUMN_WIDTH = 0.6;
export const DEFAULT_SUBPANEL_COLUMN_WIDTH = 0.34;
export const DEFAULT_SUBPANEL_HEIGHT = 320;
export const MIN_SUBPANEL_HEIGHT = 120;

export type LayoutMode = 'simple' | 'advanced';

export interface SubpanelColumn {
  readonly open: boolean;
  readonly width: number;
  readonly expanded: readonly string[];
  readonly hidden: readonly string[];
  readonly heights: Readonly<Record<string, number>>;
}

export interface SimpleLayout {
  readonly mode: LayoutMode;
  readonly sideColumn: string | null;
  readonly channelsWidth: number;
  readonly column: SubpanelColumn;
}

export const DEFAULT_SUBPANEL_COLUMN: SubpanelColumn = {
  open: false,
  width: DEFAULT_SUBPANEL_COLUMN_WIDTH,
  expanded: ['sessions'],
  hidden: [],
  heights: {},
};

function browserStorage(): ChannelDockStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

function fraction(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 1
    ? value
    : undefined;
}

function ids(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : undefined;
}

function readColumn(value: unknown): SubpanelColumn {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return DEFAULT_SUBPANEL_COLUMN;
  const record = value as Record<string, unknown>;
  const heights =
    typeof record['heights'] === 'object' &&
    record['heights'] !== null &&
    !Array.isArray(record['heights'])
      ? Object.fromEntries(
          Object.entries(record['heights']).filter(
            (entry): entry is [string, number] =>
              typeof entry[1] === 'number' &&
              Number.isFinite(entry[1]) &&
              entry[1] >= MIN_SUBPANEL_HEIGHT,
          ),
        )
      : {};
  return {
    open: record['open'] === true,
    width: fraction(record['width']) ?? DEFAULT_SUBPANEL_COLUMN.width,
    expanded: ids(record['expanded']) ?? DEFAULT_SUBPANEL_COLUMN.expanded,
    hidden: ids(record['hidden']) ?? [],
    heights,
  };
}

export function readLayoutMode(
  storage: ChannelDockStorage | undefined = browserStorage(),
): SimpleLayout {
  let raw: string | null | undefined;
  let advanced = false;
  try {
    raw = storage?.getItem(LAYOUT_MODE_STORAGE_KEY);
    advanced = !!storage?.getItem(CHANNEL_DOCK_STORAGE_KEY);
  } catch {}
  let value: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : undefined;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
      value = parsed as Record<string, unknown>;
  } catch {}
  const mode = value['mode'];
  const saved = value['sideColumn'];
  const legacy = !('sideColumn' in value) && 'view' in value;
  const layout: SimpleLayout = {
    mode: mode === 'simple' || mode === 'advanced' ? mode : advanced ? 'advanced' : 'simple',
    sideColumn:
      saved === null
        ? null
        : typeof saved === 'string' && saved.length > 0
          ? saved
          : sideColumnFromView(value['view']),
    channelsWidth: Math.min(
      MAX_SIDE_COLUMN_WIDTH,
      fraction(value['channelsWidth']) ?? DEFAULT_SIMPLE_CHANNELS_WIDTH,
    ),
    column: readColumn(value['column']),
  };
  if (legacy && raw)
    try {
      const backup = `${LAYOUT_MODE_STORAGE_KEY}.before-side-column-v10`;
      if (storage?.getItem(backup) == null) storage?.setItem(backup, raw);
      const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'view'));
      storage?.setItem(
        LAYOUT_MODE_STORAGE_KEY,
        JSON.stringify({ ...rest, sideColumn: layout.sideColumn }),
      );
    } catch {}
  return layout;
}

function sideColumnFromView(view: unknown): string {
  return typeof view !== 'string' ||
    view.length === 0 ||
    view === CHANNEL_BODY_PANEL ||
    view === WORKSPACE_CHANNELS ||
    view === HOME_SLOT
    ? WORKSPACE_CHANNELS
    : view;
}

export function writeLayoutMode(
  layout: SimpleLayout,
  storage: ChannelDockStorage | undefined = browserStorage(),
): boolean {
  try {
    storage?.setItem(LAYOUT_MODE_STORAGE_KEY, JSON.stringify(layout));
    return true;
  } catch {
    return false;
  }
}
