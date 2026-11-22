import { isHumanDmChannel } from './channel-kind.js';
import { ALL_HOSTS, type RemoteHostsSnapshot } from './remote-hosts.js';
import { mixedEnvironmentChannels } from './environment-channels.js';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { PINNED_SORT_SCOPE_ID } from '@botharness/host-client/shared/bot-mode-settings';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { searchTextMatches } from './search-match.js';
import { reconcileChannelSelection, type ChannelSelection } from './channel-selection.js';
import {
  deletedBotDmIds,
  hiddenChannelSequence,
  type HiddenChannelItem,
} from './hidden-channels.js';
import type { ScopeId } from './channel-drag.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import type { RosterSection } from './roster.js';
import {
  completeFlatEntries,
  flatRosterChannelIds,
  orderScopeChannels,
  orderFlatEntries,
  resolvePinnedChannelIds,
  resolvedSortMode,
} from './roster-order.js';
import { store, type BotSummary, type ChannelSummary } from './store.js';
import type { SidebarState, FlatBlockView } from './bot-sidebar-types.js';

function matchesQuery(query: string, ...values: (string | undefined)[]): boolean {
  if (query.length === 0) return true;
  return values.some((value) => searchTextMatches(value ?? '', query));
}

export function sidebarRoster({
  state,
  botBySlug,
  prefs,
  hostTabs,
  member,
  remoteHostsState,
  remoteOpen,
}: {
  state: SidebarState;
  botBySlug: ReadonlyMap<string, BotSummary>;
  prefs: BotModePrefsSnapshot;
  hostTabs: boolean;
  member: boolean;
  remoteHostsState: RemoteHostsSnapshot;
  remoteOpen: boolean;
}) {
  const query = state.query.trim().toLowerCase();
  const rosterHiddenIds = [...state.roster.hidden, ...deletedBotDmIds(state.channels, state.bots)];
  const hiddenChannelSet = new Set(rosterHiddenIds);
  const allPinnedChannelIds = resolvePinnedChannelIds(state.channels, state.roster.pins);
  const allPinnedChannelSet = new Set(allPinnedChannelIds);
  const pinnedById = new Map(state.channels.map((channel) => [channel.id, channel]));
  const orderedPinnedIds = orderScopeChannels(
    allPinnedChannelIds.flatMap((id) => pinnedById.get(id) ?? []),
    resolvedSortMode(prefs.sortModes[PINNED_SORT_SCOPE_ID], prefs.sortMode),
    allPinnedChannelIds,
  ).map((channel) => channel.id);
  const pinnedChannelIds = orderedPinnedIds.filter((id) => !hiddenChannelSet.has(id));
  const hasPinnedChannels = pinnedChannelIds.length > 0;
  const hasPinnableChannels = state.channels.some(
    (channel) =>
      !hiddenChannelSet.has(channel.id) &&
      (channel.type === 'group' || channel.botSlug !== undefined || isHumanDmChannel(channel)),
  );
  const pinnedChannels = pinnedChannelIds.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined) return [];
    if (channel.type === 'group' || isHumanDmChannel(channel)) {
      return matchesQuery(query, channel.name) ? [channel] : [];
    }
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles) ? [channel] : [];
  });
  const arrangedChannels = state.channels.filter(
    (channel) =>
      !allPinnedChannelSet.has(channel.id) &&
      (channel.type === 'group' || channel.botSlug !== undefined || isHumanDmChannel(channel)),
  );
  const rosterChannels = arrangedChannels.filter((channel) => !hiddenChannelSet.has(channel.id));
  const channels = rosterChannels.filter((channel) => {
    if (channel.type === 'group' || isHumanDmChannel(channel))
      return matchesQuery(query, channel.name);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles);
  });
  const sectionedIds = new Set(state.roster.sections.flatMap((section) => section.channelIds));
  const rosterChannelIds = flatRosterChannelIds(state.channels, allPinnedChannelSet);
  const flatEntries = orderFlatEntries(
    completeFlatEntries(
      state.roster.topOrder,
      state.roster.sections.map((section) => section.id),
      rosterChannelIds,
      sectionedIds,
    ),
    new Map(state.channels.map((channel) => [channel.id, channel])),
    prefs.sortMode,
  );
  const sectionOrder = (
    section: RosterSection,
    source: readonly ChannelSummary[],
  ): ChannelSummary[] => {
    const visible = source.filter((channel) => section.channelIds.includes(channel.id));
    const mode = resolvedSortMode(prefs.sortModes[section.id], prefs.sortMode);
    return orderScopeChannels(visible, mode, section.channelIds);
  };
  const scopeChannelsOf = (scopeId: ScopeId): ChannelSummary[] => {
    if (scopeId === undefined) {
      const snapshot = store.getSnapshot();
      const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
      return orderScopeChannels(
        arrangedChannels.filter((channel) => !sectioned.has(channel.id)),
        prefs.sortMode,
      );
    }
    const section = store
      .getSnapshot()
      .roster.sections.find((candidate) => candidate.id === scopeId);
    return section === undefined ? [] : sectionOrder(section, arrangedChannels);
  };
  const sectionOfChannel = (channelId: string): string | undefined =>
    store.getSnapshot().roster.sections.find((section) => section.channelIds.includes(channelId))
      ?.id;
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  const flatBlocks: FlatBlockView[] = (() => {
    const blocks: FlatBlockView[] = [];
    let run: ChannelSummary[] = [];
    const flushRun = (): void => {
      if (run.length > 0) {
        blocks.push({ kind: 'loose', channels: run });
        run = [];
      }
    };
    for (const entry of flatEntries) {
      if (entry.kind === 'section') {
        flushRun();
        const section = state.roster.sections.find((candidate) => candidate.id === entry.id);
        if (section === undefined) continue;
        const visible = sectionOrder(section, channels);
        if (query.length > 0 && visible.length === 0) continue;
        blocks.push({ kind: 'section', section, channels: visible });
      } else {
        const channel = channelById.get(entry.id);
        if (channel === undefined) continue;
        run.push(channel);
      }
    }
    flushRun();
    if (query.length > 0) return blocks.filter((block) => block.channels.length > 0);
    return blocks;
  })();
  const showSource = hostTabs && !member && remoteHostsState.tab === ALL_HOSTS;
  const environmentChannels = showSource
    ? mixedEnvironmentChannels([...pinnedChannels, ...channels], remoteHostsState.hosts, query)
    : [];
  const visibleChannelIds = showSource
    ? environmentChannels.flatMap((entry) => (entry.kind === 'local' ? [entry.channel.id] : []))
    : [
        ...pinnedChannels.map((channel) => channel.id),
        ...flatBlocks.flatMap((block) =>
          block.kind === 'section' && state.config.collapsed[block.section.id] === true
            ? []
            : block.channels.map((channel) => channel.id),
        ),
      ];
  const railPinnedChannels = pinnedChannelIds.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    return channel === undefined ? [] : [channel];
  });
  const railChannels = flatEntries.flatMap((entry) => {
    if (entry.kind === 'channel') {
      const channel = rosterChannels.find((candidate) => candidate.id === entry.id);
      return channel === undefined ? [] : [channel];
    }
    const section = state.roster.sections.find((candidate) => candidate.id === entry.id);
    return section === undefined ? [] : sectionOrder(section, rosterChannels);
  });
  const hiddenItems: HiddenChannelItem[] = hiddenChannelSequence(
    state.channels,
    state.roster.hidden,
    state.bots,
  ).map((channel) => {
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return {
      channel,
      ...(bot === undefined ? {} : { bot, activity: personaBotActivity(state, bot) }),
    };
  });
  const visibleCount =
    pinnedChannels.length + flatBlocks.reduce((total, block) => total + block.channels.length, 0);
  const selectedBot =
    !remoteOpen && state.selection?.kind === 'bot' ? state.selection.slug : undefined;
  const selectedChannel =
    !remoteOpen && state.selection?.kind === 'channel' ? state.selection.channelId : undefined;
  return {
    query,
    rosterHiddenIds,
    allPinnedChannelSet,
    orderedPinnedIds,
    hasPinnedChannels,
    hasPinnableChannels,
    pinnedChannels,
    sectionOfChannel,
    scopeChannelsOf,
    flatBlocks,
    showSource,
    environmentChannels,
    visibleChannelIds,
    railPinnedChannels,
    railChannels,
    hiddenItems,
    visibleCount,
    selectedBot,
    selectedChannel,
  };
}

export function useVisibleChannelSelection({
  visibleChannelIds,
  channelSelection,
  setChannelSelection,
  state,
  t,
}: {
  visibleChannelIds: string[];
  channelSelection: ChannelSelection;
  setChannelSelection: Dispatch<SetStateAction<ChannelSelection>>;
  state: SidebarState;
  t: BotHarnessTranslate;
}) {
  const visibleIdsKey = visibleChannelIds.join('|');
  const [previousVisibleIdsKey, setPreviousVisibleIdsKey] = useState(visibleIdsKey);
  if (previousVisibleIdsKey !== visibleIdsKey) {
    setPreviousVisibleIdsKey(visibleIdsKey);
    const next = reconcileChannelSelection(channelSelection, visibleChannelIds);
    if (
      next.ids.length !== channelSelection.ids.length ||
      next.ids.some((id, index) => id !== channelSelection.ids[index]) ||
      next.anchorId !== channelSelection.anchorId
    ) {
      setChannelSelection(next);
    }
  }
  const selectedChannelIds = reconcileChannelSelection(channelSelection, visibleChannelIds).ids;
  const selectedChannelSet = new Set(selectedChannelIds);
  const selectedChannels = visibleChannelIds
    .filter((id) => selectedChannelSet.has(id))
    .flatMap((id) => state.channels.find((channel) => channel.id === id) ?? []);
  const selectedBotCount = selectedChannels.filter(
    (channel) => channel.botSlug !== undefined,
  ).length;
  const selectedItems = t(
    selectedBotCount === selectedChannels.length ? 'bulk.bots' : 'bulk.channels',
    { count: selectedChannels.length },
  );
  return { selectedChannelIds, selectedChannelSet, selectedItems };
}
