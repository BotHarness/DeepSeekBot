import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { color, radius, space, text } from './tokens.stylex.js';

const styles = stylex.create({
  callout: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    minWidth: 0,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderRadius: radius.row,
    color: color.fg,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
    overflowWrap: 'anywhere',
  },
  muted: { borderColor: color.border, backgroundColor: color.surface },
  warning: { borderColor: color.warningEdge, backgroundColor: color.warningSoft },
  danger: { borderColor: color.dangerEdge, backgroundColor: color.dangerSoft },
  borderless: { borderWidth: 0 },
  title: {
    margin: 0,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  warningTitle: { color: color.warning },
  dangerTitle: { color: color.danger },
});

export type CalloutTone = 'muted' | 'warning' | 'danger';

export function Callout({
  tone = 'muted',
  title,
  role,
  borderless = false,
  children,
  data,
}: {
  readonly tone?: CalloutTone;
  readonly title?: ReactNode;
  readonly role?: 'alert' | 'status' | 'note';
  readonly borderless?: boolean;
  readonly children?: ReactNode;
  readonly data?: Readonly<Record<`data-${string}`, string>>;
}): ReactElement {
  return (
    <div
      role={role}
      {...data}
      {...stylex.props(styles.callout, styles[tone], borderless && styles.borderless)}
    >
      {title === undefined ? null : (
        <p
          {...stylex.props(
            styles.title,
            tone === 'warning' && styles.warningTitle,
            tone === 'danger' && styles.dangerTitle,
          )}
        >
          {title}
        </p>
      )}
      {children}
    </div>
  );
}
