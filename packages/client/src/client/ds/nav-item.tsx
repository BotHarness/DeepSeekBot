import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { edge, ink, line, radius, size, space, state, status, style, type } from './tobs.stylex.js';

const INSET = space.x3;
const GAP = space.x3;

const styles = stylex.create({
  item: {
    display: 'flex',
    alignItems: 'center',
    gap: GAP,
    width: '100%',
    minHeight: style.rowNav,
    margin: 0,
    paddingBlock: 0,
    paddingInline: INSET,
    boxSizing: 'border-box',
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: style.radiusNavSelected,
    backgroundColor: {
      default: 'transparent',
      ':hover': state.hover,
      ':active': state.pressed,
    },
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontWeight: type.bodyWeight,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${line.focus}` },
    outlineOffset: `-${edge.focus}`,
  },
  slot: {
    flexShrink: 0,
    display: 'grid',
    placeItems: 'center',
    width: style.iconSlot,
    height: style.iconSlot,
    color: ink.secondary,
  },
  current: {
    backgroundColor: { default: style.navSelectedFill, ':hover': style.navSelectedFill },
    color: style.navSelectedInk,
  },
  slotCurrent: { color: style.navSelectedIcon },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  trailing: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.captionWeight,
  },
  dot: {
    flexShrink: 0,
    width: '6px',
    height: '6px',
    borderRadius: radius.full,
    backgroundColor: status.dangerBase,
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minHeight: size.controlSmall,
    marginTop: space.x3,
    paddingInlineStart: `calc(${INSET} + ${style.iconSlot} + ${GAP})`,
    paddingInlineEnd: INSET,
    boxSizing: 'border-box',
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.labelWeight,
  },
  first: { marginTop: 0 },
  trailingCurrent: { color: style.navSelectedInk },
});

export interface NavItemProps {
  readonly icon?: ReactNode;
  readonly label: string;
  readonly current?: boolean;
  readonly attention?: string | undefined;
  readonly trailing?: ReactNode;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
  readonly onSelect: () => void;
}

export function NavItem({
  icon,
  label,
  current = false,
  attention,
  trailing,
  data,
  onSelect,
}: NavItemProps): ReactElement {
  return (
    <button
      {...data}
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={onSelect}
      {...stylex.props(styles.item, current && styles.current)}
    >
      <span aria-hidden="true" {...stylex.props(styles.slot, current && styles.slotCurrent)}>
        {icon}
      </span>
      <span {...stylex.props(styles.label)}>{label}</span>
      {attention === undefined && trailing === undefined ? null : (
        <span {...stylex.props(styles.trailing, current && styles.trailingCurrent)}>
          {trailing}
          {attention === undefined ? null : (
            <span role="img" aria-label={attention} {...stylex.props(styles.dot)} />
          )}
        </span>
      )}
    </button>
  );
}

export function NavGroupHeading({
  label,
  trailing,
  first = false,
  id,
}: {
  readonly label: ReactNode;
  readonly trailing?: ReactNode;
  readonly first?: boolean;
  readonly id?: string;
}): ReactElement {
  return (
    <div id={id} {...stylex.props(styles.heading, first && styles.first)}>
      <span {...stylex.props(styles.label)}>{label}</span>
      {trailing === undefined ? null : <span {...stylex.props(styles.trailing)}>{trailing}</span>}
    </div>
  );
}
