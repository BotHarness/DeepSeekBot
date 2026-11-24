import { legacyChannelSplit, splitPanels, type ChannelSplit } from './channel-split-layout.js';
import { workspaceColumns, moveWorkspaceRail } from './workspace-layout.js';
import { WORKSPACE_RAIL, WORKSPACE_CHANNELS } from './workspace-context.js';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { DockviewReact } from 'dockview-react';
import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { DockPanelChannel, DockPanelHost, DockPanelRegistration } from './dock-panels.js';
import {
  CHANNEL_BODY_PANEL,
  DEFAULT_WORKSPACE_GAP,
  clearChannelDock,
  DEFAULT_CHANNEL_WORKSPACE,
  type ChannelWorkspaceState,
  type ChannelDockStorage,
} from './channel-dock-layout.js';
import {
  DEFAULT_SIMPLE_CHANNELS_WIDTH,
  DEFAULT_SUBPANEL_COLUMN,
  MIN_SUBPANEL_HEIGHT,
} from './layout-mode.js';
import type { BotHarnessTranslate } from './locale.js';
import { useStableProps } from './entry-part.js';
import { useLayoutSettingsControl } from './layout-settings-control.js';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';
import { styles, DOCK_DND_EDGES } from './channel-dock/dock-styles.js';
import {
  type EntryRuntime,
  type ChannelInboxView,
  type ChannelSessionView,
  type ChannelFilesView,
  type ChannelHeaderView,
  type DockContextValue,
  type DockSlots,
  DockContext,
  DockSlotContext,
  IDLE_RUNTIME,
  useSame,
  sameData,
} from './channel-dock/dock-context.js';
import { ChannelDockTab } from './channel-dock/panel-header.js';
import { COMPONENTS, buildDefaultLayout } from './channel-dock/layout.js';
import { ChannelDockPanelsMenu } from './channel-dock/panels-menu.js';
import { useDockLayoutMode } from './channel-dock/use-dock-layout-mode.js';
import { useDockPanels } from './channel-dock/use-dock-panels.js';
import { SESSION_DETAIL } from './channel-dock/subpanel-column.js';
export {
  useChannelDockActive,
  useChannelPanelClose,
  useDockPanelOpener,
  useChannelsHeader,
  type ChannelSessionView,
  type ChannelFilesView,
  type ChannelHeaderView,
} from './channel-dock/dock-context.js';

const passthroughConversation = (node: ReactNode): ReactNode => node;

export interface ChannelDockProps {
  conversation?: ((node: ReactNode) => ReactNode) | undefined;
  hasBots?: boolean | undefined;
  header?: ChannelHeaderView | undefined;
  body: ReactNode;
  files?: ChannelFilesView | undefined;
  inbox?: ChannelInboxView | undefined;
  session?: ChannelSessionView | undefined;
  revealBody?: boolean | undefined;
  panels: readonly DockPanelRegistration[];
  channel?: DockPanelChannel | undefined;
  registry?: DockPanelHost | undefined;
  entryProps: ChannelSidebarEntryProps | undefined;
  shows(entry: ChannelSidebarEntry): boolean;
  t: BotHarnessTranslate;
  storage?: ChannelDockStorage | undefined;
  channelIds?: (() => readonly string[]) | undefined;
}

let workspaceDocks = 0;
function markWorkspaceDock(): () => void {
  workspaceDocks += 1;
  document.documentElement.setAttribute('data-bh-workspace-dock', '');
  return () => {
    workspaceDocks -= 1;
    if (workspaceDocks === 0) document.documentElement.removeAttribute('data-bh-workspace-dock');
  };
}

export function ChannelDock({
  conversation = passthroughConversation,
  hasBots = true,
  header,
  body,
  files,
  inbox,
  session,
  revealBody = false,
  panels,
  channel,
  registry,
  entryProps,
  shows,
  t,
  storage,
  channelIds,
}: ChannelDockProps): ReactElement {
  const dockLayoutMode = useDockLayoutMode({ storage });
  const {
    botPanelIds,
    channelPanelIds,
    storageFailed,
    seed,
    updateChannelWorkspaces,
    channelWorkspacesRef,
    sessionState,
    botSeeds,
    updateBotWorkspaces,
    botWorkspacesRef,
    botStates,
    updateChannelSplits,
    channelSplitsRef,
    childTree,
    botStatesRef,
    sessionStateRef,
    channelsHeader,
    setChannelsHeader,
    gap,
    updateGap,
    workspaceMode,
    theme,
    gapRef,
    order,
    updateOrder,
    orderRef,
    hiddenControls,
    updateHiddenControls,
    hiddenControlsRef,
    members,
    updateMembers,
    membersRef,
    dropX,
    setDropX,
    api,
    openIds,
    runtimes,
    setRuntimes,
    unregistered,
    parked,
    visibilityLayout,
    byId,
    columnFocus,
    save,
    addEntryPanel,
    buildSimpleLayout,
    setColumn,
    setMode,
    onReady,
    geometryMount,
    registryMount,
    inboxStateMount,
    setSubpanelState,
    subpanelState,
    close,
    open,
    layoutMount,
    channelRef,
    fitSideColumn,
    reportOpen,
    showSimpleView,
  } = useDockPanels(
    { hasBots, files, inbox, session, revealBody, panels, channel, registry, storage },
    dockLayoutMode,
  );
  const { workspace, layoutMode, simpleRef, isSimple, sideSizedAt, setSimpleLayout } =
    dockLayoutMode;

  const menu = (
    <ChannelDockPanelsMenu
      panels={panels.filter((panel) => panel.id !== 'bot-inbox')}
      openIds={openIds}
      t={t}
      onToggle={(id) => (api?.getPanel(id) === undefined ? open(id) : close(id))}
      onReset={() => {
        if (api === undefined) return;
        clearChannelDock(storage);
        parked.current = {};
        visibilityLayout.current = undefined;
        buildDefaultLayout(
          api,
          new Map([...byId].filter(([id]) => !workspace || !channelPanelIds.includes(id))),
        );
        save(api);
      }}
    />
  );

  const reset = () => {
    if (!api) return;
    if (isSimple()) {
      setSimpleLayout({
        ...simpleRef.current,
        sideColumn: WORKSPACE_CHANNELS,
        channelsWidth: DEFAULT_SIMPLE_CHANNELS_WIDTH,
        column: DEFAULT_SUBPANEL_COLUMN,
      });
      buildSimpleLayout(api);
      save(api);
      return;
    }
    parked.current = {};
    visibilityLayout.current = undefined;
    unregistered.current = {};
    botSeeds.current = {};
    botWorkspacesRef.current = {};
    updateBotWorkspaces({});
    botStatesRef.current = Object.fromEntries(
      botPanelIds.map((id) => [id, { ...DEFAULT_CHANNEL_WORKSPACE, open: false }]),
    );
    channelSplitsRef.current = {};
    updateChannelSplits({});
    seed.current = DEFAULT_CHANNEL_WORKSPACE;
    channelWorkspacesRef.current = {};
    updateChannelWorkspaces({});
    sessionStateRef.current = DEFAULT_CHANNEL_WORKSPACE;
    files?.setOpen(false);
    inbox?.setOpen(false);
    gapRef.current = DEFAULT_WORKSPACE_GAP;
    updateGap(DEFAULT_WORKSPACE_GAP);
    orderRef.current = [];
    updateOrder([]);
    hiddenControlsRef.current = [];
    updateHiddenControls([]);
    membersRef.current = { open: false, ratio: 0.3 };
    updateMembers(membersRef.current);
    buildDefaultLayout(
      api,
      new Map([...byId].filter(([id]) => !workspace || !channelPanelIds.includes(id))),
    );
    const channels = byId.get(WORKSPACE_CHANNELS);
    if (workspace && channels) addEntryPanel(api, channels, undefined);
    if (workspace)
      api.addPanel({
        id: WORKSPACE_RAIL,
        component: WORKSPACE_RAIL,
        position: { direction: 'left' },
      });
    save(api);
  };
  const handlers = {
    setTree: (next: ChannelSplit) => {
      if (!channel) return;
      channelSplitsRef.current = { ...channelSplitsRef.current, [channel.id]: next };
      updateChannelSplits(channelSplitsRef.current);
      if (api) save(api);
    },
    setSubpanelState,
    toggle: (id: string) =>
      subpanelState(id).open && api?.getPanel(CHANNEL_BODY_PANEL) ? close(id) : open(id),
    setMembers: (next: { open?: boolean; ratio?: number }) => {
      if (next.open) {
        files?.setOpen(false);
        inbox?.setOpen(false);
      }
      membersRef.current = {
        open: next.open ?? membersRef.current.open,
        ratio:
          next.ratio === undefined
            ? membersRef.current.ratio
            : Math.min(0.6, Math.max(0.2, next.ratio)),
      };
      updateMembers(membersRef.current);
      if (api) save(api);
    },
    setFilesOpen: (open: boolean) => files?.setOpen(open),
    setInboxOpen: (open: boolean) => inbox?.setOpen(open),
    setColumnOpen: (open: boolean) => setColumn({ ...simpleRef.current.column, open }),
    toggleColumnEntry: (id: string) => {
      const column = simpleRef.current.column;
      setColumn({
        ...column,
        expanded: column.expanded.includes(id)
          ? column.expanded.filter((item) => item !== id)
          : [...column.expanded, id],
      });
    },
    setColumnHidden: (id: string, hidden: boolean) => {
      const column = simpleRef.current.column;
      setColumn({
        ...column,
        hidden: hidden
          ? [...new Set([...column.hidden, id])]
          : column.hidden.filter((item) => item !== id),
      });
    },
    setColumnWidth: (width: number) =>
      setColumn({ ...simpleRef.current.column, width: Math.min(0.6, Math.max(0.2, width)) }),
    setColumnHeight: (id: string, height: number) => {
      const column = simpleRef.current.column;
      setColumn({
        ...column,
        heights: { ...column.heights, [id]: Math.max(MIN_SUBPANEL_HEIGHT, Math.round(height)) },
      });
    },
    setColumnOrder: (order: readonly string[]) =>
      setColumn({ ...simpleRef.current.column, order: [...order] }),
    open,
    close,
  };
  const actions = useRef(handlers);
  actions.current = handlers;
  const settingsMount = useLayoutSettingsControl(workspaceMode && api !== undefined, {
    snapshot: () => ({
      global: simpleRef.current,
      rail: { order: orderRef.current, hidden: hiddenControlsRef.current },
      channels: channelWorkspacesRef.current,
      seed: seed.current,
      activeChannelId: channelRef.current?.id,
      knownChannelIds: channelIds?.() ?? [],
      gap: gapRef.current,
      members: membersRef.current,
      splits: channelSplitsRef.current,
      splitOf: (id, saved) => {
        let tree =
          saved ??
          legacyChannelSplit({
            ...Object.fromEntries(
              botPanelIds.map((panel) => [
                panel,
                botWorkspacesRef.current[id]?.[panel] ??
                  botSeeds.current[panel] ?? { ...DEFAULT_CHANNEL_WORKSPACE, open: false },
              ]),
            ),
            sessions: channelWorkspacesRef.current[id] ?? seed.current,
          });
        const showing =
          id === channel?.id && session !== undefined
            ? [...channelPanelIds, SESSION_DETAIL]
            : channelPanelIds;
        for (const panel of showing)
          if (!splitPanels(tree).includes(panel))
            tree = { axis: 'horizontal', ratio: 0.7, first: tree, second: { panel } };
        return tree;
      },
    }),
    apply: ({ global, rail, channel: edit, gap: nextGap, members: nextMembers }) => {
      if (edit?.state) {
        const state = edit.state;
        channelWorkspacesRef.current = { ...channelWorkspacesRef.current, [edit.id]: state };
        if (edit.id === channelRef.current?.id) sessionStateRef.current = state;
        updateChannelWorkspaces(channelWorkspacesRef.current);
      }
      if (edit?.split !== undefined) {
        const { [edit.id]: _previous, ...rest } = channelSplitsRef.current;
        channelSplitsRef.current = edit.split === null ? rest : { ...rest, [edit.id]: edit.split };
        updateChannelSplits(channelSplitsRef.current);
      }
      if (nextGap !== undefined) {
        gapRef.current = nextGap;
        updateGap(nextGap);
      }
      if (nextMembers) {
        if (nextMembers.open && channelRef.current?.type === 'group') {
          files?.setOpen(false);
          inbox?.setOpen(false);
        }
        membersRef.current = nextMembers;
        updateMembers(nextMembers);
      }
      if (rail) {
        const hiding = rail.hidden.filter((id) => !hiddenControlsRef.current.includes(id));
        orderRef.current = rail.order;
        updateOrder(rail.order);
        hiddenControlsRef.current = rail.hidden;
        updateHiddenControls(rail.hidden);
        for (const id of hiding) close(id);
      }
      const switching = global !== undefined && global.mode !== simpleRef.current.mode;
      if (global) {
        const previous = simpleRef.current;
        setSimpleLayout({ ...global, mode: previous.mode });
        if (switching) setMode(global.mode);
        else if (api && isSimple()) {
          if (global.sideColumn !== previous.sideColumn) showSimpleView(api, global.sideColumn);
          sideSizedAt.current = 0;
          fitSideColumn(api);
        }
        if (api) reportOpen(api);
      }
      if (api && !switching) save(api);
    },
  });
  const [stable] = useState(() => ({
    setTree: (next: ChannelSplit) => actions.current.setTree(next),
    setFilesOpen: (open: boolean) => actions.current.setFilesOpen(open),
    setInboxOpen: (open: boolean) => actions.current.setInboxOpen(open),
    setColumnOpen: (open: boolean) => actions.current.setColumnOpen(open),
    toggleColumnEntry: (id: string) => actions.current.toggleColumnEntry(id),
    setColumnHidden: (id: string, hidden: boolean) => actions.current.setColumnHidden(id, hidden),
    setColumnWidth: (width: number) => actions.current.setColumnWidth(width),
    setColumnHeight: (id: string, height: number) => actions.current.setColumnHeight(id, height),
    setColumnOrder: (order: readonly string[]) => actions.current.setColumnOrder(order),
    setMembersOpen: (open: boolean) => actions.current.setMembers({ open }),
    setMembersRatio: (ratio: number) => actions.current.setMembers({ ratio }),
    subpanel: (id: string) => ({
      setState: (next: ChannelWorkspaceState) => actions.current.setSubpanelState(id, next),
      toggle: () => actions.current.toggle(id),
    }),
    setRuntime: (entryId: string, next: Partial<EntryRuntime>) =>
      setRuntimes((current) => {
        const updated = new Map(current);
        updated.set(entryId, { ...(current.get(entryId) ?? IDLE_RUNTIME), ...next });
        return updated;
      }),
    open: (panelId: string) => actions.current.open(panelId),
    close: (panelId: string) => actions.current.close(panelId),
  }));
  const subpanels = useRef(new Map<string, ReturnType<typeof stable.subpanel>>());
  const subpanel = (id: string) => {
    let handlers = subpanels.current.get(id);
    if (handlers === undefined) {
      handlers = stable.subpanel(id);
      subpanels.current.set(id, handlers);
    }
    return handlers;
  };
  const stablePanelIds = useSame(channelPanelIds, sameData);
  const stableTree = useSame(childTree, sameData);
  const stableBotStates = useSame(botStates, sameData);
  const childLayout = useMemo(
    () => ({ tree: stableTree, setTree: stable.setTree }),
    [stableTree, stable],
  );
  const botWorkspaceValue = useMemo(
    () =>
      workspaceMode
        ? Object.fromEntries(
            Object.entries(stableBotStates).map(([id, state]) => [id, { state, ...subpanel(id) }]),
          )
        : undefined,
    [workspaceMode, stableBotStates],
  );
  const sessionWorkspace = useMemo(
    () => (workspaceMode ? { state: sessionState, ...subpanel('sessions') } : undefined),
    [workspaceMode, sessionState],
  );
  const memberValue = useMemo(
    () =>
      workspaceMode
        ? { ...members, setOpen: stable.setMembersOpen, setRatio: stable.setMembersRatio }
        : undefined,
    [workspaceMode, members, stable],
  );
  const simpleMode = workspaceMode && layoutMode.mode === 'simple';
  const columnValue = useMemo(
    () =>
      simpleMode
        ? {
            state: layoutMode.column,
            focus: columnFocus,
            setOpen: stable.setColumnOpen,
            toggleEntry: stable.toggleColumnEntry,
            setHidden: stable.setColumnHidden,
            setWidth: stable.setColumnWidth,
            setHeight: stable.setColumnHeight,
            setOrder: stable.setColumnOrder,
          }
        : undefined,
    [simpleMode, layoutMode.column, columnFocus, stable],
  );
  const hasFiles = files !== undefined;
  const filesValue = useMemo(
    () => (hasFiles ? { open: files.open, setOpen: stable.setFilesOpen } : undefined),
    [hasFiles, files?.open, stable],
  );
  const hasInbox = inbox !== undefined;
  const inboxValue = useMemo(
    () => (hasInbox ? { open: inbox.open, setOpen: stable.setInboxOpen } : undefined),
    [hasInbox, inbox?.open, stable],
  );
  const visibleIds = useSame(
    [...byId.values()].flatMap((panel) =>
      panel.entry !== undefined && shows(panel.entry) ? [panel.id] : [],
    ),
    sameData,
  );
  const visible = useMemo(() => new Set(visibleIds), [visibleIds]);
  const stableEntryProps = useStableProps(entryProps);
  const rail =
    api &&
    workspace?.rail(
      api,
      gap,
      (value) => {
        gapRef.current = value;
        updateGap(value);
        save(api);
      },
      reset,
      order,
      (ids) => {
        orderRef.current = ids;
        updateOrder(ids);
        save(api);
      },
      hiddenControls,
      (id, visible) => {
        hiddenControlsRef.current = visible
          ? hiddenControlsRef.current.filter((item) => item !== id)
          : [...new Set([...hiddenControlsRef.current, id])];
        updateHiddenControls(hiddenControlsRef.current);
        if (!visible) close(id);
        save(api);
      },
      { mode: layoutMode.mode, setMode },
    );
  const value = useSame<DockContextValue>(
    {
      conversation,
      channelPanelIds: stablePanelIds,
      column: columnValue,
      childLayout,
      botWorkspaces: botWorkspaceValue,
      sessionWorkspace,
      hasHeader: header !== undefined,
      files: filesValue,
      inbox: inboxValue,
      session,
      railed: !!rail,
      channelsHeader,
      setChannelsHeader,
      members: memberValue,
      panels: byId,
      channel,
      entryProps: stableEntryProps,
      visible,
      runtimes,
      setRuntime: stable.setRuntime,
      open: stable.open,
      close: stable.close,
      simple: simpleMode,
      t,
    },
    shallowEqual,
  );
  useLayoutEffect(() => {
    if (!workspace) return;
    return markWorkspaceDock();
  }, [workspace]);
  const slots = useMemo<DockSlots>(
    () => ({
      header:
        header === undefined
          ? undefined
          : {
              ...header,
              icon: conversation(header.icon),
              label: header.label === undefined ? undefined : conversation(header.label),
              status: conversation(header.status),
              actions: conversation(header.actions),
            },
      body: conversation(body),
      files: conversation(files?.content),
      rail,
      menu: workspaceMode ? null : menu,
    }),
    [header, body, files?.content, rail, menu, workspaceMode, conversation],
  );

  return (
    <DockContext.Provider value={value}>
      <DockSlotContext.Provider value={slots}>
        <div
          ref={registryMount}
          className="bh-dock"
          data-workspace-dock={workspace ? '' : undefined}
          style={
            workspace
              ? ({
                  padding: gap,
                  gap: 0,
                  '--bh-workspace-gap': `${gap}px`,
                  '--bh-workspace-header-gap': `${Math.min(4, gap / 2)}px`,
                } as React.CSSProperties)
              : undefined
          }
          onDragStartCapture={(event) => {
            const target = event.target as Element;
            if (
              target.closest('.dv-tabs-and-actions-container, .bh-channel-session-header') &&
              (!target.closest('[data-panel-hide]') ||
                (workspaceMode && layoutMode.mode === 'simple'))
            ) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          onDragOverCapture={(event) => {
            if (!workspace || !api || !event.dataTransfer.types.includes('application/x-bh-rail'))
              return;
            event.preventDefault();
            event.stopPropagation();
            const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
            const candidates = [
              0,
              api.width,
              ...workspaceColumns(api).map((column) => column.left),
            ];
            setDropX(
              candidates.reduce((best, next) =>
                Math.abs(next - x) < Math.abs(best - x) ? next : best,
              ),
            );
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null))
              setDropX(undefined);
          }}
          onDragEnd={() => setDropX(undefined)}
          onDropCapture={(event) => {
            if (!workspace || !api || !event.dataTransfer.types.includes('application/x-bh-rail'))
              return;
            event.preventDefault();
            event.stopPropagation();
            const column = workspaceColumns(api).find(
              (column) => Math.abs(column.left - (dropX ?? -200)) < 2,
            );
            moveWorkspaceRail(api, dropX === api.width ? 'right' : (column?.id ?? 'left'));
            setDropX(undefined);
          }}
          data-bh-tour="channel-sidebar"
          role="region"
          aria-label={t('dock.region')}
        >
          {storageFailed && (
            <div role="alert" {...stylex.props(styles.storageWarning)}>
              {t('workspace.storageFailed')}
            </div>
          )}
          <span ref={inboxStateMount} hidden />
          <span ref={layoutMount} hidden />
          <span ref={settingsMount} hidden />
          <span ref={geometryMount} hidden />
          {dropX !== undefined && <span className="bh-workspace-drop" style={{ left: dropX }} />}
          <DockviewReact
            key={workspace ? `workspace-${layoutMode.mode}` : 'legacy'}
            components={COMPONENTS}
            defaultTabComponent={ChannelDockTab}
            singleTabMode="fullwidth"
            disableTabsOverflowList
            disableFloatingGroups
            defaultRenderer="always"
            proportionalLayout
            theme={theme}
            dndEdges={DOCK_DND_EDGES}
            onReady={onReady}
          />
        </div>
      </DockSlotContext.Provider>
    </DockContext.Provider>
  );
}
