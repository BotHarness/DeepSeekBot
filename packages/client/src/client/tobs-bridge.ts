const DSH_ROLE = {
  '--tobs-layer-canvas': 'alias-bg-base',
  '--tobs-layer-raised': 'alias-bg-module-platform',
  '--tobs-layer-well': 'alias-bg-base',
  '--tobs-layer-field': 'specific-input-major',
  '--tobs-layer-nav': 'specific-sidebar-fill',
  '--tobs-layer-sheet': 'alias-bg-layer-2',
  '--tobs-layer-elevated': 'alias-button-elevated-fill',
  '--tobs-layer-scrim': 'alias-bg-mask-1',
  '--tobs-ink-primary': 'alias-label-primary',
  '--tobs-ink-secondary': 'alias-label-secondary',
  '--tobs-ink-tertiary': 'alias-label-tertiary',
  '--tobs-ink-quiet': 'alias-label-tertiary',
  '--tobs-ink-disabled': 'alias-label-dimmed',
  '--tobs-accent-on-solid': 'alias-label-primary-foreground',
  '--tobs-line-divider': 'alias-border-l1',
  '--tobs-line-edge': 'alias-border-l2',
  '--tobs-line-strong': 'alias-border-l3',
  '--tobs-line-focus': 'alias-state-business-primary',
  '--tobs-state-hover': 'alias-interactive-bg-hover',
  '--tobs-state-pressed': 'alias-interactive-bg-active',
  '--tobs-state-selected': 'specific-sidebar-nav-item-active',
  '--tobs-state-selected-ink': 'alias-label-primary',
  '--tobs-accent-solid': 'alias-state-business-primary',
  '--tobs-accent-solid-hover': 'alias-button-primary-hover',
  '--tobs-accent-tint': 'alias-state-business-tertiary',
  '--tobs-accent-ink': 'alias-link',
  '--tobs-accent-container': 'alias-state-business-tertiary',
  '--tobs-accent-on-container': 'alias-link',
  '--tobs-accent-focus': 'alias-state-business-primary',
  '--tobs-accent-selection': 'alias-state-business-primary',
  '--tobs-accent-on-selection': 'alias-label-primary-foreground',
  '--tobs-status-danger-base': 'alias-state-error-primary',
  '--tobs-status-danger-tint': 'alias-interactive-bg-hover-danger',
  '--tobs-status-danger-ink': 'alias-state-error-primary',
  '--tobs-status-warning-base': 'alias-state-warn-primary',
  '--tobs-status-warning-tint': 'alias-state-warn-tertiary',
  '--tobs-status-warning-ink': 'alias-state-warn-label',
  '--tobs-status-success-base': 'alias-state-success-primary',
  '--tobs-status-success-tint': 'alias-state-success-tertiary',
  '--tobs-status-success-ink': 'alias-state-success-primary',
  '--tobs-status-info-base': 'alias-state-business-primary',
  '--tobs-status-info-tint': 'alias-state-business-tertiary',
  '--tobs-status-info-ink': 'alias-link',
  '--tobs-elevation-1': 'elevation-soft',
  '--tobs-elevation-2': 'elevation-prominent',
  '--tobs-elevation-3': 'elevation-panel',
} as const;

export const TOBS_DSH_BRIDGE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(DSH_ROLE).map(([name, role]) => [name, `var(--dsw-${role})`]),
);

export function tobsBridgeCss(): string {
  return `body{${Object.entries(TOBS_DSH_BRIDGE)
    .map(([k, v]) => `${k}:${v}`)
    .join(';')}}`;
}
