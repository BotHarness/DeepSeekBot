import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { SettingsGroupPart } from '../ds/settings-row.js';
import { ink, space, style, type } from '../ds/tobs.stylex.js';

const styles = stylex.create({
  caption: {
    margin: 0,
    paddingBlockStart: space.x4,
    paddingBlockEnd: space.x2,
    paddingInline: style.listItemPadding,
    color: ink.secondary,
    fontSize: type.captionSize,
    lineHeight: type.captionLine,
    fontWeight: type.labelWeight,
  },
});

export function GroupCaption({
  children,
  data,
}: {
  children: ReactNode;
  data?: Readonly<Record<`data-${string}`, string | undefined>>;
}): ReactElement {
  return (
    <SettingsGroupPart {...(data === undefined ? {} : { data })}>
      <p {...stylex.props(styles.caption)}>{children}</p>
    </SettingsGroupPart>
  );
}
