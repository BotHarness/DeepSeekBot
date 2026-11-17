import * as stylex from '@stylexjs/stylex';

export const font = stylex.defineConsts({
  familySans: "system-ui, -apple-system, 'PingFang SC', 'Segoe UI', 'Microsoft YaHei', sans-serif",
  familyMono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
});

export const type = stylex.defineConsts({
  captionSize: '12px',
  captionLine: '16px',
  captionWeight: '400',
  bodySize: '13px',
  bodyLine: '20px',
  bodyWeight: '400',
  labelSize: '13px',
  labelLine: '20px',
  labelWeight: '500',
  titleSize: '15px',
  titleLine: '24px',
  titleWeight: '600',
  headingSize: '18px',
  headingLine: '26px',
  headingWeight: '600',
  displaySize: '24px',
  displayLine: '32px',
  displayWeight: '600',
});

export const space = stylex.defineConsts({
  x1: '2px',
  x2: '4px',
  x3: '8px',
  x4: '12px',
  x5: '16px',
  x6: '20px',
  x7: '24px',
  x8: '32px',
});

export const size = stylex.defineConsts({
  icon: '16px',
  iconLarge: '20px',
  iconSlot: '20px',
  iconStroke: '1.5px',
  controlSmall: '24px',
  control: '28px',
  controlLarge: '32px',
  row: '28px',
  rowMedium: '36px',
  rowLarge: '44px',
});

export const radius = stylex.defineConsts({
  xs: '4px',
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '20px',
  full: '9999px',
});

export const edge = stylex.defineConsts({
  hairline: '1px',
  focus: '2px',
  focusOffset: '2px',
});

export const motion = stylex.defineConsts({
  fast: '120ms',
  base: '200ms',
  slow: '320ms',
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  emphasized: 'cubic-bezier(0.3, 0, 0, 1)',
});

export const layer = stylex.defineConsts({
  canvas: 'var(--tobs-layer-canvas)',
  raised: 'var(--tobs-layer-raised)',
  well: 'var(--tobs-layer-well)',
  field: 'var(--tobs-layer-field)',
  nav: 'var(--tobs-layer-nav)',
  sheet: 'var(--tobs-layer-sheet)',
  elevated: 'var(--tobs-layer-elevated)',
  scrim: 'var(--tobs-layer-scrim)',
});

export const ink = stylex.defineConsts({
  primary: 'var(--tobs-ink-primary)',
  secondary: 'var(--tobs-ink-secondary)',
  tertiary: 'var(--tobs-ink-tertiary)',
  quiet: 'var(--tobs-ink-quiet)',
  disabled: 'var(--tobs-ink-disabled)',
});

export const line = stylex.defineConsts({
  divider: 'var(--tobs-line-divider)',
  edge: 'var(--tobs-line-edge)',
  strong: 'var(--tobs-line-strong)',
  focus: 'var(--tobs-line-focus)',
});

export const state = stylex.defineConsts({
  hover: 'var(--tobs-state-hover)',
  pressed: 'var(--tobs-state-pressed)',
  selected: 'var(--tobs-state-selected)',
  selectedInk: 'var(--tobs-state-selected-ink)',
});

export const status = stylex.defineConsts({
  dangerBase: 'var(--tobs-status-danger-base)',
  dangerTint: 'var(--tobs-status-danger-tint)',
  dangerInk: 'var(--tobs-status-danger-ink)',
  warningBase: 'var(--tobs-status-warning-base)',
  warningTint: 'var(--tobs-status-warning-tint)',
  warningInk: 'var(--tobs-status-warning-ink)',
  successBase: 'var(--tobs-status-success-base)',
  successTint: 'var(--tobs-status-success-tint)',
  successInk: 'var(--tobs-status-success-ink)',
  infoBase: 'var(--tobs-status-info-base)',
  infoTint: 'var(--tobs-status-info-tint)',
  infoInk: 'var(--tobs-status-info-ink)',
});

export const elevation = stylex.defineConsts({
  x1: 'var(--tobs-elevation-1)',
  x2: 'var(--tobs-elevation-2)',
  x3: 'var(--tobs-elevation-3)',
});

export const style = stylex.defineConsts({
  textUiSize: 'var(--tobs-style-text-ui-size)',
  textUiLine: 'var(--tobs-style-text-ui-line)',
  textMessageSize: 'var(--tobs-style-text-message-size)',
  textMessageLine: 'var(--tobs-style-text-message-line)',
  controlHeight: 'var(--tobs-style-control-height)',
  controlHeightSmall: 'var(--tobs-style-control-height-small)',
  controlHeightLarge: 'var(--tobs-style-control-height-large)',
  rowNav: 'var(--tobs-style-row-nav)',
  rowList: 'var(--tobs-style-row-list)',
  iconSize: 'var(--tobs-style-icon-size)',
  iconSlot: 'var(--tobs-style-icon-slot)',
  listGap: 'var(--tobs-style-list-gap)',
  listGroupRadius: 'var(--tobs-style-list-group-radius)',
  listItemRadius: 'var(--tobs-style-list-item-radius)',
  radiusControl: 'var(--tobs-style-radius-control)',
  radiusField: 'var(--tobs-style-radius-field)',
  radiusContainer: 'var(--tobs-style-radius-container)',
  radiusMenu: 'var(--tobs-style-radius-menu)',
  radiusDialog: 'var(--tobs-style-radius-dialog)',
  radiusNavSelected: 'var(--tobs-style-radius-nav-selected)',
  radiusChip: 'var(--tobs-style-radius-chip)',
  radiusSegmented: 'var(--tobs-style-radius-segmented)',
  radiusComposer: 'var(--tobs-style-radius-composer)',
  radiusBubble: 'var(--tobs-style-radius-bubble)',
  chipHeight: 'var(--tobs-style-chip-height)',
  navSelectedFill: 'var(--tobs-style-nav-selected-fill)',
  navSelectedInk: 'var(--tobs-style-nav-selected-ink)',
});

export const accent = stylex.defineConsts({
  solid: 'var(--tobs-accent-solid)',
  solidHover: 'var(--tobs-accent-solid-hover)',
  onSolid: 'var(--tobs-accent-on-solid)',
  container: 'var(--tobs-accent-container)',
  onContainer: 'var(--tobs-accent-on-container)',
  tint: 'var(--tobs-accent-tint)',
  ink: 'var(--tobs-accent-ink)',
  focus: 'var(--tobs-accent-focus)',
  selection: 'var(--tobs-accent-selection)',
  onSelection: 'var(--tobs-accent-on-selection)',
});
