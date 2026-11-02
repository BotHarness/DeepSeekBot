import type { ActionSymbol } from '../../shared/action-presentation.js';
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Button, IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ChannelSidebarIcon } from '../channel-sidebar-icon.js';
import { actionColor, color, radius, size, space, text } from './tokens.stylex.js';

const spin = stylex.keyframes({ to: { transform: 'rotate(360deg)' } });
const styles = stylex.create({
  busy: {
    animationName: spin,
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'linear',
  },
  button: {
    minHeight: size.row,
    height: 'auto',
    maxWidth: '100%',
    paddingBlock: space.x2,
    paddingInline: space.x4,
    gap: space.x2,
    borderWidth: 0,
    borderRadius: radius.lg,
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    textAlign: 'center',
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
  },
  secondary: {
    backgroundColor: { default: actionColor.secondary, ':hover': actionColor.hover },
    color: color.fg,
  },
  primary: { backgroundColor: color.fg, color: color.base },
  danger: { backgroundColor: actionColor.danger, color: actionColor.dangerLabel },
  icon: { display: 'inline-flex', flexShrink: 0, width: space.x5, height: space.x5 },
  label: { minWidth: 0 },
  group: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: space.x3 },
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
      {...stylex.props(styles.button, styles[tone])}
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
