import type { KeyboardEvent, ReactElement, ReactNode, WheelEvent } from 'react';
import * as stylex from '@stylexjs/stylex';

import { joinClass } from './class-name.js';
import { walk, WALK_KEYS } from './segmented.js';
import { edge, style } from './tobs.stylex.js';
import { border, color, space } from './tokens.stylex.js';

const styles = stylex.create({
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    overflowX: 'auto',
    overflowY: 'hidden',
    scrollbarWidth: 'none',
    scrollPaddingInline: space.x4,
    overscrollBehaviorX: 'contain',
  },
  chip: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    flexShrink: 0,
    height: style.chipHeight,
    paddingBlock: 0,
    paddingInline: space.x3,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.border,
    borderRadius: style.radiusChip,
    backgroundColor: { default: 'transparent', ':hover': color.hover },
    color: { default: color.muted, ':hover': color.fg },
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: `calc(-1 * ${edge.focusOffset})`,
  },
  selected: {
    borderColor: 'transparent',
    backgroundColor: { default: color.navSelected, ':hover': color.navSelected },
    color: { default: color.navSelectedInk, ':hover': color.navSelectedInk },
    fontWeight: 500,
  },
  icon: { display: 'inline-flex', flexShrink: 0 },
});

export interface ChipTabOption<Value extends string> {
  readonly value: Value;
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled?: boolean | undefined;
}

export interface ChipTabsProps<Value extends string> {
  readonly id: string;
  readonly value: Value;
  readonly options: readonly ChipTabOption<Value>[];
  readonly onChange: (next: Value) => void;
  readonly label: string;
  readonly className?: string | undefined;
}

function reveal(chip: HTMLElement | null): void {
  chip?.focus();
  chip?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

export function ChipTabs<Value extends string>({
  id,
  value,
  options,
  onChange,
  label,
  className,
}: ChipTabsProps<Value>): ReactElement {
  const selected = options.findIndex((option) => option.value === value);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!WALK_KEYS.has(event.key)) return;
    event.preventDefault();
    const target = walk(options, selected, event.key);
    if (target === undefined || target.value === value) return;
    onChange(target.value);
    reveal(event.currentTarget.ownerDocument.getElementById(`${id}-${target.value}`));
  };
  const onWheel = (event: WheelEvent<HTMLDivElement>): void => {
    const row = event.currentTarget;
    if (row.scrollWidth <= row.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY))
      return;
    row.scrollLeft += event.deltaY;
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      aria-orientation="horizontal"
      className={joinClass(stylex.props(styles.row).className, className)}
      onWheel={onWheel}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={`${id}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={active ? `${id}-${option.value}-panel` : undefined}
            tabIndex={active ? 0 : -1}
            disabled={option.disabled === true}
            onClick={(event) => {
              if (!active) onChange(option.value);
              event.currentTarget.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
            }}
            onKeyDown={onKeyDown}
            {...stylex.props(styles.chip, active && styles.selected)}
          >
            <span aria-hidden="true" {...stylex.props(styles.icon)}>
              {option.icon}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
