import * as stylex from '@stylexjs/stylex';

export const viewportInsets = stylex.defineConsts({
  frameTop: 'var(--dsh-frame-chrome-top, 0px)',
  left: 'env(safe-area-inset-left)',
  right: 'env(safe-area-inset-right)',
  bottom: 'env(safe-area-inset-bottom)',
});
