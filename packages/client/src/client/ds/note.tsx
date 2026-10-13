import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color, text } from './tokens.stylex.js';

const styles = stylex.create({
  note: {
    margin: 0,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  muted: { color: color.muted },
  danger: { color: color.danger },
  success: { color: color.success },
  warning: { color: color.warning },
});

export type NoteTone = 'muted' | 'danger' | 'success' | 'warning';

export function Note({
  tone = 'muted',
  children,
}: {
  readonly tone?: NoteTone;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <p role={tone === 'danger' ? 'alert' : 'status'} {...stylex.props(styles.note, styles[tone])}>
      {children}
    </p>
  );
}
