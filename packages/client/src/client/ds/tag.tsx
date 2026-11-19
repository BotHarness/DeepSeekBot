import * as stylex from '@stylexjs/stylex';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';

import { joinClass } from './class-name.js';
import { accent, edge, ink, layer, line, radius, space, status, type } from './tobs.stylex.js';

export type TagTone =
  | 'outline'
  | 'solid'
  | 'neutral'
  | 'quiet'
  | 'success'
  | 'info'
  | 'warning'
  | 'danger';

const styles = stylex.create({
  wrap: { whiteSpace: 'normal', overflowWrap: 'anywhere', maxWidth: '100%' },
  tag: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    paddingBlock: edge.hairline,
    paddingInline: space.x3,
    borderRadius: radius.full,
    fontSize: `calc(${type.captionSize} - ${edge.hairline})`,
    lineHeight: `calc(${type.captionLine} + ${edge.hairline})`,
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  outline: {
    boxShadow: `inset 0 0 0 ${edge.hairline} ${line.edge}`,
    color: ink.tertiary,
  },
  solid: { backgroundColor: ink.primary, color: layer.canvas },
  neutral: { backgroundColor: layer.well, color: ink.secondary },
  quiet: { color: ink.tertiary },
  success: { backgroundColor: status.successTint, color: status.successInk },
  info: { backgroundColor: accent.tint, color: accent.ink },
  warning: { backgroundColor: status.warningTint, color: status.warningInk },
  danger: { backgroundColor: status.dangerTint, color: status.dangerInk },
});

export interface TagProps extends ComponentPropsWithoutRef<'span'> {
  readonly tone?: TagTone;
  readonly className?: string | undefined;
  readonly wrap?: boolean;
}

export const Tag = forwardRef<HTMLSpanElement, TagProps>(function Tag(
  { tone = 'neutral', className, wrap = false, ...props },
  ref,
) {
  return (
    <span
      {...props}
      ref={ref}
      data-tone={tone}
      className={joinClass(
        stylex.props(styles.tag, styles[tone], wrap && styles.wrap).className,
        className,
      )}
    />
  );
});
