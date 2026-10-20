import {
  useCallback,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';

import * as stylex from '@stylexjs/stylex';
import { Tooltip } from './ds/tooltip.js';

import type { BridgeActions } from './actions.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarRegistry,
} from './channel-sidebar.js';
import { resolveChannelSidebarContext, resolveChannelSidebarTabs } from './channel-sidebar.js';
import { ChannelSidebarTabs } from './channel-sidebar-tabs.js';
import {
  NARROW_CHANNEL_SIDEBAR_QUERY,
  resolveChannelSidebarMode,
  type ChannelSidebarMode,
} from './channel-sidebar-layout.js';
import {
  channelSidebarPrefs,
  clampChannelSidebarWidth,
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  type ChannelSidebarPrefs,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MIN_CHANNEL_SIDEBAR_WIDTH,
} from './channel-sidebar-prefs.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ClientState } from './store.js';
import { useMountedResource } from './mounted-resource.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { insertEntryBefore, moveEntry, resolveEntryOrder } from './channel-sidebar-order.js';
import { ChannelSidebarSettings } from './channel-sidebar-settings.js';
import { isChannelSettingsSection } from './channel-settings-state.js';
import { sidebarStyles } from './channel-sidebar-styles.js';
import { hooked } from './ds/hooked.js';
import { PanelHeader } from './ds/panel-header.js';
import { space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  entry: { flexGrow: 1, flexShrink: 1, flexBasis: '0%', minWidth: 0 },
  fill: { display: 'flex', flexDirection: 'column', minHeight: 0 },
  body: {
    paddingTop: space.x1,
    paddingInline: space.x4,
    paddingBottom: space.x4,
  },
  fillBody: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    overflow: 'auto',
    paddingBottom: space.x3,
  },
});

function matchesNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_CHANNEL_SIDEBAR_QUERY).matches
    : false;
}

function subscribeNarrow(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const query = window.matchMedia(NARROW_CHANNEL_SIDEBAR_QUERY);
  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

export function useNarrowChannelSidebar(): boolean {
  return useSyncExternalStore(subscribeNarrow, matchesNarrow, () => false);
}

export interface ChannelSidebarController {
  mode: ChannelSidebarMode;
  narrow: boolean;
  scopeKey: string | undefined;
  width: number;
  setWidth(width: number): void;
  isEntryExpanded(entryId: string): boolean;
  toggleEntry(entryId: string): void;
  openTab(tabId: string): void;
  toggle(): void;
  close(): void;
}

export function useChannelSidebar(
  state: ClientState,
  prefs: ChannelSidebarPrefs = channelSidebarPrefs,
): ChannelSidebarController {
  const narrow = useNarrowChannelSidebar();
  const scopeKey = resolveChannelSidebarContext(state)?.scopeKey;
  const [overlay, setOverlay] = useState({ scopeKey, open: false });
  if (overlay.scopeKey !== scopeKey) setOverlay({ scopeKey, open: false });
  const overlayOpen = overlay.scopeKey === scopeKey && overlay.open;
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const docked = scopeKey !== undefined && !snapshot.collapsedSidebars.includes(scopeKey);

  const close = useCallback(() => {
    if (narrow) {
      setOverlay({ scopeKey, open: false });
      return;
    }
    if (scopeKey === undefined) return;
    prefs.setSidebarCollapsed(scopeKey, true);
  }, [narrow, scopeKey, prefs]);

  return {
    mode: resolveChannelSidebarMode({ narrow, docked, overlayOpen }),
    narrow,
    scopeKey,
    width: snapshot.width,
    setWidth: (width) => prefs.setWidth(width),
    isEntryExpanded: (entryId) =>
      scopeKey !== undefined && prefs.isEntryExpanded(scopeKey, entryId),
    toggleEntry: (entryId) => {
      if (scopeKey === undefined) return;
      prefs.setEntryExpanded(scopeKey, entryId, !prefs.isEntryExpanded(scopeKey, entryId));
    },
    openTab: (tabId) => {
      if (scopeKey === undefined) return;
      prefs.setSelectedTab(scopeKey, tabId);
      if (narrow) setOverlay({ scopeKey, open: true });
      else prefs.setSidebarCollapsed(scopeKey, false);
    },
    toggle: () => {
      if (narrow) {
        setOverlay({ scopeKey, open: !overlayOpen });
        return;
      }
      if (scopeKey === undefined) return;
      prefs.setSidebarCollapsed(scopeKey, docked);
    },
    close,
  };
}

export function ChannelSidebarEntrySection({
  entry,
  expanded,
  onToggle,
  entryProps,
  editing = false,
  hidden = false,
  struck = false,
  fill = false,
  collapsible = true,
  preview,
}: {
  preview?: boolean | undefined;
  struck?: boolean;
  fill?: boolean;
  collapsible?: boolean;
  editing?: boolean;
  hidden?: boolean;
  entry: ChannelSidebarEntry;
  expanded: boolean;
  onToggle(): void;
  entryProps: ChannelSidebarEntryProps;
}): ReactElement {
  const bodyId = useId();
  const Badge = entry.badge;
  const HeaderAction = entry.headerAction;
  const HeaderTabs = editing ? undefined : entry.headerTabs;
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [expandable, setExpandable] = useState(true);
  const expandableRef = useRef(expandable);
  const shown = (preview ?? expanded) && !editing && !hidden && expandable;
  const props = {
    ...entryProps,
    refreshRevision,
    requestRefresh: () => setRefreshRevision((value) => value + 1),
    expanded: shown,
    setExpanded: (next: boolean) => {
      if (next === expanded || ((editing || hidden) && next)) return;
      if (next && !expandableRef.current) return;
      onToggle();
    },
    setExpandable: (next: boolean) => {
      expandableRef.current = next;
      setExpandable(next);
      if (!next && expanded) onToggle();
    },
  };
  return (
    <section data-sidebar-entry={entry.id} {...stylex.props(styles.entry, fill && styles.fill)}>
      <PanelHeader
        icon={<ChannelSidebarIcon name={entry.icon} />}
        label={HeaderTabs === undefined ? entry.label : (entry.headerLabel ?? entry.label)}
        badge={Badge === undefined ? undefined : <Badge {...props} />}
        tabs={HeaderTabs === undefined ? undefined : <HeaderTabs {...props} />}
        action={HeaderAction === undefined || editing ? undefined : <HeaderAction {...props} />}
        disclosure={
          collapsible
            ? {
                expanded: shown,
                controls: bodyId,
                disabled: !expandable || editing || hidden || preview !== undefined,
                chevron: !editing,
                onToggle: expandable ? onToggle : undefined,
              }
            : undefined
        }
        dimmed={!expandable}
        locked={editing}
        struck={struck}
      />
      {shown ? (
        <div
          id={bodyId}
          data-sidebar-entry-body=""
          {...stylex.props(styles.body, fill && styles.fillBody)}
        >
          <entry.component {...props} />
        </div>
      ) : null}
    </section>
  );
}

export function ChannelSidebarContents({
  entries,
  registered = entries,
  entryProps,
  controller,
  prefs = channelSidebarPrefs,
}: {
  entries: readonly ChannelSidebarEntry[];
  registered?: readonly ChannelSidebarEntry[];
  entryProps: ChannelSidebarEntryProps;
  controller: Pick<ChannelSidebarController, 'isEntryExpanded' | 'toggleEntry'>;
  prefs?: ChannelSidebarPrefs;
}): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const [draft, setDraft] = useState<
    { order: readonly string[]; hidden: readonly string[] } | undefined
  >();
  const [announcement, setAnnouncement] = useState('');
  const drag = useRef<
    | {
        id: string;
        order: readonly string[];
        bounds: readonly { id: string; top: number; bottom: number }[];
        scrollTop: number;
        next?: readonly string[] | undefined;
      }
    | undefined
  >(undefined);
  const dragBlocked = useRef(false);
  const pointer = useRef<
    { id: string; x: number; y: number; pointerId: number; started: boolean } | undefined
  >(undefined);
  const pointerHandlers = useRef<{
    move(event: PointerEvent): void;
    up(event: PointerEvent): void;
    cancel(event: PointerEvent): void;
  }>({ move() {}, up() {}, cancel() {} });
  const [dragging, setDragging] = useState<string | undefined>();
  const [dragPreview, setDragPreview] = useState<readonly string[] | undefined>();
  const rows = useRef<HTMLDivElement | null>(null);
  const [previewEntry, setPreviewEntry] = useState<string | undefined>();
  const preview = entries.some((entry) => entry.id === previewEntry) ? previewEntry : undefined;
  const editing = draft !== undefined;
  const order = resolveEntryOrder(
    registered.map((entry) => entry.id),
    dragPreview ?? draft?.order ?? snapshot.entryOrders[entryProps.scope],
  );
  const visible = order.flatMap((id) => entries.filter((entry) => entry.id === id));
  const hidden = draft?.hidden ?? snapshot.hiddenEntries[entryProps.scope];
  const announce = (id: string, nextOrder: readonly string[]): void => {
    const next = nextOrder.filter((entryId) => entries.some((entry) => entry.id === entryId));
    const entry = entries.find((entry) => entry.id === id);
    setAnnouncement(
      entryProps.t('sidebar.order.position', {
        label: entry?.label ?? id,
        position: String(next.indexOf(id) + 1),
        total: String(next.length),
      }),
    );
  };
  const beginDrag = (id: string): void => {
    const bounds = [...rows.current!.querySelectorAll<HTMLElement>('[data-entry-id]')].map(
      (row) => {
        const rect = row.getBoundingClientRect();
        return { id: row.dataset['entryId']!, top: rect.top, bottom: rect.bottom };
      },
    );
    drag.current = {
      id,
      order,
      bounds,
      scrollTop: rows.current?.scrollTop ?? 0,
    };
    setDragging(id);
  };
  const previewAt = (clientX: number, clientY: number): void => {
    const gesture = drag.current;
    if (gesture === undefined) return;
    const surface = rows.current!.getBoundingClientRect();
    if (clientX < surface.left || clientX > surface.right) {
      gesture.next = undefined;
      setDragPreview(undefined);
      return;
    }
    const y = clientY + ((rows.current?.scrollTop ?? 0) - gesture.scrollTop);
    const first = gesture.bounds[0];
    const last = gesture.bounds.at(-1);
    if (first === undefined || last === undefined || y < first.top - 8 || y > last.bottom + 8) {
      gesture.next = undefined;
      setDragPreview(undefined);
      return;
    }
    const remaining = gesture.bounds.filter((row) => row.id !== gesture.id);
    const position = remaining.filter((row) => y >= (row.top + row.bottom) / 2).length;
    const next = insertEntryBefore(gesture.order, gesture.id, remaining[position]?.id);
    gesture.next = next;
    setDragPreview((current) =>
      current?.every((id, index) => id === next[index]) && current.length === next.length
        ? current
        : next,
    );
  };
  const applyDrag = (): void => {
    const gesture = drag.current;
    if (gesture === undefined) return;
    if (gesture.next !== undefined && entries.some((entry) => entry.id === gesture.id)) {
      setDraft({ order: gesture.next, hidden });
      announce(gesture.id, gesture.next);
      const handle = rows.current?.querySelectorAll<HTMLButtonElement>('[data-order-handle]');
      for (const button of handle ?? [])
        if (button.dataset['orderHandle'] === gesture.id) button.focus();
    }
    cancelDrag();
  };
  const cancelDrag = (): void => {
    const activePointer = pointer.current;
    pointer.current = undefined;
    if (activePointer !== undefined && rows.current?.hasPointerCapture?.(activePointer.pointerId))
      rows.current.releasePointerCapture(activePointer.pointerId);
    drag.current = undefined;
    setDragging(undefined);
    setDragPreview(undefined);
  };
  const cancelRef = useRef(cancelDrag);
  cancelRef.current = cancelDrag;
  const dragMount = useMountedResource<HTMLDivElement>((node) => {
    rows.current = node;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || (drag.current === undefined && pointer.current === undefined))
        return;
      event.preventDefault();
      event.stopPropagation();
      cancelRef.current();
    };
    const movePointer = (event: PointerEvent) => pointerHandlers.current.move(event);
    const upPointer = (event: PointerEvent) => pointerHandlers.current.up(event);
    const cancelPointer = (event: PointerEvent) => pointerHandlers.current.cancel(event);
    document.addEventListener('pointermove', movePointer, true);
    document.addEventListener('pointerup', upPointer, true);
    document.addEventListener('pointercancel', cancelPointer, true);
    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('pointermove', movePointer, true);
      document.removeEventListener('pointerup', upPointer, true);
      document.removeEventListener('pointercancel', cancelPointer, true);
      pointer.current = undefined;
      document.removeEventListener('keydown', onKeyDown, true);
      rows.current = null;
    };
  }, []);
  const move = (id: string, target: string): void => {
    setDraft({ order: moveEntry(order, id, target), hidden });
    announce(id, moveEntry(order, id, target));
    requestAnimationFrame(() => {
      const handles = rows.current?.querySelectorAll<HTMLButtonElement>('[data-order-handle]');
      for (const handle of handles ?? []) if (handle.dataset['orderHandle'] === id) handle.focus();
    });
  };
  const finish = (save: boolean): void => {
    if (save && draft !== undefined) prefs.setEntryLayout(entryProps.scope, order, draft.hidden);
    setDraft(undefined);
    cancelDrag();
    setAnnouncement('');
  };
  pointerHandlers.current = {
    move(event) {
      const current = pointer.current;
      if (current === undefined || current.pointerId !== event.pointerId) return;
      if (!current.started && Math.hypot(event.clientX - current.x, event.clientY - current.y) < 5)
        return;
      if (!current.started) {
        current.started = true;
        beginDrag(current.id);
      }
      event.preventDefault();
      previewAt(event.clientX, event.clientY);
    },
    up(event) {
      const current = pointer.current;
      if (current === undefined || current.pointerId !== event.pointerId) return;
      if (current.started) {
        previewAt(event.clientX, event.clientY);
        applyDrag();
      } else cancelDrag();
    },
    cancel: (event) => {
      if (pointer.current?.pointerId === event.pointerId) cancelDrag();
    },
  };
  return (
    <>
      <div className="bh-channel-sidebar-head">
        <ChannelSidebarSettings
          entries={entries}
          entryProps={entryProps}
          editing={editing}
          onPreview={setPreviewEntry}
          onEdit={() => setDraft({ order, hidden })}
        />
      </div>
      <div
        data-sidebar-entries=""
        {...(editing
          ? hooked('bh-sidebar-editing', sidebarStyles.entries)
          : stylex.props(sidebarStyles.entries))}
        ref={dragMount}
        onDragOver={(event) => {
          const gesture = drag.current;
          if (!editing || gesture === undefined) return;
          event.preventDefault();
          previewAt(event.clientX, event.clientY);
        }}
        onDragLeave={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          )
            return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX >= bounds.left &&
            event.clientX <= bounds.right &&
            event.clientY >= bounds.top &&
            event.clientY <= bounds.bottom
          )
            return;
          if (drag.current !== undefined) drag.current.next = undefined;
          setDragPreview(undefined);
        }}
        onDrop={(event) => {
          const gesture = drag.current;
          if (!editing || gesture === undefined) return;
          event.preventDefault();
          applyDrag();
        }}
      >
        {editing ? (
          <div className="bh-sidebar-order-toolbar">
            <div className="bh-sidebar-order-hint">{entryProps.t('sidebar.order.hint')}</div>
            <div className="bh-sidebar-order-actions">
              <button type="button" disabled={dragging !== undefined} onClick={() => finish(true)}>
                {entryProps.t('sidebar.order.done')}
              </button>
              <button type="button" disabled={dragging !== undefined} onClick={() => finish(false)}>
                {entryProps.t('sidebar.order.cancel')}
              </button>
              <button
                type="button"
                disabled={dragging !== undefined}
                onClick={() => setDraft({ order: registered.map((entry) => entry.id), hidden: [] })}
              >
                {entryProps.t('sidebar.order.reset')}
              </button>
            </div>
          </div>
        ) : null}
        <span className="bh-sidebar-order-announcement" role="status" aria-live="polite">
          {announcement}
        </span>
        {visible.length === 0 ||
        (!editing && visible.every((entry) => hidden.includes(entry.id))) ? (
          <p {...stylex.props(sidebarStyles.empty)}>
            {entryProps.t(visible.length === 0 ? 'sidebar.empty' : 'sidebar.visibility.empty')}
          </p>
        ) : null}
        {visible.map((entry, index) => (
          <div
            className="bh-sidebar-order-row"
            data-entry-id={entry.id}
            key={entry.id}
            hidden={!editing && hidden.includes(entry.id)}
            data-entry-hidden={hidden.includes(entry.id) || undefined}
            data-dragging={dragging === entry.id || undefined}
            data-drop-indicator={(dragPreview !== undefined && dragging === entry.id) || undefined}
            onPointerDown={(event) => {
              if (
                !editing ||
                event.button !== 0 ||
                event.isPrimary === false ||
                (event.target instanceof Element &&
                  event.target.closest('[data-order-handle], [data-sidebar-no-drag]') !== null)
              )
                return;
              event.preventDefault();
              pointer.current = {
                id: entry.id,
                x: event.clientX,
                y: event.clientY,
                pointerId: event.pointerId,
                started: false,
              };
              rows.current?.setPointerCapture?.(event.pointerId);
            }}
            onPointerDownCapture={(event) => {
              dragBlocked.current =
                event.target instanceof Element &&
                event.target.closest('[data-sidebar-no-drag]') !== null;
            }}
            onDragStart={(event) => {
              if (
                !editing ||
                dragBlocked.current ||
                (event.target instanceof Element &&
                  event.target.closest('[data-sidebar-no-drag]') !== null)
              ) {
                event.preventDefault();
                return;
              }
              beginDrag(entry.id);
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', entry.id);
            }}
            onDragEnd={cancelDrag}
          >
            {editing ? (
              <button
                type="button"
                className="bh-sidebar-order-handle"
                data-order-handle={entry.id}
                draggable
                aria-label={entryProps.t('sidebar.order.move', { label: entry.label })}
                onKeyDown={(event) => {
                  if (drag.current !== undefined) {
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      cancelDrag();
                    }
                    return;
                  }
                  const target =
                    event.key === 'ArrowUp'
                      ? index - 1
                      : event.key === 'ArrowDown'
                        ? index + 1
                        : event.key === 'Home'
                          ? 0
                          : event.key === 'End'
                            ? visible.length - 1
                            : undefined;
                  if (target === undefined) return;
                  event.preventDefault();
                  const next = visible[target];
                  if (next !== undefined) move(entry.id, next.id);
                }}
              >
                <ChannelSidebarIcon name="grip-vertical" />
              </button>
            ) : null}
            <ChannelSidebarEntrySection
              entry={entry}
              expanded={controller.isEntryExpanded(entry.id)}
              onToggle={() => controller.toggleEntry(entry.id)}
              entryProps={entryProps}
              editing={editing}
              hidden={!editing && hidden.includes(entry.id)}
              struck={editing && hidden.includes(entry.id)}
              preview={preview === undefined ? undefined : preview === entry.id}
            />
            {editing && hidden.includes(entry.id) ? (
              <span className="bh-sidebar-hidden-badge">
                {entryProps.t('sidebar.visibility.hidden')}
              </span>
            ) : null}
            {editing ? (
              <Tooltip
                label={entryProps.t(
                  hidden.includes(entry.id) ? 'sidebar.visibility.show' : 'sidebar.visibility.hide',
                  { label: entry.label },
                )}
                side="bottom"
                delayMs={500}
              >
                <button
                  type="button"
                  className="bh-sidebar-visibility-toggle"
                  data-visibility-toggle={entry.id}
                  data-sidebar-no-drag=""
                  disabled={dragging !== undefined}
                  aria-pressed={!hidden.includes(entry.id)}
                  aria-label={entryProps.t(
                    hidden.includes(entry.id)
                      ? 'sidebar.visibility.show'
                      : 'sidebar.visibility.hide',
                    { label: entry.label },
                  )}
                  onClick={() =>
                    setDraft({
                      order,
                      hidden: hidden.includes(entry.id)
                        ? hidden.filter((id) => id !== entry.id)
                        : [...hidden, entry.id],
                    })
                  }
                >
                  <ChannelSidebarIcon name={hidden.includes(entry.id) ? 'eye-off' : 'eye'} />
                </button>
              </Tooltip>
            ) : null}
          </div>
        ))}
      </div>
    </>
  );
}

export function ChannelSidebar({
  registry,
  state,
  actions,
  controller,
  t,
  onMentionBot,
  onMemoryCommitSelect,
  selectedMemoryCommitSha,
  onMemoryFileSelect,
  selectedMemoryFilePath,
  onMemoryWorkingSelect,
  selectedMemoryWorking,
}: {
  registry: ChannelSidebarRegistry;
  state: ClientState;
  actions: BridgeActions;
  controller: ChannelSidebarController;
  t: BotHarnessTranslate;
  onMentionBot?: ChannelSidebarEntryProps['onMentionBot'];
  onMemoryCommitSelect?: ((sha: string) => void) | undefined;
  selectedMemoryCommitSha?: string | undefined;
  onMemoryFileSelect?: ((path: string) => void) | undefined;
  selectedMemoryFilePath?: string | undefined;
  onMemoryWorkingSelect?: ((change: import('./bridge.js').MemoryWorkingChange) => void) | undefined;
  selectedMemoryWorking?: import('./bridge.js').MemoryWorkingChange | undefined;
}): ReactElement | null {
  const context = resolveChannelSidebarContext(state);
  const channel = context?.channel;
  const scope = context?.scope ?? 'channel';
  const entries = useSyncExternalStore(
    registry.subscribe,
    () => registry.entries(scope),
    () => registry.entries(scope),
  );
  const tabs = useSyncExternalStore(
    registry.subscribe,
    () => registry.tabs(scope),
    () => registry.tabs(scope),
  );
  const selectedBotSlug = context?.botSlug;
  const closeRef = useRef(controller);
  closeRef.current = controller;
  const overlayMount = useMountedResource<HTMLDivElement>(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeRef.current.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [controller.mode]);

  if (controller.scopeKey === undefined || controller.mode === 'hidden') {
    return null;
  }
  const entryProps: ChannelSidebarEntryProps | undefined =
    channel === undefined
      ? undefined
      : {
          scope,
          channelId: channel.id,
          conversationRevision: state.conversation.revision,
          botSlug: selectedBotSlug,
          actions,
          t,
          onMentionBot,
          onMemoryCommitSelect,
          selectedMemoryCommitSha,
          onMemoryFileSelect,
          selectedMemoryFilePath,
          onMemoryWorkingSelect,
          selectedMemoryWorking,
        };
  const sidebarEntries = entries.filter(
    (entry) => entry.id !== 'bot-inbox' && !isChannelSettingsSection(entry),
  );
  const visibleEntries =
    entryProps === undefined
      ? []
      : sidebarEntries.filter((entry) => entry.visible?.(state) ?? true);
  const dockedWidth = clampChannelSidebarWidth(controller.width);
  const panel = (
    <div
      id="bh-channel-sidebar"
      className={`bh-channel-sidebar${controller.mode === 'overlay' ? ' bh-channel-sidebar-overlay' : ''}`}
      data-bh-tour="channel-sidebar"
      role="complementary"
      aria-label={t('sidebar.region')}
      style={
        controller.mode === 'overlay'
          ? undefined
          : { width: `${String(dockedWidth)}px`, flexBasis: `${String(dockedWidth)}px` }
      }
    >
      {controller.mode === 'overlay' ? null : (
        <div
          className="bh-channel-sidebar-resize"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={t('sidebar.resize.label')}
          aria-valuenow={dockedWidth}
          aria-valuemin={MIN_CHANNEL_SIDEBAR_WIDTH}
          aria-valuemax={MAX_CHANNEL_SIDEBAR_WIDTH}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 40 : 10;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              controller.setWidth(dockedWidth + step);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              controller.setWidth(dockedWidth - step);
            } else if (event.key === 'Home') {
              event.preventDefault();
              controller.setWidth(MIN_CHANNEL_SIDEBAR_WIDTH);
            } else if (event.key === 'End') {
              event.preventDefault();
              controller.setWidth(MAX_CHANNEL_SIDEBAR_WIDTH);
            }
          }}
          onPointerDown={(event) => {
            const startX = event.clientX;
            const startWidth = dockedWidth;
            event.currentTarget.setPointerCapture(event.pointerId);
            const onMove = (move: PointerEvent): void => {
              controller.setWidth(startWidth - (move.clientX - startX));
            };
            const onUp = (): void => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
          onDoubleClick={() => controller.setWidth(DEFAULT_CHANNEL_SIDEBAR_WIDTH)}
        />
      )}
      {entryProps === undefined ? null : controller.mode === 'dock' ? (
        <ChannelSidebarTabs
          key={controller.scopeKey}
          tabs={resolveChannelSidebarTabs(tabs, visibleEntries)}
          entryProps={entryProps}
          scopeKey={controller.scopeKey}
        />
      ) : (
        <ChannelSidebarContents
          key={controller.scopeKey}
          entries={visibleEntries}
          registered={sidebarEntries}
          entryProps={entryProps}
          controller={controller}
        />
      )}
    </div>
  );
  if (controller.mode === 'overlay') {
    return (
      <div ref={overlayMount} className="bh-channel-sidebar-overlay-layer">
        <div
          className="bh-channel-sidebar-backdrop"
          aria-hidden="true"
          onClick={controller.close}
        />
        {panel}
      </div>
    );
  }
  return panel;
}
