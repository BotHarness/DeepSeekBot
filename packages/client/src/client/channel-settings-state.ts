import type { ConversationStateView } from './store.js';
import { createContext, useContext } from 'react';
import {
  resolveChannelSidebarContext,
  type ChannelSidebarEntry,
  type ChannelSidebarScope,
} from './channel-sidebar.js';

export interface ChannelSettingsSnapshot {
  readonly open: boolean;
  readonly sectionId: string | undefined;
}

const NO_ATTENTION: readonly string[] = [];

export class ChannelSettings {
  #snapshot: ChannelSettingsSnapshot = { open: false, sectionId: undefined };
  readonly #attention = new Map<string, readonly string[]>();
  readonly #listeners = new Set<() => void>();

  readonly attentionOf = (channelId: string | undefined): readonly string[] =>
    (channelId === undefined ? undefined : this.#attention.get(channelId)) ?? NO_ATTENTION;

  readonly reportAttention = (channelId: string, sectionId: string, on: boolean): void => {
    const current = this.attentionOf(channelId);
    if (current.includes(sectionId) === on) return;
    const next = on ? [...current, sectionId] : current.filter((id) => id !== sectionId);
    if (next.length === 0) this.#attention.delete(channelId);
    else this.#attention.set(channelId, next);
    this.#notify();
  };

  readonly getSnapshot = (): ChannelSettingsSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly open = (sectionId?: string): void => {
    this.#set({ open: true, sectionId });
  };

  readonly select = (sectionId: string): void => {
    this.#set({ ...this.#snapshot, sectionId });
  };

  readonly close = (): void => {
    this.#set({ open: false, sectionId: undefined });
  };

  #set(next: ChannelSettingsSnapshot): void {
    if (next.open === this.#snapshot.open && next.sectionId === this.#snapshot.sectionId) return;
    this.#snapshot = next;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener();
  }
}

export const channelSettings = new ChannelSettings();
export const ChannelSettingsContext = createContext(channelSettings);
export const useChannelSettings = (): ChannelSettings => useContext(ChannelSettingsContext);

export function isChannelSettingsSection(entry: ChannelSidebarEntry): boolean {
  return entry.surface === 'settings';
}

export function channelSettingsSections(
  entries: readonly ChannelSidebarEntry[],
  state: ConversationStateView,
): readonly ChannelSidebarEntry[] {
  return entries.filter(
    (entry) => isChannelSettingsSection(entry) && channelEntryVisible(entry, state),
  );
}

const SHARED_BOT_ENTRIES: ReadonlySet<string> = new Set([
  'bot-access',
  'human-nickname',
  'dm-trace',
]);

export function sharedBotSelected(state: ConversationStateView): boolean {
  const slug = resolveChannelSidebarContext(state)?.botSlug;
  return (
    slug !== undefined && state.bots.some((bot) => bot.slug === slug && bot.sharedBy !== undefined)
  );
}

export function channelEntryVisible(
  entry: ChannelSidebarEntry,
  state: ConversationStateView,
): boolean {
  if (!(entry.visible?.(state) ?? true)) return false;
  return (
    entry.scope !== 'personabot' || !sharedBotSelected(state) || SHARED_BOT_ENTRIES.has(entry.id)
  );
}

export function channelSettingsAttentionSections(
  sections: readonly ChannelSidebarEntry[],
  attention: readonly string[],
): readonly ChannelSidebarEntry[] {
  return sections.filter((section) => attention.includes(section.id));
}

export function channelSettingsSectionKey(scope: ChannelSidebarScope): string {
  return `settings:${scope}`;
}
