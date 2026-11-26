import { mountWorkspaceChrome, updateWorkspaceChrome } from '../workspace-chrome.js';
import { legacyChannelSplit, splitPanels } from '../channel-split-layout.js';
import { BOT_ONLY_CHANNEL_PANELS } from '../dock-panels.js';
import { isFullHeightRail } from '../workspace-layout.js';
import { WORKSPACE_RAIL, WORKSPACE_CHANNELS } from '../workspace-context.js';
import { useMemo, useRef, useState } from 'react';
import { type DockviewApi, type DockviewReadyEvent } from 'dockview-react';
import type { DockPanelRegistration } from '../dock-panels.js';
import {
  allowsDockDrop,
  CHANNEL_BODY_PANEL,
  DEFAULT_WORKSPACE_GAP,
  pruneChannelDock,
  dockPanelGap,
  readChannelDock,
  restoreDockVisibility,
  writeChannelDock,
  DEFAULT_CHANNEL_WORKSPACE,
  type BotWorkspaceStates,
  type ChannelWorkspaceState,
  type DockPosition,
} from '../channel-dock-layout.js';
import {
  MAX_SIDE_COLUMN_WIDTH,
  writeLayoutMode,
  type LayoutMode,
  type SubpanelColumn,
} from '../layout-mode.js';
import { useMountedResource } from '../mounted-resource.js';
import { DOCK_THEME } from './dock-styles.js';
import { type EntryRuntime } from './dock-context.js';
import { SESSION_DETAIL } from './subpanel-column.js';
import {
  hideBodyHeader,
  restoreEntryPanel,
  buildDefaultLayout,
  EMPTY_LAYOUT,
  simpleViewIds,
} from './layout.js';
import type { ChannelDockProps } from '../channel-dock.js';
import { BOT_WORKSPACE_PANELS } from './layout.js';
import type { useDockLayoutMode } from './use-dock-layout-mode.js';

export function useDockPanels(
  {
    hasBots,
    files,
    inbox,
    session,
    revealBody,
    panels,
    channel,
    registry,
    storage,
  }: Pick<
    ChannelDockProps,
    | 'hasBots'
    | 'files'
    | 'inbox'
    | 'session'
    | 'revealBody'
    | 'panels'
    | 'channel'
    | 'registry'
    | 'storage'
  >,
  {
    workspace,
    simpleRef,
    isSimple,
    sideSizedAt,
    setSimpleLayout,
  }: ReturnType<typeof useDockLayoutMode>,
) {
  const botPanelIds = [
    ...new Set([
      ...BOT_WORKSPACE_PANELS,
      ...panels.filter((p) => p.binding === 'current-bot').map((p) => p.id),
    ]),
  ];
  const channelPanelIds = hasBots ? ['sessions', ...botPanelIds] : [];
  const [initial] = useState(() => readChannelDock(storage, workspace !== undefined));
  const [storageFailed, setStorageFailed] = useState(false);
  const seed = useRef(initial?.sessionSeed ?? DEFAULT_CHANNEL_WORKSPACE);
  const [channelWorkspaces, updateChannelWorkspaces] = useState(initial?.channelWorkspaces ?? {});
  const channelWorkspacesRef = useRef(channelWorkspaces);
  const sessionState =
    channel && Object.hasOwn(channelWorkspaces, channel.id)
      ? channelWorkspaces[channel.id]!
      : seed.current;
  const botSeeds = useRef(initial?.botPanelSeeds ?? {});
  const [botWorkspaces, updateBotWorkspaces] = useState(initial?.botWorkspaces ?? {});
  const botWorkspacesRef = useRef(botWorkspaces);
  const botStates: BotWorkspaceStates = Object.fromEntries(
    botPanelIds.map((id) => [
      id,
      (channel && botWorkspaces[channel.id]?.[id]) ??
        botSeeds.current[id] ?? { ...DEFAULT_CHANNEL_WORKSPACE, open: false },
    ]),
  );
  const [channelSplits, updateChannelSplits] = useState(initial?.channelSplits ?? {});
  const channelSplitsRef = useRef(channelSplits);
  let childTree =
    (channel && channelSplits[channel.id]) ||
    legacyChannelSplit({ ...botStates, sessions: sessionState });
  for (const id of session === undefined ? channelPanelIds : [...channelPanelIds, SESSION_DETAIL]) {
    if (!splitPanels(childTree).includes(id))
      childTree = { axis: 'horizontal', ratio: 0.7, first: childTree, second: { panel: id } };
  }
  const botStatesRef = useRef(botStates);
  botStatesRef.current = botStates;
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const sessionStateRef = useRef(sessionState);
  sessionStateRef.current = sessionState;
  const [channelsHeader, setChannelsHeader] = useState<HTMLSpanElement | null>(null);
  const [gap, updateGap] = useState(() => readChannelDock(storage)?.gap ?? DEFAULT_WORKSPACE_GAP);
  const workspaceMode = workspace !== undefined;
  const theme = useMemo(
    () => (workspaceMode ? { ...DOCK_THEME, gap } : DOCK_THEME),
    [workspaceMode, gap],
  );
  const gapRef = useRef(gap);
  const [order, updateOrder] = useState(() => readChannelDock(storage)?.order ?? []);
  const orderRef = useRef(order);
  const [hiddenControls, updateHiddenControls] = useState(
    () => readChannelDock(storage)?.hiddenControls ?? [],
  );
  const hiddenControlsRef = useRef(hiddenControls);
  const [members, updateMembers] = useState(
    () => readChannelDock(storage)?.members ?? { open: false, ratio: 0.3 },
  );
  const membersRef = useRef(members);
  const [dropX, setDropX] = useState<number>();
  const [api, setApi] = useState<DockviewApi>();
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const [runtimes, setRuntimes] = useState<ReadonlyMap<string, EntryRuntime>>(new Map());
  const unregistered = useRef<import('dockview-react').SerializedDockview['panels']>({});
  const parked = useRef<Record<string, DockPosition & { missing?: boolean }>>({});
  const visibilityLayout = useRef<import('dockview-react').SerializedDockview>();
  const restoringVisibility = useRef(false);
  const byId = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const known = useRef(byId);
  known.current = byId;

  const [columnFocus, setColumnFocus] = useState<{ id: string; nonce: number }>();
  const inColumn = (panelId: string): boolean =>
    channelPanelIds.includes(panelId) ||
    panelId === 'members' ||
    panelId === 'bot-inbox' ||
    (byId.get(panelId) ?? registry?.panels().find((item) => item.id === panelId))?.binding ===
      'current-bot';
  const columnOpenIds = (ids: readonly string[]): string[] => {
    const column = simpleRef.current.column;
    const current = channelRef.current;
    if (!column.open || !current || !ids.includes(CHANNEL_BODY_PANEL)) return [];
    const bot = current.type === 'dm' && !!current.botSlug;
    return column.expanded.filter(
      (id) =>
        !column.hidden.includes(id) &&
        ((id === 'sessions' && known.current.has(id)) ||
          (bot && id !== 'sessions' && channelPanelIds.includes(id) && known.current.has(id)) ||
          (id === 'members' && current.type === 'group') ||
          (id === 'bot-inbox' && current.type === 'dm' && inbox !== undefined)),
    );
  };

  const reportOpen = (target: DockviewApi): void => {
    const side = simpleRef.current.sideColumn;
    const ids = isSimple()
      ? (side !== null && isWorkbench(side) ? [side] : simpleViewIds(side)).filter((id) =>
          target.getPanel(id),
        )
      : target.panels.map((panel) => panel.id);
    if (isSimple()) {
      registry?.reportOpen([...ids.filter((id) => id !== WORKSPACE_RAIL), ...columnOpenIds(ids)]);
      return;
    }
    registry?.reportOpen([
      ...ids.filter((id) => id !== WORKSPACE_RAIL && (workspace || id !== CHANNEL_BODY_PANEL)),
      ...(workspace &&
      channelRef.current &&
      known.current.has('sessions') &&
      sessionStateRef.current.open &&
      ids.includes(CHANNEL_BODY_PANEL)
        ? ['sessions']
        : []),
      ...(workspace &&
      channelRef.current?.type === 'dm' &&
      channelRef.current.botSlug &&
      ids.includes(CHANNEL_BODY_PANEL)
        ? botPanelIds.filter((id) => known.current.has(id) && botStatesRef.current[id]?.open)
        : []),
      ...(workspace &&
      channel?.type === 'group' &&
      membersRef.current.open &&
      ids.includes(CHANNEL_BODY_PANEL)
        ? ['members']
        : []),
      ...(channel?.type === 'dm' && inbox?.open && ids.includes(CHANNEL_BODY_PANEL)
        ? ['bot-inbox']
        : []),
    ]);
  };

  const save = (target: DockviewApi): void => {
    hideBodyHeader(target);
    if (workspace) {
      const root = target.groups[0]?.element.closest<HTMLElement>('[data-workspace-enabled]');
      if (root) updateWorkspaceChrome(root, target.groups);
    }
    const ids = target.panels.map((panel) => panel.id);
    setOpenIds(ids);
    reportOpen(target);
    const simple = isSimple();
    fitSideColumn(target);
    const advanced = simple ? readChannelDock(storage) : undefined;
    const frozen = simple;
    if (workspace || !readChannelDock(storage)?.layout.panels[WORKSPACE_RAIL]) {
      const persisted = writeChannelDock(
        {
          layout: frozen
            ? (advanced?.layout ?? EMPTY_LAYOUT)
            : {
                ...target.toJSON(),
                panels: { ...unregistered.current, ...target.toJSON().panels },
              },
          instances: registry?.instances(),
          parked: frozen ? (advanced?.parked ?? {}) : parked.current,
          visibilityLayout: frozen ? advanced?.visibilityLayout : visibilityLayout.current,
          gap: gapRef.current,
          order: orderRef.current,
          hiddenControls: hiddenControlsRef.current,
          members: membersRef.current,
          botPanelSeeds: botSeeds.current,
          botWorkspaces: botWorkspacesRef.current,
          sessionSeed: seed.current,
          channelWorkspaces: channelWorkspacesRef.current,
          channelSplits: channelSplitsRef.current,
        },
        storage,
      );
      setStorageFailed(!persisted);
    }
  };

  const isWorkbench = (panelId: string | null): boolean =>
    panelId !== null &&
    (known.current.get(panelId) ?? registry?.panels().find((item) => item.id === panelId))
      ?.presentation === 'workbench';

  const fitSideColumn = (target: DockviewApi): void => {
    const side = simpleRef.current.sideColumn;
    const group = side === null ? undefined : target.getPanel(side)?.group;
    if (!isSimple() || isWorkbench(side) || !group?.api.isVisible || target.width <= 0) return;
    if (target.width === sideSizedAt.current) return;
    sideSizedAt.current = target.width;
    group.api.setSize({ width: Math.round(simpleRef.current.channelsWidth * target.width) });
  };

  const captureSideWidth = (target: DockviewApi): void => {
    const side = simpleRef.current.sideColumn;
    const group = side === null ? undefined : target.getPanel(side)?.group;
    if (!isSimple() || isWorkbench(side) || sideSizedAt.current === 0 || !group?.api.isVisible)
      return;
    if (target.width <= 0 || group.api.width <= 0) return;
    simpleRef.current = {
      ...simpleRef.current,
      channelsWidth: Math.min(MAX_SIDE_COLUMN_WIDTH, group.api.width / target.width),
    };
    writeLayoutMode(simpleRef.current, storage);
  };

  const positionOf = (target: DockviewApi, panelId: string): DockPosition | undefined => {
    const position = pruneChannelDock(target.toJSON(), (id) => id !== panelId).parked[panelId];
    const group = target.getPanel(panelId)?.group;
    if (!position || !group || target.width <= 0 || target.height <= 0) return position;
    const width = group.api.width / target.width;
    const height = group.api.height / target.height;
    return width > 0 && height > 0
      ? { ...position, size: { width: Math.min(1, width), height: Math.min(1, height) } }
      : position;
  };

  const addEntryPanel = (
    target: DockviewApi,
    panel: DockPanelRegistration,
    remembered: DockPosition | undefined,
  ) => {
    const before = target.toJSON();
    try {
      const restored = restoreDockVisibility(visibilityLayout.current, before, panel.id);
      if (restored && !target.getPanel(panel.id)) {
        restoringVisibility.current = true;
        try {
          target.fromJSON(restored, { reuseExistingPanels: true });
          hideBodyHeader(target);
          for (const [id, position] of Object.entries(parked.current)) {
            const group = target.getPanel(id)?.group;
            if (!group || !position.size) continue;
            const offset = dockPanelGap(target.toJSON(), id, workspace ? gapRef.current : 0);
            group.api.setSize({
              width: position.size.width * target.width + offset.width,
              height: position.size.height * target.height + offset.height,
            });
          }
          target.getPanel(panel.id)?.api.setActive();
        } finally {
          restoringVisibility.current = false;
        }
        if (Object.keys(visibilityLayout.current!.panels).every((id) => target.getPanel(id))) {
          visibilityLayout.current = undefined;
          for (const visible of target.panels) delete parked.current[visible.id];
        }
        save(target);
        return;
      }
    } catch {
      visibilityLayout.current = undefined;
      restoringVisibility.current = true;
      try {
        target.fromJSON(before, { reuseExistingPanels: true });
        hideBodyHeader(target);
      } finally {
        restoringVisibility.current = false;
      }
    }
    visibilityLayout.current = undefined;
    for (const visible of target.panels) delete parked.current[visible.id];
    restoreEntryPanel(target, panel, remembered, workspace ? gapRef.current : 0);
  };

  const sideColumnItem = (panelId: string): boolean =>
    panelId !== CHANNEL_BODY_PANEL && panelId !== WORKSPACE_RAIL && !inColumn(panelId);

  const showSimpleView = (target: DockviewApi, requested: string | null): void => {
    let id = requested;
    if (id !== null && id !== WORKSPACE_CHANNELS) {
      const panel = known.current.get(id) ?? registry?.panels().find((item) => item.id === id);
      if (panel === undefined || !sideColumnItem(id) || !layout.current.canOpen(id))
        id = WORKSPACE_CHANNELS;
      else if (target.getPanel(id) === undefined)
        restoreEntryPanel(
          target,
          panel,
          { neighbor: CHANNEL_BODY_PANEL, direction: 'left' },
          gapRef.current,
        );
    }
    if (id === WORKSPACE_CHANNELS && target.getPanel(WORKSPACE_CHANNELS) === undefined) id = null;
    const workbench = isWorkbench(id);
    const shown = workbench && id !== null ? [id] : simpleViewIds(id);
    for (const group of target.groups) {
      const visible = group.panels.some(
        (panel) => panel.id === WORKSPACE_RAIL || shown.includes(panel.id),
      );
      if (group.api.isVisible !== visible) group.api.setVisible(visible);
    }
    const side = id === null || workbench ? undefined : target.getPanel(id)?.group;
    sideSizedAt.current = side === undefined ? 0 : target.width;
    if (side && target.width > 0)
      side.api.setSize({ width: Math.round(simpleRef.current.channelsWidth * target.width) });
    if (id !== simpleRef.current.sideColumn)
      setSimpleLayout({ ...simpleRef.current, sideColumn: id });
  };

  const buildSimpleLayout = (target: DockviewApi): void => {
    target.clear();
    parked.current = {};
    visibilityLayout.current = undefined;
    target.addPanel({ id: WORKSPACE_RAIL, component: WORKSPACE_RAIL });
    const channels = known.current.get(WORKSPACE_CHANNELS);
    if (channels)
      restoreEntryPanel(
        target,
        channels,
        { neighbor: WORKSPACE_RAIL, direction: 'right' },
        gapRef.current,
      );
    const message = known.current.get(CHANNEL_BODY_PANEL);
    if (message)
      restoreEntryPanel(
        target,
        message,
        { neighbor: channels ? WORKSPACE_CHANNELS : WORKSPACE_RAIL, direction: 'right' },
        gapRef.current,
      );
    target.getPanel(CHANNEL_BODY_PANEL)?.api.updateParameters({ entryId: CHANNEL_BODY_PANEL });
    hideBodyHeader(target);
    showSimpleView(target, simpleRef.current.sideColumn);
    target.getPanel(CHANNEL_BODY_PANEL)?.api.setActive();
  };

  const setColumn = (next: SubpanelColumn, focus?: string): void => {
    setSimpleLayout({ ...simpleRef.current, column: next });
    if (focus !== undefined)
      setColumnFocus((current) => ({ id: focus, nonce: (current?.nonce ?? 0) + 1 }));
    if (api) reportOpen(api);
  };

  const setMode = (mode: LayoutMode): void => {
    if (mode === simpleRef.current.mode) return;
    if (api) save(api);
    setSimpleLayout({ ...simpleRef.current, mode });
  };

  const onReady = ({ api: ready }: DockviewReadyEvent): void => {
    const stored = readChannelDock(storage, workspace !== undefined);
    seed.current = stored?.sessionSeed ?? DEFAULT_CHANNEL_WORKSPACE;
    botSeeds.current = stored?.botPanelSeeds ?? {};
    orderRef.current = stored?.order ?? [];
    updateOrder(orderRef.current);
    hiddenControlsRef.current = stored?.hiddenControls ?? [];
    updateHiddenControls(hiddenControlsRef.current);
    parked.current = { ...stored?.parked };
    visibilityLayout.current = stored?.visibilityLayout;
    unregistered.current = Object.fromEntries(
      Object.entries(stored?.layout.panels ?? {}).filter(
        ([id]) =>
          !known.current.has(id) &&
          ![
            CHANNEL_BODY_PANEL,
            WORKSPACE_RAIL,
            ...channelPanelIds,
            'group-work',
            'bot-inbox',
            'members',
          ].includes(id),
      ),
    );
    const fresh = stored === undefined || Object.keys(stored.layout.panels).length === 0;
    if (isSimple()) buildSimpleLayout(ready);
    else {
      let restored = false;
      if (stored !== undefined && !fresh) {
        const validRail = isFullHeightRail(stored.layout);
        const pruned = pruneChannelDock(
          stored.layout,
          (id) =>
            (id === CHANNEL_BODY_PANEL ||
              (workspace !== undefined && validRail && id === WORKSPACE_RAIL) ||
              known.current.has(id)) &&
            id !== 'bot-inbox' &&
            !(workspace && channelPanelIds.includes(id)) &&
            !(workspace && id === 'members'),
          !workspace,
        );
        for (const [id, position] of Object.entries(pruned.parked))
          parked.current[id] = { ...(parked.current[id] ?? position), missing: true };
        if (workspace && pruned.layout === undefined) restored = true;
        if (pruned.layout !== undefined) {
          try {
            ready.fromJSON(pruned.layout);
            restored =
              !!workspace ||
              ready.getPanel(CHANNEL_BODY_PANEL) !== undefined ||
              !!(workspace && ready.getPanel(WORKSPACE_RAIL));
          } catch {
            restored = false;
          }
        }
      }
      if (!restored)
        buildDefaultLayout(
          ready,
          new Map([...known.current].filter(([id]) => !workspace || !channelPanelIds.includes(id))),
        );
      const newWorkspace = workspace && !stored?.layout.panels[WORKSPACE_RAIL];
      if (workspace) {
        if (!ready.getPanel(WORKSPACE_CHANNELS) && !stored?.layout.panels[WORKSPACE_RAIL]) {
          const channels = known.current.get(WORKSPACE_CHANNELS);
          if (channels) {
            addEntryPanel(ready, channels, undefined);
            ready.getPanel(WORKSPACE_CHANNELS)?.api.setSize({ width: 260 });
          }
        }
        if (!ready.getPanel(WORKSPACE_RAIL))
          ready.addPanel({
            id: WORKSPACE_RAIL,
            component: WORKSPACE_RAIL,
            position: { direction: 'left' },
          });
      }
      if (workspace)
        ready.getPanel(CHANNEL_BODY_PANEL)?.api.updateParameters({ entryId: CHANNEL_BODY_PANEL });
      if (workspace && revealBody) {
        const message = known.current.get(CHANNEL_BODY_PANEL);
        if (message && !ready.getPanel(CHANNEL_BODY_PANEL)) {
          addEntryPanel(ready, message, parked.current[CHANNEL_BODY_PANEL]);
          delete parked.current[CHANNEL_BODY_PANEL];
        }
        ready.getPanel(CHANNEL_BODY_PANEL)?.api.setActive();
      }
      if (newWorkspace && fresh) {
        ready.getPanel('sessions')?.api.setSize({ width: 320 });
        ready.getPanel(WORKSPACE_CHANNELS)?.api.setSize({ width: 260 });
      }
    }
    hideBodyHeader(ready);
    ready.onWillShowOverlay((event) => {
      if (
        isSimple() ||
        !allowsDockDrop(event.kind, event.position) ||
        (workspace &&
          (((event.group === undefined || event.kind === 'edge') &&
            ['top', 'bottom'].includes(event.position)) ||
            event.group?.panels.some((panel) => panel.id === WORKSPACE_RAIL)))
      )
        event.preventDefault();
    });
    ready.onWillDrop((event) => {
      if (
        isSimple() ||
        !allowsDockDrop(event.kind, event.position) ||
        (workspace &&
          (((event.group === undefined || event.kind === 'edge') &&
            ['top', 'bottom'].includes(event.position)) ||
            event.group?.panels.some((panel) => panel.id === WORKSPACE_RAIL)))
      )
        event.preventDefault();
    });
    ready.onDidMovePanel(() => {
      if (restoringVisibility.current) return;
      visibilityLayout.current = undefined;
      for (const panel of ready.panels) delete parked.current[panel.id];
      save(ready);
    });
    ready.onDidLayoutChange(() => save(ready));
    save(ready);
    setApi(ready);
  };

  const geometryMount = useMountedResource<HTMLSpanElement>(
    (node) => {
      if (!api || !node.parentElement) return;
      const root = node.parentElement;
      const workspaceRoot = workspace
        ? root.closest<HTMLElement>('[data-workspace-enabled]')
        : null;
      const releaseChrome = workspaceRoot
        ? mountWorkspaceChrome(workspaceRoot, () => api.groups)
        : undefined;
      let resizing = false;
      const start = (event: PointerEvent) => {
        resizing = event.target instanceof Element && !!event.target.closest('.dv-sash');
      };
      const finish = () => {
        if (!resizing) return;
        resizing = false;
        captureSideWidth(api);
        visibilityLayout.current = undefined;
        for (const panel of api.panels) delete parked.current[panel.id];
        save(api);
      };
      root.addEventListener('pointerdown', start, true);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', finish);
      let frame = 0;
      const resized =
        typeof ResizeObserver === 'undefined'
          ? undefined
          : new ResizeObserver(() => {
              cancelAnimationFrame(frame);
              frame = requestAnimationFrame(() => fitSideColumn(api));
            });
      resized?.observe(root);
      return () => {
        resized?.disconnect();
        cancelAnimationFrame(frame);
        releaseChrome?.();
        root.removeEventListener('pointerdown', start, true);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', finish);
      };
    },
    [api, workspaceMode],
  );

  const registryMount = useMountedResource<HTMLDivElement>(() => {
    if (api === undefined) return;
    for (const panel of [...api.panels]) {
      if (
        panel.id === CHANNEL_BODY_PANEL ||
        (workspace && panel.id === WORKSPACE_RAIL) ||
        (byId.has(panel.id) &&
          panel.id !== 'bot-inbox' &&
          !(workspace && channelPanelIds.includes(panel.id)))
      )
        continue;
      const position = positionOf(api, panel.id);
      parked.current[panel.id] = { ...(position ?? { direction: 'right' }), missing: true };
      panel.api.close();
    }
    for (const [id, position] of Object.entries(parked.current)) {
      const panel = byId.get(id);
      if (
        position.missing !== true ||
        panel === undefined ||
        id === 'bot-inbox' ||
        (workspace && channelPanelIds.includes(id)) ||
        (workspace && id === 'members')
      )
        continue;
      delete parked.current[id];
      delete unregistered.current[id];
      addEntryPanel(api, panel, position);
    }
    if (isSimple()) showSimpleView(api, simpleRef.current.sideColumn);
    save(api);
  }, [api, byId]);

  const inboxStateMount = useMountedResource<HTMLSpanElement>(() => {
    if (api) {
      if (workspace && !isSimple() && (channel?.type !== 'dm' || !channel.botSlug))
        for (const id of BOT_ONLY_CHANNEL_PANELS) layout.current.close(id);
      reportOpen(api);
    }
  }, [api, channel?.id, inbox?.open, sessionState.open, botWorkspaces]);

  const setSessionState = (next: ChannelWorkspaceState): void => {
    if (!channel) return;
    channelWorkspacesRef.current = { ...channelWorkspacesRef.current, [channel.id]: next };
    sessionStateRef.current = next;
    updateChannelWorkspaces(channelWorkspacesRef.current);
    if (api) save(api);
  };

  const setSubpanelState = (id: string, next: ChannelWorkspaceState): void => {
    if (id === 'sessions') {
      setSessionState(next);
      return;
    }
    if (channel?.type !== 'dm' || !channel.botSlug) return;
    const states = { ...botStatesRef.current, [id]: next };
    botStatesRef.current = states;
    botWorkspacesRef.current = { ...botWorkspacesRef.current, [channel.id]: states };
    updateBotWorkspaces(botWorkspacesRef.current);
    if (api) save(api);
  };
  const subpanelState = (id: string) =>
    id === 'sessions' ? sessionStateRef.current : botStatesRef.current[id]!;
  const close = (panelId: string): void => {
    if (isSimple() && !inColumn(panelId)) {
      if (api && panelId === simpleRef.current.sideColumn) {
        showSimpleView(api, null);
        api.getPanel(CHANNEL_BODY_PANEL)?.api.setActive();
        save(api);
      }
      return;
    }
    if (isSimple() && inColumn(panelId)) {
      const column = simpleRef.current.column;
      setColumn({ ...column, expanded: column.expanded.filter((id) => id !== panelId) });
      return;
    }
    if (workspace && channelPanelIds.includes(panelId)) {
      setSubpanelState(panelId, { ...subpanelState(panelId), open: false });
      return;
    }
    if (panelId === 'bot-inbox') {
      inbox?.setOpen(false);
      return;
    }
    if (workspace && panelId === 'members') {
      membersRef.current = { ...membersRef.current, open: false };
      updateMembers(membersRef.current);
      if (api) save(api);
      return;
    }
    if (isSimple()) return;
    const panel = api?.getPanel(panelId);
    if (
      api === undefined ||
      panel === undefined ||
      panelId === WORKSPACE_RAIL ||
      (!workspace && panelId === CHANNEL_BODY_PANEL)
    )
      return;
    visibilityLayout.current ??= api.toJSON();
    for (const visible of api.panels) {
      if (visible.id === WORKSPACE_RAIL || parked.current[visible.id]) continue;
      const position = positionOf(api, visible.id);
      if (position) parked.current[visible.id] = position;
    }
    panel.api.close();
  };

  const canOpen = (panelId: string): boolean => {
    if (
      (byId.get(panelId) ?? registry?.panels().find((item) => item.id === panelId))?.binding ===
      'current-bot'
    )
      return channel?.type === 'dm' && !!channel.botSlug;
    if (!workspace) return true;
    if (panelId === 'sessions') return channel !== undefined;
    if (BOT_ONLY_CHANNEL_PANELS.includes(panelId))
      return channel?.type === 'dm' && !!channel.botSlug;
    return true;
  };
  const open = (panelId: string): void => {
    if (!canOpen(panelId)) return;
    const definition = byId.get(panelId) ?? registry?.panels().find((item) => item.id === panelId);
    if (isSimple() && api && !inColumn(panelId)) {
      if (panelId !== CHANNEL_BODY_PANEL) showSimpleView(api, panelId);
      api.getPanel(panelId)?.api.setActive();
      save(api);
      return;
    }
    if (isSimple() && api && inColumn(panelId)) {
      if (!channel) return;
      if (panelId === 'bot-inbox' && (channel.type !== 'dm' || !inbox)) return;
      if (panelId === 'members' && channel.type !== 'group') return;
      const column = simpleRef.current.column;
      setColumn(
        {
          ...column,
          open: true,
          expanded: [...new Set([...column.expanded, panelId])],
          hidden: column.hidden.filter((id) => id !== panelId),
        },
        panelId,
      );
      save(api);
      return;
    }
    if (workspace && (channelPanelIds.includes(panelId) || definition?.binding === 'current-bot')) {
      if (!channel || !api) return;
      setSubpanelState(panelId, {
        ...(subpanelState(panelId) ?? DEFAULT_CHANNEL_WORKSPACE),
        open: true,
      });
      const message = byId.get(CHANNEL_BODY_PANEL);
      if (message && !api.getPanel(CHANNEL_BODY_PANEL))
        addEntryPanel(api, message, parked.current[CHANNEL_BODY_PANEL]);
      api.getPanel(CHANNEL_BODY_PANEL)?.api.setActive();
      save(api);
      return;
    }
    if (panelId === 'bot-inbox') {
      if (channel?.type !== 'dm' || !inbox || !api) return;
      files?.setOpen(false);
      inbox.setOpen(true);
      const message = byId.get(CHANNEL_BODY_PANEL);
      if (message && !api.getPanel(CHANNEL_BODY_PANEL))
        addEntryPanel(api, message, parked.current[CHANNEL_BODY_PANEL]);
      api.getPanel(CHANNEL_BODY_PANEL)?.api.setActive();
      return;
    }
    if (workspace && panelId === 'members') {
      if (channel?.type !== 'group' || !api) return;
      files?.setOpen(false);
      inbox?.setOpen(false);
      membersRef.current = { ...membersRef.current, open: true };
      updateMembers(membersRef.current);
      const message = byId.get(CHANNEL_BODY_PANEL);
      if (message && !api.getPanel(CHANNEL_BODY_PANEL))
        addEntryPanel(api, message, parked.current[CHANNEL_BODY_PANEL]);
      save(api);
      return;
    }
    const panel = byId.get(panelId) ?? registry?.panels().find((item) => item.id === panelId);
    if (api === undefined || panel === undefined) return;
    if (api.getPanel(panelId) !== undefined) {
      api.getPanel(panelId)?.api.setActive();
      return;
    }
    const remembered = parked.current[panelId];
    addEntryPanel(api, panel, remembered);
    if (!visibilityLayout.current?.panels[panelId]) delete parked.current[panelId];
  };

  const layout = useRef({ open, close, canOpen });
  layout.current = { open, close, canOpen };
  const layoutMount = useMountedResource<HTMLSpanElement>(() => {
    if (api === undefined || registry === undefined) return;
    return registry.attach({
      canOpen: (id) => layout.current.canOpen(id),
      open: (id) => layout.current.open(id),
      close: (id) => layout.current.close(id),
    });
  }, [api, registry]);

  return {
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
  };
}
