import { radius, space } from '../../ds/tokens.stylex.js';
import { sharedCss } from '../../shared-styles.js';

export const LOADING_CSS = [
  sharedCss.note,
  `.bh-skeleton-messages {
  gap: ${space.x6};
  padding: 20px ${space.x6};
}
`,
  sharedCss.skeletonRow,
  `html[data-botharness-motion='full'] .bh-skeleton-avatar,
html[data-botharness-motion='full'] .bh-skeleton-line {
  animation: bh-skeleton-pulse 1.6s ease-in-out infinite;
}
.bh-skeleton-avatar {
  width: 32px;
  height: 32px;
  border-radius: ${radius.round};
}
`,
  sharedCss.skeletonLines,
  `.bh-skeleton-line {
  width: 84%;
  height: 10px;
}
`,
  sharedCss.skeletonLineShort,
].join('');
