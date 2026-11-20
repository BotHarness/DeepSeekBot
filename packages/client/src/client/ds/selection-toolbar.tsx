import type { ReactElement, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import * as stylex from '@stylexjs/stylex';

import { accent, elevation, ink, layer, line, state, style } from './tobs.stylex.js';
import { border, radius, space } from './tokens.stylex.js';

const styles = stylex.create({
  bar: {
    position: 'fixed',
    zIndex: 1050,
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    padding: space.x1,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: line.edge,
    borderRadius: radius.md,
    backgroundColor: layer.elevated,
    boxShadow: elevation.x2,
  },
  button: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    height: style.controlHeight,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    backgroundColor: {
      default: 'transparent',
      ':hover': state.hover,
      ':active': state.pressed,
    },
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
  },
  icon: { display: 'inline-flex', flexShrink: 0 },
  above: { transform: 'translate(-50%, -100%)' },
  below: { transform: 'translate(-50%, 0)' },
});

const VIEWPORT_GAP = 8;

function keepInViewport(element: HTMLDivElement | null): void {
  if (element === null) return;
  element.style.marginLeft = '0px';
  const { left, right } = element.getBoundingClientRect();
  const limit = document.documentElement.clientWidth - VIEWPORT_GAP;
  const shift =
    left < VIEWPORT_GAP
      ? VIEWPORT_GAP - left
      : right > limit
        ? Math.max(limit - right, VIEWPORT_GAP - left)
        : 0;
  element.style.marginLeft = `${shift}px`;
}

export function SelectionToolbar({
  x,
  y,
  below,
  label,
  children,
}: {
  readonly x: number;
  readonly y: number;
  readonly below: boolean;
  readonly label: string;
  readonly children: ReactNode;
}): ReactElement {
  return createPortal(
    <div
      role="toolbar"
      aria-label={label}
      data-selection-toolbar=""
      ref={(element) => keepInViewport(element)}
      onMouseDown={(event) => event.preventDefault()}
      {...stylex.props(styles.bar, below ? styles.below : styles.above)}
      style={{ left: x, top: y }}
    >
      {children}
    </div>,
    document.body,
  );
}

export function SelectionToolbarButton({
  icon,
  children,
  onPress,
}: {
  readonly icon: ReactNode;
  readonly children: ReactNode;
  readonly onPress: () => void;
}): ReactElement {
  return (
    <button type="button" onClick={onPress} {...stylex.props(styles.button)}>
      <span aria-hidden="true" {...stylex.props(styles.icon)}>
        {icon}
      </span>
      {children}
    </button>
  );
}
