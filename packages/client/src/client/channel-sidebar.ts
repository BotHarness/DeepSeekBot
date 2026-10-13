import type { ComponentType } from 'react';

import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelSummary, ClientState } from './store.js';
import type { MemoryWorkingChange } from './bridge.js';
import { channelSidebarScopeKey } from './channel-sidebar-prefs.js';

export type ChannelSidebarScope = 'channel' | 'personabot';

export function resolveChannelSidebarContext(state: ClientState):
  | {
      channel: ChannelSummary | undefined;
      scope: ChannelSidebarScope;
      botSlug: string | undefined;
      scopeKey: string;
    }
  | undefined {
  const selection = state.selection;
  if (selection?.kind !== 'bot' && selection?.kind !== 'channel') return undefined;
  const matches = (candidate: ChannelSummary): boolean =>
    selection.kind === 'bot'
      ? candidate.type === 'dm' && candidate.botSlug === selection.slug
      : candidate.id === selection.channelId;
  const currentChannel = state.conversation.channel;
  const channel =
    currentChannel !== undefined && matches(currentChannel)
      ? currentChannel
      : state.channels.find(matches);
  const botSlug =
    selection.kind === 'bot'
      ? selection.slug
      : channel?.type === 'dm'
        ? channel.botSlug
        : undefined;
  const scope = botSlug === undefined ? 'channel' : 'personabot';
  const channelId =
    channel?.id ?? (selection.kind === 'channel' ? selection.channelId : selection.slug);
  return { channel, scope, botSlug, scopeKey: channelSidebarScopeKey(scope, channelId, botSlug) };
}

export interface ChannelSidebarEntryProps {
  scope: ChannelSidebarScope;
  channelId: string;
  conversationRevision?: number;
  refreshRevision?: number;
  requestRefresh?: () => void;
  botSlug: string | undefined;
  actions: BridgeActions;
  onMemoryCommitSelect?: ((sha: string) => void) | undefined;
  selectedMemoryCommitSha?: string | undefined;
  onMemoryFileSelect?: ((path: string) => void) | undefined;
  selectedMemoryFilePath?: string | undefined;
  onMemoryWorkingSelect?: ((change: MemoryWorkingChange) => void) | undefined;
  selectedMemoryWorking?: MemoryWorkingChange | undefined;
  expanded?: boolean;
  setExpanded?: (expanded: boolean) => void;
  setExpandable?: (expandable: boolean) => void;
  t: BotHarnessTranslate;
}

export interface ChannelSidebarSettingsProps extends ChannelSidebarEntryProps {
  onClose(): void;
  onPreview?: (() => void) | undefined;
}

export interface ChannelSettingsAttentionProps extends ChannelSidebarEntryProps {
  report(needsAttention: boolean): void;
}

export interface ChannelSidebarEntry {
  id: string;
  label: string;
  icon?: string;
  settings?: ComponentType<ChannelSidebarSettingsProps>;
  order?: number;
  scope: ChannelSidebarScope;
  component: ComponentType<ChannelSidebarEntryProps>;
  headerAction?: ComponentType<ChannelSidebarEntryProps>;
  badge?: ComponentType<ChannelSidebarEntryProps>;
  visible?: (state: ClientState) => boolean;
  tab?: string;
  surface?: 'settings';
  attention?: ComponentType<ChannelSettingsAttentionProps>;
  defaultHidden?: boolean;
}

export interface ChannelSidebarTab {
  id: string;
  label: string;
  icon?: string;
  order?: number;
  scope: ChannelSidebarScope;
  badge?: ComponentType<ChannelSidebarEntryProps>;
  defaultHidden?: boolean;
}

export interface ResolvedChannelSidebarTab {
  id: string;
  label: string;
  icon?: string | undefined;
  badges: readonly ComponentType<ChannelSidebarEntryProps>[];
  defaultHidden: boolean;
  entries: readonly ChannelSidebarEntry[];
}

export interface ChannelSidebarRegistry {
  register(entry: ChannelSidebarEntry): () => void;
  registerTab(tab: ChannelSidebarTab): () => void;
  entries(scope: ChannelSidebarScope): readonly ChannelSidebarEntry[];
  tabs(scope: ChannelSidebarScope): readonly ChannelSidebarTab[];
  subscribe(listener: () => void): () => void;
}

export function resolveChannelSidebarTabs(
  tabs: readonly ChannelSidebarTab[],
  entries: readonly ChannelSidebarEntry[],
): readonly ResolvedChannelSidebarTab[] {
  const registered = new Map(tabs.map((tab) => [tab.id, tab]));
  const groups = new Map<string, { order: number; tab: ResolvedChannelSidebarTab }>();
  for (const entry of entries) {
    const owner = entry.tab === undefined ? undefined : registered.get(entry.tab);
    const id = owner?.id ?? entry.id;
    const existing = groups.get(id);
    if (existing !== undefined) {
      existing.tab = {
        ...existing.tab,
        badges:
          owner?.badge === undefined && entry.badge !== undefined
            ? [...existing.tab.badges, entry.badge]
            : existing.tab.badges,
        defaultHidden:
          owner?.defaultHidden ?? (existing.tab.defaultHidden && entry.defaultHidden === true),
        entries: [...existing.tab.entries, entry],
      };
      continue;
    }
    groups.set(id, {
      order: owner?.order ?? entry.order ?? 0,
      tab: {
        id,
        label: owner?.label ?? entry.label,
        icon: owner === undefined ? entry.icon : owner.icon,
        badges:
          owner === undefined
            ? []
            : owner.badge !== undefined
              ? [owner.badge]
              : entry.badge === undefined
                ? []
                : [entry.badge],
        defaultHidden: owner?.defaultHidden ?? entry.defaultHidden === true,
        entries: [entry],
      },
    });
  }
  return [...groups.values()]
    .sort((left, right) => left.order - right.order || left.tab.id.localeCompare(right.tab.id))
    .map((group) => group.tab);
}
function compareEntries(left: ChannelSidebarEntry, right: ChannelSidebarEntry): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
}

export function createChannelSidebarRegistry(): ChannelSidebarRegistry {
  const entries = new Map<string, ChannelSidebarEntry>();
  const tabs = new Map<string, ChannelSidebarTab>();
  const listeners = new Set<() => void>();
  const scoped = new Map<ChannelSidebarScope, readonly ChannelSidebarEntry[]>([
    ['channel', []],
    ['personabot', []],
  ]);
  const scopedTabs = new Map<ChannelSidebarScope, readonly ChannelSidebarTab[]>([
    ['channel', []],
    ['personabot', []],
  ]);

  const rebuild = (): void => {
    const ordered = [...entries.values()].sort(compareEntries);
    scoped.set(
      'channel',
      ordered.filter((entry) => entry.scope === 'channel'),
    );
    scoped.set(
      'personabot',
      ordered.filter((entry) => entry.scope === 'personabot'),
    );
    for (const scope of ['channel', 'personabot'] as const)
      scopedTabs.set(
        scope,
        [...tabs.values()].filter((tab) => tab.scope === scope),
      );
    for (const listener of listeners) listener();
  };

  return {
    register(entry) {
      if (entries.has(entry.id)) {
        throw new Error(`duplicate Channel sidebar entry: ${entry.id}`);
      }
      entries.set(entry.id, entry);
      rebuild();
      return () => {
        if (entries.get(entry.id) !== entry) return;
        entries.delete(entry.id);
        rebuild();
      };
    },
    registerTab(tab) {
      if (tabs.has(tab.id)) {
        throw new Error(`duplicate Channel sidebar tab: ${tab.id}`);
      }
      tabs.set(tab.id, tab);
      rebuild();
      return () => {
        if (tabs.get(tab.id) !== tab) return;
        tabs.delete(tab.id);
        rebuild();
      };
    },
    entries(scope) {
      return scoped.get(scope) ?? [];
    },
    tabs(scope) {
      return scopedTabs.get(scope) ?? [];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
