import * as stylex from '@stylexjs/stylex';

export const space = stylex.defineConsts({
  x1: '2px',
  x2: '4px',
  x3: '8px',
  x4: '12px',
  x5: '16px',
  x6: '24px',
});

export const text = stylex.defineConsts({
  metaSize: '12px',
  metaLine: '16px',
  bodySize: 'var(--tobs-style-text-ui-size)',
  bodyLine: 'var(--tobs-style-text-ui-line)',
  titleSize: '15px',
  titleLine: '24px',
  regular: '400',
  strong: '500',
});

export const radius = stylex.defineConsts({
  xs: '4px',
  sm: 'var(--tobs-style-radius-control)',
  md: 'var(--tobs-style-radius-container)',
  lg: 'var(--tobs-style-radius-card)',
  panel: 'var(--tobs-style-radius-sheet)',
  round: '50%',
});

export const border = stylex.defineConsts({
  hairline: '1px',
  focus: '2px',
});

export const size = stylex.defineConsts({
  inlineIcon: '26px',
  icon: 'var(--tobs-style-control-height)',
  row: 'var(--tobs-style-control-height-large)',
  nav: '40px',
});

export const dialog = stylex.defineConsts({
  small: 'min(440px, calc(100vw - 32px))',
  bodyMax: 'min(60vh, 520px)',
  medium: 'min(760px, calc(100vw - 32px))',
  wide: 'min(1060px, calc(100vw - 32px))',
});

export const actionColor = stylex.defineConsts({
  secondary: 'color-mix(in srgb, var(--tobs-ink-primary) 8%, var(--tobs-layer-raised))',
  hover: 'color-mix(in srgb, var(--tobs-ink-primary) 13%, var(--tobs-layer-raised))',
  danger: 'var(--tobs-status-danger-tint)',
  dangerLabel: 'var(--tobs-status-danger-ink)',
});

export const color = stylex.defineConsts({
  fg: 'var(--tobs-ink-primary)',
  muted: 'var(--tobs-ink-secondary)',
  subtle: 'var(--tobs-ink-tertiary)',
  divider: 'var(--tobs-line-divider)',
  border: 'var(--tobs-line-edge)',
  borderStrong: 'var(--tobs-line-strong)',
  hover: 'var(--tobs-state-hover)',
  selected: 'var(--tobs-state-pressed)',
  navSelected: 'var(--tobs-style-nav-selected-fill)',
  navSelectedInk: 'var(--tobs-style-nav-selected-ink)',
  accent: 'var(--tobs-accent-solid)',
  accentText: 'var(--tobs-accent-ink)',
  onAccent: 'var(--tobs-accent-on-solid)',
  danger: 'var(--tobs-status-danger-base)',
  onDanger: 'var(--tobs-accent-on-solid)',
  dangerEdge: 'color-mix(in srgb, var(--tobs-status-danger-base) 45%, transparent)',
  dangerSoft: 'var(--tobs-status-danger-tint)',
  warning: 'var(--tobs-status-warning-base)',
  warningEdge: 'color-mix(in srgb, var(--tobs-status-warning-base) 45%, transparent)',
  warningSoft: 'var(--tobs-status-warning-tint)',
  success: 'var(--tobs-status-success-base)',
  surface: 'var(--tobs-layer-raised)',
  elevated: 'var(--tobs-layer-elevated)',
  base: 'var(--tobs-layer-canvas)',
  modal: 'var(--tobs-layer-sheet)',
  well: 'var(--tobs-layer-well)',
  accentTint: 'var(--tobs-accent-tint)',
});
