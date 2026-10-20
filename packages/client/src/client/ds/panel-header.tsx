import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { InstantTooltipScope, Tooltip } from './tooltip.js';
import { border, color, radius, size, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  header: {
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    marginBlock: space.x1,
    marginInline: space.x2,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
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
  static: {
    cursor: 'default',
    backgroundColor: 'transparent',
  },
  locked: {
    pointerEvents: 'none',
  },
  dimmed: { cursor: 'default', opacity: 0.6 },
  fixed: { flexGrow: 0, flexBasis: 'auto', maxWidth: '40%' },
  compact: { flexGrow: 0, flexBasis: 'auto', cursor: 'grab' },
  context: { display: 'flex', alignItems: 'center', minWidth: 0, flexShrink: 1 },
  spacer: { flexGrow: 1 },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.subtle,
    transition: 'transform 150ms var(--ds-ease-in-out)',
  },
  collapsed: { transform: 'rotate(-90deg)' },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.muted,
  },
  label: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: text.titleSize,
    lineHeight: text.titleLine,
  },
  labelFixed: { flexGrow: 0, flexBasis: 'auto' },
  struck: { textDecoration: 'line-through', opacity: 0.6 },
  badge: {
    display: 'inline-flex',
    flexShrink: { default: 0, ':has(.bh-channel-sidebar-summary)': 1 },
    minWidth: 0,
    maxWidth: { default: 'none', ':has(.bh-channel-sidebar-summary)': '55%' },
  },
  tabs: {
    display: 'flex',
    alignItems: 'center',
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    overflowX: 'auto',
    whiteSpace: 'nowrap',
  },
  tabsCompact: { flexGrow: 0, flexBasis: 'auto' },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    minWidth: 0,
    maxWidth: { default: 'none', ':has([data-session-target])': '60%' },
    flexShrink: { default: 0, ':has([data-session-target])': 1 },
    paddingInlineEnd: space.x1,
  },
});

export interface PanelHeaderDisclosure {
  readonly expanded: boolean;
  readonly controls: string;
  readonly disabled: boolean;
  readonly chevron: boolean;
  readonly onToggle: (() => void) | undefined;
}

export function PanelHeader({
  icon,
  label,
  badge,
  tabs,
  action,
  context,
  disclosure,
  onHide,
  hideLabel,
  hideHint,
  dimmed = false,
  locked = false,
  struck = false,
}: {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly badge?: ReactNode;
  readonly tabs?: ReactNode;
  readonly action?: ReactNode;
  readonly context?: ReactNode;
  readonly disclosure?: PanelHeaderDisclosure | undefined;
  readonly onHide?: () => void;
  readonly hideLabel?: string;
  readonly hideHint?: string;
  readonly dimmed?: boolean;
  readonly locked?: boolean;
  readonly struck?: boolean;
}): ReactElement {
  const pointer = useRef<{ x: number; y: number; moved: boolean } | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const labelRef = useRef<HTMLSpanElement>(null);
  const hint = () => {
    const node = labelRef.current;
    const clipped = node !== null && node.scrollWidth > node.clientWidth;
    return clipped && typeof label === 'string' ? `${label} · ${hideHint ?? ''}` : (hideHint ?? '');
  };
  const fixed = tabs !== undefined;
  const content = (
    <>
      {icon === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.icon)}>
          {icon}
        </span>
      )}
      <span
        ref={labelRef}
        data-panel-label=""
        title={typeof label === 'string' && hideHint === undefined ? label : undefined}
        {...stylex.props(
          styles.label,
          (fixed || !!onHide) && styles.labelFixed,
          struck && styles.struck,
        )}
      >
        {label}
      </span>
      {badge === undefined || onHide ? null : <span {...stylex.props(styles.badge)}>{badge}</span>}
    </>
  );
  return (
    <div {...stylex.props(styles.header)}>
      {onHide ? (
        <Tooltip label={hint} side="bottom" portal disabled={hideHint === undefined || dragging}>
          <button
            type="button"
            data-panel-head=""
            data-panel-hide=""
            data-window-drag-recall
            draggable
            aria-label={hideLabel}
            onPointerDown={(event) => {
              if (event.button === 0)
                pointer.current = { x: event.clientX, y: event.clientY, moved: false };
            }}
            onPointerMove={(event) => {
              const origin = pointer.current;
              if (origin && Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5)
                origin.moved = true;
            }}
            onPointerCancel={() => {
              if (pointer.current) pointer.current.moved = true;
            }}
            onDragStart={() => {
              if (pointer.current) pointer.current.moved = true;
              setDragging(true);
            }}
            onDragEnd={() => setDragging(false)}
            onClick={(event) => {
              event.stopPropagation();
              const origin = pointer.current;
              const moved =
                origin &&
                (origin.moved ||
                  Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > 5);
              if (event.detail === 0 || !moved) onHide();
              pointer.current = undefined;
            }}
            {...stylex.props(styles.head, fixed && styles.fixed, styles.compact)}
          >
            {content}
          </button>
        </Tooltip>
      ) : disclosure === undefined ? (
        <div
          data-panel-head=""
          {...stylex.props(
            styles.head,
            styles.static,
            fixed && styles.fixed,
            dimmed && styles.dimmed,
          )}
        >
          {content}
        </div>
      ) : (
        <button
          type="button"
          data-panel-head=""
          aria-expanded={disclosure.expanded}
          aria-controls={disclosure.controls}
          aria-disabled={dimmed ? true : undefined}
          disabled={disclosure.disabled}
          onClick={disclosure.onToggle}
          {...stylex.props(
            styles.head,
            fixed && styles.fixed,
            dimmed && styles.dimmed,
            locked && styles.locked,
          )}
        >
          {disclosure.chevron ? (
            <span
              aria-hidden="true"
              data-panel-chevron=""
              {...stylex.props(styles.chevron, !disclosure.expanded && styles.collapsed)}
            >
              <IconChevronDownOutlineRegular size={14} />
            </span>
          ) : null}
          {content}
        </button>
      )}
      {onHide && badge !== undefined ? (
        <span data-panel-badge="" data-window-drag-recall {...stylex.props(styles.badge)}>
          {badge}
        </span>
      ) : null}
      {context === undefined ? null : (
        <span data-panel-context="" data-window-drag-recall {...stylex.props(styles.context)}>
          {context}
        </span>
      )}
      {tabs === undefined ? null : (
        <span
          data-panel-tabs=""
          data-window-drag-recall
          {...stylex.props(styles.tabs, !!onHide && styles.tabsCompact)}
        >
          {tabs}
        </span>
      )}
      {onHide ? <span aria-hidden="true" {...stylex.props(styles.spacer)} /> : null}
      {action === undefined ? null : (
        <span data-panel-actions="" data-window-drag-recall {...stylex.props(styles.action)}>
          <InstantTooltipScope>{action}</InstantTooltipScope>
        </span>
      )}
    </div>
  );
}
