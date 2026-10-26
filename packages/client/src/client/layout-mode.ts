import {
  CHANNEL_BODY_PANEL,
  CHANNEL_DOCK_STORAGE_KEY,
  type ChannelDockStorage,
} from './channel-dock-layout.js';

export const LAYOUT_MODE_STORAGE_KEY = 'botharness.bot-mode-layout-mode';
export const DEFAULT_SIMPLE_CHANNELS_WIDTH = 0.22;

export type LayoutMode = 'simple' | 'advanced';

export interface SimpleLayout {
  readonly mode: LayoutMode;
  readonly view: string;
  readonly channelsWidth: number;
}

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
  return {
    mode: mode === 'simple' || mode === 'advanced' ? mode : advanced ? 'advanced' : 'simple',
    view:
      typeof value['view'] === 'string' && value['view'].length > 0
        ? value['view']
        : CHANNEL_BODY_PANEL,
    channelsWidth: fraction(value['channelsWidth']) ?? DEFAULT_SIMPLE_CHANNELS_WIDTH,
  };
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
