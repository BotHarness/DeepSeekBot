import { type ChannelSplit } from '../channel-split-layout.js';
import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import type { ChannelSidebarEntryProps } from '../channel-sidebar.js';
import type { DockPanelChannel, DockPanelRegistration } from '../dock-panels.js';
import { type ChannelWorkspaceState } from '../channel-dock-layout.js';
import { type SubpanelColumn } from '../layout-mode.js';
import { useChannelDockViewport } from '../dock-viewport.js';
import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { ComposerContextPlacementContext } from '../composer-context-placement.js';
import { channelSidebarScopeKey } from '../channel-sidebar-prefs.js';
import type { BotHarnessTranslate } from '../locale.js';
import { useStableProps } from '../entry-part.js';
import { styles } from './dock-styles.js';

export { ChannelSidebarIcon };

export function useChannelDockActive(): boolean {
  return useChannelDockViewport();
}

export interface EntryRuntime {
  refreshRevision: number;
  expandable: boolean;
}

export interface ChannelInboxView {
  open: boolean;
  setOpen(open: boolean): void;
}

export interface ChannelSessionView {
  title: string;
  content: ReactNode;
  close(): void;
}

export interface ChannelFilesView {
  open: boolean;
  setOpen(open: boolean): void;
  content: ReactNode;
}

export interface ChannelHeaderView {
  title: string;
  label?: ReactNode;
  status?: ReactNode;
  icon?: ReactNode;
  profile?: { label: string; open(): void; expanded?: boolean | undefined } | undefined;
  info?: ReactNode;
  actions: ReactNode;
}

interface SubpanelState {
  state: ChannelWorkspaceState;
  setState(next: ChannelWorkspaceState): void;
  toggle(): void;
}

export interface SubpanelColumnView {
  state: SubpanelColumn;
  focus: { id: string; nonce: number } | undefined;
  setOpen(open: boolean): void;
  toggleEntry(id: string): void;
  setHidden(id: string, hidden: boolean): void;
  setWidth(width: number): void;
  setHeight(id: string, height: number): void;
  setOrder(order: readonly string[]): void;
}

export interface DockContextValue {
  conversation(node: ReactNode): ReactNode;
  channelPanelIds: readonly string[];
  column?: SubpanelColumnView | undefined;
  childLayout: { tree: ChannelSplit; setTree(next: ChannelSplit): void };
  botWorkspaces?: Readonly<Record<string, SubpanelState>> | undefined;
  sessionWorkspace?: SubpanelState | undefined;
  hasHeader: boolean;
  files?: { open: boolean; setOpen(open: boolean): void } | undefined;
  inbox?: ChannelInboxView | undefined;
  session?: ChannelSessionView | undefined;
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
  open(panelId: string): void;
  close(panelId: string): void;
  simple: boolean;
  t: BotHarnessTranslate;
}

export interface DockSlots {
  header?: ChannelHeaderView | undefined;
  body: ReactNode;
  files: ReactNode;
  rail?: ReactNode;
  menu: ReactNode;
}

export const DockContext = createContext<DockContextValue | undefined>(undefined);
export function useChannelPanelClose(panelId: string): (() => void) | undefined {
  const dock = useContext(DockContext);
  return useMemo(
    () => (dock === undefined ? undefined : () => dock.close(panelId)),
    [dock, panelId],
  );
}
export const DockSlotContext = createContext<DockSlots | undefined>(undefined);

export const IDLE_RUNTIME: EntryRuntime = { refreshRevision: 0, expandable: true };

function runtimeOf(dock: DockContextValue, entryId: string): EntryRuntime {
  return dock.runtimes.get(entryId) ?? IDLE_RUNTIME;
}

export function useSame<T>(value: T, equal: (left: T, right: T) => boolean): T {
  const last = useRef(value);
  if (last.current !== value && !equal(last.current, value)) last.current = value;
  return last.current;
}

export const sameData = (left: unknown, right: unknown): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

function useDockSlots(): DockSlots {
  const value = useContext(DockSlotContext);
  if (value === undefined) throw new Error('Channel dock panel rendered outside the dock');
  return value;
}

export function DockBodySlot(): ReactElement {
  const slots = useDockSlots();
  return (
    <>
      {slots.body}
      {slots.menu}
    </>
  );
}

export function DockFilesSlot(): ReactElement {
  return <>{useDockSlots().files}</>;
}

export function ChannelHeaderActions(): ReactElement {
  return <>{useDockSlots().header?.actions}</>;
}

export function ChannelBreadcrumb(): ReactElement | null {
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
          {...(header.profile.expanded === undefined
            ? {}
            : {
                'data-session-stop-opener': '',
                'aria-haspopup': 'dialog' as const,
                'aria-expanded': header.profile.expanded,
              })}
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
      {header.info === undefined ? null : (
        <span
          data-channel-header-info=""
          {...stylex.props(styles.info)}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <ComposerContextPlacementContext.Provider value="header">
            {header.info}
          </ComposerContextPlacementContext.Provider>
        </span>
      )}
    </span>
  );
}

export function useDockPanelOpener(): ((panelId: string) => void) | undefined {
  return useContext(DockContext)?.open;
}

export function useDock(): DockContextValue {
  const value = useContext(DockContext);
  if (value === undefined) throw new Error('Channel dock panel rendered outside the dock');
  return value;
}

export function entryScopeKey(props: ChannelSidebarEntryProps): string {
  return channelSidebarScopeKey(props.scope, props.channelId, props.botSlug);
}

export function useEntryProps(entryId: string): ChannelSidebarEntryProps | undefined {
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

export function workspaceState(dock: DockContextValue, id: string): SubpanelState | undefined {
  return id === 'sessions' ? dock.sessionWorkspace : dock.botWorkspaces?.[id];
}

export function useChannelsHeader(): HTMLSpanElement | null {
  return useDock().channelsHeader;
}

export function WorkspaceRailPanel(): ReactElement {
  return <>{useDockSlots().rail}</>;
}
