import * as stylex from '@stylexjs/stylex';
import type { ReactElement } from 'react';

import { joinClass } from './class-name.js';
import { accent, edge, ink, size, space, style } from './tobs.stylex.js';

const styles = stylex.create({
  label: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: `calc(${space.x2} + ${space.x1})`,
    minWidth: 0,
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    cursor: { default: 'pointer', ':has(input:disabled)': 'default' },
    opacity: { default: 1, ':has(input:disabled)': 0.5 },
  },
  input: {
    flex: '0 0 auto',
    width: size.icon,
    height: size.icon,
    margin: 0,
    accentColor: accent.solid,
    cursor: 'inherit',
    outline: { default: 'none', ':focus-visible': `${edge.focus} solid ${accent.focus}` },
    outlineOffset: edge.focusOffset,
  },
});

export interface CheckboxProps {
  readonly checked: boolean;
  readonly onChange: (next: boolean) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly title?: string | undefined;
  readonly className?: string | undefined;
}

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  title,
  className,
}: CheckboxProps): ReactElement {
  return (
    <label title={title} className={joinClass(stylex.props(styles.label).className, className)}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.checked)}
        {...stylex.props(styles.input)}
      />
      {label}
    </label>
  );
}
