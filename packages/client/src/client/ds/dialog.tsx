import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { APPEARANCE_CLASS } from '../appearance-scope.js';
import { useShellLayer } from './shell-layer.js';
import { elevation, layer, motion, space, style } from './tobs.stylex.js';

const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const styles = stylex.create({
  viewport: {
    pointerEvents: 'auto',
    position: 'fixed',
    inset: 0,
    zIndex: 1000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    paddingBlock: `max(${space.x7}, var(--dsh-frame-overlay-top, ${space.x7}))`,
    paddingInline: space.x7,
  },
  scrim: {
    position: 'absolute',
    top: 'var(--dsh-frame-chrome-top, 0px)',
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: layer.scrim,
    animationName: fadeIn,
    animationDuration: { default: motion.base, '@media (prefers-reduced-motion: reduce)': '0s' },
  },
  popup: {
    boxSizing: 'border-box',
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '100%',
    maxHeight: '100%',
    overflow: 'hidden',
    borderRadius: style.radiusDialog,
    backgroundColor: layer.sheet,
    boxShadow: elevation.x3,
    outline: 'none',
    animationName: fadeIn,
    animationDuration: { default: motion.base, '@media (prefers-reduced-motion: reduce)': '0s' },
  },
  sized: { width: 'min(380px, 100%)' },
});

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  className?: string | undefined;
  xstyle?: stylex.StyleXStyles;
  unsized?: boolean;
  children?: ReactNode;
}

export function Dialog({
  open,
  onClose,
  title,
  className,
  xstyle,
  unsized = false,
  children,
}: DialogProps): ReactNode {
  const popup = useRef<HTMLDivElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const attach = useCallback((node: HTMLDivElement | null) => {
    popup.current = node;
    setMounted(node !== null);
  }, []);
  useShellLayer(popup, open && mounted, onClose);
  const popupClass = [
    APPEARANCE_CLASS,
    stylex.props(styles.popup, !unsized && styles.sized, xstyle).className,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <BaseDialog.Root
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(_next, details) => {
        details.cancel();
        details.allowPropagation();
      }}
    >
      <BaseDialog.Portal>
        <div
          role="presentation"
          data-tobs-dialog-viewport=""
          className={[APPEARANCE_CLASS, stylex.props(styles.viewport).className].join(' ')}
        >
          <div
            aria-hidden="true"
            data-tobs-dialog-scrim=""
            onClick={onClose}
            {...stylex.props(styles.scrim)}
          />
          <BaseDialog.Popup
            ref={attach}
            aria-label={title}
            aria-modal="true"
            initialFocus={false}
            finalFocus={false}
            className={popupClass}
          >
            {children}
          </BaseDialog.Popup>
        </div>
      </BaseDialog.Portal>
    </BaseDialog.Root>
  );
}
