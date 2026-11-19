import * as stylex from '@stylexjs/stylex';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { hooked } from './hooked.js';
import { IconButton, type IconButtonProps } from './icon-button.js';
import {
  accent,
  elevation,
  ink,
  layer,
  radius,
  size,
  space,
  state,
  style,
  type,
} from './tobs.stylex.js';

export const bubble = stylex.create({
  surface: {
    position: 'relative',
    textAlign: 'start',
    width: 'fit-content',
    maxWidth: '100%',
    borderRadius: style.radiusBubble,
    backgroundColor: layer.raised,
    color: ink.primary,
    padding: {
      default: space.x4,
      ':has(> .bh-bubble-body):not([data-bubble-media])': `${space.x3} ${space.x4}`,
    },
  },
  human: {
    backgroundColor: 'var(--bh-bubble-me-fill)',
    color: 'var(--bh-bubble-me-ink)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x1,
    padding: space.x1,
    borderRadius: style.radiusMenu,
    backgroundColor: layer.sheet,
    boxShadow: elevation.x1,
  },
  time: {
    paddingInlineStart: space.x3,
    paddingInlineEnd: space.x2,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: 1,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  },
});

export const composer = stylex.create({
  surface: {
    borderRadius: style.radiusComposer,
    backgroundColor: `light-dark(${layer.raised}, ${layer.elevated})`,
    boxShadow: elevation.x1,
  },
  quote: {
    borderRadius: style.radiusSmall,
    backgroundColor: layer.well,
    paddingBlock: space.x2,
    paddingInline: space.x3,
  },
  attachment: { position: 'absolute', left: '9px', bottom: '9px' },
  mic: { touchAction: 'none', userSelect: 'none' },
  micStarting: {
    color: { default: accent.solid, ':hover': accent.solid },
    backgroundColor: { default: state.pressed, ':hover': state.pressed },
  },
  control: {
    width: size.controlLarge,
    height: size.controlLarge,
    borderRadius: radius.full,
  },
  send: {
    backgroundColor: {
      default: accent.solid,
      ':hover:enabled': accent.solidHover,
      ':disabled': accent.solid,
    },
    color: { default: accent.onSolid, ':hover': accent.onSolid },
  },
});

export const ComposerControl = forwardRef<
  HTMLButtonElement,
  IconButtonProps & { primary?: boolean }
>(function ComposerControl({ primary = false, xstyle, ...props }, ref) {
  return (
    <IconButton
      ref={ref}
      {...props}
      xstyle={[composer.control, primary && composer.send, xstyle]}
    />
  );
});

export const ComposerTextarea = forwardRef<
  HTMLTextAreaElement,
  Omit<ComponentPropsWithoutRef<'textarea'>, 'className'>
>(function ComposerTextarea(props, ref) {
  return <textarea {...props} ref={ref} {...hooked('bh-composer-input')} />;
});
