import { mountPanelScrollbars } from './ds/panel-scrollbars.js';
import { usePanelMenu } from './panel-menu.js';
import { PanelEmptyState } from './ds/empty-state.js';
import { workspaceColumns, moveWorkspaceRail, isFullHeightRail } from './workspace-layout.js';
import { WorkspaceContext, WORKSPACE_RAIL, WORKSPACE_CHANNELS } from './workspace-context.js';
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
} from 'react';

import * as stylex from '@stylexjs/stylex';
import { Menu, Tooltip, type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import {
  DockviewReact,
  type DockviewApi,
  type DockviewReadyEvent,
  type DockviewTheme,
  type IDockviewPanelHeaderProps,
  type IDockviewPanelProps,
} from 'dockview-react';

import type { ChannelSidebarEntry, ChannelSidebarEntryProps } from './channel-sidebar.js';
import type { DockPanelChannel, DockPanelHost, DockPanelRegistration } from './dock-panels.js';
import {
  allowsDockDrop,
  CHANNEL_BODY_COMPONENT,
  CHANNEL_BODY_PANEL,
  DEFAULT_WORKSPACE_GAP,
  CHANNEL_DOCK_QUERY,
  CHANNEL_ENTRY_COMPONENT,
  clearChannelDock,
  DEFAULT_DOCK_PANELS,
  pruneChannelDock,
  readChannelDock,
  resolveDefaultPosition,
  resolveDockPosition,
  writeChannelDock,
  type ChannelDockStorage,
  type DockPosition,
} from './channel-dock-layout.js';
import { NARROW_CHANNEL_SIDEBAR_QUERY } from './channel-sidebar-layout.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { clampChannelSidebarWidth, channelSidebarPrefs } from './channel-sidebar-prefs.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { IconButton } from './ds/icon-button.js';
import { PanelHeader } from './ds/panel-header.js';
import { space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  body: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    overflow: 'auto',
    paddingTop: space.x1,
    paddingInline: space.x4,
    paddingBottom: space.x4,
  },
  flushBody: { paddingTop: 0, paddingBottom: 0, paddingInline: 0 },
  workspaceBody: { paddingTop: space.x1, paddingBottom: space.x1, paddingInline: space.x1 },
  panel: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  breadcrumb: { display: 'flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  channelName: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 },
  messageLabel: { flexShrink: 0 },
  breadcrumbIcon: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
  actions: { display: 'inline-flex', alignItems: 'center', minWidth: 0, gap: space.x1 },
});

const DOCK_THEME: DockviewTheme = {
  name: 'botharness',
  className: 'bh-dock-theme',
  gap: 0,
  dndOverlayMounting: 'relative',
  dndPanelOverlay: 'content',
};

function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

function subscribeQueries(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const queries = [CHANNEL_DOCK_QUERY, NARROW_CHANNEL_SIDEBAR_QUERY].map((query) =>
    window.matchMedia(query),
  );
  for (const query of queries) query.addEventListener('change', listener);
  return () => {
    for (const query of queries) query.removeEventListener('change', listener);
  };
}

export function useChannelDockActive(): boolean {
  return useSyncExternalStore(
    subscribeQueries,
    () => matches(CHANNEL_DOCK_QUERY) && !matches(NARROW_CHANNEL_SIDEBAR_QUERY),
    () => false,
  );
}

interface EntryRuntime {
  refreshRevision: number;
  expandable: boolean;
}

interface ChannelInboxView {
  open: boolean;
  setOpen(open: boolean): void;
}

interface ChannelFilesView {
  open: boolean;
  setOpen(open: boolean): void;
  content: ReactNode;
}

export interface ChannelHeaderView {
  title: string;
  icon?: ReactNode;
  actions: ReactNode;
}

interface DockContextValue {
  header?: ChannelHeaderView | undefined;
  body: ReactNode;
  files?: ChannelFilesView | undefined;
  inbox?: ChannelInboxView | undefined;
  rail?: ReactNode;
  channelsHeader: HTMLSpanElement | null;
  setChannelsHeader(node: HTMLSpanElement | null): void;
  members?:
    | { open: boolean; ratio: number; setOpen(open: boolean): void; setRatio(ratio: number): void }
    | undefined;
  menu: ReactNode;
  panels: ReadonlyMap<string, DockPanelRegistration>;
  channel: DockPanelChannel | undefined;
  entryProps: ChannelSidebarEntryProps | undefined;
  shows(entry: ChannelSidebarEntry): boolean;
  runtime(entryId: string): EntryRuntime;
  setRuntime(entryId: string, next: Partial<EntryRuntime>): void;
  close(panelId: string): void;
  t: BotHarnessTranslate;
}

const DockContext = createContext<DockContextValue | undefined>(undefined);

function useDock(): DockContextValue {
  const value = useContext(DockContext);
  if (value === undefined) throw new Error('Channel dock panel rendered outside the dock');
  return value;
}

function useEntryProps(entryId: string): ChannelSidebarEntryProps | undefined {
  const dock = useDock();
  const runtime = dock.runtime(entryId);
  if (dock.entryProps === undefined) return undefined;
  return {
    ...dock.entryProps,
    flush: entryId === 'bot-inbox' || entryId === 'sessions',
    refreshRevision: runtime.refreshRevision,
    requestRefresh: () =>
      dock.setRuntime(entryId, { refreshRevision: dock.runtime(entryId).refreshRevision + 1 }),
    expanded: runtime.expandable,
    setExpanded: () => {},
    setExpandable: (expandable) => dock.setRuntime(entryId, { expandable }),
  };
}

function ChannelBodyPanel(): ReactElement {
  const dock = useDock();
  const members = dock.members;
  const filesOpen = dock.channel !== undefined && dock.files?.open === true;
  const inboxOpen = dock.channel?.type === 'dm' && dock.inbox?.open === true;
  const detailEntryId = inboxOpen ? 'bot-inbox' : 'members';
  const detailLabel = dock.t(
    filesOpen ? 'generatedFiles.title' : inboxOpen ? 'entry.botInbox' : 'entry.members',
  );
  const closeDetail = () => {
    if (filesOpen) dock.files?.setOpen(false);
    else if (inboxOpen) dock.inbox?.setOpen(false);
    else members?.setOpen(false);
  };
  const detailProps = useEntryProps(detailEntryId);
  const DetailActions = dock.panels.get(detailEntryId)?.entry?.headerAction;
  const DetailBadge = dock.panels.get(detailEntryId)?.entry?.badge;
  return (
    <div className="bh-dock-body bh-message-split">
      <div className="bh-message-content">
        {dock.body}
        {dock.menu}
      </div>
      {members && (filesOpen || inboxOpen || (dock.channel?.type === 'group' && members.open)) && (
        <>
          <div
            className="bh-message-member-divider"
            role="separator"
            tabIndex={0}
            aria-label={detailLabel}
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={60}
            aria-valuenow={Math.round(members.ratio * 100)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              members.setRatio(members.ratio + (event.key === 'ArrowLeft' ? 0.02 : -0.02));
            }}
            onPointerDown={(event) => {
              if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const box = event.currentTarget.parentElement!.getBoundingClientRect();
              members.setRatio((box.right - event.clientX) / box.width);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
          <aside
            className="bh-message-members"
            aria-label={detailLabel}
            style={{ width: `${members.ratio * 100}%` }}
          >
            <PanelHeader
              label={detailLabel}
              badge={
                !filesOpen && DetailBadge && detailProps ? (
                  <DetailBadge {...detailProps} />
                ) : undefined
              }
              action={
                <>
                  {!filesOpen && DetailActions && detailProps && <DetailActions {...detailProps} />}
                  <IconButton
                    aria-label={dock.t('dock.close', { label: detailLabel })}
                    onClick={closeDetail}
                  >
                    <ChannelSidebarIcon name="x" />
                  </IconButton>
                </>
              }
            />
            {filesOpen ? dock.files?.content : <ChannelEntryContent entryId={detailEntryId} />}
          </aside>
        </>
      )}
    </div>
  );
}

function DockPanelBody({ panel }: { panel: DockPanelRegistration }): ReactElement {
  const dock = useDock();
  const channel = panel.scope === 'channel' ? dock.channel : undefined;
  return (
    <section data-dock-panel={panel.id} {...stylex.props(styles.panel)}>
      {panel.scope === 'global' || channel !== undefined ? (
        <div
          data-dock-panel-body=""
          {...stylex.props(styles.body, !!dock.rail && styles.workspaceBody)}
        >
          <panel.component channel={channel} />
        </div>
      ) : (
        <PanelEmptyState icon={panel?.icon}>{dock.t('dock.empty')}</PanelEmptyState>
      )}
    </section>
  );
}

function ChannelEntryPanel({ params }: IDockviewPanelProps<{ entryId: string }>): ReactElement {
  return <ChannelEntryContent entryId={params.entryId} />;
}

function ChannelEntryContent({ entryId }: { entryId: string }): ReactElement {
  const dock = useDock();
  const panel = dock.panels.get(entryId);
  const entry = panel?.entry;
  const props = useEntryProps(entryId);
  if (panel !== undefined && entry === undefined) return <DockPanelBody panel={panel} />;
  const shown = entry !== undefined && props !== undefined && dock.shows(entry);
  return (
    <section data-sidebar-entry={entryId} {...stylex.props(styles.panel)}>
      {shown ? (
        props.expanded ? (
          <div
            data-sidebar-entry-body=""
            {...stylex.props(
              styles.body,
              !!dock.rail && styles.workspaceBody,
              props.flush && styles.flushBody,
            )}
          >
            <entry.component {...props} />
          </div>
        ) : null
      ) : (
        <PanelEmptyState icon={panel?.icon}>{dock.t('dock.empty')}</PanelEmptyState>
      )}
    </section>
  );
}

function ChannelDockTab({ api, params }: IDockviewPanelHeaderProps<{ entryId?: string }>) {
  const dock = useDock();
  const entryId = params.entryId;
  const panel = entryId === undefined ? undefined : dock.panels.get(entryId);
  const entry = panel?.entry;
  const props = useEntryProps(entryId ?? '');
  const contextMenu = usePanelMenu({
    items: panel
      ? [
          {
            id: 'close',
            label: dock.t('dock.close', { label: panel.title }),
            icon: <ChannelSidebarIcon name="x" />,
          },
        ]
      : [],
    onSelect: () => dock.close(api.id),
  });
  if (entryId === undefined || panel === undefined) return null;
  const shown = entry !== undefined && props !== undefined && dock.shows(entry);
  const Badge = shown ? entry.badge : undefined;
  const HeaderAction = shown ? entry.headerAction : undefined;
  const HeaderTabs = shown ? entry.headerTabs : undefined;
  const PanelAction =
    panel.scope === 'global' || dock.channel !== undefined ? panel.headerAction : undefined;
  const closeLabel = dock.t('dock.close', { label: panel.title });
  return (
    <div className="bh-dock-header" data-dock-header={entryId} {...contextMenu.triggerProps}>
      {contextMenu.menu}
      <PanelHeader
        icon={<ChannelSidebarIcon name={panel.icon} />}
        label={
          entryId === CHANNEL_BODY_PANEL && dock.header ? (
            <span {...stylex.props(styles.breadcrumb)}>
              <span {...stylex.props(styles.messageLabel)}>{panel.title}</span>
              <span aria-hidden="true" {...stylex.props(styles.breadcrumbIcon)}>
                <ChannelSidebarIcon name="chevron-right" />
              </span>
              {dock.header.icon !== undefined && (
                <span
                  aria-hidden="true"
                  data-channel-header-icon=""
                  {...stylex.props(styles.breadcrumbIcon)}
                >
                  {dock.header.icon}
                </span>
              )}
              <span title={dock.header.title} {...stylex.props(styles.channelName)}>
                {dock.header.title}
              </span>
            </span>
          ) : HeaderTabs === undefined ? (
            panel.title
          ) : (
            (entry?.headerLabel ?? panel.title)
          )
        }
        badge={Badge === undefined || props === undefined ? undefined : <Badge {...props} />}
        tabs={
          HeaderTabs === undefined || props === undefined ? undefined : <HeaderTabs {...props} />
        }
        action={
          <span
            data-dock-actions=""
            {...stylex.props(styles.actions)}
            onPointerDown={(event) => event.stopPropagation()}
            onMouseDown={(event) => event.stopPropagation()}
          >
            {entryId === CHANNEL_BODY_PANEL && dock.channel && dock.files && (
              <Tooltip label={dock.t('generatedFiles.title')} side="bottom" portal delayMs={500}>
                <IconButton
                  aria-label={dock.t('generatedFiles.title')}
                  aria-expanded={dock.files.open}
                  onClick={() => {
                    if (!dock.files?.open) {
                      dock.members?.setOpen(false);
                      dock.inbox?.setOpen(false);
                    }
                    dock.files?.setOpen(!dock.files.open);
                  }}
                >
                  <ChannelSidebarIcon name="file" />
                </IconButton>
              </Tooltip>
            )}
            {entryId === CHANNEL_BODY_PANEL && dock.channel?.type === 'dm' && dock.inbox && (
              <Tooltip label={dock.t('entry.botInbox')} side="bottom" portal delayMs={500}>
                <IconButton
                  aria-label={dock.t('entry.botInbox')}
                  aria-expanded={dock.inbox.open}
                  onClick={() => {
                    if (!dock.inbox?.open) dock.files?.setOpen(false);
                    dock.inbox?.setOpen(!dock.inbox.open);
                  }}
                >
                  <ChannelSidebarIcon name="inbox" />
                </IconButton>
              </Tooltip>
            )}
            {entryId === CHANNEL_BODY_PANEL && dock.channel?.type === 'group' && dock.members && (
              <Tooltip label={dock.t('entry.members')} side="bottom" portal delayMs={500}>
                <IconButton
                  aria-label={dock.t('entry.members')}
                  aria-pressed={dock.members.open}
                  onClick={() => dock.members?.setOpen(!dock.members.open)}
                >
                  <ChannelSidebarIcon name="users" />
                </IconButton>
              </Tooltip>
            )}
            {entryId === CHANNEL_BODY_PANEL && dock.header?.actions}
            {HeaderAction === undefined || props === undefined ? null : <HeaderAction {...props} />}
            {PanelAction && (
              <PanelAction channel={panel.scope === 'channel' ? dock.channel : undefined} />
            )}
            {entryId === WORKSPACE_CHANNELS && (
              <span className="bh-workspace-channel-actions" ref={dock.setChannelsHeader} />
            )}
            {!dock.rail && (
              <Tooltip label={closeLabel} side="bottom" portal delayMs={500}>
                <IconButton
                  tone="subtle"
                  aria-label={closeLabel}
                  data-dock-close={entryId}
                  onClick={() => dock.close(api.id)}
                >
                  <ChannelSidebarIcon name="x" />
                </IconButton>
              </Tooltip>
            )}
          </span>
        }
      />
    </div>
  );
}

export function useChannelsHeader(): HTMLSpanElement | null {
  return useDock().channelsHeader;
}

function WorkspaceRailPanel(): ReactElement {
  return <>{useDock().rail}</>;
}

const COMPONENTS = {
  [WORKSPACE_RAIL]: WorkspaceRailPanel,
  [CHANNEL_BODY_COMPONENT]: ChannelBodyPanel,
  [CHANNEL_ENTRY_COMPONENT]: ChannelEntryPanel,
};

function hideBodyHeader(api: DockviewApi): void {
  for (const id of [CHANNEL_BODY_PANEL, WORKSPACE_RAIL]) {
    const group = api.getPanel(id)?.group;
    if (group !== undefined)
      group.header.hidden =
        id === WORKSPACE_RAIL || api.getPanel(id)?.params?.entryId !== CHANNEL_BODY_PANEL;
    if (id === WORKSPACE_RAIL && group) {
      group.locked = 'no-drop-target';
      if (group.minimumWidth !== 56 || group.maximumWidth !== 56)
        group.api.setConstraints({ minimumWidth: 56, maximumWidth: 56 });
    }
  }
}

function addEntryPanel(
  api: DockviewApi,
  panel: DockPanelRegistration,
  remembered: DockPosition | undefined,
): void {
  if (api.getPanel(panel.id) !== undefined) return;
  api.addPanel({
    id: panel.id,
    component: panel.id === CHANNEL_BODY_PANEL ? CHANNEL_BODY_COMPONENT : CHANNEL_ENTRY_COMPONENT,
    title: panel.title,
    params: { entryId: panel.id },
    position:
      remembered === undefined
        ? resolveDefaultPosition(api, panel.defaultPosition)
        : resolveDockPosition(api, remembered),
  });
}

function buildDefaultLayout(api: DockviewApi, entries: ReadonlyMap<string, DockPanelRegistration>) {
  api.clear();
  api.addPanel({
    id: CHANNEL_BODY_PANEL,
    component: CHANNEL_BODY_COMPONENT,
    title: entries.get(CHANNEL_BODY_PANEL)?.title ?? CHANNEL_BODY_PANEL,
    params: entries.has(CHANNEL_BODY_PANEL) ? { entryId: CHANNEL_BODY_PANEL } : {},
  });
  let previous: string | undefined;
  for (const id of DEFAULT_DOCK_PANELS) {
    const entry = entries.get(id);
    if (entry === undefined) continue;
    api.addPanel({
      id,
      component: CHANNEL_ENTRY_COMPONENT,
      title: entry.title,
      params: { entryId: id },
      position:
        previous === undefined
          ? { referencePanel: CHANNEL_BODY_PANEL, direction: 'right' }
          : { referencePanel: previous, direction: 'below' },
    });
    previous ??= id;
  }
  const column = previous === undefined ? undefined : api.getPanel(previous)?.group;
  column?.api.setSize({
    width: clampChannelSidebarWidth(channelSidebarPrefs.getSnapshot().width),
  });
  hideBodyHeader(api);
}

export interface ChannelDockProps {
  header?: ChannelHeaderView | undefined;
  body: ReactNode;
  files?: ChannelFilesView | undefined;
  inbox?: ChannelInboxView | undefined;
  revealBody?: boolean | undefined;
  panels: readonly DockPanelRegistration[];
  channel?: DockPanelChannel | undefined;
  registry?: DockPanelHost | undefined;
  entryProps: ChannelSidebarEntryProps | undefined;
  shows(entry: ChannelSidebarEntry): boolean;
  t: BotHarnessTranslate;
  storage?: ChannelDockStorage | undefined;
}

export function ChannelDock({
  header,
  body,
  files,
  inbox,
  revealBody = false,
  panels,
  channel,
  registry,
  entryProps,
  shows,
  t,
  storage,
}: ChannelDockProps): ReactElement {
  const workspace = useContext(WorkspaceContext);
  const [channelsHeader, setChannelsHeader] = useState<HTMLSpanElement | null>(null);
  const [gap, updateGap] = useState(() => readChannelDock(storage)?.gap ?? DEFAULT_WORKSPACE_GAP);
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
  const parked = useRef<Record<string, DockPosition & { missing?: boolean }>>({});
  const byId = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const known = useRef(byId);
  known.current = byId;

  const reportOpen = (target: DockviewApi): void => {
    const ids = target.panels.map((panel) => panel.id);
    registry?.reportOpen([
      ...ids.filter((id) => id !== WORKSPACE_RAIL && (workspace || id !== CHANNEL_BODY_PANEL)),
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
    if (workspace)
      for (const group of target.groups) {
        const box = group.api.boundingBox;
        const inset = box && box.top < 2 ? Math.max(0, 88 - gapRef.current - box.left) : 0;
        group.element.toggleAttribute('data-bh-mac-corner', inset > 0);
        group.element.toggleAttribute(
          'data-bh-rail-corner',
          inset > 0 && group.panels.some((panel) => panel.id === WORKSPACE_RAIL),
        );
        group.element.style.setProperty('--bh-mac-leading', `${inset}px`);
      }
    const ids = target.panels.map((panel) => panel.id);
    setOpenIds(ids);
    reportOpen(target);
    if (workspace || !readChannelDock(storage)?.layout.panels[WORKSPACE_RAIL])
      writeChannelDock(
        {
          layout: target.toJSON(),
          parked: parked.current,
          gap: gapRef.current,
          order: orderRef.current,
          hiddenControls: hiddenControlsRef.current,
          members: membersRef.current,
        },
        storage,
      );
  };

  const positionOf = (target: DockviewApi, panelId: string): DockPosition | undefined =>
    pruneChannelDock(target.toJSON(), (id) => id !== panelId).parked[panelId];

  const onReady = ({ api: ready }: DockviewReadyEvent): void => {
    const stored = readChannelDock(storage);
    parked.current = { ...stored?.parked };
    let restored = false;
    if (stored !== undefined) {
      const validRail = isFullHeightRail(stored.layout);
      const pruned = pruneChannelDock(
        stored.layout,
        (id) =>
          (id === CHANNEL_BODY_PANEL ||
            (workspace !== undefined && validRail && id === WORKSPACE_RAIL) ||
            known.current.has(id)) &&
          id !== 'bot-inbox' &&
          !(workspace && id === 'members'),
      );
      for (const [id, position] of Object.entries(pruned.parked))
        parked.current[id] = { ...position, missing: true };
      if (pruned.layout !== undefined) {
        try {
          ready.fromJSON(pruned.layout);
          restored =
            ready.getPanel(CHANNEL_BODY_PANEL) !== undefined ||
            !!(workspace && ready.getPanel(WORKSPACE_RAIL));
        } catch {
          restored = false;
        }
      }
    }
    if (!restored) buildDefaultLayout(ready, known.current);
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
    hideBodyHeader(ready);
    if (newWorkspace && stored === undefined) {
      ready.getPanel('sessions')?.api.setSize({ width: 320 });
      ready.getPanel(WORKSPACE_CHANNELS)?.api.setSize({ width: 260 });
    }
    ready.onWillShowOverlay((event) => {
      if (
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
        !allowsDockDrop(event.kind, event.position) ||
        (workspace &&
          (((event.group === undefined || event.kind === 'edge') &&
            ['top', 'bottom'].includes(event.position)) ||
            event.group?.panels.some((panel) => panel.id === WORKSPACE_RAIL)))
      )
        event.preventDefault();
    });
    ready.onDidLayoutChange(() => save(ready));
    save(ready);
    setApi(ready);
  };

  const scrollbarsMount = useMountedResource<HTMLSpanElement>((node) => {
    if (node.parentElement) return mountPanelScrollbars(node.parentElement);
  }, []);

  const registryMount = useMountedResource<HTMLDivElement>(() => {
    if (api === undefined) return;
    for (const panel of [...api.panels]) {
      if (
        panel.id === CHANNEL_BODY_PANEL ||
        (workspace && panel.id === WORKSPACE_RAIL) ||
        (byId.has(panel.id) && panel.id !== 'bot-inbox')
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
        (workspace && id === 'members')
      )
        continue;
      delete parked.current[id];
      addEntryPanel(api, panel, position);
    }
    save(api);
  }, [api, byId]);

  const inboxStateMount = useMountedResource<HTMLSpanElement>(() => {
    if (api) reportOpen(api);
  }, [api, channel?.id, inbox?.open]);

  const close = (panelId: string): void => {
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
    const panel = api?.getPanel(panelId);
    if (
      api === undefined ||
      panel === undefined ||
      panelId === WORKSPACE_RAIL ||
      (!workspace && panelId === CHANNEL_BODY_PANEL)
    )
      return;
    const position = positionOf(api, panelId);
    if (position !== undefined) parked.current[panelId] = position;
    panel.api.close();
  };

  const open = (panelId: string): void => {
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
    const panel = byId.get(panelId);
    if (api === undefined || panel === undefined) return;
    if (api.getPanel(panelId) !== undefined) {
      api.getPanel(panelId)?.api.setActive();
      return;
    }
    const remembered = parked.current[panelId];
    delete parked.current[panelId];
    addEntryPanel(api, panel, remembered);
  };

  const layout = useRef({ open, close });
  layout.current = { open, close };
  const layoutMount = useMountedResource<HTMLSpanElement>(() => {
    if (api === undefined || registry === undefined) return;
    return registry.attach({
      open: (id) => layout.current.open(id),
      close: (id) => layout.current.close(id),
    });
  }, [api, registry]);

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
        buildDefaultLayout(api, byId);
        save(api);
      }}
    />
  );

  const reset = () => {
    if (!api) return;
    parked.current = {};
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
    buildDefaultLayout(api, byId);
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
  const value: DockContextValue = {
    header,
    body,
    files,
    inbox,
    channelsHeader,
    setChannelsHeader,
    members: workspace
      ? {
          ...members,
          setOpen: (open) => {
            if (open) {
              files?.setOpen(false);
              inbox?.setOpen(false);
            }
            membersRef.current = { ...members, open };
            updateMembers(membersRef.current);
            if (api) save(api);
          },
          setRatio: (ratio) => {
            membersRef.current = { ...members, ratio: Math.min(0.6, Math.max(0.2, ratio)) };
            updateMembers(membersRef.current);
            if (api) save(api);
          },
        }
      : undefined,
    rail:
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
      ),
    menu: workspace ? null : menu,
    panels: byId,
    channel,
    entryProps,
    shows,
    runtime: (entryId) => runtimes.get(entryId) ?? { refreshRevision: 0, expandable: true },
    setRuntime: (entryId, next) =>
      setRuntimes((current) => {
        const updated = new Map(current);
        updated.set(entryId, {
          ...(current.get(entryId) ?? { refreshRevision: 0, expandable: true }),
          ...next,
        });
        return updated;
      }),
    close,
    t,
  };

  return (
    <DockContext.Provider value={value}>
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
        onDragOverCapture={(event) => {
          if (!workspace || !api || !event.dataTransfer.types.includes('application/x-bh-rail'))
            return;
          event.preventDefault();
          event.stopPropagation();
          const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
          const candidates = [0, api.width, ...workspaceColumns(api).map((column) => column.left)];
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
        <span ref={inboxStateMount} hidden />
        <span ref={layoutMount} hidden />
        <span ref={scrollbarsMount} hidden />
        {dropX !== undefined && <span className="bh-workspace-drop" style={{ left: dropX }} />}
        <DockviewReact
          key={workspace ? 'workspace' : 'legacy'}
          components={COMPONENTS}
          defaultTabComponent={ChannelDockTab}
          singleTabMode="fullwidth"
          disableTabsOverflowList
          disableFloatingGroups
          defaultRenderer="always"
          proportionalLayout
          theme={workspace ? { ...DOCK_THEME, gap } : DOCK_THEME}
          dndEdges={{
            size: { value: 24, type: 'pixels' },
            activationSize: { value: 8, type: 'percentage' },
          }}
          onReady={onReady}
        />
      </div>
    </DockContext.Provider>
  );
}

const RESET_ID = 'bh:dock-reset';

const groupRank = (panel: DockPanelRegistration): number =>
  panel.entry?.scope === 'channel' ? 1 : 0;

function ChannelDockPanelsMenu({
  panels,
  openIds,
  t,
  onToggle,
  onReset,
}: {
  panels: readonly DockPanelRegistration[];
  openIds: readonly string[];
  t: BotHarnessTranslate;
  onToggle(id: string): void;
  onReset(): void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const menuMount = useMountedResource<HTMLSpanElement>(
    (node) => {
      if (!open || typeof ResizeObserver === 'undefined') return;
      const observer = new ResizeObserver(() => {
        if (node.getClientRects().length === 0) setOpen(false);
      });
      observer.observe(node);
      return () => observer.disconnect();
    },
    [open],
  );
  const label = t('dock.panels');
  const items: MenuEntry[] = [
    { type: 'label', id: 'bh:dock-panels', text: label },
    ...[...panels]
      .sort((left, right) => groupRank(left) - groupRank(right))
      .map((panel) => ({
        id: panel.id,
        label: panel.title,
        icon: <ChannelSidebarIcon name={panel.icon} />,
      })),
    { type: 'separator', id: 'bh:dock-separator' },
    { id: RESET_ID, label: t('dock.reset') },
  ];
  return (
    <span ref={menuMount} className="bh-dock-menu" data-dock-menu="">
      <Menu
        open={open}
        portal
        dense
        align="end"
        anchor={
          <Tooltip label={label} side="bottom" portal delayMs={500}>
            <IconButton
              tone="subtle"
              aria-label={label}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <ChannelSidebarIcon name="panels-top-left" />
            </IconButton>
          </Tooltip>
        }
        items={items}
        selectedIds={openIds}
        onSelect={(id) => {
          setOpen(false);
          if (id === RESET_ID) onReset();
          else onToggle(id);
        }}
        onClose={() => setOpen(false)}
      />
    </span>
  );
}
