import {
  createContext,
  forwardRef,
  useContext,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import { style } from './tobs.stylex.js';
import { border, color, space, text } from './tokens.stylex.js';

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
    minHeight: style.chipHeight,
    overflow: 'hidden',
    paddingBlock: space.x1,
    paddingInline: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: style.radiusChip,
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
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '-2px',
  },
  segment: {
    maxWidth: '180px',
    minHeight: style.controlHeight,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: 0,
  },
  wrap: { whiteSpace: 'normal' },
  trailing: { flexShrink: 0 },
  icon: { display: 'inline-flex', flexShrink: 0 },
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  collapsedLabel: {
    display: { default: 'block', '@container composer-footer (max-width: 480px)': 'none' },
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
  readonly collapseLabel?: boolean;
  readonly trailing?: boolean;
  readonly [data: `data-${string}`]: string | boolean | undefined;
}

export const ChipSegmentContext = createContext(false);

export const ChipButton = forwardRef<HTMLButtonElement, ChipButtonProps>(function ChipButton(
  { icon, label, wrap = false, collapseLabel = false, trailing = false, type = 'button', ...rest },
  ref,
) {
  const segment = useContext(ChipSegmentContext);
  return (
    <button
      ref={ref}
      type={type}
      {...rest}
      aria-label={
        rest['aria-label'] ?? (collapseLabel && typeof label === 'string' ? label : undefined)
      }
      title={rest.title ?? (collapseLabel && typeof label === 'string' ? label : undefined)}
      {...stylex.props(
        styles.chip,
        segment && styles.segment,
        wrap && styles.wrap,
        trailing && styles.trailing,
      )}
    >
      {icon === undefined ? null : (
        <span aria-hidden="true" {...stylex.props(styles.icon)}>
          {icon}
        </span>
      )}
      <span
        {...stylex.props(
          styles.label,
          wrap && styles.wrapLabel,
          collapseLabel && icon !== undefined && styles.collapsedLabel,
        )}
      >
        {label}
      </span>
    </button>
  );
});
