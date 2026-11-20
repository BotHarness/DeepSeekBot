import type { ReactNode } from 'react';
import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';
import type { BotModeSortMode } from '@botharness/host-client/shared/bot-mode-settings';
import type { BridgeActions } from './actions.js';
import type { WindowCompanions } from './window-companions.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import type { QuickSwitcherSettings } from './quick-switcher.js';
import type { ShortcutBindings } from './shortcut-bindings.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelSidebarRegistry } from './channel-sidebar.js';
import type { DockPanelRegistry } from './dock-panels.js';
import type { RosterSection } from './roster.js';
import type { ChannelSummary, ClientState } from './store.js';

export const SIDEBAR_FIELDS = [
  'activitySync',
  'bots',
  'channels',
  'config',
  'error',
  'git',
  'query',
  'roster',
  'selection',
  'status',
] as const;

export type SidebarState = Pick<ClientState, (typeof SIDEBAR_FIELDS)[number]>;

export interface SidebarProps {
  headerEnd?: ReactNode;
  headerTarget?: HTMLElement | null;
  onViewProfile?: ((slug: string) => void) | undefined;
  onOpenConversation?: (() => void) | undefined;
  companion?: WindowCompanions | undefined;
  wide: boolean;
  actions: BridgeActions;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  channelSidebar?: ChannelSidebarRegistry | undefined;
  shortcutBindings?: ShortcutBindings | undefined;
  quickSwitcherSettings?: QuickSwitcherSettings | undefined;
  dockPanels?: DockPanelRegistry | undefined;
  t: BotHarnessTranslate;
}

export interface ChannelMenuRequest {
  channelId: string;
  channelIds?: readonly string[];
  pinnedView?: boolean;
  x: number;
  y: number;
}

export interface SectionMenuRequest {
  sectionId: string;
  x: number;
  y: number;
}

export interface PinDragState {
  channelId: string;
  source: 'roster' | 'pinned';
}

export type CreateRequest =
  | { kind: 'bot-source'; sectionId?: string }
  | { kind: 'bot'; source: 'empty' | 'git' | 'zip'; sectionId?: string }
  | {
      kind: 'section';
      moveChannelId?: string;
      moveChannelIds?: readonly string[];
      pinned?: boolean;
    }
  | { kind: 'channel'; sectionId?: string }
  | { kind: 'marketplace' }
  | { kind: 'message-person' }
  | { kind: 'message-bot' };

export type FlatBlockView =
  | { kind: 'section'; section: RosterSection; channels: ChannelSummary[] }
  | { kind: 'loose'; channels: ChannelSummary[] };

export type BatchError = 'failed' | 'limit' | 'reorder';
