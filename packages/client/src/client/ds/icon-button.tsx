import { forwardRef, type ButtonHTMLAttributes } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, radius, size as sizes } from './tokens.stylex.js';

const styles = stylex.create({
  base: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    padding: 0,
    borderWidth: 0,
    borderStyle: 'none',
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':is([aria-expanded=true])': color.hover,
      ':disabled': 'transparent',
    },
    color: {
      default: color.muted,
      ':hover': color.fg,
      ':is([aria-expanded=true])': color.fg,
    },
    fontFamily: 'inherit',
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  subtle: {
    color: {
      default: color.subtle,
      ':hover': color.fg,
      ':is([aria-expanded=true])': color.fg,
    },
  },
  inline: { width: sizes.inlineIcon, height: sizes.inlineIcon, borderRadius: radius.sm },
  icon: { width: sizes.icon, height: sizes.icon },
  row: { width: sizes.row, height: sizes.row },
});

export type IconButtonSize = 'inline' | 'icon' | 'row';
export type IconButtonTone = 'muted' | 'subtle';

export interface IconButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style'
> {
  readonly 'aria-label': string;
  readonly size?: IconButtonSize;
  readonly tone?: IconButtonTone;
  readonly xstyle?: stylex.StyleXStyles;
  readonly [data: `data-${string}`]: string | boolean | undefined;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { size = 'icon', tone = 'muted', xstyle, type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      {...stylex.props(styles.base, tone === 'subtle' && styles.subtle, styles[size], xstyle)}
    >
      {children}
    </button>
  );
});
