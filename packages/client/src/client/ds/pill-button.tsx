import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, radius, size, space, text } from './tokens.stylex.js';

export const pillStyles = stylex.create({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    maxWidth: '100%',
    height: size.icon,
    paddingInline: `${space.x4} ${space.x3}`,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: { default: color.surface, ':hover': color.hover },
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
});

export function PillButton({
  children,
  ...rest
}: { readonly children: ReactNode } & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'type' | 'children'
>): ReactElement {
  return (
    <button type="button" {...rest} {...stylex.props(pillStyles.pill)}>
      {children}
    </button>
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
