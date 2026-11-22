import { Button } from './ds/button.js';
import { menuItemAllowed } from './team-menu.js';
import { useTeamMode } from './team-state.js';
import { memberPage } from './member-page.js';
import { useSearchOpenMark } from './search-open-mark.js';
import { ALL_HOSTS } from './remote-hosts.js';
import { useChannelDockActive } from './channel-dock.js';
import { RemoteHostRows, useRemoteHosts } from './host-tabs.js';
import { EnvironmentOffline } from './environment-panel.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { ChannelHistory } from './channel-history.js';
import { useMemo, useRef, useState, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { Toast } from './ds/toast.js';
import { InstantTooltipScope } from './ds/tooltip.js';
import {
  isBotModeSortMode,
  PINNED_SORT_SCOPE_ID,
} from '@botharness/host-client/shared/bot-mode-settings';
import { useMinuteNow } from './channel-row-status.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import type { QuickSwitcherSource } from './quick-switcher-launcher.js';
import { ShortcutBindings } from './shortcut-bindings.js';
import type { ChannelSelection } from './channel-selection.js';
import { HiddenChannelsModal } from './hidden-channels.js';
import { ungroupedLabel } from './labels.js';
import type { RowCallbacks } from './sidebar-row-memo.js';
import { GitUnavailableNotice, gitReady } from './git-unavailable-notice.js';
import type { RosterSection } from './roster.js';
import { store, type ChannelSummary, type ClientState } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { onCreationRequest } from './create-request.js';
import { useClientFields, useClientStore } from './use-client-store.js';
import { reportFailure } from './diagnostic-log.js';
import {
  SIDEBAR_FIELDS,
  type SidebarProps,
  type ChannelMenuRequest,
  type SectionMenuRequest,
  type CreateRequest,
} from './bot-sidebar-types.js';
import type { SidebarControls } from './bot-sidebar.js';
import { sidebarRoster, useVisibleChannelSelection } from './bot-sidebar-roster.js';
import { useSidebarNavigation, renderQuickSwitcher } from './bot-sidebar-navigation.js';
import { createSidebarRowRenderer, renderSidebarRail } from './bot-sidebar-rows.js';
import { useSidebarMovement, useSidebarPinZones } from './bot-sidebar-movement.js';
import { renderPinnedChannels, renderUnpinZone } from './bot-sidebar-pins.js';
import {
  renderSidebarSections,
  resolveGapTarget,
  sidebarSectionActions,
  renderSectionDialogs,
} from './bot-sidebar-sections.js';
import {
  sidebarCreationMenu,
  sidebarCreationSection,
  renderEnvironmentCreationDialogs,
  renderLocalCreationDialogs,
} from './bot-sidebar-creation.js';
import {
  useSidebarChannelMenu,
  sidebarChannelMenuOpener,
  renderSidebarChannelActions,
} from './bot-sidebar-channel-actions.js';

const selectChannelUnread = (state: ClientState) => state.activityList.channelUnread;

const fallbackShortcutBindings = new ShortcutBindings(undefined);

export function useBotSidebar(
  {
    headerEnd,
    headerTarget,
    onViewProfile,
    onOpenConversation,
    companion,
    wide,
    actions,
    useBotModePrefs,
    setSortMode,
    setSectionSortMode,
    channelSidebar,
    shortcutBindings = fallbackShortcutBindings,
    quickSwitcherSettings,
    dockPanels,
    t,
  }: SidebarProps,
  {
    useSidebarSearchInput,
    renderSidebarHeader,
    renderSidebarIcon,
    plainMarkdown,
    BulkChannelMenu,
    ChannelMoveMenu,
    sectionCreateMenuItems,
  }: SidebarControls,
): ReactElement {
  const state = useClientFields(SIDEBAR_FIELDS);
  const hostTabs = useChannelDockActive();
  const teamMode = useTeamMode(actions.teamCall);
  const member = memberPage() || teamMode?.viewer.kind === 'member';
  const remoteHostsState = useRemoteHosts();
  const remoteOpen = hostTabs && remoteHostsState.open !== undefined;
  const channelUnread = useClientStore(selectChannelUnread);
  const mutedChannelSet = new Set(state.roster.muted);
  const prefs = useBotModePrefs((value) => value);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [pinSortMenuOpen, setPinSortMenuOpen] = useState(false);
  const [hiddenManagerOpen, setHiddenManagerOpen] = useState(false);
  const [channelHistoryOpen, setChannelHistoryOpen] = useState(false);
  const listNow = useMinuteNow();
  const [quickSwitcherSource, setQuickSwitcherSource] = useState<QuickSwitcherSource>();
  const [sectionMenuId, setSectionMenuId] = useState<string | undefined>(undefined);
  const [sectionCreateMenuId, setSectionCreateMenuId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchOpenMark = useSearchOpenMark(searchOpen);
  const [undoToast, setUndoToast] = useState<
    { seq: number; text: string; undo: () => Promise<unknown> } | undefined
  >(undefined);
  const undoSeq = useRef(0);
  const offerUndo = (text: string, undo: () => Promise<unknown>): void => {
    undoSeq.current += 1;
    setUndoToast({ seq: undoSeq.current, text, undo });
  };
  const conversationName = (channelId: string): string => {
    const snapshot = store.getSnapshot();
    const channel = snapshot.channels.find((candidate) => candidate.id === channelId);
    const bot =
      channel?.botSlug === undefined
        ? undefined
        : snapshot.bots.find((candidate) => candidate.slug === channel.botSlug);
    return bot?.displayName ?? channel?.name ?? channelId;
  };
  const sectionName = (sectionId: string | undefined): string =>
    sectionId === undefined
      ? ungroupedLabel(t)
      : (store.getSnapshot().roster.sections.find((section) => section.id === sectionId)?.name ??
        ungroupedLabel(t));
  const unhideChannels = async (ids: readonly string[]): Promise<void> => {
    for (const id of ids) await actions.setChannelHidden(id, false);
  };
  const channelMenu = useSidebarChannelMenu({ state, actions });
  const { setChannelMenu } = channelMenu;
  const [channelSelection, setChannelSelection] = useState<ChannelSelection>({
    ids: [],
    anchorId: undefined,
  });
  const [batchBusy, setBatchBusy] = useState(false);
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const [batchError, setBatchError] = useState<'failed' | 'limit' | 'reorder' | undefined>();

  const pinZones = useSidebarPinZones();
  const [sectionContextMenu, setSectionContextMenu] = useState<SectionMenuRequest | undefined>();
  const [channelRenameTarget, setChannelRenameTarget] = useState<ChannelSummary | undefined>();
  const [createRequest, setCreateRequest] = useState<CreateRequest | undefined>(undefined);
  const [remoteSectionsHost, setRemoteSectionsHost] = useState<{
    id: string;
    name: string;
  }>();
  const createFromWelcome = useMountedResource<HTMLSpanElement>(
    () =>
      onCreationRequest((intent) =>
        setCreateRequest(intent === 'bot' ? { kind: 'bot', source: 'empty' } : { kind: 'channel' }),
      ),
    [],
  );
  const [renameTarget, setRenameTarget] = useState<RosterSection | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<RosterSection | undefined>(undefined);
  const pinZoneArmTimer = useRef<number | undefined>(undefined);
  const { searchInput, searchMount } = useSidebarSearchInput({ state, searchOpen, setSearchOpen });

  const botBySlug = useMemo(() => new Map(state.bots.map((bot) => [bot.slug, bot])), [state.bots]);
  const rowLatest = useRef(new Map<string, RowCallbacks<ChannelMenuRequest>>());
  const rowCallbacks = new Map<string, RowCallbacks<ChannelMenuRequest>>();
  const publishRowCallbacks = useMountedResource<HTMLSpanElement>(() => {
    rowLatest.current = rowCallbacks;
  }, [rowCallbacks]);
  const {
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
  } = sidebarRoster({ state, botBySlug, prefs, hostTabs, member, remoteHostsState, remoteOpen });
  const { selectedChannelIds, selectedChannelSet, selectedItems } = useVisibleChannelSelection({
    visibleChannelIds,
    channelSelection,
    setChannelSelection,
    state,
    t,
  });

  const {
    rosterMount,
    shortcutFor,
    openLocalConversation,
    dragActiveRef,
    activateChannel,
    openQuickSwitcherEntry,
    openQuickSwitcherMessage,
  } = useSidebarNavigation({
    wide,
    visibleChannelIds,
    railPinnedChannels,
    railChannels,
    onOpenConversation,
    quickSwitcherSettings,
    setShowShortcutHints,
    setChannelSelection,
    actions,
    shortcutBindings,
    setQuickSwitcherSource,
    pinZoneArmTimer,
    state,
  });

  const { contextSection, contextSectionIndex, selectSectionMenu, toggleSection } =
    sidebarSectionActions({
      state,
      sectionContextMenu,
      setSectionMenuId,
      setSectionContextMenu,
      setSectionSortMode,
      actions,
      setRenameTarget,
      setDeleteTarget,
    });

  const selectMenu = sidebarCreationMenu({
    setMenuOpen,
    setCreateRequest,
    remoteHostsState,
    member,
    hostTabs,
    setRemoteSectionsHost,
  });

  const selectSortMenu = (id: string): void => {
    setSortMenuOpen(false);
    if (id === 'channel-history') {
      setChannelHistoryOpen(true);
      return;
    }
    if (id === 'hidden') {
      setHiddenManagerOpen(true);
      return;
    }
    if (id === 'mark-all-read') {
      void actions.markAllRead().catch((error: unknown) => {
        reportFailure('mark-all-read-failed', 'mark all read failed', error);
      });
      return;
    }
    if (isBotModeSortMode(id)) setSortMode(id);
  };

  const selectPinnedSortMenu = (id: string): void => {
    setPinSortMenuOpen(false);
    if (id === 'inherit') {
      setSectionSortMode(PINNED_SORT_SCOPE_ID, undefined);
      return;
    }
    if (isBotModeSortMode(id)) setSectionSortMode(PINNED_SORT_SCOPE_ID, id);
  };

  const openChannelMenu = sidebarChannelMenuOpener({
    selectedChannelSet,
    selectedChannelIds,
    setChannelSelection,
    setMenuOpen,
    setSortMenuOpen,
    setSectionMenuId,
    setSectionCreateMenuId,
    setSectionContextMenu,
    menu: channelMenu,
  });

  const {
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
  } = useSidebarMovement({
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
  });

  const allScope = !member && hostTabs && remoteHostsState.tab === ALL_HOSTS;
  const renderChannelRow = createSidebarRowRenderer({
    allScope,
    channelDragProps,
    botBySlug,
    t,
    startPinDrag,
    activateChannel,
    openChannelMenu,
    allPinnedChannelSet,
    endPinDrag,
    rowCallbacks,
    rowLatest,
    channelUnread,
    mutedChannelSet,
    state,
    selectedBot,
    selectedChannel,
    selectedChannelSet,
    shortcutFor,
    showShortcutHints,
    showSource,
    renderSidebarIcon,
    plainMarkdown,
  });

  if (!wide)
    return renderSidebarRail({
      botBySlug,
      state,
      channelUnread,
      mutedChannelSet,
      selectedChannel,
      selectedBot,
      t,
      shortcutFor,
      showShortcutHints,
      actions,
      railPinnedChannels,
      railChannels,
      plainMarkdown,
    });

  const { createSectionId, createSection } = sidebarCreationSection({ createRequest, state });

  const header = renderSidebarHeader({
    headerTarget,
    searchOpen,
    t,
    hostTabs,
    searchOpenMark,
    searchMount,
    setMenuOpen,
    setSortMenuOpen,
    setSearchOpen,
    searchInput,
    state,
    sortMenuOpen,
    channelUnread,
    prefs,
    selectSortMenu,
    menuOpen,
    remoteHostsState,
    teamMode,
    member,
    selectMenu,
    headerEnd,
  });
  const remoteTab = hostTabs
    ? remoteHostsState.hosts.find((remote) => remote.host.hostId === remoteHostsState.tab)
    : undefined;
  const creationDialogs = renderEnvironmentCreationDialogs({
    createRequest,
    t,
    member,
    hostTabs,
    remoteHostsState,
    setCreateRequest,
    createFromWelcome,
    actions,
    createSection,
    remoteSectionsHost,
    setRemoteSectionsHost,
  });
  if (remoteTab !== undefined)
    return (
      <div className="bh-root bh-region" data-bh-tour="roster">
        {creationDialogs}
        {headerTarget
          ? createPortal(
              <InstantTooltipScope>{header}</InstantTooltipScope>,
              headerTarget,
              'roster-header',
            )
          : header}
        <EnvironmentOffline hostId={remoteTab.host.hostId} t={t} />
        <div className="bh-roster-list">
          <RemoteHostRows
            remote={remoteTab}
            query={query}
            showSource={false}
            onOpen={onOpenConversation}
            t={t}
          />
        </div>
      </div>
    );
  const memberFirstRun =
    state.status === 'ready' &&
    teamMode?.enabled === true &&
    teamMode.viewer.kind === 'member' &&
    state.channels.length === 0;
  const { importZip, marketplace, createSectionDialog, messageBot } = renderLocalCreationDialogs({
    createRequest,
    setCreateRequest,
    t,
    actions,
    createSectionId,
    createSection,
    commitBulkMove,
    setSectionSortMode,
    setBatchError,
    openLocalConversation,
  });
  const { renameSection, renameChannel, deleteSection, sectionMenu } = renderSectionDialogs({
    renameTarget,
    t,
    setRenameTarget,
    actions,
    channelRenameTarget,
    setChannelRenameTarget,
    deleteTarget,
    setDeleteTarget,
    setSectionSortMode,
    createSectionId,
    setCreateRequest,
    sectionContextMenu,
    contextSection,
    contextSectionIndex,
    state,
    prefs,
    selectSectionMenu,
    setSectionContextMenu,
  });
  const {
    channelActionsMenu,
    nicknameDialog,
    publishingDialog,
    avatarDialog,
    sharingDialog,
    deletionDialog,
    modelDialog,
  } = renderSidebarChannelActions({
    menu: channelMenu,
    allScope,
    state,
    selectedItems,
    allPinnedChannelSet,
    t,
    setCreateRequest,
    commitBulkPin,
    commitBulkHide,
    commitBulkMove,
    sectionOfChannel,
    channelUnread,
    actions,
    mutedChannelSet,
    onViewProfile,
    channelSidebar,
    dockPanels,
    companion,
    setChannelRenameTarget,
    offerUndo,
    conversationName,
    commitChannelMenuMove,
    ChannelMoveMenu,
    BulkChannelMenu,
  });
  return (
    <div
      ref={rosterMount}
      className="bh-root bh-region"
      data-bh-tour="roster"
      onDragOver={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) {
          clearGapHover();
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        channelGapDropProps(resolved.sectionId).hover(resolved.half);
      }}
      onDrop={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) return;
        event.preventDefault();
        channelGapDropProps(resolved.sectionId).drop(resolved.half);
      }}
    >
      {creationDialogs}
      <span ref={publishRowCallbacks} hidden aria-hidden="true" />
      {state.activitySync === 'stale' ? (
        <div className="bh-activity-stale" role="status" data-activity-stale>
          {t('roster.activityStale')}
        </div>
      ) : null}
      <GitUnavailableNotice
        git={state.git}
        onInstall={() => {
          void actions.installGit();
        }}
        onRecheck={() => {
          void actions.refreshGit();
        }}
        t={t}
      />
      {headerTarget
        ? createPortal(
            <InstantTooltipScope>{header}</InstantTooltipScope>,
            headerTarget,
            'roster-header',
          )
        : header}
      {state.status === 'loading' && state.bots.length === 0 ? (
        <LoadingSkeleton kind="roster" label={t('roster.loading')} />
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">{t('roster.error', { error: state.error })}</div>
      ) : null}
      {state.roster.readOnly ? <div className="bh-note">{t('roster.readOnly')}</div> : null}
      {memberFirstRun && teamMode !== undefined ? (
        <PanelEmptyState icon="hash">
          {t('team.firstRun.empty')}
          <span className="bh-empty-actions">
            {menuItemAllowed('message-person', teamMode.viewer) ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateRequest({ kind: 'message-person' })}
              >
                {t('team.dm.menu')}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCreateRequest({ kind: 'message-bot' })}
            >
              {t('team.bots.menu')}
            </Button>
          </span>
        </PanelEmptyState>
      ) : null}
      {state.status === 'ready' &&
      state.bots.length === 0 &&
      !(teamMode?.enabled === true && teamMode.viewer.kind === 'member') ? (
        <PanelEmptyState
          icon="hash"
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={!gitReady(state.git)}
              onClick={() => setCreateRequest({ kind: 'bot', source: 'empty' })}
            >
              {t('roster.empty.create')}
            </Button>
          }
        >
          {t('roster.empty')}
        </PanelEmptyState>
      ) : null}
      {!memberFirstRun &&
      visibleCount === 0 &&
      (state.bots.length > 0 || state.channels.length > 0) ? (
        <PanelEmptyState icon="hash">
          {query.length === 0 && hiddenItems.length > 0 ? t('hidden.all') : t('roster.noMatch')}
        </PanelEmptyState>
      ) : null}
      {batchError !== undefined ? (
        <div className="bh-error">
          {t(
            batchError === 'limit'
              ? 'bulk.limit'
              : batchError === 'reorder'
                ? 'pin.reorderFailed'
                : 'bulk.failed',
          )}
        </div>
      ) : null}
      {renderPinnedChannels({
        pinZones,
        hasPinnableChannels,
        allScope,
        hasPinnedChannels,
        t,
        commitPinDrop,
        pinSortMenuOpen,
        setPinSortMenuOpen,
        prefs,
        selectPinnedSortMenu,
        pinnedChannels,
        botBySlug,
        selectedChannel,
        selectedBot,
        channelDragProps,
        sectionOfChannel,
        state,
        selectedChannelSet,
        showShortcutHints,
        shortcutFor,
        activateChannel,
        startPinDrag,
        endPinDrag,
        commitPinnedReorder,
        openChannelMenu,
        channelUnread,
        listNow,
        mutedChannelSet,
      })}
      {renderUnpinZone({
        pinZones,
        t,
        clearGapHover,
        commitPinDrop,
      })}
      {renderSidebarSections({
        showSource,
        environmentChannels,
        renderChannelRow,
        sectionOfChannel,
        query,
        onOpenConversation,
        t,
        flatBlocks,
        channelDragActive,
        channelDragProps,
        botBySlug,
        state,
        listNow,
        sectionMenuId,
        sectionCreateMenuId,
        sectionDragProps,
        channelGapDropProps,
        channelScopeDropProps,
        setMenuOpen,
        setSortMenuOpen,
        setSectionMenuId,
        setSectionCreateMenuId,
        setChannelMenu,
        setSectionContextMenu,
        toggleSection,
        prefs,
        selectSectionMenu,
        member,
        setCreateRequest,
        sectionCreateMenuItems,
      })}
      {importZip}
      {marketplace}
      {createSectionDialog}
      {messageBot}
      {renameSection}
      {renameChannel}
      {deleteSection}
      {renderQuickSwitcher({
        quickSwitcherSource,
        state,
        rosterHiddenIds,
        quickSwitcherSettings,
        setQuickSwitcherSource,
        actions,
        openQuickSwitcherMessage,
        botBySlug,
        shortcutBindings,
        t,
        openQuickSwitcherEntry,
      })}
      {channelHistoryOpen ? (
        <ChannelHistory actions={actions} t={t} onClose={() => setChannelHistoryOpen(false)} />
      ) : null}
      {hiddenManagerOpen ? (
        <HiddenChannelsModal
          items={hiddenItems}
          t={t}
          onRestore={(channelId) => {
            void actions.setChannelHidden(channelId, false);
          }}
          onOpen={(channelId) => {
            setHiddenManagerOpen(false);
            openLocalConversation();
            void actions.openChannel(channelId);
          }}
          onClose={() => {
            setHiddenManagerOpen(false);
          }}
        />
      ) : null}
      {sectionMenu}
      {channelActionsMenu}
      {nicknameDialog}
      {publishingDialog}
      {avatarDialog}
      {sharingDialog}
      {deletionDialog}
      {modelDialog}
      {undoToast === undefined ? null : (
        <Toast
          key={undoToast.seq}
          text={undoToast.text}
          holdMs={6000}
          actions={[
            {
              label: t('undo.action'),
              onClick: () => {
                const { undo } = undoToast;
                setUndoToast(undefined);
                void undo();
              },
            },
          ]}
          onDone={() =>
            setUndoToast((current) => (current?.seq === undoToast.seq ? undefined : current))
          }
        />
      )}
    </div>
  );
}
