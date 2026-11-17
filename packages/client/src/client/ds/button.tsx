import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { joinClass } from './class-name.js';
import { on } from './surface.stylex.js';
import { accent, ink, layer, state, style } from './tobs.stylex.js';
import { border, space } from './tokens.stylex.js';

const styles = stylex.create({
  base: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.x2,
    flexShrink: 0,
    paddingBlock: 0,
    paddingInline: space.x4,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    backgroundColor: 'transparent',
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'not-allowed' },
    opacity: { default: 1, ':disabled': 0.4 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    outlineOffset: '2px',
  },
  sm: { height: style.controlHeight },
  md: { height: style.controlHeightLarge },
  primary: {
    backgroundColor: {
      default: accent.solid,
      ':hover:enabled': accent.solidHover,
    },
    color: accent.onSolid,
  },
  outline: {
    backgroundColor: on.secondary,
    color: style.buttonSecondaryInk,
    boxShadow: `inset 0 0 0 1px ${on.secondaryEdge}`,
    backgroundImage: {
      default: 'none',
      ':hover:enabled': `linear-gradient(${state.hover}, ${state.hover})`,
    },
  },
  ghost: {
    backgroundColor: {
      default: 'transparent',
      ':hover:enabled': state.hover,
      ':active:enabled': state.pressed,
    },
  },
  toolbar: {
    backgroundColor: layer.well,
    backgroundImage: {
      default: 'none',
      ':hover:enabled': `linear-gradient(${state.hover}, ${state.hover})`,
    },
  },
  icon: {
    display: 'inline-flex',
    width: style.iconSize,
    height: style.iconSize,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'toolbar';

export type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly size?: 'md' | 'sm';
  readonly icon?: ReactNode;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'>;

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'ghost', size = 'md', icon, className, children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      {...rest}
      className={joinClass(
        stylex.props(styles.base, styles[size], styles[variant]).className,
        className,
      )}
    >
      {icon == null ? null : <span {...stylex.props(styles.icon)}>{icon}</span>}
      {children}
    </button>
  );
});
