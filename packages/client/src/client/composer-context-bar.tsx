import type { ReactElement, ReactNode } from 'react';
import * as stylex from '@stylexjs/stylex';

import { space } from './ds/tokens.stylex.js';

const styles = stylex.create({
  bar: {
    display: { default: 'flex', ':is([hidden])': 'none' },
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    minWidth: 0,
    paddingTop: space.x2,
    paddingInline: space.x2,
    paddingBottom: 0,
  },
  leading: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minWidth: 0,
  },
});

export function ComposerContextBar({
  label,
  hidden = false,
  trailing,
  children,
}: {
  readonly label: string;
  readonly hidden?: boolean;
  readonly trailing?: ReactNode;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <div
      role="group"
      aria-label={label}
      hidden={hidden}
      data-composer-context=""
      {...stylex.props(styles.bar)}
    >
      <div data-composer-context-leading="" {...stylex.props(styles.leading)}>
        {children}
      </div>
      {trailing}
    </div>
  );
}
