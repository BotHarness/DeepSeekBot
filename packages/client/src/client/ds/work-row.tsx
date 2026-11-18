import type { HTMLAttributes, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { edge, font, ink, line, motion, radius, size, space, status, type } from './tobs.stylex.js';

const sweep = stylex.keyframes({
  from: { backgroundPosition: '100% 0' },
  to: { backgroundPosition: '-100% 0' },
});

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minHeight: size.controlSmall,
    minWidth: 0,
    width: '100%',
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.xs,
    backgroundColor: 'transparent',
    color: ink.tertiary,
    fontFamily: 'inherit',
    fontSize: type.bodySize,
    lineHeight: type.bodyLine,
    textAlign: 'start',
  },
  button: {
    cursor: 'pointer',
    color: { default: ink.tertiary, ':hover': ink.secondary, ':focus-visible': ink.secondary },
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${line.focus}` },
  },
  danger: { color: status.dangerInk },
  glyph: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: size.icon,
    flexShrink: 0,
  },
  label: {
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  detail: {
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontFamily: font.familyMono,
    fontSize: type.captionSize,
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    transitionProperty: 'transform',
    transitionDuration: motion.fast,
  },
  chevronOpen: { transform: 'rotate(90deg)' },
  live: {
    color: 'transparent',
    backgroundImage: `linear-gradient(90deg, ${ink.tertiary} 35%, ${ink.primary} 50%, ${ink.tertiary} 65%)`,
    backgroundSize: '200% 100%',
    backgroundClip: 'text',
    animationName: { default: sweep, '@media (prefers-reduced-motion: reduce)': 'none' },
    animationDuration: '1.6s',
    animationTimingFunction: 'linear',
    animationIterationCount: 'infinite',
  },
});

export interface WorkRowProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> {
  icon: string;
  label: ReactNode;
  detail?: ReactNode;
  trailing?: ReactNode;
  live?: boolean;
  danger?: boolean;
  expanded?: boolean;
  onToggle?: () => void;
}

export function WorkRow({
  icon,
  label,
  detail,
  trailing,
  live = false,
  danger = false,
  expanded,
  onToggle,
  ...rest
}: WorkRowProps): ReactElement {
  const content = (
    <>
      <span {...stylex.props(styles.glyph)}>
        <ChannelSidebarIcon name={icon} size={14} />
      </span>
      <span {...stylex.props(styles.label, live && styles.live)}>{label}</span>
      {detail === undefined || detail === '' ? null : (
        <span {...stylex.props(styles.detail)}>{detail}</span>
      )}
      {trailing}
      {expanded === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.chevron, expanded && styles.chevronOpen)}>
          <ChannelSidebarIcon name="chevron-right" size={12} />
        </span>
      )}
    </>
  );
  return onToggle === undefined ? (
    <div {...rest} {...stylex.props(styles.row, danger && styles.danger)}>
      {content}
    </div>
  ) : (
    <button
      {...rest}
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      {...stylex.props(styles.row, styles.button, danger && styles.danger)}
    >
      {content}
    </button>
  );
}
