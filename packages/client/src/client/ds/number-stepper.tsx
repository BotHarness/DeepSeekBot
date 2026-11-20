import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { on } from './surface.stylex.js';
import { accent, ink, state, style } from './tobs.stylex.js';
import { border, space } from './tokens.stylex.js';

const styles = stylex.create({
  wrap: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
  },
  group: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    height: style.controlHeight,
    padding: space.x1,
    borderRadius: style.radiusControl,
    backgroundColor: on.field,
    boxShadow: `inset 0 0 0 1px ${on.fieldEdge}`,
    opacity: { default: 1, ':has(input:disabled)': 0.5 },
  },
  step: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: `calc(${style.controlHeight} - 4px)`,
    height: '100%',
    padding: 0,
    borderWidth: 0,
    borderRadius: `calc(${style.radiusControl} - 2px)`,
    backgroundColor: { default: 'transparent', ':hover:enabled': state.hover },
    color: { default: ink.secondary, ':disabled': ink.disabled },
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
  },
  input: {
    width: '40px',
    height: '100%',
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'center',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    borderRadius: `calc(${style.radiusControl} - 2px)`,
  },
  unit: {
    color: ink.tertiary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    whiteSpace: 'nowrap',
  },
});

function Glyph({ plus }: { readonly plus: boolean }): ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <path
        d={plus ? 'M2 6h8M6 2v8' : 'M2 6h8'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface NumberStepperProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly onChange: (value: number) => void;
  readonly decreaseLabel: string;
  readonly increaseLabel: string;
  readonly unit?: string | undefined;
  readonly disabled?: boolean;
}

export function NumberStepper({
  label,
  value,
  min,
  max,
  onChange,
  decreaseLabel,
  increaseLabel,
  unit,
  disabled = false,
}: NumberStepperProps): ReactElement {
  const [draft, setDraft] = useState<string>();
  const commit = (next: number): void => {
    setDraft(undefined);
    const clamped = Math.min(max, Math.max(min, Math.round(next)));
    if (clamped !== value) onChange(clamped);
  };
  const settle = (): void => {
    if (draft === undefined) return;
    const parsed = Number(draft.trim());
    if (draft.trim() === '' || !Number.isFinite(parsed)) setDraft(undefined);
    else commit(parsed);
  };
  return (
    <span {...stylex.props(styles.wrap)}>
      <span role="group" aria-label={label} {...stylex.props(styles.group)}>
        <button
          type="button"
          aria-label={decreaseLabel}
          disabled={disabled || value <= min}
          onClick={() => {
            commit(value - 1);
          }}
          {...stylex.props(styles.step)}
        >
          <Glyph plus={false} />
        </button>
        <input
          type="text"
          inputMode="numeric"
          aria-label={label}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          role="spinbutton"
          value={draft ?? String(value)}
          disabled={disabled}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onBlur={settle}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Enter') {
              event.preventDefault();
              settle();
            } else if (event.key === 'Escape' && draft !== undefined) {
              event.preventDefault();
              event.stopPropagation();
              setDraft(undefined);
            } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
              event.preventDefault();
              commit(value + (event.key === 'ArrowUp' ? 1 : -1));
            }
          }}
          {...stylex.props(styles.input)}
        />
        <button
          type="button"
          aria-label={increaseLabel}
          disabled={disabled || value >= max}
          onClick={() => {
            commit(value + 1);
          }}
          {...stylex.props(styles.step)}
        >
          <Glyph plus />
        </button>
      </span>
      {unit === undefined ? null : <span {...stylex.props(styles.unit)}>{unit}</span>}
    </span>
  );
}
