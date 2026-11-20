import {
  PINNED_SORT_SCOPE_ID,
  type BotModeSortMode,
} from '@botharness/host-client/shared/bot-mode-settings';
import type { BridgeActions } from './actions.js';
import type { BotModePrefsSnapshot } from './bot-mode-prefs.js';
import type { ChannelSelection } from './channel-selection.js';
import {
  useChannelDrag,
  useSectionDrag,
  type ChannelDropTarget,
  type ScopeId,
  type SectionDropTarget,
} from './channel-drag.js';
import type { BotHarnessTranslate } from './locale.js';
import {
  applyChannelMove,
  completeFlatEntries,
  flatRosterChannelIds,
  moveWithinOrder,
  planChannelMove,
  planFlatInsert,
  resolvePinnedChannelIds,
  type ChannelMoveSink,
  type FlatAnchor,
  type ScopeDropTarget,
} from './roster-order.js';
import { store, type ChannelSummary } from './store.js';
import { useState, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type { ChannelMenuRequest, PinDragState, BatchError } from './bot-sidebar-types.js';

export function useSidebarPinZones() {
  const [pinDrag, setPinDrag] = useState<PinDragState | undefined>(undefined);
  const [pinReorderTarget, setPinReorderTarget] = useState<
    { channelId: string; half: 'before' | 'after' } | undefined
  >(undefined);
  const [pinZoneArmed, setPinZoneArmed] = useState(false);
  const [pinZoneHovered, setPinZoneHovered] = useState(false);
  const [unpinZoneArmed, setUnpinZoneArmed] = useState(false);
  const [unpinZoneHovered, setUnpinZoneHovered] = useState(false);
  return {
    pinDrag,
    setPinDrag,
    pinReorderTarget,
    setPinReorderTarget,
    pinZoneArmed,
    setPinZoneArmed,
    pinZoneHovered,
    setPinZoneHovered,
    unpinZoneArmed,
    setUnpinZoneArmed,
    unpinZoneHovered,
    setUnpinZoneHovered,
  };
}

export function useSidebarMovement({
  pinZones,
  actions,
  setSectionSortMode,
  scopeChannelsOf,
  prefs,
  sectionOfChannel,
  offerUndo,
  t,
  conversationName,
  sectionName,
  batchBusy,
  setChannelMenu,
  setBatchError,
  setBatchBusy,
  setChannelSelection,
  unhideChannels,
  pinZoneArmTimer,
  hasPinnedChannels,
  orderedPinnedIds,
  dragActiveRef,
}: {
  pinZones: ReturnType<typeof useSidebarPinZones>;
  actions: BridgeActions;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  scopeChannelsOf: (scopeId: ScopeId) => ChannelSummary[];
  prefs: BotModePrefsSnapshot;
  sectionOfChannel: (channelId: string) => string | undefined;
  offerUndo: (text: string, undo: () => Promise<unknown>) => void;
  t: BotHarnessTranslate;
  conversationName: (channelId: string) => string;
  sectionName: (sectionId: string | undefined) => string;
  batchBusy: boolean;
  setChannelMenu: Dispatch<SetStateAction<ChannelMenuRequest | undefined>>;
  setBatchError: Dispatch<SetStateAction<BatchError | undefined>>;
  setBatchBusy: Dispatch<SetStateAction<boolean>>;
  setChannelSelection: Dispatch<SetStateAction<ChannelSelection>>;
  unhideChannels: (ids: readonly string[]) => Promise<void>;
  pinZoneArmTimer: MutableRefObject<number | undefined>;
  hasPinnedChannels: boolean;
  orderedPinnedIds: string[];
  dragActiveRef: MutableRefObject<boolean>;
}) {
  const {
    pinDrag,
    setPinDrag,
    setPinReorderTarget,
    setPinZoneArmed,
    setPinZoneHovered,
    setUnpinZoneArmed,
    setUnpinZoneHovered,
  } = pinZones;
  const moveSink: ChannelMoveSink = {
    assignToUngrouped: (channelId) => {
      void actions.assignChannel(channelId, undefined);
    },
    moveToSection: (channelId, sectionId, order) => {
      void actions.moveChannel(channelId, sectionId, order);
    },
    setSectionManual: (sectionId) => {
      setSectionSortMode(sectionId, 'manual');
    },
  };

  const runChannelMove = (
    channelId: string,
    sourceScopeId: ScopeId,
    targetScopeId: ScopeId,
    target: ScopeDropTarget,
  ): void => {
    const plan = planChannelMove(sourceScopeId, channelId, {
      targetScopeId,
      target,
      targetOrder: scopeChannelsOf(targetScopeId).map((channel) => channel.id),
      targetManualOverride:
        targetScopeId !== undefined && prefs.sortModes[targetScopeId] === 'manual',
    });
    const movingPinned = pinDrag?.source === 'pinned' && pinDrag.channelId === channelId;
    if (plan === undefined) {
      if (movingPinned && targetScopeId !== undefined && sourceScopeId === targetScopeId) {
        void actions.setChannelPinned(channelId, false);
        endPinDrag();
      }
      return;
    }
    if (movingPinned) {
      if (plan.kind === 'section') {
        if (plan.setManualOverride) setSectionSortMode(plan.sectionId, 'manual');
        void actions.movePinnedChannel(channelId, plan.sectionId, plan.order);
      } else {
        void actions.setChannelPinned(channelId, false);
      }
      endPinDrag();
      return;
    }
    applyChannelMove(moveSink, channelId, plan);
  };

  const commitChannelDrag = (
    drag: { scopeId: ScopeId; channelId: string },
    target: ChannelDropTarget,
  ): void => {
    if (target.channelId === drag.channelId) return;
    if (sectionOfChannel(target.channelId) === undefined) {
      runFlatInsert(drag.channelId, drag.scopeId, {
        kind: 'channel',
        id: target.channelId,
        side: target.half,
      });
      return;
    }
    runChannelMove(drag.channelId, drag.scopeId, target.scopeId, {
      kind: 'row',
      channelId: target.channelId,
      half: target.half,
    });
  };

  const commitChannelScopeDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    scopeId: ScopeId,
  ): void => {
    runChannelMove(drag.channelId, drag.scopeId, scopeId, {
      kind: 'scope',
      position: 'first',
    });
  };

  const runFlatInsert = (channelId: string, sourceScopeId: ScopeId, anchor: FlatAnchor): void => {
    const snapshot = store.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const snapshotPinned = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
    const snapshotChannelIds = flatRosterChannelIds(snapshot.channels, new Set(snapshotPinned));
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      snapshotChannelIds,
      sectioned,
    );
    const movingPinned = pinDrag?.source === 'pinned' && pinDrag.channelId === channelId;
    const plan = planFlatInsert(
      flat,
      channelId,
      movingPinned || sourceScopeId !== undefined,
      anchor,
    );
    if (plan === undefined) return;
    if (movingPinned) {
      void actions.movePinnedChannelToFlat(channelId, plan.order);
      endPinDrag();
      return;
    }
    if (plan.unassign) {
      void actions.moveToFlat(channelId, plan.order);
    } else {
      void actions.reorderFlat(plan.order);
    }
  };

  const commitChannelGapDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    target: { sectionId: string; half: 'before' | 'after' },
  ): void => {
    runFlatInsert(drag.channelId, drag.scopeId, {
      kind: 'section',
      id: target.sectionId,
      side: target.half,
    });
  };

  const commitChannelMenuMove = (
    channelId: string,
    targetSectionId: string | undefined,
    pinned: boolean,
  ): void => {
    if (!pinned) {
      const sourceSectionId = sectionOfChannel(channelId);
      if (sourceSectionId === targetSectionId) return;
      runChannelMove(channelId, sourceSectionId, targetSectionId, {
        kind: 'scope',
      });
      offerUndo(
        t('undo.moved', {
          name: conversationName(channelId),
          section: sectionName(targetSectionId),
        }),
        async () => {
          runChannelMove(channelId, targetSectionId, sourceSectionId, {
            kind: 'scope',
          });
        },
      );
      return;
    }
    if (targetSectionId !== undefined) {
      const order = [
        ...scopeChannelsOf(targetSectionId)
          .map((channel) => channel.id)
          .filter((id) => id !== channelId),
        channelId,
      ];
      setSectionSortMode(targetSectionId, 'manual');
      void actions.movePinnedChannel(channelId, targetSectionId, order);
      return;
    }
    const snapshot = store.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      flatRosterChannelIds(
        snapshot.channels,
        new Set(resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins)),
      ),
      sectioned,
    );
    void actions.movePinnedChannelToFlat(channelId, [...flat, { kind: 'channel', id: channelId }]);
  };

  const commitSectionDrag = (sectionId: string, target: SectionDropTarget): void => {
    const order = moveWithinOrder(
      store.getSnapshot().roster.sections.map((section) => section.id),
      sectionId,
      target.sectionId,
      target.half,
    );
    if (order === undefined) return;
    void actions.reorderSections(order);
  };

  const commitBulkChange = async (
    input: Parameters<BridgeActions['batchRoster']>[0],
  ): Promise<void> => {
    if (batchBusy) return;
    setChannelMenu(undefined);
    if (input.channelIds.length > 100) {
      setBatchError('limit');
      return;
    }
    setBatchBusy(true);
    setBatchError(undefined);
    const priorSections = new Map(
      input.channelIds.map((channelId) => [channelId, sectionOfChannel(channelId)] as const),
    );
    const previousSortMode =
      input.action === 'move' && input.sectionId !== undefined
        ? prefs.sortModes[input.sectionId]
        : undefined;
    if (input.action === 'move' && input.sectionId !== undefined) {
      setSectionSortMode(input.sectionId, 'manual');
    }
    const succeeded = await actions.batchRoster(input);
    setBatchBusy(false);
    if (!succeeded) {
      if (input.action === 'move' && input.sectionId !== undefined) {
        setSectionSortMode(input.sectionId, previousSortMode);
      }
      setBatchError('failed');
      return;
    }
    setChannelSelection({ ids: [], anchorId: undefined });
    const count = input.channelIds.length;
    if (input.action === 'hide') {
      offerUndo(t('undo.hiddenMany', { count }), () => unhideChannels(input.channelIds));
    } else if (input.action === 'move') {
      offerUndo(t('undo.movedMany', { count, section: sectionName(input.sectionId) }), () =>
        restoreSections(priorSections),
      );
    }
  };

  const restoreSections = async (prior: ReadonlyMap<string, string | undefined>): Promise<void> => {
    const groups = new Map<string | undefined, string[]>();
    for (const [channelId, sectionId] of prior)
      groups.set(sectionId, [...(groups.get(sectionId) ?? []), channelId]);
    for (const [sectionId, channelIds] of groups)
      await actions.batchRoster({
        action: 'move',
        channelIds,
        ...(sectionId === undefined ? {} : { sectionId }),
      });
  };

  const commitBulkPin = (ids: readonly string[], targetPinned: boolean): Promise<void> =>
    commitBulkChange({
      action: targetPinned ? 'pin' : 'unpin',
      channelIds: ids,
    });

  const commitBulkHide = (ids: readonly string[]): Promise<void> =>
    commitBulkChange({ action: 'hide', channelIds: ids });

  const commitBulkMove = (
    ids: readonly string[],
    targetSectionId: string | undefined,
  ): Promise<void> =>
    commitBulkChange({
      action: 'move',
      channelIds: ids,
      ...(targetSectionId === undefined ? {} : { sectionId: targetSectionId }),
    });
  const startPinDrag = (channelId: string, source: PinDragState['source']): void => {
    if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    setPinDrag({ channelId, source });
    if (source === 'roster' && hasPinnedChannels) return;
    pinZoneArmTimer.current = window.setTimeout(() => {
      pinZoneArmTimer.current = undefined;
      if (source === 'roster') setPinZoneArmed(true);
      else setUnpinZoneArmed(true);
    }, 0);
  };

  const endPinDrag = (): void => {
    if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    pinZoneArmTimer.current = undefined;
    setPinDrag(undefined);
    setPinZoneArmed(false);
    setPinReorderTarget(undefined);
    setPinZoneHovered(false);
    setUnpinZoneArmed(false);
    setUnpinZoneHovered(false);
  };

  const commitPinDrop = (pinned: boolean): void => {
    if (pinDrag === undefined) return;
    if (pinned ? pinDrag.source !== 'roster' : pinDrag.source !== 'pinned') return;
    void actions.setChannelPinned(pinDrag.channelId, pinned);
    endPinDrag();
  };

  const commitPinnedReorder = (
    sourceId: string,
    targetId: string,
    half: 'before' | 'after',
  ): void => {
    const order = moveWithinOrder(orderedPinnedIds, sourceId, targetId, half);
    if (order === undefined) return;
    setBatchError(undefined);
    void actions
      .reorderPinnedChannels(order, () => {
        setSectionSortMode(PINNED_SORT_SCOPE_ID, 'manual');
      })
      .then((succeeded) => {
        if (!succeeded) setBatchError('reorder');
      });
    endPinDrag();
  };

  const {
    active: channelDragActive,
    propsFor: channelDragProps,
    scopePropsFor: channelScopeDropProps,
    gapPropsFor: channelGapDropProps,
    clearGapHover,
  } = useChannelDrag(commitChannelDrag, commitChannelScopeDrop, commitChannelGapDrop);
  const { active: sectionDragActive, propsFor: sectionDragProps } =
    useSectionDrag(commitSectionDrag);
  dragActiveRef.current = channelDragActive || sectionDragActive;
  return {
    commitChannelMenuMove,
    commitBulkPin,
    commitBulkHide,
    commitBulkMove,
    startPinDrag,
    endPinDrag,
    commitPinDrop,
    commitPinnedReorder,
    channelDragActive,
    channelDragProps,
    channelScopeDropProps,
    channelGapDropProps,
    clearGapHover,
    sectionDragProps,
  };
}
