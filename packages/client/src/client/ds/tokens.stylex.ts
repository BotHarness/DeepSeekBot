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
  bodySize: '13px',
  bodyLine: '20px',
  titleSize: '14px',
  titleLine: '20px',
  headingSize: '16px',
  headingLine: '24px',
  strong: '500',
});

export const radius = stylex.defineConsts({
  control: '6px',
  row: '8px',
  card: '10px',
  panel: 'var(--dsw-radius-panel, 16px)',
  round: '50%',
});

export const size = stylex.defineConsts({
  inlineIcon: '26px',
  icon: '28px',
  row: '32px',
  nav: '40px',
});

export const dialog = stylex.defineConsts({
  small: 'min(440px, calc(100vw - 32px))',
  bodyMax: 'min(60vh, 520px)',
  standard: 'min(560px, calc(100vw - 32px))',
  medium: 'min(760px, calc(100vw - 32px))',
  wide: 'min(1060px, calc(100vw - 32px))',
});

export const color = stylex.defineConsts({
  fg: 'var(--dsw-alias-label-primary)',
  muted: 'var(--dsw-alias-label-secondary)',
  subtle: 'var(--dsw-alias-label-tertiary)',
  border: 'var(--dsw-alias-border-l2)',
  hover: 'var(--dsw-alias-interactive-bg-hover)',
  selected: 'var(--dsw-alias-interactive-bg-active)',
  accent: 'var(--dsw-alias-state-business-primary)',
  danger: 'var(--dsw-alias-state-error-primary)',
  onDanger: 'var(--dsw-alias-label-primary-foreground)',
  dangerEdge: 'var(--dsw-alias-state-error-secondary)',
  dangerSoft: 'var(--dsw-alias-interactive-bg-hover-danger)',
  warning: 'var(--dsw-alias-state-warn-primary)',
  warningEdge: 'var(--dsw-alias-state-warn-secondary)',
  warningSoft: 'var(--dsw-alias-state-warn-tertiary)',
  success: 'var(--dsw-alias-state-success-primary)',
  surface: 'var(--dsw-alias-bg-module-platform)',
  base: 'var(--dsw-alias-bg-base)',
});
