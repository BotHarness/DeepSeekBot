import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color, radius, size, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexGrow: 0,
    flexShrink: 1,
    flexBasis: 'auto',
    minWidth: 0,
    maxWidth: '100%',
    minHeight: size.icon,
    overflow: 'hidden',
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: radius.row,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':focus-visible': color.hover,
    },
    color: {
      default: color.muted,
      ':hover': color.fg,
      ':focus-visible': color.fg,
    },
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.bodyLine,
    whiteSpace: 'nowrap',
    textAlign: 'start',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  wrap: { whiteSpace: 'normal' },
  trailing: { flexShrink: 0 },
  icon: { display: 'inline-flex', flexShrink: 0 },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  wrapLabel: {
    overflow: 'visible',
    overflowWrap: 'anywhere',
    textOverflow: 'clip',
  },
});

export interface ChipButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'className' | 'style' | 'children'
> {
  readonly icon?: ReactNode;
  readonly label: ReactNode;
  readonly wrap?: boolean;
  readonly trailing?: boolean;
  readonly [data: `data-${string}`]: string | boolean | undefined;
}

export const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(function ChipButton(
  { icon, label, wrap = false, trailing = false, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      {...stylex.props(styles.chip, wrap && styles.wrap, trailing && styles.trailing)}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.icon)}>
          {icon}
        </span>
      )}
      <span {...stylex.props(styles.label, wrap && styles.wrapLabel)}>{label}</span>
    </button>
  );
});
