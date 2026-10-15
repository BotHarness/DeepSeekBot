import { useSyncExternalStore, type ReactElement } from 'react';
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
  current?: string | undefined;
  badge?: ((id: string) => PinnedPanelBadge | undefined) | undefined;
  fallback?: ((id: string) => (() => void) | undefined) | undefined;
  tourOf?: ((id: string) => string | undefined) | undefined;
  t: BotHarnessTranslate;
}

export function PinnedPanelCards({
  registry,
  collapsed,
  current,
  badge,
  fallback,
  tourOf,
  t,
}: PinnedPanelCardsProps): ReactElement | null {
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
  if (panels.length === 0) return null;
  return (
    <div
      {...hooked('bh-pinned-panels', styles.grid, collapsed && styles.rail)}
      role="group"
      aria-label={t('dock.panels')}
    >
      {panels.map((panel) => {
        const open = openIds.includes(panel.id) || current === panel.id;
        const run = available ? () => registry.toggle(panel.id) : fallback?.(panel.id);
        const mark = badge?.(panel.id);
        const label = [
          panel.title,
          ...(mark?.label === undefined ? [] : [mark.label]),
          ...(run === undefined ? [t('dock.cardUnavailable')] : []),
        ].join(' · ');
        return (
          <Tooltip key={panel.id} label={label} side={collapsed ? 'right' : 'bottom'} delayMs={400}>
            <button
              type="button"
              {...hooked(
                'bh-pinned-panel',
                styles.card,
                collapsed && styles.railCard,
                open && styles.open,
                run === undefined && styles.disabled,
              )}
              data-pinned-panel={panel.id}
              data-bh-tour={tourOf?.(panel.id)}
              data-open={open ? 'true' : undefined}
              aria-label={label}
              aria-pressed={open}
              aria-disabled={run === undefined ? true : undefined}
              onClick={run}
            >
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
  disabled: {
    opacity: 0.45,
    cursor: 'default',
    backgroundColor: {
      default: color.hover,
      ':hover': color.hover,
    },
  },
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
