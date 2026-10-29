import { useId, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

import * as stylex from '@stylexjs/stylex';
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives';
import { Tooltip } from './ds/tooltip.js';

import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ResolvedChannelSidebarTab,
} from './channel-sidebar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { insertEntryBefore, mergeSavedOrder, moveEntry } from './channel-sidebar-order.js';
import {
  channelSidebarPrefs,
  clampSplitRatio,
  DEFAULT_SPLIT_RATIO,
  MAX_SPLIT_RATIO,
  MIN_SPLIT_RATIO,
  type ChannelSidebarPrefs,
} from './channel-sidebar-prefs.js';
import { ChannelSidebarSettings } from './channel-sidebar-settings.js';
import { ChannelSidebarEntrySection } from './channel-sidebar-view.js';
import { useMountedResource } from './mounted-resource.js';
import { sidebarStyles } from './channel-sidebar-styles.js';
import { hooked } from './ds/hooked.js';
import { IconButton } from './ds/icon-button.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';

const noop = (): void => {};

const focusRing = { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` };

const styles = stylex.create({
  head: {
    display: 'flex',
    alignItems: 'center',
    minHeight: 'var(--bh-channel-header-height)',
    paddingBlock: 0,
    paddingInlineStart: space.x3,
    paddingInlineEnd: `calc(${space.x3} * 3 + ${size.icon} * 2)`,
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    minWidth: 0,
    overflowX: 'auto',
    scrollbarWidth: 'none',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x3,
    flexShrink: 0,
    height: size.icon,
    minWidth: size.icon,
    paddingBlock: 0,
    paddingInline: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.subtle, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    outline: focusRing,
    outlineOffset: '-2px',
  },
  selected: {
    paddingInline: space.x3,
    backgroundColor: { default: color.selected, ':hover': color.selected },
    color: { default: color.fg, ':hover': color.fg },
  },
  badge: { fontSize: text.metaSize },
  views: { position: 'relative', display: 'inline-flex', flexShrink: 0 },
  menu: {
    position: 'fixed',
    zIndex: 1101,
    width: '232px',
    padding: space.x2,
    '--dsw-elevation-stroke-color': color.divider,
    boxShadow: 'var(--dsw-elevation-prominent)',
  },
  menuLabel: {
    paddingTop: space.x3,
    paddingInline: space.x3,
    paddingBottom: space.x2,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    borderRadius: radius.md,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
  },
  dragging: { opacity: 0.5 },
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    minHeight: size.row,
    paddingBlock: space.x2,
    paddingInline: space.x3,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.md,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    textAlign: 'start',
    cursor: { default: 'pointer', ':is([aria-disabled=true])': 'default' },
    outline: focusRing,
    outlineOffset: '-2px',
  },
  check: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    width: '16px',
    height: '16px',
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.borderStrong,
    borderRadius: radius.xs,
    color: color.onAccent,
  },
  checked: { borderColor: color.accent, backgroundColor: color.accent },
  locked: { opacity: 0.5 },
  icon: { display: 'inline-flex', color: color.muted },
  label: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  grip: {
    display: 'inline-flex',
    paddingBlock: 0,
    paddingInline: space.x3,
    color: color.subtle,
    cursor: 'grab',
  },
  hint: {
    paddingBlock: space.x2,
    paddingInline: space.x3,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  split: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    paddingBottom: 0,
  },
});

export function ChannelSidebarTabs({
  tabs,
  entryProps,
  scopeKey,
  prefs = channelSidebarPrefs,
}: {
  tabs: readonly ResolvedChannelSidebarTab[];
  entryProps: ChannelSidebarEntryProps;
  scopeKey: string;
  prefs?: ChannelSidebarPrefs;
}): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const panelId = useId();
  const tabIdPrefix = useId();
  const list = useRef<HTMLDivElement | null>(null);
  const { scope, t } = entryProps;
  const order = mergeSavedOrder(
    tabs.map((tab) => tab.id),
    snapshot.entryOrders[scope],
  );
  const ordered = order.flatMap((id) => tabs.filter((tab) => tab.id === id));
  const shownDefaults = snapshot.shownEntries[scope];
  const defaultHidden = tabs
    .filter((tab) => tab.defaultHidden && !shownDefaults.includes(tab.id))
    .map((tab) => tab.id);
  const hidden = [...new Set([...snapshot.hiddenEntries[scope], ...defaultHidden])];
  const visible = ordered.filter((tab) => !hidden.includes(tab.id));
  const shown = visible.length > 0 ? visible : ordered.slice(0, 1);
  const active = shown.find((tab) => tab.id === snapshot.selectedTabs[scopeKey]) ?? shown[0];
  const select = (id: string): void => prefs.setSelectedTab(scopeKey, id);
  const domId = (id: string): string => `${tabIdPrefix}-${id}`;
  const focusTab = (id: string): void => {
    [...(list.current?.querySelectorAll<HTMLButtonElement>('[data-tab-id]') ?? [])]
      .find((tab) => tab.dataset['tabId'] === id)
      ?.focus();
  };
  const entries = tabs.flatMap((tab) => tab.entries);
  return (
    <>
      <div {...hooked('bh-channel-sidebar-head', styles.head)}>
        <div
          ref={list}
          {...stylex.props(styles.tabs)}
          role="tablist"
          aria-label={t('sidebar.tabs')}
        >
          {shown.map((tab, index) => {
            const selected = tab.id === active?.id;
            return (
              <Tooltip key={tab.id} label={tab.label} side="bottom" delayMs={500}>
                <button
                  type="button"
                  role="tab"
                  id={domId(tab.id)}
                  {...stylex.props(styles.tab, selected && styles.selected)}
                  data-tab-id={tab.id}
                  aria-selected={selected}
                  aria-controls={selected ? panelId : undefined}
                  aria-label={selected ? undefined : tab.label}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => select(tab.id)}
                  onKeyDown={(event) => {
                    const target =
                      event.key === 'ArrowLeft'
                        ? index - 1
                        : event.key === 'ArrowRight'
                          ? index + 1
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? shown.length - 1
                              : undefined;
                    if (target === undefined) return;
                    event.preventDefault();
                    const next = shown[(target + shown.length) % shown.length];
                    if (next === undefined) return;
                    select(next.id);
                    focusTab(next.id);
                  }}
                >
                  <ChannelSidebarIcon name={tab.icon} />
                  {selected ? <span>{tab.label}</span> : null}
                  {tab.badges.length === 0 ? null : (
                    <span {...hooked('bh-channel-sidebar-tab-badge', styles.badge)}>
                      {tab.badges.map((Badge, badgeIndex) => (
                        <Badge key={badgeIndex} {...entryProps} />
                      ))}
                    </span>
                  )}
                </button>
              </Tooltip>
            );
          })}
        </div>
        <ChannelSidebarViewsMenu
          tabs={ordered}
          hidden={hidden}
          onChange={(nextOrder, nextHidden) =>
            prefs.setEntryLayout(scope, nextOrder, nextHidden, [
              ...shownDefaults.filter((id) => !tabs.some((tab) => tab.id === id)),
              ...tabs
                .filter((tab) => tab.defaultHidden && !nextHidden.includes(tab.id))
                .map((tab) => tab.id),
            ])
          }
          t={t}
        />
        {entries.some((entry) => entry.settings !== undefined) ? (
          <ChannelSidebarSettings entries={entries} entryProps={entryProps} />
        ) : null}
      </div>
      {active === undefined ? (
        <div data-sidebar-entries="" {...stylex.props(sidebarStyles.entries)}>
          <p {...stylex.props(sidebarStyles.empty)}>{t('sidebar.empty')}</p>
        </div>
      ) : (
        <div
          key={active.id}
          id={panelId}
          data-sidebar-entries=""
          {...stylex.props(sidebarStyles.entries, active.entries.length === 2 && styles.split)}
          role="tabpanel"
          aria-labelledby={domId(active.id)}
          data-tab-panel={active.id}
        >
          {active.entries.length === 2 ? (
            <ChannelSidebarSplit
              entries={active.entries}
              ratio={snapshot.splitRatios[active.id] ?? DEFAULT_SPLIT_RATIO}
              onRatio={(ratio) => prefs.setSplitRatio(active.id, ratio)}
              entryProps={entryProps}
            />
          ) : (
            active.entries.map((entry) => (
              <ChannelSidebarEntrySection
                key={entry.id}
                entry={entry}
                expanded
                collapsible={false}
                onToggle={noop}
                entryProps={entryProps}
              />
            ))
          )}
        </div>
      )}
    </>
  );
}

function ChannelSidebarSplit({
  entries,
  ratio,
  onRatio,
  entryProps,
}: {
  entries: readonly ChannelSidebarEntry[];
  ratio: number;
  onRatio(ratio: number): void;
  entryProps: ChannelSidebarEntryProps;
}): ReactElement {
  const container = useRef<HTMLDivElement | null>(null);
  const [draft, setDraft] = useState<number | undefined>();
  const current = clampSplitRatio(draft ?? ratio);
  const percent = Math.round(current * 100);
  const ratioAt = (clientY: number): number => {
    const rect = container.current?.getBoundingClientRect();
    if (rect === undefined || rect.height <= 0) return current;
    return clampSplitRatio((clientY - rect.top) / rect.height);
  };
  return (
    <div
      ref={container}
      className="bh-channel-sidebar-split-panes"
      style={{
        ['--bh-split-top' as string]: String(current),
        ['--bh-split-bottom' as string]: String(1 - current),
      }}
    >
      {entries.map((entry, index) => (
        <div
          key={entry.id}
          className="bh-channel-sidebar-split-pane"
          data-split-pane={index === 0 ? 'top' : 'bottom'}
        >
          {index === 1 ? (
            <div
              className="bh-channel-sidebar-split-handle"
              role="separator"
              tabIndex={0}
              aria-orientation="horizontal"
              aria-label={entryProps.t('sidebar.split.resize')}
              aria-valuemin={Math.round(MIN_SPLIT_RATIO * 100)}
              aria-valuemax={Math.round(MAX_SPLIT_RATIO * 100)}
              aria-valuenow={percent}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 0.1 : 0.05;
                const next =
                  event.key === 'ArrowUp'
                    ? current - step
                    : event.key === 'ArrowDown'
                      ? current + step
                      : event.key === 'Home'
                        ? MIN_SPLIT_RATIO
                        : event.key === 'End'
                          ? MAX_SPLIT_RATIO
                          : undefined;
                if (next === undefined) return;
                event.preventDefault();
                onRatio(next);
              }}
              onDoubleClick={() => onRatio(DEFAULT_SPLIT_RATIO)}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                const handle = event.currentTarget;
                handle.setPointerCapture?.(event.pointerId);
                let latest = current;
                const onMove = (move: PointerEvent): void => {
                  latest = ratioAt(move.clientY);
                  setDraft(latest);
                };
                const finish = (commit: boolean): void => {
                  handle.removeEventListener('pointermove', onMove);
                  handle.removeEventListener('pointerup', onUp);
                  handle.removeEventListener('pointercancel', onCancel);
                  setDraft(undefined);
                  if (commit) onRatio(latest);
                };
                const onUp = (): void => finish(true);
                const onCancel = (): void => finish(false);
                handle.addEventListener('pointermove', onMove);
                handle.addEventListener('pointerup', onUp);
                handle.addEventListener('pointercancel', onCancel);
              }}
            />
          ) : null}
          <ChannelSidebarEntrySection
            entry={entry}
            expanded
            collapsible={false}
            fill
            onToggle={noop}
            entryProps={entryProps}
          />
        </div>
      ))}
    </div>
  );
}

function ChannelSidebarViewsMenu({
  tabs,
  hidden,
  onChange,
  t,
}: {
  tabs: readonly ResolvedChannelSidebarTab[];
  hidden: readonly string[];
  onChange(order: readonly string[], hidden: readonly string[]): void;
  t: ChannelSidebarEntryProps['t'];
}): ReactElement {
  const [open, setOpen] = useState<{ top: number; left: number } | undefined>();
  const [dragging, setDragging] = useState<string | undefined>();
  const anchor = useRef<HTMLButtonElement | null>(null);
  const order = tabs.map((tab) => tab.id);
  const shownCount = tabs.filter((tab) => !hidden.includes(tab.id)).length;
  const close = (): void => {
    setOpen(undefined);
    setDragging(undefined);
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  const surface = useMountedResource<HTMLDivElement>((node) => {
    const onPointerDown = (event: PointerEvent): void => {
      if (
        event.target instanceof Node &&
        (node.contains(event.target) || anchor.current?.contains(event.target))
      )
        return;
      closeRef.current();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
      anchor.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
    node.querySelector<HTMLElement>('[role="menuitemcheckbox"]')?.focus();
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, []);
  const toggle = (id: string): void => {
    const isHidden = hidden.includes(id);
    if (!isHidden && shownCount <= 1) return;
    onChange(order, isHidden ? hidden.filter((entry) => entry !== id) : [...hidden, id]);
  };
  const label = t('sidebar.views');
  return (
    <span {...stylex.props(styles.views)}>
      <Tooltip label={label} side="bottom" delayMs={500}>
        <IconButton
          ref={anchor}
          tone="subtle"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open !== undefined}
          onClick={() => {
            if (open !== undefined) return close();
            const rect = anchor.current?.getBoundingClientRect();
            const width = 232;
            setOpen({
              top: (rect?.bottom ?? 0) + 4,
              left: Math.max(8, Math.min(rect?.left ?? 0, window.innerWidth - width - 8)),
            });
          }}
        >
          <ChannelSidebarIcon name="plus" />
        </IconButton>
      </Tooltip>
      {open === undefined ? null : (
        <MenuSurface
          role="menu"
          aria-label={label}
          data-views-menu=""
          className={stylex.props(styles.menu).className}
          style={{ top: `${String(open.top)}px`, left: `${String(open.left)}px` }}
        >
          <div ref={surface}>
            <div {...stylex.props(styles.menuLabel)}>{label}</div>
            {tabs.map((tab, index) => {
              const checked = !hidden.includes(tab.id);
              const locked = checked && shownCount <= 1;
              return (
                <div
                  key={tab.id}
                  {...stylex.props(styles.row, dragging === tab.id && styles.dragging)}
                  data-view-id={tab.id}
                  data-dragging={dragging === tab.id || undefined}
                  draggable
                  onDragStart={(event) => {
                    setDragging(tab.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', tab.id);
                  }}
                  onDragOver={(event) => {
                    if (dragging === undefined || dragging === tab.id) return;
                    event.preventDefault();
                    const rect = event.currentTarget.getBoundingClientRect();
                    const after = event.clientY > rect.top + rect.height / 2;
                    const before = after ? order[index + 1] : tab.id;
                    const next = insertEntryBefore(order, dragging, before);
                    if (next.some((id, position) => id !== order[position])) onChange(next, hidden);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    setDragging(undefined);
                  }}
                  onDragEnd={() => setDragging(undefined)}
                >
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    {...stylex.props(styles.item)}
                    aria-checked={checked}
                    aria-disabled={locked || undefined}
                    title={locked ? t('sidebar.views.keepOne') : undefined}
                    onClick={() => toggle(tab.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        const step = event.key === 'ArrowDown' ? 1 : -1;
                        const target = tabs[index + step];
                        if (target === undefined) return;
                        if (event.altKey) onChange(moveEntry(order, tab.id, target.id), hidden);
                        const id = event.altKey ? tab.id : target.id;
                        const menu = event.currentTarget.closest('[data-views-menu]');
                        requestAnimationFrame(() =>
                          [...(menu?.querySelectorAll<HTMLElement>('[data-view-id]') ?? [])]
                            .find((row) => row.dataset['viewId'] === id)
                            ?.querySelector<HTMLElement>('[role="menuitemcheckbox"]')
                            ?.focus(),
                        );
                      }
                    }}
                  >
                    <span
                      aria-hidden="true"
                      {...stylex.props(
                        styles.check,
                        checked && styles.checked,
                        locked && styles.locked,
                      )}
                    >
                      {checked ? <ChannelSidebarIcon name="check" size={14} /> : null}
                    </span>
                    <span aria-hidden="true" {...stylex.props(styles.icon)}>
                      <ChannelSidebarIcon name={tab.icon} />
                    </span>
                    <span {...stylex.props(styles.label)}>{tab.label}</span>
                  </button>
                  <span aria-hidden="true" {...stylex.props(styles.grip)}>
                    <ChannelSidebarIcon name="grip-vertical" size={14} />
                  </span>
                </div>
              );
            })}
            <div {...stylex.props(styles.hint)}>{t('sidebar.views.hint')}</div>
          </div>
        </MenuSurface>
      )}
    </span>
  );
}
