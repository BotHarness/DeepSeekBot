import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { border, radius, space } from './tokens.stylex.js';
import { joinClass } from './class-name.js';
import { on } from './surface.stylex.js';
import { accent, elevation, line, motion, radius as pill, style } from './tobs.stylex.js';

const styles = stylex.create({
  track: {
    boxSizing: 'border-box',
    position: 'relative',
    flexShrink: 0,
    width: style.switchWidth,
    height: style.switchHeight,
    padding: space.x1,
    borderWidth: 0,
    borderRadius: pill.full,
    backgroundColor: on.track,
    boxShadow: `inset 0 0 0 1px ${line.edge}`,
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    outlineOffset: '2px',
  },
  on: { backgroundColor: accent.solid, boxShadow: 'none' },
  thumb: {
    display: 'block',
    width: `calc(${style.switchHeight} - 4px)`,
    height: `calc(${style.switchHeight} - 4px)`,
    borderRadius: radius.round,
    backgroundColor: accent.onSelection,
    boxShadow: elevation.x1,
    transitionProperty: 'transform',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.standard,
  },
  thumbOn: {
    backgroundColor: accent.onSolid,
    transform: `translateX(calc(${style.switchWidth} - ${style.switchHeight}))`,
  },
});

export interface SwitchProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
  readonly className?: string | undefined;
}

export function Switch({
  checked,
  onChange,
  label,
  disabled = false,
  title,
  className,
}: SwitchProps): ReactElement {
  const track = stylex.props(styles.track, checked && styles.on);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={joinClass(track.className, className)}
      onClick={() => {
        onChange(!checked);
      }}
    >
      <span {...stylex.props(styles.thumb, checked && styles.thumbOn)} />
    </button>
  );
}
