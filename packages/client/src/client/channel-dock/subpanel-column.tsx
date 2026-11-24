import { AppearancePanelHeader } from '../appearance-panel-header.js';
import { SessionHeaderSlot } from '../session-header-slot.js';
import { AppearanceContext } from '../appearance-context.js';
import { PanelAppearanceSettings } from '../appearance-panel-settings.js';
import { panelTargetId } from '../appearance-panels.js';
import { MESSAGE_LEAF, moveChannelSplit } from '../channel-split-layout.js';
import { workspaceShortcutId } from '../workspace-shortcuts.js';
import { usePanelMenu } from '../panel-menu.js';
import { PanelEmptyState } from '../ds/empty-state.js';
import { WorkspaceContext } from '../workspace-context.js';
import {
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type DragEvent as ReactDragEvent,
  type ReactElement,
} from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from '../ds/tooltip.js';
import { BOT_WORKSPACE_PANELS, type DockPosition } from '../channel-dock-layout.js';
import { DEFAULT_SUBPANEL_HEIGHT, MIN_SUBPANEL_HEIGHT } from '../layout-mode.js';
import { edgeScrollStep, insertEntryBefore, resolveEntryOrder } from '../channel-sidebar-order.js';
import { rowDropHalf } from '../roster-order.js';
import { useMountedResource } from '../mounted-resource.js';
import { IconButton } from '../ds/icon-button.js';
import { PanelHeader } from '../ds/panel-header.js';
import { EntryPart } from '../entry-part.js';
import { styles, SUBPANEL_DROP_TYPE } from './dock-styles.js';
import {
  ChannelSidebarIcon,
  type ChannelSessionView,
  type SubpanelColumnView,
  type DockContextValue,
  DockBodySlot,
  DockFilesSlot,
  useDock,
  entryScopeKey,
  useEntryProps,
  workspaceState,
} from './dock-context.js';
import { scopePanelPart, ChannelEntryContent } from './entry-panel.js';

const GENERATED_FILES = 'generated-files';
export const SESSION_DETAIL = 'session-detail';

interface ColumnEntry {
  id: string;
  label: string;
  icon: string | undefined;
}

export function columnEntries(dock: DockContextValue): ColumnEntry[] {
  const channel = dock.channel;
  if (channel === undefined) return [];
  const bot = channel.type === 'dm' && !!channel.botSlug;
  const builtIn: readonly string[] = BOT_WORKSPACE_PANELS;
  const registered = (id: string): ColumnEntry[] => {
    const panel = dock.panels.get(id);
    return panel ? [{ id, label: panel.title, icon: panel.icon }] : [];
  };
  return [
    ...(dock.channelPanelIds.includes('sessions') ? registered('sessions') : []),
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

function mergeVisibleSubpanelOrder(
  fullOrder: readonly string[],
  visibleOrder: readonly string[],
): readonly string[] {
  const visible = new Set(visibleOrder);
  const queue = [...visibleOrder];
  return fullOrder.map((id) => (visible.has(id) ? queue.shift()! : id));
}

interface SubpanelReorderApi {
  readonly activeId: string | undefined;
  begin(id: string, event: ReactDragEvent<HTMLElement>): void;
  over(id: string, event: ReactDragEvent<HTMLElement>): void;
  drop(event: ReactDragEvent<HTMLElement>): void;
  finish(): void;
  cancel(): void;
  nudge(id: string, delta: -1 | 1): void;
}

function SessionDetailHeader({
  dock,
  session,
  slot,
}: {
  dock: DockContextValue;
  session: ChannelSessionView;
  slot(node: HTMLElement | null): void;
}): ReactElement {
  const label = dock.t('dock.close', { label: session.title });
  return (
    <PanelHeader
      label={session.title}
      onHide={session.close}
      hideLabel={label}
      hideHint={dock.t('dock.headHintHide')}
      badge={
        <span ref={slot} data-session-header-chips="" {...stylex.props(styles.sessionChips)} />
      }
      action={
        <Tooltip label={label} side="bottom">
          <IconButton aria-label={label} onClick={session.close}>
            <ChannelSidebarIcon name="x" />
          </IconButton>
        </Tooltip>
      }
    />
  );
}

export function SessionDockHeader({
  dock,
  session,
  slot,
}: {
  dock: DockContextValue;
  session: ChannelSessionView;
  slot(node: HTMLElement | null): void;
}): ReactElement {
  const appearance = useContext(AppearanceContext);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const menu = usePanelMenu({
    items: [
      ...(appearance
        ? [
            { id: 'appearance', label: dock.t('appearance.panelMenu') },
            { type: 'separator' as const, id: 'appearance-separator' },
          ]
        : []),
      ...(['left', 'right', 'above', 'below'] as const).map((direction) => ({
        id: direction,
        label: dock.t(`workspace.session.${direction}`),
      })),
    ],
    onSelect: (id) => {
      if (id === 'appearance') setAppearanceOpen(true);
      else
        dock.childLayout.setTree(
          moveChannelSplit(
            dock.childLayout.tree,
            SESSION_DETAIL,
            MESSAGE_LEAF,
            id as DockPosition['direction'],
          ),
        );
    },
  });
  return (
    <>
      {appearanceOpen && appearance && (
        <PanelAppearanceSettings
          owner={appearance}
          id={panelTargetId(SESSION_DETAIL)}
          label={session.title}
          t={dock.t}
          onClose={() => setAppearanceOpen(false)}
        />
      )}
      <div data-appearance-header={SESSION_DETAIL} {...menu.triggerProps}>
        {menu.menu}
        <SessionDetailHeader dock={dock} session={session} slot={slot} />
      </div>
    </>
  );
}

function SessionDetailAside({
  dock,
  session,
}: {
  dock: DockContextValue;
  session: ChannelSessionView;
}): ReactElement {
  const members = dock.members;
  const ratio = members?.ratio ?? 0.4;
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  return (
    <>
      <div
        className="bh-message-member-divider"
        role="separator"
        tabIndex={0}
        aria-label={session.title}
        aria-orientation="vertical"
        aria-valuemin={20}
        aria-valuemax={60}
        aria-valuenow={Math.round(ratio * 100)}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
          event.preventDefault();
          members?.setRatio(ratio + (event.key === 'ArrowLeft' ? 0.02 : -0.02));
        }}
        onPointerDown={(event) => {
          if (event.button === 0) event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
          const box = event.currentTarget.parentElement!.getBoundingClientRect();
          const aside = event.currentTarget.nextElementSibling!.getBoundingClientRect();
          members?.setRatio((aside.right - event.clientX) / box.width);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
      />
      <aside
        className="bh-message-members"
        aria-label={session.title}
        data-session-aside=""
        style={{ width: `${ratio * 100}%` }}
      >
        <AppearancePanelHeader id={SESSION_DETAIL} label={session.title} t={dock.t}>
          <SessionDetailHeader dock={dock} session={session} slot={setSlot} />
        </AppearancePanelHeader>
        <div className="bh-channel-subpanel-body" data-appearance-body={SESSION_DETAIL}>
          <SessionHeaderSlot.Provider value={slot}>{session.content}</SessionHeaderSlot.Provider>
        </div>
      </aside>
    </>
  );
}

export function SimpleMessageContent({ column }: { column: SubpanelColumnView }): ReactElement {
  const dock = useDock();
  const all = columnEntries(dock);
  const byId = new Map(all.map((entry) => [entry.id, entry]));
  const baseOrder = resolveEntryOrder(
    all.map((entry) => entry.id),
    column.state.order,
  );
  const [preview, setPreview] = useState<
    | { id: string; order: readonly string[]; anchor: { id: string; half: 'before' | 'after' } }
    | undefined
  >(undefined);
  const escapeRef = useRef<((event: KeyboardEvent) => void) | undefined>(undefined);
  const unmountCleanup = useMountedResource(
    () => () => {
      if (escapeRef.current) window.removeEventListener('keydown', escapeRef.current);
      if (scrollRaf.current !== undefined && typeof cancelAnimationFrame === 'function')
        cancelAnimationFrame(scrollRaf.current);
    },
    [],
  );
  const columnRef = useRef<HTMLElement | null>(null);
  const pointerY = useRef<number | undefined>(undefined);
  const scrollRaf = useRef<number | undefined>(undefined);
  const previewRef = useRef<typeof preview>(undefined);
  previewRef.current = preview;
  const focusNonce = useRef(0);
  const [focusSignal, setFocusSignal] = useState<{ id: string; nonce: number } | undefined>(
    undefined,
  );
  const [announcement, setAnnouncement] = useState<string | undefined>(undefined);
  const stopScroll = (): void => {
    if (scrollRaf.current !== undefined && typeof cancelAnimationFrame === 'function')
      cancelAnimationFrame(scrollRaf.current);
    scrollRaf.current = undefined;
    pointerY.current = undefined;
  };
  const tickScroll = (): void => {
    scrollRaf.current = undefined;
    const view = columnRef.current;
    const y = pointerY.current;
    if (view !== null && y !== undefined && typeof requestAnimationFrame === 'function') {
      const box = view.getBoundingClientRect();
      view.scrollTop += edgeScrollStep(y, box.top, box.bottom);
    }
    if (previewRef.current !== undefined && typeof requestAnimationFrame === 'function')
      scrollRaf.current = requestAnimationFrame(tickScroll);
  };
  const fullOrder = preview?.order ?? baseOrder;
  const visibleIds = (order: readonly string[]): string[] =>
    order.flatMap((id) => {
      const entry = byId.get(id);
      return entry === undefined || column.state.hidden.includes(id) ? [] : [id];
    });
  const commitVisible = (visible: readonly string[]): void => {
    column.setOrder(mergeVisibleSubpanelOrder(baseOrder, visible));
  };
  const endPreview = (): void => {
    if (escapeRef.current) {
      window.removeEventListener('keydown', escapeRef.current);
      escapeRef.current = undefined;
    }
    stopScroll();
    setPreview(undefined);
  };
  const announceMove = (id: string, visible: readonly string[]): void => {
    setAnnouncement(
      dock.t('workspace.subpanelColumn.moved', {
        label: byId.get(id)?.label ?? id,
        position: String(visible.indexOf(id) + 1),
        total: String(visible.length),
      }),
    );
  };
  const requestFocus = (id: string): void => {
    focusNonce.current += 1;
    setFocusSignal({ id, nonce: focusNonce.current });
  };
  const reorder: SubpanelReorderApi = {
    activeId: preview?.id,
    begin: (id, event) => {
      const transfer = event.dataTransfer;
      if (!transfer) return;
      transfer.setData(SUBPANEL_DROP_TYPE, id);
      transfer.effectAllowed = 'move';
      const header = event.currentTarget.closest('[data-subpanel-entry-header]');
      if (header instanceof HTMLElement && typeof transfer.setDragImage === 'function')
        transfer.setDragImage(header, 0, 0);
      escapeRef.current = (keyEvent) => {
        if (keyEvent.key === 'Escape') {
          keyEvent.preventDefault();
          endPreview();
        }
      };
      window.addEventListener('keydown', escapeRef.current);
      const reduceMotion =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (
        !reduceMotion &&
        typeof requestAnimationFrame === 'function' &&
        scrollRaf.current === undefined
      )
        scrollRaf.current = requestAnimationFrame(tickScroll);
      setPreview({ id, order: baseOrder, anchor: { id, half: 'before' } });
    },
    over: (id, event) => {
      const transfer = event.dataTransfer;
      if (preview === undefined || !transfer?.types.includes(SUBPANEL_DROP_TYPE)) return;
      event.preventDefault();
      transfer.dropEffect = 'move';
      pointerY.current = event.clientY;
      const header =
        event.currentTarget.querySelector('[data-subpanel-entry-header]') ?? event.currentTarget;
      const dropHalf = rowDropHalf(event.clientY, header.getBoundingClientRect());
      const visible = visibleIds(preview.order);
      const anchor = dropHalf === 'before' ? id : visible[visible.indexOf(id) + 1];
      const nextVisible = insertEntryBefore(visible, preview.id, anchor);
      if (nextVisible.join('') === visible.join('')) return;
      setPreview({
        id: preview.id,
        order: mergeVisibleSubpanelOrder(baseOrder, nextVisible),
        anchor: { id, half: dropHalf },
      });
    },
    drop: (event) => {
      if (preview === undefined) return;
      event.preventDefault();
      const order = preview.order;
      const moved = preview.id;
      endPreview();
      column.setOrder(order);
      const visible = visibleIds(order);
      if (order.join('') !== baseOrder.join('')) announceMove(moved, visible);
      requestFocus(moved);
    },
    finish: () => endPreview(),
    cancel: () => endPreview(),
    nudge: (id, delta) => {
      const visible = visibleIds(baseOrder);
      const index = visible.indexOf(id);
      if (index < 0 || (delta < 0 && index === 0)) return;
      const anchor = delta < 0 ? visible[index - 1] : visible[index + 2];
      const nextVisible = insertEntryBefore(visible, id, anchor);
      if (nextVisible.join('') === visible.join('')) return;
      commitVisible(nextVisible);
      announceMove(id, nextVisible);
      requestFocus(id);
    },
  };
  const anchor = preview?.anchor;
  const entries = visibleIds(fullOrder).flatMap((id) => {
    const entry = byId.get(id);
    return entry === undefined ? [] : [entry];
  });
  const label = dock.t('workspace.subpanelColumn');
  return (
    <div ref={unmountCleanup} className="bh-dock-body bh-message-split">
      <div className="bh-message-content">
        <DockBodySlot />
      </div>
      {dock.channel !== undefined && dock.session !== undefined ? (
        <SessionDetailAside dock={dock} session={dock.session} />
      ) : null}
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
            ref={columnRef}
            className="bh-subpanel-column"
            data-subpanel-column=""
            aria-label={label}
            style={{ width: `${column.state.width * 100}%` }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
              pointerY.current = undefined;
            }}
            onDragOver={(event) => {
              if (preview !== undefined) pointerY.current = event.clientY;
            }}
          >
            {announcement === undefined ? null : (
              <span
                className="bh-sr-only"
                role="status"
                aria-live="polite"
                data-subpanel-announce=""
              >
                {announcement}
              </span>
            )}
            {entries.length === 0 ? (
              <PanelEmptyState icon="panel-right">{dock.t('dock.empty')}</PanelEmptyState>
            ) : (
              entries.flatMap((entry) => {
                const section = (
                  <SubpanelColumnEntry
                    key={entry.id}
                    entry={entry}
                    column={column}
                    reorder={reorder}
                    focusSignal={focusSignal}
                  />
                );
                if (anchor?.id !== entry.id) return [section];
                const line = (
                  <div
                    key={`${entry.id}-drop-line`}
                    className="bh-subpanel-drop-line"
                    data-drop-line=""
                  />
                );
                return anchor.half === 'before' ? [line, section] : [section, line];
              })
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
  reorder,
  focusSignal,
}: {
  entry: ColumnEntry;
  column: SubpanelColumnView;
  reorder: SubpanelReorderApi;
  focusSignal: { id: string; nonce: number } | undefined;
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
  const focusFollow = useMountedResource<HTMLElement>(
    (node) => {
      if (focusSignal?.id !== entry.id) return;
      const head = node.querySelector<HTMLElement>('[data-panel-head]');
      head?.scrollIntoView?.({ block: 'nearest' });
      head?.focus({ preventScroll: true });
    },
    [focusSignal, entry.id],
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
      ref={(node) => {
        focusMount(node);
        focusFollow(node);
      }}
      className="bh-subpanel-entry"
      data-subpanel-entry={entry.id}
      data-expanded={expanded ? '' : undefined}
      data-dragging={reorder.activeId === entry.id ? '' : undefined}
      onDragOver={(event) => reorder.over(entry.id, event)}
      onDrop={(event) => reorder.drop(event)}
    >
      <div
        className="bh-subpanel-entry-header"
        data-subpanel-entry-header=""
        data-appearance-header={entry.id}
        {...contextMenu.triggerProps}
      >
        {contextMenu.menu}
        <PanelHeader
          icon={<ChannelSidebarIcon name={entry.icon} />}
          label={entry.label}
          headDrag={{
            onDragStart: (event) => reorder.begin(entry.id, event),
            onDragEnd: () => reorder.finish(),
            onKeyDown: (event) => {
              if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
                event.preventDefault();
                reorder.nudge(entry.id, event.key === 'ArrowUp' ? -1 : 1);
                return;
              }
              if (event.key === 'Escape' && reorder.activeId !== undefined) {
                event.preventDefault();
                reorder.cancel();
              }
            },
          }}
          disclosure={{
            expanded,
            controls: bodyId,
            disabled: false,
            chevron: true,
            onToggle: () => column.toggleEntry(entry.id),
          }}
          badge={
            Badge === undefined || props === undefined
              ? undefined
              : dock.conversation(
                  <EntryPart key={entryScopeKey(props)} part={Badge} props={props} />,
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
                {HeaderAction === undefined || props === undefined
                  ? null
                  : dock.conversation(
                      <EntryPart key={entryScopeKey(props)} part={HeaderAction} props={props} />,
                    )}
                {PanelAction &&
                  scopePanelPart(
                    dock,
                    panel,
                    <PanelAction
                      key={panel?.scope === 'channel' ? dock.channel?.id : undefined}
                      channel={panel?.scope === 'channel' ? dock.channel : undefined}
                    />,
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
              if (reorder.activeId !== undefined) return;
              if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
              event.preventDefault();
              column.setHeight(entry.id, height + (event.key === 'ArrowDown' ? 16 : -16));
            }}
            onPointerDown={(event) => {
              if (reorder.activeId !== undefined) return;
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

export function SubpanelControl({ id }: { id: string }) {
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
