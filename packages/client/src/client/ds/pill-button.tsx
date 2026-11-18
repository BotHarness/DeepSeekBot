import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { joinClass } from './class-name.js';
import { accent } from './tobs.stylex.js';
import { actionColor, border, color, radius, size, space, text } from './tokens.stylex.js';

export const pillStyles = stylex.create({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    maxWidth: '100%',
    height: size.icon,
    paddingInline: `${space.x4} ${space.x3}`,
    borderWidth: 0,
    borderRadius: radius.control,
    backgroundColor: { default: actionColor.secondary, ':hover': actionColor.hover },
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '1px',
  },
  active: { backgroundColor: color.accentTint, color: color.accent },
  primary: { backgroundColor: accent.solid, color: accent.onSolid },
});

export function PillButton({
  children,
  active,
  variant,
  className,
  as = 'button',
  ...rest
}: {
  readonly children: ReactNode;
  readonly active?: boolean;
  readonly variant?: 'primary';
  readonly className?: string;
  readonly as?: 'button' | 'span';
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'type' | 'children'
>): ReactElement {
  const Element = as;
  return (
    <Element
      type={as === 'button' ? 'button' : undefined}
      {...rest}
      aria-pressed={as === 'button' ? active : undefined}
      className={joinClass(
        stylex.props(
          pillStyles.pill,
          active && pillStyles.active,
          variant === 'primary' && pillStyles.primary,
        ).className,
        className,
      )}
    >
      {children}
    </Element>
  );
}

export function PillFileButton({
  children,
  ...input
}: { readonly children: ReactNode } & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'className' | 'style' | 'type' | 'children' | 'hidden'
>): ReactElement {
  return (
    <label {...stylex.props(pillStyles.pill)}>
      {children}
      <input {...input} type="file" hidden />
    </label>
  );
}
