import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  note: {
    margin: 0,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  inset: { paddingBlock: space.x2, paddingInline: space.x2 },
  muted: { color: color.muted },
  subtle: { color: color.subtle },
  danger: { color: color.danger },
  success: { color: color.success },
  warning: { color: color.warning },
});

export type NoteTone = 'muted' | 'subtle' | 'danger' | 'success' | 'warning';

export function Note({
  tone = 'muted',
  inset = false,
  children,
}: {
  readonly tone?: NoteTone;
  readonly inset?: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p
      role={tone === 'danger' ? 'alert' : 'status'}
      {...stylex.props(styles.note, inset && styles.inset, styles[tone])}
    >
      {children}
    </p>
  );
}
