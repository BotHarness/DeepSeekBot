import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { accent, ink, space, style } from './tobs.stylex.js';

const styles = stylex.create({
  wrap: { display: 'inline-flex', alignItems: 'center', gap: space.x3 },
  range: {
    width: '160px',
    margin: 0,
    accentColor: accent.solid,
    cursor: { default: 'pointer', ':disabled': 'default' },
  },
  wrapFluid: { width: '100%' },
  rangeFluid: { flexGrow: 1, minWidth: 0, width: 'auto' },
  value: {
    minWidth: '44px',
    textAlign: 'end',
    color: ink.secondary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
});

export interface SliderProps {
  readonly label: string;
  readonly id?: string;
  readonly fluid?: boolean;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string | undefined;
  readonly disabled?: boolean;
  readonly valueLabel?: string;
  readonly onCommit?: () => void;
  readonly onChange: (value: number) => void;
}

export function Slider({
  label,
  id,
  fluid = false,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
  onCommit,
  valueLabel,
}: SliderProps): ReactElement {
  const shown = valueLabel ?? `${value}${unit ?? ''}`;
  return (
    <span {...stylex.props(styles.wrap, fluid && styles.wrapFluid)}>
      <input
        type="range"
        id={id}
        aria-label={label}
        aria-valuetext={shown}
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.currentTarget.value))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        onBlur={onCommit}
        {...stylex.props(styles.range, fluid && styles.rangeFluid)}
      />
      <span aria-hidden="true" {...stylex.props(styles.value)}>
        {shown}
      </span>
    </span>
  );
}
