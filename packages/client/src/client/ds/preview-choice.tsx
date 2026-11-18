import type { CSSProperties, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { accent, layer, line, radius as shape, state, style } from './tobs.stylex.js';
import { border, color, radius, space, text } from './tokens.stylex.js';

const inner = `max(${radius.xs}, calc(${style.radiusCard} - ${style.choicePadding}))`;

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
    padding: style.choicePadding,
    borderWidth: 0,
    borderRadius: style.radiusCard,
    backgroundColor: style.choiceFill,
    backgroundImage: {
      default: 'none',
      ':hover': `linear-gradient(${state.hover}, ${state.hover})`,
    },
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    textAlign: 'center',
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    outlineOffset: '2px',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
  },
  checked: {
    backgroundColor: style.choiceSelectedFill,
    color: style.choiceSelectedInk,
    fontWeight: text.strong,
  },
  preview: {
    position: 'relative',
    display: 'block',
    aspectRatio: '16 / 10',
    overflow: 'hidden',
    borderRadius: inner,
    boxShadow: `0 0 0 1px ${line.divider}`,
  },
  previewChecked: {
    boxShadow: `0 0 0 1px ${line.divider}, 0 0 0 3px ${style.choiceSelectedRing}`,
  },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x3,
    boxSizing: 'border-box',
    height: style.controlHeightLarge,
    paddingInlineStart: space.x3,
    paddingInlineEnd: space.x4,
    borderWidth: 0,
    borderRadius: style.radiusChip,
    backgroundColor: style.choiceFill,
    backgroundImage: {
      default: 'none',
      ':hover': `linear-gradient(${state.hover}, ${state.hover})`,
    },
    color: color.muted,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    outlineOffset: '2px',
  },
  swatch: {
    display: 'block',
    flexShrink: 0,
    width: '20px',
    height: '20px',
    borderRadius: shape.full,
    boxShadow: `inset 0 0 0 1px ${line.divider}`,
  },
  swatchChecked: {
    boxShadow: `inset 0 0 0 1px ${line.divider}, 0 0 0 2px ${layer.canvas}, 0 0 0 4px ${style.choiceSelectedRing}`,
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
            <span
              {...stylex.props(styles.preview, checked && styles.previewChecked)}
              aria-hidden="true"
            >
              {option.preview}
            </span>
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export interface SwatchChoiceOption<T extends string> {
  readonly id: T;
  readonly label: string;
  readonly swatch: CSSProperties;
}

export function SwatchChoices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  readonly label: string;
  readonly value: T | undefined;
  readonly options: readonly SwatchChoiceOption<T>[];
  readonly onChange: (value: T) => void;
}): ReactElement {
  return (
    <div role="radiogroup" aria-label={label} {...stylex.props(styles.row)}>
      {options.map((option) => {
        const checked = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={checked}
            onClick={() => onChange(option.id)}
            {...stylex.props(styles.chip, checked && styles.checked)}
          >
            <span
              aria-hidden="true"
              {...stylex.props(styles.swatch, checked && styles.swatchChecked)}
              style={option.swatch}
            />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
