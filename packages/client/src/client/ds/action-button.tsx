import { Button } from './button.js';
import type { ActionSymbol } from '../../shared/action-presentation.js';
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { layer, state, style } from './tobs.stylex.js';
import { actionColor, color, space, text } from './tokens.stylex.js';

const spin = stylex.keyframes({ to: { transform: 'rotate(360deg)' } });
const styles = stylex.create({
  busy: {
    animationName: spin,
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
  button: {
    minHeight: style.controlHeight,
    height: 'auto',
    maxWidth: '100%',
    paddingBlock: space.x2,
    paddingInline: space.x4,
    gap: space.x2,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    textAlign: 'center',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  secondary: {
    backgroundColor: layer.well,
    backgroundImage: {
      default: 'none',
      ':hover': `linear-gradient(${state.hover}, ${state.hover})`,
    },
    color: color.fg,
  },
  selected: { opacity: { default: 1, ':disabled': 1 } },
  primary: { backgroundColor: color.accent, color: color.onAccent },
  danger: {
    backgroundColor: actionColor.danger,
    color: actionColor.dangerLabel,
  },
  icon: {
    display: 'inline-flex',
    flexShrink: 0,
    width: space.x5,
    height: space.x5,
  },
  label: { minWidth: 0 },
  group: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space.x3,
  },
  stack: { flexDirection: 'column', alignItems: 'stretch' },
});
type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'children'> & {
  children: ReactNode;
  icon: ActionSymbol;
  tone?: 'primary' | 'secondary' | 'danger';
  busy?: boolean;
  size?: 'sm' | 'md';
};
export function ActionButton({
  children,
  icon,
  tone = 'secondary',
  busy = false,
  disabled,
  size: buttonSize = 'sm',
  type = 'button',
  ...rest
}: Props): ReactElement {
  return (
    <Button
      {...rest}
      type={type}
      size={buttonSize}
      disabled={disabled || busy}
      aria-busy={busy || rest['aria-busy']}
      {...stylex.props(
        styles.button,
        styles[tone],
        rest['aria-pressed'] === true && styles.selected,
      )}
    >
      <span aria-hidden="true" {...stylex.props(styles.icon, busy && styles.busy)}>
        {busy || icon === 'refresh' ? (
          <IconRefreshOutlineRegular size={16} />
        ) : (
          <ChannelSidebarIcon name={icon} />
        )}
      </span>
      <span {...stylex.props(styles.label)}>{children}</span>
    </Button>
  );
}
export function ActionGroup({
  children,
  stack = false,
}: {
  children: ReactNode;
  stack?: boolean;
}): ReactElement {
  return <div {...stylex.props(styles.group, stack && styles.stack)}>{children}</div>;
}
