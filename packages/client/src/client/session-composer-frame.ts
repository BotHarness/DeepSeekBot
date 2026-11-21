import * as stylex from '@stylexjs/stylex';

import { space } from './ds/tokens.stylex.js';

export const sessionComposerFrame = stylex.create({
  transcript: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    paddingInline: space.x5,
    paddingTop: space.x4,
    paddingBottom: `calc(${space.x4} + var(--session-composer-overlay, 0px))`,
    maskImage: `linear-gradient(to bottom, transparent, black ${space.x4}, black calc(100% - var(--session-composer-overlay, 0px)), transparent calc(100% - var(--session-composer-overlay, 0px) + ${space.x4}))`,
    overscrollBehavior: 'contain',
  },
  frame: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    zIndex: 1,
    containerType: 'inline-size',
    containerName: 'session-composer',
  },
});
