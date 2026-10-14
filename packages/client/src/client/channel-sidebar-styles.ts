import * as stylex from '@stylexjs/stylex';

import { color, space, text } from './ds/tokens.stylex.js';

export const sidebarStyles = stylex.create({
  entries: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    minHeight: 0,
    overflow: 'auto',
    paddingTop: space.x2,
    paddingBottom: space.x4,
  },
  empty: {
    margin: 0,
    paddingBlock: space.x2,
    paddingInline: space.x4,
    color: color.subtle,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
});
