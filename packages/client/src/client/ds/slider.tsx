import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { accent, ink, style } from './tobs.stylex.js';
import { space } from './tokens.stylex.js';

const styles = stylex.create({
  wrap: { display: 'inline-flex', alignItems: 'center', gap: space.x3 },
  range: {
    width: '160px',
    margin: 0,
    accentColor: accent.solid,
    cursor: { default: 'pointer', ':disabled': 'default' },
  },
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
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly unit?: string | undefined;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
}

export function Slider({
  label,
  id,
  value,
  min,
  max,
  step = 1,
  unit,
  disabled = false,
  onChange,
}: SliderProps): ReactElement {
  const shown = `${value}${unit ?? ''}`;
  return (
    <span {...stylex.props(styles.wrap)}>
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
        {...stylex.props(styles.range)}
      />
      <span aria-hidden="true" {...stylex.props(styles.value)}>
        {shown}
      </span>
    </span>
  );
}
