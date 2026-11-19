import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { joinClass } from './class-name.js';
import { on } from './surface.stylex.js';
import { accent, edge, ink, line, radius, size, style } from './tobs.stylex.js';
import { border, space } from './tokens.stylex.js';

const styles = stylex.create({
  wrap: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    minWidth: 0,
    height: style.controlHeight,
    paddingInline: space.x3,
    borderRadius: style.radiusControl,
    backgroundColor: on.field,
    boxShadow: `inset 0 0 0 1px ${on.fieldEdge}`,
    outline: { default: 'none', ':focus-within': `${border.focus} solid ${accent.focus}` },
    outlineOffset: '-1px',
    opacity: { default: 1, ':has(input:disabled)': 0.5 },
  },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
    width: style.iconSize,
    height: style.iconSize,
    alignItems: 'center',
    justifyContent: 'center',
    color: ink.tertiary,
  },
  swatch: (fill: string) => ({
    position: 'relative',
    display: 'inline-flex',
    flexShrink: 0,
    width: size.controlSmall,
    height: size.controlSmall,
    borderRadius: radius.full,
    backgroundColor: fill,
    boxShadow: `inset 0 0 0 ${edge.hairline} ${line.strong}`,
    outline: { default: 'none', ':has(:focus-visible)': `${edge.focus} solid ${accent.focus}` },
    outlineOffset: edge.focusOffset,
  }),
  hiddenInput: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
    whiteSpace: 'nowrap',
  },
  colorInput: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    margin: 0,
    padding: 0,
    opacity: 0,
    cursor: { default: 'pointer', ':disabled': 'default' },
  },
  input: {
    flexGrow: 1,
    minWidth: 0,
    padding: 0,
    borderWidth: 0,
    outline: 'none',
    backgroundColor: 'transparent',
    color: ink.primary,
    fontFamily: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    '::placeholder': { color: ink.tertiary },
  },
});

export type InputProps = {
  readonly icon?: ReactNode;
  readonly className?: string | undefined;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { icon, className, ...rest },
  ref,
) {
  return (
    <span className={joinClass(stylex.props(styles.wrap).className, className)}>
      {icon == null ? null : <span {...stylex.props(styles.icon)}>{icon}</span>}
      <input ref={ref} {...rest} {...stylex.props(styles.input)} />
    </span>
  );
});

export function ColorInput({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <span {...stylex.props(styles.swatch(value))}>
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        {...stylex.props(styles.colorInput)}
      />
    </span>
  );
}

export const HiddenFileInput = forwardRef<
  HTMLInputElement,
  Pick<
    InputHTMLAttributes<HTMLInputElement>,
    'aria-label' | 'accept' | 'multiple' | 'disabled' | 'onChange'
  >
>(function HiddenFileInput(props, ref) {
  return (
    <input ref={ref} {...props} type="file" tabIndex={-1} {...stylex.props(styles.hiddenInput)} />
  );
});
