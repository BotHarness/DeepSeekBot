import * as stylex from '@stylexjs/stylex';
import { radius, style } from './tobs.stylex.js';

export const avatarFrameStyles = stylex.create({
  preview: { borderRadius: style.radiusCard, overflow: 'hidden' },
  channel: {
    display: 'inline-flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden',
    borderRadius: style.radiusContainer,
  },
  roundImage: { borderRadius: radius.full },
});
