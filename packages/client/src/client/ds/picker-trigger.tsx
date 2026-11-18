import { forwardRef, type ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { on } from './surface.stylex.js';
import { accent, ink, status, style } from './tobs.stylex.js';
import { border, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  trigger: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x2,
    width: '100%',
    minWidth: 0,
    height: style.controlHeight,
    paddingInline: space.x3,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    backgroundColor: on.field,
    boxShadow: `inset 0 0 0 1px ${on.fieldEdge}`,
    outline: { default: 'none', ':focus-visible': `${border.focus} solid ${accent.focus}` },
    outlineOffset: '-1px',
    color: ink.primary,
    font: 'inherit',
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    textAlign: 'start',
    cursor: { default: 'pointer', ':disabled': 'default' },
    opacity: { default: 1, ':disabled': 0.5 },
  },
  invalid: { boxShadow: `inset 0 0 0 1px ${status.dangerBase}` },
  icon: { display: 'inline-flex', flexShrink: 0 },
  label: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  placeholder: { color: ink.tertiary },
  hint: { flexShrink: 0, color: ink.secondary, fontSize: text.metaSize },
  chevron: {
    display: 'inline-flex',
    flexShrink: 0,
    color: ink.secondary,
    transform: 'rotate(90deg)',
  },
});

export interface PickerTriggerProps {
  readonly label: string;
  readonly icon?: ReactNode;
  readonly hint?: string | undefined;
  readonly placeholder?: boolean;
  readonly invalid?: boolean;
  readonly disabled?: boolean;
  readonly expanded: boolean;
  readonly accessibleLabel: string;
  readonly title?: string | undefined;
  readonly onClick: () => void;
}

export const PickerTrigger = forwardRef<HTMLButtonElement, PickerTriggerProps>(
  function PickerTrigger(
    {
      label,
      icon,
      hint,
      placeholder = false,
      invalid = false,
      disabled = false,
      expanded,
      accessibleLabel,
      title,
      onClick,
    },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={expanded}
        aria-label={accessibleLabel}
        aria-invalid={invalid}
        title={title}
        data-picker-trigger=""
        disabled={disabled}
        onClick={onClick}
        {...stylex.props(styles.trigger, invalid && styles.invalid)}
      >
        {icon === undefined ? null : <span {...stylex.props(styles.icon)}>{icon}</span>}
        <span {...stylex.props(styles.label, placeholder && styles.placeholder)}>{label}</span>
        {hint === undefined ? null : <span {...stylex.props(styles.hint)}>{hint}</span>}
        <span {...stylex.props(styles.chevron)}>
          <ChannelSidebarIcon name="chevron-right" size={16} />
        </span>
      </button>
    );
  },
);
