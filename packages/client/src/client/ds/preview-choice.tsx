import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, radius, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  grid: {
    display: 'grid',
    gap: space.x3,
    gridTemplateColumns: 'repeat(3, minmax(0, 148px))',
  },
  card: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    padding: space.x2,
    borderWidth: 0,
    borderRadius: radius.md,
    backgroundColor: { default: color.surface, ':hover': color.hover },
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${color.accent}` },
    outlineOffset: '2px',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  },
  checked: {
    backgroundColor: { default: color.accentTint, ':hover': color.accentTint },
    color: color.fg,
    fontWeight: text.strong,
  },
  preview: {
    position: 'relative',
    display: 'block',
    aspectRatio: '16 / 10',
    overflow: 'hidden',
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: color.divider,
  },
});

export interface PreviewChoiceOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly preview: ReactNode;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
}

export function PreviewChoices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly PreviewChoiceOption<T>[];
  readonly onChange: (value: T) => void;
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={label} {...stylex.props(styles.grid)}>
      {options.map((option) => {
        const checked = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            {...option.data}
            onClick={() => onChange(option.id)}
            {...stylex.props(styles.card, checked && styles.checked)}
          >
            <span {...stylex.props(styles.preview)} aria-hidden="true">
              {option.preview}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
