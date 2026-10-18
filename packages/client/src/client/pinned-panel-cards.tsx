import { useState, useSyncExternalStore, type DragEvent, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';

import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { DockPanelRegistry } from './dock-panels.js';
import { hooked } from './ds/hooked.js';
import { border, color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';

export interface PinnedPanelBadge {
  readonly count: number;
  readonly dot: boolean;
  readonly label?: string | undefined;
}

export interface PinnedPanelCardsProps {
  registry: DockPanelRegistry;
  collapsed: boolean;
  order?: readonly string[] | undefined;
  shortcut?: ((id: string) => readonly string[] | undefined) | undefined;
  onOrderChange?: ((ids: readonly string[]) => void) | undefined;
  hiddenIds?: readonly string[] | undefined;
  current?: string | undefined;
  badge?: ((id: string) => PinnedPanelBadge | undefined) | undefined;
  fallback?: ((id: string) => (() => void) | undefined) | undefined;
  tourOf?: ((id: string) => string | undefined) | undefined;
  t: BotHarnessTranslate;
}

export function PinnedPanelCards({
  registry,
  collapsed,
  order,
  shortcut,
  onOrderChange,
  hiddenIds,
  current,
  badge,
  fallback,
  tourOf,
  t,
}: PinnedPanelCardsProps): ReactElement | null {
  const [dragging, setDragging] = useState<string | null>(null);
  const [insertion, setInsertion] = useState<{ id: string; after: boolean } | null>(null);
  const clearDrag = (): void => {
    setDragging(null);
    setInsertion(null);
  };
  const panels = useSyncExternalStore(registry.subscribe, registry.panels, registry.panels);
  const openIds = useSyncExternalStore(
    registry.subscribe,
    registry.openPanels,
    registry.openPanels,
  );
  const available = useSyncExternalStore(
    registry.subscribe,
    registry.available,
    registry.available,
  );
  const visible = panels.filter((panel) => !hiddenIds?.includes(panel.id));
  const ids = [...new Set([...(order ?? []), ...visible.map((panel) => panel.id)])];
  const sorted = [...visible].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  const move = (id: string, before: string, after = false): void => {
    if (id === before || !ids.includes(id)) return;
    const next = ids.filter((item) => item !== id);
    next.splice(next.indexOf(before) + (after ? 1 : 0), 0, id);
    onOrderChange?.(next);
  };
  const dropPosition = (event: DragEvent<HTMLDivElement>) => {
    const buttons = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-pinned-panel]'),
    ];
    const nearest = buttons.reduce<HTMLButtonElement | null>((best, button) => {
      const distance = (node: HTMLButtonElement) => {
        const rect = node.getBoundingClientRect();
        return Math.hypot(
          event.clientX - rect.x - rect.width / 2,
          event.clientY - rect.y - rect.height / 2,
        );
      };
      return !best || distance(button) < distance(best) ? button : best;
    }, null);
    if (!nearest) return null;
    const rect = nearest.getBoundingClientRect();
    return {
      id: nearest.dataset.pinnedPanel!,
      after: collapsed
        ? event.clientY > rect.y + rect.height / 2
        : event.clientX > rect.x + rect.width / 2,
    };
  };
  if (sorted.length === 0) return null;
  return (
    <div
      {...hooked('bh-pinned-panels', styles.grid, collapsed && styles.rail)}
      role="group"
      aria-label={t('dock.panels')}
      onDragOver={(event) => {
        if (!dragging || !event.dataTransfer.types.includes('application/x-bh-panel-order')) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'move';
        setInsertion(dropPosition(event));
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setInsertion(null);
      }}
      onDrop={(event) => {
        if (!dragging || !event.dataTransfer.types.includes('application/x-bh-panel-order')) return;
        event.preventDefault();
        event.stopPropagation();
        const target = dropPosition(event);
        if (target) move(dragging, target.id, target.after);
        clearDrag();
      }}
      onDragEnd={clearDrag}
    >
      {sorted.map((panel, index) => {
        const open = openIds.includes(panel.id) || current === panel.id;
        const run = available ? () => registry.toggle(panel.id) : fallback?.(panel.id);
        const mark = badge?.(panel.id);
        const keys = shortcut?.(panel.id);
        const tooltipLabel = [
          panel.title,
          ...(mark?.label === undefined ? [] : [mark.label]),
          ...(run === undefined ? [t('dock.cardUnavailable')] : []),
        ].join(' · ');
        const label = [tooltipLabel, ...(keys?.length ? [keys.join(' ')] : [])].join(' · ');
        return (
          <Tooltip
            key={panel.id}
            label={tooltipLabel}
            shortcutKeys={keys}
            portal
            side={collapsed ? 'right' : 'bottom'}
            delayMs={400}
          >
            <button
              type="button"
              {...hooked(
                'bh-pinned-panel',
                styles.card,
                collapsed && styles.railCard,
                open && styles.open,
                collapsed && open && styles.railOpen,
                run === undefined && styles.disabled,
                dragging === panel.id && styles.dragging,
              )}
              data-pinned-panel={panel.id}
              data-dragging={dragging === panel.id ? 'true' : undefined}
              data-bh-tour={tourOf?.(panel.id)}
              data-open={open ? 'true' : undefined}
              aria-label={label}
              aria-pressed={open}
              aria-disabled={run === undefined ? true : undefined}
              onClick={run}
              draggable={onOrderChange !== undefined}
              aria-description={onOrderChange ? t('workspace.reorderHint') : undefined}
              onDragStart={(event) => {
                if (!onOrderChange) return;
                event.dataTransfer.setData('application/x-bh-panel-order', panel.id);
                event.dataTransfer.effectAllowed = 'move';
                setDragging(panel.id);
              }}
              onKeyDown={(event) => {
                if (
                  !onOrderChange ||
                  !event.altKey ||
                  !['ArrowUp', 'ArrowDown'].includes(event.key)
                )
                  return;
                event.preventDefault();
                if (event.key === 'ArrowUp' && index > 0) move(panel.id, sorted[index - 1]!.id);
                if (event.key === 'ArrowDown' && index < sorted.length - 1)
                  move(sorted[index + 1]!.id, panel.id);
              }}
            >
              {insertion?.id === panel.id && dragging !== panel.id && (
                <span
                  {...stylex.props(
                    styles.insertion,
                    collapsed
                      ? insertion.after
                        ? styles.insertBelow
                        : styles.insertAbove
                      : insertion.after
                        ? styles.insertRight
                        : styles.insertLeft,
                    collapsed && index === 0 && !insertion.after && styles.insertFirst,
                    collapsed &&
                      index === sorted.length - 1 &&
                      insertion.after &&
                      styles.insertLast,
                  )}
                  data-panel-order-indicator={insertion.after ? 'after' : 'before'}
                  aria-hidden="true"
                />
              )}
              <ChannelSidebarIcon name={panel.icon} size={collapsed ? 18 : 16} />
              {mark === undefined ? null : mark.count > 0 && !collapsed ? (
                <span {...stylex.props(styles.count)} data-pinned-panel-count="">
                  {mark.count > 99 ? '99+' : mark.count}
                </span>
              ) : mark.count > 0 || mark.dot ? (
                <span {...stylex.props(styles.dot)} data-pinned-panel-dot="" />
              ) : null}
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

const styles = stylex.create({
  grid: {
    display: 'grid',
    flexShrink: 0,
    gridTemplateColumns: 'repeat(auto-fill, minmax(44px, 1fr))',
    gap: space.x3,
    marginInline: space.x1,
    marginBottom: space.x4,
  },
  rail: {
    gridTemplateColumns: '36px',
    justifyContent: 'center',
    gap: space.x3,
    marginInline: 0,
  },
  card: {
    position: 'relative',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '40px',
    padding: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: 'transparent',
    outline: {
      default: 'none',
      ':focus-visible': `${border.focus} solid ${color.accent}`,
    },
    outlineOffset: '-2px',
    borderRadius: radius.md,
    cornerShape: 'round',
    color: color.muted,
    backgroundColor: {
      default: color.hover,
      ':hover': color.selected,
    },
    cursor: 'pointer',
    transitionDuration: '120ms',
    transitionProperty: 'background-color, color, border-color',
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0s',
    },
  },
  railCard: {
    width: '36px',
    height: '36px',
  },
  open: {
    borderColor: color.accent,
    color: color.accent,
    backgroundColor: {
      default: color.accentTint,
      ':hover': color.accentTint,
    },
  },
  railOpen: {
    borderColor: 'transparent',
  },
  disabled: {
    opacity: 0.45,
    cursor: 'default',
    backgroundColor: {
      default: color.hover,
      ':hover': color.hover,
    },
  },
  dragging: {
    opacity: 0.4,
    cursor: 'grabbing',
  },
  insertion: {
    position: 'absolute',
    pointerEvents: 'none',
    backgroundColor: color.accent,
    borderRadius: radius.round,
    zIndex: 1,
  },
  insertAbove: { top: '-5px', height: '3px', left: 0, right: 0 },
  insertBelow: { bottom: '-5px', height: '3px', left: 0, right: 0 },
  insertFirst: { top: 0 },
  insertLast: { bottom: 0 },
  insertLeft: { left: 0, width: '3px', top: 0, bottom: 0 },
  insertRight: { right: 0, width: '3px', top: 0, bottom: 0 },
  count: {
    position: 'absolute',
    top: `calc(-1 * ${space.x2})`,
    right: `calc(-1 * ${space.x2})`,
    boxSizing: 'border-box',
    minWidth: '18px',
    paddingInline: space.x2,
    borderRadius: radius.lg,
    color: color.onDanger,
    backgroundColor: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  },
  dot: {
    position: 'absolute',
    top: space.x2,
    right: space.x2,
    width: '6px',
    height: '6px',
    borderRadius: radius.round,
    backgroundColor: color.danger,
  },
});
