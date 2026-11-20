import type { KeyboardEvent, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { joinClass } from './class-name.js';
import { on } from './surface.stylex.js';
import { accent, elevation, ink, style } from './tobs.stylex.js';
import { border, space } from './tokens.stylex.js';

const styles = stylex.create({
  track: {
    display: 'inline-grid',
    gridAutoFlow: 'column',
    gridAutoColumns: '1fr',
    gap: space.x1,
    padding: space.x1,
    borderRadius: style.radiusControl,
    backgroundColor: on.track,
    boxShadow: `inset 0 0 0 1px ${style.segmentedEdge}`,
  },
  wrap: {
    display: 'inline-flex',
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  tab: {
    boxSizing: 'border-box',
    height: `calc(${style.controlHeight} - 4px)`,
    paddingInline: space.x4,
    borderWidth: 0,
    borderRadius: `calc(${style.radiusControl} - 2px)`,
    backgroundColor: 'transparent',
    color: { default: ink.secondary, ':hover:enabled': ink.primary },
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    whiteSpace: 'nowrap',
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
  },
  selected: {
    backgroundColor: style.segmentedSelectedFill,
    color: style.segmentedSelectedInk,
    fontWeight: 500,
    boxShadow: elevation.x1,
  },
});

export interface SegmentedControlOption<Value extends string> {
  readonly value: Value;
  readonly label: ReactNode;
  readonly id?: string;
  readonly panelId?: string;
  readonly disabled?: boolean | undefined;
  readonly title?: string | undefined;
}

export interface SegmentedControlProps<Value extends string> {
  readonly id: string;
  readonly value: Value;
  readonly options: readonly SegmentedControlOption<Value>[];
  readonly onChange: (next: Value) => void;
  readonly label: string;
  readonly disabled?: boolean | undefined;
  readonly className?: string | undefined;
  readonly controlsPanel?: boolean | undefined;
  readonly wrap?: boolean | undefined;
}

const WALK = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']);

function walk<Value extends string>(
  options: readonly SegmentedControlOption<Value>[],
  from: number,
  key: string,
): SegmentedControlOption<Value> | undefined {
  const enabled = options.filter((option) => option.disabled !== true);
  if (key === 'Home') return enabled[0];
  if (key === 'End') return enabled.at(-1);
  const step = key === 'ArrowRight' || key === 'ArrowDown' ? 1 : -1;
  for (let offset = 1; offset < options.length; offset += 1) {
    const candidate =
      options[(((from + step * offset) % options.length) + options.length) % options.length];
    if (candidate !== undefined && candidate.disabled !== true) return candidate;
  }
  return undefined;
}

export function SegmentedControl<Value extends string>({
  id,
  value,
  options,
  onChange,
  label,
  disabled = false,
  className,
  controlsPanel = false,
  wrap = false,
}: SegmentedControlProps<Value>): ReactElement {
  const selected = options.findIndex((option) => option.value === value);
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!WALK.has(event.key)) return;
    event.preventDefault();
    const target = walk(options, selected, event.key);
    if (target === undefined || target.value === value) return;
    onChange(target.value);
    event.currentTarget.ownerDocument.getElementById(target.id ?? `${id}-${target.value}`)?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={joinClass(stylex.props(styles.track, wrap && styles.wrap).className, className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            id={option.id ?? `${id}-${option.value}`}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls={
              controlsPanel && active
                ? (option.panelId ?? `${id}-${option.value}-panel`)
                : undefined
            }
            tabIndex={active ? 0 : -1}
            disabled={disabled || option.disabled === true}
            title={option.title}
            onClick={() => {
              if (!active) onChange(option.value);
            }}
            onKeyDown={onKeyDown}
            {...stylex.props(styles.tab, active && styles.selected)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
