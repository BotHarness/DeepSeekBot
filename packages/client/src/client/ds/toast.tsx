import * as stylex from '@stylexjs/stylex';
import { useRef, type ReactNode, type ReactPortal } from 'react';
import { createPortal } from 'react-dom';

import { APPEARANCE_CLASS } from '../appearance-scope.js';
import { useMountedResource } from '../mounted-resource.js';
import { Icon } from './icon.js';
import { accent, elevation, ink, layer, motion, space, status, style } from './tobs.stylex.js';

const DEFAULT_HOLD_MS = 3000;
const rise = stylex.keyframes({
  from: { opacity: 0, transform: 'translate(-50%, 8px)' },
  to: { opacity: 1, transform: 'translate(-50%, 0)' },
});

const styles = stylex.create({
  toast: {
    position: 'fixed',
    left: '50%',
    bottom: `calc(${space.x7} + env(safe-area-inset-bottom, 0px))`,
    zIndex: 1300,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    maxWidth: `calc(100vw - ${space.x7} * 2)`,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    borderRadius: style.radiusContainer,
    backgroundColor: layer.elevated,
    boxShadow: elevation.x3,
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    transform: 'translate(-50%, 0)',
    animationName: rise,
    animationDuration: { default: motion.base, '@media (prefers-reduced-motion: reduce)': '0s' },
    animationTimingFunction: motion.emphasized,
  },
  anchored: { position: 'absolute' },
  icon: { display: 'inline-flex', flexShrink: 0, color: ink.secondary },
  success: { color: status.successBase },
  text: { minWidth: 0, overflowWrap: 'anywhere' },
  action: {
    flexShrink: 0,
    paddingInline: space.x2,
    borderWidth: 0,
    borderRadius: style.radiusControl,
    backgroundColor: { default: 'transparent', ':hover': layer.well },
    color: accent.ink,
    font: 'inherit',
    fontWeight: 600,
    cursor: 'pointer',
  },
});

export interface ToastAction {
  readonly label: string;
  readonly prefix?: string;
  readonly onClick: () => void;
}

export interface ToastProps {
  readonly text: string;
  readonly icon?: ReactNode;
  readonly tone?: 'success';
  readonly anchor?: HTMLElement | null;
  readonly holdMs?: number;
  readonly actions?: readonly ToastAction[];
  readonly onDone: () => void;
}

export function Toast({
  text,
  icon,
  tone,
  anchor,
  holdMs = DEFAULT_HOLD_MS,
  actions = [],
  onDone,
}: ToastProps): ReactPortal {
  const done = useRef(onDone);
  done.current = onDone;
  const mount = useMountedResource<HTMLDivElement>(
    (node) => {
      const finish = () => done.current();
      let timer = window.setTimeout(finish, holdMs);
      const pause = () => window.clearTimeout(timer);
      const resume = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(finish, holdMs);
      };
      node.addEventListener('pointerenter', pause);
      node.addEventListener('pointerleave', resume);
      node.addEventListener('focusin', pause);
      node.addEventListener('focusout', resume);
      return () => {
        window.clearTimeout(timer);
        node.removeEventListener('pointerenter', pause);
        node.removeEventListener('pointerleave', resume);
        node.removeEventListener('focusin', pause);
        node.removeEventListener('focusout', resume);
      };
    },
    [holdMs],
  );
  const leading = icon ?? (tone === 'success' ? <Icon name="check" /> : undefined);
  return createPortal(
    <div
      ref={mount}
      role="status"
      aria-live="polite"
      data-tobs-toast=""
      className={[
        APPEARANCE_CLASS,
        stylex.props(styles.toast, anchor != null && styles.anchored).className,
      ].join(' ')}
    >
      {leading === undefined ? null : (
        <span {...stylex.props(styles.icon, tone === 'success' && styles.success)}>{leading}</span>
      )}
      <span {...stylex.props(styles.text)}>{text}</span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          onClick={action.onClick}
          {...stylex.props(styles.action)}
        >
          {action.prefix === undefined ? action.label : `${action.prefix} ${action.label}`}
        </button>
      ))}
    </div>,
    anchor ?? document.body,
  );
}
