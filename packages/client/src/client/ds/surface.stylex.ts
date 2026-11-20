import * as stylex from '@stylexjs/stylex';

export const on = stylex.defineConsts({
  field: 'var(--tobs-on-field, var(--tobs-style-on-page-field))',
  fieldEdge: 'var(--tobs-on-field-edge, var(--tobs-style-on-page-field-edge))',
  track: 'var(--tobs-on-track, var(--tobs-style-on-page-track))',
  secondary: 'var(--tobs-on-secondary, var(--tobs-style-on-page-secondary))',
  secondaryEdge: 'var(--tobs-on-secondary-edge, var(--tobs-style-on-page-secondary-edge))',
});
