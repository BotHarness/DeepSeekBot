import type { ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, space, text } from './ds/tokens.stylex.js';

const styles = stylex.create({
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    marginBlock: space.x4,
    color: color.danger,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    fontWeight: text.strong,
    scrollMarginTop: '25vh',
  },
  rule: {
    flex: '1 1 auto',
    height: 0,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.danger,
  },
});

export function TimelineUnreadDivider({ label }: { label: string }): ReactElement {
  return (
    <div
      role="separator"
      aria-label={label}
      data-unread-divider=""
      {...stylex.props(styles.divider)}
    >
      <span aria-hidden="true" {...stylex.props(styles.rule)} />
      <span>{label}</span>
      <span aria-hidden="true" {...stylex.props(styles.rule)} />
    </div>
  );
}
