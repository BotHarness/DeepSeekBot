import { useState, type ReactElement, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives';

import { pillStyles } from './pill-button.js';
import { color } from './tokens.stylex.js';

const styles = stylex.create({
  label: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: color.muted,
  },
});

export interface SelectOption<Value extends string> {
  readonly value: Value;
  readonly label: ReactNode;
}

export interface SelectProps<Value extends string> {
  readonly label: string;
  readonly value: Value;
  readonly options: readonly SelectOption<Value>[];
  readonly onChange: (value: Value) => void;
  readonly disabled?: boolean;
  readonly align?: 'start' | 'end';
  readonly autoFocus?: boolean;
}

export function Select<Value extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
  align = 'end',
  autoFocus = false,
}: SelectProps<Value>): ReactElement {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <Menu
      open={open && !disabled}
      portal
      align={align}
      items={options.map((option) => ({ id: option.value, label: option.label }))}
      selectedId={value}
      onSelect={(id) => {
        setOpen(false);
        const next = options.find((option) => option.value === id);
        if (next !== undefined && next.value !== value) onChange(next.value);
      }}
      onClose={() => {
        setOpen(false);
      }}
      anchor={
        <button
          type="button"
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open && !disabled}
          disabled={disabled}
          data-modal-autofocus={autoFocus ? '' : undefined}
          onClick={() => {
            setOpen((previous) => !previous);
          }}
          {...stylex.props(pillStyles.pill)}
        >
          <span {...stylex.props(styles.label)}>{current?.label}</span>
          <span {...stylex.props(styles.chevron)}>
            <IconChevronDownOutlineRegular size={12} />
          </span>
        </button>
      }
    />
  );
}
