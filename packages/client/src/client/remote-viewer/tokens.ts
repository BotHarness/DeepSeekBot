export const BH = {
  labelSecondary: 'var(--tobs-ink-secondary)',
  hoverFill: 'var(--tobs-state-hover)',
  errorPrimary: 'var(--tobs-status-danger-base)',
  radiusMd: '12px',
  labelPrimary: 'var(--tobs-ink-primary, #0f1115)',
  labelPrimaryForeground: 'var(--tobs-ink-on-accent, #ffffff)',
  borderL2: 'var(--tobs-line-edge, #0000001a)',
  borderL3: 'var(--tobs-line-strong, #0000001f)',
  borderL4: 'var(--tobs-line-strong, #00000029)',
  bgBase: 'var(--tobs-layer-canvas, #ffffff)',
  buttonPrimaryFill: 'var(--tobs-accent-base, #0f1115)',
  buttonElevatedFill: 'var(--tobs-layer-elevated, transparent)',
  businessPrimary: 'var(--tobs-accent-base, #4176e6)',
  hoverScrim: 'color-mix(in srgb, var(--tobs-layer-canvas) 35%, transparent)',
} as const;

export const VIDEO_SURFACE = {
  background: '#000000',
  spinnerTrack: 'rgba(255, 255, 255, 0.18)',
  spinnerArc: '#ffffff',
  onVideo: '#ffffff',
} as const;
