import {
  loadComposerIdentity,
  applyRosterBatch,
  assignRosterChannel,
  BridgeCallError,
  createRosterSection,
  errorMessage,
  loadBots,
  loadChannels,
  loadRoster,
  removeRosterSection,
  renameRosterSection,
  reorderRosterSections,
  reorderTopOrder,
  setRosterHidden,
  setChannelMute,
  setRosterPins,
  type BridgeCall,
  type RosterBatchInput,
} from './bridge.js';
import {
  planSectionChannelOrder,
  sameIds,
  type RosterSection,
  type TopOrderEntry,
} from './roster.js';
import {
  completeFlatEntries,
  flatRosterChannelIds,
  resolvePinnedChannelIds,
} from './roster-order.js';
import type { ClientStore } from './store.js';
import { reportFailure } from './diagnostic-log.js';
import type { GitActions } from './actions-git.js';
import type { ActivityActions } from './actions-activity.js';

export interface RosterActions {
  load(signal?: AbortSignal): Promise<void>;
  refreshRoster(signal?: AbortSignal): Promise<void>;
  createSection(name: string): Promise<RosterSection | undefined>;
  renameSection(sectionId: string, name: string): Promise<boolean>;
  removeSection(sectionId: string): Promise<boolean>;
  setChannelPinned(channelId: string, pinned: boolean): Promise<boolean>;
  reorderPinnedChannels(order: readonly string[], beforePublish: () => void): Promise<boolean>;
  setChannelHidden(channelId: string, hidden: boolean): Promise<boolean>;
  setChannelMuted(channelId: string, muted: boolean): Promise<boolean>;
  batchRoster(input: RosterBatchInput): Promise<boolean>;
  movePinnedChannel(
    channelId: string,
    sectionId: string,
    order: readonly string[],
  ): Promise<boolean>;
  movePinnedChannelToFlat(channelId: string, order: readonly TopOrderEntry[]): Promise<boolean>;
  assignChannel(channelId: string, sectionId: string | undefined, index?: number): Promise<boolean>;
  setSectionChannelOrder(sectionId: string, order: readonly string[]): Promise<boolean>;
  moveChannel(channelId: string, sectionId: string, order: readonly string[]): Promise<boolean>;
  reorderSections(order: readonly string[]): Promise<boolean>;
  reorderFlat(order: readonly TopOrderEntry[]): Promise<boolean>;
  moveToFlat(channelId: string, order: readonly TopOrderEntry[]): Promise<boolean>;
  ensureChannelPins(): Promise<boolean>;
  ensureFlatTopOrder(): Promise<boolean>;
}

export function createRosterActions(
  call: BridgeCall,
  clientStore: ClientStore,
  refreshGit: GitActions['refreshGit'],
  refreshActivityListStatus: ActivityActions['refreshActivityListStatus'],
) {
  let rosterRefreshGeneration = 0;
  const refreshRoster = async (signal?: AbortSignal, scopedCall = call): Promise<void> => {
    scopedCall.assertCurrent?.();
    const generation = ++rosterRefreshGeneration;
    const [rosterResult, channelResult, botResult, identityResult] = await Promise.allSettled([
      loadRoster(scopedCall, signal),
      loadChannels(scopedCall, signal),
      loadBots(scopedCall, signal),
      loadComposerIdentity(scopedCall, signal),
    ]);
    if (signal?.aborted === true) return;
    scopedCall.assertCurrent?.();
    clientStore.setComposerIdentity(
      identityResult.status === 'fulfilled' ? identityResult.value : undefined,
    );
    if (botResult.status === 'fulfilled') {
      scopedCall.assertCurrent?.();
      clientStore.setRoster(botResult.value, clientStore.getSnapshot().channels);
    }
    if (channelResult.status === 'fulfilled' && generation === rosterRefreshGeneration) {
      const channels = channelResult.value;
      const before = clientStore.getSnapshot();
      const current = before.conversation.channel;
      scopedCall.assertCurrent?.();
      clientStore.setRoster(before.bots, channels);
      if (current !== undefined) {
        scopedCall.assertCurrent?.();
        const updated = channels.find((item) => item.id === current.id);
        if (updated !== undefined) clientStore.setConversation({ channel: updated });
        else if (before.channels.some((item) => item.id === current.id))
          clientStore.select(undefined);
      }
    } else if (channelResult.status === 'rejected') {
      reportFailure('channel-refresh-failed', 'channel refresh failed', channelResult.reason);
    }
    if (rosterResult.status === 'fulfilled') {
      const snapshot = rosterResult.value;
      const previousMuted = clientStore.getSnapshot().roster.muted;
      scopedCall.assertCurrent?.();
      clientStore.setRosterState({
        pins: snapshot.pins,
        hidden: snapshot.hidden,
        muted: snapshot.muted,
        sections: snapshot.sections,
        topOrder: snapshot.topOrder,
        readOnly: false,
      });
      if (!sameIds([...previousMuted].sort(), [...snapshot.muted].sort())) {
        scopedCall.assertCurrent?.();
        void refreshActivityListStatus();
      }
    } else if (
      rosterResult.reason instanceof BridgeCallError &&
      rosterResult.reason.code === 'storage-unavailable'
    ) {
      scopedCall.assertCurrent?.();
      clientStore.setRosterState({ readOnly: true });
    } else {
      reportFailure('roster-refresh-failed', 'roster refresh failed', rosterResult.reason);
    }
  };
  const reportRosterFailure = (error: unknown): void => {
    if (error instanceof BridgeCallError && error.code === 'storage-unavailable') {
      clientStore.setRosterState({ readOnly: true });
    }
    reportFailure('roster-write-failed', 'roster write failed', error);
  };
  const rosterMutate = async (
    operation: () => Promise<void>,
    scopedCall = call,
  ): Promise<boolean> => {
    try {
      await operation();
      await refreshRoster(undefined, scopedCall);
      return true;
    } catch (error) {
      scopedCall.assertCurrent?.();
      reportRosterFailure(error);
      return false;
    }
  };
  const placeCreatedChannelFirst = async (
    channelId: string,
    sectionId: string | undefined,
    scopedCall = call,
  ): Promise<boolean> => {
    if (sectionId !== undefined) {
      return rosterMutate(async () => {
        await assignRosterChannel(scopedCall, channelId, sectionId, 0);
      }, scopedCall);
    }
    const snapshot = clientStore.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const pinnedChannelIds = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      flatRosterChannelIds(snapshot.channels, new Set(pinnedChannelIds)),
      sectioned,
    );
    const order: TopOrderEntry[] = [
      { kind: 'channel', id: channelId },
      ...flat.filter((entry) => entry.kind !== 'channel' || entry.id !== channelId),
    ];
    return rosterMutate(async () => {
      await reorderTopOrder(scopedCall, order);
    }, scopedCall);
  };

  const actions = {
    async load(signal) {
      clientStore.setRosterStatus('loading', undefined);
      void refreshGit(signal);
      try {
        const [bots, channels] = await Promise.all([
          loadBots(call, signal),
          loadChannels(call, signal),
        ]);
        if (signal?.aborted === true) return;
        clientStore.setRoster(bots, channels);
      } catch (error) {
        if (signal?.aborted === true) return;
        clientStore.setRosterStatus('error', errorMessage(error));
        return;
      }
      await refreshRoster(signal);
    },
    refreshRoster,
    async createSection(name) {
      try {
        const section = await createRosterSection(call, name);
        await refreshRoster();
        return section;
      } catch (error) {
        reportRosterFailure(error);
        return undefined;
      }
    },
    async renameSection(sectionId, name) {
      return rosterMutate(async () => {
        await renameRosterSection(call, sectionId, name);
      });
    },
    async removeSection(sectionId) {
      return rosterMutate(async () => {
        await removeRosterSection(call, sectionId);
      });
    },
    async setChannelPinned(channelId, pinned) {
      const snapshot = clientStore.getSnapshot();
      const current = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      const next = pinned
        ? [...current.filter((candidate) => candidate !== channelId), channelId]
        : current.filter((candidate) => candidate !== channelId);
      if (
        next.length === current.length &&
        next.every((candidate, index) => candidate === current[index])
      ) {
        return true;
      }
      return rosterMutate(async () => {
        await setRosterPins(call, next);
      });
    },
    async reorderPinnedChannels(order, beforePublish) {
      const snapshot = clientStore.getSnapshot();
      const current = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      const selected = new Set(order);
      if (
        order.length !== current.length ||
        selected.size !== current.length ||
        current.some((id) => !selected.has(id))
      ) {
        return false;
      }
      if (sameIds(order, current)) {
        beforePublish();
        return true;
      }
      try {
        await setRosterPins(call, [...order]);
        beforePublish();
        await refreshRoster();
        return true;
      } catch (error) {
        reportRosterFailure(error);
        await refreshRoster();
        return false;
      }
    },
    async setChannelHidden(channelId, hidden) {
      const current = [...clientStore.getSnapshot().roster.hidden];
      const next = hidden
        ? [...current.filter((candidate) => candidate !== channelId), channelId]
        : current.filter((candidate) => candidate !== channelId);
      if (sameIds(next, current)) return true;
      return rosterMutate(async () => {
        await setRosterHidden(call, next);
      });
    },
    async setChannelMuted(channelId, muted) {
      if (clientStore.getSnapshot().roster.muted.includes(channelId) === muted) return true;
      return rosterMutate(async () => {
        await setChannelMute(call, channelId, muted);
      });
    },
    async batchRoster(input) {
      try {
        const snapshot = await applyRosterBatch(call, input);
        clientStore.setRosterState({
          pins: snapshot.pins,
          hidden: snapshot.hidden,
          muted: snapshot.muted,
          sections: snapshot.sections,
          topOrder: snapshot.topOrder,
          readOnly: false,
        });
        return true;
      } catch (error) {
        reportRosterFailure(error);
        await refreshRoster();
        return false;
      }
    },
    async movePinnedChannel(channelId, sectionId, order) {
      const snapshot = clientStore.getSnapshot();
      const nextPins = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins).filter(
        (candidate) => candidate !== channelId,
      );
      return rosterMutate(async () => {
        for (let index = 0; index < order.length; index += 1) {
          await assignRosterChannel(call, order[index] as string, sectionId, index);
        }
        await setRosterPins(call, nextPins);
      });
    },
    async movePinnedChannelToFlat(channelId, order) {
      const snapshot = clientStore.getSnapshot();
      const nextPins = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins).filter(
        (candidate) => candidate !== channelId,
      );
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, undefined);
        await reorderTopOrder(call, order);
        await setRosterPins(call, nextPins);
      });
    },
    async assignChannel(channelId, sectionId, index) {
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, sectionId, index);
      });
    },
    async setSectionChannelOrder(sectionId, order) {
      const section = clientStore
        .getSnapshot()
        .roster.sections.find((candidate) => candidate.id === sectionId);
      if (section === undefined) return false;
      const target = planSectionChannelOrder(section, order);
      if (target === undefined) return true;
      return rosterMutate(async () => {
        for (let index = 0; index < target.length; index += 1) {
          await assignRosterChannel(call, target[index] as string, sectionId, index);
        }
      });
    },
    async moveChannel(channelId, sectionId, order) {
      return rosterMutate(async () => {
        for (let index = 0; index < order.length; index += 1) {
          await assignRosterChannel(call, order[index] as string, sectionId, index);
        }
      });
    },
    async reorderSections(order) {
      return rosterMutate(async () => {
        await reorderRosterSections(call, order);
      });
    },
    async reorderFlat(order) {
      return rosterMutate(async () => {
        await reorderTopOrder(call, order);
      });
    },
    async moveToFlat(channelId, order) {
      return rosterMutate(async () => {
        await assignRosterChannel(call, channelId, undefined);
        await reorderTopOrder(call, order);
      });
    },
    async ensureChannelPins() {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.roster.readOnly) return true;
      const pins = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      if (
        pins.length === snapshot.roster.pins.length &&
        pins.every((channelId, index) => channelId === snapshot.roster.pins[index])
      ) {
        return true;
      }
      return rosterMutate(async () => {
        await setRosterPins(call, pins);
      });
    },
    async ensureFlatTopOrder() {
      const snapshot = clientStore.getSnapshot();
      if (snapshot.roster.readOnly || snapshot.roster.topOrder !== undefined) return true;
      const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
      const pinnedChannelIds = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
      const order = completeFlatEntries(
        undefined,
        snapshot.roster.sections.map((section) => section.id),
        flatRosterChannelIds(snapshot.channels, new Set(pinnedChannelIds)),
        sectioned,
      );
      if (order.length === 0) return true;
      return rosterMutate(async () => {
        await reorderTopOrder(call, order);
      });
    },
  } satisfies RosterActions;
  return { actions, placeCreatedChannelFirst };
}
