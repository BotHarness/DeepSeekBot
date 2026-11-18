import * as stylex from '@stylexjs/stylex';
import type { ReactElement, ReactNode } from 'react';

import { joinClass } from './class-name.js';
import { accent, edge, ink, layer, line, radius, space, status } from './tobs.stylex.js';

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
  tag: {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    paddingBlock: '1px',
    paddingInline: space.x3,
    borderRadius: radius.full,
    fontSize: '11px',
    lineHeight: '17px',
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

export interface TagProps {
  readonly tone?: TagTone;
  readonly className?: string | undefined;
  readonly children?: ReactNode;
}

export function Tag({ tone = 'neutral', className, children }: TagProps): ReactElement {
  return (
    <span data-tone={tone} className={joinClass(stylex.props(styles.tag, styles[tone]).className, className)}>
      {children}
    </span>
  );
}
