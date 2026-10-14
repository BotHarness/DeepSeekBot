import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

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
  fixed: { flexGrow: 0, flexBasis: 'auto' },
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
  },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    flexShrink: 0,
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
  disclosure,
  dimmed = false,
  locked = false,
  struck = false,
}: {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly badge?: ReactNode;
  readonly tabs?: ReactNode;
  readonly action?: ReactNode;
  readonly disclosure?: PanelHeaderDisclosure | undefined;
  readonly dimmed?: boolean;
  readonly locked?: boolean;
  readonly struck?: boolean;
}): ReactElement {
  const fixed = tabs !== undefined;
  const content = (
    <>
      {icon === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.icon)}>
          {icon}
        </span>
      )}
      <span
        data-panel-label=""
        {...stylex.props(styles.label, fixed && styles.labelFixed, struck && styles.struck)}
      >
        {label}
      </span>
      {badge === undefined ? null : <span {...stylex.props(styles.badge)}>{badge}</span>}
    </>
  );
  return (
    <div {...stylex.props(styles.header)}>
      {disclosure === undefined ? (
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
      {tabs === undefined ? null : <span {...stylex.props(styles.tabs)}>{tabs}</span>}
      {action === undefined ? null : <span {...stylex.props(styles.action)}>{action}</span>}
    </div>
  );
}
