import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { border, color, radius, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: space.x3,
    marginBlock: space.x4,
    paddingBlock: space.x6,
    paddingInline: space.x5,
    borderWidth: border.hairline,
    borderStyle: 'dashed',
    borderColor: color.border,
    borderRadius: radius.md,
    textAlign: 'center',
  },
  title: {
    margin: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  description: {
    margin: 0,
    maxWidth: '360px',
    color: color.muted,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});

export function EmptyState({
  title,
  description,
  action,
  status = false,
}: {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly action?: ReactNode;
  readonly status?: boolean;
}): ReactElement {
  return (
    <div role={status ? 'status' : undefined} {...stylex.props(styles.root)}>
      <p {...stylex.props(styles.title)}>{title}</p>
      {description === undefined ? null : (
        <p {...stylex.props(styles.description)}>{description}</p>
      )}
      {action}
    </div>
  );
}
