import * as stylex from '@stylexjs/stylex';

export const sessionComposerFrame = stylex.create({
  frame: {
    position: 'absolute',
    insetInline: 0,
    bottom: 0,
    zIndex: 1,
    containerType: 'inline-size',
    containerName: 'session-composer',
  },
});
