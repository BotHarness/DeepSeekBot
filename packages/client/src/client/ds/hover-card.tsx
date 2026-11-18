import { PreviewCard } from '@base-ui/react/preview-card';
import * as stylex from '@stylexjs/stylex';
import { useState, type ReactElement, type ReactNode } from 'react';

import { APPEARANCE_CLASS } from '../appearance-scope.js';
import { elevation, ink, layer, motion, space, style } from './tobs.stylex.js';

const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } });

const styles = stylex.create({
  trigger: { display: 'flex', minWidth: 0 },
  inline: { display: 'inline-flex' },
  positioner: { zIndex: 1100 },
  popup: {
    boxSizing: 'border-box',
    maxWidth: 'min(320px, calc(100vw - 32px))',
    padding: space.x3,
    borderRadius: style.radiusMenu,
    backgroundColor: layer.elevated,
    boxShadow: elevation.x2,
    color: ink.primary,
    fontSize: style.textUiSize,
    lineHeight: style.textUiLine,
    outline: 'none',
    animationName: fadeIn,
    animationDuration: { default: motion.fast, '@media (prefers-reduced-motion: reduce)': '0s' },
  },
  compact: { padding: space.x2 },
  copy: {
    display: 'block',
    marginTop: space.x2,
    paddingInline: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: ink.secondary,
    font: 'inherit',
    cursor: 'pointer',
  },
});

export interface HoverCardProps {
  readonly anchor: ReactNode;
  readonly content: ReactNode;
  readonly inline?: boolean;
  readonly openDelayMs?: number;
  readonly disabled?: boolean;
  readonly variant?: 'compact' | 'preview';
  readonly copyText?: string | undefined;
  readonly copyLabel?: string;
  readonly copiedLabel?: string;
}

export function HoverCard({
  anchor,
  content,
  inline = false,
  openDelayMs = 500,
  disabled = false,
  variant = 'preview',
  copyText,
  copyLabel,
  copiedLabel,
}: HoverCardProps): ReactElement {
  const [copied, setCopied] = useState(false);
  const Wrapper = inline ? 'span' : 'div';
  if (disabled)
    return <Wrapper {...stylex.props(styles.trigger, inline && styles.inline)}>{anchor}</Wrapper>;
  return (
    <PreviewCard.Root onOpenChange={(open) => (open ? undefined : setCopied(false))}>
      <PreviewCard.Trigger
        delay={openDelayMs}
        render={<Wrapper {...stylex.props(styles.trigger, inline && styles.inline)} />}
      >
        {anchor}
      </PreviewCard.Trigger>
      <PreviewCard.Portal>
        <PreviewCard.Positioner
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={16}
          {...stylex.props(styles.positioner)}
        >
          <PreviewCard.Popup
            className={[
              APPEARANCE_CLASS,
              stylex.props(styles.popup, variant === 'compact' && styles.compact).className,
            ].join(' ')}
          >
            {content}
            {copyText === undefined || copyLabel === undefined ? null : (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(copyText).then(() => setCopied(true));
                }}
                {...stylex.props(styles.copy)}
              >
                {copied ? (copiedLabel ?? copyLabel) : copyLabel}
              </button>
            )}
          </PreviewCard.Popup>
        </PreviewCard.Positioner>
      </PreviewCard.Portal>
    </PreviewCard.Root>
  );
}
