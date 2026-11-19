import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import * as stylex from '@stylexjs/stylex';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { APPEARANCE_CLASS } from '../appearance-scope.js';
import { dialogOpenedFromKeyboard } from './dialog-input.js';
import { useShellLayer } from './shell-layer.js';
import { elevation, layer, motion, space, style } from './tobs.stylex.js';
import { viewportInsets } from './viewport-insets.stylex.js';
import { useWindowClass } from './window-class.js';

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
  sheetViewport: {
    alignItems: 'flex-end',
    paddingInline: 0,
    paddingBottom: 0,
  },
  drawerViewport: {
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingInline: 0,
    paddingTop: viewportInsets.frameTop,
    paddingBottom: 0,
  },
  hidden: { display: 'none' },
  scrim: {
    position: 'absolute',
    top: viewportInsets.frameTop,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: layer.scrim,
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
  },
  enter: {
    animationName: fadeIn,
    animationDuration: { default: motion.base, '@media (prefers-reduced-motion: reduce)': '0s' },
  },
  sized: { width: 'min(380px, 100%)' },
  sheet: {
    width: '100%',
    minWidth: '100%',
    borderEndStartRadius: 0,
    borderEndEndRadius: 0,
    paddingBottom: viewportInsets.bottom,
  },
  drawer: {
    width: 'min(340px, 90%)',
    borderStartStartRadius: 0,
    borderEndStartRadius: 0,
    paddingInlineStart: viewportInsets.left,
    paddingBottom: viewportInsets.bottom,
    backgroundColor: layer.nav,
  },
});

export interface DialogProps {
  open: boolean;
  animate?: boolean | undefined;
  onClose: () => void;
  title: string;
  className?: string | undefined;
  xstyle?: stylex.StyleXStyles;
  viewportXstyle?: stylex.StyleXStyles;
  unsized?: boolean;
  presentation?: 'responsive' | 'center' | 'drawer';
  children?: ReactNode;
}

export function Dialog({
  open,
  animate,
  onClose,
  title,
  className,
  xstyle,
  viewportXstyle,
  unsized = false,
  presentation = 'responsive',
  children,
}: DialogProps): ReactNode {
  const popup = useRef<HTMLDivElement | null>(null);
  const compact = useWindowClass() === 'compact';
  const sheet = presentation === 'responsive' && compact;
  const drawer = presentation === 'drawer';
  const [mounted, setMounted] = useState(false);
  const [opening, setOpening] = useState(() => ({ open, keyboard: dialogOpenedFromKeyboard() }));
  if (opening.open !== open) setOpening({ open, keyboard: dialogOpenedFromKeyboard() });
  const fade = open && (animate ?? !opening.keyboard);
  const attach = useCallback((node: HTMLDivElement | null) => {
    popup.current = node;
    setMounted(node !== null);
  }, []);
  useShellLayer(popup, open && mounted, onClose);
  const popupClass = [
    APPEARANCE_CLASS,
    stylex.props(
      styles.popup,
      fade && styles.enter,
      !unsized && styles.sized,
      xstyle,
      sheet && styles.sheet,
      drawer && styles.drawer,
    ).className,
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
      <BaseDialog.Portal keepMounted={drawer}>
        <div
          role="presentation"
          data-tobs-dialog-viewport=""
          data-presentation={drawer ? 'drawer' : sheet ? 'sheet' : 'center'}
          hidden={!open}
          className={[
            APPEARANCE_CLASS,
            stylex.props(
              styles.viewport,
              viewportXstyle,
              sheet && styles.sheetViewport,
              drawer && styles.drawerViewport,
              !open && styles.hidden,
            ).className,
          ].join(' ')}
        >
          <div
            aria-hidden="true"
            data-tobs-dialog-scrim=""
            onClick={onClose}
            {...stylex.props(styles.scrim, fade && styles.enter)}
          />
          <BaseDialog.Popup
            ref={attach}
            role={open ? 'dialog' : 'presentation'}
            aria-label={open ? title : undefined}
            aria-modal={open ? 'true' : undefined}
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
