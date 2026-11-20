import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { edge, ink, layer, line, space, state, style, type } from './tobs.stylex.js';

const styles = stylex.create({
  card: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    minWidth: 0,
    borderRadius: style.radiusCard,
    backgroundColor: { default: layer.raised, ':hover': state.hover },
  },
  open: {
    display: 'flex',
    flexGrow: 1,
    alignItems: 'center',
    gap: space.x4,
    minWidth: 0,
    padding: space.x5,
    paddingInlineEnd: space.x2,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: style.radiusCard,
    backgroundColor: 'transparent',
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: type.labelSize,
    lineHeight: type.labelLine,
    fontWeight: type.labelWeight,
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${line.focus}` },
    outlineOffset: '-2px',
  },
  icon: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    color: ink.secondary,
  },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export interface ShortcutTileProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onOpen: () => void;
  readonly action?: ReactNode;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
}

export function ShortcutTile({
  icon,
  label,
  onOpen,
  action,
  data,
}: ShortcutTileProps): ReactElement {
  return (
    <div {...data} {...stylex.props(styles.card)}>
      <button type="button" onClick={onOpen} {...stylex.props(styles.open)}>
        <span aria-hidden="true" {...stylex.props(styles.icon)}>
          {icon}
        </span>
        <span {...stylex.props(styles.label)}>{label}</span>
      </button>
      {action}
    </div>
  );
}
