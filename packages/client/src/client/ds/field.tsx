import { useId, type InputHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Input } from '@deepseek-ai/dsh-client-ui-primitives';

import { color, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    margin: 0,
    padding: 0,
    borderWidth: 0,
  },
  label: {
    padding: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  hint: {
    margin: 0,
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  error: {
    margin: 0,
    color: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  input: { width: '100%' },
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x4,
    minWidth: 0,
  },
});

export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
}

export function Field({
  label,
  hint,
  error,
  group = false,
  children,
}: {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly group?: boolean;
  readonly children: (control: FieldControlProps) => ReactNode;
}): ReactElement {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  const errorId = error === undefined || error === null ? undefined : `${id}-error`;
  const describedBy = [errorId, hintId].filter((value) => value !== undefined).join(' ');
  const control: FieldControlProps = {
    id,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(errorId === undefined ? {} : { 'aria-invalid': true as const }),
  };
  const notes = (
    <>
      {hint === undefined ? null : (
        <p id={hintId} {...stylex.props(styles.hint)}>
          {hint}
        </p>
      )}
      {errorId === undefined ? null : (
        <p id={errorId} role="alert" {...stylex.props(styles.error)}>
          {error}
        </p>
      )}
    </>
  );
  if (group)
    return (
      <fieldset aria-describedby={control['aria-describedby']} {...stylex.props(styles.field)}>
        <legend {...stylex.props(styles.label)}>{label}</legend>
        {children(control)}
        {notes}
      </fieldset>
    );
  return (
    <div {...stylex.props(styles.field)}>
      <label htmlFor={id} {...stylex.props(styles.label)}>
        {label}
      </label>
      {children(control)}
      {notes}
    </div>
  );
}

export function FieldStack({ children }: { readonly children: ReactNode }): ReactElement {
  return <div {...stylex.props(styles.stack)}>{children}</div>;
}

export function TextField({
  label,
  hint,
  error,
  value,
  onChange,
  initialFocus = false,
  selectOnFocus = false,
  ...rest
}: {
  readonly label: ReactNode;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly initialFocus?: boolean;
  readonly selectOnFocus?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'id' | 'className' | 'children'
>): ReactElement {
  return (
    <Field label={label} hint={hint} error={error}>
      {(control) => (
        <Input
          {...rest}
          {...control}
          {...(initialFocus ? { 'data-modal-autofocus': '' } : {})}
          className={stylex.props(styles.input).className ?? ''}
          value={value}
          onFocus={(event) => {
            if (selectOnFocus) event.currentTarget.select();
            rest.onFocus?.(event);
          }}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
      )}
    </Field>
  );
}
