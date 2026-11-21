import {
  forwardRef,
  type ButtonHTMLAttributes,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
} from 'react';
import * as stylex from '@stylexjs/stylex';

import { joinClass } from './class-name.js';
import { edge, ink, line, radius, size, space, state, status, style, type } from './tobs.stylex.js';

const INSET = space.x3;
const GAP = space.x3;

const styles = stylex.create({
  item: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: GAP,
    width: '100%',
    minHeight: style.rowNav,
    minWidth: 0,
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
    fontWeight: type.labelWeight,
  },
  slotCurrent: { color: style.navSelectedIcon },
  largeSlot: { width: size.rowMedium, height: size.rowMedium },
  multiline: { paddingBlock: space.x2 },
  iconOnly: { width: style.rowNav, paddingInline: 0, justifyContent: 'center' },
  pressed: { backgroundColor: { default: state.selected, ':hover': state.selected } },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  labelWithContent: { display: 'block', whiteSpace: 'normal', overflow: 'visible' },
  labelWithDescription: {
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    paddingBlock: space.x2,
  },
  description: {
    display: 'block',
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.captionWeight,
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

export interface NavItemProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'children' | 'style' | 'type' | 'aria-current' | 'onSelect'
> {
  readonly icon?: ReactNode;
  readonly iconDecorative?: boolean;
  readonly label: ReactNode;
  readonly description?: string | undefined;
  readonly current?: boolean;
  readonly iconOnly?: boolean;
  readonly largeIcon?: boolean;
  readonly multiline?: boolean;
  readonly attention?: string | undefined;
  readonly trailing?: ReactNode;
  readonly xstyle?: stylex.StyleXStyles;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
  readonly onSelect: MouseEventHandler<HTMLButtonElement>;
}

export const NavItem = forwardRef<HTMLButtonElement, NavItemProps>(function NavItem(
  {
    icon,
    iconDecorative = true,
    label,
    description,
    current = false,
    iconOnly = false,
    largeIcon = false,
    multiline = false,
    attention,
    trailing,
    xstyle,
    data,
    onSelect,
    onClick,
    className,
    ...button
  },
  ref,
): ReactElement {
  const stylesForButton = stylex.props(
    styles.item,
    current && styles.current,
    button['aria-pressed'] === true && styles.pressed,
    iconOnly && styles.iconOnly,
    multiline && styles.multiline,
    xstyle,
  );
  return (
    <button
      {...button}
      {...data}
      ref={ref}
      type="button"
      aria-current={current ? 'page' : undefined}
      onClick={
        onClick === undefined
          ? onSelect
          : (event) => {
              onClick(event);
              if (!event.defaultPrevented) onSelect(event);
            }
      }
      {...stylesForButton}
      className={joinClass(className, stylesForButton.className)}
    >
      <span
        aria-hidden={iconDecorative || undefined}
        {...stylex.props(styles.slot, current && styles.slotCurrent, largeIcon && styles.largeSlot)}
      >
        {icon}
      </span>
      {iconOnly ? null : (
        <span
          {...stylex.props(
            styles.label,
            multiline && styles.labelWithContent,
            description !== undefined && styles.labelWithDescription,
          )}
        >
          {label}
          {description === undefined ? null : (
            <span {...stylex.props(styles.description)}>{description}</span>
          )}
        </span>
      )}
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
});

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
