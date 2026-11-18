import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import * as stylex from '@stylexjs/stylex';
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
  type Context,
  type ReactElement,
  type ReactNode,
} from 'react';

import { APPEARANCE_CLASS } from '../appearance-scope.js';
import { KeyCombo } from './kbd.js';
import { ink, layer, motion, space, style, type } from './tobs.stylex.js';

const shared = globalThis as typeof globalThis & Record<symbol, Context<boolean> | undefined>;
const InstantTooltips = (shared[Symbol.for('botharness.instant-tooltips')] ??=
  createContext(false));

export function InstantTooltipScope({ children }: { readonly children: ReactNode }): ReactElement {
  return <InstantTooltips.Provider value>{children}</InstantTooltips.Provider>;
}

export type TooltipSide = 'top' | 'bottom' | 'left' | 'right';

const DEFAULT_DELAY_MS = 500;
const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const styles = stylex.create({
  positioner: { zIndex: 1200, pointerEvents: 'none' },
  popup: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: space.x2,
    paddingBlock: space.x1,
    paddingInline: space.x2,
    borderRadius: style.radiusControl,
    backgroundColor: ink.primary,
    color: layer.canvas,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    overflowWrap: 'anywhere',
    animationName: fadeIn,
    animationDuration: { default: motion.fast, '@media (prefers-reduced-motion: reduce)': '0s' },
  },
  keys: { display: 'inline-flex', color: layer.canvas, opacity: 0.72 },
});

function clipped(node: HTMLElement | null): boolean {
  if (node === null) return false;
  const target = node.querySelector<HTMLElement>('[data-tooltip-clip]') ?? node;
  return (
    target.scrollWidth > target.clientWidth + 1 || target.scrollHeight > target.clientHeight + 1
  );
}

export interface TooltipProps {
  readonly label: string | (() => string);
  readonly shortcutKeys?: readonly string[] | undefined;
  readonly side?: TooltipSide;
  readonly align?: 'center' | 'end';
  readonly delayMs?: number;
  readonly focusDelayMs?: number;
  readonly gap?: number;
  readonly disabled?: boolean;
  readonly portal?: boolean;
  readonly maxWidth?: number;
  readonly openOnClick?: boolean;
  readonly onlyWhenClipped?: boolean;
  readonly children: ReactElement;
}

export function Tooltip({
  label,
  shortcutKeys,
  side = 'top',
  align = 'center',
  delayMs = DEFAULT_DELAY_MS,
  gap = 6,
  disabled = false,
  maxWidth = 280,
  openOnClick = false,
  onlyWhenClipped = false,
  children,
}: TooltipProps): ReactElement {
  const instant = useContext(InstantTooltips);
  const descriptionId = useId();
  const trigger = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const attach = useCallback((node: HTMLElement | null) => {
    trigger.current = node;
  }, []);
  const text = typeof label === 'function' ? label() : label;
  return (
    <BaseTooltip.Root
      open={open}
      disabled={disabled || text === ''}
      onOpenChange={(next) => {
        if (next && onlyWhenClipped && !clipped(trigger.current)) return;
        setOpen(next);
      }}
    >
      <BaseTooltip.Trigger
        ref={attach}
        aria-describedby={open ? descriptionId : undefined}
        delay={instant ? 0 : delayMs}
        closeOnClick={!openOnClick}
        render={children}
        onClick={openOnClick ? () => setOpen((value) => !value) : undefined}
      />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner
          side={side}
          align={align}
          sideOffset={gap}
          collisionPadding={8}
          {...stylex.props(styles.positioner)}
        >
          <BaseTooltip.Popup
            id={descriptionId}
            role="tooltip"
            className={[APPEARANCE_CLASS, stylex.props(styles.popup).className].join(' ')}
            style={{ maxWidth }}
          >
            {text}
            {shortcutKeys === undefined || shortcutKeys.length === 0 ? null : (
              <span {...stylex.props(styles.keys)}>
                <KeyCombo keys={shortcutKeys} />
              </span>
            )}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
