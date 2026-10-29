import { mountWorkspaceChrome, updateWorkspaceChrome } from './workspace-chrome.js';
import { useRemoteHosts } from './host-tabs.js';
import { RemoteConversationView } from './remote-conversation-view.js';
import { conversationKey } from './remote-hosts.js';
import { AppearancePanelHeader } from './appearance-panel-header.js';
import { AppearanceContext } from './appearance-context.js';
import { PanelAppearanceSettings } from './appearance-panel-settings.js';
import { panelTargetId } from './appearance-panels.js';
import { Menu } from './appearance-primitives.js';
import {
  legacyChannelSplit,
  splitPanels,
  MESSAGE_LEAF,
  moveChannelSplit,
  type ChannelSplit,
} from './channel-split-layout.js';
import { BOT_ONLY_CHANNEL_PANELS } from './dock-panels.js';
import { ChannelWorkspace } from './channel-workspace.js';
import { workspaceShortcutId } from './workspace-shortcuts.js';
import { PanelVisibilityLabel } from './panel-menu.js';
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
import { type MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives';
import { InstantTooltipScope, Tooltip } from './ds/tooltip.js';
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
  dockPanelGap,
  readChannelDock,
  restoreDockVisibility,
  resolveDefaultPosition,
  resolveDockPosition,
  writeChannelDock,
  DEFAULT_CHANNEL_WORKSPACE,
  BOT_WORKSPACE_PANELS,
  type BotWorkspaceStates,
  type ChannelWorkspaceState,
  type ChannelDockStorage,
  type DockPosition,
} from './channel-dock-layout.js';
import {
  DEFAULT_SIMPLE_CHANNELS_WIDTH,
  DEFAULT_SUBPANEL_COLUMN,
  DEFAULT_SUBPANEL_HEIGHT,
  MAX_SIDE_COLUMN_WIDTH,
  MIN_SUBPANEL_HEIGHT,
  readLayoutMode,
  writeLayoutMode,
  type LayoutMode,
  type SimpleLayout,
  type SubpanelColumn,
} from './layout-mode.js';
import { NARROW_CHANNEL_SIDEBAR_QUERY } from './channel-sidebar-layout.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  clampChannelSidebarWidth,
  channelSidebarPrefs,
  channelSidebarScopeKey,
} from './channel-sidebar-prefs.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { IconButton } from './ds/icon-button.js';
import { PanelHeader } from './ds/panel-header.js';
import { border, space, color, radius, size, text } from './ds/tokens.stylex.js';
import { EntryPart, useStableProps } from './entry-part.js';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';

const styles = stylex.create({
  storageWarning: {
    position: 'absolute',
    bottom: space.x4,
    insetInlineStart: space.x4,
    insetInlineEnd: space.x4,
    zIndex: 50,
    padding: space.x3,
    backgroundColor: color.surface,
    color: color.fg,
    borderRadius: radius.sm,
  },
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
  channelName: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  breadcrumbIcon: { display: 'inline-flex', alignItems: 'center', flexShrink: 0 },
  identity: { display: 'inline-flex', alignItems: 'center', gap: space.x2, minWidth: 0 },
  identityButton: {
    gap: space.x3,
    height: size.row,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: 'inherit',
    fontFamily: 'inherit',
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  actions: { display: 'inline-flex', alignItems: 'center', minWidth: 0, gap: space.x1 },
});

const DOCK_DND_EDGES = {
  size: { value: 24, type: 'pixels' },
  activationSize: { value: 8, type: 'percentage' },
} as const;

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
  label?: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
  profile?: { label: string; open(): void } | undefined;
  actions: ReactNode;
}

interface SubpanelState {
  state: ChannelWorkspaceState;
  setState(next: ChannelWorkspaceState): void;
  toggle(): void;
}

interface SubpanelColumnView {
  state: SubpanelColumn;
  focus: { id: string; nonce: number } | undefined;
  setOpen(open: boolean): void;
  toggleEntry(id: string): void;
  setHidden(id: string, hidden: boolean): void;
  setWidth(width: number): void;
  setHeight(id: string, height: number): void;
}

interface DockContextValue {
  channelPanelIds: readonly string[];
  column?: SubpanelColumnView | undefined;
  childLayout: { tree: ChannelSplit; setTree(next: ChannelSplit): void };
  botWorkspaces?: Readonly<Record<string, SubpanelState>> | undefined;
  sessionWorkspace?: SubpanelState | undefined;
  hasHeader: boolean;
  files?: { open: boolean; setOpen(open: boolean): void } | undefined;
  inbox?: ChannelInboxView | undefined;
  railed: boolean;
  channelsHeader: HTMLSpanElement | null;
  setChannelsHeader(node: HTMLSpanElement | null): void;
  members?:
    | { open: boolean; ratio: number; setOpen(open: boolean): void; setRatio(ratio: number): void }
    | undefined;
  panels: ReadonlyMap<string, DockPanelRegistration>;
  channel: DockPanelChannel | undefined;
  entryProps: ChannelSidebarEntryProps | undefined;
  visible: ReadonlySet<string>;
  runtimes: ReadonlyMap<string, EntryRuntime>;
  setRuntime(entryId: string, next: Partial<EntryRuntime>): void;
  close(panelId: string): void;
  simple: boolean;
  t: BotHarnessTranslate;
}

interface DockSlots {
  header?: ChannelHeaderView | undefined;
  body: ReactNode;
  files: ReactNode;
  rail?: ReactNode;
  menu: ReactNode;
}

const DockContext = createContext<DockContextValue | undefined>(undefined);
const DockSlotContext = createContext<DockSlots | undefined>(undefined);

const IDLE_RUNTIME: EntryRuntime = { refreshRevision: 0, expandable: true };

function runtimeOf(dock: DockContextValue, entryId: string): EntryRuntime {
  return dock.runtimes.get(entryId) ?? IDLE_RUNTIME;
}

function useSame<T>(value: T, equal: (left: T, right: T) => boolean): T {
  const last = useRef(value);
  if (last.current !== value && !equal(last.current, value)) last.current = value;
  return last.current;
}

const sameData = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function useDockSlots(): DockSlots {
  const value = useContext(DockSlotContext);
  if (value === undefined) throw new Error('Channel dock panel rendered outside the dock');
  return value;
}

function DockBodySlot(): ReactElement {
  const slots = useDockSlots();
  return (
    <>
      {slots.body}
      {slots.menu}
    </>
  );
}

function DockFilesSlot(): ReactElement {
  return <>{useDockSlots().files}</>;
}

function ChannelHeaderActions(): ReactElement {
  return <>{useDockSlots().header?.actions}</>;
}

function ChannelBreadcrumb(): ReactElement | null {
  const header = useDockSlots().header;
  if (header === undefined) return null;
  const identity = (
    <>
      {header.icon !== undefined && (
        <span
          aria-hidden="true"
          data-channel-header-icon=""
          {...stylex.props(styles.breadcrumbIcon)}
        >
          {header.icon}
        </span>
      )}
      <span title={header.title} {...stylex.props(styles.channelName)}>
        {header.label ?? header.title}
      </span>
    </>
  );
  return (
    <span {...stylex.props(styles.breadcrumb)}>
      <span aria-hidden="true" {...stylex.props(styles.breadcrumbIcon)}>
        <ChannelSidebarIcon name="chevron-right" />
      </span>
      {header.profile === undefined ? (
        <span {...stylex.props(styles.identity)}>{identity}</span>
      ) : (
        <button
          type="button"
          data-channel-header-profile=""
          aria-label={header.profile.label}
          onClick={header.profile.open}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          {...stylex.props(styles.identity, styles.identityButton)}
        >
          {identity}
        </button>
      )}
      {header.status}
    </span>
  );
}

function useDock(): DockContextValue {
  const value = useContext(DockContext);
  if (value === undefined) throw new Error('Channel dock panel rendered outside the dock');
  return value;
}

function entryScopeKey(props: ChannelSidebarEntryProps): string {
  return channelSidebarScopeKey(props.scope, props.channelId, props.botSlug);
}

function useEntryProps(entryId: string): ChannelSidebarEntryProps | undefined {
  const dock = useDock();
  const runtime = runtimeOf(dock, entryId);
  return useStableProps(
    dock.entryProps === undefined ? undefined : entryPropsFor(dock, entryId, runtime),
  );
}

function entryPropsFor(
  dock: DockContextValue,
  entryId: string,
  runtime: EntryRuntime,
): ChannelSidebarEntryProps | undefined {
  if (dock.entryProps === undefined) return undefined;
  return {
    ...dock.entryProps,
    flush: entryId === 'bot-inbox' || entryId === 'sessions',
    refreshRevision: runtime.refreshRevision,
    requestRefresh: () =>
      dock.setRuntime(entryId, { refreshRevision: runtime.refreshRevision + 1 }),
    expanded: runtime.expandable,
    setExpanded: () => {},
    setExpandable: (expandable) => dock.setRuntime(entryId, { expandable }),
  };
}

function workspaceState(dock: DockContextValue, id: string): SubpanelState | undefined {
  return id === 'sessions' ? dock.sessionWorkspace : dock.botWorkspaces?.[id];
}

function ChannelBodyPanel(): ReactElement {
  const dock = useDock();
  const remote = useRemoteHosts().open;
  if (remote !== undefined)
    return <RemoteConversationView key={conversationKey(remote)} target={remote} t={dock.t} />;
  if (dock.column) return <SimpleMessageContent column={dock.column} />;
  const panels: Record<string, { label: string; header?: ReactNode; content: ReactNode }> = {
    [MESSAGE_LEAF]: { label: dock.t('workspace.messages'), content: <ChannelMessageContent /> },
  };
  for (const id of dock.channelPanelIds) {
    const state = workspaceState(dock, id);
    const panel = dock.panels.get(id);
    const available = id === 'sessions' || (dock.channel?.type === 'dm' && !!dock.channel.botSlug);
    if (state?.state.open && panel && available && dock.channel)
      panels[id] = {
        label: panel.title,
        header: <DockPanelHeader entryId={id} panelId={id} />,
        content: <ChannelEntryContent entryId={id} />,
      };
  }
  return (
    <ChannelWorkspace
      channelId={dock.channel?.id}
      tree={dock.childLayout.tree}
      setTree={dock.childLayout.setTree}
      panels={panels}
    />
  );
}

function ChannelMessageContent(): ReactElement {
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
        <DockBodySlot />
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
            <AppearancePanelHeader
              id={filesOpen ? 'generated-files' : detailEntryId}
              label={detailLabel}
              t={dock.t}
            >
              <PanelHeader
                label={detailLabel}
                onHide={closeDetail}
                hideLabel={dock.t('dock.close', { label: detailLabel })}
                hideHint={dock.t('dock.headHintHide')}
                badge={
                  !filesOpen && DetailBadge && detailProps ? (
                    <DetailBadge key={entryScopeKey(detailProps)} {...detailProps} />
                  ) : undefined
                }
                action={
                  <>
                    {!filesOpen && DetailActions && detailProps && (
                      <DetailActions key={entryScopeKey(detailProps)} {...detailProps} />
                    )}
                    <Tooltip label={dock.t('dock.close', { label: detailLabel })} side="bottom">
                      <IconButton
                        aria-label={dock.t('dock.close', { label: detailLabel })}
                        onClick={closeDetail}
                      >
                        <ChannelSidebarIcon name="x" />
                      </IconButton>
                    </Tooltip>
                  </>
                }
              />
            </AppearancePanelHeader>
            <div
              className="bh-channel-subpanel-body"
              data-appearance-body={filesOpen ? 'generated-files' : detailEntryId}
            >
              {filesOpen ? <DockFilesSlot /> : <ChannelEntryContent entryId={detailEntryId} />}
            </div>
          </aside>
        </>
      )}
    </div>
  );
}

const GENERATED_FILES = 'generated-files';

interface ColumnEntry {
  id: string;
  label: string;
  icon: string | undefined;
}

function columnEntries(dock: DockContextValue): ColumnEntry[] {
  const channel = dock.channel;
  if (channel === undefined) return [];
  const bot = channel.type === 'dm' && !!channel.botSlug;
  const builtIn: readonly string[] = BOT_WORKSPACE_PANELS;
  const registered = (id: string): ColumnEntry[] => {
    const panel = dock.panels.get(id);
    return panel ? [{ id, label: panel.title, icon: panel.icon }] : [];
  };
  return [
    ...registered('sessions'),
    ...(bot ? builtIn.flatMap(registered) : []),
    ...(channel.type === 'group' && dock.members && dock.panels.has('members')
      ? [{ id: 'members', label: dock.t('entry.members'), icon: 'users' }]
      : []),
    ...(dock.files
      ? [{ id: GENERATED_FILES, label: dock.t('generatedFiles.title'), icon: 'file' }]
      : []),
    ...(channel.type === 'dm' && dock.inbox && dock.panels.has('bot-inbox')
      ? [{ id: 'bot-inbox', label: dock.t('entry.botInbox'), icon: 'inbox' }]
      : []),
    ...(bot
      ? dock.channelPanelIds
          .filter((id) => id !== 'sessions' && !builtIn.includes(id))
          .flatMap(registered)
      : []),
  ];
}

function SimpleMessageContent({ column }: { column: SubpanelColumnView }): ReactElement {
  const dock = useDock();
  const entries = columnEntries(dock).filter((entry) => !column.state.hidden.includes(entry.id));
  const label = dock.t('workspace.subpanelColumn');
  return (
    <div className="bh-dock-body bh-message-split">
      <div className="bh-message-content">
        <DockBodySlot />
      </div>
      {column.state.open && dock.channel && (
        <>
          <div
            className="bh-message-member-divider"
            role="separator"
            tabIndex={0}
            aria-label={label}
            aria-orientation="vertical"
            aria-valuemin={20}
            aria-valuemax={60}
            aria-valuenow={Math.round(column.state.width * 100)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
              event.preventDefault();
              column.setWidth(column.state.width + (event.key === 'ArrowLeft' ? 0.02 : -0.02));
            }}
            onPointerDown={(event) => {
              if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
              const box = event.currentTarget.parentElement!.getBoundingClientRect();
              column.setWidth((box.right - event.clientX) / box.width);
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
          <aside
            className="bh-subpanel-column"
            data-subpanel-column=""
            aria-label={label}
            style={{ width: `${column.state.width * 100}%` }}
          >
            {entries.length === 0 ? (
              <PanelEmptyState icon="panel-right">{dock.t('dock.empty')}</PanelEmptyState>
            ) : (
              entries.map((entry) => (
                <SubpanelColumnEntry key={entry.id} entry={entry} column={column} />
              ))
            )}
          </aside>
        </>
      )}
    </div>
  );
}

function SubpanelColumnEntry({
  entry,
  column,
}: {
  entry: ColumnEntry;
  column: SubpanelColumnView;
}): ReactElement {
  const dock = useDock();
  const panel = dock.panels.get(entry.id);
  const part = panel?.entry;
  const props = useEntryProps(entry.id);
  const expanded = column.state.expanded.includes(entry.id);
  const height = column.state.heights[entry.id] ?? DEFAULT_SUBPANEL_HEIGHT;
  const bodyId = `bh-subpanel-${entry.id}`;
  const focused = column.focus?.id === entry.id;
  const focusMount = useMountedResource<HTMLElement>(
    (node) => {
      if (focused) node.scrollIntoView?.({ block: 'nearest' });
    },
    [focused, column.focus?.nonce],
  );
  const drag = useRef<{ y: number; height: number } | undefined>(undefined);
  const contextMenu = usePanelMenu({
    items: [
      {
        id: 'hide',
        label: dock.t('workspace.subpanelColumn.hide', { label: entry.label }),
        icon: <ChannelSidebarIcon name="eye-off" />,
      },
    ],
    onSelect: () => column.setHidden(entry.id, true),
  });
  const shown = part !== undefined && props !== undefined && dock.visible.has(entry.id);
  const Badge = shown ? part.badge : undefined;
  const HeaderAction = shown ? part.headerAction : undefined;
  const PanelAction = panel?.headerAction;
  return (
    <section
      ref={focusMount}
      className="bh-subpanel-entry"
      data-subpanel-entry={entry.id}
      data-expanded={expanded ? '' : undefined}
    >
      <div className="bh-subpanel-entry-header" {...contextMenu.triggerProps}>
        {contextMenu.menu}
        <PanelHeader
          icon={<ChannelSidebarIcon name={entry.icon} />}
          label={entry.label}
          disclosure={{
            expanded,
            controls: bodyId,
            disabled: false,
            chevron: true,
            onToggle: () => column.toggleEntry(entry.id),
          }}
          badge={
            Badge === undefined || props === undefined ? undefined : (
              <EntryPart key={entryScopeKey(props)} part={Badge} props={props} />
            )
          }
          action={
            HeaderAction === undefined && PanelAction === undefined ? undefined : (
              <span
                data-dock-actions=""
                {...stylex.props(styles.actions)}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
              >
                {HeaderAction === undefined || props === undefined ? null : (
                  <EntryPart key={entryScopeKey(props)} part={HeaderAction} props={props} />
                )}
                {PanelAction && (
                  <PanelAction
                    key={panel?.scope === 'channel' ? dock.channel?.id : undefined}
                    channel={panel?.scope === 'channel' ? dock.channel : undefined}
                  />
                )}
              </span>
            )
          }
        />
      </div>
      {expanded && (
        <>
          <div
            id={bodyId}
            className="bh-subpanel-entry-body"
            data-appearance-body={entry.id}
            style={{ height }}
          >
            {entry.id === GENERATED_FILES ? (
              <DockFilesSlot />
            ) : (
              <ChannelEntryContent entryId={entry.id} />
            )}
            {entry.id === 'bot-inbox' && <InboxSync />}
          </div>
          <div
            className="bh-subpanel-entry-resize"
            role="separator"
            tabIndex={0}
            aria-label={entry.label}
            aria-orientation="horizontal"
            aria-valuemin={MIN_SUBPANEL_HEIGHT}
            aria-valuenow={Math.round(height)}
            onKeyDown={(event) => {
              if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              column.setHeight(entry.id, height + (event.key === 'ArrowDown' ? 16 : -16));
            }}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              drag.current = { y: event.clientY, height };
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={(event) => {
              const start = drag.current;
              if (!start || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
              column.setHeight(entry.id, start.height + event.clientY - start.y);
            }}
            onPointerUp={(event) => {
              drag.current = undefined;
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId);
            }}
          />
        </>
      )}
    </section>
  );
}

function InboxSync(): ReactElement {
  const dock = useDock();
  const setOpen = dock.inbox?.setOpen;
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (!setOpen) return;
    setOpen(true);
    return () => setOpen(false);
  }, [dock.channel?.id, setOpen]);
  return <span ref={mount} hidden />;
}

function DockPanelBody({ panel }: { panel: DockPanelRegistration }): ReactElement {
  const dock = useDock();
  const channel = panel.scope === 'channel' ? dock.channel : undefined;
  return (
    <section data-dock-panel={panel.id} {...stylex.props(styles.panel)}>
      {(panel.scope === 'global' || channel !== undefined) &&
      (panel.binding !== 'current-bot' || channel?.type === 'dm') ? (
        <div
          data-dock-panel-body=""
          {...stylex.props(styles.body, dock.railed && styles.workspaceBody)}
        >
          <panel.component key={channel?.id} channel={channel} />
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
  const shown = entry !== undefined && props !== undefined && dock.visible.has(entryId);
  return (
    <section data-sidebar-entry={entryId} {...stylex.props(styles.panel)}>
      {shown ? (
        props.expanded ? (
          <div
            data-sidebar-entry-body=""
            {...stylex.props(
              styles.body,
              dock.railed && styles.workspaceBody,
              props.flush && styles.flushBody,
            )}
          >
            <EntryPart key={entryScopeKey(props)} part={entry.component} props={props} />
          </div>
        ) : null
      ) : (
        <PanelEmptyState icon={panel?.icon}>{dock.t('dock.empty')}</PanelEmptyState>
      )}
    </section>
  );
}

function ChannelDockTab({ api, params }: IDockviewPanelHeaderProps<{ entryId?: string }>) {
  return <DockPanelHeader entryId={params.entryId} panelId={api.id} />;
}

function DockPanelHeader({ entryId, panelId }: { entryId: string | undefined; panelId: string }) {
  const appearance = useContext(AppearanceContext);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const dock = useDock();
  const panel = entryId === undefined ? undefined : dock.panels.get(entryId);
  const entry = panel?.entry;
  const props = useEntryProps(entryId ?? '');
  const contextMenu = usePanelMenu({
    items: panel
      ? [
          ...(appearance
            ? [
                { id: 'appearance', label: dock.t('appearance.panelMenu') },
                { type: 'separator' as const, id: 'appearance-separator' },
              ]
            : []),
          ...(dock.simple
            ? []
            : [
                {
                  id: 'close',
                  label: dock.t('dock.close', { label: panel.title }),
                  icon: <ChannelSidebarIcon name="x" />,
                },
              ]),
          ...(entryId === CHANNEL_BODY_PANEL && dock.column && dock.channel
            ? [
                { type: 'separator' as const, id: 'channel-controls-separator' },
                {
                  type: 'label' as const,
                  id: 'channel-controls',
                  text: dock.t('workspace.channelPanels'),
                },
                ...columnEntries(dock).map((child) => ({
                  id: `column:${child.id}`,
                  icon: <ChannelSidebarIcon name={child.icon} />,
                  label: (
                    <PanelVisibilityLabel
                      label={child.label}
                      checked={!dock.column!.state.hidden.includes(child.id)}
                      t={dock.t}
                    />
                  ),
                })),
              ]
            : []),
          ...(entryId === CHANNEL_BODY_PANEL &&
          !dock.column &&
          dock.channel &&
          dock.sessionWorkspace
            ? [
                { type: 'separator' as const, id: 'channel-controls-separator' },
                {
                  type: 'label' as const,
                  id: 'channel-controls',
                  text: dock.t('workspace.channelPanels'),
                },
                ...dock.channelPanelIds.flatMap((id) => {
                  const state = workspaceState(dock, id);
                  const child = dock.panels.get(id);
                  if (
                    !state ||
                    !child ||
                    (id !== 'sessions' && (dock.channel?.type !== 'dm' || !dock.channel.botSlug))
                  )
                    return [];
                  return [
                    {
                      id: `control:${id}`,
                      icon: <ChannelSidebarIcon name={child.icon} />,
                      label: (
                        <PanelVisibilityLabel
                          label={child.title}
                          checked={!state.state.hiddenControl}
                          t={dock.t}
                        />
                      ),
                    },
                  ];
                }),
              ]
            : []),
          ...(entryId && workspaceState(dock, entryId)
            ? (['left', 'right', 'above', 'below'] as const).map((direction) => ({
                id: direction,
                label: dock.t(`workspace.session.${direction}`),
              }))
            : []),
        ]
      : [],
    onSelect: (id) => {
      if (id === 'appearance') setAppearanceOpen(true);
      else if (id === 'close') dock.close(panelId);
      else if (id.startsWith('column:')) {
        const child = id.slice('column:'.length);
        dock.column?.setHidden(child, !dock.column.state.hidden.includes(child));
      } else if (id.startsWith('control:')) {
        const child = workspaceState(dock, id.slice('control:'.length));
        if (child)
          child.setState({
            ...child.state,
            hiddenControl: !child.state.hiddenControl,
            open: child.state.hiddenControl ? child.state.open : false,
          });
      } else {
        const child = workspaceState(dock, entryId ?? '');
        if (child)
          dock.childLayout.setTree(
            moveChannelSplit(
              dock.childLayout.tree,
              entryId!,
              MESSAGE_LEAF,
              id as DockPosition['direction'],
            ),
          );
      }
    },
  });
  if (entryId === undefined || panel === undefined) return null;
  const shown = entry !== undefined && props !== undefined && dock.visible.has(entryId);
  const Badge = shown ? entry.badge : undefined;
  const HeaderAction = shown ? entry.headerAction : undefined;
  const HeaderTabs = shown ? entry.headerTabs : undefined;
  const PanelAction =
    panel.scope === 'global' || dock.channel !== undefined ? panel.headerAction : undefined;
  const closeLabel = dock.t('dock.close', { label: panel.title });
  return (
    <>
      {appearanceOpen && appearance && (
        <PanelAppearanceSettings
          owner={appearance}
          id={panelTargetId(entryId)}
          label={panel.title}
          t={dock.t}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
      <div
        className="bh-dock-header"
        data-dock-header={entryId}
        data-window-drag
        onMouseDown={(event) => {
          if (!(event.target as Element).closest('[data-panel-hide]')) event.stopPropagation();
        }}
        {...contextMenu.triggerProps}
      >
        {contextMenu.menu}
        <PanelHeader
          {...(dock.simple ? {} : { onHide: () => dock.close(panelId) })}
          hideLabel={closeLabel}
          hideHint={dock.t('dock.headHint')}
          icon={<ChannelSidebarIcon name={panel.icon} />}
          label={HeaderTabs === undefined ? panel.title : (entry?.headerLabel ?? panel.title)}
          context={
            entryId === CHANNEL_BODY_PANEL && dock.hasHeader ? <ChannelBreadcrumb /> : undefined
          }
          badge={
            Badge === undefined || props === undefined ? undefined : (
              <EntryPart key={entryScopeKey(props)} part={Badge} props={props} />
            )
          }
          tabs={
            HeaderTabs === undefined || props === undefined ? undefined : (
              <HeaderTabs key={entryScopeKey(props)} {...props} />
            )
          }
          action={
            <span
              data-dock-actions=""
              {...stylex.props(styles.actions)}
              onPointerDown={(event) => event.stopPropagation()}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {entryId === CHANNEL_BODY_PANEL && dock.hasHeader && <ChannelHeaderActions />}
              {HeaderAction === undefined || props === undefined ? null : (
                <EntryPart key={entryScopeKey(props)} part={HeaderAction} props={props} />
              )}
              {PanelAction && (
                <PanelAction
                  key={panel.scope === 'channel' ? dock.channel?.id : undefined}
                  channel={panel.scope === 'channel' ? dock.channel : undefined}
                />
              )}
              {entryId === WORKSPACE_CHANNELS && (
                <span className="bh-workspace-channel-actions" ref={dock.setChannelsHeader} />
              )}
              {entryId === CHANNEL_BODY_PANEL &&
                !dock.column &&
                dock.channelPanelIds.map((id) =>
                  workspaceState(dock, id) &&
                  dock.panels.has(id) &&
                  (id === 'sessions' || (dock.channel?.type === 'dm' && !!dock.channel.botSlug)) ? (
                    <SubpanelControl key={id} id={id} />
                  ) : null,
                )}
              {entryId === CHANNEL_BODY_PANEL && !dock.column && dock.channel && dock.files && (
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
              {entryId === CHANNEL_BODY_PANEL &&
                !dock.column &&
                dock.channel?.type === 'dm' &&
                dock.inbox && (
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
              {entryId === CHANNEL_BODY_PANEL &&
                !dock.column &&
                dock.channel?.type === 'group' &&
                dock.members && (
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
              {entryId === CHANNEL_BODY_PANEL && dock.column && (
                <Tooltip
                  label={dock.t('workspace.subpanelColumn')}
                  side="bottom"
                  portal
                  delayMs={500}
                >
                  <IconButton
                    aria-label={dock.t('workspace.subpanelColumn')}
                    aria-pressed={dock.column.state.open}
                    data-subpanel-column-toggle=""
                    disabled={!dock.channel}
                    onClick={() => dock.column?.setOpen(!dock.column.state.open)}
                  >
                    <ChannelSidebarIcon name="panel-right" />
                  </IconButton>
                </Tooltip>
              )}
              {!dock.railed && (
                <Tooltip label={closeLabel} side="bottom" portal delayMs={500}>
                  <IconButton
                    tone="subtle"
                    aria-label={closeLabel}
                    data-dock-close={entryId}
                    onClick={() => dock.close(panelId)}
                  >
                    <ChannelSidebarIcon name="x" />
                  </IconButton>
                </Tooltip>
              )}
            </span>
          }
        />
      </div>
    </>
  );
}

function SubpanelControl({ id }: { id: string }) {
  const dock = useDock();
  const workspace = useContext(WorkspaceContext);
  const source = workspace?.shortcuts?.catalog;
  const catalog = useSyncExternalStore(
    source?.subscribe ?? EMPTY_SUBSCRIBE,
    source?.getSnapshot ?? EMPTY_CATALOG,
  );
  const state = workspaceState(dock, id)!;
  const panel = dock.panels.get(id)!;
  const label = panel.title;
  const keys = catalog.find((row) => row.id === workspaceShortcutId(id))?.keys;
  return (
    <>
      {!state.state.hiddenControl && (
        <Tooltip label={label} shortcutKeys={keys} side="bottom" delayMs={500}>
          <IconButton
            aria-label={label}
            aria-pressed={state.state.open}
            disabled={!dock.channel}
            onClick={state.toggle}
          >
            <ChannelSidebarIcon name={panel.icon} />
          </IconButton>
        </Tooltip>
      )}
    </>
  );
}
const EMPTY_SUBSCRIBE = () => () => {};
const EMPTY_CATALOG = () => NO_SHORTCUTS;
const NO_SHORTCUTS: readonly { id: string; keys?: readonly string[] }[] = [];

export function useChannelsHeader(): HTMLSpanElement | null {
  return useDock().channelsHeader;
}

function WorkspaceRailPanel(): ReactElement {
  return <>{useDockSlots().rail}</>;
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

function restoreEntryPanel(
  api: DockviewApi,
  panel: DockPanelRegistration,
  remembered: DockPosition | undefined,
  gap: number,
): void {
  if (api.getPanel(panel.id) !== undefined) return;
  const added = api.addPanel({
    id: panel.id,
    component: panel.id === CHANNEL_BODY_PANEL ? CHANNEL_BODY_COMPONENT : CHANNEL_ENTRY_COMPONENT,
    title: panel.title,
    ...(remembered?.size
      ? {
          ...(remembered.direction === 'left' || remembered.direction === 'right'
            ? { initialWidth: Math.round(remembered.size.width * api.width) }
            : { initialHeight: Math.round(remembered.size.height * api.height) }),
        }
      : {}),
    params: { entryId: panel.id },
    position:
      remembered === undefined
        ? resolveDefaultPosition(api, panel.defaultPosition, panel.id)
        : resolveDockPosition(api, remembered),
  });
  if (remembered?.size) {
    const offset = dockPanelGap(api.toJSON(), panel.id, gap);
    added.group.api.setSize({
      ...(remembered.direction === 'left' || remembered.direction === 'right'
        ? { width: remembered.size.width * api.width + offset.width }
        : { height: remembered.size.height * api.height + offset.height }),
    });
  }
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
  const [layoutMode, updateLayoutMode] = useState<SimpleLayout>(() => {
    const value = readLayoutMode(storage);
    if (workspace) writeLayoutMode(value, storage);
    return value;
  });
  const simpleRef = useRef(layoutMode);
  const isSimple = (): boolean => workspace !== undefined && simpleRef.current.mode === 'simple';
  const sideSizedAt = useRef(0);
  const setSimpleLayout = (next: SimpleLayout): void => {
    simpleRef.current = next;
    updateLayoutMode(next);
    writeLayoutMode(next, storage);
  };
  const botPanelIds = [
    ...new Set([
      ...BOT_WORKSPACE_PANELS,
      ...panels.filter((p) => p.binding === 'current-bot').map((p) => p.id),
    ]),
  ];
  const channelPanelIds = ['sessions', ...botPanelIds];
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
  for (const id of channelPanelIds) {
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
    const ids = isSimple()
      ? simpleViewIds(simpleRef.current.sideColumn).filter((id) => target.getPanel(id))
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

  const fitSideColumn = (target: DockviewApi): void => {
    const side = simpleRef.current.sideColumn;
    const group = side === null ? undefined : target.getPanel(side)?.group;
    if (!isSimple() || !group?.api.isVisible || target.width <= 0) return;
    if (target.width === sideSizedAt.current) return;
    sideSizedAt.current = target.width;
    group.api.setSize({ width: Math.round(simpleRef.current.channelsWidth * target.width) });
  };

  const captureSideWidth = (target: DockviewApi): void => {
    const side = simpleRef.current.sideColumn;
    const group = side === null ? undefined : target.getPanel(side)?.group;
    if (!isSimple() || sideSizedAt.current === 0 || !group?.api.isVisible) return;
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
    const shown = simpleViewIds(id);
    for (const group of target.groups) {
      const visible = group.panels.some(
        (panel) => panel.id === WORKSPACE_RAIL || shown.includes(panel.id),
      );
      if (group.api.isVisible !== visible) group.api.setVisible(visible);
    }
    const side = id === null ? undefined : target.getPanel(id)?.group;
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

  const scrollbarsMount = useMountedResource<HTMLSpanElement>((node) => {
    if (node.parentElement) return mountPanelScrollbars(node.parentElement);
  }, []);

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
    close,
  };
  const actions = useRef(handlers);
  actions.current = handlers;
  const [stable] = useState(() => ({
    setTree: (next: ChannelSplit) => actions.current.setTree(next),
    setFilesOpen: (open: boolean) => actions.current.setFilesOpen(open),
    setInboxOpen: (open: boolean) => actions.current.setInboxOpen(open),
    setColumnOpen: (open: boolean) => actions.current.setColumnOpen(open),
    toggleColumnEntry: (id: string) => actions.current.toggleColumnEntry(id),
    setColumnHidden: (id: string, hidden: boolean) => actions.current.setColumnHidden(id, hidden),
    setColumnWidth: (width: number) => actions.current.setColumnWidth(width),
    setColumnHeight: (id: string, height: number) => actions.current.setColumnHeight(id, height),
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
      channelPanelIds: stablePanelIds,
      column: columnValue,
      childLayout,
      botWorkspaces: botWorkspaceValue,
      sessionWorkspace,
      hasHeader: header !== undefined,
      files: filesValue,
      inbox: inboxValue,
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
      close: stable.close,
      simple: simpleMode,
      t,
    },
    shallowEqual,
  );
  const slots = useMemo<DockSlots>(
    () => ({ header, body, files: files?.content, rail, menu: workspaceMode ? null : menu }),
    [header, body, files?.content, rail, menu, workspaceMode],
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
          <span ref={scrollbarsMount} hidden />
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

const RESET_ID = 'bh:dock-reset';

const EMPTY_LAYOUT: import('dockview-react').SerializedDockview = {
  grid: {
    root: { type: 'branch', data: [] },
    width: 0,
    height: 0,
    orientation: 'HORIZONTAL' as import('dockview-react').SerializedDockview['grid']['orientation'],
  },
  panels: {},
};

function simpleViewIds(sideColumn: string | null): readonly string[] {
  return sideColumn === null ? [CHANNEL_BODY_PANEL] : [sideColumn, CHANNEL_BODY_PANEL];
}

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
      <InstantTooltipScope>
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
      </InstantTooltipScope>
    </span>
  );
}
