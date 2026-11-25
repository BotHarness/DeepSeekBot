import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement } from 'react';

import { Icon } from './icon.js';
import { border, color, radius, space } from './tokens.stylex.js';

const styles = stylex.create({
  toggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    padding: 0,
    borderWidth: 0,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    color: {
      default: 'inherit',
      ':hover': color.fg,
      ':focus-visible': color.fg,
      ':disabled': color.muted,
    },
    font: 'inherit',
    cursor: { default: 'pointer', ':disabled': 'default' },
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
  },
});

export function maskEmail(value: string): string {
  const at = value.lastIndexOf('@');
  return at > 0 ? `•••••${value.slice(at)}` : '•••••';
}

export function MaskedText({
  value,
  mask = maskEmail(value),
  showLabel,
  hideLabel,
}: {
  value: string;
  mask?: string;
  showLabel: string;
  hideLabel: string;
}): ReactElement {
  const [shown, setShown] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={shown}
      aria-label={shown ? hideLabel : showLabel}
      title={shown ? hideLabel : showLabel}
      data-masked-text={shown ? 'shown' : 'hidden'}
      onClick={(event) => {
        event.stopPropagation();
        setShown((current) => !current);
      }}
      {...stylex.props(styles.toggle)}
    >
      <span>{shown ? value : mask}</span>
      <Icon name={shown ? 'eye-off' : 'eye'} size={14} />
    </button>
  );
}
