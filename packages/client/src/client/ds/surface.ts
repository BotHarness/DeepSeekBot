import * as stylex from '@stylexjs/stylex';
import { style } from './tobs.stylex.js';

export const surfaceStyles = stylex.create({
  card: {
    '--tobs-on-field': style.onCardField,
    '--tobs-on-field-edge': style.onCardFieldEdge,
    '--tobs-on-track': style.onCardTrack,
    '--tobs-on-secondary': style.onCardSecondary,
    '--tobs-on-secondary-edge': style.onCardSecondaryEdge,
  },
});
