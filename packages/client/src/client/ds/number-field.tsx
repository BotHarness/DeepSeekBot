import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Input } from './input.js';
import { ink, status, style } from './tobs.stylex.js';
import { space } from './tokens.stylex.js';

const styles = stylex.create({
  wrap: { display: 'inline-flex', alignItems: 'center', gap: space.x3 },
  input: { width: '96px' },
  invalid: { boxShadow: `inset 0 0 0 1px ${status.dangerBase}` },
  unit: {
    color: ink.tertiary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    whiteSpace: 'nowrap',
  },
});

export interface NumberFieldProps {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly integer?: boolean;
  readonly unit?: string | undefined;
  readonly disabled?: boolean;
  readonly onCommit: (value: number) => void;
  readonly data?: Readonly<Record<`data-${string}`, string | undefined>>;
}

export function NumberField({
  label,
  value,
  min,
  max,
  integer = true,
  unit,
  disabled = false,
  onCommit,
  data,
}: NumberFieldProps): ReactElement {
  const [draft, setDraft] = useState<string>();
  const parsed = draft === undefined ? value : Number(draft.trim());
  const invalid =
    draft !== undefined &&
    (draft.trim() === '' ||
      !Number.isFinite(parsed) ||
      (integer && !Number.isInteger(parsed)) ||
      parsed < min ||
      parsed > max);
  const settle = (): void => {
    if (draft === undefined || invalid) return;
    setDraft(undefined);
    if (parsed !== value) onCommit(parsed);
  };
  return (
    <span {...stylex.props(styles.wrap)}>
      <Input
        {...data}
        aria-label={label}
        aria-invalid={invalid || undefined}
        inputMode={integer ? 'numeric' : 'decimal'}
        disabled={disabled}
        value={draft ?? String(value)}
        className={stylex.props(styles.input, invalid && styles.invalid).className}
        onChange={(event) => {
          setDraft(event.currentTarget.value);
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
          }
        }}
      />
      {unit === undefined ? null : <span {...stylex.props(styles.unit)}>{unit}</span>}
    </span>
  );
}
